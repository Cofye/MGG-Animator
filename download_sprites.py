#!/usr/bin/env python3
"""
Lee data/sprites.xml, extrae todos los atributos <Sprite bitmap="...">
y sus etiquetas <Skin>...</Skin>, y descarga cada imagen desde el CDN
de Kobojo a data/sprites/, conservando la estructura de carpetas.

Los skins se resuelven como <bitmap_sin_ext>_<skin><ext>, p. ej.:
    bitmap="character/a.png"  +  <Skin>bronze</Skin>
        ->  character/a_bronze.png

Uso: python download_sprites.py [--threads N] [--list]
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# --------------------------------------------------------------------------- #
# Configuración
# --------------------------------------------------------------------------- #

BASE_DIR    = Path(__file__).resolve().parent
SPRITES_XML = BASE_DIR / "data" / "sprites.xml"
SPRITES_DIR = BASE_DIR / "data" / "sprites"
REMOTE_BASE = "https://s-beta.kobojo.com/mutants/assets"
USER_AGENT  = "Mozilla/5.0 (compatible; SpriteDownloader/1.0)"
TIMEOUT     = 30
RETRIES     = 3

# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def local_name(tag: str) -> str:
    """'{http://x}Sprite' -> 'Sprite'. Sin namespace lo devuelve tal cual."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def split_ext(path: str) -> tuple[str, str]:
    """'character/a.png' -> ('character/a', '.png'). Sin extensión -> (path, '')."""
    dot   = path.rfind(".")
    slash = path.rfind("/")
    if dot > slash:
        return path[:dot], path[dot:]
    return path, ""


# --------------------------------------------------------------------------- #
# Parseo del XML
# --------------------------------------------------------------------------- #

def parse_sprite_names(xml_path: Path) -> list[str]:
    """
    Devuelve la lista de rutas relativas únicas a descargar
    (bitmaps + bitmaps con skin).

    Estrategia:
      - ET.parse() carga el árbol completo (más fiable que iterparse con
        sprites anidados y clear() agresivo). Los sprites.xml suelen pesar
        pocos MB, así que no hay problema de memoria.
      - Recorremos TODOS los elementos del árbol buscando <Sprite> con
        atributo bitmap. Los <Sprite> anidados (dentro de <Composite>) no
        tienen bitmap y se ignoran.
      - Los <Skin> se buscan como hijos directos y, si no hay, se busca un
        nivel más adentro por si algún XML los envuelve en un contenedor.
    """
    if not xml_path.is_file():
        eprint(f"ERROR: no existe {xml_path}")
        sys.exit(1)

    eprint(f"[*] Leyendo {xml_path} ...")
    try:
        tree = ET.parse(str(xml_path))
    except ET.ParseError as e:
        eprint(f"ERROR: XML mal formado en {xml_path}: {e}")
        sys.exit(1)

    root = tree.getroot()
    eprint(f"[*] Elemento raíz: <{local_name(root.tag)}>")

    names: set[str] = set()
    sprite_count = 0
    sprites_without_bitmap = 0
    skin_count = 0

    for elem in root.iter():
        if local_name(elem.tag) != "Sprite":
            continue

        bitmap = (elem.get("bitmap") or "").strip()
        if not bitmap:
            sprites_without_bitmap += 1
            continue

        sprite_count += 1
        names.add(bitmap)

        base, ext = split_ext(bitmap)

        # Buscamos <Skin> como hijos directos; si no hay, un nivel más abajo.
        skins = [c for c in list(elem) if local_name(c.tag) == "Skin"]
        if not skins:
            for child in list(elem):
                skins.extend(
                    g for g in list(child) if local_name(g.tag) == "Skin"
                )

        for skin in skins:
            skin_name = (skin.text or "").strip()
            if not skin_name:
                continue
            skin_count += 1
            names.add(f"{base}_{skin_name}{ext}")

    eprint(f"[*] {sprite_count} sprites con bitmap, "
           f"{skin_count} skins, {len(names)} rutas únicas.")
    if sprites_without_bitmap:
        eprint(f"    ({sprites_without_bitmap} <Sprite> sin bitmap, ignorados)")

    return sorted(names)


# --------------------------------------------------------------------------- #
# Validación de rutas y descarga
# --------------------------------------------------------------------------- #

def is_safe_relpath(name: str) -> bool:
    """Permite subcarpetas ('character/a.png') pero bloquea '..', rutas
    absolutas, backslashes y partes vacías/dot."""
    if not name:
        return False
    if name.startswith(("/", "\\")):
        return False
    if "\\" in name:
        return False
    for part in name.split("/"):
        if part in ("", ".", ".."):
            return False
    return True


def download(url: str, dest: Path) -> str:
    """
    Descarga url -> dest de forma atómica (tmp + rename) y con reintentos.
    Devuelve: 'ok', '404' o 'fail'.
    """
    tmp = dest.parent / (dest.name + ".tmp")
    tmp.parent.mkdir(parents=True, exist_ok=True)

    req = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, RETRIES + 1):
        try:
            with urlopen(req, timeout=TIMEOUT) as resp:
                tmp.write_bytes(resp.read())
            tmp.replace(dest)
            return "ok"
        except HTTPError as e:
            tmp.unlink(missing_ok=True)
            if e.code == 404:
                eprint(f"    404: {url}")
                return "404"
            eprint(f"    HTTP {e.code} (intento {attempt}/{RETRIES})")
        except (URLError, TimeoutError, OSError) as e:
            tmp.unlink(missing_ok=True)
            eprint(f"    error de red (intento {attempt}/{RETRIES}): {e}")
    return "fail"


def process_sprite(name: str) -> tuple[str, str]:
    if not is_safe_relpath(name):
        return name, "invalid"

    out_path = SPRITES_DIR / name
    if out_path.is_file() and out_path.stat().st_size > 0:
        return name, "skip"

    url = f"{REMOTE_BASE}/{name}"
    return name, download(url, out_path)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--threads", type=int, default=4,
        help="Descargas en paralelo (por defecto 4)."
    )
    parser.add_argument(
        "--list", action="store_true",
        help="Sólo listar las rutas detectadas, sin descargar nada."
    )
    args = parser.parse_args()

    names = parse_sprite_names(SPRITES_XML)
    if not names:
        eprint("No se encontró ningún bitmap. Nada que hacer.")
        return

    if args.list:
        for n in names:
            print(n)
        eprint(f"[*] {len(names)} rutas detectadas (modo --list, sin descargar).")
        return

    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    eprint(f"[*] Carpeta destino: {SPRITES_DIR}")
    eprint(f"[*] Hilos:           {args.threads}")
    eprint("")

    stats = {"ok": 0, "skip": 0, "invalid": 0, "404": 0, "fail": 0}
    total = len(names)
    done  = 0

    with ThreadPoolExecutor(max_workers=args.threads) as pool:
        futures = {pool.submit(process_sprite, n): n for n in names}
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                _, status = fut.result()
            except Exception as e:
                status = "fail"
                eprint(f"    excepción en {name}: {e}")

            stats[status] += 1
            done += 1

            symbol = {
                "ok":      "OK ",
                "skip":    "-- ",
                "invalid": "?? ",
                "404":     "404",
                "fail":    "ERR",
            }.get(status, "???")
            print(f"[{done:>4}/{total}] {symbol} {name}")

    eprint("")
    eprint("[*] Resumen:")
    eprint(f"    Descargados:     {stats['ok']}")
    eprint(f"    Ya existentes:   {stats['skip']}")
    eprint(f"    Rutas inválidas: {stats['invalid']}")
    eprint(f"    No existen:      {stats['404']}")
    eprint(f"    Fallos:          {stats['fail']}")
    eprint("")
    eprint("[*] Hecho.")


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Lee data/sprites.xml y, a medida que encuentra cada <Tag key="sound" value="..."/>,
descarga el .wav desde el CDN de Kobojo y lo convierte a un formato que
decodeAudioData() del navegador soporta, guardándolo en data/sounds/.

Requiere: ffmpeg en el PATH.
Uso:      python download_sounds.py [--format pcm|mp3] [--threads N]
"""

import argparse
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# --------------------------------------------------------------------------- #
# Configuración
# --------------------------------------------------------------------------- #

BASE_DIR    = Path(__file__).resolve().parent
SPRITES_XML = BASE_DIR / "data" / "sprites.xml"
SOUNDS_DIR  = BASE_DIR / "data" / "sounds"
REMOTE_BASE = "https://s-beta.kobojo.com/mutants/assets/sound_mb"
USER_AGENT  = "Mozilla/5.0 (compatible; SoundDownloader/1.0)"
TIMEOUT     = 30
RETRIES     = 3

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    """Imprime siempre a stdout con flush para que PowerShell lo muestre en vivo."""
    print(msg, flush=True)


def err(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        err("ERROR: ffmpeg no está en el PATH. Reinicia PowerShell tras instalarlo.")
        sys.exit(1)


def download(url: str, dest: Path) -> str:
    """Descarga con reintentos. Devuelve 'ok', '404' o 'fail'."""
    req = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, RETRIES + 1):
        try:
            with urlopen(req, timeout=TIMEOUT) as resp:
                dest.write_bytes(resp.read())
            return "ok"
        except HTTPError as e:
            if e.code == 404:
                return "404"
            err(f"    HTTP {e.code} (intento {attempt}/{RETRIES})")
        except (URLError, TimeoutError, OSError) as e:
            err(f"    red (intento {attempt}/{RETRIES}): {e}")
    return "fail"


def convert(src: Path, dst: Path, fmt: str) -> bool:
    if fmt == "mp3":
        codec_args = ["-acodec", "libmp3lame", "-q:a", "2"]
    else:
        codec_args = ["-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1"]
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), *codec_args, str(dst)]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        err(f"    ffmpeg falló: {e.stderr.decode(errors='replace').strip()}")
        return False


# --------------------------------------------------------------------------- #
# Procesamiento de un sonido concreto
# --------------------------------------------------------------------------- #

STATS = {"ok": 0, "skip": 0, "404": 0, "fail": 0, "invalid": 0}


def process_one(name: str, fmt: str) -> str:
    """Descarga + convierte un sonido. Devuelve el status."""
    if not name or "/" in name or "\\" in name or ".." in name:
        err(f"    nombre inseguro: {name!r}")
        return "invalid"

    out_ext = "mp3" if fmt == "mp3" else "wav"
    out_path = SOUNDS_DIR / f"{name}.{out_ext}"

    if out_path.is_file() and out_path.stat().st_size > 0:
        return "skip"

    tmp_path = SOUNDS_DIR / f".{name}.tmp.wav"
    url = f"{REMOTE_BASE}/{name}.wav"

    status = download(url, tmp_path)
    if status != "ok":
        tmp_path.unlink(missing_ok=True)
        return status

    ok = convert(tmp_path, out_path, fmt)
    tmp_path.unlink(missing_ok=True)
    return "ok" if ok else "fail"


# --------------------------------------------------------------------------- #
# Parseo + procesamiento en streaming
# --------------------------------------------------------------------------- #

def run(xml_path: Path, fmt: str, threads: int) -> None:
    if not xml_path.is_file():
        err(f"ERROR: no existe {xml_path}")
        sys.exit(1)

    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)

    log(f"[*] XML:               {xml_path}")
    log(f"[*] Carpeta destino:   {SOUNDS_DIR}")
    log(f"[*] Formato de salida: {fmt}")
    log(f"[*] Hilos:             {threads}")
    log("")
    log("[*] Parseando y procesando en streaming...")
    log("")

    seen: set[str] = set()
    pending = []              # futuros en vuelo (solo si threads > 1)
    tag_count = 0
    found_count = 0

    pool = ThreadPoolExecutor(max_workers=threads) if threads > 1 else None

    def on_result(name: str, status: str) -> None:
        STATS[status] = STATS.get(status, 0) + 1
        symbol = {
            "ok": "OK ", "skip": "-- ", "404": "404",
            "fail": "ERR", "invalid": "?? ",
        }.get(status, "???")
        log(f"  [{STATS['ok'] + STATS['skip'] + STATS['404'] + STATS['fail'] + STATS['invalid']:>4}] "
            f"{symbol} {name}")

    try:
        for event, elem in ET.iterparse(str(xml_path), events=("end",)):
            if elem.tag != "Tag":
                elem.clear()
                continue

            tag_count += 1
            key = (elem.get("key") or "").strip().lower()
            if key == "sound":
                name = (elem.get("value") or "").strip()
                if name and name not in seen:
                    seen.add(name)
                    found_count += 1
                    log(f"[+] sound #{found_count}: {name}")

                    if pool is None:
                        status = process_one(name, fmt)
                        on_result(name, status)
                    else:
                        fut = pool.submit(process_one, name, fmt)
                        pending.append((name, fut))

            elem.clear()

            # Con hilos: recolectar los que ya terminaron
            if pool is not None and pending:
                still = []
                for name_, fut_ in pending:
                    if fut_.done():
                        try:
                            status = fut_.result()
                        except Exception as e:
                            err(f"    excepción en {name_}: {e}")
                            status = "fail"
                        on_result(name_, status)
                    else:
                        still.append((name_, fut_))
                pending = still

            # Progreso cada 200 tags aunque no haya sonidos nuevos
            if tag_count % 200 == 0:
                log(f"  ... {tag_count} tags leídos, {found_count} sonidos únicos")

    except KeyboardInterrupt:
        log("\n[!] Interrumpido por el usuario.")
    finally:
        if pool is not None:
            pool.shutdown(wait=True)
            for name_, fut_ in pending:
                try:
                    status = fut_.result()
                except Exception:
                    status = "fail"
                on_result(name_, status)

    log("")
    log("[*] Resumen:")
    log(f"    Convertidos:   {STATS['ok']}")
    log(f"    Ya existentes: {STATS['skip']}")
    log(f"    No existen:    {STATS['404']}")
    log(f"    Fallos:        {STATS['fail']}")
    log(f"    Nombres raros: {STATS['invalid']}")
    log(f"    Tags leídos:   {tag_count}")
    log(f"    Sonidos únicos encontrados: {found_count}")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=["pcm", "mp3"], default="pcm")
    parser.add_argument("--threads", type=int, default=1,
                        help="Por defecto 1 (secuencial). Usa 4-8 para ir más rápido.")
    args = parser.parse_args()

    check_ffmpeg()
    run(SPRITES_XML, args.format, max(1, args.threads))


if __name__ == "__main__":
    main()
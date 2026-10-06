import xml.etree.ElementTree as ET
import os
import re
import sys
import urllib.request

URL = "https://s-beta.kobojo.com/mutants/gameconfig/sprites.xml"
FX_URL = "https://s-beta.kobojo.com/mutants/gameconfig/fx.xml"

if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

ANIMATIONS_BLOCK = [
    "animation;#stand;&&/images/icons/animations/animation_stand.png;stand",
    "animation;#attack1;&&/images/icons/animations/animation_attack1.png;attack1",
    "animation;#attack1p;&&/images/icons/animations/animation_attack1p.png;attack1p",
    "animation;#attack2;&&/images/icons/animations/animation_attack2.png;attack2",
    "animation;#attack2p;&&/images/icons/animations/animation_attack2p.png;attack2p",
    "animation;#hit;&&/images/icons/animations/animation_hit.png;hit",
]

IGNORED_SKINS = {'gachaboss', 'boss'}

ATTACK_ORDER = {'1': 0, '1p': 1, '2': 2, '2p': 3, '3': 4}

def attack_sort_key(attack):
    return ATTACK_ORDER.get(str(attack).lower(), 99)

def download_xml(url, dest):
    print(f"Descargando: {url}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        f.write(r.read())
    print(f"Guardado en: {dest}")

def parse_all_data(path):
    if not os.path.exists(path):
        print(f"[ADVERTENCIA] No se encontró {path}")
        return []
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.read().split('\n')
    sections = []
    current = []
    for line in lines:
        if line.strip() == '':
            if current:
                sections.append(current)
                current = []
        else:
            current.append(line)
    if current:
        sections.append(current)
    return sections

def get_skin_key(line):
    parts = line.split(';')
    if len(parts) < 4:
        return None
    return parts[3].strip().lower() or None

def extract_skins_from_stand(stand_path):
    try:
        tree = ET.parse(stand_path)
    except Exception as e:
        print(f"[ERROR] Parseando {stand_path}: {e}")
        return []
    skins = []
    for skin_elem in tree.getroot().iter('Skin'):
        if skin_elem.text:
            skins.append(skin_elem.text.strip())
    return skins

def find_stand_file(folder):
    try:
        for f in os.listdir(folder):
            if f.lower() == 'stand.xml':
                return os.path.join(folder, f)
    except FileNotFoundError:
        return None
    return None

def build_data_txt(mutant_folder, all_data_sections):
    data_path = os.path.join(mutant_folder, 'data.txt')
    existing_lines = []
    existing_keys = set()
    has_basic = False
    if os.path.exists(data_path):
        with open(data_path, 'r', encoding='utf-8') as f:
            for line in f.read().split('\n'):
                s = line.strip()
                if s.startswith('animation;'):
                    continue
                if s.startswith('skin;'):
                    parts = line.split(';')
                    tag = parts[1].strip().lower() if len(parts) >= 2 else ''
                    key = get_skin_key(line)
                    if tag == '#basic':
                        has_basic = True
                    if key:
                        existing_keys.add(key)
                existing_lines.append(line)
    while existing_lines and existing_lines[-1].strip() == '':
        existing_lines.pop()
    stand_path = find_stand_file(mutant_folder)
    skins = extract_skins_from_stand(stand_path) if stand_path else []
    skins_lower = {s.lower() for s in skins if s.lower() not in IGNORED_SKINS}
    new_skin_lines = []
    first_new_section = True
    for section in all_data_sections:
        matched = []
        for ln in section:
            key = get_skin_key(ln)
            if key and key in skins_lower and key not in existing_keys:
                matched.append(ln)
        if matched:
            if not first_new_section:
                new_skin_lines.append('')
            new_skin_lines.extend(matched)
            first_new_section = False
            for ln in matched:
                existing_keys.add(get_skin_key(ln))
    need_basic = 'silver' in skins_lower and not has_basic
    basic_line = "skin;#basic;&&/images/icons/skins/skin_basic.png;"
    output = []
    if need_basic:
        output.append(basic_line)
    output.extend(existing_lines)
    if new_skin_lines:
        if output:
            output.append('')
        output.extend(new_skin_lines)
    if output:
        output.append('')
    output.extend(ANIMATIONS_BLOCK)
    with open(data_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output) + '\n')
    return True

def parse_fx_xml(fx_path):
    try:
        tree = ET.parse(fx_path)
    except Exception as e:
        print(f"[ERROR] Parseando fx.xml: {e}")
        return {}
    result = {}
    for elem in tree.getroot().iter('AttackFX'):
        specimen = elem.attrib.get('specimen', '').lower()
        attack = elem.attrib.get('attack', '')
        if not specimen:
            continue
        elem.tail = None
        for child in elem.iter():
            child.tail = None
        result.setdefault(specimen, []).append((attack, elem))
    return result

def write_mutant_fx_xml(folder_path, attackfx_list):
    attackfx_list = sorted(attackfx_list, key=lambda x: attack_sort_key(x[0]))
    parts = []
    for _, elem in attackfx_list:
        try:
            ET.indent(elem, space='\t')
        except AttributeError:
            pass
        parts.append(ET.tostring(elem, encoding='unicode', method='xml'))
    out_path = os.path.join(folder_path, 'fx.xml')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n\n'.join(parts) + '\n')

def update_characters_txt(characters_txt_path, created_mutant_folders):
    if not os.path.exists(characters_txt_path):
        print(f"[ADVERTENCIA] No se encontró {characters_txt_path}")
        return
    with open(characters_txt_path, 'r', encoding='utf-8') as f:
        lines = f.read().split('\n')
    out = []
    changed = 0
    for line in lines:
        if line.strip() == '':
            out.append(line)
            continue
        parts = line.split(';')
        if len(parts) >= 4:
            specimen_name = parts[3].strip().lower()
            if specimen_name in created_mutant_folders and line.startswith('//'):
                line = line[2:]
                changed += 1
        out.append(line)
    with open(characters_txt_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print(f"characters.txt actualizado ({changed} líneas descomentadas)")

def main():
    xml_path = os.path.join(SCRIPT_DIR, 'sprites.xml')
    fx_xml_path = os.path.join(SCRIPT_DIR, 'fx.xml')
    if os.path.exists(xml_path):
        print(f"Usando sprites XML existente: {xml_path}")
    else:
        try:
            download_xml(URL, xml_path)
        except Exception as e:
            print(f"[ERROR] No se pudo descargar sprites.xml: {e}")
            return
    if os.path.exists(fx_xml_path):
        print(f"Usando fx XML existente: {fx_xml_path}")
    else:
        try:
            download_xml(FX_URL, fx_xml_path)
        except Exception as e:
            print(f"[ERROR] No se pudo descargar fx.xml: {e}")
    fx_dir = os.path.join(SCRIPT_DIR, 'fx')
    mutants_dir = os.path.join(SCRIPT_DIR, 'mutants')
    others_dir = os.path.join(SCRIPT_DIR, 'others')
    for d in (fx_dir, mutants_dir, others_dir):
        os.makedirs(d, exist_ok=True)
    all_data_path = os.path.join(SCRIPT_DIR, 'all_data.txt')
    all_data_sections = parse_all_data(all_data_path)
    print(f"Secciones cargadas de all_data.txt: {len(all_data_sections)}")
    fx_by_specimen = {}
    if os.path.exists(fx_xml_path):
        fx_by_specimen = parse_fx_xml(fx_xml_path)
        print(f"Specimens con AttackFX: {len(fx_by_specimen)}")
    print(f"Procesando {xml_path}...")
    context = ET.iterparse(xml_path, events=('end',))
    specimen_folders = {}
    count_fx = count_mutants = count_others = 0
    for event, elem in context:
        if elem.tag != 'Sprite' or 'id' not in elem.attrib:
            continue
        sprite_id = elem.attrib.get('id', '?')
        try:
            lower_id = sprite_id.lower()
            xml_content = ET.tostring(elem, encoding='unicode', method='xml')
            if lower_id.startswith('fx'):
                output_file = os.path.join(fx_dir, f"{sprite_id}.xml")
                count_fx += 1
            elif lower_id.startswith('specimen'):
                parts = sprite_id.split('_')
                if len(parts) >= 4:
                    folder_name = '_'.join(parts[:3]).lower()
                    file_name = '_'.join(parts[3:])
                    folder_path = os.path.join(mutants_dir, folder_name)
                    if folder_name not in specimen_folders:
                        os.makedirs(folder_path, exist_ok=True)
                        specimen_folders[folder_name] = folder_path
                    safe_name = re.sub(r'[<>:"/\\|?*]', '_', file_name)
                    output_file = os.path.join(folder_path, f"{safe_name}.xml")
                    count_mutants += 1
                else:
                    output_file = os.path.join(others_dir, f"{sprite_id}.xml")
                    count_others += 1
            else:
                output_file = os.path.join(others_dir, f"{sprite_id}.xml")
                count_others += 1
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(xml_content)
        except Exception as e:
            print(f"[ERROR] '{sprite_id}': {e}")
        elem.clear()
    print(f"\nSprites -> FX: {count_fx} | Mutants: {count_mutants} | Others: {count_others}")
    print(f"\nGenerando data.txt para {len(specimen_folders)} mutantes...")
    generated = 0
    for folder_name, folder_path in specimen_folders.items():
        if build_data_txt(folder_path, all_data_sections):
            generated += 1
    print(f"data.txt generados: {generated}")
    print(f"\nGenerando fx.xml por mutante...")
    fx_written = 0
    for folder_name, folder_path in specimen_folders.items():
        entry = fx_by_specimen.get(folder_name.lower())
        if not entry:
            continue
        try:
            write_mutant_fx_xml(folder_path, entry)
            fx_written += 1
        except Exception as e:
            print(f"[ERROR] escribiendo fx.xml para {folder_name}: {e}")
    print(f"fx.xml generados: {fx_written}")
    characters_txt = os.path.join(SCRIPT_DIR, 'characters.txt')
    update_characters_txt(characters_txt, set(specimen_folders.keys()))
    print("\n¡PROCESO COMPLETADO!")
    print(f"Ruta de trabajo: {SCRIPT_DIR}")

if __name__ == '__main__':
    main()
import os
import sys

DEATH_LINE = "animation;#death;&&/images/icons/animations/animation_death.png;death"
HIT_LINE_PREFIX = "animation;#hit;"

if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

mutants_dir = os.path.join(SCRIPT_DIR, 'mutants')

if not os.path.isdir(mutants_dir):
    print(f"[ERROR] No existe la carpeta: {mutants_dir}")
    sys.exit(1)

added = 0
already = 0
no_hit = 0
no_data = 0

for folder_name in sorted(os.listdir(mutants_dir)):
    folder_path = os.path.join(mutants_dir, folder_name)
    if not os.path.isdir(folder_path):
        continue

    data_path = os.path.join(folder_path, 'data.txt')
    if not os.path.exists(data_path):
        no_data += 1
        continue

    with open(data_path, 'r', encoding='utf-8') as f:
        lines = f.read().split('\n')

    if any(l.strip() == DEATH_LINE for l in lines):
        already += 1
        continue

    hit_index = None
    for i, l in enumerate(lines):
        if l.strip().startswith(HIT_LINE_PREFIX):
            hit_index = i
            break

    if hit_index is None:
        print(f"[AVISO] {folder_name}: no se encontró línea 'hit', se omite")
        no_hit += 1
        continue

    lines.insert(hit_index + 1, DEATH_LINE)

    with open(data_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    added += 1

print(f"\nResumen:")
print(f"  Añadidos:              {added}")
print(f"  Ya tenían death:       {already}")
print(f"  Sin línea hit:         {no_hit}")
print(f"  Sin data.txt:          {no_data}")
import os

filename = r'c:\Users\FISCAL\Downloads\projetoentrega-main\js\garçom.js'
with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

new_lines = []
in_conflict = False
keep_current = False

for line in lines:
    if line.startswith('<<<<<<<'):
        in_conflict = True
        keep_current = True # Keep HEAD version
        continue
    if line.startswith('======='):
        # Check if it's the 7-equals marker
        if len(line.strip()) == 7:
            keep_current = False
            continue
        else:
            # It's a comment or other UI element, not a conflict marker
            if not in_conflict or keep_current:
                new_lines.append(line)
            continue
    if line.startswith('>>>>>>>'):
        in_conflict = False
        continue
    
    if not in_conflict or keep_current:
        new_lines.append(line)

with open(filename, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Conflicts resolved in {filename}")

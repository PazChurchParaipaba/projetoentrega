import os

def check_file(filename):
    print(f"Checking {filename}...")
    with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    found = False
    for i, line in enumerate(lines):
        if line.startswith('<<<<<<<') or line.startswith('>>>>>>>') or (line.startswith('=======') and len(line.strip()) == 7):
            print(f"{i+1}: {line.strip()}")
            found = True
    if not found:
        print("No conflicts found.")

check_file(r'c:\Users\FISCAL\Downloads\projetoentrega-main\js\modules.js')
check_file(r'c:\Users\FISCAL\Downloads\projetoentrega-main\js\garçom.js')

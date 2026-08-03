import sys

filename = r'c:\Users\FISCAL\Downloads\projetoentrega-main\js\garçom.js'
with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if line.startswith('<<<<<<<') or line.startswith('>>>>>>>') or (line.startswith('=======') and len(line.strip()) == 7):
        print(f"{i+1}: {line.strip()}")

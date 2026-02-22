import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open(r'c:\Users\usuario\Downloads\projetoentrega-main (7)\projetoentrega-main\js\comandas.js', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, 1):
        if '`' in line:
            print(f"{i}: {line.strip()}")

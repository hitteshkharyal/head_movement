import ast
import os

base = r'e:\head_movement\backend'
errors = []

for root, dirs, files in os.walk(base):
    # Skip venv
    if '.venv' in root:
        continue
    for fname in files:
        if fname.endswith('.py'):
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    src = f.read()
                ast.parse(src)
            except SyntaxError as e:
                errors.append(f'{fpath}: {e}')
            except Exception as e:
                errors.append(f'{fpath}: {e}')

if errors:
    print('SYNTAX ERRORS:')
    for e in errors:
        print(f'  {e}')
else:
    print('All Python files syntax OK')
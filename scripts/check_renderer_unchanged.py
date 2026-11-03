#!/usr/bin/env python3
from pathlib import Path
import hashlib, json
root=Path(__file__).resolve().parents[1]
baseline=json.loads((root/'tests/stable_baseline.json').read_text(encoding='utf-8'))
expected=baseline['renderer_sha256']
p=root/'src/hwpx-preview.js'
actual=hashlib.sha256(p.read_bytes()).hexdigest()
print('expected',expected)
print('actual  ',actual)
print('PASS' if actual==expected else 'FAIL')
raise SystemExit(0 if actual==expected else 1)

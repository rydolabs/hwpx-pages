#!/usr/bin/env python3
from __future__ import annotations
import subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CHECKS=[
  ('renderer-lock',['scripts/check_renderer_unchanged.py']),
  ('track-changes-synthetic',['scripts/track_changes_smoke.py']),
  ('track-changes-real',['scripts/track_changes_real_smoke.py']),
  ('viewer-api',['scripts/viewer_api_smoke.py']),
  ('react-legacy-adapter',['scripts/react_adapter_smoke.py']),
  ('react-esm-adapter',['scripts/react_module_smoke.py']),
  ('word-review-ui',['scripts/word_review_ui_smoke.py']),
  ('release-security',['scripts/release_security_smoke.py']),
  ('react-ssr-import',['scripts/react_ssr_import_smoke.py']),
]
def main():
    passed=failed=skipped=0
    for name,args in CHECKS:
        p=subprocess.run([sys.executable,*args],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        is_skip=p.returncode==0 and any(line.startswith('SKIP ') for line in p.stdout.splitlines())
        if is_skip:
            skipped+=1; print(f'SKIP {name}'); continue
        ok=p.returncode==0
        if ok: passed+=1
        else: failed+=1
        print(f"{'PASS' if ok else 'FAIL'} {name}")
        if not ok: print(p.stdout)
    print(f"INTEGRATION PASS={passed} SKIP={skipped} FAIL={failed}")
    return 0 if failed==0 else 1
if __name__=='__main__': raise SystemExit(main())

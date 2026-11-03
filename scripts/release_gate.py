#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, shutil, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def run(cmd:list[str], *, capture=False):
    p=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE if capture else None,stderr=subprocess.STDOUT if capture else None)
    if capture and p.stdout:
        print(p.stdout,end='' if p.stdout.endswith('\n') else '\n')
    return p

def main()->int:
    ap=argparse.ArgumentParser(description='HWPX release candidate gate')
    ap.add_argument('--reuse-stable',action='store_true',help='reuse already-generated stable-regression outputs')
    args=ap.parse_args()
    checks=[]

    p=run([sys.executable,'scripts/build_viewer_bundle.py'],capture=True)
    checks.append(('bundle-build',p.returncode==0))

    stable=[sys.executable,'scripts/stable_regression.py']
    if args.reuse_stable: stable.append('--reuse-existing')
    p=run(stable,capture=True)
    checks.append(('stable-regression',p.returncode==0))

    p=run([sys.executable,'scripts/integration_regression.py'],capture=True)
    checks.append(('integration-regression',p.returncode==0))

    npm=shutil.which('npm')
    if npm:
        p=run([npm,'pack','--dry-run','--json'],capture=True)
        ok=p.returncode==0
        if ok:
            try:
                payload=json.loads(p.stdout)
                files={x['path'] for x in payload[0]['files']}
                required={'README.md','package.json','dist/hwpx-viewer.bundle.js','dist/hwpx-viewer.module.mjs','styles/hwpx-diff-theme.css','react/index.mjs','react/index.d.ts'}
                forbidden=[x for x in files if x.startswith(('tests/','scripts/','tools/','stable-regression-out/','real-world-regression-out/'))]
                ok=required.issubset(files) and not forbidden
                print('package-files:', 'PASS' if ok else f'FAIL required={required-files} forbidden={forbidden}')
            except Exception as e:
                print('package-files: FAIL',e); ok=False
        checks.append(('npm-pack-dry-run',ok))
    else:
        print('SKIP npm-pack-dry-run: npm not found')

    pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    src=(ROOT/'src/hwpx-viewer.js').read_text(encoding='utf-8')
    version_ok=f"version:'{pkg['version']}'" in src
    print('version-consistency:', 'PASS' if version_ok else 'FAIL', pkg['version'])
    checks.append(('version-consistency',version_ok))

    failed=[name for name,ok in checks if not ok]
    print('\nRELEASE GATE', 'PASS' if not failed else 'FAIL')
    for name,ok in checks: print(('PASS' if ok else 'FAIL'),name)
    if pkg.get('private'):
        print('NOTICE public npm publish intentionally blocked: package.json private=true')
    if pkg.get('license')=='UNLICENSED':
        print('NOTICE public distribution license requires owner decision')
    return 0 if not failed else 1

if __name__=='__main__': raise SystemExit(main())

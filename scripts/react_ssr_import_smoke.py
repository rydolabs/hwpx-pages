#!/usr/bin/env python3
from __future__ import annotations
import json, shutil, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    node=shutil.which('node')
    if not node:
        print('SKIP react-ssr-import: node not found'); return 0
    stub=ROOT/'node_modules'/'react'; stub.mkdir(parents=True,exist_ok=True)
    (stub/'package.json').write_text('{"name":"react","version":"0.0.0-test","type":"module","exports":"./index.js"}')
    (stub/'index.js').write_text("export const createElement=()=>({});export const useRef=v=>({current:v});export const useEffect=()=>{};")
    code="delete globalThis.window;delete globalThis.document;const m=await import('./react/index.mjs');console.log(JSON.stringify({ok:typeof m.HwpxViewer==='function',window:typeof globalThis.window,document:typeof globalThis.document}));"
    try:
        p=subprocess.run([node,'--input-type=module','-e',code],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        print(p.stdout.strip())
        if p.returncode: print('FAIL'); return 1
        r=json.loads(p.stdout.strip().splitlines()[-1]); ok=r=={'ok':True,'window':'undefined','document':'undefined'}
        print('PASS' if ok else 'FAIL'); return 0 if ok else 1
    finally: shutil.rmtree(ROOT/'node_modules',ignore_errors=True)
if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import json, shutil, subprocess
from pathlib import Path

HERE=Path(__file__).resolve().parents[1]

def main() -> int:
    node=shutil.which('node')
    if not node:
        print('SKIP react-esm-adapter: node not found')
        return 0
    stub=HERE/'node_modules'/'react'
    stub.mkdir(parents=True,exist_ok=True)
    (stub/'package.json').write_text('{"name":"react","version":"0.0.0-test","type":"module","exports":"./index.js"}',encoding='utf-8')
    (stub/'index.js').write_text("export const createElement=(t,p)=>({t,p});export const useRef=v=>({current:v});export const useEffect=(fn,deps)=>{globalThis.__effects.push({fn,deps})};",encoding='utf-8')
    code="""globalThis.window=globalThis;globalThis.__effects=[];const m=await import('./react/index.mjs');const out=m.HwpxViewer({file:{},options:{theme:'clean'},viewerApi:{open:()=>Promise.resolve({destroy(){},setTheme(){},setFilter(){},setView(){}})}});console.log(JSON.stringify({tag:out.t,hasRef:!!out.p.ref,effects:globalThis.__effects.length,viewerType:typeof m.HwpxViewer}));"""
    try:
        p=subprocess.run([node,'--input-type=module','-e',code],cwd=HERE,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        if p.returncode!=0:
            print(p.stdout); print('FAIL'); return 1
        r=json.loads(p.stdout.strip().splitlines()[-1])
        ok=r=={'tag':'div','hasRef':True,'effects':4,'viewerType':'function'}
        print(json.dumps(r,indent=2));print('PASS' if ok else 'FAIL');return 0 if ok else 1
    finally:
        shutil.rmtree(HERE/'node_modules',ignore_errors=True)

if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE=Path(__file__).resolve().parents[1]
def main():
  exe=shutil.which('chromium') or shutil.which('chromium-browser')
  with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path=exe or None);page=b.new_page();page.set_content('<div></div>')
    page.add_script_tag(content='''window.__effects=[];window.React={createElement:(t,p)=>({t,p}),useRef:(v)=>({current:v}),useEffect:(fn,deps)=>{window.__effects.push({fn,deps});}};window.HwpxViewer={open:()=>Promise.resolve({destroy(){},setTheme(){},setFilter(){},setView(){}})};''')
    page.add_script_tag(path=str(HERE/'src/hwpx-react-legacy.js'))
    r=page.evaluate('''()=>{const C=HwpxReact.HwpxViewer;const out=C({file:{},compareWith:{},options:{theme:'minimal',filter:'modify',view:'changes'}});return {tag:out.t,hasRef:!!out.p.ref,effects:__effects.length,version:HwpxReact.version,hasFactory:typeof HwpxReact.createBindings==='function'};}''')
    b.close()
  ok=r=={'tag':'div','hasRef':True,'effects':4,'version':'0.1.0','hasFactory':True}
  print(json.dumps(r,indent=2));print('PASS' if ok else 'FAIL');return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())

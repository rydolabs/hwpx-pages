#!/usr/bin/env python3
from __future__ import annotations
import base64, json, re, shutil, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]

def make_modified(src:Path,dst:Path):
    changed=False
    with zipfile.ZipFile(src,'r') as zin, zipfile.ZipFile(dst,'w') as zout:
        for info in zin.infolist():
            data=zin.read(info.filename)
            if info.filename.startswith('Contents/section') and info.filename.endswith('.xml') and not changed:
                s=data.decode('utf-8')
                m=re.search(r'(<hp:t[^>]*>)([^<]{2,})(</hp:t>)',s)
                if m:
                    s=s[:m.end(1)]+m.group(2)+' [수정]'+s[m.start(3):]
                    data=s.encode('utf-8'); changed=True
            zout.writestr(info,data)
    if not changed: raise RuntimeError('No text node changed')

def b64(path:Path): return base64.b64encode(path.read_bytes()).decode('ascii')

def main():
    with tempfile.TemporaryDirectory() as td:
        mod=Path(td)/'modified.hwpx'; make_modified(HERE/'tests/fixtures/sample.hwpx',mod)
        exe=shutil.which('chromium') or shutil.which('chromium-browser')
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=exe or None)
            page=browser.new_page()
            page.set_content('<div id="changes"></div><div id="old"></div><div id="new"></div>')
            page.add_script_tag(path=str(HERE/'src/hwpx-preview.js'))
            page.add_script_tag(path=str(HERE/'src/hwpx-diff.js'))
            result=page.evaluate('''async ({o,n})=>{const dec=x=>{const s=atob(x),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer};const ob=dec(o),nb=dec(n);const d=await HwpxDiff.diff(ob,nb);HwpxDiff.renderChanges(d,document.querySelector('#changes'));const ov=await renderHwpx(ob,document.querySelector('#old'),{targetWidth:400});const nv=await renderHwpx(nb,document.querySelector('#new'),{targetWidth:400});return {summary:d.summary,cards:document.querySelectorAll('.hwpx-diff-change').length,oldPages:ov.pages.length,newPages:nv.pages.length};}''',{'o':b64(HERE/'tests/fixtures/sample.hwpx'),'n':b64(mod)})
            browser.close()
    ok=result['summary']['total']==1 and result['summary']['modified']==1 and result['cards']==1 and result['oldPages']==result['newPages']==1
    print(json.dumps(result,ensure_ascii=False,indent=2))
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1

if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import base64, json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]
PACKAGE_VERSION=json.loads((HERE/'package.json').read_text(encoding='utf-8'))['version']
OUT=HERE/'integration-regression-out/word-review-ui.png'

def b64(p): return base64.b64encode(p.read_bytes()).decode()

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    old=HERE/'tests/track-changes/hybrid-old.hwpx'; new=HERE/'tests/track-changes/hybrid-new.hwpx'
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page(viewport={'width':1180,'height':720},device_scale_factor=1)
        page.set_content('''<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif}.frame{width:900px;margin:34px auto;background:#fff;border:1px solid #e7e5e0;border-radius:12px;padding:14px 22px 30px;box-shadow:0 4px 18px rgba(0,0,0,.04)}</style><div class="frame"><div id="root"></div></div>''')
        page.add_style_tag(path=str(HERE/'styles/hwpx-diff-theme.css'))
        for f in ['src/hwpx-preview.js','src/hwpx-diff.js','src/hwpx-track-changes.js','src/hwpx-diff-ui.js','src/hwpx-viewer.js']:
            page.add_script_tag(path=str(HERE/f))
        page.evaluate('(x)=>window.__old=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer',b64(old))
        page.evaluate('(x)=>window.__new=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer',b64(new))
        result=page.evaluate('''async()=>{
          const v=await HwpxViewer.open(__new,document.querySelector('#root'),{compareWith:__old});
          const bars=[...document.querySelectorAll('.hwpx-diff-change-bar')];
          bars[0].click();
          await new Promise(r=>setTimeout(r,20));
          const note=document.querySelector('.hwpx-viewer-review-note');
          return {
            total:v.diff.summary.total,
            bars:bars.length,
            barVisible:bars.length?getComputedStyle(bars[0]).display!=='none':false,
            headVisible:[...document.querySelectorAll('.hwpx-diff-change-head')].some(x=>getComputedStyle(x).display!=='none'),
            popovers:document.querySelectorAll('.hwpx-viewer-popover').length,
            noteVisible:!!note && getComputedStyle(note).display!=='none',
            noteTitle:note?.querySelector('.hwpx-viewer-review-note-title')?.textContent||'',
            noteMeta:note?.querySelector('.hwpx-viewer-review-note-meta')?.textContent||'',
            noteBody:note?.querySelector('.hwpx-viewer-review-note-body')?.textContent||'',
            buttons:[...document.querySelectorAll('.hwpx-viewer-toolbar button')].map(x=>x.textContent.trim()),
            version:HwpxViewer.version,
            uiVersion:HwpxDiffUI.version
          };
        }''')
        page.screenshot(path=str(OUT),full_page=True)
        browser.close()
    ok=(result['total']==2 and result['bars']==2 and result['barVisible'] and not result['headVisible'] and result['popovers']==0 and result['noteVisible']
        and result['noteTitle']=='Inserted' and 'Track Tester' in result['noteMeta'] and 'INSERT' in result['noteBody']
        and result['version']==PACKAGE_VERSION and result['uiVersion']=='0.5.0')
    print(json.dumps(result,ensure_ascii=False,indent=2)); print(OUT); print('PASS' if ok else 'FAIL')
    return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())

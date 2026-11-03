#!/usr/bin/env python3
from __future__ import annotations
import base64, json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]
PACKAGE_VERSION=json.loads((HERE/'package.json').read_text(encoding='utf-8'))['version']
OUT=HERE/'integration-regression-out/compact-ui.png'

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    old=(HERE/'tests/track-changes/hybrid-old.hwpx').read_bytes()
    new=(HERE/'tests/track-changes/hybrid-new.hwpx').read_bytes()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page(viewport={'width':1100,'height':760}, device_scale_factor=1)
        page.set_content('''<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif}.frame{width:860px;margin:30px auto;background:#fff;border:1px solid #e5e2dc;border-radius:12px;padding:16px 20px 24px;box-shadow:0 4px 18px rgba(0,0,0,.04)}</style><div class="frame"><div id="root"></div></div>''')
        page.add_style_tag(path=str(HERE/'styles/hwpx-diff-theme.css'))
        for f in ['src/hwpx-preview.js','src/hwpx-diff.js','src/hwpx-track-changes.js','src/hwpx-diff-ui.js','src/hwpx-viewer.js']:
            page.add_script_tag(path=str(HERE/f))
        page.evaluate('(x)=>window.__old=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer',base64.b64encode(old).decode())
        page.evaluate('(x)=>window.__new=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer',base64.b64encode(new).decode())
        result=page.evaluate('''async()=>{
          const v=await HwpxViewer.open(__new,document.querySelector('#root'),{compareWith:__old});
          const root=document.querySelector('#root');
          const before={
            mode:v.mode,total:v.diff.summary.total,theme:root.querySelector('.hwpx-diff-ui')?.dataset.diffTheme,
            markers:root.querySelectorAll('.hwpx-diff-marker').length,
            visibleMarkers:[...root.querySelectorAll('.hwpx-diff-marker')].filter(x=>getComputedStyle(x).display!=='none').length,
            toolbar:!!root.querySelector('.hwpx-viewer-toolbar'),
            typeButtons:root.querySelectorAll('.hwpx-viewer-toolbar button').length,
            filterLabels:[...root.querySelectorAll('.hwpx-viewer-filter-menu label')].map(x=>x.textContent.trim()),
            count:root.querySelector('.hwpx-viewer-count')?.textContent,
            showAuthor:v.advanced.options.ui.behavior.showAuthor,
            showMarkers:v.advanced.options.ui.behavior.showMarkers,
            colorByAuthor:v.advanced.options.ui.behavior.colorByAuthor,
            version:HwpxViewer.version
          };
          v.next();
          before.selected=root.querySelectorAll('.hwpx-diff-selected').length;
          return before;
        }''')
        page.screenshot(path=str(OUT),full_page=True)
        browser.close()
    ok=(result['mode']=='compare' and result['total']==2 and result['theme']=='clean' and result['visibleMarkers']==0
        and result['toolbar'] and result['filterLabels']==['추가','삭제','수정'] and result['count']=='2'
        and result['showAuthor'] is False and result['showMarkers'] is False and result['colorByAuthor'] is False
        and result['selected']==1 and result['version']==PACKAGE_VERSION)
    print(json.dumps(result,ensure_ascii=False,indent=2));print(OUT);print('PASS' if ok else 'FAIL')
    return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())

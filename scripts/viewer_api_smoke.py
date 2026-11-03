#!/usr/bin/env python3
from __future__ import annotations
import json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE=Path(__file__).resolve().parents[1]
PACKAGE_VERSION=json.loads((HERE/'package.json').read_text(encoding='utf-8'))['version']

def main():
  exe=shutil.which('chromium') or shutil.which('chromium-browser')
  with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path=exe or None);page=b.new_page()
    page.set_content('<div id="a"></div><div id="b"></div>')
    for f in ['styles/hwpx-diff-theme.css']:
      page.add_style_tag(path=str(HERE/f))
    for f in ['src/hwpx-preview.js','src/hwpx-diff.js','src/hwpx-track-changes.js','src/hwpx-diff-ui.js','src/hwpx-viewer.js']:
      page.add_script_tag(path=str(HERE/f))
    old=(HERE/'tests/track-changes/hybrid-old.hwpx').read_bytes();new=(HERE/'tests/track-changes/hybrid-new.hwpx').read_bytes()
    page.evaluate('(x)=>{window.__old=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer}', __import__('base64').b64encode(old).decode())
    page.evaluate('(x)=>{window.__new=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer}', __import__('base64').b64encode(new).decode())
    result=page.evaluate('''async()=>{
      const doc=await HwpxViewer.open(__new,document.querySelector('#a'));
      const cmp=await HwpxViewer.open(__new,document.querySelector('#b'),{compareWith:__old});
      const before={mode:cmp.mode,view:cmp.view,total:cmp.diff.summary.total,tracked:cmp.diff.changes.filter(x=>x.source==='tracked-change').length,structural:cmp.diff.changes.filter(x=>x.source==='structural-diff').length,cards:document.querySelectorAll('#b .hwpx-diff-change').length,pages:document.querySelectorAll('#a .hwpx-page').length};
      cmp.setFilter('modify');const visible=document.querySelectorAll('#b .hwpx-diff-change:not([data-diff-filtered="1"])').length;
      cmp.setTheme('minimal');await cmp.setView('side-by-side');
      const sidePages=document.querySelectorAll('#b .hwpx-viewer-side .hwpx-page').length;
      const norm=HwpxViewer.normalizeOptions({compareWith:__old});
      doc.destroy();cmp.destroy();
      return {...before,visible,sidePages,defaultTheme:norm.theme,defaultTracked:norm.diff.trackedChanges,emptyA:document.querySelector('#a').childElementCount,emptyB:document.querySelector('#b').childElementCount,version:HwpxViewer.version};
    }''')
    b.close()
  ok=(result['mode']=='compare' and result['view']=='changes' and result['total']==2 and result['tracked']==1 and result['structural']==1 and result['cards']==2 and result['pages']>=1 and result['visible']==1 and result['sidePages']>=2 and result['defaultTheme']=='clean' and result['defaultTracked']=='prefer' and result['emptyA']==0 and result['emptyB']==0 and result['version']==PACKAGE_VERSION)
  print(json.dumps(result,ensure_ascii=False,indent=2));print('PASS' if ok else 'FAIL');return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import base64,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE=Path(__file__).resolve().parents[1]
OUT=HERE/'integration-regression-out/viewer-bundle.png'
def main():
  OUT.parent.mkdir(parents=True,exist_ok=True)
  exe=shutil.which('chromium') or shutil.which('chromium-browser')
  old=(HERE/'tests/track-changes/hybrid-old.hwpx').read_bytes();new=(HERE/'tests/track-changes/hybrid-new.hwpx').read_bytes()
  with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path=exe or None);page=b.new_page(viewport={'width':1100,'height':760})
    page.set_content('''<style>body{font-family:Arial,sans-serif;margin:0;background:#f5f5f5}.head{padding:20px 24px;background:white;border-bottom:1px solid #ddd}.head h2{margin:0 0 6px}.head p{margin:0;color:#666}.stage{max-width:900px;margin:24px auto;background:white;padding:24px;border-radius:12px}</style><div class="head"><h2>HwpxViewer v27</h2><p>기본 비교: compareWith 하나만 지정</p></div><div id="root" class="stage"></div>''')
    page.add_style_tag(path=str(HERE/'styles/hwpx-diff-theme.css'));page.add_script_tag(path=str(HERE/'dist/hwpx-viewer.bundle.js'))
    page.evaluate('(x)=>window.__old=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer',base64.b64encode(old).decode());page.evaluate('(x)=>window.__new=Uint8Array.from(atob(x),c=>c.charCodeAt(0)).buffer',base64.b64encode(new).decode())
    r=page.evaluate('''async()=>{const v=await HwpxViewer.open(__new,document.querySelector('#root'),{compareWith:__old});return {mode:v.mode,total:v.diff.summary.total,version:HwpxViewer.version,cards:document.querySelectorAll('.hwpx-diff-change').length}}''')
    page.screenshot(path=str(OUT),full_page=True);b.close()
  ok=r['mode']=='compare' and r['total']==2 and r['cards']==2
  print(json.dumps(r,ensure_ascii=False,indent=2));print(OUT);print('PASS' if ok else 'FAIL');return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())

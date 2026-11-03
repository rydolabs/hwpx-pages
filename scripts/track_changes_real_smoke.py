#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
from track_changes_inspect import inspect

HERE=Path(__file__).resolve().parents[1]

def b64(p: Path) -> str: return base64.b64encode(p.read_bytes()).decode()

def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--dir', type=Path, default=HERE/'tests'/'track-changes-real')
    args=ap.parse_args()
    files=sorted(args.dir.glob('*.hwpx'))
    if not files:
        print('SKIP real-hancom-track-changes: no .hwpx files in', args.dir)
        return 0
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    rows=[]; ok=True
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page(); page.set_content('<div></div>')
        page.add_script_tag(path=str(HERE/'src/hwpx-diff.js'))
        page.add_script_tag(path=str(HERE/'src/hwpx-track-changes.js'))
        for f in files:
            raw=inspect(f)
            try:
                parsed=page.evaluate('''async x=>{const s=atob(x),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);const d=await HwpxTrackChanges.parse(u.buffer);return {changes:d.changes.length,metadata:d.metadata.length,authors:d.authors.length,types:[...new Set(d.metadata.map(x=>x.rawType).filter(Boolean))].sort()};}''',b64(f))
                expected=raw['textRevisionCount']
                passed=raw['pairedMarkers'] and parsed['changes']==expected
                rows.append({'file':f.name,'pass':passed,'xml':raw,'parser':parsed})
                ok=ok and passed
            except Exception as e:
                rows.append({'file':f.name,'pass':False,'xml':raw,'error':str(e)}); ok=False
        browser.close()
    print(json.dumps(rows,ensure_ascii=False,indent=2))
    print('PASS real-hancom-track-changes' if ok else 'FAIL real-hancom-track-changes')
    return 0 if ok else 1

if __name__=='__main__': raise SystemExit(main())

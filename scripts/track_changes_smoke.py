#!/usr/bin/env python3
from __future__ import annotations
import base64, json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]
FIX=HERE/'tests'/'track-changes'
CASES={
 'insert': {'types':['insert'],'old':'insert-old.hwpx','new':'insert-new.hwpx','newText':' INSERT'},
 'delete': {'types':['delete'],'old':'delete-old.hwpx','new':'delete-new.hwpx','oldText':'beta'},
 'replace': {'types':['modify'],'old':'replace-old.hwpx','new':'replace-new.hwpx','oldText':'old','newText':'new'},
 'hybrid': {'types':['insert','modify'],'old':'hybrid-old.hwpx','new':'hybrid-new.hwpx'},
}
def b64(p):return base64.b64encode(p.read_bytes()).decode()

def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    results={}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page()
        page.set_content('<div></div>')
        page.add_script_tag(path=str(HERE/'src/hwpx-diff.js'))
        page.add_script_tag(path=str(HERE/'src/hwpx-track-changes.js'))
        for name,c in CASES.items():
            r=page.evaluate('''async ({o,n})=>{const dec=x=>{const s=atob(x),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer};const d=await HwpxTrackChanges.diff(dec(o),dec(n));return {mode:d.mode,summary:d.summary,changes:d.changes.map(x=>({type:x.type,source:x.source,oldText:x.oldText,newText:x.newText,author:x.author||'',date:x.date||'',oldRef:x.oldRef,newRef:x.newRef})),trackedCount:d.trackChanges.changes.length,authors:d.trackChanges.authors};}''',{'o':b64(FIX/c['old']),'n':b64(FIX/c['new'])})
            results[name]=r
        browser.close()
    ok=True
    for name,c in CASES.items():
        r=results[name]
        types=[x['type'] for x in r['changes']]
        if types!=c['types']:ok=False
        if name!='hybrid':
            ch=r['changes'][0]
            if ch['source']!='tracked-change' or ch['author']!='Track Tester':ok=False
            if 'oldText' in c and ch['oldText']!=c['oldText']:ok=False
            if 'newText' in c and ch['newText']!=c['newText']:ok=False
        else:
            if [x['source'] for x in r['changes']]!=['tracked-change','structural-diff']:ok=False
    # No tracked markers: adapter must fall back to the unchanged structural engine.
    # The existing four cases above exercise authoritative/hybrid mode.
    print(json.dumps(results,ensure_ascii=False,indent=2))
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1
if __name__=='__main__':raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import base64, io, json, shutil, struct, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
TMP=Path(tempfile.mkdtemp(prefix='hwpx-release-security-'))

def b64(p: Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()

def make_many_entries(path: Path, count=4097):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_STORED) as z:
        for i in range(count): z.writestr(f'x/{i}.txt',b'')

def make_high_ratio(path: Path):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.writestr('Contents/header.xml', b'0'*(8*1024*1024))

def make_bad_offset(src: Path, dst: Path):
    data=bytearray(src.read_bytes())
    sig=b'PK\x01\x02'; pos=0; patched=False
    while True:
        pos=data.find(sig,pos)
        if pos<0: break
        nlen=struct.unpack_from('<H',data,pos+28)[0]
        name=bytes(data[pos+46:pos+46+nlen]).decode('utf-8','replace')
        if name.lower()=='contents/header.xml':
            struct.pack_into('<I',data,pos+42,0x7ffffff0); patched=True; break
        pos += 46+nlen+struct.unpack_from('<H',data,pos+30)[0]+struct.unpack_from('<H',data,pos+32)[0]
    if not patched: raise RuntimeError('header central directory entry not found')
    dst.write_bytes(data)

def make_malicious_font(src: Path, dst: Path):
    payload='BadFont\";position:fixed;inset:0;background:red;/*'
    with zipfile.ZipFile(src,'r') as zin, zipfile.ZipFile(dst,'w') as zout:
        for info in zin.infolist():
            data=zin.read(info.filename)
            if info.filename.lower()=='contents/header.xml':
                text=data.decode('utf-8')
                import re
                # XML entity decodes back to a literal quote in DOM metadata.
                repl='face="'+payload.replace('&','&amp;').replace('"','&quot;')+'"'
                text=re.sub(r'face="[^"]*"',repl,text)
                data=text.encode('utf-8')
            zout.writestr(info,data)


def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    many=TMP/'many.hwpx'; ratio=TMP/'ratio.hwpx'; bad=TMP/'bad.hwpx'; mal=TMP/'malicious-font.hwpx'
    make_many_entries(many); make_high_ratio(ratio); make_bad_offset(ROOT/'tests/fixtures/sample.hwpx',bad); make_malicious_font(ROOT/'tests/fixtures/sample.hwpx',mal)
    files={k:b64(v) for k,v in {'many':many,'ratio':ratio,'bad':bad,'mal':mal}.items()}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page(viewport={'width':900,'height':700})
        page.set_content('<div id="root"></div>')
        page.add_script_tag(path=str(ROOT/'src/hwpx-preview.js'))
        page.add_script_tag(path=str(ROOT/'src/hwpx-diff.js'))
        page.add_script_tag(path=str(ROOT/'src/hwpx-track-changes.js'))
        page.evaluate('(m)=>{for(const [k,v] of Object.entries(m)) window[k]=Uint8Array.from(atob(v),c=>c.charCodeAt(0)).buffer}',files)
        result=page.evaluate('''async()=>{
          const err=async(fn)=>{try{await fn();return null}catch(e){return String(e&&e.message||e)}};
          const oversized=new ArrayBuffer(64*1024*1024+1);
          const out={};
          out.oversized=await err(()=>renderHwpx(oversized,document.querySelector('#root')));
          out.many=await err(()=>renderHwpx(many,document.querySelector('#root')));
          out.ratio=await err(()=>renderHwpx(ratio,document.querySelector('#root')));
          out.bad=await err(()=>renderHwpx(bad,document.querySelector('#root')));
          out.diffMany=await err(()=>HwpxDiff.parse(many));
          out.trackMany=await err(()=>HwpxTrackChanges.parse(many));
          document.querySelector('#root').replaceChildren();
          const viewer=await renderHwpx(mal,document.querySelector('#root'));
          const span=document.querySelector('.hwpx-line span');
          out.malicious={
            rendered:!!span,
            position:span?.style.position||'',
            inset:span?.style.inset||'',
            background:span?.style.background||'',
            fontFamily:span?.style.fontFamily||''
          };
          viewer.destroy();
          return out;
        }''')
        browser.close()
    checks={
      'oversized': result['oversized']=='HWPX ZIP exceeds maximum file size',
      'many': result['many']=='HWPX ZIP has too many entries',
      'ratio': result['ratio']=='HWPX ZIP entry compression ratio is too high',
      'bad': bool(result['bad']) and 'out of bounds' in result['bad'],
      'diff-many': result['diffMany']=='HWPX ZIP has too many entries',
      'track-many': result['trackMany']=='HWPX ZIP has too many entries',
      'metadata-no-html-style-injection': result['malicious']['rendered'] and not result['malicious']['position'] and not result['malicious']['inset'] and not result['malicious']['background'],
    }
    print(json.dumps({'checks':checks,'details':result},ensure_ascii=False,indent=2))
    ok=all(checks.values())
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1

if __name__=='__main__':
    try: raise SystemExit(main())
    finally: shutil.rmtree(TMP,ignore_errors=True)

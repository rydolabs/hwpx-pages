#!/usr/bin/env python3
"""Regression smoke for HWPX lineSeg logical-position mapping.

Creates three temporary variants of an existing multi-line fixture:
  * known extended ctrl at paragraph start (+8 logical units)
  * inline tab at paragraph start (+1 logical unit)
  * unknown ctrl at paragraph start (+0; must not be guessed as +8)

The visible line texts must stay byte-for-byte identical to the baseline render.
"""
from __future__ import annotations
import base64, re, shutil, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests' / 'fixtures' / 'text-flow.hwpx'
RENDERER = ROOT / 'src/hwpx-preview.js'

P_RE = re.compile(r'(<hp:p\b.*?</hp:p>)', re.S)
RUN_T_RE = re.compile(r'(<hp:run\b[^>]*>)(\s*<hp:t\b[^>]*>)', re.S)
SEG_RE = re.compile(r'(textpos=")(\d+)(")')


def patch_section(xml: str, kind: str) -> str:
    parts = []
    last = 0
    for m in P_RE.finditer(xml):
        para = m.group(1)
        if para.count('<hp:lineseg ') < 2 or '<hp:t' not in para:
            continue
        runm = RUN_T_RE.search(para)
        if not runm:
            continue
        if kind == 'extended':
            inject = '<hp:ctrl><hp:autoNum/></hp:ctrl>'
            delta = 8
        elif kind == 'inline':
            inject = ''
            delta = 1
        elif kind == 'unknown':
            inject = '<hp:ctrl><hp:syntheticUnknown/></hp:ctrl>'
            delta = 0
        else:
            raise ValueError(kind)

        if kind == 'inline':
            # Place the inline token inside hp:t before the first visible text.
            t_open_end = runm.end(2)
            para = para[:t_open_end] + '<hp:tab/>' + para[t_open_end:]
        else:
            para = para[:runm.end(1)] + inject + para[runm.end(1):]

        if delta:
            seen = 0
            def bump(sm):
                nonlocal seen
                seen += 1
                v = int(sm.group(2))
                # First line remains paragraph-origin textpos=0; later cached
                # break positions include the inserted logical token/control.
                if seen > 1:
                    v += delta
                return sm.group(1) + str(v) + sm.group(3)
            para = SEG_RE.sub(bump, para)

        return xml[:m.start()] + para + xml[m.end():]
    raise RuntimeError('No suitable multi-line paragraph found')


def make_variant(src: Path, dst: Path, kind: str) -> None:
    with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dst, 'w') as zout:
        patched = False
        for info in zin.infolist():
            data = zin.read(info.filename)
            if not patched and info.filename.startswith('Contents/section') and info.filename.endswith('.xml'):
                xml = data.decode('utf-8')
                try:
                    xml2 = patch_section(xml, kind)
                except RuntimeError:
                    xml2 = xml
                if xml2 != xml:
                    data = xml2.encode('utf-8')
                    patched = True
            zout.writestr(info, data)
        if not patched:
            raise RuntimeError(f'Could not patch {kind} fixture')


def line_texts(page, hwpx: Path):
    b64 = base64.b64encode(hwpx.read_bytes()).decode('ascii')
    page.evaluate('''async b64 => {
      const s=atob(b64),u=new Uint8Array(s.length);
      for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);
      await renderHwpx(u.buffer,document.querySelector('#stage'),{targetWidth:794,matchEmbeddedPreview:false});
    }''', b64)
    return page.locator('.hwpx-line').all_text_contents()


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        variants = {}
        for kind in ('extended','inline','unknown'):
            p = td / f'{kind}.hwpx'
            make_variant(FIXTURE, p, kind)
            variants[kind] = p

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium') or None, args=['--font-render-hinting=none'])
            page = browser.new_page(viewport={'width':900,'height':1200})
            page.set_content('<div id="stage"></div>')
            page.add_script_tag(path=str(RENDERER))
            baseline = line_texts(page, FIXTURE)
            results = {}
            for kind, path in variants.items():
                page.evaluate("document.querySelector('#stage').innerHTML='' ")
                got = line_texts(page, path)
                results[kind] = got == baseline
                if got != baseline:
                    print(f'FAIL {kind}: visible line texts changed')
                    for i,(a,b) in enumerate(zip(baseline,got)):
                        if a!=b:
                            print(' first mismatch line', i, repr(a), repr(b)); break
            browser.close()

    for kind, ok in results.items():
        print(('PASS' if ok else 'FAIL'), kind)
    return 0 if all(results.values()) else 1

if __name__ == '__main__':
    raise SystemExit(main())

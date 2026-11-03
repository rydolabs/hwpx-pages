#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, html, io, json, shutil, sys, zipfile
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
from skimage.metrics import structural_similarity


def embedded_preview(path: Path) -> Image.Image | None:
    try:
        with zipfile.ZipFile(path) as zf:
            if 'Preview/PrvImage.png' not in zf.namelist():
                return None
            return Image.open(io.BytesIO(zf.read('Preview/PrvImage.png'))).convert('RGB')
    except Exception:
        return None


def image_metrics(ref: Image.Image, rendered: Image.Image) -> dict[str, float]:
    if rendered.size != ref.size:
        rendered = rendered.resize(ref.size)
    a=np.asarray(ref,dtype=np.uint8); b=np.asarray(rendered,dtype=np.uint8)
    d=np.abs(a.astype(np.int16)-b.astype(np.int16))
    return {
        'mae': float(d.mean()),
        'ssim': float(structural_similarity(a,b,channel_axis=2,data_range=255)),
        'rgb_max_error_lt_16': float((d.max(axis=2)<16).mean()),
    }


def save_compare_images(ref: Image.Image, rendered: Image.Image, out: Path) -> None:
    if rendered.size != ref.size:
        rendered=rendered.resize(ref.size)
    ref.save(out/'reference.png')
    Image.blend(ref, rendered, .5).save(out/'overlay.png')
    diff=ImageChops.difference(ref, rendered)
    diff.save(out/'diff.png')
    canvas=Image.new('RGB',(ref.width*2,ref.height),'white')
    canvas.paste(ref,(0,0)); canvas.paste(rendered,(ref.width,0)); canvas.save(out/'compare.png')


def render_case(page, hwpx: Path, renderer: Path, out: Path, target_width: int) -> dict[str, Any]:
    payload=base64.b64encode(hwpx.read_bytes()).decode('ascii')
    page_errors=[]
    console_errors=[]
    page.on('pageerror', lambda exc: page_errors.append(str(exc)))
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type=='error' else None)
    page.set_viewport_size({'width':max(1000,target_width+100),'height':1400})
    page.set_content('<div id="stage"></div><style>html,body{margin:0;background:#ddd}.hwpx-page{box-shadow:none!important}</style>')
    page.add_script_tag(path=str(renderer.resolve()))
    page.evaluate('''async ({b64,w})=>{const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);window.__viewer=await renderHwpx(u.buffer,document.querySelector('#stage'),{targetWidth:w,matchEmbeddedPreview:true});}''', {'b64':payload,'w':target_width})
    loc=page.locator('.hwpx-page')
    count=loc.count()
    dims=[]
    for i in range(count):
        shot=out/f'page-{i+1}.png'
        loc.nth(i).screenshot(path=str(shot))
        box=loc.nth(i).bounding_box() or {}
        dims.append({'width':round(box.get('width',0),2),'height':round(box.get('height',0),2)})
    return {'pages_rendered':count,'page_dimensions':dims,'page_errors':page_errors,'console_errors':console_errors}


def html_report(results: list[dict[str,Any]], root: Path) -> str:
    rows=[]
    for r in results:
        status='PASS' if r['pass'] else 'FAIL'
        imgs=''.join(f'<a href="{html.escape(r["id"])}/page-{i}.png"><img src="{html.escape(r["id"])}/page-{i}.png"></a>' for i in range(1,r['pages_rendered']+1))
        pix='—'
        if r.get('metrics'):
            m=r['metrics']; pix=f'MAE {m["mae"]:.3f}<br>SSIM {m["ssim"]:.4f}<br>&lt;16 {m["rgb_max_error_lt_16"]*100:.2f}%'
            imgs += f'<a href="{html.escape(r["id"])}/compare.png"><img src="{html.escape(r["id"])}/compare.png"></a>'
        errs='<br>'.join(html.escape(x) for x in (r['page_errors']+r['console_errors'])) or '—'
        rows.append(f'''<tr class="{status.lower()}"><td><b>{status}</b></td><td><code>{html.escape(r['id'])}</code><br>{html.escape(r['description'])}<br><small>{html.escape(r['source'])}</small></td><td>{r['expected_pages']}</td><td>{r['pages_rendered']}</td><td>{pix}</td><td>{errs}</td><td class="shots">{imgs}</td></tr>''')
    passed=sum(1 for r in results if r['pass'])
    return f'''<!doctype html><meta charset="utf-8"><title>HWPX regression suite</title><style>
body{{font:14px system-ui,sans-serif;margin:24px;background:#f5f5f5;color:#222}}table{{border-collapse:collapse;width:100%;background:white}}th,td{{border:1px solid #ccc;padding:8px;vertical-align:top}}th{{background:#eee;position:sticky;top:0}}tr.fail td:first-child{{background:#ffd9d9}}tr.pass td:first-child{{background:#dff5df}}.shots img{{width:160px;margin:2px;border:1px solid #aaa;vertical-align:top}}code{{font-weight:700}}small{{color:#666}}</style>
<h1>HWPX regression suite</h1><p><b>{passed}/{len(results)} PASS</b>. PASS는 현재 1차 기준인 Hancom expected page count 일치 + 브라우저 오류 없음을 의미합니다. Preview/PrvImage.png가 있는 문서는 픽셀 지표도 함께 계산합니다.</p>
<table><thead><tr><th>Status</th><th>Case</th><th>Hancom pages</th><th>Our pages</th><th>Pixel metrics</th><th>Errors</th><th>Rendered pages / compare</th></tr></thead><tbody>{''.join(rows)}</tbody></table>'''


def main() -> int:
    ap=argparse.ArgumentParser()
    here=Path(__file__).resolve().parents[1]
    ap.add_argument('--manifest',type=Path,default=here/'tests/manifest.json')
    ap.add_argument('--renderer',type=Path,default=here/'src/hwpx-preview.js')
    ap.add_argument('--out',type=Path,default=here/'regression-suite-out')
    ap.add_argument('--target-width',type=int,default=794)
    args=ap.parse_args()
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    args.out.mkdir(parents=True,exist_ok=True)
    results=[]
    executable=shutil.which('chromium') or shutil.which('chromium-browser')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=executable or None,args=['--font-render-hinting=none'])
        for case in manifest['cases']:
            case_out=args.out/case['id']; case_out.mkdir(parents=True,exist_ok=True)
            hwpx=args.manifest.parent/case['file']
            ref=embedded_preview(hwpx)
            width=ref.width if ref else args.target_width
            page=browser.new_page()
            try:
                result=render_case(page,hwpx,args.renderer,case_out,width)
                m=None
                if ref and result['pages_rendered']:
                    rendered=Image.open(case_out/'page-1.png').convert('RGB')
                    m=image_metrics(ref,rendered); save_compare_images(ref,rendered,case_out)
                result.update(case); result['metrics']=m
                result['pass']=(result['pages_rendered']==case['expected_pages'] and not result['page_errors'] and not result['console_errors'])
            except Exception as e:
                result={**case,'pages_rendered':0,'page_dimensions':[],'page_errors':[repr(e)],'console_errors':[],'metrics':None,'pass':False}
            finally:
                page.close()
            results.append(result)
            print(f"{'PASS' if result['pass'] else 'FAIL'} {case['id']}: Hancom={case['expected_pages']} ours={result['pages_rendered']}")
        browser.close()
    (args.out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    (args.out/'index.html').write_text(html_report(results,args.out),encoding='utf-8')
    passed=sum(1 for r in results if r['pass'])
    print(f'\n{passed}/{len(results)} passed')
    print(args.out/'index.html')
    return 0 if passed==len(results) else 1

if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, html, json, shutil
from pathlib import Path
from typing import Any

import fitz
import numpy as np
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
from skimage.metrics import structural_similarity


def translate_white(img: Image.Image, dx: int, dy: int) -> Image.Image:
    a=np.asarray(img.convert('RGB'))
    out=np.full_like(a,255)
    h,w=a.shape[:2]
    sx0=max(0,-dx); sx1=min(w,w-dx); sy0=max(0,-dy); sy1=min(h,h-dy)
    dx0=max(0,dx); dx1=min(w,w+dx); dy0=max(0,dy); dy1=min(h,h+dy)
    if sx1>sx0 and sy1>sy0:
        out[dy0:dy1,dx0:dx1]=a[sy0:sy1,sx0:sx1]
    return Image.fromarray(out)

def estimate_translation(ref: Image.Image, rendered: Image.Image, max_shift: int=20) -> tuple[int,int]:
    if rendered.size != ref.size:
        rendered=rendered.resize(ref.size)
    # Downsample for a cheap registration pass. Use darkness rather than RGB so text/lines drive alignment.
    step=4
    a=255-np.asarray(ref.convert('L'),dtype=np.int16)[::step,::step]
    b=255-np.asarray(rendered.convert('L'),dtype=np.int16)[::step,::step]
    lim=max(1,max_shift//step)
    best=(1e30,0,0)
    for dy in range(-lim,lim+1):
        for dx in range(-lim,lim+1):
            y0=max(0,dy); y1=min(a.shape[0],a.shape[0]+dy); x0=max(0,dx); x1=min(a.shape[1],a.shape[1]+dx)
            by0=max(0,-dy); by1=by0+(y1-y0); bx0=max(0,-dx); bx1=bx0+(x1-x0)
            if y1<=y0 or x1<=x0: continue
            aa=a[y0:y1,x0:x1]; bb=b[by0:by1,bx0:bx1]
            score=float(np.abs(aa-bb).mean())
            if score<best[0]: best=(score,dx*step,dy*step)
    # Fine search around coarse solution. Positive dx/dy means shift rendered right/down.
    _,cx,cy=best; best2=(1e30,cx,cy)
    ar=np.asarray(ref.convert('L'),dtype=np.int16); br=np.asarray(rendered.convert('L'),dtype=np.int16)
    h,w=ar.shape
    for dy in range(cy-3,cy+4):
        for dx in range(cx-3,cx+4):
            y0=max(0,dy); y1=min(h,h+dy); x0=max(0,dx); x1=min(w,w+dx)
            by0=max(0,-dy); by1=by0+(y1-y0); bx0=max(0,-dx); bx1=bx0+(x1-x0)
            if y1<=y0 or x1<=x0: continue
            aa=ar[y0:y1,x0:x1]; bb=br[by0:by1,bx0:bx1]
            score=float(np.abs(aa-bb).mean())
            if score<best2[0]: best2=(score,dx,dy)
    return best2[1],best2[2]

def producer_normalization_shift(producer: str, target_width: int) -> tuple[int,int]:
    # Microsoft Print To PDF adds a stable page-origin translation relative to Hancom's direct PDF export.
    # Normalize only that known printer-space translation; never optimize a page against its reference.
    if 'Microsoft: Print To PDF' in (producer or ''):
        k=target_width/794.0
        return round(10*k),round(11*k)
    return 0,0

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


def save_compare_images(ref: Image.Image, rendered: Image.Image, out_prefix: Path) -> None:
    if rendered.size != ref.size:
        rendered=rendered.resize(ref.size)
    ref.save(out_prefix.with_name(out_prefix.name+'-reference.png'))
    rendered.save(out_prefix.with_name(out_prefix.name+'-render.png'))
    Image.blend(ref, rendered, .5).save(out_prefix.with_name(out_prefix.name+'-overlay.png'))
    ImageChops.difference(ref, rendered).save(out_prefix.with_name(out_prefix.name+'-diff.png'))
    canvas=Image.new('RGB',(ref.width*2,ref.height),'white')
    canvas.paste(ref,(0,0)); canvas.paste(rendered,(ref.width,0)); canvas.save(out_prefix.with_name(out_prefix.name+'-compare.png'))


def rasterize_pdf(pdf_path: Path, out_dir: Path, target_width: int) -> tuple[list[Path],str,str]:
    doc=fitz.open(pdf_path)
    meta=doc.metadata or {}
    producer=meta.get('producer') or ''
    creator=meta.get('creator') or ''
    outs=[]
    for i in range(doc.page_count):
        page=doc.load_page(i)
        scale=target_width / page.rect.width
        pix=page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        out=out_dir / f'page-{i+1}-reference.png'
        pix.save(out)
        outs.append(out)
    return outs, producer, creator


def render_case(page, hwpx: Path, renderer: Path, out: Path, target_width: int, hancom_compat: str='2022') -> dict[str, Any]:
    payload=base64.b64encode(hwpx.read_bytes()).decode('ascii')
    page_errors=[]
    console_errors=[]
    page.on('pageerror', lambda exc: page_errors.append(str(exc)))
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type=='error' else None)
    page.set_viewport_size({'width':max(1000,target_width+100),'height':1400})
    page.set_content('<div id="stage"></div><style>html,body{margin:0;background:#ddd}.hwpx-page{box-shadow:none!important}</style>')
    page.add_script_tag(path=str(renderer.resolve()))
    page.evaluate('''async ({b64,w,compat})=>{const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);window.__viewer=await renderHwpx(u.buffer,document.querySelector('#stage'),{targetWidth:w,matchEmbeddedPreview:false,hancomCompat:compat});}''', {'b64':payload,'w':target_width,'compat':hancom_compat})
    loc=page.locator('.hwpx-page')
    count=loc.count()
    dims=[]
    render_paths=[]
    for i in range(count):
        shot=out/f'page-{i+1}-render.png'
        loc.nth(i).screenshot(path=str(shot))
        render_paths.append(shot)
        box=loc.nth(i).bounding_box() or {}
        dims.append({'width':round(box.get('width',0),2),'height':round(box.get('height',0),2)})
    return {'pages_rendered':count,'page_dimensions':dims,'page_errors':page_errors,'console_errors':console_errors,'render_paths':[str(p) for p in render_paths]}


def summarize(page_metrics: list[dict[str,float]]) -> dict[str,float] | None:
    if not page_metrics:
        return None
    keys=page_metrics[0].keys()
    return {k: float(sum(m[k] for m in page_metrics)/len(page_metrics)) for k in keys}


def html_report(results: list[dict[str,Any]]) -> str:
    rows=[]
    for r in results:
        status='PASS' if r['pass'] else 'FAIL'
        avg='—'
        if r.get('avg_metrics'):
            m=r['avg_metrics']
            avg=f'MAE {m["mae"]:.3f}<br>SSIM {m["ssim"]:.4f}<br>&lt;16 {m["rgb_max_error_lt_16"]*100:.2f}%'
        aligned='—'
        if r.get('aligned_avg_metrics'):
            am=r['aligned_avg_metrics']; aligned=f'MAE {am["mae"]:.3f}<br>SSIM {am["ssim"]:.4f}<br>&lt;16 {am["rgb_max_error_lt_16"]*100:.2f}%'
        per_page=[]
        for p in r.get('pages',[]):
            met = p.get('metrics')
            line=f'<div><b>p{p["page"]}</b>'
            if met:
                line += f' raw MAE {met["mae"]:.2f}, SSIM {met["ssim"]:.4f}'
            amet=p.get('aligned_metrics')
            if amet:
                sh=p.get('shift') or {}; line += f' / normalized SSIM {amet["ssim"]:.4f} shift({sh.get("dx",0)},{sh.get("dy",0)})'
            line += '<br>'
            base = f'{html.escape(r["id"])}'
            line += f'<a href="{base}/page-{p["page"]}-compare.png"><img src="{base}/page-{p["page"]}-compare.png"></a>'
            line += f'<a href="{base}/page-{p["page"]}-diff.png"><img src="{base}/page-{p["page"]}-diff.png"></a>'
            if p.get('aligned_metrics'):
                line += f'<a href="{base}/page-{p["page"]}-aligned-compare.png"><img src="{base}/page-{p["page"]}-aligned-compare.png"></a>'
            line += '</div>'
            per_page.append(line)
        errs='<br>'.join(html.escape(x) for x in (r['page_errors']+r['console_errors'])) or '—'
        rows.append(f'''<tr class="{status.lower()}"><td><b>{status}</b></td><td><code>{html.escape(r['id'])}</code><br>{html.escape(r['description'])}</td><td>{r['reference_pages']}</td><td>{r['pages_rendered']}</td><td>{avg}</td><td>{aligned}<br><small>{html.escape(r.get('pdf_producer') or '')}</small></td><td>{errs}</td><td class="shots">{''.join(per_page) or '—'}</td></tr>''')
    passed=sum(1 for r in results if r['pass'])
    return f'''<!doctype html><meta charset="utf-8"><title>HWPX PDF regression suite</title><style>
body{{font:14px system-ui,sans-serif;margin:24px;background:#f5f5f5;color:#222}}table{{border-collapse:collapse;width:100%;background:white}}th,td{{border:1px solid #ccc;padding:8px;vertical-align:top}}th{{background:#eee;position:sticky;top:0}}tr.fail td:first-child{{background:#ffd9d9}}tr.pass td:first-child{{background:#dff5df}}.shots img{{width:150px;margin:2px;border:1px solid #aaa;vertical-align:top}}code{{font-weight:700}}
</style>
<h1>HWPX ↔ Hancom PDF regression suite</h1><p><b>{passed}/{len(results)} PASS</b>. PASS는 현재 기준으로 PDF 페이지 수 일치 + 브라우저 오류 없음 입니다. 아래 비교 썸네일은 좌측 reference PDF / 우측 renderer 결과입니다.</p>
<table><thead><tr><th>Status</th><th>Case</th><th>PDF pages</th><th>Our pages</th><th>Raw metrics</th><th>Printer-origin-normalized metrics / producer</th><th>Errors</th><th>Page comparisons</th></tr></thead><tbody>{''.join(rows)}</tbody></table>'''


def main() -> int:
    ap=argparse.ArgumentParser()
    here=Path(__file__).resolve().parents[1]
    ap.add_argument('--manifest',type=Path,default=here/'tests/pdf_manifest.json')
    ap.add_argument('--renderer',type=Path,default=here/'src/hwpx-preview.js')
    ap.add_argument('--out',type=Path,default=here/'regression-pdf-out')
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
            pdf=args.manifest.parent/case['pdf']
            ref_paths,producer,creator=rasterize_pdf(pdf, case_out, args.target_width)
            hancom_compat='2018' if 'Hwp 2018' in creator else '2022'
            page=browser.new_page()
            try:
                result=render_case(page,hwpx,args.renderer,case_out,args.target_width,hancom_compat)
                page_metrics=[]; aligned_page_metrics=[]; pages=[]
                overlap=min(len(ref_paths), result['pages_rendered'])
                for i in range(overlap):
                    ref_img=Image.open(ref_paths[i]).convert('RGB')
                    ren_img=Image.open(case_out/f'page-{i+1}-render.png').convert('RGB')
                    metrics=image_metrics(ref_img, ren_img)
                    page_metrics.append(metrics)
                    save_compare_images(ref_img, ren_img, case_out/f'page-{i+1}')
                    dx,dy=producer_normalization_shift(producer,args.target_width)
                    aligned=translate_white(ren_img,dx,dy)
                    aligned_metrics=image_metrics(ref_img,aligned)
                    aligned_page_metrics.append(aligned_metrics)
                    aligned.save(case_out/f'page-{i+1}-aligned-render.png')
                    save_compare_images(ref_img,aligned,case_out/f'page-{i+1}-aligned')
                    pages.append({'page':i+1, 'metrics':metrics, 'aligned_metrics':aligned_metrics, 'shift':{'dx':dx,'dy':dy}})
                # create placeholders for missing pages in report
                max_pages=max(len(ref_paths), result['pages_rendered'])
                for i in range(overlap+1,max_pages+1):
                    pages.append({'page':i,'metrics':None})
                result.update(case)
                result['reference_pages']=len(ref_paths)
                result['pdf_producer']=producer
                result['pdf_creator']=creator
                result['hancom_compat']=hancom_compat
                result['avg_metrics']=summarize(page_metrics)
                result['aligned_avg_metrics']=summarize(aligned_page_metrics)
                result['pages']=pages
                result['pass']=(result['pages_rendered']==len(ref_paths) and not result['page_errors'] and not result['console_errors'])
            except Exception as e:
                result={**case,'reference_pages':len(ref_paths),'pdf_producer':producer,'pdf_creator':creator,'hancom_compat':hancom_compat,'pages_rendered':0,'page_dimensions':[],'page_errors':[repr(e)],'console_errors':[],'avg_metrics':None,'pages':[],'pass':False}
            finally:
                page.close()
            results.append(result)
            summary = 'n/a' if not result.get('avg_metrics') else f"MAE={result['avg_metrics']['mae']:.2f}, SSIM={result['avg_metrics']['ssim']:.4f}"
            print(f"{'PASS' if result['pass'] else 'FAIL'} {case['id']}: PDF={result['reference_pages']} ours={result['pages_rendered']} {summary}")
        browser.close()
    (args.out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    (args.out/'index.html').write_text(html_report(results),encoding='utf-8')
    passed=sum(1 for r in results if r['pass'])
    print(f'\n{passed}/{len(results)} passed')
    print(args.out/'index.html')
    return 0 if passed==len(results) else 1

if __name__=='__main__':
    raise SystemExit(main())

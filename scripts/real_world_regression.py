#!/usr/bin/env python3
from __future__ import annotations
import base64, io, json, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from skimage.metrics import structural_similarity as structural_similarity

ROOT=Path(__file__).resolve().parents[1]
HWPX=ROOT/'tests/real-world/conference-template.hwpx'
PDF=ROOT/'tests/real-world/reference-pdf/conference-template.pdf'
RENDERER=ROOT/'src/hwpx-preview.js'
OUT=ROOT/'real-world-regression-out'

def render_pdf(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('page-*.png'):
        old.unlink()
    exe=shutil.which('pdftoppm')
    if not exe:
        raise RuntimeError('pdftoppm is required for canonical PDF regression')
    subprocess.run([exe,'-png','-r','144',str(PDF),str(out/'page')],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)

def metrics(a: Image.Image,b: Image.Image):
    if a.size!=b.size:b=b.resize(a.size)
    x=np.asarray(a.convert('RGB'),dtype=np.uint8); y=np.asarray(b.convert('RGB'),dtype=np.uint8)
    d=np.abs(x.astype(np.int16)-y.astype(np.int16))
    return {'mae':float(d.mean()),'ssim':float(structural_similarity(x,y,channel_axis=2,data_range=255)),'rgb_max_error_lt_16':float((d.max(axis=2)<16).mean())}

def main():
    OUT.mkdir(exist_ok=True)
    ref=OUT/'pdf'; ref.mkdir(exist_ok=True)
    render_pdf(ref)
    target=Image.open(ref/'page-1.png').width
    payload=base64.b64encode(HWPX.read_bytes()).decode('ascii')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or None,args=['--font-render-hinting=none'])
        page=browser.new_page(viewport={'width':target,'height':1800},device_scale_factor=1)
        page.set_content('<div id="stage"></div><style>html,body{margin:0}.hwpx-page{box-shadow:none!important}</style>')
        page.add_script_tag(path=str(RENDERER))
        page.evaluate('''async ({b64,w})=>{const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);window.v=await renderHwpx(u.buffer,document.querySelector('#stage'),{targetWidth:w,matchEmbeddedPreview:false});}''',{'b64':payload,'w':target})
        pages=page.locator('.hwpx-page').count()
        data={
          'pages':pages,
          'header_lines':page.locator('.hwpx-header-tabline').count(),
          'footer_pages':[page.locator('.hwpx-footer-page').nth(i).inner_text() for i in range(page.locator('.hwpx-footer-page').count())],
          'title_count':page.get_by_text('논문 제목을 입력 하십시오',exact=True).count(),
          'intro_count':page.get_by_text('1. 서론',exact=False).count(),
          'first_cell_height':page.locator('.hwpx-cell').first.evaluate('(e)=>e.getBoundingClientRect().height'),
          'equation_nodes':page.locator('.hwpx-equation').count(),
          'security_review_lines':page.evaluate('''()=>[...document.querySelectorAll('.hwpx-line')].map(e=>e.innerText).filter(t=>t.includes('발표논문은 평문')||t.startsWith('검토 완료 후')||t.startsWith('(파일은 보안해제')||t.startsWith('은 미제출 처리'))'''),
          'security_review_geometry':page.evaluate('''()=>{
            const pg=[...document.querySelectorAll('.hwpx-page')][1], pr=pg.getBoundingClientRect();
            const lines=[...pg.querySelectorAll('.hwpx-line')].filter(e=>e.innerText.includes('발표논문은 평문')||e.innerText.startsWith('검토 완료 후')||e.innerText.startsWith('(파일은 보안해제')||e.innerText.startsWith('은 미제출 처리'));
            const xs=lines.map(e=>e.getBoundingClientRect().left-pr.left);
            const cols=window.v._columnGeometry(window.v.section);
            const expectedFirst=(window.v.page.margin.left+(cols.columns[1]?.x||0))*window.v.scale;
            const intent=Math.abs(window.v.styles.paras.get('21')?.intent||0)*window.v.scale;
            return {xs, expectedFirst, expectedHanging:intent};
          }'''),
        }
        for i in range(pages): page.locator('.hwpx-page').nth(i).screenshot(path=str(OUT/f'render-page-{i+1}.png'))
        browser.close()
    with zipfile.ZipFile(HWPX) as zf:
        xml=zf.read('Contents/section0.xml').decode('utf-8')
        data['source_equations']=xml.count('<hp:equation')
    data['metrics']=[]
    for i in range(1,min(2,pages)+1):
        data['metrics'].append({'page':i,**metrics(Image.open(ref/f'page-{i}.png'),Image.open(OUT/f'render-page-{i}.png'))})
    checks={
      'pages_2':data['pages']==2,
      'headers_on_both_pages':data['header_lines']>=2,
      'footer_page_numbers':data['footer_pages'][:2]==['1','2'],
      'title_visible':data['title_count']>=1,
      'mixed_text_object_visible':data['intro_count']>=1,
      'layout_frame_not_clipped':data['first_cell_height']>400,
      'equation_rendered':data['equation_nodes']==data['source_equations'] and data['equation_nodes']>0,
      'security_review_linebreaks':data['security_review_lines'][:4]==[
        '※ 발표논문은 평문으로 작성해 주시고, 필요 시 보안성 ',
        '검토 완료 후 기한 내에 제출해 주시기 바랍니다. ',
        '(파일은 보안해제, 암호해제 후 제출, 확인불가 논문',
        '은 미제출 처리)'
      ],
      'security_review_paragraph_geometry':(
        len(data['security_review_geometry']['xs'])>=4 and
        abs(data['security_review_geometry']['xs'][0]-data['security_review_geometry']['expectedFirst'])<1.0 and
        all(abs((x-data['security_review_geometry']['xs'][0])-data['security_review_geometry']['expectedHanging'])<1.0
            for x in data['security_review_geometry']['xs'][1:4])
      ),
    }
    data['checks']=checks
    data['pass']=all(checks.values())
    data['known_limitations']=[]
    (OUT/'results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(data,ensure_ascii=False,indent=2))
    return 0 if data['pass'] else 1

if __name__=='__main__': raise SystemExit(main())

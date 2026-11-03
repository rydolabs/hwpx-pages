#!/usr/bin/env python3
"""Render an HWPX with Chromium and compare it with Preview/PrvImage.png.

Usage:
  python scripts/regression.py sample.hwpx
  python scripts/regression.py sample.hwpx --renderer hwpx-preview.js --out regression-out
"""
from __future__ import annotations
import argparse, base64, io, json, shutil, sys, zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from skimage.metrics import structural_similarity as structural_similarity


def embedded_preview(hwpx: Path) -> Image.Image:
    with zipfile.ZipFile(hwpx) as zf:
        names = set(zf.namelist())
        name = 'Preview/PrvImage.png'
        if name not in names:
            raise RuntimeError(f'{name} is not present in {hwpx}')
        return Image.open(io.BytesIO(zf.read(name))).convert('RGB')


def render(hwpx: Path, renderer: Path, out_png: Path, target_width: int) -> int:
    payload = base64.b64encode(hwpx.read_bytes()).decode('ascii')
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,
            args=['--font-render-hinting=none'],
        )
        page = browser.new_page(viewport={'width': target_width, 'height': 1400}, device_scale_factor=1)
        page.set_content('<div id="stage"></div><style>html,body{margin:0}.hwpx-page{box-shadow:none!important}</style>')
        page.add_script_tag(path=str(renderer.resolve()))
        page.evaluate(
            '''async ({b64,w})=>{const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);window.__viewer=await renderHwpx(u.buffer,document.querySelector('#stage'),{targetWidth:w,matchEmbeddedPreview:true});}''',
            {'b64': payload, 'w': target_width},
        )
        pages = page.locator('.hwpx-page').count()
        page.locator('.hwpx-page').first.screenshot(path=str(out_png))
        if pages > 1:
            for i in range(pages):
                page.locator('.hwpx-page').nth(i).screenshot(path=str(out_png.with_name(f'{out_png.stem}-page-{i+1}{out_png.suffix}')))
        browser.close()
        return pages


def metrics(reference: Image.Image, rendered: Image.Image) -> dict:
    if reference.size != rendered.size:
        rendered = rendered.resize(reference.size)
    a = np.asarray(reference, dtype=np.uint8)
    b = np.asarray(rendered, dtype=np.uint8)
    delta = np.abs(a.astype(np.int16) - b.astype(np.int16))
    return {
        'width': reference.width,
        'height': reference.height,
        'mae': float(delta.mean()),
        'ssim': float(structural_similarity(a, b, channel_axis=2, data_range=255)),
        'rgb_max_error_lt_16': float((delta.max(axis=2) < 16).mean()),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('hwpx', type=Path)
    ap.add_argument('--renderer', type=Path, default=Path(__file__).resolve().parents[1] / 'src/hwpx-preview.js')
    ap.add_argument('--out', type=Path, default=Path('regression-out'))
    ap.add_argument('--expect-pages', type=int, default=None, help='fail if the renderer creates a different number of pages')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    ref = embedded_preview(args.hwpx)
    target_width = ref.width
    ref_path = args.out / 'reference.png'
    render_path = args.out / 'render.png'
    ref.save(ref_path)
    pages = render(args.hwpx, args.renderer, render_path, target_width)
    result = metrics(ref, Image.open(render_path).convert('RGB'))
    result['pages_rendered'] = pages
    (args.out / 'metrics.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

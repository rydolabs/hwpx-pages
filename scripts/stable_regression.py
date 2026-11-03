#!/usr/bin/env python3
"""Official stable regression gate for the HWPX renderer.

Runs, in order:
  1. renderer SHA-256 lock
  2. lineSeg logical-stream control mapping smoke
  3. sample.hwpx embedded-preview baseline
  4. 10-case structural/page-count suite
  5. 10-case Hancom direct-PDF suite
  6. visual metric guards against the frozen stable baseline
  7. real-world Hancom HWPX/PDF regression (conference template)

A non-zero exit code means the renderer is not stable-compatible.
"""
from __future__ import annotations
import argparse, hashlib, html, json, subprocess, sys
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return p.returncode, p.stdout


def guard_metrics(actual: dict, base: dict, tol: dict) -> list[str]:
    errors=[]
    if actual['mae'] > base['mae'] + tol['mae_increase']:
        errors.append(f"MAE {actual['mae']:.6f} > {base['mae'] + tol['mae_increase']:.6f}")
    if actual['ssim'] < base['ssim'] - tol['ssim_decrease']:
        errors.append(f"SSIM {actual['ssim']:.6f} < {base['ssim'] - tol['ssim_decrease']:.6f}")
    if actual['rgb_max_error_lt_16'] < base['rgb_max_error_lt_16'] - tol['rgb_max_error_lt_16_decrease']:
        errors.append(
            f"RGB<16 {actual['rgb_max_error_lt_16']:.6f} < "
            f"{base['rgb_max_error_lt_16'] - tol['rgb_max_error_lt_16_decrease']:.6f}"
        )
    return errors


def main() -> int:
    ap=argparse.ArgumentParser()
    root=Path(__file__).resolve().parents[1]
    ap.add_argument('--baseline', type=Path, default=root/'tests/stable_baseline.json')
    ap.add_argument('--out', type=Path, default=root/'stable-regression-out')
    ap.add_argument('--reuse-existing', action='store_true', help='reuse existing sample/structure/pdf outputs in --out instead of rerunning them')
    args=ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    baseline=json.loads(args.baseline.read_text(encoding='utf-8'))
    checks=[]

    # 1. Renderer byte lock.
    renderer=root/'src/hwpx-preview.js'
    actual_hash=hashlib.sha256(renderer.read_bytes()).hexdigest()
    hash_ok=actual_hash == baseline['renderer_sha256']
    checks.append({'name':'renderer-sha256','pass':hash_ok,'detail':actual_hash})
    print(f"{'PASS' if hash_ok else 'FAIL'} renderer-sha256: {actual_hash}")

    # 2. lineSeg logical-stream mapping (extended, inline, unknown controls).
    rc, logical_log = run([sys.executable,'scripts/lineseg_logical_stream_smoke.py'], root)
    (args.out/'lineseg-logical-stream.log').write_text(logical_log,encoding='utf-8')
    logical_ok = rc == 0
    logical_detail = 'PASS' if logical_ok else logical_log.strip()[-500:]
    checks.append({'name':'lineseg-logical-stream','pass':logical_ok,'detail':logical_detail})
    print(f"{'PASS' if logical_ok else 'FAIL'} lineseg-logical-stream")

    # 3. sample.hwpx baseline.
    sample_out=args.out/'sample'
    if args.reuse_existing and (sample_out/'metrics.json').exists():
        rc, log = 0, 'reused existing sample output\n'
    else:
        rc, log = run([sys.executable, 'scripts/regression.py', baseline['sample']['file'], '--out', str(sample_out)], root)
        (args.out/'sample.log').write_text(log, encoding='utf-8')
    sample_ok=False; sample_detail='regression.py failed'
    if rc == 0 and (sample_out/'metrics.json').exists():
        sm=json.loads((sample_out/'metrics.json').read_text(encoding='utf-8'))
        errs=[]
        if sm['pages_rendered'] != baseline['sample']['expected_pages']:
            errs.append(f"pages {sm['pages_rendered']} != {baseline['sample']['expected_pages']}")
        errs += guard_metrics(sm, baseline['sample']['metrics'], baseline['sample']['tolerance'])
        sample_ok=not errs
        sample_detail=(
            f"pages={sm['pages_rendered']} MAE={sm['mae']:.6f} "
            f"SSIM={sm['ssim']:.6f} RGB<16={sm['rgb_max_error_lt_16']:.6f}"
            + ('' if not errs else ' / ' + '; '.join(errs))
        )
    checks.append({'name':'sample-baseline','pass':sample_ok,'detail':sample_detail})
    print(f"{'PASS' if sample_ok else 'FAIL'} sample-baseline: {sample_detail}")

    # 4. Structural/page-count suite.
    structural_out=args.out/'structure'
    if args.reuse_existing and (structural_out/'results.json').exists():
        rc, log = 0, 'reused existing structural output\n'
    else:
        rc, log=run([sys.executable,'scripts/regression_suite.py','--out',str(structural_out)],root)
        (args.out/'structure.log').write_text(log,encoding='utf-8')
    structural_ok=rc == 0
    structural_results=[]
    if (structural_out/'results.json').exists():
        structural_results=json.loads((structural_out/'results.json').read_text(encoding='utf-8'))
        structural_ok=structural_ok and all(x.get('pass') for x in structural_results) and len(structural_results)==10
    checks.append({'name':'structure-10','pass':structural_ok,'detail':f"{sum(bool(x.get('pass')) for x in structural_results)}/{len(structural_results)} PASS"})
    print(f"{'PASS' if structural_ok else 'FAIL'} structure: {sum(bool(x.get('pass')) for x in structural_results)}/{len(structural_results)}")

    # 5. Hancom direct-PDF suite + 6. visual baseline guards.
    pdf_out=args.out/'pdf'
    if args.reuse_existing and (pdf_out/'results.json').exists():
        rc, log = 0, 'reused existing PDF output\n'
    else:
        rc, log=run([sys.executable,'scripts/regression_pdf_suite.py','--out',str(pdf_out)],root)
        (args.out/'pdf.log').write_text(log,encoding='utf-8')
    pdf_results=[]
    if (pdf_out/'results.json').exists():
        pdf_results=json.loads((pdf_out/'results.json').read_text(encoding='utf-8'))
    pdf_basic_ok=rc == 0 and len(pdf_results)==10 and all(x.get('pass') for x in pdf_results)
    checks.append({'name':'hancom-pdf-10','pass':pdf_basic_ok,'detail':f"{sum(bool(x.get('pass')) for x in pdf_results)}/{len(pdf_results)} PASS"})
    print(f"{'PASS' if pdf_basic_ok else 'FAIL'} hancom-pdf: {sum(bool(x.get('pass')) for x in pdf_results)}/{len(pdf_results)}")

    tol=baseline['pdf']['tolerance']; visual_failures=[]
    for r in pdf_results:
        expected=baseline['pdf']['cases'].get(r['id'])
        actual=r.get('avg_metrics')
        if expected is None or actual is None:
            visual_failures.append(f"{r['id']}: missing baseline/metrics")
            continue
        errs=guard_metrics(actual, expected, tol)
        if errs:
            visual_failures.append(f"{r['id']}: " + '; '.join(errs))
    visual_ok=len(pdf_results)==len(baseline['pdf']['cases']) and not visual_failures
    checks.append({'name':'pdf-visual-baseline','pass':visual_ok,'detail':'OK' if visual_ok else ' | '.join(visual_failures)})
    print(f"{'PASS' if visual_ok else 'FAIL'} pdf-visual-baseline" + ('' if visual_ok else ': ' + ' | '.join(visual_failures)))

    # 7. Real-world Hancom-authored HWPX/PDF pair.
    real_out=args.out/'real-world'
    if args.reuse_existing and (real_out/'results.json').exists():
        rc, log = 0, 'reused existing real-world output\n'
    else:
        rc, log=run([sys.executable,'scripts/real_world_regression.py'],root)
        (args.out/'real-world.log').write_text(log,encoding='utf-8')
        source=root/'real-world-regression-out'
        if source.exists():
            import shutil
            if real_out.exists(): shutil.rmtree(real_out)
            shutil.copytree(source,real_out)
    real_data={}
    if (real_out/'results.json').exists():
        real_data=json.loads((real_out/'results.json').read_text(encoding='utf-8'))
    real_errors=[]
    if rc != 0 or not real_data.get('pass'):
        real_errors.append('functional checks failed')
    rw_base=baseline.get('real_world',{})
    rw_tol=rw_base.get('tolerance',{})
    actual_pages=real_data.get('metrics',[])
    expected_pages=rw_base.get('pages',[])
    if len(actual_pages) != len(expected_pages):
        real_errors.append(f"metric pages {len(actual_pages)} != {len(expected_pages)}")
    else:
        for actual, expected in zip(actual_pages, expected_pages):
            errs=guard_metrics(actual, expected, rw_tol)
            if errs: real_errors.append(f"page {expected.get('page')}: " + '; '.join(errs))
    real_ok=not real_errors
    detail='OK' if real_ok else ' | '.join(real_errors)
    checks.append({'name':'real-world-conference-template','pass':real_ok,'detail':detail})
    print(f"{'PASS' if real_ok else 'FAIL'} real-world-conference-template" + ('' if real_ok else ': '+detail))

    overall=all(x['pass'] for x in checks)
    summary={
        'baseline_version':baseline['version'],
        'pass':overall,
        'checks':checks,
        'renderer_sha256':actual_hash,
        'structural_cases':structural_results,
        'pdf_cases':pdf_results,
        'real_world':real_data,
    }
    (args.out/'stable-results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    rows=''.join(
        f"<tr class={'pass' if c['pass'] else 'fail'}><td>{'PASS' if c['pass'] else 'FAIL'}</td><td>{html.escape(c['name'])}</td><td>{html.escape(c['detail'])}</td></tr>"
        for c in checks
    )
    (args.out/'index.html').write_text(f'''<!doctype html><meta charset="utf-8"><title>HWPX stable regression</title>
<style>body{{font:14px system-ui;margin:28px;background:#f6f6f6;color:#222}}table{{border-collapse:collapse;background:#fff;width:100%}}th,td{{padding:9px;border:1px solid #ddd;text-align:left}}.pass td:first-child{{color:#176b2c;font-weight:700}}.fail td:first-child{{color:#b42318;font-weight:700}}code{{background:#eee;padding:2px 5px}}</style>
<h1>HWPX stable regression — {'PASS' if overall else 'FAIL'}</h1>
<p>Baseline: <code>{html.escape(baseline['version'])}</code>. This gate locks renderer bytes, sample preview metrics, 10 structural/page-count fixtures, and 10 Hancom direct-PDF visual baselines, and the real-world conference-template HWPX/PDF pair.</p>
<table><thead><tr><th>Status</th><th>Check</th><th>Detail</th></tr></thead><tbody>{rows}</tbody></table>
<p><a href="structure/index.html">Structure report</a> · <a href="pdf/index.html">Hancom PDF report</a> · <a href="real-world/results.json">Real-world result</a> · <a href="stable-results.json">JSON results</a></p>''',encoding='utf-8')
    print(f"\nSTABLE {'PASS' if overall else 'FAIL'}")
    print(args.out/'index.html')
    return 0 if overall else 1

if __name__=='__main__':
    raise SystemExit(main())

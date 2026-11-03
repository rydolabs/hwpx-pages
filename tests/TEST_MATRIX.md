# Test matrix

This directory is the release regression corpus. Generated outputs are not committed.

| Area | Coverage | Gate |
|---|---|---|
| Sample baseline | original `sample.hwpx`, embedded preview metrics and page count | `stable_regression.py` |
| Structural layout | 10 synthetic HWPX fixtures | `regression_suite.py` |
| Hancom PDF visual | same 10 fixtures compared to Hancom direct-PDF output using MAE/SSIM/RGB guards | `regression_pdf_suite.py` |
| Real-world | conference template HWPX + direct Hancom PDF; header/footer, floating frame, paragraph geometry, equation, page metrics | `real_world_regression.py` |
| lineSeg logical stream | extended, inline and unknown controls mapped to logical positions | `lineseg_logical_stream_smoke.py` |
| Track Changes | insert/delete/replace/hybrid synthetic HWPX pairs | `track_changes_smoke.py` |
| Track Changes real | reserved corpus folder; SKIP until Hancom-authored tracked-change samples are added | `track_changes_real_smoke.py` |
| Viewer API | normal render + compareWith flow | `viewer_api_smoke.py` |
| Diff UI | themes, filters, compact/Word-style review behavior | integration smoke scripts |
| React | legacy adapter, ESM adapter, SSR-safe import | React smoke scripts |
| Security | file-size, ZIP entry count, inflated size/ratio, corrupt offsets, metadata style injection | `release_security_smoke.py` |
| Packaging | build output, npm pack contents, version consistency | `release_gate.py` |

## Synthetic fixture set

1. `text-flow` — long flowing text / pagination
2. `columns` — two columns + breaks
3. `columns-unequal` — unequal column widths
4. `floating-picture` — floating image/page flow
5. `merged-table` — merged cells across page end
6. `repeat-header-table` — multipage table with repeated header
7. `textbox` — text box sizing
8. `shape-across-columns` — PAGE/PAPER floating shape across columns
9. `nested-table-shape` — nested table + behind-text shape
10. `border-conflict-merged` — merged table border conflict resolution

## Stable rule

A release is blocked when any frozen baseline regresses. If a deliberate renderer improvement changes a baseline, the new baseline is accepted only after direct Hancom-PDF comparison and review.

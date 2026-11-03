# Stable renderer regression gate

`hwpx-preview.js` is treated as the frozen stable renderer core. The official gate is:

```bash
python scripts/stable_regression.py
```

It verifies four things in one run:

1. **Renderer byte lock** — SHA-256 must match the frozen stable core.
2. **`sample.hwpx` baseline** — one page and the established `Preview/PrvImage.png` MAE/SSIM/RGB<16 baseline within a small environment tolerance.
3. **Structural fixture suite** — all 10 feature fixtures must match expected Hancom page counts and have no browser/console errors.
4. **Hancom direct-PDF suite** — all 10 reference PDFs must match page counts and browser health, and their raw MAE/SSIM/RGB<16 metrics may not regress beyond the frozen visual tolerance.

Outputs are written to `stable-regression-out/` by default:

- `index.html` — top-level pass/fail dashboard
- `stable-results.json` — machine-readable summary
- `sample/` — sample baseline artifacts
- `structure/` — structural suite report and page screenshots
- `pdf/` — Hancom direct-PDF report, raw comparisons, overlays and diffs

## PASS meaning

A stable PASS does **not** mean pixel-identical to Hancom. It means the renderer remains within the accepted frozen baseline for this project. Any deliberate renderer change should be evaluated first; only after review should `tests/stable_baseline.json` be updated.

## Baseline policy

Do not update `tests/stable_baseline.json` just to make a failure green. A baseline change is appropriate only when a renderer change is intentional and its visual output has been reviewed against Hancom's direct PDF output.


## Real-world gate (v35)

The stable gate also runs `tests/real-world/conference-template.hwpx` against the Hancom direct-PDF reference. It checks page/header/footer/title/mixed-object/floating-frame/equation invariants and guards page-level MAE/SSIM/RGB metrics. This keeps real-document coverage separate from the 10 synthetic feature fixtures.

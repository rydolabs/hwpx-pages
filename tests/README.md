# Regression fixture set

These fixtures were selected from the user-provided `python-hwpx-main.zip`, mainly from
`tests/fixtures/hancom_saved`. Their expected page counts come from that project's
`tests/test_layout_page_estimate.py` (`HANCOM_PAGES`), which documents Hancom-laid-out
page counts from saved line caches.

Run:

```bash
python scripts/regression_suite.py
```

Outputs go to `regression-suite-out/`:

- `index.html`: visual dashboard
- `results.json`: machine-readable status
- `<case>/page-N.png`: our Chromium-rendered pages
- when a fixture contains `Preview/PrvImage.png`: `reference.png`, `compare.png`,
  `overlay.png`, `diff.png` and MAE/SSIM metrics are generated automatically.

A PASS currently means expected Hancom page count matches our rendered page count and
there are no browser/console errors. Pixel similarity is evaluated only when a trusted
reference image is present.


## v13 added case

- `columns-unequal.hwpx`: explicit unequal `colSz` widths/gaps from Hancom-saved `pages_columns_unequal_narrow_first.hwpx`; expected 4 pages.

This case currently has no PDF pixel oracle, so PASS checks Hancom page count and browser errors only.

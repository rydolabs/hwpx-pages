# Real-world regression corpus

## conference-template

Source pair supplied from Hancom HWPX + direct PDF output.

This case covers renderer behavior that the synthetic/stable 10-case suite did not cover:

- `PAGE`-relative floating layout-frame tables (distinct from `PAPER` coordinates)
- one-row layout tables whose `cellSz.height` is stale while `tbl/sz.height` and line cache are authoritative
- text and a floating table in the same paragraph
- section header/footer controls, including a right tab header and page auto-number footer
- paragraph hanging-indent geometry from `paraPr/margin/intent`, including cached lineSeg interaction
- `hp:equation` basic Hancom equation script rendering (fraction/sqrt/superscript used by this case)

Run `python scripts/real_world_regression.py`.

# Layout coordinate audit — v40

The renderer must not accumulate per-document position tweaks. This audit classifies the remaining compatibility calibrations by ablation against Hancom direct-PDF references.

## Coordinate model

Body/line positions are derived from page origin, column origin, paragraph margins/intent, and cached lineSeg geometry. Floating objects resolve their explicit PAGE/PAPER/COLUMN/PARA reference frame independently.

## Retained compatibility rules

The following rules remain because removing them caused a measurable regression in an existing direct-PDF fixture:

- 2022 body-left origin when a document reserves a header band but has no explicit header control.
- PAPER X/Y origin calibration used by the paper-relative shape fixture.
- header-band top-origin calibration for direct-PDF layout.
- long CELL-break table half-pixel border/grid nudge.
- single-column body font scale/spacing calibration.
- Hwp 2018 multi-column font scale.
- body text subpixel X calibration.
- Hwp 2018 picture Y calibration (small but reference-positive; retained conservatively).

All retained values live in one `HANCOM_COMPAT` profile. Layout code must not introduce new anonymous document-specific constants.

## Removed rule

The Hwp 2018 multi-column `-5` letter-spacing bias was removed. Ablation improved the `columns-unequal` direct-PDF result instead of degrading it.

Before: MAE ~10.53, SSIM ~0.7525.
After: MAE ~10.13, SSIM ~0.7641.

## Change policy

A new calibration may be added only when:

1. the behavior is explained by a format/layout context rather than a document string or file identity;
2. at least one regression fixture demonstrates the need; and
3. the full stable gate passes after the change.

# Release readiness — 0.9.0-rc.1

## Ready

- Browser renderer regression-locked against sample, 10 structural fixtures, 10 Hancom direct-PDF fixtures, and one Hancom-authored real-world HWPX/PDF pair.
- Defensive ZIP limits and central/local-record bounds checks are enabled for renderer, Diff parser, and Track Changes parser.
- Character styling uses DOM style properties rather than interpolating HWPX metadata into HTML attributes.
- React entry is safe to import during SSR; rendering is client-only.
- Unified `HwpxViewer.open()` remains the default public API.

## Intentional release blockers for public npm registry

1. Package identity: `@local/hwpx-viewer` is a placeholder.
2. License: `UNLICENSED` is a placeholder and requires an owner decision.
3. Real Hancom Track Changes corpus is not yet available; synthetic Track Changes regression passes, but the real-corpus test remains SKIP.

These blockers do not prevent application bundling, CDN/private beta distribution, or internal deployment.

## Security defaults

The browser ZIP reader rejects uploads that exceed internal limits for compressed file size, entry count, single-entry uncompressed size, aggregate uncompressed size, compression ratio, unsupported ZIP methods/ZIP64, and invalid record bounds. These defaults are intentionally not exposed in the basic user-facing API.

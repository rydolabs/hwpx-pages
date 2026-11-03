# Release candidate checklist

## Automated gates

Run:

```bash
python scripts/release_gate.py
```

The gate covers:

- locked renderer bytes
- logical-stream tests
- sample baseline
- 10 structural fixtures
- 10 Hancom direct-PDF fixtures and visual thresholds
- real-world conference-template HWPX/PDF pair
- Diff / Track Changes / Viewer / React integration
- malformed and resource-abusive ZIP rejection
- malicious font metadata HTML/style-boundary test
- React SSR-safe import test
- npm package dry-run

## Publisher decisions still required before public npm publish

The repository intentionally keeps `private: true` and the placeholder package name `@local/hwpx-viewer` until the publisher chooses:

1. final npm package name / scope
2. software license and `LICENSE` text
3. repository / homepage metadata

Those are publishing/legal identity decisions, not renderer implementation details.

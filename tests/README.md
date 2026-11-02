# Tests

Release regression corpus and assertions.

Planned layout:

```text
tests/
├─ fixtures/        # synthetic HWPX feature fixtures
├─ reference-pdf/   # Hancom direct-PDF references
├─ real-world/      # paired real HWPX/PDF documents
└─ baselines/       # approved visual/metric baselines
```

Test assets are excluded from the npm package.

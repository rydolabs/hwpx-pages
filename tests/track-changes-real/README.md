# Real Hancom Track Changes corpus

Put HWPX files saved directly by Hancom with Track Changes enabled in this directory.

These files are intentionally separate from `tests/track-changes/`, which contains synthetic fixtures used for deterministic unit/smoke tests.

Run:

```bash
python scripts/track_changes_real_smoke.py
```

When this directory has no `.hwpx` files, the command reports `SKIP` rather than pretending that real-Hancom validation has occurred.

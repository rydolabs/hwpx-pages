# Track Changes tests (v23)

These fixtures verify the optional `hwpx-track-changes.js` adapter while keeping `hwpx-preview.js` unchanged.

- `insert-old/new.hwpx`: one tracked insertion.
- `delete-old/new.hwpx`: one tracked deletion.
- `replace-old/new.hwpx`: adjacent Delete + Insert is normalized to one modify change.
- `hybrid-old/new.hwpx`: tracked insertion in paragraph 1 plus ordinary untracked edit in paragraph 2; expected output is one `tracked-change` and one `structural-diff`.

Run:

```bash
python scripts/check_renderer_unchanged.py
python scripts/track_changes_smoke.py
python scripts/diff_smoke.py
python scripts/regression_suite.py
python scripts/regression_pdf_suite.py
```

`scripts/make_track_change_fixtures.py` can regenerate the fixtures when `python-hwpx >= 6` is installed. The committed fixtures mean normal smoke tests do not depend on that package.

## Real Hancom corpus (v32)

Synthetic fixtures are useful for deterministic coverage but are not treated as proof that every Hancom-generated revision form is supported. Drop files saved directly by Hancom with Track Changes enabled into `tests/track-changes-real/` and run:

```bash
python scripts/track_changes_real_smoke.py
```

The real-corpus runner reports `SKIP` when no real files are present. `scripts/track_changes_inspect.py` can also inspect marker counts, author metadata, and raw revision types without involving the renderer.

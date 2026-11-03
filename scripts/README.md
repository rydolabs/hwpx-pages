# Scripts

CI/development scripts only; they are excluded from the npm package.

- `build_viewer_bundle.py` — generate `dist/` from source.
- `stable_regression.py` — official layout/visual stable gate.
- `integration_regression.py` — viewer/diff/Track Changes/React/security integration checks.
- `release_security_smoke.py` — hostile/malformed HWPX input checks.
- `release_gate.py` — build + stable + integration + package validation.

Run the same command used by GitHub Actions:

```bash
python scripts/release_gate.py
```

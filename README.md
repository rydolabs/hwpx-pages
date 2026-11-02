# hwpx-pages

Browser-first HWPX renderer with optional document comparison and React support.

## Usage goals

- Default users: one `HwpxViewer` API.
- Advanced users: optional diff / Track Changes / rendering controls.
- Vanilla and React use the same renderer core.
- Renderer changes must pass the stable regression suite.

## Repository layout

```text
hwpx-pages/
├─ src/                 # renderer + viewer + diff implementation
├─ react/               # thin React adapter (same core renderer)
├─ styles/              # viewer/diff styles
├─ dist/                # generated browser/npm release artifacts
├─ examples/            # minimal browser and React examples
├─ tests/               # fixtures, reference PDFs, real-world regression
├─ tools/               # regression/build/release scripts
├─ docs/                # architecture, compatibility, release notes
├─ package.json
├─ README.md
├─ SECURITY.md
└─ .gitignore
```

`dist/` is generated. Source changes belong in `src/`, `react/`, or `styles/`.

## Release policy

A release candidate is accepted only when the stable gate passes:

- sample baseline
- structural fixtures
- Hancom direct-PDF fixtures
- real-world fixtures
- logical-stream tests
- viewer / diff / React integration
- malformed / hostile HWPX security tests

See `docs/ARCHITECTURE.md` for module boundaries.

# Architecture

## Public API

The public surface is intentionally small:

```js
HwpxViewer.open(file, container)
HwpxViewer.open(modifiedFile, container, { compareWith: originalFile })
```

React is a lifecycle adapter over the same core, not a second renderer.

## Boundaries

- `src/hwpx-preview.js` — stable HWPX parse/layout/render core.
- `src/hwpx-viewer.js` — unified high-level API.
- `src/hwpx-diff.js` — structural diff engine.
- `src/hwpx-track-changes.js` — tracked-revision parser.
- `src/hwpx-diff-ui.js` — review UI behavior.
- `styles/` — presentation only.
- `react/` — React lifecycle/SSR-safe adapter.
- `dist/` — generated output; never source of truth.

## Compatibility rule

Do not add document-specific coordinate tuning. A compatibility rule must be explained by the HWPX/layout model, covered by a fixture, and pass the full stable gate.

# Architecture

## Public surface

The default public API is intentionally small:

```js
HwpxViewer.open(file, container)
HwpxViewer.open(modifiedFile, container, { compareWith: originalFile })
```

React is a thin adapter over the same viewer core.

## Module boundaries

- `src/hwpx-preview.js`: HWPX parse/layout/render core.
- `src/hwpx-viewer.js`: unified high-level API.
- `src/hwpx-diff.js`: structural comparison.
- `src/hwpx-track-changes.js`: HWPX tracked-revision parsing.
- `src/hwpx-diff-ui.js`: review UI behavior.
- `styles/`: visual presentation only.
- `react/`: lifecycle adapter only; no second renderer.

## Compatibility rule

Do not add document-specific coordinate tuning.

A renderer compatibility rule is accepted only when it is explained by the HWPX/layout model, covered by a fixture, and passes the full stable regression gate.

## Generated output

`dist/` is generated from source and should not become the source of truth.

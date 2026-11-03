# hwpx-pages

Browser-first HWPX renderer with optional document comparison and React support.

## Basic usage

```js
const viewer = await HwpxViewer.open(file, container);
```

Compare two HWPX files with one extra option:

```js
const viewer = await HwpxViewer.open(modifiedFile, container, {
  compareWith: originalFile
});
```

React uses the same renderer core:

```jsx
import { HwpxViewer } from '@rydolabs/hwpx-pages/react';
import '@rydolabs/hwpx-pages/styles';

<HwpxViewer file={file} />
```

## Repository layout

```text
src/       renderer, viewer, diff and Track Changes source
react/     thin React adapter (same renderer core)
styles/    viewer/review styles
dist/      generated release artifacts
examples/  minimal browser/React usage examples
tests/     synthetic, Hancom PDF, real-world and Track Changes regression corpus
scripts/   build, regression, security and release-gate scripts
docs/      architecture and compatibility notes
```

The default API is intentionally small. Advanced diff/Track Changes controls remain available through options and low-level modules.

## Development

```bash
python -m pip install -r requirements-dev.txt
playwright install chromium
npm run build
npm test
```

`npm test` runs the release gate: stable visual/layout regression, integration checks, security checks, React SSR import, and package validation.

## Release policy

Renderer/layout changes are accepted only when the full stable gate passes. Document-specific coordinate tuning is not accepted without a format/layout explanation and regression fixture.

The package remains `private: true` and `UNLICENSED` until the public npm name/license decision is finalized.

## CI and merge policy

Pull requests must pass the full GitHub Actions release gate before merging. See [CI and merge policy](docs/CI_AND_MERGE.md).

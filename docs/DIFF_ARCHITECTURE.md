# HWPX Diff extension (v22)

The diff feature is intentionally isolated from the renderer.

## Files
- `hwpx-preview.js`: existing renderer; unchanged from v21.
- `hwpx-diff.js`: standalone HWPX semantic parser + hierarchical diff + inline diff renderer.
- `diff-demo.html`: UI using `[변경사항] [원본 ↔ 수정본]`; side-by-side reuses `renderHwpx()` without modifying it.

## Model
`HwpxDiff.parse(arrayBuffer)` returns a format-neutral-ish HWPX model with sections and top-level blocks.
- paragraph block: `ref`, section/paragraph indexes, text, object kinds
- table block: rows/cells with stable refs based on section/paragraph/table/row/cell indexes

`HwpxDiff.diff(oldBuffer,newBuffer)` returns:
- `items`: aligned blocks including equal blocks
- `changes`: insert/delete/modify only
- `summary`: total/added/deleted/modified
- paragraph changes contain token-level inline diff
- table changes contain row/cell-level changes and token-level cell diffs

## Compatibility rule
Do not add diff-only attributes, wrappers, highlights, or event handlers inside `hwpx-preview.js`.
If precise side-by-side change navigation is needed later, implement it with an optional adapter layer that maps model refs to rendered DOM after render. Do not make the renderer depend on the diff engine.

## Current limitations
- Block matching is semantic/fuzzy but does not yet detect moved paragraphs as `move`.
- Table row/cell matching is positional after a table block is matched; inserted rows can cause cascaded changes.
- Style-only changes and object-property changes are not yet emitted as first-class changes.
- The inline Changes view is semantic and intentionally not a pixel-faithful HWPX page. Pixel-faithful output remains the job of `hwpx-preview.js`.

## Track Changes adapter (v23)

`hwpx-track-changes.js` is an optional layer loaded after `hwpx-diff.js`.
It does **not** modify or depend on `hwpx-preview.js`.

- Reads `Contents/header.xml` `trackChanges` / `trackChangeAuthors` metadata.
- Reads `insertBegin/insertEnd` and `deleteBegin/deleteEnd` markers from `hp:t` mixed content.
- Normalizes tracked insert/delete into the same change shape used by the UI.
- Adjacent tracked Delete + Insert at the same text boundary is emitted as one `modify` change.
- Hybrid mode removes the whole-paragraph structural duplicate for a paragraph/cell covered by tracked changes, while retaining structural changes in untouched blocks.
- If a document contains no tracked-change markers, behavior falls back to the existing `HwpxDiff.diff()` result.

Compatibility invariant: `hwpx-preview.js` must stay byte-for-byte unchanged while this adapter is developed. Renderer regression tests remain a hard gate.


## Optional Diff presentation layer (v24)

The presentation layer is also isolated from both the renderer and the diff engines.

- `hwpx-diff-ui.js`: applies presentation options to an existing `DiffResult`.
- `hwpx-diff-theme.css`: optional themes and CSS custom properties.
- `hwpx-diff.js`: semantic/structural diff engine; unchanged by the theme work.
- `hwpx-track-changes.js`: Track Changes adapter; unchanged by the theme work.
- `hwpx-preview.js`: renderer; remains byte-for-byte unchanged.

Themes:
- `default`: colored insert/delete marks.
- `minimal`: no fill colors; underline/strike and subtle card edge only.
- `review`: stronger review marks.
- `none`: keeps semantic diff DOM but removes insert/delete visual styling.
- custom appearance: override CSS variables through `appearance`.

Example:

```js
HwpxDiffUI.render(diff, container, {
  theme: 'minimal',
  behavior: {
    showInsert: true,
    showDelete: true,
    showModify: true,
    showAuthor: true,
    showTimestamp: false
  },
  appearance: {
    insertBg: '#e8f7ff',
    deleteBg: '#fff0d8',
    insertLine: '#1683a8'
  }
});
```

`behavior` changes only the Diff UI. It never adds styles, attributes, wrappers, or handlers to `.hwpx-page` or any renderer-owned DOM.

Compatibility invariant remains unchanged: disabling or omitting the Diff UI layer produces the same renderer output as before.

## v25 presentation-only options

`HwpxDiffUI` remains an optional layer above `HwpxDiff` / `HwpxTrackChanges` and never targets `.hwpx-page`.

New presentation controls:

- deterministic author accent colors (`colorByAuthor`), with `authorColors` override map
- change-type marker pills (`showMarkers`) for insert/delete/modify
- live presentation updates via `HwpxDiffUI.update(diff, container, options)`; this re-decorates existing cards without rebuilding their body DOM
- existing themes (`default`, `minimal`, `review`, `none`) continue to work

Example:

```js
HwpxDiffUI.render(diff, el, {
  theme: 'review',
  behavior: {
    showAuthor: true,
    showTimestamp: false,
    showMarkers: true,
    colorByAuthor: true
  },
  authorColors: {
    'Alice': '#7c3aed'
  }
});

// Later, live switch appearance without recomputing the diff:
HwpxDiffUI.update(diff, el, {
  theme: 'minimal',
  behavior: { showMarkers: false, colorByAuthor: false }
});
```

## Unified public surface (v27)

The renderer, semantic diff, Track Changes parser, and presentation layer remain separate internally, but they are no longer separate concepts a normal integrator needs to learn.

- Default browser entry point: `HwpxViewer.open(file, container, options?)`
- Compare: add only `compareWith: originalFile`
- Automatic compare policy: prefer Track Changes; structural diff fills untouched areas
- Default visible change taxonomy: insert / delete / modify only
- Advanced controls: nested under `advanced`, while the pre-v27 low-level globals remain available for expert use and compatibility
- React: one `<HwpxViewer>` component that delegates rendering/comparison to the same unified browser API

This boundary intentionally keeps `hwpx-preview.js` independent. No diff or React code is inserted into renderer-owned DOM during ordinary document rendering.

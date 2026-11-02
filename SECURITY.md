# Security

HWPX files are ZIP-based, user-controlled input.

The parser must enforce limits for:

- input file size
- entry count
- per-entry inflated size
- total inflated size
- compression ratio
- ZIP offsets and supported compression methods

Document-provided text and metadata must not be inserted into HTML through unsafe string concatenation.

If a parsing or rendering limit is exceeded, fail closed with a user-visible error rather than attempting partial unsafe decompression.

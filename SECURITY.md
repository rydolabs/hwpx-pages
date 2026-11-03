# Security and untrusted HWPX input

The browser viewer treats HWPX as untrusted ZIP/XML input.

Default ZIP safety limits:

- input file: 64 MiB
- ZIP entries: 4096
- single uncompressed entry: 64 MiB
- total declared uncompressed size: 256 MiB
- compression ratio: 1000:1
- ZIP64: rejected
- out-of-bounds central/local directory records: rejected
- compression methods other than store/deflate: rejected

Document text is inserted with `textContent`. Character formatting is applied through DOM style properties rather than interpolating HWPX metadata into HTML attributes.

These browser limits reduce accidental and malicious resource exhaustion, but they do not make the viewer a sandbox for arbitrary active content. OLE and executable embedded content are not executed.

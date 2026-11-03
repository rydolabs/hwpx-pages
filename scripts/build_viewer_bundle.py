#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parts=[
  ROOT/'src/hwpx-preview.js',
  ROOT/'src/hwpx-diff.js',
  ROOT/'src/hwpx-track-changes.js',
  ROOT/'src/hwpx-diff-ui.js',
  ROOT/'src/hwpx-viewer.js',
]
dist=ROOT/'dist'; dist.mkdir(parents=True,exist_ok=True)
out=dist/'hwpx-viewer.bundle.js'
header='/* Generated bundle: stable renderer + optional diff layers + unified API. Do not edit directly. */\n'
out.write_text(header+'\n'.join(p.read_text(encoding='utf-8')+'\n' for p in parts),encoding='utf-8')
(dist/'hwpx-viewer.module.mjs').write_text("// Generated browser ESM entry.\nimport './hwpx-viewer.bundle.js';\nconst api=globalThis.HwpxViewer;\nif(!api) throw new Error('HwpxViewer bundle did not initialize');\nexport const HwpxViewer=api;\nexport default api;\n",encoding='utf-8')
(dist/'hwpx-diff-theme.css').write_text((ROOT/'styles/hwpx-diff-theme.css').read_text(encoding='utf-8'),encoding='utf-8')
print(out)

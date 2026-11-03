import json,sys,pathlib
data=json.loads(pathlib.Path(sys.argv[1]).read_text())
files={f['path'] for f in data[0]['files']}
required={'package.json','README.md','dist/hwpx-viewer.bundle.js','dist/hwpx-viewer.module.mjs','styles/hwpx-diff-theme.css','react/index.mjs','react/index.d.ts'}
forbidden={f for f in files if f.startswith(('src/','tests/','scripts/','tools/','docs/','examples/','.github/','.bootstrap/'))}
missing=required-files
print('package-files:', 'PASS' if not missing and not forbidden else 'FAIL')
print('missing:',sorted(missing),'forbidden:',sorted(forbidden))
raise SystemExit(0 if not missing and not forbidden else 1)

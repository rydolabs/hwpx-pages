#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

MARKERS = ('insertBegin','insertEnd','deleteBegin','deleteEnd')

def lname(tag: str) -> str:
    return tag.rsplit('}',1)[-1]

def inspect(path: Path) -> dict:
    out={"file":str(path),"markers":{k:0 for k in MARKERS},"trackChangeMetadata":0,"authors":0,"rawTypes":[],"sections":0}
    types=[]
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        for name in names:
            if not name.lower().endswith('.xml'): continue
            try: root=ET.fromstring(z.read(name))
            except ET.ParseError: continue
            if name.lower().startswith('contents/section'):
                out['sections'] += 1
            for el in root.iter():
                n=lname(el.tag)
                if n in out['markers']: out['markers'][n]+=1
                elif n=='trackChange':
                    out['trackChangeMetadata'] += 1
                    if el.attrib.get('type'): types.append(el.attrib['type'])
                elif n=='trackChangeAuthor': out['authors'] += 1
    out['rawTypes']=sorted(set(types))
    out['pairedMarkers']=(out['markers']['insertBegin']==out['markers']['insertEnd'] and out['markers']['deleteBegin']==out['markers']['deleteEnd'])
    out['textRevisionCount']=out['markers']['insertBegin']+out['markers']['deleteBegin']
    return out

def main() -> int:
    ap=argparse.ArgumentParser(description='Inspect HWPX Track Changes XML without changing the renderer.')
    ap.add_argument('files', nargs='+', type=Path)
    ap.add_argument('--json', action='store_true')
    args=ap.parse_args()
    rows=[inspect(p) for p in args.files]
    if args.json: print(json.dumps(rows,ensure_ascii=False,indent=2))
    else:
        for r in rows:
            print(f"{r['file']}: revisions={r['textRevisionCount']} metadata={r['trackChangeMetadata']} authors={r['authors']} types={','.join(r['rawTypes']) or '-'} paired={'yes' if r['pairedMarkers'] else 'NO'}")
    return 0 if all(r['pairedMarkers'] for r in rows) else 1

if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
"""Generate small Track Changes HWPX fixtures using python-hwpx >= 6.

This script is optional for reproducibility; committed fixture files are used by smoke tests.
"""
from pathlib import Path
from hwpx import HwpxDocument

OUT=Path(__file__).resolve().parents[1]/'tests'/'track-changes'
DATE='2026-10-07T00:00:00Z'
AUTHOR='Track Tester'

def save(doc,name):
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/name).write_bytes(doc.to_bytes())

def doc_with(*texts):
    d=HwpxDocument.new()
    ps=[]
    for t in texts: ps.append(d.add_paragraph(t,char_pr_id_ref='0'))
    return d,ps

def main():
    # insert
    d,_=doc_with('alpha beta');save(d,'insert-old.hwpx')
    d,ps=doc_with('alpha beta');d.tracking.insert(ps[0],' INSERT',author=AUTHOR,date=DATE);save(d,'insert-new.hwpx')
    # delete
    d,_=doc_with('alpha beta gamma');save(d,'delete-old.hwpx')
    d,ps=doc_with('alpha beta gamma');d.tracking.delete(ps[0],match='beta',author=AUTHOR,date=DATE);save(d,'delete-new.hwpx')
    # replace
    d,_=doc_with('before old after');save(d,'replace-old.hwpx')
    d,ps=doc_with('before old after');d.tracking.replace(ps[0],'old','new',author=AUTHOR,date=DATE);save(d,'replace-new.hwpx')
    # hybrid: tracked change in one paragraph + untracked edit in another.
    d,_=doc_with('alpha beta','second original');save(d,'hybrid-old.hwpx')
    d,ps=doc_with('alpha beta','second modified');d.tracking.insert(ps[0],' INSERT',author=AUTHOR,date=DATE);save(d,'hybrid-new.hwpx')

if __name__=='__main__':main()

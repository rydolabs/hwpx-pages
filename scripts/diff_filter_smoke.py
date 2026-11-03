#!/usr/bin/env python3
from __future__ import annotations
import json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]

def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page(viewport={'width':1100,'height':900})
        page.set_content('<div id="root"></div>')
        page.add_style_tag(path=str(HERE/'styles/hwpx-diff-theme.css'))
        page.add_script_tag(path=str(HERE/'src/hwpx-diff.js'))
        page.add_script_tag(path=str(HERE/'src/hwpx-diff-ui.js'))
        result=page.evaluate('''()=>{
          HwpxDiff.injectDefaultStyles();
          const diff={changes:[
            {id:'c1',type:'insert',blockType:'paragraph',newText:'Alice insert',inline:[{type:'insert',text:'Alice insert'}],author:'Alice'},
            {id:'c2',type:'delete',blockType:'paragraph',oldText:'Bob delete',inline:[{type:'delete',text:'Bob delete'}],author:'Bob'},
            {id:'c3',type:'modify',blockType:'paragraph',oldText:'old',newText:'new',inline:[{type:'delete',text:'old'},{type:'insert',text:'new'}],author:'Alice'},
            {id:'c4',type:'modify',blockType:'paragraph',oldText:'x',newText:'y',inline:[{type:'delete',text:'x'},{type:'insert',text:'y'}],source:'structural-diff'}
          ]};
          const root=document.querySelector('#root');
          HwpxDiffUI.render(diff,root,{theme:'default'});
          const body=root.querySelector('#c1 .hwpx-diff-change-body');
          const bodyHtml=body.innerHTML;
          const authors=HwpxDiffUI.availableAuthors(diff);
          const all=HwpxDiffUI.visibleChanges(diff,{filters:{types:null,authors:null}}).map(x=>x.index);
          HwpxDiffUI.update(diff,root,{filters:{types:['modify'],authors:['Alice']}});
          const onlyAliceModify=[...root.querySelectorAll('.hwpx-diff-change:not([data-diff-filtered="1"])')].map(x=>x.id);
          const visible1=HwpxDiffUI.visibleChanges(diff,{filters:{types:['modify'],authors:['Alice']}}).map(x=>x.index);
          HwpxDiffUI.update(diff,root,{filters:{types:['modify'],authors:['__unattributed__']}});
          const unattributed=[...root.querySelectorAll('.hwpx-diff-change:not([data-diff-filtered="1"])')].map(x=>x.id);
          HwpxDiffUI.update(diff,root,{filters:{types:[],authors:null}});
          const none=root.querySelectorAll('.hwpx-diff-change:not([data-diff-filtered="1"])').length;
          HwpxDiffUI.update(diff,root,{filters:{types:null,authors:null}});
          const restored=root.querySelectorAll('.hwpx-diff-change:not([data-diff-filtered="1"])').length;
          return {authors,all,onlyAliceModify,visible1,unattributed,none,restored,bodySame:body===root.querySelector('#c1 .hwpx-diff-change-body')&&bodyHtml===body.innerHTML,visibleCount:root.dataset.diffVisibleCount,version:HwpxDiffUI.version};
        }''')
        browser.close()
    ok=(result['all']==[0,1,2,3] and result['onlyAliceModify']==['c3'] and result['visible1']==[2]
        and result['unattributed']==['c4'] and result['none']==0 and result['restored']==4
        and result['bodySame'] and result['visibleCount']=='4' and result['version']=='0.5.0'
        and result['authors']==[{'key':'Alice','label':'Alice'},{'key':'Bob','label':'Bob'},{'key':'__unattributed__','label':'작성자 없음'}])
    print(json.dumps(result,ensure_ascii=False,indent=2))
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1

if __name__=='__main__': raise SystemExit(main())

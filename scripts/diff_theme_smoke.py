#!/usr/bin/env python3
from __future__ import annotations
import base64, json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]
FIX=HERE/'tests'/'track-changes'
def b64(p): return base64.b64encode(p.read_bytes()).decode()

def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=exe or None)
        page=browser.new_page(viewport={'width':1200,'height':1000})
        page.set_content('<div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div><div id="multi"></div>')
        page.add_style_tag(path=str(HERE/'styles/hwpx-diff-theme.css'))
        page.add_script_tag(path=str(HERE/'src/hwpx-diff.js'))
        page.add_script_tag(path=str(HERE/'src/hwpx-track-changes.js'))
        page.add_script_tag(path=str(HERE/'src/hwpx-diff-ui.js'))
        result=page.evaluate('''async ({o,n})=>{
          const dec=x=>{const s=atob(x),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer};
          const d=await HwpxTrackChanges.diff(dec(o),dec(n));
          HwpxDiff.injectDefaultStyles();
          HwpxDiffUI.render(d,document.querySelector('#a'),{theme:'default',behavior:{showAuthor:true,showTimestamp:true,showMarkers:true,colorByAuthor:true}});
          HwpxDiffUI.render(d,document.querySelector('#b'),{theme:'minimal',behavior:{showTimestamp:false}});
          HwpxDiffUI.render(d,document.querySelector('#c'),{theme:'review',appearance:{insertBg:'#dff7ff',deleteBg:'#fff0c9'}});
          HwpxDiffUI.render(d,document.querySelector('#d'),{theme:'none',behavior:{showAuthor:false,showTimestamp:false,showMarkers:false,colorByAuthor:false}});
          const multi={changes:[
            {id:'m1',type:'insert',blockType:'paragraph',newText:'A',inline:[{type:'insert',text:'A'}],author:'Alice',date:'2026-01-01'},
            {id:'m2',type:'delete',blockType:'paragraph',oldText:'B',inline:[{type:'delete',text:'B'}],author:'Bob',date:'2026-01-02'},
            {id:'m3',type:'modify',blockType:'paragraph',oldText:'C',newText:'D',inline:[{type:'delete',text:'C'},{type:'insert',text:'D'}],source:'structural-diff'}
          ]};
          HwpxDiffUI.render(multi,document.querySelector('#multi'),{theme:'default',behavior:{showAuthor:true,showTimestamp:true,showMarkers:true,colorByAuthor:true},authorColors:{Alice:'#123456'}});
          const multiCards=[...document.querySelectorAll('#multi .hwpx-diff-change')];
          const bodyBefore=multiCards[0].querySelector('.hwpx-diff-change-body');
          const htmlBefore=bodyBefore.innerHTML;
          const multiColoredBefore=multiCards.map(x=>x.dataset.diffAuthorColored||'0');
          HwpxDiffUI.update(multi,document.querySelector('#multi'),{theme:'review',behavior:{showMarkers:false,colorByAuthor:false}});
          return {
            themes:['a','b','c','d'].map(id=>document.querySelector('#'+id).dataset.diffTheme),
            cards:['a','b','c','d'].map(id=>document.querySelectorAll('#'+id+' .hwpx-diff-change').length),
            metaA:document.querySelectorAll('#a .hwpx-diff-meta').length,
            metaD:document.querySelectorAll('#d .hwpx-diff-meta').length,
            markersA:document.querySelectorAll('#a .hwpx-diff-marker').length,
            markersD:document.querySelectorAll('#d .hwpx-diff-marker').length,
            customC:getComputedStyle(document.querySelector('#c')).getPropertyValue('--hwpx-diff-insert-bg').trim(),
            authorOverride:HwpxDiffUI.authorColor('Alice',{authorColors:{Alice:'#123456'}}),
            authorStable:[HwpxDiffUI.authorColor('Bob'),HwpxDiffUI.authorColor('Bob')],
            authorDifferent:HwpxDiffUI.authorColor('Alice')!==HwpxDiffUI.authorColor('Bob'),
            multiColored:multiColoredBefore,
            liveTheme:document.querySelector('#multi').dataset.diffTheme,
            liveMarkers:document.querySelectorAll('#multi .hwpx-diff-marker').length,
            liveColored:document.querySelectorAll('#multi [data-diff-author-colored="1"]').length,
            bodySame:bodyBefore===multiCards[0].querySelector('.hwpx-diff-change-body') && htmlBefore===bodyBefore.innerHTML,
            version:HwpxDiffUI.version
          };
        }''',{'o':b64(FIX/'hybrid-old.hwpx'),'n':b64(FIX/'hybrid-new.hwpx')})
        browser.close()
    ok=(result['themes']==['default','minimal','review','none']
        and len(set(result['cards']))==1 and result['cards'][0]==2
        and result['metaA']>=1 and result['metaD']==0
        and result['markersA']==2 and result['markersD']==0
        and result['customC']=='#dff7ff'
        and result['authorOverride']=='#123456'
        and result['authorStable'][0]==result['authorStable'][1]
        and result['authorDifferent']
        and result['multiColored']==['1','1','0']
        and result['liveTheme']=='review' and result['liveMarkers']==0 and result['liveColored']==0
        and result['bodySame'] and result['version']=='0.5.0')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1
if __name__=='__main__': raise SystemExit(main())

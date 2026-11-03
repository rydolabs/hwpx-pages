(function(global){
'use strict';

const PUBLIC_DEFAULTS={
  view:'changes',
  theme:'clean',
  showAuthor:false,
  filter:'all'
};

async function toArrayBuffer(input){
  if(input==null) throw new Error('HWPX file is required');
  if(input instanceof ArrayBuffer) return input;
  if(ArrayBuffer.isView(input)) return input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
  if(typeof Blob!=='undefined' && input instanceof Blob) return await input.arrayBuffer();
  if(typeof input.arrayBuffer==='function') return await input.arrayBuffer();
  throw new TypeError('Expected File, Blob, ArrayBuffer, or typed array');
}

function normalizeOptions(options={}){
  const a=options.advanced||{};
  const filter=options.filter??PUBLIC_DEFAULTS.filter;
  const types=filter==='all'||filter==null?null:(Array.isArray(filter)?filter:[filter]);
  return {
    compareWith:options.compareWith??null,
    view:options.view||PUBLIC_DEFAULTS.view,
    theme:options.theme||PUBLIC_DEFAULTS.theme,
    showAuthor:options.showAuthor===true,
    render:{
      targetWidth:options.targetWidth??a.render?.targetWidth,
      hancomCompat:options.hancomCompat??a.render?.hancomCompat,
      matchEmbeddedPreview:a.render?.matchEmbeddedPreview
    },
    diff:{
      trackedChanges:a.trackedChanges||'prefer',
      structuralFallback:a.structuralFallback!==false
    },
    ui:{
      behavior:{
        showAuthor:options.showAuthor===true,
        showTimestamp:a.showTimestamp===true,
        showMarkers:a.showMarkers===true,
        colorByAuthor:a.colorByAuthor===true,
        ...(a.behavior||{})
      },
      filters:{
        types:a.filters?.types??types,
        authors:a.filters?.authors??null
      },
      appearance:a.appearance||{},
      authorColors:a.authorColors||{}
    }
  };
}
function cleanRenderOptions(r){
  const out={};
  for(const [k,v] of Object.entries(r||{})) if(v!==undefined) out[k]=v;
  return out;
}
function uiOptions(o){return {theme:o.theme,...o.ui};}

async function createDiff(oldBuf,newBuf,o){
  const mode=o.diff.trackedChanges;
  if(mode!=='ignore' && global.HwpxTrackChanges?.diff){
    const result=await global.HwpxTrackChanges.diff(oldBuf,newBuf,{structuralFallback:o.diff.structuralFallback});
    if(mode==='only' && result.trackChanges){
      const tracked=(result.changes||[]).filter(c=>c.source==='tracked-change');
      return {...result,changes:tracked,summary:summarize(tracked),mode:'tracked-only'};
    }
    return result;
  }
  if(!global.HwpxDiff?.diff) throw new Error('HwpxDiff is required for compare mode');
  return global.HwpxDiff.diff(oldBuf,newBuf);
}
function summarize(changes){let added=0,deleted=0,modified=0;for(const c of changes||[]){if(c.type==='insert')added++;else if(c.type==='delete')deleted++;else modified++;}return {total:(changes||[]).length,added,deleted,modified};}

function makeShell(container){
  container.replaceChildren();
  const root=document.createElement('div');root.className='hwpx-viewer';
  const toolbar=document.createElement('div');toolbar.className='hwpx-viewer-toolbar';
  const summary=document.createElement('div');summary.className='hwpx-viewer-summary';
  const title=document.createElement('strong');title.textContent='변경사항';
  const count=document.createElement('span');count.className='hwpx-viewer-count';
  summary.append(title,count);
  const actions=document.createElement('div');actions.className='hwpx-viewer-actions';
  const prev=document.createElement('button');prev.type='button';prev.className='hwpx-viewer-icon-button';prev.setAttribute('aria-label','이전 변경');prev.textContent='‹';
  const next=document.createElement('button');next.type='button';next.className='hwpx-viewer-icon-button';next.setAttribute('aria-label','다음 변경');next.textContent='›';
  const view=document.createElement('button');view.type='button';view.className='hwpx-viewer-text-button';view.textContent='원본 ↔ 수정본';
  const filter=document.createElement('details');filter.className='hwpx-viewer-filter';
  const filterSummary=document.createElement('summary');filterSummary.textContent='필터';filter.append(filterSummary);
  const menu=document.createElement('div');menu.className='hwpx-viewer-filter-menu';
  for(const [value,label] of [['insert','추가'],['delete','삭제'],['modify','수정']]){const lab=document.createElement('label');const cb=document.createElement('input');cb.type='checkbox';cb.value=value;cb.checked=true;lab.append(cb,document.createTextNode(label));menu.append(lab);}
  filter.append(menu);actions.append(prev,next,view,filter);toolbar.append(summary,actions);
  const changes=document.createElement('div');changes.className='hwpx-viewer-changes';
  const side=document.createElement('div');side.className='hwpx-viewer-side';side.hidden=true;
  const oldPane=document.createElement('div');oldPane.className='hwpx-viewer-pane hwpx-viewer-original';
  const newPane=document.createElement('div');newPane.className='hwpx-viewer-pane hwpx-viewer-modified';
  side.append(oldPane,newPane);root.append(toolbar,changes,side);container.append(root);
  return {root,toolbar,summary,count,actions,prev,next,view,filter,menu,changes,side,oldPane,newPane};
}

async function open(file,container,options={}){
  if(!container) throw new Error('container is required');
  const o=normalizeOptions(options),newBuf=await toArrayBuffer(file);
  let destroyed=false,viewer=null,oldViewer=null,newViewer=null,diff=null,current=-1;

  if(!o.compareWith){
    container.replaceChildren();
    viewer=await global.renderHwpx(newBuf,container,cleanRenderOptions(o.render));
    return {
      mode:'document',viewer,
      destroy(){if(destroyed)return;destroyed=true;viewer?.destroy?.();container.replaceChildren();},
      advanced:{get renderer(){return viewer;}}
    };
  }

  const oldBuf=await toArrayBuffer(o.compareWith),shell=makeShell(container);
  diff=await createDiff(oldBuf,newBuf,o);

  function renderChanges(){
    if(global.HwpxDiffUI?.render) global.HwpxDiffUI.render(diff,shell.changes,uiOptions(o));
    else global.HwpxDiff.renderChanges(diff,shell.changes);
  }
  renderChanges();

  async function ensureSide(){
    if(oldViewer&&newViewer)return;
    oldViewer=await global.renderHwpx(oldBuf,shell.oldPane,cleanRenderOptions(o.render));
    newViewer=await global.renderHwpx(newBuf,shell.newPane,cleanRenderOptions(o.render));
  }
  async function setView(view){
    o.view=view==='side-by-side'?'side-by-side':'changes';
    if(o.view==='side-by-side') await ensureSide();
    shell.changes.hidden=o.view!=='changes';shell.side.hidden=o.view!=='side-by-side';
    return o.view;
  }
  function visible(){return global.HwpxDiffUI?.visibleChanges?global.HwpxDiffUI.visibleChanges(diff,uiOptions(o)):(diff.changes||[]).map((change,index)=>({change,index}));}
  function focusIndex(index){
    current=index;
    for(const card of shell.changes.querySelectorAll('.hwpx-diff-change')) card.classList.toggle('hwpx-diff-selected',card.id===diff.changes[index]?.id);
    const el=diff.changes[index]?.id?shell.changes.querySelector('#'+CSS.escape(diff.changes[index].id)):null;
    el?.scrollIntoView?.({block:'nearest'});
    return diff.changes[index]||null;
  }
  function reviewLabel(type){return type==='insert'?'Inserted':type==='delete'?'Deleted':'Modified';}
  function changePreview(change){
    const oldText=String(change?.oldText||'').trim(),newText=String(change?.newText||'').trim();
    if(change?.type==='insert') return newText;
    if(change?.type==='delete') return oldText;
    if(oldText&&newText&&oldText!==newText) return oldText+' → '+newText;
    return newText||oldText;
  }
  function hideReviewNote(){
    for(const note of shell.changes.querySelectorAll('.hwpx-viewer-review-note')) note.remove();
  }
  function showReviewNote(change,card){
    hideReviewNote();
    if(!change||!card)return;
    const note=document.createElement('div');note.className='hwpx-viewer-review-note';note.setAttribute('role','note');note.setAttribute('aria-live','polite');
    const title=document.createElement('strong');title.className='hwpx-viewer-review-note-title';title.textContent=reviewLabel(change.type);
    note.append(title);
    const metaBits=[change.author,change.date].filter(Boolean);
    if(metaBits.length){const meta=document.createElement('div');meta.className='hwpx-viewer-review-note-meta';meta.textContent=metaBits.join(' · ');note.append(meta);}
    const preview=changePreview(change);
    if(preview){const body=document.createElement('div');body.className='hwpx-viewer-review-note-body';body.textContent=preview;note.append(body);}
    card.append(note);
  }
  function move(delta){
    const list=visible();if(!list.length)return null;
    let pos=list.findIndex(x=>x.index===current);pos=(pos<0?(delta>0?-1:0):pos)+delta;pos=(pos%list.length+list.length)%list.length;
    return focusIndex(list[pos].index);
  }
  function syncToolbar(){
    const list=visible(); shell.count.textContent=String(list.length);
    shell.view.textContent=o.view==='side-by-side'?'변경사항':'원본 ↔ 수정본';
    for(const cb of shell.menu.querySelectorAll('input[type=checkbox]')) cb.checked=!o.ui.filters.types || o.ui.filters.types.includes(cb.value);
  }
  function setFilter(filter){
    o.ui.filters.types=filter==='all'||filter==null?null:(Array.isArray(filter)?filter:[filter]);
    global.HwpxDiffUI?.update?.(diff,shell.changes,uiOptions(o));current=-1;syncToolbar();return visible().map(x=>x.change);
  }
  function setTheme(theme){o.theme=theme||'clean';global.HwpxDiffUI?.update?.(diff,shell.changes,uiOptions(o));return o.theme;}

  shell.prev.onclick=()=>move(-1);shell.next.onclick=()=>move(1);
  shell.view.onclick=()=>setView(o.view==='changes'?'side-by-side':'changes').then(syncToolbar);
  shell.menu.onchange=()=>{const selected=[...shell.menu.querySelectorAll('input:checked')].map(x=>x.value);setFilter(selected.length===3?'all':selected);};
  shell.changes.addEventListener('click',e=>{const card=e.target.closest?.('.hwpx-diff-change');if(!card)return;const i=(diff.changes||[]).findIndex(c=>c.id===card.id);if(i>=0){const c=focusIndex(i);showReviewNote(c,card);}});
  const closeReview=e=>{if(!shell.changes.querySelector('.hwpx-viewer-review-note'))return;if(shell.changes.contains(e.target))return;hideReviewNote();};
  const closeReviewKey=e=>{if(e.key==='Escape')hideReviewNote();};
  document.addEventListener('pointerdown',closeReview,true);
  document.addEventListener('keydown',closeReviewKey,true);
  await setView(o.view);syncToolbar();
  return {
    mode:'compare',diff,
    get view(){return o.view;},
    setView,setFilter,setTheme,
    next(){return move(1);},previous(){return move(-1);},
    destroy(){if(destroyed)return;destroyed=true;hideReviewNote();document.removeEventListener('pointerdown',closeReview,true);document.removeEventListener('keydown',closeReviewKey,true);oldViewer?.destroy?.();newViewer?.destroy?.();container.replaceChildren();},
    advanced:{options:o,get originalRenderer(){return oldViewer;},get modifiedRenderer(){return newViewer;},get diffResult(){return diff;},refresh(){global.HwpxDiffUI?.update?.(diff,shell.changes,uiOptions(o));}}
  };
}

global.HwpxViewer={open,normalizeOptions,toArrayBuffer,version:'0.9.0-rc.1',advanced:{diff(oldFile,newFile,options={}){return Promise.all([toArrayBuffer(oldFile),toArrayBuffer(newFile)]).then(([a,b])=>createDiff(a,b,normalizeOptions({...(options||{}),compareWith:a})));}}};
})(window);

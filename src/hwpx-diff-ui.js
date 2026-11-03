(function(global){
'use strict';

const AUTHOR_PALETTE=[
  '#2563eb','#7c3aed','#0891b2','#059669','#ca8a04','#dc2626','#db2777','#4f46e5','#0f766e','#9333ea'
];
const DEFAULTS={
  theme:'clean',
  behavior:{
    showInsert:true,
    showDelete:true,
    showModify:true,
    showAuthor:false,
    showTimestamp:false,
    showMarkers:false,
    colorByAuthor:false
  },
  appearance:{},
  authorColors:{},
  filters:{types:null,authors:null}
};

function mergeOptions(options={}){
  return {
    theme: options.theme || DEFAULTS.theme,
    behavior: {...DEFAULTS.behavior,...(options.behavior||{})},
    appearance: {...DEFAULTS.appearance,...(options.appearance||{})},
    authorColors: {...DEFAULTS.authorColors,...(options.authorColors||{})},
    filters: {
      types: options.filters && Object.prototype.hasOwnProperty.call(options.filters,'types') ? options.filters.types : DEFAULTS.filters.types,
      authors: options.filters && Object.prototype.hasOwnProperty.call(options.filters,'authors') ? options.filters.authors : DEFAULTS.filters.authors
    }
  };
}
function cssVarName(k){
  return '--hwpx-diff-'+String(k).replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
}
function hashText(s){
  let h=2166136261;
  for(const ch of String(s||'')){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}
  return h>>>0;
}
function authorColor(author,options={}){
  const o=mergeOptions(options);
  const key=String(author||'').trim();
  if(!key) return '';
  if(o.authorColors[key]) return o.authorColors[key];
  return AUTHOR_PALETTE[hashText(key)%AUTHOR_PALETTE.length];
}
function apply(container,options={}){
  if(!container) throw new Error('container is required');
  const o=mergeOptions(options);
  container.classList.add('hwpx-diff-ui');
  container.dataset.diffTheme=o.theme;
  for(const [k,v] of Object.entries(o.behavior)) container.dataset['diff'+k[0].toUpperCase()+k.slice(1)]=v?'1':'0';
  for(const [k,v] of Object.entries(o.appearance)){
    if(v==null||v==='') container.style.removeProperty(cssVarName(k));
    else container.style.setProperty(cssVarName(k),String(v));
  }
  return o;
}

function asSet(v){
  if(v==null) return null;
  if(v instanceof Set) return new Set([...v].map(String));
  if(Array.isArray(v)) return new Set(v.map(String));
  return new Set([String(v)]);
}
function authorKey(change){
  const a=String(change?.author||'').trim();
  return a || '__unattributed__';
}
function changeVisible(change,options={}){
  const o=mergeOptions(options),types=asSet(o.filters.types),authors=asSet(o.filters.authors);
  if(types && !types.has(String(change?.type||'modify'))) return false;
  if(authors && !authors.has(authorKey(change))) return false;
  return true;
}
function visibleChanges(diff,options={}){
  const out=[];
  (diff?.changes||[]).forEach((change,index)=>{if(changeVisible(change,options))out.push({change,index});});
  return out;
}
function availableAuthors(diff){
  const seen=new Map();
  for(const c of diff?.changes||[]){const key=authorKey(c);if(!seen.has(key))seen.set(key,key==='__unattributed__'?'작성자 없음':String(c.author).trim());}
  return [...seen].map(([key,label])=>({key,label}));
}
function applyFilters(diff,container,options={}){
  const o=mergeOptions(options);
  const cards=[...container.querySelectorAll('.hwpx-diff-change')];
  cards.forEach((card,i)=>{
    const c=diff?.changes?.[i];
    const visible=!!c && changeVisible(c,o);
    if(visible){card.removeAttribute('data-diff-filtered');card.removeAttribute('aria-hidden');}
    else{card.dataset.diffFiltered='1';card.setAttribute('aria-hidden','true');}
  });
  container.dataset.diffVisibleCount=String(visibleChanges(diff,o).length);
  return o;
}

function metadataText(change,options){
  const b=options.behavior;
  const bits=[];
  if(b.showAuthor && change.author) bits.push(change.author);
  if(b.showTimestamp && change.date) bits.push(change.date);
  return bits.join(' · ');
}
function markerLabel(type){return type==='insert'?'추가':type==='delete'?'삭제':'수정';}
function reviewLabel(type){return type==='insert'?'Inserted':type==='delete'?'Deleted':'Modified';}
function ensureChangeBar(card,change){
  let bar=card.querySelector(':scope > .hwpx-diff-change-bar');
  if(!bar){bar=document.createElement('button');bar.type='button';bar.className='hwpx-diff-change-bar';card.prepend(bar);}
  const label=reviewLabel(change?.type||'modify');
  bar.dataset.changeType=change?.type||'modify';bar.setAttribute('aria-label',label);bar.title=label;
  return bar;
}
function ensureMarker(card,change,options){
  let node=card.querySelector(':scope > .hwpx-diff-change-head .hwpx-diff-marker');
  const head=card.querySelector(':scope > .hwpx-diff-change-head');
  if(!head) return;
  if(!options.behavior.showMarkers){if(node) node.remove();return;}
  if(!node){node=document.createElement('span');node.className='hwpx-diff-marker';head.prepend(node);}
  node.dataset.markerType=change.type||'modify';
  node.textContent=markerLabel(change.type||'modify');
}
function clearAuthorStyle(card){
  card.style.removeProperty('--hwpx-diff-author');
  card.removeAttribute('data-diff-author-colored');
  card.removeAttribute('data-diff-author-key');
}
function applyAuthorStyle(card,change,options){
  clearAuthorStyle(card);
  if(!options.behavior.colorByAuthor || !change.author) return;
  const color=authorColor(change.author,options);
  if(!color) return;
  card.style.setProperty('--hwpx-diff-author',color);
  card.dataset.diffAuthorColored='1';
  card.dataset.diffAuthorKey=String(hashText(change.author));
}
function decorate(diff,container,options={}){
  const o=apply(container,options);
  const cards=[...container.querySelectorAll('.hwpx-diff-change')];
  cards.forEach((card,i)=>{
    const c=diff?.changes?.[i];
    if(!c) return;
    card.dataset.changeSource=c.source||'structural-diff';
    if(c.type) card.dataset.changeType=c.type;
    applyAuthorStyle(card,c,o);
    ensureChangeBar(card,c);
    ensureMarker(card,c,o);
    const meta=metadataText(c,o);
    let node=card.querySelector(':scope > .hwpx-diff-meta');
    if(meta){
      if(!node){node=document.createElement('div');node.className='hwpx-diff-meta';const head=card.querySelector(':scope > .hwpx-diff-change-head');if(head) head.after(node);else card.prepend(node);}
      node.textContent=meta;
    }else if(node) node.remove();
  });
  applyFilters(diff,container,o);
  return o;
}
function render(diff,container,options={}){
  if(!global.HwpxDiff) throw new Error('HwpxDiff must be loaded before HwpxDiffUI');
  global.HwpxDiff.renderChanges(diff,container);
  return decorate(diff,container,options);
}
function update(diff,container,options={}){
  // Presentation-only live update: preserves DiffResult and existing card/body DOM.
  return decorate(diff,container,options);
}
function setTheme(container,theme,appearance){
  const options={theme};
  if(appearance) options.appearance=appearance;
  return apply(container,options);
}
function clear(container){
  if(!container) return;
  delete container.dataset.diffTheme;
  for(const k of Object.keys(DEFAULTS.behavior)) delete container.dataset['diff'+k[0].toUpperCase()+k.slice(1)];
  delete container.dataset.diffVisibleCount;
  [...container.style].filter(x=>x.startsWith('--hwpx-diff-')).forEach(x=>container.style.removeProperty(x));
  for(const card of container.querySelectorAll('.hwpx-diff-change')){
    clearAuthorStyle(card);
    card.querySelector(':scope > .hwpx-diff-change-bar')?.remove();
    card.querySelector(':scope > .hwpx-diff-change-head .hwpx-diff-marker')?.remove();
    card.querySelector(':scope > .hwpx-diff-meta')?.remove();
  }
  container.classList.remove('hwpx-diff-ui');
}
global.HwpxDiffUI={render,update,decorate,apply,setTheme,clear,authorColor,authorKey,availableAuthors,visibleChanges,changeVisible,applyFilters,defaults:DEFAULTS,authorPalette:AUTHOR_PALETTE.slice(),version:'0.5.0'};
})(window);

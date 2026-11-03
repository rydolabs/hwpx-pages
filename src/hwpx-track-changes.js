(function(global){
'use strict';

// Optional tracked-change adapter for HwpxDiff. This file intentionally has no
// dependency on hwpx-preview.js and never mutates renderer DOM/output.
const te=new TextDecoder('utf-8');
const HWPX_ZIP_LIMITS = Object.freeze({maxFileBytes:64*1024*1024,maxEntries:4096,maxEntryBytes:64*1024*1024,maxTotalUncompressedBytes:256*1024*1024,maxCompressionRatio:1000});

class TcZip{
  constructor(buf){if(!(buf instanceof ArrayBuffer))throw new TypeError('HWPX input must be an ArrayBuffer');if(buf.byteLength>HWPX_ZIP_LIMITS.maxFileBytes)throw new Error('HWPX ZIP exceeds maximum file size');this.buf=buf;this.dv=new DataView(buf);this.entries=new Map();this._parse();}
  _ensure(o,n,label='ZIP record'){if(!Number.isInteger(o)||o<0||o+n>this.buf.byteLength)throw new Error(label+' is out of bounds')}
  _u16(o){this._ensure(o,2);return this.dv.getUint16(o,true)} _u32(o){this._ensure(o,4);return this.dv.getUint32(o,true)}
  _parse(){if(this.buf.byteLength<22)throw new Error('ZIP file is too small');let e=-1;for(let i=this.buf.byteLength-22;i>=Math.max(0,this.buf.byteLength-65557);i--){if(this._u32(i)===0x06054b50){e=i;break}}if(e<0)throw new Error('ZIP EOCD not found');this._ensure(e,22,'ZIP EOCD');const c=this._u16(e+10),cdSize=this._u32(e+12),cdOff=this._u32(e+16);if(c>HWPX_ZIP_LIMITS.maxEntries)throw new Error('HWPX ZIP has too many entries');if(cdOff===0xffffffff||cdSize===0xffffffff)throw new Error('ZIP64 is not supported');this._ensure(cdOff,cdSize,'ZIP central directory');let p=cdOff,total=0;for(let i=0;i<c;i++){this._ensure(p,46,'ZIP central directory entry');if(this._u32(p)!==0x02014b50)throw new Error('Bad central directory');const method=this._u16(p+10),csize=this._u32(p+20),usize=this._u32(p+24),nlen=this._u16(p+28),xlen=this._u16(p+30),clen=this._u16(p+32),localOff=this._u32(p+42);if(csize===0xffffffff||usize===0xffffffff||localOff===0xffffffff)throw new Error('ZIP64 is not supported');if(method!==0&&method!==8)throw new Error('Unsupported ZIP method '+method);if(usize>HWPX_ZIP_LIMITS.maxEntryBytes)throw new Error('HWPX ZIP entry is too large');if(csize===0?usize>0:usize/csize>HWPX_ZIP_LIMITS.maxCompressionRatio)throw new Error('HWPX ZIP entry compression ratio is too high');total+=usize;if(total>HWPX_ZIP_LIMITS.maxTotalUncompressedBytes)throw new Error('HWPX ZIP uncompressed size exceeds limit');this._ensure(p+46,nlen+xlen+clen,'ZIP central directory entry data');const name=te.decode(new Uint8Array(this.buf,p+46,nlen));if(name.includes('\0'))throw new Error('Invalid ZIP entry name');this.entries.set(name,{method,csize,usize,localOff});p+=46+nlen+xlen+clen}if(p>cdOff+cdSize)throw new Error('ZIP central directory length mismatch')}
  async bytes(name){const e=this.entries.get(name);if(!e)throw new Error('Missing ZIP entry '+name);const p=e.localOff;this._ensure(p,30,'ZIP local header');if(this._u32(p)!==0x04034b50)throw new Error('Bad local header');const nlen=this._u16(p+26),xlen=this._u16(p+28),start=p+30+nlen+xlen;this._ensure(start,e.csize,'ZIP entry data');const src=new Uint8Array(this.buf,start,e.csize);if(e.method===0){if(src.byteLength!==e.usize)throw new Error('Stored ZIP entry size mismatch');return src.slice()}const ds=new DecompressionStream('deflate-raw');const out=await new Response(new Blob([src]).stream().pipeThrough(ds)).arrayBuffer();if(out.byteLength!==e.usize)throw new Error('Deflated ZIP entry size mismatch');if(out.byteLength>HWPX_ZIP_LIMITS.maxEntryBytes)throw new Error('HWPX ZIP entry exceeds decompression limit');return new Uint8Array(out)}
  async text(name){return te.decode(await this.bytes(name))}
}
const xml=s=>new DOMParser().parseFromString(s,'application/xml');
const children=(el,name)=>[...el.children].filter(x=>x.localName===name);
const child=(el,name)=>[...el.children].find(x=>x.localName===name)||null;
const all=(el,name)=>[...el.getElementsByTagName('*')].filter(x=>x.localName===name);
const normType=s=>{s=String(s||'').toLowerCase();return s.startsWith('ins')?'insert':s.startsWith('del')?'delete':s==='charshape'?'style':s||'unknown'};

function headerMetadata(doc){
  const changes=new Map(),authors=new Map();
  for(const a of all(doc,'trackChangeAuthor')) authors.set(String(a.getAttribute('id')||''),{id:String(a.getAttribute('id')||''),name:a.getAttribute('name')||'',mark:a.getAttribute('mark')||'',color:a.getAttribute('color')||''});
  for(const c of all(doc,'trackChange')){
    const id=String(c.getAttribute('id')||''),authorId=String(c.getAttribute('authorID')||'');
    changes.set(id,{id,type:normType(c.getAttribute('type')),rawType:c.getAttribute('type')||'',date:c.getAttribute('date')||'',authorId,author:authors.get(authorId)?.name||'',hide:c.getAttribute('hide')||'',charShapeID:c.getAttribute('charShapeID')||'',paraShapeID:c.getAttribute('paraShapeID')||''});
  }
  return {changes,authors};
}

function scanTextContainers(tNodes,ref,meta,section,paragraph,cellRef=null){
  const found=[],active=[];let cursor=0,markIndex=0,serial=0;
  const begin=(el,type)=>{const tcId=String(el.getAttribute('TcId')||''),id=String(el.getAttribute('Id')||'');active.push({tcId,id,type,ref,section,paragraph,cellRef,startCursor:cursor,startMarkIndex:markIndex,text:'',serial:serial++})};
  const end=(el,type)=>{const tcId=String(el.getAttribute('TcId')||'');let ai=-1;for(let i=active.length-1;i>=0;i--){if(active[i].type===type&&(!tcId||active[i].tcId===tcId)){ai=i;break}}if(ai<0)return;const rec=active.splice(ai,1)[0];rec.endCursor=cursor;rec.endMarkIndex=markIndex;const m=meta.changes.get(rec.tcId)||{};found.push({...rec,metadata:m,author:m.author||'',date:m.date||''})};
  for(const t of tNodes){
    for(const n of [...t.childNodes]){
      if(n.nodeType===Node.TEXT_NODE){const s=n.nodeValue||'';for(const r of active)r.text+=s;cursor+=s.length;continue}
      if(n.nodeType!==Node.ELEMENT_NODE)continue;
      const name=n.localName||'';
      if(name==='insertBegin')begin(n,'insert'); else if(name==='deleteBegin')begin(n,'delete'); else if(name==='insertEnd')end(n,'insert'); else if(name==='deleteEnd')end(n,'delete');
      markIndex++;
    }
  }
  // Malformed/unclosed markers are intentionally not emitted as authoritative changes.
  return found;
}
function directRunTextNodes(p){const out=[];for(const r of children(p,'run'))for(const n of children(r,'t'))out.push(n);return out}
function scanParagraph(p,pRef,meta,si,pi){
  const out=scanTextContainers(directRunTextNodes(p),pRef,meta,si,pi,null);
  let tableIndex=0;
  for(const run of children(p,'run'))for(const tbl of children(run,'tbl')){
    const tableRef=`${pRef}:t${tableIndex++}`;let ri=0;
    for(const tr of children(tbl,'tr')){let ci=0;for(const tc of children(tr,'tc')){
      const addr=child(tc,'cellAddr'),row=Number(addr?.getAttribute('rowAddr')??ri),col=Number(addr?.getAttribute('colAddr')??ci),cellRef=`${tableRef}:r${ri}:c${ci}`;
      const sub=child(tc,'subList')||tc;for(const cp of children(sub,'p'))out.push(...scanTextContainers(directRunTextNodes(cp),cellRef,meta,si,pi,cellRef));ci++}ri++}
  }
  return out;
}

async function parseTrackChanges(arrayBuffer){
  const zip=new TcZip(arrayBuffer),headerName=[...zip.entries.keys()].find(n=>/^Contents\/header\.xml$/i.test(n));
  const meta=headerName?headerMetadata(xml(await zip.text(headerName))):{changes:new Map(),authors:new Map()};
  const sectionNames=[...zip.entries.keys()].filter(n=>/^Contents\/section\d+\.xml$/i.test(n)).sort((a,b)=>Number(a.match(/section(\d+)/i)?.[1]||0)-Number(b.match(/section(\d+)/i)?.[1]||0));
  const changes=[];
  for(let si=0;si<sectionNames.length;si++){
    const d=xml(await zip.text(sectionNames[si])),ps=children(d.documentElement,'p');
    for(let pi=0;pi<ps.length;pi++) changes.push(...scanParagraph(ps[pi],`s${si}:p${pi}`,meta,si,pi));
  }
  changes.sort((a,b)=>a.section-b.section||a.paragraph-b.paragraph||a.startMarkIndex-b.startMarkIndex||a.serial-b.serial);
  return {format:'hwpx-track-changes',version:1,changes,metadata:[...meta.changes.values()],authors:[...meta.authors.values()]};
}

function mergeReplacementPairs(raw){
  const out=[];
  for(let i=0;i<raw.length;i++){
    const a=raw[i],b=raw[i+1];
    if(a&&b&&a.ref===b.ref&&a.type==='delete'&&b.type==='insert'&&a.endCursor===b.startCursor&&b.startMarkIndex===a.endMarkIndex+1){
      out.push({source:'tracked-change',type:'modify',blockType:a.cellRef?'table':'paragraph',oldRef:a.ref,newRef:b.ref,oldText:a.text,newText:b.text,inline:[{type:'delete',text:a.text},{type:'insert',text:b.text}],tracked:[a,b],author:b.author||a.author,date:b.date||a.date});i++;continue;
    }
    out.push({source:'tracked-change',type:a.type==='insert'?'insert':'delete',blockType:a.cellRef?'table':'paragraph',oldRef:a.type==='insert'?a.ref:a.ref,newRef:a.type==='delete'?a.ref:a.ref,oldText:a.type==='delete'?a.text:'',newText:a.type==='insert'?a.text:'',inline:[{type:a.type,text:a.text}],tracked:[a],author:a.author,date:a.date});
  }
  return out;
}
function summarize(changes){let added=0,deleted=0,modified=0;for(const c of changes){if(c.type==='insert')added++;else if(c.type==='delete')deleted++;else modified++}return{total:changes.length,added,deleted,modified}}

async function hybridDiff(oldBuffer,newBuffer,options={}){
  if(!global.HwpxDiff)throw new Error('HwpxDiff must be loaded before HwpxTrackChanges');
  const structural=await global.HwpxDiff.diff(oldBuffer,newBuffer,options),trackedDoc=await parseTrackChanges(newBuffer),tracked=mergeReplacementPairs(trackedDoc.changes);
  if(!tracked.length)return {...structural,mode:'structural',trackChanges:trackedDoc};
  const touched=new Set(tracked.map(c=>c.newRef||c.oldRef).filter(Boolean));
  const fallback=(options.structuralFallback===false?[]:structural.changes.filter(c=>!touched.has(c.newRef)&&!touched.has(c.oldRef))).map(c=>({...c,source:c.source||'structural-diff'}));
  const combined=[...tracked,...fallback];
  combined.sort((a,b)=>{
    const ar=a.newRef||a.oldRef||'',br=b.newRef||b.oldRef||'';const m1=ar.match(/^s(\d+):p(\d+)/),m2=br.match(/^s(\d+):p(\d+)/);return Number(m1?.[1]||0)-Number(m2?.[1]||0)||Number(m1?.[2]||0)-Number(m2?.[2]||0)
  });
  combined.forEach((c,i)=>c.id=`chg-${i+1}`);
  return {format:'hwpx-diff',version:2,mode:'hybrid',oldModel:structural.oldModel,newModel:structural.newModel,items:structural.items,changes:combined,summary:summarize(combined),trackChanges:trackedDoc,structural};
}

global.HwpxTrackChanges={parse:parseTrackChanges,diff:hybridDiff,mergeReplacementPairs,version:'0.1.0'};
})(window);

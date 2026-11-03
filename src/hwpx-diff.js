(function(global){
'use strict';

const te = new TextDecoder('utf-8');
const HWPX_ZIP_LIMITS = Object.freeze({maxFileBytes:64*1024*1024,maxEntries:4096,maxEntryBytes:64*1024*1024,maxTotalUncompressedBytes:256*1024*1024,maxCompressionRatio:1000});


class DiffZip{
  constructor(buf){if(!(buf instanceof ArrayBuffer))throw new TypeError('HWPX input must be an ArrayBuffer');if(buf.byteLength>HWPX_ZIP_LIMITS.maxFileBytes)throw new Error('HWPX ZIP exceeds maximum file size');this.buf=buf;this.dv=new DataView(buf);this.entries=new Map();this._parse();}
  _ensure(o,n,label='ZIP record'){if(!Number.isInteger(o)||o<0||o+n>this.buf.byteLength)throw new Error(label+' is out of bounds')}
  _u16(o){this._ensure(o,2);return this.dv.getUint16(o,true)} _u32(o){this._ensure(o,4);return this.dv.getUint32(o,true)}
  _parse(){if(this.buf.byteLength<22)throw new Error('ZIP file is too small');let e=-1;for(let i=this.buf.byteLength-22;i>=Math.max(0,this.buf.byteLength-65557);i--){if(this._u32(i)===0x06054b50){e=i;break}}if(e<0)throw new Error('ZIP EOCD not found');this._ensure(e,22,'ZIP EOCD');const c=this._u16(e+10),cdSize=this._u32(e+12),cdOff=this._u32(e+16);if(c>HWPX_ZIP_LIMITS.maxEntries)throw new Error('HWPX ZIP has too many entries');if(cdOff===0xffffffff||cdSize===0xffffffff)throw new Error('ZIP64 is not supported');this._ensure(cdOff,cdSize,'ZIP central directory');let p=cdOff,total=0;for(let i=0;i<c;i++){this._ensure(p,46,'ZIP central directory entry');if(this._u32(p)!==0x02014b50)throw new Error('Bad central directory');const method=this._u16(p+10),csize=this._u32(p+20),usize=this._u32(p+24),nlen=this._u16(p+28),xlen=this._u16(p+30),clen=this._u16(p+32),localOff=this._u32(p+42);if(csize===0xffffffff||usize===0xffffffff||localOff===0xffffffff)throw new Error('ZIP64 is not supported');if(method!==0&&method!==8)throw new Error('Unsupported ZIP method '+method);if(usize>HWPX_ZIP_LIMITS.maxEntryBytes)throw new Error('HWPX ZIP entry is too large');if(csize===0?usize>0:usize/csize>HWPX_ZIP_LIMITS.maxCompressionRatio)throw new Error('HWPX ZIP entry compression ratio is too high');total+=usize;if(total>HWPX_ZIP_LIMITS.maxTotalUncompressedBytes)throw new Error('HWPX ZIP uncompressed size exceeds limit');this._ensure(p+46,nlen+xlen+clen,'ZIP central directory entry data');const name=te.decode(new Uint8Array(this.buf,p+46,nlen));if(name.includes('\0'))throw new Error('Invalid ZIP entry name');this.entries.set(name,{method,csize,usize,localOff});p+=46+nlen+xlen+clen}if(p>cdOff+cdSize)throw new Error('ZIP central directory length mismatch')}
  async bytes(name){const e=this.entries.get(name);if(!e)throw new Error('Missing ZIP entry '+name);const p=e.localOff;this._ensure(p,30,'ZIP local header');if(this._u32(p)!==0x04034b50)throw new Error('Bad local header');const nlen=this._u16(p+26),xlen=this._u16(p+28),start=p+30+nlen+xlen;this._ensure(start,e.csize,'ZIP entry data');const src=new Uint8Array(this.buf,start,e.csize);if(e.method===0){if(src.byteLength!==e.usize)throw new Error('Stored ZIP entry size mismatch');return src.slice()}const ds=new DecompressionStream('deflate-raw');const out=await new Response(new Blob([src]).stream().pipeThrough(ds)).arrayBuffer();if(out.byteLength!==e.usize)throw new Error('Deflated ZIP entry size mismatch');if(out.byteLength>HWPX_ZIP_LIMITS.maxEntryBytes)throw new Error('HWPX ZIP entry exceeds decompression limit');return new Uint8Array(out)}
  async text(name){return te.decode(await this.bytes(name))}
}

const parseXml=s=>new DOMParser().parseFromString(s,'application/xml');
const children=(el,name)=>[...el.children].filter(x=>x.localName===name);
const child=(el,name)=>[...el.children].find(x=>x.localName===name)||null;
const all=(el,name)=>[...el.getElementsByTagName('*')].filter(x=>x.localName===name);

function normalizeText(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
function textOfParagraph(p){
  let out='';
  for(const run of children(p,'run')){
    for(const node of [...run.children]){
      if(node.localName==='t') out += node.textContent||'';
      else if(node.localName==='lineBreak') out += '\n';
      else if(node.localName==='tab') out += '\t';
    }
  }
  return out;
}
function textOfCell(tc){
  return children(child(tc,'subList')||tc,'p').map(textOfParagraph).join('\n');
}
function parseTable(tbl, refBase){
  const rows=[];
  const rowNodes=children(tbl,'tr');
  for(let ri=0;ri<rowNodes.length;ri++){
    const cells=[];
    const tcNodes=children(rowNodes[ri],'tc');
    for(let ci=0;ci<tcNodes.length;ci++){
      const tc=tcNodes[ci], addr=child(tc,'cellAddr'), span=child(tc,'cellSpan');
      cells.push({
        ref:`${refBase}:r${ri}:c${ci}`,
        row: Number(addr?.getAttribute('rowAddr') ?? ri),
        col: Number(addr?.getAttribute('colAddr') ?? ci),
        rowSpan: Number(span?.getAttribute('rowSpan') ?? 1),
        colSpan: Number(span?.getAttribute('colSpan') ?? 1),
        text:textOfCell(tc)
      });
    }
    rows.push({ref:`${refBase}:r${ri}`, cells});
  }
  return {rows, text: rows.map(r=>r.cells.map(c=>c.text).join('\t')).join('\n')};
}

async function parseHwpx(arrayBuffer, options={}){
  const zip=new DiffZip(arrayBuffer);
  const sectionNames=[...zip.entries.keys()]
    .filter(n=>/^Contents\/section\d+\.xml$/i.test(n))
    .sort((a,b)=>Number(a.match(/section(\d+)/i)?.[1]||0)-Number(b.match(/section(\d+)/i)?.[1]||0));
  if(!sectionNames.length) throw new Error('No HWPX section XML found');
  const sections=[]; const blocks=[];
  for(let si=0;si<sectionNames.length;si++){
    const xml=parseXml(await zip.text(sectionNames[si]));
    const ps=children(xml.documentElement,'p');
    const section={ref:`s${si}`, index:si, name:sectionNames[si], blocks:[]};
    for(let pi=0;pi<ps.length;pi++){
      const p=ps[pi], pRef=`s${si}:p${pi}`;
      const runs=children(p,'run');
      const tbls=runs.map(r=>child(r,'tbl')).filter(Boolean);
      const rects=runs.map(r=>child(r,'rect')).filter(Boolean);
      const pics=runs.map(r=>child(r,'pic')).filter(Boolean);
      const text=textOfParagraph(p);
      if(tbls.length){
        for(let ti=0;ti<tbls.length;ti++){
          const ref=`${pRef}:t${ti}`, table=parseTable(tbls[ti],ref);
          const b={type:'table',ref,section:si,paragraph:pi,text:table.text,rows:table.rows,paragraphText:text};
          section.blocks.push(b); blocks.push(b);
        }
      } else {
        const objectKinds=[];
        if(rects.length) objectKinds.push('rect');
        if(pics.length) objectKinds.push('picture');
        const b={type:'paragraph',ref:pRef,section:si,paragraph:pi,text,normalized:normalizeText(text),objects:objectKinds};
        section.blocks.push(b); blocks.push(b);
      }
    }
    sections.push(section);
  }
  return {format:'hwpx',version:1,sections,blocks};
}

function tokenise(s){
  return String(s||'').match(/\s+|[가-힣]+|[A-Za-z]+|\d+(?:[.,]\d+)*|[^\s]/g)||[];
}
function lcsDiff(aText,bText){
  const a=tokenise(aText), b=tokenise(bText), n=a.length,m=b.length;
  if(!n && !m) return [];
  if(n*m>250000){
    if(aText===bText) return [{type:'equal',text:aText}];
    return [{type:'delete',text:aText},{type:'insert',text:bText}].filter(x=>x.text);
  }
  const dp=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  let i=0,j=0; const raw=[];
  const push=(type,text)=>{ if(!text) return; const last=raw[raw.length-1]; if(last&&last.type===type) last.text+=text; else raw.push({type,text}); };
  while(i<n&&j<m){
    if(a[i]===b[j]){ push('equal',a[i]); i++;j++; }
    else if(dp[i+1][j]>=dp[i][j+1]){ push('delete',a[i++]); }
    else { push('insert',b[j++]); }
  }
  while(i<n) push('delete',a[i++]); while(j<m) push('insert',b[j++]);
  return raw;
}

function levenshteinRatio(a,b){
  a=normalizeText(a); b=normalizeText(b);
  if(a===b) return 1;
  if(!a||!b) return 0;
  const max=Math.max(a.length,b.length);
  if(max>1200){
    const sa=new Set(tokenise(a).filter(x=>!/^\s+$/.test(x))), sb=new Set(tokenise(b).filter(x=>!/^\s+$/.test(x)));
    let hit=0; for(const x of sa) if(sb.has(x)) hit++;
    return hit/Math.max(1,Math.max(sa.size,sb.size));
  }
  let prev=new Uint16Array(b.length+1), cur=new Uint16Array(b.length+1);
  for(let j=0;j<=b.length;j++) prev[j]=j;
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    const t=prev; prev=cur; cur=t;
  }
  return 1-prev[b.length]/max;
}
function blockSimilarity(a,b){
  if(!a||!b||a.type!==b.type) return 0;
  if(a.type==='table'){
    const ar=a.rows?.length||0, br=b.rows?.length||0;
    const rowScore=1-Math.abs(ar-br)/Math.max(1,ar,br);
    return .55*levenshteinRatio(a.text,b.text)+.45*rowScore;
  }
  return levenshteinRatio(a.text,b.text);
}

function alignBlocks(oldBlocks,newBlocks){
  const n=oldBlocks.length,m=newBlocks.length;
  if(n*m>400000){
    // Large document fallback: exact-text anchors + positional remainder.
    const out=[]; const max=Math.max(n,m);
    for(let i=0;i<max;i++) out.push({old:oldBlocks[i]||null,new:newBlocks[i]||null,score:blockSimilarity(oldBlocks[i],newBlocks[i])});
    return out;
  }
  const insDel=.72;
  const dp=Array.from({length:n+1},()=>new Float64Array(m+1));
  const op=Array.from({length:n+1},()=>new Uint8Array(m+1));
  for(let i=1;i<=n;i++){dp[i][0]=i*insDel; op[i][0]=1;}
  for(let j=1;j<=m;j++){dp[0][j]=j*insDel; op[0][j]=2;}
  for(let i=1;i<=n;i++) for(let j=1;j<=m;j++){
    const sim=blockSimilarity(oldBlocks[i-1],newBlocks[j-1]);
    const sub=dp[i-1][j-1]+(1-sim), del=dp[i-1][j]+insDel, ins=dp[i][j-1]+insDel;
    if(sub<=del&&sub<=ins){dp[i][j]=sub;op[i][j]=0;} else if(del<=ins){dp[i][j]=del;op[i][j]=1;} else {dp[i][j]=ins;op[i][j]=2;}
  }
  const rev=[]; let i=n,j=m;
  while(i||j){
    const o=op[i][j];
    if(i&&j&&o===0){rev.push({old:oldBlocks[i-1],new:newBlocks[j-1],score:blockSimilarity(oldBlocks[i-1],newBlocks[j-1])});i--;j--;}
    else if(i&&(j===0||o===1)){rev.push({old:oldBlocks[i-1],new:null,score:0});i--;}
    else {rev.push({old:null,new:newBlocks[j-1],score:0});j--;}
  }
  return rev.reverse();
}

function diffTable(oldB,newB){
  const maxRows=Math.max(oldB.rows.length,newB.rows.length), rows=[]; let changed=false;
  for(let ri=0;ri<maxRows;ri++){
    const or=oldB.rows[ri], nr=newB.rows[ri], maxCells=Math.max(or?.cells.length||0,nr?.cells.length||0), cells=[];
    for(let ci=0;ci<maxCells;ci++){
      const oc=or?.cells[ci]||null,nc=nr?.cells[ci]||null;
      let type='equal',inline=[];
      if(!oc) type='insert'; else if(!nc) type='delete'; else if(oc.text!==nc.text) type='modify';
      if(type==='modify') inline=lcsDiff(oc.text,nc.text);
      else if(type==='insert') inline=[{type:'insert',text:nc.text}];
      else if(type==='delete') inline=[{type:'delete',text:oc.text}];
      if(type!=='equal') changed=true;
      cells.push({type,oldRef:oc?.ref||null,newRef:nc?.ref||null,oldText:oc?.text||'',newText:nc?.text||'',inline});
    }
    rows.push({index:ri,cells});
  }
  return {changed,rows};
}

function createDiff(oldModel,newModel,options={}){
  const aligned=alignBlocks(oldModel.blocks,newModel.blocks), changes=[], items=[];
  let seq=0, counts={insert:0,delete:0,modify:0};
  for(const pair of aligned){
    const ob=pair.old, nb=pair.new;
    let type='equal', inline=[], table=null;
    if(!ob) type='insert'; else if(!nb) type='delete';
    else if(ob.type!==nb.type) type='modify';
    else if(ob.type==='table'){
      table=diffTable(ob,nb); if(table.changed) type='modify';
    } else if(ob.text!==nb.text) type='modify';
    if(type==='modify' && (!ob||!nb||ob.type!=='table')) inline=lcsDiff(ob?.text||'',nb?.text||'');
    else if(type==='insert') inline=[{type:'insert',text:nb?.text||''}];
    else if(type==='delete') inline=[{type:'delete',text:ob?.text||''}];
    const item={type,blockType:nb?.type||ob?.type||'paragraph',oldRef:ob?.ref||null,newRef:nb?.ref||null,oldText:ob?.text||'',newText:nb?.text||'',inline,table,similarity:pair.score};
    items.push(item);
    if(type!=='equal'){
      seq++; item.id=`chg-${seq}`; changes.push(item); counts[type]++;
    }
  }
  return {format:'hwpx-diff',version:1,oldModel,newModel,items,changes,summary:{total:changes.length,added:counts.insert,deleted:counts.delete,modified:counts.modify}};
}

async function diffHwpx(oldBuffer,newBuffer,options={}){
  const [oldModel,newModel]=await Promise.all([parseHwpx(oldBuffer,options),parseHwpx(newBuffer,options)]);
  return createDiff(oldModel,newModel,options);
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function inlineHtml(parts){
  return (parts||[]).map(p=>p.type==='delete'?`<del class="hwpx-diff-del">${esc(p.text)}</del>`:p.type==='insert'?`<ins class="hwpx-diff-ins">${esc(p.text)}</ins>`:esc(p.text)).join('');
}
function changeLabel(c){
  if(c.blockType==='table') return c.type==='insert'?'표 추가':c.type==='delete'?'표 삭제':'표 수정';
  const t=normalizeText(c.newText||c.oldText);
  return (t.slice(0,36)||(c.type==='insert'?'문단 추가':c.type==='delete'?'문단 삭제':'문단 수정'))+(t.length>36?'…':'');
}
function renderChanges(diff,container,options={}){
  container.innerHTML='';
  container.classList.add('hwpx-diff-changes');
  if(!diff.changes.length){container.innerHTML='<div class="hwpx-diff-empty">변경사항이 없습니다.</div>';return;}
  for(const c of diff.changes){
    const card=document.createElement('section'); card.className=`hwpx-diff-change is-${c.type}`; card.id=c.id; card.dataset.changeId=c.id;
    const head=document.createElement('div'); head.className='hwpx-diff-change-head'; head.textContent=changeLabel(c); card.appendChild(head);
    if(c.blockType==='table'&&c.table){
      const table=document.createElement('table'); table.className='hwpx-diff-table';
      for(const r of c.table.rows){
        const tr=document.createElement('tr');
        for(const cell of r.cells){
          const td=document.createElement('td'); td.className=`is-${cell.type}`;
          td.innerHTML=cell.type==='equal'?esc(cell.newText||cell.oldText):inlineHtml(cell.inline); tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      card.appendChild(table);
    } else {
      const body=document.createElement('div'); body.className='hwpx-diff-change-body'; body.innerHTML=inlineHtml(c.inline); card.appendChild(body);
    }
    container.appendChild(card);
  }
}

function injectDefaultStyles(doc=document){
  if(doc.getElementById('hwpx-diff-default-style')) return;
  const s=doc.createElement('style'); s.id='hwpx-diff-default-style'; s.textContent=`
.hwpx-diff-changes{display:flex;flex-direction:column;gap:12px}.hwpx-diff-change{background:#fff;border:1px solid #dedbd4;border-radius:10px;padding:14px;scroll-margin-top:80px}.hwpx-diff-change-head{font-size:12px;color:#6b6964;margin-bottom:8px}.hwpx-diff-change-body{font-size:15px;line-height:1.9;white-space:pre-wrap}.hwpx-diff-del{background:#fcebeb;color:#9d2d2d;text-decoration:line-through;text-decoration-thickness:1px}.hwpx-diff-ins{background:#eaf3de;color:#376a11;text-decoration:none;border-bottom:1px solid #73a84d}.hwpx-diff-table{border-collapse:collapse;width:100%;font-size:13px}.hwpx-diff-table td{border:1px solid #d7d4cd;padding:6px;vertical-align:top;white-space:pre-wrap}.hwpx-diff-table td.is-insert{background:#f0f8e7}.hwpx-diff-table td.is-delete{background:#fff0f0}.hwpx-diff-table td.is-modify{background:#fffdf4}.hwpx-diff-empty{padding:32px;text-align:center;color:#777}`;
  doc.head.appendChild(s);
}

global.HwpxDiff={parse:parseHwpx,createDiff,diff:diffHwpx,renderChanges,injectDefaultStyles,lcsDiff,version:'0.1.0'};
})(window);

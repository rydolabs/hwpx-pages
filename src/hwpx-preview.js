const te = new TextDecoder('utf-8');

// Defensive limits for untrusted browser uploads. These are intentionally
// internal defaults: ordinary users should not have to configure ZIP safety.
const HWPX_ZIP_LIMITS = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxEntries: 4096,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 1000
});

class SimpleZip {
  constructor(buf){
    if(!(buf instanceof ArrayBuffer)) throw new TypeError('HWPX input must be an ArrayBuffer');
    if(buf.byteLength > HWPX_ZIP_LIMITS.maxFileBytes) throw new Error('HWPX ZIP exceeds maximum file size');
    this.buf=buf; this.dv=new DataView(buf); this.entries=new Map(); this._parse();
  }
  _ensure(o,n,label='ZIP record'){ if(!Number.isInteger(o)||o<0||o+n>this.buf.byteLength) throw new Error(label+' is out of bounds'); }
  _u16(o){ this._ensure(o,2); return this.dv.getUint16(o,true); }
  _u32(o){ this._ensure(o,4); return this.dv.getUint32(o,true); }
  _parse(){
    if(this.buf.byteLength<22) throw new Error('ZIP file is too small');
    let eocd=-1;
    for(let i=this.buf.byteLength-22;i>=Math.max(0,this.buf.byteLength-65557);i--){ if(this._u32(i)===0x06054b50){ eocd=i; break; } }
    if(eocd<0) throw new Error('ZIP EOCD not found');
    this._ensure(eocd,22,'ZIP EOCD');
    const count=this._u16(eocd+10), cdSize=this._u32(eocd+12), cdOff=this._u32(eocd+16);
    if(count>HWPX_ZIP_LIMITS.maxEntries) throw new Error('HWPX ZIP has too many entries');
    if(cdOff===0xffffffff||cdSize===0xffffffff) throw new Error('ZIP64 is not supported');
    this._ensure(cdOff,cdSize,'ZIP central directory');
    let p=cdOff,total=0;
    for(let i=0;i<count;i++){
      this._ensure(p,46,'ZIP central directory entry');
      if(this._u32(p)!==0x02014b50) throw new Error('Bad central directory');
      const method=this._u16(p+10), csize=this._u32(p+20), usize=this._u32(p+24), nlen=this._u16(p+28), xlen=this._u16(p+30), clen=this._u16(p+32), localOff=this._u32(p+42);
      if(csize===0xffffffff||usize===0xffffffff||localOff===0xffffffff) throw new Error('ZIP64 is not supported');
      if(method!==0&&method!==8) throw new Error('Unsupported ZIP method '+method);
      if(usize>HWPX_ZIP_LIMITS.maxEntryBytes) throw new Error('HWPX ZIP entry is too large');
      if(csize===0 ? usize>0 : usize/csize>HWPX_ZIP_LIMITS.maxCompressionRatio) throw new Error('HWPX ZIP entry compression ratio is too high');
      total+=usize; if(total>HWPX_ZIP_LIMITS.maxTotalUncompressedBytes) throw new Error('HWPX ZIP uncompressed size exceeds limit');
      this._ensure(p+46,nlen+xlen+clen,'ZIP central directory entry data');
      const name=te.decode(new Uint8Array(this.buf,p+46,nlen));
      if(name.includes('\0')) throw new Error('Invalid ZIP entry name');
      this.entries.set(name,{method,csize,usize,localOff}); p+=46+nlen+xlen+clen;
    }
    if(p>cdOff+cdSize) throw new Error('ZIP central directory length mismatch');
  }
  async bytes(name){
    const e=this.entries.get(name); if(!e) throw new Error('Missing ZIP entry '+name);
    const p=e.localOff; this._ensure(p,30,'ZIP local header');
    if(this._u32(p)!==0x04034b50) throw new Error('Bad local header');
    const nlen=this._u16(p+26), xlen=this._u16(p+28), start=p+30+nlen+xlen;
    this._ensure(start,e.csize,'ZIP entry data');
    const src=new Uint8Array(this.buf,start,e.csize);
    if(e.method===0){
      if(src.byteLength!==e.usize) throw new Error('Stored ZIP entry size mismatch');
      return src.slice();
    }
    const ds=new DecompressionStream('deflate-raw');
    const out=await new Response(new Blob([src]).stream().pipeThrough(ds)).arrayBuffer();
    if(out.byteLength!==e.usize) throw new Error('Deflated ZIP entry size mismatch');
    if(out.byteLength>HWPX_ZIP_LIMITS.maxEntryBytes) throw new Error('HWPX ZIP entry exceeds decompression limit');
    return new Uint8Array(out);
  }
  async text(name){ return te.decode(await this.bytes(name)); }
}

const $all=(el,name)=>[...el.getElementsByTagName('*')].filter(x=>x.localName===name);
const $child=(el,name)=>[...el.children].find(x=>x.localName===name)||null;
const $children=(el,name)=>[...el.children].filter(x=>x.localName===name);
const num=(v,d=0)=>v==null?d:Number(v);
const parseXml=s=>new DOMParser().parseFromString(s,'application/xml');
const directText=run=>$child(run,'t')?.textContent ?? '';

function cssColor(v, fallback='#000'){
  if(!v || v==='none') return fallback;
  if(/^#[0-9A-Fa-f]{8}$/.test(v)) return '#'+v.slice(-6);
  return v;
}

// Similar-metric freely available Linux fallbacks used by the test runner.
// The original family remains first so a user's locally installed Hancom fonts win automatically.
function fontFallback(name, context='body', matchEmbeddedPreview=true){
  const n=name||'';
  const q=s=>`'${s.replace(/'/g,"\\'")}'`;
  // Hancom's legacy exact `바탕` metrics are much closer to Baekmuk Batang than NanumMyeongjo.
  // Keep this exact-name mapping isolated so existing 함초롬바탕/바탕체 compatibility tuning is unchanged.
  if(/^바탕$/.test(n)) return `${q(n)}, 'Baekmuk Batang', 'NanumMyeongjo', serif`;
  if(/함초롬바탕|바탕체|한양신명조/.test(n)){
    const fb = (!matchEmbeddedPreview && context!=='cell') ? "'NanumMyeongjo', 'Baekmuk Batang'" : "'Baekmuk Batang', 'NanumMyeongjo'";
    return `${q(n)}, ${fb}, serif`;
  }
  if(/굴림/.test(n)) return `${q(n)}, 'Baekmuk Gulim', 'NanumGothic', sans-serif`;
  if(/HY헤드라인|HY울릉도|울릉도|헤드라인|돋움|맑은 고딕|나눔고딕|모음/.test(n)) return `${q(n)}, 'NanumGothic', 'Baekmuk Dotum', sans-serif`;
  return `${q(n||'NanumMyeongjo')}, 'NanumMyeongjo', 'Baekmuk Batang', serif`;
}

function mmToPx(mm, scaleFactor=1){ return parseFloat(mm||0)*96/25.4*scaleFactor; }

// Centralized compatibility profile. These are renderer-level calibrations that
// survived ablation against Hancom direct-PDF references. Keep them here so
// layout code consumes named rules instead of accumulating document-specific
// magic numbers. Values are HWPUNIT unless the name explicitly says px/scale.
const HANCOM_COMPAT = Object.freeze({
  bodyLeft2022NoExplicitHeader: -750,
  paperOriginX: -750,
  paperOriginY: -800,
  pageHeaderTopBase: 800,
  pageHeaderTop2018Extra: 850,
  pictureY2018: -150,
  flowingTablePixelNudge: -0.5,
  bodyXSingleColumnPx: -1,
  bodyX2018MultiColumnPx: 0.5,
  bodyX2018PicturePx: 0.5,
  bodyXDefaultPdfPx: -0.5,
  singleColumnFontScale: 0.99,
  singleColumnSpacingBias: 2,
  hwp2018MultiColumnFontScale: 0.96
});

class HwpxPreview {
  constructor(opts={}){
    this.targetWidth=opts.targetWidth||724;
    // Hancom's embedded 724px preview has a tiny raster inset. Keeping it optional
    // makes DOM-to-Preview pixel comparison much closer while preserving a 724px page box.
    this.matchEmbeddedPreview=opts.matchEmbeddedPreview!==false;
    this.previewInsetX=opts.previewInsetX ?? (this.matchEmbeddedPreview ? this.targetWidth*(2/724) : 0);
    this.previewInsetY=opts.previewInsetY ?? 0;
    this.pageGap=opts.pageGap ?? 16;
    // Hancom's direct-PDF page origin differs slightly between major Hwp generations.
    // Keep 2022-compatible behavior as the default; callers targeting Hwp 2018 can opt in.
    this.hancomCompat=String(opts.hancomCompat||'2022');
    this.urls=[];
    this.sections=[];
    this.pages=[];
  }
  destroy(){ this.urls.forEach(URL.revokeObjectURL); this.urls=[]; }
  async loadArrayBuffer(buf){
    this.destroy(); this.zip=new SimpleZip(buf);
    this.header=parseXml(await this.zip.text('Contents/header.xml'));
    const sectionNames=[...this.zip.entries.keys()]
      .filter(n=>/^Contents\/section\d+\.xml$/i.test(n))
      .sort((a,b)=>num(a.match(/section(\d+)/i)?.[1])-num(b.match(/section(\d+)/i)?.[1]));
    if(!sectionNames.length) throw new Error('No HWPX section XML found');
    this.sections=[];
    for(const name of sectionNames) this.sections.push({name,xml:parseXml(await this.zip.text(name))});
    // Backward-compatible aliases for callers that inspect the first section/page.
    this.section=this.sections[0].xml;
    this.styles=this._parseStyles(); this.page=this._parsePage(this.section);
    const logicalW=this.targetWidth-2*this.previewInsetX;
    this.scale=logicalW/this.page.width;
    this.resourceMap=new Map();
    for(const n of this.zip.entries.keys()) if(n.startsWith('BinData/')){
      const b=await this.zip.bytes(n), ext=n.split('.').pop().toLowerCase();
      const type=ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':'application/octet-stream';
      const u=URL.createObjectURL(new Blob([b],{type})); this.urls.push(u);
      this.resourceMap.set(n.split('/').pop().replace(/\.[^.]+$/,''),u);
    }
    return this;
  }
  _parseStyles(){
    const fonts=[];
    const ffaces=$all(this.header,'fontface').find(x=>x.getAttribute('lang')==='HANGUL');
    if(ffaces) for(const f of $children(ffaces,'font')) fonts.push(f.getAttribute('face')||'');

    const chars=new Map();
    for(const c of $all(this.header,'charPr')){
      const fr=$child(c,'fontRef'), sp=$child(c,'spacing'), rt=$child(c,'ratio'), un=$child(c,'underline');
      chars.set(c.getAttribute('id'),{
        pt:num(c.getAttribute('height'))/100,
        color:cssColor(c.getAttribute('textColor'),'#000'),
        font:fonts[num(fr?.getAttribute('hangul'))]||'',
        bold:!!$child(c,'bold'),
        underline:!!un && un.getAttribute('type')!=='NONE',
        spacing:num(sp?.getAttribute('hangul')),
        ratio:num(rt?.getAttribute('hangul'),100)
      });
    }

    const paras=new Map();
    for(const p of $all(this.header,'paraPr')){
      const a=$child(p,'align'), m=$child(p,'margin');
      const mv=(name)=>{ const x=m?$child(m,name):null; return num(x?.getAttribute('value')); };
      paras.set(p.getAttribute('id'),{
        align:(a?.getAttribute('horizontal')||'LEFT').toLowerCase(),
        // Hancom HWPX paragraph margin/intent values are emitted in the
        // paragraph-shape coordinate scale. Direct-PDF measurements from
        // Hancom-authored files show these offsets at half the nominal HWPUNIT
        // distance (e.g. intent=-3776 -> 18.88pt hanging indent). Keep that
        // format conversion centralized instead of tuning individual documents.
        left:mv('left')/2, right:mv('right')/2, intent:mv('intent')/2
      });
    }

    const borderFills=new Map();
    for(const b of $all(this.header,'borderFill')){
      const side={};
      for(const n of ['leftBorder','rightBorder','topBorder','bottomBorder']){
        const x=$child(b,n);
        side[n]={type:x?.getAttribute('type')||'NONE', width:x?.getAttribute('width')||'0.1 mm', color:cssColor(x?.getAttribute('color'),'#000')};
      }
      const wb=$all(b,'winBrush')[0];
      borderFills.set(b.getAttribute('id'),{...side, fill:wb && wb.getAttribute('faceColor')!=='none' ? cssColor(wb.getAttribute('faceColor'),'transparent') : 'transparent'});
    }
    return {fonts,chars,paras,borderFills};
  }
  _parsePage(section=this.section){
    const pr=$all(section,'pagePr')[0];
    if(!pr) throw new Error('Missing pagePr in section');
    const m=$child(pr,'margin');
    return {width:num(pr.getAttribute('width')),height:num(pr.getAttribute('height')),margin:{left:num(m.getAttribute('left')),right:num(m.getAttribute('right')),top:num(m.getAttribute('top')),bottom:num(m.getAttribute('bottom')),header:num(m.getAttribute('header')),footer:num(m.getAttribute('footer'))}};
  }
  _charStyle(id,context='body'){
    const s=this.styles.chars.get(id)||{pt:10,color:'#000',font:'',bold:false,underline:false,spacing:0,ratio:100};
    const singleColPdfBody=!this.matchEmbeddedPreview && context==='body' && !!this._activePureText && (this._activeColumnCount||1)===1;
    const compat2018PureBody=!this.matchEmbeddedPreview && context==='body' && !!this._activePureText && /^2018/.test(this.hancomCompat) && (this._activeColumnCount||1)>1;
    const px=s.pt*100*this.scale*(singleColPdfBody?HANCOM_COMPAT.singleColumnFontScale:(compat2018PureBody?HANCOM_COMPAT.hwp2018MultiColumnFontScale:1));
    const metricBias=(/함초롬바탕|바탕체/.test(s.font) && s.pt<=12.5) ? (this.matchEmbeddedPreview?-3:(context==='cell'?-1:(singleColPdfBody?HANCOM_COMPAT.singleColumnSpacingBias:0))) : 0;
    const ls=px*(s.spacing+metricBias)/100;
    return {fontFamily:fontFallback(s.font,context,this.matchEmbeddedPreview),fontSize:`${px}px`,color:s.color,fontWeight:String(s.bold?700:400),textDecoration:s.underline?'underline':'none',letterSpacing:`${ls.toFixed(3)}px`,fontStretch:`${s.ratio}%`,lineHeight:'1'};
  }
  _applyCharStyle(el,id,context='body'){
    const st=this._charStyle(id,context);
    for(const [k,v] of Object.entries(st)) el.style[k]=v;
    return el;
  }
  _charCss(id,context='body'){
    // Compatibility helper for external/debug callers. Internal rendering uses
    // style properties so document metadata never crosses an HTML attribute boundary.
    const st=this._charStyle(id,context);
    const tmp=document.createElement('span');
    for(const [k,v] of Object.entries(st)) tmp.style[k]=v;
    return tmp.style.cssText;
  }
  _flattenRuns(p){
    let text='',spans=[],logical=0;

    // lineSeg.textpos is not an offset into visible DOM text. It indexes HWP's
    // logical paragraph stream. Extended controls occupy an 8-WCHAR control
    // record, while inline text controls (tab/line-break/NBSP) occupy one logical
    // character. Revision boundary markers and section properties do not consume
    // a visible/logical character here. Build the mapping explicitly instead of
    // treating every XML control as an arbitrary +8 adjustment.
    const EXTENDED_UNITS=8;
    const extendedObjects=new Set([
      'tbl','pic','equation','line','rect','ellipse','arc','polygon','curve',
      'connectLine','container','ole','textart'
    ]);
    const extendedCtrlKinds=new Set([
      'colPr','header','footer','footNote','endNote','autoNum','newNum',
      'pageNum','pageHiding','pageNumCtrl','fieldBegin','fieldEnd','bookmark'
    ]);
    const inlineLogicalOne=new Set(['tab','lineBreak','nbSpace','fwSpace']);
    const zeroWidthMarkers=new Set(['insertBegin','insertEnd','deleteBegin','deleteEnd']);

    const appendText=(value,style)=>{
      if(!value) return;
      const start=text.length, logicalStart=logical;
      text+=value; logical+=value.length;
      spans.push({start,end:text.length,logicalStart,logicalEnd:logical,style});
    };

    const walkTextNode=(node,style)=>{
      for(const child of [...node.childNodes]){
        if(child.nodeType===Node.TEXT_NODE){
          appendText(child.nodeValue||'',style);
          continue;
        }
        if(child.nodeType!==Node.ELEMENT_NODE) continue;
        const name=child.localName;
        if(inlineLogicalOne.has(name)){ logical+=1; continue; }
        if(zeroWidthMarkers.has(name)) continue;
        // Preserve text nested in otherwise unknown inline markup without
        // inventing a logical control width for it.
        walkTextNode(child,style);
      }
    };

    const controlLogicalWidth=(el)=>{
      const name=el.localName;
      if(extendedObjects.has(name)) return EXTENDED_UNITS;
      if(name==='ctrl'){
        const kind=[...el.children].find(x=>extendedCtrlKinds.has(x.localName));
        return kind?EXTENDED_UNITS:0;
      }
      // secPr and unknown run children are structural XML, not assumed to be
      // characters. Unknowns remain zero until their HWPX control semantics are
      // explicitly supported.
      return 0;
    };

    for(const run of $children(p,'run')){
      const style=run.getAttribute('charPrIDRef');
      for(const ch of [...run.children]){
        if(ch.localName==='t') walkTextNode(ch,style);
        else logical+=controlLogicalWidth(ch);
      }
    }
    return {text,spans,logicalLength:logical};
  }
  _appendFragmentSpans(host,flat,start,end,context='body'){
    for(const s of flat.spans){
      const ls=s.logicalStart==null?s.start:s.logicalStart, le=s.logicalEnd==null?s.end:s.logicalEnd;
      const a=Math.max(start,ls),b=Math.min(end,le);
      if(a<b){
        const va=s.start+(a-ls), vb=s.start+(b-ls);
        const span=document.createElement('span');
        this._applyCharStyle(span,s.style,context);
        span.textContent=flat.text.slice(va,vb);
        host.appendChild(span);
      }
    }
  }
  _renderParagraphLines(p,host,originX,originY,localScale=this.scale,segStart=0,segEnd=null,context='body'){
    const flat=this._flattenRuns(p), arr=$child(p,'linesegarray'), segs=arr?$children(arr,'lineseg'):[];
    if(!segs.length || !flat.text) return;
    const para=this.styles.paras.get(p.getAttribute('paraPrIDRef'))||{align:'left'};
    const from=Math.max(0,segStart||0), to=Math.min(segs.length,segEnd==null?segs.length:segEnd);
    for(let i=from;i<to;i++){
      const s=segs[i],start=num(s.getAttribute('textpos')),end=i+1<segs.length?num(segs[i+1].getAttribute('textpos')):(flat.logicalLength==null?flat.text.length:flat.logicalLength);
      const d=document.createElement('div'); d.className='hwpx-line';
      // Paragraph horizontal margins are paragraph-shape geometry, separate
      // from the cached lineSeg horzpos/horzsize. Negative intent is a hanging
      // indent: the first line stays at the paragraph left edge and following
      // lines move right. Positive intent affects only the first line.
      const pLeft=(para.left||0), pRight=(para.right||0), intent=(para.intent||0);
      const intentLeft=intent<0 ? (i>0?-intent:0) : (i===0?intent:0);
      const lineInset=Math.max(0,pLeft+intentLeft);
      const w=Math.max(0,(num(s.getAttribute('horzsize'))-lineInset-Math.max(0,pRight))*localScale);
      // PDF rasterization shows a consistent half-pixel left bias for body text at 794px A4.
      // Keep embedded-preview matching untouched; cells have their own grid/border coordinate system.
      const compat2018PictureLine=!this.matchEmbeddedPreview && context==='body' && !!this._activePictureBody && /^2018/.test(this.hancomCompat);
      const bodyXB = (!this.matchEmbeddedPreview && context==='body') ? ((this._activePureText && (this._activeColumnCount||1)===1)?HANCOM_COMPAT.bodyXSingleColumnPx:((/^2018/.test(this.hancomCompat)&&this._activePureText&&(this._activeColumnCount||1)>1)?HANCOM_COMPAT.bodyX2018MultiColumnPx:(compat2018PictureLine?HANCOM_COMPAT.bodyX2018PicturePx:HANCOM_COMPAT.bodyXDefaultPdfPx))) : 0;
      d.style.cssText=`position:absolute;left:${originX+(num(s.getAttribute('horzpos'))+lineInset)*localScale+bodyXB}px;top:${originY+num(s.getAttribute('vertpos'))*localScale}px;width:${w}px;height:${num(s.getAttribute('vertsize'))*localScale}px;white-space:pre;font-size:0;line-height:0;overflow:visible;text-align:${para.align==='justify' && i<segs.length-1?'justify':(para.align==='justify'?'left':para.align)};text-align-last:${para.align==='justify' && i<segs.length-1?'justify':'auto'};box-sizing:border-box;`;
      this._appendFragmentSpans(d,flat,start,end,context); host.appendChild(d);
    }
  }
  _borderTypeCss(type){
    const t=(type||'SOLID').toUpperCase();
    if(t==='DOUBLE' || t.includes('DOUBLE')) return 'double';
    if(t==='DOT' || t.includes('DOT_DOT') || t==='CIRCLE') return 'dotted';
    if(t.includes('DASH')) return 'dashed';
    return 'solid';
  }
  _borderScore(s){
    if(!s || (s.type||'NONE').toUpperCase()==='NONE') return [-1,-1,-1];
    const t=(s.type||'SOLID').toUpperCase();
    const rank=t.includes('DOUBLE')?5:(t==='SOLID'?4:(t.includes('DASH')?3:(t.includes('DOT')||t==='CIRCLE'?2:1)));
    return [mmToPx(s.width),rank,1];
  }
  _strongerBorder(a,b){
    const sa=this._borderScore(a), sb=this._borderScore(b);
    for(let i=0;i<sa.length;i++){ if(sa[i]!==sb[i]) return sa[i]>sb[i]?a:b; }
    // Stable tie-break: keep the edge owned by the earlier/left/top cell.
    return a||b;
  }
  _borderPaintColor(color,soften=false){
    if(!soften) return color||'#000';
    const c=color||'#000';
    const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    return m?`rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},.5)`:'rgba(0,0,0,.5)';
  }
  _borderCss(id,edgeMask=null,edgeStyles=null){
    const b=this.styles.borderFills.get(id);
    if(!b) return 'border:1px solid #111;background:transparent;';
    const css=[];
    for(const [xml,cssSide] of [['leftBorder','left'],['rightBorder','right'],['topBorder','top'],['bottomBorder','bottom']]){
      const s=edgeStyles?.[cssSide] || b[xml];
      const enabled=!edgeMask || edgeMask[cssSide]!==false;
      if(!enabled || !s || (s.type||'NONE').toUpperCase()==='NONE') css.push(`border-${cssSide}:0 solid transparent`);
      else {
        const type=this._borderTypeCss(s.type);
        let width=Math.max(.5,mmToPx(s.width));
        if(type==='double') width=Math.max(2,width);
        css.push(`border-${cssSide}:${width}px ${type} ${this._borderPaintColor(s.color,!!edgeMask)}`);
      }
    }
    css.push(`background:${b.fill}`);
    return css.join(';')+';';
  }
  _borderKey(s){
    if(!s || (s.type||'NONE').toUpperCase()==='NONE') return 'NONE';
    return `${(s.type||'SOLID').toUpperCase()}|${s.width||''}|${s.color||''}`;
  }
  _compressBorderSegments(items){
    const out=[];
    for(const it of items){
      const last=out[out.length-1];
      if(last && last.to===it.from && this._borderKey(last.style)===this._borderKey(it.style)) last.to=it.to;
      else out.push({...it});
    }
    return out;
  }
  _tableCellBorderResolution(rows,rowCnt,colCnt){
    const cells=[];
    const occ=Array.from({length:rowCnt},()=>Array(colCnt).fill(null));
    for(let ri=0;ri<rows.length;ri++){
      let seqCol=0;
      for(const tc of $children(rows[ri],'tc')){
        const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan');
        const ca=a?num(a.getAttribute('colAddr')):seqCol, ra=a?num(a.getAttribute('rowAddr')):ri;
        const cspan=Math.max(1,num(sp?.getAttribute('colSpan'),1)), rspan=Math.max(1,num(sp?.getAttribute('rowSpan'),1));
        const meta={tc,ca,ra,cspan,rspan}; cells.push(meta);
        for(let r=ra;r<Math.min(rowCnt,ra+rspan);r++) for(let c=ca;c<Math.min(colCnt,ca+cspan);c++) occ[r][c]=meta;
        seqCol=ca+cspan;
      }
    }
    const uniq=arr=>[...new Set(arr.filter(Boolean))];
    const edge=(m,side)=>{
      const b=this.styles.borderFills.get(m.tc.getAttribute('borderFillIDRef'));
      return b?.[side+'Border']||null;
    };
    const resolved=new Map();
    for(const m of cells){
      const leftN=uniq(Array.from({length:m.rspan},(_,i)=>occ[m.ra+i]?.[m.ca-1]));
      const topN=uniq(Array.from({length:m.cspan},(_,i)=>occ[m.ra-1]?.[m.ca+i]));
      const rightItems=[];
      for(let r=m.ra;r<Math.min(rowCnt,m.ra+m.rspan);r++){
        const n=occ[r]?.[m.ca+m.cspan];
        rightItems.push({from:r,to:r+1,style:this._strongerBorder(edge(m,'right'),n?edge(n,'left'):null)});
      }
      const bottomItems=[];
      for(let c=m.ca;c<Math.min(colCnt,m.ca+m.cspan);c++){
        const n=occ[m.ra+m.rspan]?.[c];
        bottomItems.push({from:c,to:c+1,style:this._strongerBorder(edge(m,'bottom'),n?edge(n,'top'):null)});
      }
      const rightSeg=this._compressBorderSegments(rightItems), bottomSeg=this._compressBorderSegments(bottomItems);
      const rightSegmented=rightSeg.length>1 && new Set(rightSeg.map(x=>this._borderKey(x.style))).size>1;
      const bottomSegmented=bottomSeg.length>1 && new Set(bottomSeg.map(x=>this._borderKey(x.style))).size>1;
      resolved.set(m.tc,{
        mask:{left:leftN.length===0,top:topN.length===0,right:!rightSegmented,bottom:!bottomSegmented},
        styles:{left:edge(m,'left'),top:edge(m,'top'),right:rightSeg[0]?.style||edge(m,'right'),bottom:bottomSeg[0]?.style||edge(m,'bottom')},
        segments:{right:rightSegmented?rightSeg:[],bottom:bottomSegmented?bottomSeg:[]}
      });
    }
    return resolved;
  }
  _renderBorderSegments(cell,br,ca,ra,xPos,yPos){
    if(!br?.segments) return;
    const add=(side,seg)=>{
      const s=seg.style;
      if(!s || (s.type||'NONE').toUpperCase()==='NONE') return;
      const type=this._borderTypeCss(s.type);
      let width=Math.max(.5,mmToPx(s.width)); if(type==='double') width=Math.max(2,width);
      const color=this._borderPaintColor(s.color,true), d=document.createElement('div');
      d.className='hwpx-border-segment';
      if(side==='right'){
        const top=(yPos[seg.from]||0)-(yPos[ra]||0), h=(yPos[seg.to]||0)-(yPos[seg.from]||0);
        d.style.cssText=`position:absolute;right:0;top:${top}px;width:0;height:${h}px;border-right:${width}px ${type} ${color};pointer-events:none;z-index:20;`;
      } else {
        const left=(xPos[seg.from]||0)-(xPos[ca]||0), w=(xPos[seg.to]||0)-(xPos[seg.from]||0);
        d.style.cssText=`position:absolute;left:${left}px;bottom:0;width:${w}px;height:0;border-bottom:${width}px ${type} ${color};pointer-events:none;z-index:20;`;
      }
      cell.appendChild(d);
    };
    for(const seg of br.segments.right||[]) add('right',seg);
    for(const seg of br.segments.bottom||[]) add('bottom',seg);
  }
  _renderPicture(pic,host,x,y,w,h){
    const img=$all(pic,'img')[0]; if(!img) return;
    const sz=this._shapeSize(pic), iw=sz.width*this.scale, ih=sz.height*this.scale;
    if(!iw||!ih) return;
    const im=document.createElement('img'); im.src=this.resourceMap.get(img.getAttribute('binaryItemIDRef'))||'';
    const left=x+(w>0?(w-iw)/2:0), top=y+(h>0?(h-ih)/2:0);
    im.style.cssText=`position:absolute;left:${left}px;top:${top}px;width:${iw}px;height:${ih}px;object-fit:fill;`;
    host.appendChild(im);
  }
  _equationTokens(script){
    return (script||'').match(/\+\-|[{}^_]|[A-Za-z]+|\d+(?:\.\d+)?|[^\s]/g)||[];
  }
  _equationMath(script){
    const NS='http://www.w3.org/1998/Math/MathML', toks=this._equationTokens(script); let i=0;
    const el=(name,text)=>{const n=document.createElementNS(NS,name); if(text!=null)n.textContent=text; return n;};
    const opMap={'+-':'±','-+':'∓','times':'×','cdot':'·','leq':'≤','geq':'≥','neq':'≠','infty':'∞'};
    const atom=()=>{
      if(i>=toks.length) return el('mrow');
      let t=toks[i++], n;
      if(t==='{'){ n=seq('}'); if(toks[i]==='}')i++; }
      else if(t==='sqrt') { const r=el('msqrt'); r.appendChild(atom()); n=r; }
      else if(/^\d/.test(t)) n=el('mn',t);
      else if(/^[A-Za-z]+$/.test(t) && !(t in opMap)) {
        n=el('mrow'); for(const ch of t) n.appendChild(el('mi',ch));
      } else n=el('mo',opMap[t]||t);
      while(i<toks.length && (toks[i]==='^'||toks[i]==='_')){
        const kind=toks[i++], rhs=atom(), wrap=el(kind==='^'?'msup':'msub'); wrap.append(n,rhs); n=wrap;
      }
      return n;
    };
    const seq=(stop=null)=>{
      const row=el('mrow');
      while(i<toks.length && toks[i]!==stop){
        if(toks[i]==='over'){
          i++; const den=atom(), nume=row.lastChild||el('mrow'); if(row.lastChild) row.removeChild(row.lastChild);
          const f=el('mfrac'); f.append(nume,den); row.appendChild(f); continue;
        }
        row.appendChild(atom());
      }
      return row;
    };
    const math=el('math'); math.setAttribute('display','inline'); math.appendChild(seq()); return math;
  }
  _renderEquation(eq,host,x,y,lineWidth=0,paraAlign='left'){
    const script=$child(eq,'script')?.textContent||''; if(!script.trim()) return;
    const sz=this._shapeSize(eq), w=sz.width*this.scale, h=sz.height*this.scale; if(!w||!h) return;
    let left=x;
    // Numbered HWP equations are commonly a centered formula plus a right-aligned number
    // in the same RIGHT-aligned paragraph. Keep the formula centered while the existing
    // text renderer continues to place the equation number from hp:t.
    if((eq.getAttribute('numberingType')||'').toUpperCase()==='EQUATION' && paraAlign==='right' && lineWidth>w) left=x+(lineWidth-w)/2;
    const box=document.createElement('div'); box.className='hwpx-equation';
    box.dataset.script=script;
    box.style.cssText=`position:absolute;left:${left}px;top:${y}px;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;overflow:visible;color:${cssColor(eq.getAttribute('textColor'),'#000')};pointer-events:none;`;
    const math=this._equationMath(script);
    const base=num(eq.getAttribute('baseUnit'),900)*this.scale;
    const eqFont=Math.min(h*0.72,base*1.45);
    math.style.cssText=`font-family:'STIX Two Math','Cambria Math','Times New Roman',serif;font-size:${eqFont}px;line-height:1;`;
    box.appendChild(math); host.appendChild(box);
  }
  _subListMetrics(sub){
    let maxBottom=0;
    for(const p of $children(sub,'p')){
      const arr=$child(p,'linesegarray');
      if(arr) for(const s of $children(arr,'lineseg')) maxBottom=Math.max(maxBottom,num(s.getAttribute('vertpos'))+num(s.getAttribute('vertsize')));
    }
    return maxBottom;
  }
  _renderSubList(sub,host,x,y,w,h,margin={left:0,right:0,top:0,bottom:0},context='body'){
    const maxBottom=this._subListMetrics(sub)*this.scale;
    const valign=(sub.getAttribute('vertAlign')||'TOP').toUpperCase();
    const innerH=Math.max(0,h-margin.top-margin.bottom);
    let oy=y+margin.top;
    if(valign==='CENTER' && maxBottom) oy=y+margin.top+Math.max(0,(innerH-maxBottom)/2);
    else if(valign==='BOTTOM' && maxBottom) oy=y+h-margin.bottom-maxBottom;
    const ox=x+margin.left;
    for(const p of $children(sub,'p')){
      // Render text runs and embedded objects in the same paragraph coordinate system.
      this._renderParagraphLines(p,host,ox,oy,this.scale,0,null,context);
      const seg=$child($child(p,'linesegarray')||document.createElement('x'),'lineseg');
      const px=ox+(seg?num(seg.getAttribute('horzpos'))*this.scale:0);
      const py=oy+(seg?num(seg.getAttribute('vertpos'))*this.scale:0);
      for(const run of $children(p,'run')){
        const tbl=$child(run,'tbl'); if(tbl) this._renderTable(tbl,host,px,py);
        const rect=$child(run,'rect'); if(rect) this._renderRect(rect,host,px,py);
        const pic=$child(run,'pic'); if(pic) this._renderPicture(pic,host,px,py,w,h);
        const eq=$child(run,'equation'); if(eq){ const para=this.styles.paras.get(p.getAttribute('paraPrIDRef'))||{align:'left'}; this._renderEquation(eq,host,px,py,w,para.align); }
      }
    }
  }
  _cellMargins(tc){
    const m=$child(tc,'cellMargin');
    return {left:num(m?.getAttribute('left'))*this.scale,right:num(m?.getAttribute('right'))*this.scale,top:num(m?.getAttribute('top'))*this.scale,bottom:num(m?.getAttribute('bottom'))*this.scale};
  }
  _renderTable(tbl,host,x,y,rowStart=0,rowEnd=null,repeatHeader=false){
    if(!this.matchEmbeddedPreview && tbl.getAttribute('pageBreak')==='CELL' && num(tbl.getAttribute('rowCnt'))>10){ x+=HANCOM_COMPAT.flowingTablePixelNudge; y+=HANCOM_COMPAT.flowingTablePixelNudge; }
    const box=document.createElement('div'); box.className='hwpx-table';
    const z=num(tbl.getAttribute('zOrder'));
    box.style.cssText=`position:absolute;left:${x}px;top:${y}px;z-index:${z};`;
    host.appendChild(box);
    const rows=$children(tbl,'tr');
    const fragmentMode=rowStart>0 || rowEnd!=null || repeatHeader;
    rowEnd=rowEnd==null?rows.length:Math.min(rows.length,rowEnd);
    const headerIdx=rows.map((tr,i)=>({tr,i})).filter(({tr})=>$children(tr,'tc').some(tc=>tc.getAttribute('header')==='1')).map(x=>x.i);
    const selectedIdx=[];
    if(repeatHeader && rowStart>0) for(const i of headerIdx) if(i<rowStart) selectedIdx.push(i);
    for(let i=rowStart;i<rowEnd;i++) selectedIdx.push(i);
    const rowCnt=Math.max(num(tbl.getAttribute('rowCnt')),rows.length);
    const colCnt=Math.max(num(tbl.getAttribute('colCnt')), ...rows.map(tr=>$children(tr,'tc').reduce((m,tc)=>{
      const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan');
      return Math.max(m,num(a?.getAttribute('colAddr'))+Math.max(1,num(sp?.getAttribute('colSpan'),1)));
    },0)),0);

    // Infer stable grid tracks from single-span cells. Merged cells retain their explicit
    // cellSz so documents with intentionally non-uniform merged widths still render faithfully.
    const colW=Array(colCnt).fill(0), rowH=Array(rowCnt).fill(0);
    for(const tr of rows) for(const tc of $children(tr,'tc')){
      const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan'), cs=$child(tc,'cellSz');
      const ca=num(a?.getAttribute('colAddr')), ra=num(a?.getAttribute('rowAddr'));
      const cspan=Math.max(1,num(sp?.getAttribute('colSpan'),1)), rspan=Math.max(1,num(sp?.getAttribute('rowSpan'),1));
      if(cspan===1) colW[ca]=Math.max(colW[ca]||0,num(cs?.getAttribute('width')));
      if(rspan===1){
        const sub=$child(tc,'subList'), cm=$child(tc,'cellMargin');
        const contentMin=(tbl.getAttribute('pageBreak')==='CELL' && num(tbl.getAttribute('rowCnt'))>10) ? (sub?this._subListMetrics(sub):0)+num(cm?.getAttribute('top'))+num(cm?.getAttribute('bottom')) : 0;
        rowH[ra]=Math.max(rowH[ra]||0,num(cs?.getAttribute('height')),contentMin);
      }
    }
    // Some Hancom files use a one-row floating table as a page-width layout frame.
    // In those files cellSz.height can remain at one text line while tbl/sz.height and
    // the subList line cache describe the actual frame height. Honor the outer table
    // height only for this unambiguous one-row case so ordinary table layout is untouched.
    if(rowCnt===1 && rows.length===1){
      const tableSz=$child(tbl,'sz'), tableH=num(tableSz?.getAttribute('height'));
      let contentH=0;
      for(const tc of $children(rows[0],'tc')){
        const sub=$child(tc,'subList'), cm=$child(tc,'cellMargin');
        contentH=Math.max(contentH,(sub?this._subListMetrics(sub):0)+num(cm?.getAttribute('top'))+num(cm?.getAttribute('bottom')));
      }
      if(tableH>rowH[0] && contentH>rowH[0]) rowH[0]=Math.max(tableH,contentH);
    }

    // Fill any tracks that only occur inside merged cells by evenly distributing the missing width/height.
    for(const tr of rows) for(const tc of $children(tr,'tc')){
      const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan'), cs=$child(tc,'cellSz');
      const ca=num(a?.getAttribute('colAddr')), ra=num(a?.getAttribute('rowAddr'));
      const cspan=Math.max(1,num(sp?.getAttribute('colSpan'),1)), rspan=Math.max(1,num(sp?.getAttribute('rowSpan'),1));
      if(cspan>1){
        const known=colW.slice(ca,ca+cspan).reduce((q,v)=>q+v,0), missing=[];
        for(let k=ca;k<ca+cspan;k++) if(!colW[k]) missing.push(k);
        if(missing.length){ const each=Math.max(0,(num(cs?.getAttribute('width'))-known)/missing.length); missing.forEach(k=>colW[k]=each); }
      }
      if(rspan>1){
        const known=rowH.slice(ra,ra+rspan).reduce((q,v)=>q+v,0), missing=[];
        for(let k=ra;k<ra+rspan;k++) if(!rowH[k]) missing.push(k);
        if(missing.length){ const each=Math.max(0,(num(cs?.getAttribute('height'))-known)/missing.length); missing.forEach(k=>rowH[k]=each); }
      }
    }
    const xPos=[0],yPos=[0];
    for(const v of colW) xPos.push(xPos[xPos.length-1]+v*this.scale);
    for(const v of rowH) yPos.push(yPos[yPos.length-1]+v*this.scale);
    // In PDF/general rendering mode, resolve each shared grid edge from both adjacent
    // cells. This prevents double borders and lets merged cells honor the stronger
    // neighboring edge when widths/styles/colors differ.
    const borderResolution=!this.matchEmbeddedPreview ? this._tableCellBorderResolution(rows,rowCnt,colCnt) : null;

    if(!fragmentMode){
      for(let ri=0;ri<rows.length;ri++){
        const tr=rows[ri]; let seqCol=0;
        for(const tc of $children(tr,'tc')){
          const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan'), cs=$child(tc,'cellSz');
          const ca=a?num(a.getAttribute('colAddr')):seqCol, ra=a?num(a.getAttribute('rowAddr')):ri;
          const cspan=Math.max(1,num(sp?.getAttribute('colSpan'),1)), rspan=Math.max(1,num(sp?.getAttribute('rowSpan'),1));
          const explicitW=num(cs?.getAttribute('width'))*this.scale, explicitH=num(cs?.getAttribute('height'))*this.scale;
          const gridW=(xPos[Math.min(colCnt,ca+cspan)]??xPos[colCnt])-(xPos[ca]??0);
          const gridH=(yPos[Math.min(rowCnt,ra+rspan)]??yPos[rowCnt])-(yPos[ra]??0);
          const cw=explicitW||gridW, ch=gridH||explicitH;
          const c=document.createElement('div'); c.className='hwpx-cell';
          const br=borderResolution?.get(tc);
          c.style.cssText=`position:absolute;left:${xPos[ca]||0}px;top:${yPos[ra]||0}px;width:${cw}px;height:${ch}px;box-sizing:border-box;overflow:hidden;${this._borderCss(tc.getAttribute('borderFillIDRef'), br?.mask || (!this.matchEmbeddedPreview ? {left:ca===0,top:ra===0,right:true,bottom:true} : ((tbl.getAttribute('pageBreak')==='CELL' && rowCnt>10) ? {left:ca===0,top:ra===0,right:true,bottom:true} : null)), br?.styles || null)}`;
          box.appendChild(c);
          const sub=$child(tc,'subList');
          if(sub) this._renderSubList(sub,c,0,0,cw,ch,this._cellMargins(tc),'cell');
          this._renderBorderSegments(c,br,ca,ra,xPos,yPos);
          seqCol=ca+cspan;
        }
      }
    } else {
      let localY=0;
      for(const ri of selectedIdx){
        const tr=rows[ri]; let seqCol=0;
        const thisRowH=(rowH[ri]||0)*this.scale;
        for(const tc of $children(tr,'tc')){
          const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan'), cs=$child(tc,'cellSz');
          const ca=a?num(a.getAttribute('colAddr')):seqCol, ra=a?num(a.getAttribute('rowAddr')):ri;
          const cspan=Math.max(1,num(sp?.getAttribute('colSpan'),1)), rspan=Math.max(1,num(sp?.getAttribute('rowSpan'),1));
          const explicitW=num(cs?.getAttribute('width'))*this.scale;
          const gridW=(xPos[Math.min(colCnt,ca+cspan)]??xPos[colCnt])-(xPos[ca]??0);
          const spanH=rowH.slice(ra,Math.min(rowCnt,ra+rspan)).reduce((q,v)=>q+v,0)*this.scale;
          const cw=explicitW||gridW, ch=spanH||thisRowH;
          const c=document.createElement('div'); c.className='hwpx-cell';
          const br=borderResolution?.get(tc);
          const fragmentMask=!this.matchEmbeddedPreview ? {left:ca===0,top:ra===0,right:br?.segments?.right?.length?false:true,bottom:br?.segments?.bottom?.length?false:true} : ((tbl.getAttribute('pageBreak')==='CELL' && rowCnt>10) ? {left:ca===0,top:ra===0,right:true,bottom:true} : null);
          c.style.cssText=`position:absolute;left:${xPos[ca]||0}px;top:${localY}px;width:${cw}px;height:${ch}px;box-sizing:border-box;overflow:hidden;${this._borderCss(tc.getAttribute('borderFillIDRef'), fragmentMask, br?.styles || null)}`;
          box.appendChild(c);
          const sub=$child(tc,'subList');
          if(sub) this._renderSubList(sub,c,0,0,cw,ch,this._cellMargins(tc),'cell');
          this._renderBorderSegments(c,br,ca,ra,xPos,yPos);
          seqCol=ca+cspan;
        }
        localY+=thisRowH;
      }
    }
    return box;
  }
  _renderRect(rect,host,x,y){
    const sz=this._shapeSize(rect), w=sz.width*this.scale, h=sz.height*this.scale;
    const line=$child(rect,'lineShape'), c=document.createElement('div'); c.className='hwpx-rect';
    const color=cssColor(line?.getAttribute('color'),'#000'), width=Math.max(.5,num(line?.getAttribute('width'),60)*this.scale);
    c.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:${width}px solid ${color};box-sizing:border-box;overflow:hidden;background:#fff;z-index:${num(rect.getAttribute('zOrder'))};`;
    host.appendChild(c);
    const draw=$child(rect,'drawText'), sub=draw&&$child(draw,'subList'), tm=draw&&$child(draw,'textMargin');
    if(sub){
      const margin={left:num(tm?.getAttribute('left'))*this.scale,right:num(tm?.getAttribute('right'))*this.scale,top:num(tm?.getAttribute('top'))*this.scale,bottom:num(tm?.getAttribute('bottom'))*this.scale};
      this._renderSubList(sub,c,-width,-width,w,h,margin);
    }
    return c;
  }
  _directLineSegs(p){
    const arr=$child(p,'linesegarray');
    return arr?$children(arr,'lineseg'):[];
  }
  _tableRowHeightsHwp(tbl){
    const rows=$children(tbl,'tr'), rowCnt=Math.max(num(tbl.getAttribute('rowCnt')),rows.length), rowH=Array(rowCnt).fill(0);
    for(const tr of rows) for(const tc of $children(tr,'tc')){
      const a=$child(tc,'cellAddr'), sp=$child(tc,'cellSpan'), cs=$child(tc,'cellSz');
      const ra=num(a?.getAttribute('rowAddr')), rspan=Math.max(1,num(sp?.getAttribute('rowSpan'),1));
      if(rspan===1){ const sub=$child(tc,'subList'), cm=$child(tc,'cellMargin'); rowH[ra]=Math.max(rowH[ra]||0,num(cs?.getAttribute('height')),(sub?this._subListMetrics(sub):0)+num(cm?.getAttribute('top'))+num(cm?.getAttribute('bottom'))); }
    }
    return rowH;
  }
  _columnInfo(section=this.section){
    const cp=$all(section,'colPr')[0];
    const count=Math.max(1,num(cp?.getAttribute('colCount'),1));
    const sameSz=cp?.getAttribute('sameSz')!=='0';
    const sameGap=num(cp?.getAttribute('sameGap'));
    const sizes=$children(cp||section,'colSz').map(x=>({width:num(x.getAttribute('width')),gap:num(x.getAttribute('gap'))}));
    if(!sameSz && sizes.length){
      const cols=[];
      for(let i=0;i<count;i++) cols.push({width:num(sizes[i]?.width),gap:i<count-1?num(sizes[i]?.gap):0});
      return {count,gap:sameGap,columns:cols,sameSz:false};
    }
    return {count,gap:sameGap,columns:null,sameSz:true};
  }
  _columnGeometry(section=this.section){
    const info=this._columnInfo(section), page=this._parsePage(section);
    const contentW=page.width-page.margin.left-page.margin.right;
    if(info.columns?.length){
      // Hancom's cached lineSeg horzsize is the most faithful source for unequal
      // newspaper-column widths. Some generated/saved HWPX files keep colSz values
      // whose proportions are correct but whose absolute widths differ from the
      // final layout cache. Use distinct horzsize values in first-appearance order
      // when all columns can be identified; otherwise fall back to colSz.
      const seen=[];
      for(const p of $children(section.documentElement,'p')){
        for(const seg of this._directLineSegs(p)){
          const w=num(seg.getAttribute('horzsize'));
          if(w>0 && !seen.some(v=>Math.abs(v-w)<2)) seen.push(w);
          if(seen.length>=info.count) break;
        }
        if(seen.length>=info.count) break;
      }
      const cachedWidths=seen.length>=info.count?seen.slice(0,info.count):null;
      const cols=[]; let x=0;
      // When cached widths are available they are already in final page HWP units, while
      // colSz gap values may still be in the normalized 32768-unit column space. Derive
      // the final gap from the remaining content width instead of mixing coordinate spaces.
      const cachedGap=(cachedWidths && info.count>1) ? Math.max(0,(contentW-cachedWidths.reduce((a,b)=>a+b,0))/(info.count-1)) : null;
      for(let i=0;i<info.count;i++){
        const spec=info.columns[i]||{};
        const width=(cachedWidths?.[i])||spec.width||Math.max(1,(contentW-(info.count-1)*info.gap)/info.count);
        const gap=i<info.count-1?(cachedGap ?? spec.gap ?? info.gap):0;
        cols.push({x,width,gap}); x+=width+gap;
      }
      return {count:info.count,columns:cols,contentW};
    }
    const width=(contentW-(info.count-1)*info.gap)/info.count;
    const cols=[]; let x=0;
    for(let i=0;i<info.count;i++){ const gap=i<info.count-1?info.gap:0; cols.push({x,width,gap}); x+=width+gap; }
    return {count:info.count,columns:cols,contentW};
  }
  _splitSectionPages(section){
    const paragraphs=$children(section.documentElement,'p');
    if(!paragraphs.length) return [[]];
    const pageInfo=this._parsePage(section), cols=this._columnInfo(section);
    const contentH=Math.max(1,pageInfo.height-pageInfo.margin.top-pageInfo.margin.bottom);
    const resetThreshold=Math.max(3000,contentH*.20);
    const pages=[[]];
    let col=0, prevLastV=null;
    const advanceColumn=()=>{ col++; if(col>=cols.count){ pages.push([]); col=0; } };
    const advancePage=()=>{ if(pages[pages.length-1].length) pages.push([]); col=0; };
    for(const p of paragraphs){
      const segs=this._directLineSegs(p);
      const explicitPage=p.getAttribute('pageBreak')==='1';
      const explicitCol=p.getAttribute('columnBreak')==='1';
      if(explicitPage) advancePage();
      else if(explicitCol) advanceColumn();
      if(!segs.length){ pages[pages.length-1].push({p,segStart:0,segEnd:0,column:col}); continue; }
      const flowTbl=$children(p,'run').map(r=>$child(r,'tbl')).find(t=>t && t.getAttribute('pageBreak')==='CELL' && $child(t,'pos')?.getAttribute('flowWithText')==='1');
      if(flowTbl && cols.count===1 && num(flowTbl.getAttribute('rowCnt'))>10){
        const rh=this._tableRowHeightsHwp(flowTbl), footer=pageInfo.margin.footer||0;
        const header=pageInfo.margin.header||0;
        // HWP lineSeg vertpos is measured in the printable body band. Header/footer bands
        // further reduce the usable vertical extent for flowed tables.
        const bodyBottom=pageInfo.height-pageInfo.margin.top-pageInfo.margin.bottom-header-footer;
        const line=segs[0];
        // The table anchor itself is already represented by the paragraph lineSeg vertpos.
        // Applying an extra line advance shifts the table down and changes the row split.
        const tableOffset=0;
        let rs=0, y=num(line.getAttribute('vertpos')), first=true;
        while(rs<rh.length){
          let used=0, re=rs;
          const headerH=first?0:rh.filter((_,i)=>{ const tr=$children(flowTbl,'tr')[i]; return tr && $children(tr,'tc').some(tc=>tc.getAttribute('header')==='1'); }).reduce((q,v)=>q+v,0);
          const avail=Math.max(1,bodyBottom-(first?y:tableOffset)-headerH);
          while(re<rh.length && used+rh[re]<=avail){ used+=rh[re]; re++; }
          if(re===rs) re=Math.min(rh.length,rs+1);
          pages[pages.length-1].push({p,segStart:0,segEnd:segs.length,column:0,tableRows:{start:rs,end:re,repeatHeader:!first,offsetHwp:tableOffset,continuation:!first}});
          rs=re; first=false;
          if(rs<rh.length) pages.push([]);
        }
        // The table may itself have advanced to a continuation page. The following
        // paragraph's cached vertpos is relative to that final page, so comparing it
        // against the table-anchor vertpos would create a spurious extra page.
        prevLastV=null;
        continue;
      }
      let chunkStart=0;
      for(let i=0;i<segs.length;i++){
        const v=num(segs[i].getAttribute('vertpos'));
        if(i===0 && !explicitPage && !explicitCol && prevLastV!=null && v+resetThreshold<prevLastV) advanceColumn();
        if(i>0){
          const pv=num(segs[i-1].getAttribute('vertpos'));
          if(v+resetThreshold<pv){
            pages[pages.length-1].push({p,segStart:chunkStart,segEnd:i,column:col});
            advanceColumn(); chunkStart=i;
          }
        }
      }
      pages[pages.length-1].push({p,segStart:chunkStart,segEnd:segs.length,column:col});
      prevLastV=num(segs[segs.length-1].getAttribute('vertpos'));
    }
    return pages.filter(pg=>pg.length);
  }
  _shapeSize(obj){
    const cur=$child(obj,'curSz'), sz=$child(obj,'sz'), org=$child(obj,'orgSz');
    const c={width:num(cur?.getAttribute('width')),height:num(cur?.getAttribute('height'))};
    const a={width:num(sz?.getAttribute('width')),height:num(sz?.getAttribute('height'))};
    const o={width:num(org?.getAttribute('width')),height:num(org?.getAttribute('height'))};
    return {width:c.width||a.width||o.width,height:c.height||a.height||o.height};
  }
  _pageDecorationApplies(ctrl,pageNumber){
    const t=(ctrl?.getAttribute('applyPageType')||'BOTH').toUpperCase();
    if(t==='BOTH' || t==='ALL') return true;
    if(t==='ODD') return pageNumber%2===1;
    if(t==='EVEN') return pageNumber%2===0;
    return true;
  }
  _renderDecorationParagraph(p,host,x,y,w,pageNumber,context='body'){
    const arr=$child(p,'linesegarray'), segs=arr?$children(arr,'lineseg'):[];
    if(!segs.length) return;
    const seg=segs[0], top=y+num(seg.getAttribute('vertpos'))*this.scale, h=num(seg.getAttribute('vertsize'))*this.scale;
    const runs=$children(p,'run');
    const pageRun=runs.find(r=>$all(r,'autoNum').some(a=>(a.getAttribute('numType')||'').toUpperCase()==='PAGE'));
    if(pageRun){
      const d=document.createElement('div'); d.className='hwpx-footer-page';
      d.style.cssText=`position:absolute;left:${x}px;top:${top}px;width:${w}px;height:${h}px;text-align:center;white-space:pre;line-height:1;`;
      const sp=document.createElement('span'); this._applyCharStyle(sp,pageRun.getAttribute('charPrIDRef'),context); sp.textContent=String(pageNumber);
      d.appendChild(sp); host.appendChild(d);
    } else {
      let handledTab=false;
      for(const run of runs){
        const t=$child(run,'t'); if(!t) continue;
        const tabs=$children(t,'tab'); if(!tabs.length) continue;
        const parts=[]; let cur='';
        for(const n of t.childNodes){
          if(n.nodeType===3) cur+=n.nodeValue||'';
          else if(n.nodeType===1 && n.localName==='tab'){ parts.push(cur); cur=''; }
          else if(n.nodeType===1) cur+=n.textContent||'';
        }
        parts.push(cur);
        const d=document.createElement('div'); d.className='hwpx-header-tabline';
        d.style.cssText=`position:absolute;left:${x}px;top:${top}px;width:${w}px;height:${h}px;white-space:pre;line-height:1;`;
        const left=document.createElement('span'), right=document.createElement('span');
        left.style.position='absolute';left.style.left='0';left.style.top='0';this._applyCharStyle(left,run.getAttribute('charPrIDRef'),context);
        right.style.position='absolute';right.style.right='0';right.style.top='0';this._applyCharStyle(right,run.getAttribute('charPrIDRef'),context);
        left.textContent=parts[0]||''; right.textContent=parts.slice(1).join(''); d.append(left,right); host.appendChild(d); handledTab=true;
      }
      if(!handledTab) this._renderParagraphLines(p,host,x,y,this.scale,0,null,context);
    }
    // Header/footer rules are commonly stored as hp:line objects in a separate paragraph.
    for(const run of runs) for(const line of $children(run,'line')){
      const sz=this._shapeSize(line), ls=$child(line,'lineShape');
      const width=(sz.width||num($child(line,'sz')?.getAttribute('width')))*this.scale;
      const rule=document.createElement('div'); rule.className='hwpx-header-rule';
      rule.style.cssText=`position:absolute;left:${x}px;top:${top}px;width:${width||w}px;height:0;border-top:${Math.max(.5,num(ls?.getAttribute('width'),50)*this.scale)}px solid ${cssColor(ls?.getAttribute('color'),'#000')};box-sizing:border-box;`;
      host.appendChild(rule);
    }
  }
  _bodyLeftCompatAdjust(section=this.section){
    // Embedded-preview matching and direct-PDF matching are intentionally
    // separate compatibility targets. Preserve the frozen Preview raster path
    // byte-for-byte in geometry, while direct-PDF rendering uses the actual
    // page/column origin when a real header control is present.
    const legacy=/^2018/.test(this.hancomCompat)?0:HANCOM_COMPAT.bodyLeft2022NoExplicitHeader;
    if(this.matchEmbeddedPreview) return this.page.margin.header>0?legacy:0;
    if($all(section,'header').length) return 0;
    return this.page.margin.header>0?legacy:0;
  }
  _renderPageDecorations(section,page,pageNumber){
    const compat2018=/^2018/.test(this.hancomCompat);
    const bodyLeftAdjust=this._bodyLeftCompatAdjust(section);
    const x=this.previewInsetX+(this.page.margin.left+bodyLeftAdjust)*this.scale;
    const w=(this.page.width-this.page.margin.left-this.page.margin.right)*this.scale;
    const pageH=this.page.height*this.scale;
    for(const hctrl of $all(section,'header')){
      if(!this._pageDecorationApplies(hctrl,pageNumber)) continue;
      const sub=$child(hctrl,'subList'); if(!sub) continue;
      const y=this.previewInsetY+this.page.margin.header*this.scale;
      for(const p of $children(sub,'p')) this._renderDecorationParagraph(p,page,x,y,w,pageNumber,'body');
      break;
    }
    for(const fctrl of $all(section,'footer')){
      if(!this._pageDecorationApplies(fctrl,pageNumber)) continue;
      const sub=$child(fctrl,'subList'); if(!sub) continue;
      const ps=$children(sub,'p');
      for(const p of ps){
        const seg=this._directLineSegs(p)[0];
        const lineH=num(seg?.getAttribute('vertsize'),900)*this.scale;
        const y=this.previewInsetY+pageH-this.page.margin.footer*this.scale-lineH;
        this._renderDecorationParagraph(p,page,x,y,w,pageNumber,'body');
      }
      break;
    }
  }
  _objectAnchor(obj,px,py,ox,oy){
    const pos=$child(obj,'pos');
    if(!pos || pos.getAttribute('treatAsChar')==='1') return {x:px,y:py,inline:true};
    const sz=this._shapeSize(obj);
    const w=sz.width*this.scale, h=sz.height*this.scale;
    const pageW=this.page.width*this.scale, pageH=this.page.height*this.scale;
    const contentW=(this.page.width-this.page.margin.left-this.page.margin.right)*this.scale;
    const contentH=(this.page.height-this.page.margin.top-this.page.margin.bottom)*this.scale;
    const hr=(pos.getAttribute('horzRelTo')||'PARA').toUpperCase();
    const vr=(pos.getAttribute('vertRelTo')||'PARA').toUpperCase();
    // Paragraph-relative floating objects in HWPX commonly have their effective offsets
    // already baked into the paragraph line-segment coordinates. Preserve that behavior
    // to avoid double-applying offsets; explicit page/column-relative anchors are resolved below.
    if(hr==='PARA' && vr==='PARA') return {x:px,y:py,inline:false};
    const ha=(pos.getAttribute('horzAlign')||'LEFT').toUpperCase();
    const va=(pos.getAttribute('vertAlign')||'TOP').toUpperCase();
    const hoff=num(pos.getAttribute('horzOffset'))*this.scale, voff=num(pos.getAttribute('vertOffset'))*this.scale;
    let bx=px,bw=0,by=py,bh=0;
    if(hr==='COLUMN'){ bx=ox; bw=contentW; }
    else if(hr==='PAGE'){ const bodyLeftAdjust=this._bodyLeftCompatAdjust(this.section); bx=this.previewInsetX+(this.page.margin.left+bodyLeftAdjust)*this.scale; bw=contentW; }
    else if(hr==='PAPER'){ bx=this.previewInsetX+HANCOM_COMPAT.paperOriginX*this.scale; bw=pageW; }
    if(vr==='COLUMN'){ by=oy; bh=contentH; }
    else if(vr==='PAGE'){ const compat2018=/^2018/.test(this.hancomCompat); const bodyTopAdjust=this.page.margin.header>0?Math.max(0,this.page.margin.header-HANCOM_COMPAT.pageHeaderTopBase+(compat2018?HANCOM_COMPAT.pageHeaderTop2018Extra:0)):0; by=this.previewInsetY+(this.page.margin.top+bodyTopAdjust)*this.scale; bh=contentH; }
    else if(vr==='PAPER'){ by=this.previewInsetY+HANCOM_COMPAT.paperOriginY*this.scale; bh=pageH; }
    let x=bx+hoff,y=by+voff;
    if(bw){ if(ha==='CENTER') x=bx+(bw-w)/2+hoff; else if(ha==='RIGHT') x=bx+bw-w-hoff; }
    if(bh){ if(va==='CENTER') y=by+(bh-h)/2+voff; else if(va==='BOTTOM') y=by+bh-h-voff; }
    return {x,y,inline:false};
  }
  _renderSectionPage(section,paragraphs,container){
    const oldSection=this.section, oldPage=this.page, oldScale=this.scale;
    this.section=section;
    this.page=this._parsePage(section);
    const logicalW=this.targetWidth-2*this.previewInsetX;
    this.scale=logicalW/this.page.width;

    const page=document.createElement('div'); page.className='hwpx-page';
    page.style.cssText=`position:relative;width:${this.targetWidth}px;height:${this.targetWidth*this.page.height/this.page.width}px;background:#fff;overflow:hidden;box-shadow:0 1px 12px #999;flex:none;`;
    container.appendChild(page);
    const pageNumber=container.querySelectorAll('.hwpx-page').length;
    const compat2018=/^2018/.test(this.hancomCompat);
    const bodyTopAdjust=this.page.margin.header>0?Math.max(0,this.page.margin.header-HANCOM_COMPAT.pageHeaderTopBase+(compat2018?HANCOM_COMPAT.pageHeaderTop2018Extra:0)):0;
    const bodyLeftAdjust=this._bodyLeftCompatAdjust(section);
    const baseOx=this.previewInsetX+(this.page.margin.left+bodyLeftAdjust)*this.scale, oy=this.previewInsetY+(this.page.margin.top+bodyTopAdjust)*this.scale;
    const cols=this._columnGeometry(section);
    const oldActiveColumnCount=this._activeColumnCount, oldActivePureText=this._activePureText, oldActivePictureBody=this._activePictureBody; this._activeColumnCount=cols.count; const hasTblRect=paragraphs.some(e=>{const p=e?.p||e; return $children(p,'run').some(r=>$child(r,'tbl')||$child(r,'rect'));}); const hasPic=paragraphs.some(e=>{const p=e?.p||e; return $children(p,'run').some(r=>$child(r,'pic'));}); this._activePureText=!hasTblRect&&!hasPic; this._activePictureBody=!hasTblRect&&hasPic;
    for(const entry of paragraphs){
      const p=entry?.p||entry, segs=this._directLineSegs(p), si=entry?.segStart||0, se=entry?.segEnd==null?segs.length:entry.segEnd;
      const seg=segs[si]||null, column=entry?.column||0;
      const colSpec=cols.columns[Math.min(column,cols.columns.length-1)]||cols.columns[0]||{x:0,width:cols.contentW};
      const ox=baseOx+colSpec.x*this.scale;
      const py=oy+(seg?num(seg.getAttribute('vertpos'))*this.scale:0), px=ox+(seg?num(seg.getAttribute('horzpos'))*this.scale:0);
      let obj=false;
      for(const run of $children(p,'run')){
        const tbl=$child(run,'tbl'); if(tbl){
          const a=this._objectAnchor(tbl,px,py,ox,oy), tp=$child(tbl,'pos'), om=$child(tbl,'outMargin'), tf=entry?.tableRows;
          const ty=a.inline && tp?.getAttribute('horzRelTo')==='PARA' ? num(om?.getAttribute('top'))*this.scale : 0;
          const fy=tf ? ((tf.continuation?oy:a.y) + num(tf.offsetHwp)*this.scale) : (a.y+ty);
          this._renderTable(tbl,page,a.x,fy,tf?.start||0,tf?.end??null,!!tf?.repeatHeader); obj=true;
        }
        const rect=$child(run,'rect'); if(rect){ const a=this._objectAnchor(rect,px,py,ox,oy); this._renderRect(rect,page,a.x,a.y); obj=true; }
        const pic=$child(run,'pic'); if(pic){ const a=this._objectAnchor(pic,px,py,ox,oy); const picY=a.y+( /^2018/.test(this.hancomCompat) ? HANCOM_COMPAT.pictureY2018*this.scale : 0 ); this._renderPicture(pic,page,a.x,picY,0,0); obj=true; }
        const eq=$child(run,'equation'); if(eq){ const a=this._objectAnchor(eq,px,py,ox,oy), para=this.styles.paras.get(p.getAttribute('paraPrIDRef'))||{align:'left'}; const lineW=(seg?num(seg.getAttribute('horzsize'))*this.scale:colSpec.width*this.scale); this._renderEquation(eq,page,a.x,a.y,lineW,para.align); obj=true; }
      }
      const hasDirectText=$children(p,'run').some(r=>$children(r,'t').some(t=>(t.textContent||'').length));
      if(!obj || hasDirectText) this._renderParagraphLines(p,page,ox,oy,this.scale,si,se);
    }
    this._renderPageDecorations(section,page,pageNumber);
    this.section=oldSection; this.page=oldPage; this.scale=oldScale; this._activeColumnCount=oldActiveColumnCount; this._activePureText=oldActivePureText; this._activePictureBody=oldActivePictureBody;
    return page;
  }
  _renderSection(section,container){
    return this._splitSectionPages(section).map(paragraphs=>this._renderSectionPage(section,paragraphs,container));
  }
  render(container){
    container.innerHTML='';
    const prevDisplay=container.style.display, prevDirection=container.style.flexDirection, prevGap=container.style.gap;
    const groups=this.sections.map(s=>({section:s.xml,pages:this._splitSectionPages(s.xml)}));
    const pageCount=groups.reduce((n,g)=>n+g.pages.length,0);
    if(pageCount>1){
      container.style.display='flex'; container.style.flexDirection='column'; container.style.gap=`${this.pageGap}px`;
    }
    this.pages=[];
    for(const g of groups) for(const paragraphs of g.pages) this.pages.push(this._renderSectionPage(g.section,paragraphs,container));
    if(pageCount<=1){ container.style.display=prevDisplay; container.style.flexDirection=prevDirection; container.style.gap=prevGap; }
    return this.pages[0]||null;
  }
}

window.HwpxPreview=HwpxPreview;
window.renderHwpx=async function(arrayBuffer,container,options={}){
  const preview=new HwpxPreview(options); await preview.loadArrayBuffer(arrayBuffer); preview.render(container); return preview;
};

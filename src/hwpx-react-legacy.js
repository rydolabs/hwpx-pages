(function(global){
'use strict';
function createBindings(React){
  if(!React) throw new Error('React is required');
  const {createElement,useEffect,useRef}=React;
  function HwpxViewerComponent(props){
    const {file,compareWith,options={},className,style,onReady,onError}=props||{};
    const ref=useRef(null),instance=useRef(null);
    useEffect(()=>{
      let active=true;
      if(!file||!ref.current)return undefined;
      global.HwpxViewer.open(file,ref.current,{...options,compareWith:compareWith??options.compareWith}).then(v=>{
        if(!active){v.destroy?.();return;}instance.current=v;onReady?.(v);
      }).catch(e=>{if(active)onError?.(e);});
      return()=>{active=false;instance.current?.destroy?.();instance.current=null;};
    },[file,compareWith]);
    useEffect(()=>{if(instance.current&&options.theme)instance.current.setTheme?.(options.theme);},[options.theme]);
    useEffect(()=>{if(instance.current&&options.filter!=null)instance.current.setFilter?.(options.filter);},[options.filter]);
    useEffect(()=>{if(instance.current&&options.view)instance.current.setView?.(options.view);},[options.view]);
    return createElement('div',{ref,className:className||'hwpx-react-viewer',style});
  }
  return {HwpxViewer:HwpxViewerComponent};
}
const api={createBindings,version:'0.1.0'};
if(global.React) Object.assign(api,createBindings(global.React));
global.HwpxReact=api;
})(window);

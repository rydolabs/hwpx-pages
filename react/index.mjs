import { createElement, useEffect, useRef } from 'react';

/**
 * SSR-safe React adapter around the browser-only HwpxViewer implementation.
 * Importing this module does not evaluate window/document-dependent renderer code.
 * The renderer is loaded lazily inside useEffect on the client.
 */
export function HwpxViewer({
  file,
  compareWith,
  options = {},
  className = 'hwpx-react-viewer',
  style,
  onReady,
  onError,
  viewerApi,
}) {
  const hostRef = useRef(null);
  const instanceRef = useRef(null);
  const callbacksRef = useRef({ onReady, onError });
  const apiRef = useRef(viewerApi || null);
  callbacksRef.current = { onReady, onError };
  if (viewerApi) apiRef.current = viewerApi;

  useEffect(() => {
    let active = true;
    if (!file || !hostRef.current) return undefined;

    (async () => {
      const api = apiRef.current || (await import('../dist/hwpx-viewer.module.mjs')).default;
      if (!active) return;
      apiRef.current = api;
      const instance = await api.open(file, hostRef.current, {
        ...options,
        compareWith: compareWith ?? options.compareWith,
      });
      if (!active) {
        instance?.destroy?.();
        return;
      }
      instanceRef.current = instance;
      callbacksRef.current.onReady?.(instance);
    })().catch(error => {
      if (active) callbacksRef.current.onError?.(error);
    });

    return () => {
      active = false;
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, [file, compareWith, viewerApi]);

  useEffect(() => {
    if (instanceRef.current && options.theme) instanceRef.current.setTheme?.(options.theme);
  }, [options.theme]);
  useEffect(() => {
    if (instanceRef.current && options.filter != null) instanceRef.current.setFilter?.(options.filter);
  }, [options.filter]);
  useEffect(() => {
    if (instanceRef.current && options.view) instanceRef.current.setView?.(options.view);
  }, [options.view]);

  return createElement('div', { ref: hostRef, className, style });
}

export default HwpxViewer;

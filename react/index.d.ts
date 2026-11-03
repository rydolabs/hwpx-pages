import * as React from 'react';

export type HwpxFileSource = File | Blob | ArrayBuffer | ArrayBufferView | { arrayBuffer(): Promise<ArrayBuffer> };
export type HwpxView = 'changes' | 'side-by-side';
export type HwpxTheme = 'clean' | 'default' | 'minimal' | 'review' | 'none' | string;
export type HwpxFilter = 'all' | 'insert' | 'delete' | 'modify' | Array<'insert' | 'delete' | 'modify'>;

export interface HwpxViewerOptions {
  compareWith?: HwpxFileSource | null;
  view?: HwpxView;
  theme?: HwpxTheme;
  showAuthor?: boolean;
  filter?: HwpxFilter;
  targetWidth?: number;
  hancomCompat?: 'auto' | 'hwp2018' | 'hwp2022' | 'none' | string;
  advanced?: Record<string, unknown>;
}

export interface HwpxViewerInstance {
  mode: 'document' | 'compare';
  destroy(): void;
  setView?(view: HwpxView): Promise<HwpxView> | HwpxView;
  setFilter?(filter: HwpxFilter): unknown;
  setTheme?(theme: HwpxTheme): unknown;
  next?(): unknown;
  previous?(): unknown;
  readonly advanced?: unknown;
}

export interface HwpxViewerProps {
  file: HwpxFileSource;
  compareWith?: HwpxFileSource | null;
  options?: HwpxViewerOptions;
  className?: string;
  style?: React.CSSProperties;
  onReady?: (viewer: HwpxViewerInstance) => void;
  onError?: (error: unknown) => void;
  viewerApi?: { open(file: HwpxFileSource, container: Element, options?: HwpxViewerOptions): Promise<HwpxViewerInstance> };
}

export declare function HwpxViewer(props: HwpxViewerProps): React.ReactElement;
export default HwpxViewer;

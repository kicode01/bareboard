export type Side = 'top' | 'bottom' | 'both';

export interface Point {
  x: number; // mils (1/1000 inch)
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Part {
  id: number; // 1-based
  name: string;
  side: Side;
  type: 'smd' | 'through';
  pinStart: number; // inclusive index into Board.pins
  pinEnd: number; // exclusive index into Board.pins
  box?: Bounds;
  info?: string;
}

export interface Pin {
  x: number;
  y: number;
  part: number; // 1-based part id, 0 = orphan
  net: string;
  side: Side;
  probe: number;
  name?: string;
  radius: number;
}

export interface Nail {
  x: number;
  y: number;
  net: string;
  side: Side;
  probe: number;
}

export interface Board {
  name: string;
  format: string;
  formatId: string;
  outline: Point[];
  parts: Part[];
  pins: Pin[];
  nails: Nail[];
  bounds: Bounds;
  warnings: string[];
  sourceBytes: Uint8Array;
}

export interface Detection {
  id: string;
  label: string;
  matchedBy: 'signature' | 'extension' | 'none';
  detail: string;
  supported: boolean;
  note?: string;
}

export interface ParseResult {
  board: Board | null;
  detection: Detection;
  error?: string;
}

export interface Selection {
  kind: 'part' | 'pin' | 'nail' | 'net';
  index: number;
  key: string;
}

export interface Layers {
  outline: boolean;
  pins: boolean;
  nails: boolean;
  labels: boolean;
  grid: boolean;
  nets: boolean;
  top: boolean;
  bottom: boolean;
  // The original exposes "Tooltip" as a View-menu layer, so hovering can be
  // suppressed independently of the element labels.
  tooltip: boolean;
}

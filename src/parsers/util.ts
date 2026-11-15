import type { Board, Bounds, Part, Pin, Nail, Point, Side } from '../types';

/** Byte buffer -> latin1 string. Keeps every byte value intact (no UTF-8 decoding surprises). */
export function latin1(bytes: Uint8Array, limit = bytes.length): string {
  const n = Math.min(bytes.length, limit);
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < n; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, n)));
  }
  return out;
}

export function splitLines(text: string): string[] {
  return text.replace(/\0/g, '').split(/\r\n|\n|\r/);
}

/** Mirrors the token reader used by the reference C++ parsers (whitespace-delimited fields). */
export class Lexer {
  private i = 0;
  constructor(private readonly s: string) {}

  private skip(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  int(): number {
    this.skip();
    // Some boardview exporters emit integer fields as "1090.0"; consume the
    // fraction so the following field stays aligned (strtol would stop here).
    const m = /^[+-]?\d+(?:\.\d+)?/.exec(this.s.slice(this.i));
    if (!m) {
      if (this.i < this.s.length) this.i++;
      return 0;
    }
    this.i += m[0].length;
    return Math.trunc(parseFloat(m[0]));
  }

  double(): number {
    this.skip();
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) {
      if (this.i < this.s.length) this.i++;
      return 0;
    }
    this.i += m[0].length;
    return parseFloat(m[0]);
  }

  str(): string {
    this.skip();
    const start = this.i;
    while (this.i < this.s.length && !/\s/.test(this.s[this.i])) this.i++;
    return this.s.slice(start, this.i);
  }

  comma(): void {
    this.skip();
    if (this.s[this.i] === ',') this.i++;
  }

  rest(): string {
    this.skip();
    return this.s.slice(this.i).trim();
  }
}

export function sideFromCode(code: number): Side {
  if (code === 1) return 'top';
  if (code === 2) return 'bottom';
  return 'both';
}

/**
 * Classic .brd files may ship with a 4-byte encoded header (23 E2 63 28).
 * Every non-linebreak byte is transformed with a rotate + complement.
 */
export function decodeBrdHeader(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0x23 || bytes[1] !== 0xe2 || bytes[2] !== 0x63 || bytes[3] !== 0x28) {
    return bytes;
  }
  const out = new Uint8Array(bytes);
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b === 0x0d || b === 0x0a || b === 0) continue;
    const c = (b << 24) >> 24; // signed char semantics
    out[i] = (~(((c >> 6) & 3) | (c << 2))) & 0xff;
  }
  return out;
}

/** .bdv files use a per-line subtractive cipher whose key resets every 126 lines. */
export function decodeBdv(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes);
  let count = 0xa0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0x0d && i + 1 < out.length && out[i + 1] === 0x0a) count++;
    let x = (out[i] << 24) >> 24;
    if (!(x === 0x0d || x === 0x0a || x === 0)) x = count - x;
    if (count > 285) count = 159;
    out[i] = x & 0xff;
  }
  return out;
}

export interface RawBoard {
  outline: Point[];
  parts: Part[];
  pins: Pin[];
  nails: Nail[];
  warnings: string[];
}

/** Fill derived geometry: board bounds, per-part boxes, pin sizes, sane defaults. */
export function finalizeBoard(raw: RawBoard, name: string, format: string, formatId: string, sourceBytes: Uint8Array): Board {
  const warnings = [...raw.warnings];
  const parts = raw.parts.map((p, i) => ({ ...p, id: i + 1 }));
  const pins = raw.pins.map((p) => ({
    ...p,
    part: p.part > parts.length ? 0 : p.part,
    net: p.net || 'UNCONNECTED',
    radius: p.radius || 12,
  }));

  // Attach pins to parts using explicit ranges where available, else group by part id.
  for (const part of parts) {
    const own: Pin[] = [];
    if (part.pinEnd > part.pinStart) {
      for (let i = part.pinStart; i < Math.min(part.pinEnd, pins.length); i++) {
        if (pins[i].part === 0 || pins[i].part === part.id) own.push(pins[i]);
      }
    } else {
      for (const pin of pins) if (pin.part === part.id) own.push(pin);
    }
    if (own.length) {
      const xs = own.map((p) => p.x);
      const ys = own.map((p) => p.y);
      part.box = {
        minX: Math.min(...xs) - 18,
        minY: Math.min(...ys) - 18,
        maxX: Math.max(...xs) + 18,
        maxY: Math.max(...ys) + 18,
      };
    } else if (part.box === undefined) {
      part.box = undefined;
    }
    if (part.pinEnd <= part.pinStart) {
      // Derive a range for the inspector when the source format did not supply one.
      const indices = pins.map((p, i) => (p.part === part.id ? i : -1)).filter((i) => i >= 0);
      if (indices.length) {
        part.pinStart = indices[0];
        part.pinEnd = indices[indices.length - 1] + 1;
      }
    }
  }

  // Pin side follows its part when the source did not say otherwise.
  for (const pin of pins) {
    if (pin.side === 'both' && pin.part > 0 && parts[pin.part - 1]) {
      pin.side = parts[pin.part - 1].side;
    }
  }

  const allX: number[] = [];
  const allY: number[] = [];
  for (const p of raw.outline) { allX.push(p.x); allY.push(p.y); }
  if (!raw.outline.length) {
    for (const p of pins) { allX.push(p.x); allY.push(p.y); }
    for (const n of raw.nails) { allX.push(n.x); allY.push(n.y); }
    if (allX.length) {
      const pad = 120;
      const minX = Math.min(...allX) - pad, maxX = Math.max(...allX) + pad;
      const minY = Math.min(...allY) - pad, maxY = Math.max(...allY) + pad;
      raw.outline.push(
        { x: minX, y: minY }, { x: maxX, y: minY },
        { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY },
      );
      warnings.push('No outline in file — generated a bounding rectangle from pin positions.');
    }
  }
  if (!allX.length) { allX.push(0, 1000); allY.push(0, 1000); }

  const bounds: Bounds = {
    minX: Math.min(...allX), minY: Math.min(...allY),
    maxX: Math.max(...allX), maxY: Math.max(...allY),
  };
  if (!pins.length) warnings.push('No pins were parsed — check the format diagnostics panel.');

  return {
    name, format, formatId,
    outline: raw.outline,
    parts, pins, nails: raw.nails,
    bounds, warnings,
    sourceBytes,
  };
}

export function emptyRaw(): RawBoard {
  return { outline: [], parts: [], pins: [], nails: [], warnings: [] };
}

export function makePin(x: number, y: number, part: number, net: string, side: Side, probe = 0, name?: string): Pin {
  return { x, y, part, net, side, probe, name, radius: 12 };
}

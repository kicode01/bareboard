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
  outlineSegments?: [Point, Point][];
  parts: Part[];
  pins: Pin[];
  nails: Nail[];
  warnings: string[];
}

function rotatePoint(px: number, py: number, ox: number, oy: number, theta: number): Point {
  const tx = px - ox;
  const ty = py - oy;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: tx * c - ty * s + ox,
    y: tx * s + ty * c + oy,
  };
}

function rotateOrigin(v: Point, theta: number): Point {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  };
}

/** Monotone-chain O(N log N) convex hull (replaces OBV's O(N*H) Jarvis march for speed on large ICs). */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [];
  const pts = points.slice().sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Ported from OpenBoardView vectorhulls.cpp (VHMBBCalculate): minimum-area oriented bounding box. */
function mbbCalculate(hullInput: Point[], pad: number): Point[] {
  const hull = hullInput.map((p) => ({ x: p.x, y: p.y }));
  let originX = Infinity, originY = Infinity;
  for (const p of hull) {
    if (p.x < originX) originX = p.x;
    if (p.y < originY) originY = p.y;
  }
  for (const p of hull) {
    p.x -= originX;
    p.y -= originY;
  }

  let mbAngle = 0;
  let cumulativeAngle = 0;
  let mbArea = Infinity;
  let mba: Point = { x: 0, y: 0 };
  let mbb: Point = { x: 0, y: 0 };

  for (let i = 0; i < hull.length; i++) {
    const current = hull[i];
    const next = hull[(i + 1) % hull.length];
    const angle = Math.atan2(next.y - current.y, next.x - current.x);
    cumulativeAngle += angle;

    let top = -Infinity, right = -Infinity, bot = Infinity, left = Infinity;
    for (let x = 0; x < hull.length; x++) {
      const rp = rotateOrigin(hull[x], -angle);
      hull[x] = rp;
      if (rp.y > top) top = rp.y;
      if (rp.y < bot) bot = rp.y;
      if (rp.x > right) right = rp.x;
      if (rp.x < left) left = rp.x;
    }
    const area = (right - left) * (top - bot);
    if (area < mbArea) {
      mbArea = area;
      mbAngle = cumulativeAngle;
      mba = { x: left, y: bot };
      mbb = { x: right, y: top };
    }
  }

  mba.x -= pad;
  mba.y -= pad;
  mbb.x += pad;
  mbb.y += pad;

  const box: Point[] = [
    rotateOrigin(mba, mbAngle),
    rotateOrigin({ x: mbb.x, y: mba.y }, mbAngle),
    rotateOrigin(mbb, mbAngle),
    rotateOrigin({ x: mba.x, y: mbb.y }, mbAngle),
  ];
  for (const p of box) {
    p.x += originX;
    p.y += originY;
  }
  return box;
}

/**
 * Ported from OpenBoardView BoardView::EPCCheck:
 * Detects whether a board outline is Y-flipped relative to the pins (common in some BRD2 files)
 * and un-flips the outline if fewer pins lie outside the flipped outline.
 */
function epcCheck(outline: Point[], pins: Pin[]): void {
  if (outline.length < 4 || !pins.length) return;
  let maxY = -Infinity;
  for (const p of outline) if (p.y > maxY) maxY = p.y;
  if (!Number.isFinite(maxY) || maxY <= 0) return;

  // Sample up to 600 pins for speed on 20,000-pin boards.
  const step = Math.max(1, Math.floor(pins.length / 600));
  const epc: [number, number] = [0, 0];

  for (let side = 0; side < 2; side++) {
    for (let pIdx = 0; pIdx < pins.length; pIdx += step) {
      const p = pins[pIdx];
      let l = 0, r = 0, jump = 1;
      let fp = outline[0];
      for (let i = 0; i < outline.length - 1; i++) {
        const pa = outline[i];
        const pb = outline[i + 1];
        if (pa.x === pb.x && pa.y === pb.y) continue;
        if (!jump && fp.x === pb.x && fp.y === pb.y) {
          if (i < outline.length - 2) {
            fp = outline[i + 2];
            jump = 1;
            i++;
          }
        } else {
          jump = 0;
        }
        if ((pa.y > pb.y && p.y < pa.y && p.y > pb.y) || (pa.y < pb.y && p.y > pa.y && p.y < pb.y)) {
          const ix = pa.x === pb.x ? pa.x : ((pb.x - pa.x) / (pb.y - pa.y)) * (p.y - pa.y) + pa.x;
          if (ix > p.x) r++;
          else if (ix < p.x) l++;
        }
      }
      if (l % 2 === 0 && r % 2 === 0) epc[side]++;
    }
    for (const pt of outline) pt.y = maxY - pt.y;
  }

  if ((epc[0] || epc[1]) && epc[0] > epc[1]) {
    for (const pt of outline) pt.y = maxY - pt.y;
  }
}

/** Fill derived geometry: board bounds, per-part boxes/hulls, pin sizes, sane defaults. */
export function finalizeBoard(raw: RawBoard, name: string, format: string, formatId: string, sourceBytes: Uint8Array): Board {
  const warnings = [...raw.warnings];
  const parts = raw.parts.map((p, i) => ({
    ...p,
    id: i + 1,
    isDummy: p.name.startsWith('...'),
  }));
  const pins = raw.pins.map((p) => ({
    ...p,
    part: p.part > parts.length ? 0 : p.part,
    net: p.net || 'UNCONNECTED',
    radius: p.radius || 7,
  }));

  // Group pins by part id in O(N_pins) so large boards (3,500+ parts, 20,000+ pins) finalize instantly.
  const byPart = new Map<number, number[]>();
  for (let i = 0; i < pins.length; i++) {
    const pid = pins[i].part;
    if (pid > 0) {
      let list = byPart.get(pid);
      if (!list) { list = []; byPart.set(pid, list); }
      list.push(i);
    }
  }

  // Attach pins to parts using explicit ranges where available, else group by part id.
  for (const part of parts) {
    const own: Pin[] = [];
    const byId = byPart.get(part.id);
    if (byId && byId.length) {
      for (const idx of byId) own.push(pins[idx]);
      if (part.pinEnd <= part.pinStart) {
        part.pinStart = byId[0];
        part.pinEnd = byId[byId.length - 1] + 1;
      }
    } else if (part.pinEnd > part.pinStart) {
      for (let i = part.pinStart; i < Math.min(part.pinEnd, pins.length); i++) {
        if (pins[i].part === 0 || pins[i].part === part.id) own.push(pins[i]);
      }
    }

    // Assign 1-based pin numbers within each component (matching BRDBoard.cpp).
    for (let i = 0; i < own.length; i++) {
      const pin = own[i];
      if (!pin.number) pin.number = String(i + 1);
      if (!pin.name) pin.name = pin.number;
      if (part.isDummy) {
        pin.isTestPad = true;
        pin.radius = 6.5;
      }
    }

    // If the part's side was unspecified ('both') while its pins belong to a single side,
    // inherit that side on the part so Top/Bottom filtering hides/shows the part figure too.
    if (part.side === 'both' && own.length > 0) {
      let hasTop = false, hasBottom = false;
      for (const p of own) {
        if (p.side === 'top') hasTop = true;
        else if (p.side === 'bottom') hasBottom = true;
      }
      if (hasTop && !hasBottom) part.side = 'top';
      else if (hasBottom && !hasTop) part.side = 'bottom';
    }

    // Dummy "..." parts hold test pads scattered across the board — never give them a component box!
    if (part.isDummy) {
      part.box = undefined;
      part.outline = undefined;
      continue;
    }

    if (own.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of own) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      part.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const distance = Math.hypot(maxX - minX, maxY - minY);

      // Compute nearest-neighbour pin pitch on this component.
      let minDistSq = Infinity;
      const sorted = own.slice().sort((a, b) => a.x - b.x);
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j];
          const dx = b.x - a.x;
          if (dx * dx >= minDistSq) break;
          const dy = b.y - a.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 0.01 && dSq < minDistSq) minDistSq = dSq;
        }
      }
      const pitch = Number.isFinite(minDistSq) ? Math.sqrt(minDistSq) : 24;

      // Ported from OpenBoardView BoardView::DrawParts empirical SMD sizing + pitch clamp.
      const p0 = (part.name[0] || '').toUpperCase();
      const p1 = (part.name[1] || '').toUpperCase();
      let pinRadius = Math.max(2.6, Math.min(8.5, pitch * 0.35));

      if (own.length < 4 && p0 !== 'U' && p0 !== 'Q') {
        if (distance > 18 && distance < 22) pinRadius = 4.2;       // 0201 passive
        else if (distance > 28 && distance < 32) pinRadius = 6.5;  // 0402 passive
        else if (distance > 52 && distance < 57) pinRadius = 10.5; // 0603 passive
        else if (distance > 64 && distance < 68) pinRadius = 14;   // 0805 passive
        else if (distance > 101 && distance < 112) pinRadius = 18; // 1206 / SMA
        else if (distance > 165 && distance < 169) pinRadius = 22; // SMB diode
        else if (distance > 195 && distance < 253) pinRadius = 28; // Inductor / SMC
      }
      if (Number.isFinite(minDistSq)) {
        pinRadius = Math.min(pinRadius, Math.sqrt(minDistSq) * 0.42);
      }

      for (const pin of own) {
        if (!pin.radius || pin.radius === 7 || pin.radius === 12) pin.radius = pinRadius;
      }

      const bMinX = minX - pinRadius;
      const bMaxX = maxX + pinRadius;
      const bMinY = minY - pinRadius;
      const bMaxY = maxY + pinRadius;
      const aspect = bMaxY - bMinY < 0.01 ? 0 : (bMaxX - bMinX) / (bMaxY - bMinY);

      const dbox: Point[] = [
        { x: bMinX, y: bMinY },
        { x: bMaxX, y: bMinY },
        { x: bMaxX, y: bMaxY },
        { x: bMinX, y: bMaxY },
      ];

      // Build oriented outline & hull following OpenBoardView BoardView::DrawParts.
      if (own.length === 3 && Math.abs(aspect) > 0.5 && ('DQZ'.includes(p0) || 'DQZ'.includes(p1) || part.name === 'LED')) {
        part.outline = dbox;
        part.hull = own.map((p) => ({ x: p.x, y: p.y }));
      } else if (own.length > 1 && own.length < 4 && ('CRLD'.includes(p0) || 'CRLD'.includes(p1))) {
        const dx = own[1].x - own[0].x;
        const dy = own[1].y - own[0].y;
        const angle = Math.atan2(dy, dx);
        let armx = pinRadius;
        let army = pinRadius;
        if ((p0 === 'L' || p1 === 'L') && distance > 50) {
          pinRadius = Math.min(12, distance * 0.22);
          for (const pin of own) pin.radius = pinRadius;
          army = distance / 2;
          armx = pinRadius;
        } else if ((p0 === 'C' || p1 === 'C') && distance > 90) {
          pinRadius = Math.min(12, distance * 0.16);
          for (const pin of own) pin.radius = pinRadius;
          army = distance / 2 - distance / 4;
          armx = pinRadius;
          const mpx = dx / 2 + own[0].x;
          const mpy = dy / 2 + own[0].y;
          part.center = rotatePoint(mpx, mpy, mpx, mpy, angle);
          part.expanse = distance;
        }
        part.outline = [
          rotatePoint(own[0].x - armx, own[0].y - army, own[0].x, own[0].y, angle),
          rotatePoint(own[0].x - armx, own[0].y + army, own[0].x, own[0].y, angle),
          rotatePoint(own[1].x + armx, own[1].y + army, own[1].x, own[1].y, angle),
          rotatePoint(own[1].x + armx, own[1].y - army, own[1].x, own[1].y, angle),
        ];
      } else if (own.length >= 4 && ('UJL'.includes(p0) || 'UJL'.includes(p1) || part.name.toUpperCase().startsWith('CN'))) {
        const hull = convexHull(own);
        if (hull.length >= 3) {
          part.hull = hull;
          part.outline = mbbCalculate(hull, pinRadius);
        } else {
          part.outline = dbox;
        }
      } else {
        part.outline = dbox;
      }

      if (part.outline) {
        let oMinX = Infinity, oMinY = Infinity, oMaxX = -Infinity, oMaxY = -Infinity;
        for (const p of part.outline) {
          if (p.x < oMinX) oMinX = p.x;
          if (p.y < oMinY) oMinY = p.y;
          if (p.x > oMaxX) oMaxX = p.x;
          if (p.y > oMaxY) oMaxY = p.y;
        }
        part.box = { minX: oMinX, minY: oMinY, maxX: oMaxX, maxY: oMaxY };
      }
    } else if (part.box) {
      part.outline = [
        { x: part.box.minX, y: part.box.minY },
        { x: part.box.maxX, y: part.box.minY },
        { x: part.box.maxX, y: part.box.maxY },
        { x: part.box.minX, y: part.box.maxY },
      ];
      part.center = { x: (part.box.minX + part.box.maxX) / 2, y: (part.box.minY + part.box.maxY) / 2 };
    }
  }

  // Pin side follows its part when the source did not say otherwise.
  for (const pin of pins) {
    if (pin.side === 'both' && pin.part > 0 && parts[pin.part - 1]) {
      pin.side = parts[pin.part - 1].side;
    }
  }

  // Run OpenBoardView's EPC check to fix Y-flipped board outlines (common in some BRD2 files).
  epcCheck(raw.outline, pins);

  const allX: number[] = [];
  const allY: number[] = [];
  for (const p of raw.outline) { allX.push(p.x); allY.push(p.y); }
  if (raw.outlineSegments) {
    for (const [a, b] of raw.outlineSegments) {
      allX.push(a.x, b.x);
      allY.push(a.y, b.y);
    }
  }
  if (!raw.outline.length && (!raw.outlineSegments || !raw.outlineSegments.length)) {
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
    outlineSegments: raw.outlineSegments,
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

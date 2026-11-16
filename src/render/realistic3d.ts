import type { Board, Layers, Part, Pin, Point, Selection, Side } from '../types';
import type { BoardIndex } from '../lib/search';
import type { Palette } from '../lib/theme';
import { pointInPolygon, type Transform, type View } from '../lib/geometry';

export type RenderMode = 'cad' | 'realistic' | '3d';

export type PackageKind =
  | 'mlcc'
  | 'electrolytic'
  | 'tantalum'
  | 'resistor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'transistor'
  | 'bga'
  | 'ic'
  | 'connector'
  | 'crystal'
  | 'fuse'
  | 'generic';

export interface PackageSpec {
  kind: PackageKind;
  heightMil: number;
  bodyTop: string;
  bodySide: string;
  bodyStroke: string;
  capColor?: string;
  accentColor?: string;
  hasEndCaps: boolean;
  showLabelAtAllZooms: boolean;
}

const PACKAGE_CACHE = new WeakMap<Part, PackageSpec>();

/** Automatically infers the real-world physical package and standing 3D height from any
 *  boardview part's reference designator, pin count, and footprint geometry. */
export function classifyPartPackage(part: Part): PackageSpec {
  const cached = PACKAGE_CACHE.get(part);
  if (cached) return cached;

  const name = part.name.toUpperCase();
  const p0 = name[0] || '';
  const p1 = name[1] || '';
  const pinCount = Math.max(0, part.pinEnd - part.pinStart);

  let w = 40, h = 40;
  if (part.outline && part.outline.length >= 4) {
    const d01 = Math.hypot(part.outline[1].x - part.outline[0].x, part.outline[1].y - part.outline[0].y);
    const d12 = Math.hypot(part.outline[2].x - part.outline[1].x, part.outline[2].y - part.outline[1].y);
    w = Math.max(d01, d12);
    h = Math.min(d01, d12);
  } else if (part.box) {
    const bw = part.box.maxX - part.box.minX;
    const bh = part.box.maxY - part.box.minY;
    w = Math.max(bw, bh);
    h = Math.min(bw, bh);
  }
  const shortSide = Math.max(12, h);
  const longSide = Math.max(16, w);

  let spec: PackageSpec;

  if (
    (p0 === 'C' || (p0 === 'P' && p1 === 'C'))
    && ((part.expanse && part.expanse > 90) || name.startsWith('CE') || name.startsWith('EC') || name.startsWith('CP') || (part.type === 'through' && longSide >= 100 && pinCount === 2))
  ) {
    // Standing Radial Electrolytic / Polymer Aluminum Can (real ~1:1 can proportions)
    spec = {
      kind: 'electrolytic',
      heightMil: Math.min(260, Math.max(110, Math.min(shortSide, longSide) * 0.92)),
      bodyTop: '#e2e8f0',
      bodySide: '#1e293b',
      bodyStroke: '#64748b',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if ((p0 === 'C' || (p0 === 'P' && p1 === 'C')) && longSide >= 252 && pinCount === 2) {
    // Molded SMD Tantalum / Polymer Bulk Capacitor (Case A/B/C/D/V: 1.6-3.0 mm height)
    spec = {
      kind: 'tantalum',
      heightMil: Math.min(115, Math.max(46, shortSide * 0.62)),
      bodyTop: '#eab308',
      bodySide: '#ca8a04',
      bodyStroke: '#854d0e',
      capColor: '#e2e8f0',
      accentColor: '#78350f',
      hasEndCaps: true,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'C' || (p0 === 'P' && p1 === 'C')) {
    // SMD Ceramic MLCC Capacitor (JEDEC 0201 ~10 mil through 1210 ~76 mil)
    spec = {
      kind: 'mlcc',
      heightMil: Math.min(78, Math.max(10, shortSide * 0.78)),
      bodyTop: '#d48c46',
      bodySide: '#a36629',
      bodyStroke: '#6b4218',
      capColor: '#e2e8f0',
      accentColor: '#f3c693',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'R' || (p0 === 'P' && p1 === 'R')) {
    // SMD Chip Resistor (low-profile thick film: 0201 ~9 mil through 1206 ~28 mil)
    spec = {
      kind: 'resistor',
      heightMil: Math.min(30, Math.max(9, shortSide * 0.50)),
      bodyTop: '#161b22',
      bodySide: '#3b424f',
      bodyStroke: '#475569',
      capColor: '#f1f5f9',
      accentColor: '#ffffff',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'L' || (p0 === 'P' && p1 === 'L') || name.startsWith('FB') || name.startsWith('FL')) {
    // Molded Alloy SMD Power Inductor vs Ferrite Bead vs Through-Hole Drum Coil
    const isPowerCoil = !name.startsWith('FB') && (longSide > 65 || pinCount >= 2);
    const isOpenDrum = part.type === 'through' && longSide >= 110;
    spec = {
      kind: 'inductor',
      heightMil: isOpenDrum
        ? Math.min(190, Math.max(85, shortSide * 0.72))
        : isPowerCoil
          ? Math.min(125, Math.max(30, shortSide * 0.45))
          : Math.min(36, Math.max(11, shortSide * 0.62)),
      bodyTop: '#2d3540',
      bodySide: '#1c2128',
      bodyStroke: '#64748b',
      capColor: '#cbd5e1',
      accentColor: '#d97706',
      hasEndCaps: !isPowerCoil && pinCount === 2,
      showLabelAtAllZooms: isPowerCoil,
    };
  } else if (name.startsWith('LED')) {
    spec = {
      kind: 'led',
      heightMil: Math.min(60, Math.max(18, shortSide * 0.52)),
      bodyTop: '#f8fafc',
      bodySide: '#cbd5e1',
      bodyStroke: '#94a3b8',
      capColor: '#facc15',
      accentColor: '#f59e0b',
      hasEndCaps: pinCount === 2,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'D' || (p0 === 'P' && p1 === 'D') || name.startsWith('ZD')) {
    spec = {
      kind: 'diode',
      heightMil: Math.min(75, Math.max(14, shortSide * 0.52)),
      bodyTop: '#1b2028',
      bodySide: '#10141a',
      bodyStroke: '#64748b',
      capColor: '#e2e8f0',
      accentColor: '#f8fafc',
      hasEndCaps: pinCount === 2,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'Q' || (p0 === 'P' && p1 === 'Q') || p0 === 'T') {
    // Standing TO-220 / through-hole MOSFET (3 inline wide-pitch pins) vs low-profile SMD PowerPAK / DFN / SOT MOSFET (~0.8-1.1 mm)
    const isInlineThroughTo220 = pinCount === 3 && shortSide <= 95 && longSide >= 190 && (part.type === 'through' || longSide >= 220);
    spec = {
      kind: 'transistor',
      heightMil: isInlineThroughTo220
        ? Math.min(390, Math.max(165, longSide * 1.40))
        : Math.min(44, Math.max(18, shortSide * 0.34)),
      bodyTop: '#1e242d',
      bodySide: '#11161d',
      bodyStroke: '#64748b',
      capColor: '#e2e8f0',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if (p0 === 'J' || name.startsWith('CN') || name.startsWith('CON') || name.startsWith('USB') || name.startsWith('HDMI')) {
    // Low-profile laptop FPC/B2B connectors vs SMD ports vs Through-Hole shrouded pin headers
    const pinDensityPitch = pinCount > 1 ? longSide / Math.max(1, pinCount - 1) : shortSide;
    const isFineSmdHeader = part.type !== 'through' && (pinCount >= 10 || pinDensityPitch < 45);
    const isWideIoCage = shortSide >= 230 && pinCount >= 6;
    spec = {
      kind: 'connector',
      heightMil: isWideIoCage
        ? Math.min(150, Math.max(64, shortSide * 0.34))
        : part.type === 'through'
          ? Math.min(200, Math.max(115, shortSide * 0.80))
          : isFineSmdHeader
            ? Math.min(82, Math.max(34, shortSide * 0.34))
            : Math.min(140, Math.max(48, shortSide * 0.38)),
      bodyTop: '#334155',
      bodySide: '#475569',
      bodyStroke: '#cbd5e1',
      capColor: '#facc15',
      accentColor: '#fef08a',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if (p0 === 'Y' || p0 === 'X' || name.startsWith('XTAL') || name.startsWith('OSC')) {
    // Standing HC-49 crystal vs low-profile SMD quartz crystal
    spec = {
      kind: 'crystal',
      heightMil: part.type === 'through'
        ? Math.min(140, Math.max(75, shortSide * 0.65))
        : Math.min(58, Math.max(20, shortSide * 0.44)),
      bodyTop: '#e2e8f0',
      bodySide: '#94a3b8',
      bodyStroke: '#eab308',
      capColor: '#facc15',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if (p0 === 'F' && !name.startsWith('FB') && !name.startsWith('FL')) {
    spec = {
      kind: 'fuse',
      heightMil: Math.min(46, Math.max(14, shortSide * 0.46)),
      bodyTop: '#f8fafc',
      bodySide: '#cbd5e1',
      bodyStroke: '#ca8a04',
      capColor: '#eab308',
      accentColor: '#64748b',
      hasEndCaps: true,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'U' || (p0 === 'P' && p1 === 'U') || name.startsWith('IC')) {
    const isBga = pinCount >= 25 && (shortSide >= 165 || pinCount >= 40);
    spec = {
      kind: isBga ? 'bga' : 'ic',
      heightMil: isBga
        ? Math.min(88, Math.max(24, Math.sqrt(longSide * shortSide) * 0.095))
        : Math.min(68, Math.max(22, shortSide * 0.24)),
      bodyTop: isBga ? '#111827' : '#1e242d',
      bodySide: isBga ? '#15803d' : '#11151c',
      bodyStroke: isBga ? '#22c55e' : '#64748b',
      capColor: '#e2e8f0',
      accentColor: '#facc15',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else {
    spec = {
      kind: 'generic',
      heightMil: Math.min(54, Math.max(16, shortSide * 0.38)),
      bodyTop: '#252b34',
      bodySide: '#151920',
      bodyStroke: '#64748b',
      hasEndCaps: false,
      showLabelAtAllZooms: false,
    };
  }

  PACKAGE_CACHE.set(part, spec);
  return spec;
}

function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Ensures quad vertices are ordered so 0->1 and 2->3 are the short terminal ends,
 *  1->2 and 3->0 are the long sides, and edge 0->1 sits closest to `pin1` when provided. */
function orientQuadToEnds(q: Point[], pin1?: Point): Point[] {
  if (q.length < 4) return q;
  const d01 = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
  const d12 = Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y);
  let ordered = d01 > d12 ? [q[1], q[2], q[3], q[0]] : [q[0], q[1], q[2], q[3]];
  if (pin1) {
    const m01 = { x: (ordered[0].x + ordered[1].x) * 0.5, y: (ordered[0].y + ordered[1].y) * 0.5 };
    const m23 = { x: (ordered[2].x + ordered[3].x) * 0.5, y: (ordered[2].y + ordered[3].y) * 0.5 };
    const dist01 = Math.hypot(m01.x - pin1.x, m01.y - pin1.y);
    const dist23 = Math.hypot(m23.x - pin1.x, m23.y - pin1.y);
    if (dist23 < dist01) {
      ordered = [ordered[2], ordered[3], ordered[0], ordered[1]];
    }
  }
  return ordered;
}

function insetQuad(q: Point[], tLen: number, tWid: number): Point[] {
  const p0 = lerpPt(lerpPt(q[0], q[3], tLen), lerpPt(q[1], q[2], tLen), tWid);
  const p1 = lerpPt(lerpPt(q[0], q[3], tLen), lerpPt(q[1], q[2], tLen), 1 - tWid);
  const p2 = lerpPt(lerpPt(q[0], q[3], 1 - tLen), lerpPt(q[1], q[2], 1 - tLen), 1 - tWid);
  const p3 = lerpPt(lerpPt(q[0], q[3], 1 - tLen), lerpPt(q[1], q[2], 1 - tLen), tWid);
  return [p0, p1, p2, p3];
}

function fillPassiveEndCaps(
  ctx: CanvasRenderingContext2D,
  q: Point[],
  capFrac: number,
  capColor: string,
  highlightColor?: string,
): void {
  const a1 = lerpPt(q[0], q[3], capFrac);
  const a2 = lerpPt(q[1], q[2], capFrac);
  const b1 = lerpPt(q[3], q[0], capFrac);
  const b2 = lerpPt(q[2], q[1], capFrac);

  ctx.fillStyle = capColor;
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  ctx.lineTo(q[1].x, q[1].y);
  ctx.lineTo(a2.x, a2.y);
  ctx.lineTo(a1.x, a1.y);
  ctx.closePath();
  ctx.moveTo(b1.x, b1.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(q[2].x, q[2].y);
  ctx.lineTo(q[3].x, q[3].y);
  ctx.closePath();
  ctx.fill();

  if (highlightColor) {
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
  }
}

/** 2D Realistic Component Package Illustration Renderer. */
export function drawRealistic2DPart(
  ctx: CanvasRenderingContext2D,
  board: Board,
  part: Part,
  rawQuad: Point[],
  cx: number,
  cy: number,
  spec: PackageSpec,
  S: (p: Point) => Point,
  scale: number,
  selected: boolean,
  focused: boolean,
  dimmed: boolean,
  palette: Palette,
): void {
  const quad = spec.hasEndCaps ? orientQuadToEnds(rawQuad) : rawQuad;
  const dx01 = quad[1].x - quad[0].x, dy01 = quad[1].y - quad[0].y;
  const dx12 = quad[2].x - quad[1].x, dy12 = quad[2].y - quad[1].y;
  const len01 = Math.hypot(dx01, dy01);
  const len12 = Math.hypot(dx12, dy12);
  const maxDim = Math.max(len01, len12);
  const minDim = Math.min(len01, len12);

  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.36;

  // 1. Soft drop shadow beneath physical component body
  if (maxDim >= 5) {
    ctx.save();
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x + 2, pt.y + 2.5) : ctx.lineTo(pt.x + 2, pt.y + 2.5)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fill();
    ctx.restore();
  }

  // 2. Radial Electrolytic / Polymer Aluminum Can (`electrolytic`)
  if (spec.kind === 'electrolytic') {
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(24, 30, 38, 0.9)';
    ctx.fill();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#64748b';
    ctx.lineWidth = selected ? 2 : 1.1;
    ctx.stroke();

    const cr = Math.max(4, Math.min(maxDim, minDim) * 0.46);
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    if (cr >= 6) {
      ctx.beginPath();
      ctx.arc(cx, cy, cr * 0.78, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.beginPath();
      for (let a = 0; a < 3; a++) {
        const ang = (a * Math.PI * 2) / 3 - Math.PI / 6;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * cr * 0.55, cy + Math.sin(ang) * cr * 0.55);
      }
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.65)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, cr * 0.93, -Math.PI * 0.36, Math.PI * 0.36);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.restore();
    void scale;
    return;
  }

  // 3. BGA Package (`bga`): Green fiberglass interposer substrate + dark silicon die + gold A1 fiducial
  if (spec.kind === 'bga') {
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = selected || focused ? 'rgba(21, 128, 61, 0.72)' : 'rgba(20, 83, 45, 0.65)';
    ctx.fill();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#22c55e';
    ctx.lineWidth = selected ? 2.2 : 1.3;
    ctx.stroke();

    if (minDim >= 12) {
      const dieQuad = insetQuad(quad, 0.14, 0.14);
      ctx.beginPath();
      dieQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      const pin1 = board.pins[part.pinStart];
      let bestCorner = 0;
      if (pin1) {
        const sp1 = S(pin1);
        let bestDist = Infinity;
        for (let k = 0; k < 4; k++) {
          const d = Math.hypot(quad[k].x - sp1.x, quad[k].y - sp1.y);
          if (d < bestDist) { bestDist = d; bestCorner = k; }
        }
      }
      const c0 = quad[bestCorner];
      const cNext = quad[(bestCorner + 1) % 4];
      const cPrev = quad[(bestCorner + 3) % 4];
      const f1 = lerpPt(c0, cNext, 0.15);
      const f2 = lerpPt(c0, cPrev, 0.15);
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.lineTo(f2.x, f2.y);
      ctx.closePath();
      ctx.fillStyle = '#facc15';
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // 4. MOSFET / Transistor (`transistor`) or Molded IC (`ic`) with metallic leads + heatsink tab
  if ((spec.kind === 'transistor' || spec.kind === 'ic') && maxDim >= 8) {
    const pinCount = Math.max(0, part.pinEnd - part.pinStart);
    const bodyQuad = pinCount <= 6 ? insetQuad(quad, 0.12, 0.18) : insetQuad(quad, 0.1, 0.1);

    // Draw metallic silver leads reaching from the molded body out to each pin pad
    if (pinCount >= 2 && pinCount <= 48) {
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = Math.min(4.5, Math.max(1.6, minDim * 0.12));
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
        const sp = S(board.pins[pIdx]);
        const anchor = lerpPt({ x: cx, y: cy }, sp, 0.45);
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // For MOSFETs (`transistor`), draw the protruding silver metal heatsink drain tab along the back edge
    if (spec.kind === 'transistor' && maxDim >= 10) {
      const tab0 = lerpPt(bodyQuad[0], bodyQuad[3], 0.12);
      const tab1 = lerpPt(bodyQuad[0], bodyQuad[3], 0.88);
      const tab2 = lerpPt(tab1, bodyQuad[2], -0.22);
      const tab3 = lerpPt(tab0, bodyQuad[1], -0.22);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tab0.x, tab0.y);
      ctx.lineTo(tab1.x, tab1.y);
      ctx.lineTo(tab2.x, tab2.y);
      ctx.lineTo(tab3.x, tab3.y);
      ctx.closePath();
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Molded black epoxy package body
    ctx.beginPath();
    bodyQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = spec.bodyTop;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
    ctx.lineWidth = selected ? 2.1 : 1.25;
    ctx.stroke();

    if (part.pinStart < board.pins.length && minDim >= 9) {
      const sp1 = S(board.pins[part.pinStart]);
      const dimple = lerpPt({ x: cx, y: cy }, sp1, 0.5);
      ctx.beginPath();
      ctx.arc(dimple.x, dimple.y, Math.min(3.8, Math.max(1.8, minDim * 0.09)), 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // 5. 2-Terminal Passives (MLCC Capacitors, Chip Resistors, Tantalum Caps, Diodes, LEDs, Fuses, Small Inductors)
  if (spec.hasEndCaps) {
    const bodyQuad = insetQuad(quad, 0.02, 0.08);

    ctx.beginPath();
    bodyQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.92;
    ctx.fillStyle = spec.bodyTop;
    ctx.fill();
    ctx.restore();

    if (maxDim >= 5 && spec.capColor) {
      ctx.save();
      ctx.globalAlpha *= 0.96;
      fillPassiveEndCaps(ctx, bodyQuad, 0.25, spec.capColor, 'rgba(71, 85, 105, 0.75)');
      ctx.restore();
    }

    if (spec.kind === 'mlcc' && maxDim >= 8) {
      const m0 = lerpPt(lerpPt(bodyQuad[0], bodyQuad[1], 0.34), lerpPt(bodyQuad[3], bodyQuad[2], 0.34), 0.28);
      const m1 = lerpPt(lerpPt(bodyQuad[0], bodyQuad[1], 0.34), lerpPt(bodyQuad[3], bodyQuad[2], 0.34), 0.72);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 240, 215, 0.48)';
      ctx.lineWidth = Math.max(1.2, minDim * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.stroke();
      ctx.restore();
    }

    if ((spec.kind === 'diode' || spec.kind === 'tantalum') && maxDim >= 8) {
      const k0 = lerpPt(bodyQuad[0], bodyQuad[3], 0.34);
      const k1 = lerpPt(bodyQuad[1], bodyQuad[2], 0.34);
      ctx.save();
      ctx.strokeStyle = spec.accentColor || '#f8fafc';
      ctx.lineWidth = Math.max(1.8, maxDim * 0.1);
      ctx.beginPath();
      ctx.moveTo(k0.x, k0.y);
      ctx.lineTo(k1.x, k1.y);
      ctx.stroke();
      ctx.restore();
    }

    if (spec.kind === 'led' && minDim >= 6) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, minDim * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    bodyQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
    ctx.lineWidth = selected ? 2 : focused ? 1.5 : 1;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 6. Shielded Power Inductors (`inductor`), Connectors (`connector`), Crystals (`crystal`), Generic
  ctx.beginPath();
  quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.save();
  ctx.globalAlpha *= 0.88;
  ctx.fillStyle = spec.bodyTop;
  ctx.fill();
  ctx.restore();

  if (spec.kind === 'inductor' && minDim >= 10) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24, 28, 34, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  } else if (spec.kind === 'connector' && minDim >= 8) {
    const slotQuad = insetQuad(quad, 0.08, 0.24);
    ctx.save();
    ctx.beginPath();
    slotQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(12, 15, 20, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  } else if (spec.kind === 'crystal' && minDim >= 8) {
    const lidQuad = insetQuad(quad, 0.12, 0.12);
    ctx.save();
    ctx.beginPath();
    lidQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(241, 245, 249, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
  ctx.lineWidth = selected ? 2.1 : focused ? 1.6 : 1.15;
  ctx.stroke();

  ctx.restore();
}

/* ============================================================================
 * 3D PERSPECTIVE CAMERA & STANDING 3D COMPONENT RENDERER
 * ========================================================================== */

export interface Camera3D {
  pitchDeg: number;
  yawDeg: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  persp: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface Projector3D {
  project3D: (p: Point, z?: number) => ProjectedPoint;
  unprojectToPlane: (sx: number, sy: number, zPlane?: number) => Point;
  cosP: number;
  sinP: number;
  cosR: number;
  sinR: number;
  center: Point;
  topFacesCamera: boolean;
  zRelief: number;
  camDist: number;
}

/** Standard 1.6 mm (63 mil) FR-4 PCB thickness -> half-thickness = 31.5 mil. */
export const BOARD_HALF_THICKNESS_MIL = 31.5;

export function getSideZ(
  side: Side,
  layers: Layers,
): { zBase: number; zSign: number } {
  const singleSideMode = (layers.top && !layers.bottom) || (layers.bottom && !layers.top);
  if (singleSideMode) {
    // In single-side mode, whichever side is selected faces the camera (+Z) like lying flat on a bench
    return { zBase: BOARD_HALF_THICKNESS_MIL, zSign: 1 };
  }
  if (side === 'bottom') {
    return { zBase: -BOARD_HALF_THICKNESS_MIL, zSign: -1 };
  }
  return { zBase: BOARD_HALF_THICKNESS_MIL, zSign: 1 };
}

/** Creates a screen-centered 3D projector with dynamic vertical relief (`zRelief`)
 *  so standing MOSFETs, capacitors, inductors, connectors, and ICs stand tall at any zoom level. */
export function makeProjector3D(
  board: Board,
  width: number,
  height: number,
  view: View,
  flipX: boolean,
  flipY: boolean,
  rotation: number,
  cam: Camera3D,
  flipZ = false,
): Projector3D {
  const center: Point = {
    x: (board.bounds.minX + board.bounds.maxX) / 2,
    y: (board.bounds.minY + board.bounds.maxY) / 2,
  };
  const rotRad = ((rotation + cam.yawDeg) * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);

  const pitchRad = (cam.pitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);

  const fov = Math.max(width, height) * 2.6;
  const camDist = fov / 0.24;
  // True 1:1 physical proportions across X, Y, and Z (no exaggerated board/part stretching)
  const zRelief = 1;

  const project3D = (p: Point, z = 0): ProjectedPoint => {
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    let dz = z * zRelief;
    if (flipX) dx = -dx;
    if (flipY) dy = -dy;
    if (flipZ) dz = -dz;

    const rx = (dx * cosR - dy * sinR) * view.scale + view.panX;
    const ry = (dx * sinR + dy * cosR) * view.scale + view.panY;
    const rz = dz * view.scale;

    const yTilt = ry * cosP - rz * sinP;
    const zDepth = -ry * sinP - rz * cosP;

    const zNorm = Math.max(-fov * 0.35, Math.min(fov * 0.35, zDepth));
    const persp = fov / (fov + zNorm * 0.24);

    return {
      x: width / 2 + rx * persp,
      y: height / 2 + yTilt * persp,
      depth: zDepth,
      persp,
      vx: rx,
      vy: yTilt,
      vz: zDepth,
    };
  };

  const unprojectToPlane = (sx: number, sy: number, zPlane = 0): Point => {
    let dz = zPlane * zRelief;
    if (flipZ) dz = -dz;
    const rz = dz * view.scale;

    const u = sx - width / 2;
    const v = sy - height / 2;

    const safeCosP = Math.abs(cosP) < 0.25 ? (cosP >= 0 ? 0.25 : -0.25) : cosP;
    let persp = 1;
    let ry = (v + rz * sinP) / safeCosP;
    for (let iter = 0; iter < 2; iter++) {
      ry = (v / persp + rz * sinP) / safeCosP;
      const zDepth = -ry * sinP - rz * cosP;
      const zNorm = Math.max(-fov * 0.35, Math.min(fov * 0.35, zDepth));
      persp = fov / (fov + zNorm * 0.24);
    }
    const rx = u / persp;

    const dxScaled = (rx - view.panX) / view.scale;
    const dyScaled = (ry - view.panY) / view.scale;
    let ux = dxScaled * cosR + dyScaled * sinR;
    let uy = -dxScaled * sinR + dyScaled * cosR;
    if (flipX) ux = -ux;
    if (flipY) uy = -uy;
    return { x: ux + center.x, y: uy + center.y };
  };

  const topOrigin = project3D(center, BOARD_HALF_THICKNESS_MIL);
  const botOrigin = project3D(center, -BOARD_HALF_THICKNESS_MIL);
  const topFacesCamera = topOrigin.depth <= botOrigin.depth;

  return {
    project3D,
    unprojectToPlane,
    cosP,
    sinP,
    cosR,
    sinR,
    center,
    topFacesCamera,
    zRelief,
    camDist,
  };
}

export function zoomAt3D(
  view: View,
  factor: number,
  sx: number,
  sy: number,
  width: number,
  height: number,
  board: Board,
  flipX: boolean,
  flipY: boolean,
  rotation: number,
  cam: Camera3D,
  flipZ = false,
): View {
  const scale = Math.min(Math.max(view.scale * factor, 0.0005), 40);
  const beforeProj = makeProjector3D(board, width, height, view, flipX, flipY, rotation, cam, flipZ);
  const worldPt = beforeProj.unprojectToPlane(sx, sy, 0);

  let dx = worldPt.x - beforeProj.center.x;
  let dy = worldPt.y - beforeProj.center.y;
  if (flipX) dx = -dx;
  if (flipY) dy = -dy;
  const rx0 = (dx * beforeProj.cosR - dy * beforeProj.sinR) * scale;
  const ry0 = (dx * beforeProj.sinR + dy * beforeProj.cosR) * scale;

  const rxOld = (dx * beforeProj.cosR - dy * beforeProj.sinR) * view.scale + view.panX;
  const ryOld = (dx * beforeProj.sinR + dy * beforeProj.cosR) * view.scale + view.panY;

  return {
    scale,
    panX: rxOld - rx0,
    panY: ryOld - ry0,
  };
}

export function orbitAroundPivot(
  pivotWorld: Point,
  baseScale: number,
  board: Board,
  flipX: boolean,
  flipY: boolean,
  rotation: number,
  newCam: Camera3D,
): { panX: number; panY: number } {
  const cx = (board.bounds.minX + board.bounds.maxX) / 2;
  const cy = (board.bounds.minY + board.bounds.maxY) / 2;
  let dx = pivotWorld.x - cx;
  let dy = pivotWorld.y - cy;
  if (flipX) dx = -dx;
  if (flipY) dy = -dy;
  const rotRad = ((rotation + newCam.yawDeg) * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const rx0 = (dx * cosR - dy * sinR) * baseScale;
  const ry0 = (dx * sinR + dy * cosR) * baseScale;
  return { panX: -rx0, panY: -ry0 };
}

function sideVisible(side: Side, layers: Layers): boolean {
  if (side === 'top') return layers.top;
  if (side === 'bottom') return layers.bottom;
  return layers.top || layers.bottom;
}

function traceMultiContour3D(
  ctx: CanvasRenderingContext2D,
  outline: Point[],
  segments: [Point, Point][] | undefined,
  P: (pt: Point, z: number) => ProjectedPoint,
  z: number,
): void {
  if (outline.length > 1) {
    let fp = outline[0];
    const s0 = P(fp, z);
    ctx.moveTo(s0.x, s0.y);
    let jump = false;
    for (let i = 1; i < outline.length; i++) {
      const p = outline[i];
      const s = P(p, z);
      if (jump) {
        ctx.moveTo(s.x, s.y);
        fp = p;
        jump = false;
        continue;
      }
      ctx.lineTo(s.x, s.y);
      if (p.x === fp.x && p.y === fp.y && i < outline.length - 1) {
        jump = true;
      }
    }
  }
  if (segments && segments.length > 0) {
    for (const [a, b] of segments) {
      const sa = P(a, z), sb = P(b, z);
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
    }
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Scales a `#rrggbb` color by `factor` while returning non-hex strings unchanged. */
function shadeHex(hex: string, factor: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = clampByte(parseInt(hex.slice(1, 3), 16) * factor);
  const g = clampByte(parseInt(hex.slice(3, 5), 16) * factor);
  const b = clampByte(parseInt(hex.slice(5, 7), 16) * factor);
  return `rgb(${r},${g},${b})`;
}

/** Exact view-space face culling + upper-front-left key directional Lambertian shading. */
function faceViewInfo(
  pts: ProjectedPoint[],
  interior: { vx: number; vy: number; vz: number },
  camDist: number,
  outwardTarget?: { vx: number; vy: number; vz: number },
): { front: boolean; depth: number; lit: number } {
  let cx = 0, cy = 0, cz = 0, depthSum = 0;
  for (const p of pts) {
    cx += p.vx; cy += p.vy; cz += p.vz; depthSum += p.depth;
  }
  const n = pts.length;
  cx /= n; cy /= n; cz /= n;
  const a = pts[0], b = pts[1], c = pts[2];
  const e1x = b.vx - a.vx, e1y = b.vy - a.vy, e1z = b.vz - a.vz;
  const e2x = c.vx - a.vx, e2y = c.vy - a.vy, e2z = c.vz - a.vz;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;

  const ref = outwardTarget ?? interior;
  const refSign = outwardTarget ? -1 : 1;
  if ((nx * (cx - ref.vx) + ny * (cy - ref.vy) + nz * (cz - ref.vz)) * refSign < 0) {
    nx = -nx; ny = -ny; nz = -nz;
  }
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen; ny /= nLen; nz /= nLen;

  const vx = -cx, vy = -cy, vz = -camDist - cz;
  const vLen = Math.hypot(vx, vy, vz) || 1;
  const facing = (nx * vx + ny * vy + nz * vz) / vLen;
  const key = Math.max(0, nx * -0.38 + ny * -0.52 + nz * -0.77);
  return {
    front: facing > -0.015,
    depth: depthSum / n,
    lit: 0.78 + 0.30 * key,
  };
}

/** Draws an extruded 3D prism between `z0` and `z1` using exact view-space front-face culling,
 *  directional lighting, optional metallic end-cap walls, and optional internal seam suppression. */
function drawExtrudedPrism3D(
  ctx: CanvasRenderingContext2D,
  poly: Point[],
  z0: number,
  z1: number,
  proj: Projector3D,
  topFill: string,
  sideFill: string,
  strokeCol: string,
  alpha = 0.98,
  endCapFill?: string,
  endCapShade?: string,
  skipWalls?: Set<number>,
  drawHiddenBack = false,
): { basePts: ProjectedPoint[]; roofPts: ProjectedPoint[] } {
  const P = proj.project3D;
  const basePts = poly.map((pt) => P(pt, z0));
  const roofPts = poly.map((pt) => P(pt, z1));

  const interior = { vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < basePts.length; i++) {
    interior.vx += basePts[i].vx + roofPts[i].vx;
    interior.vy += basePts[i].vy + roofPts[i].vy;
    interior.vz += basePts[i].vz + roofPts[i].vz;
  }
  const div = Math.max(1, basePts.length * 2);
  interior.vx /= div; interior.vy /= div; interior.vz /= div;

  interface FaceDraw {
    pts: ProjectedPoint[];
    fill: string;
    stroke: string;
    lineWidth: number;
    depth: number;
  }

  const faces: FaceDraw[] = [];
  const roofInfo = faceViewInfo(roofPts, interior, proj.camDist);
  if (drawHiddenBack || roofInfo.front) {
    faces.push({
      pts: roofPts,
      fill: shadeHex(topFill, roofInfo.lit),
      stroke: strokeCol,
      lineWidth: 0.95,
      depth: roofInfo.depth,
    });
  }

  const baseInfo = faceViewInfo(basePts, interior, proj.camDist);
  if (drawHiddenBack || baseInfo.front) {
    faces.push({
      pts: basePts,
      fill: shadeHex(sideFill, baseInfo.lit),
      stroke: 'rgba(0, 0, 0, 0.35)',
      lineWidth: 0.85,
      depth: baseInfo.depth,
    });
  }

  const extrudePx = Math.hypot(roofPts[0].x - basePts[0].x, roofPts[0].y - basePts[0].y);
  if (extrudePx >= 0.5) {
    for (let k = 0; k < poly.length; k++) {
      if (skipWalls?.has(k)) continue;
      const next = (k + 1) % poly.length;
      const quad = [basePts[k], basePts[next], roofPts[next], roofPts[k]];
      const wInfo = faceViewInfo(quad, interior, proj.camDist);
      if (!drawHiddenBack && !wInfo.front) continue;
      const isEndWall = Boolean(endCapFill) && (k === 0 || k === 2);
      const rawFill = isEndWall ? (k === 2 && endCapShade ? endCapShade : endCapFill!) : sideFill;
      faces.push({
        pts: quad,
        fill: shadeHex(rawFill, wInfo.lit),
        stroke: isEndWall ? 'rgba(100, 116, 139, 0.45)' : 'rgba(0, 0, 0, 0.28)',
        lineWidth: 0.72,
        depth: wInfo.depth,
      });
    }
  }

  faces.sort((a, b) => b.depth - a.depth);
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const f of faces) {
    ctx.beginPath();
    f.pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    if (f.lineWidth > 0) {
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = f.lineWidth;
      ctx.stroke();
    }
  }
  ctx.restore();

  return { basePts, roofPts };
}

/** Projects a true 3D circular cylinder between `zBot` and `zTop` as a seamless specular-shaded
 *  silhouette contour (zero facet seams even under translucent X-ray rendering). */
function drawCylinder3D(
  ctx: CanvasRenderingContext2D,
  centerWorld: Point,
  radiusMil: number,
  zBot: number,
  zTop: number,
  proj: Projector3D,
  wallFill: string,
  topFill: string,
  strokeCol: string,
  alpha = 0.96,
  options?: {
    stripeColor?: string;
    stripeAngleRad?: number;
    drawCrossVent?: boolean;
    rimStroke?: string;
  },
): { botRing: ProjectedPoint[]; topRing: ProjectedPoint[] } {
  const P = proj.project3D;
  const N = 32;
  const botRing: ProjectedPoint[] = [];
  const topRing: ProjectedPoint[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const pt = { x: centerWorld.x + Math.cos(a) * radiusMil, y: centerWorld.y + Math.sin(a) * radiusMil };
    botRing.push(P(pt, zBot));
    topRing.push(P(pt, zTop));
  }

  const cBot = P(centerWorld, zBot);
  const cTop = P(centerWorld, zTop);
  const cMid = {
    vx: (cBot.vx + cTop.vx) * 0.5,
    vy: (cBot.vy + cTop.vy) * 0.5,
    vz: (cBot.vz + cTop.vz) * 0.5,
  };
  const topIsFront = cTop.depth <= cBot.depth;

  const drawCap = (ring: ProjectedPoint[], fill: string, stroke: string, isLid: boolean) => {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    ring.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();

    // Subtle radial sheen across circular lid
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
    grad.addColorStop(0, shadeHex(fill, 1.08));
    grad.addColorStop(0.55, fill);
    grad.addColorStop(1, shadeHex(fill, 0.86));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    if (isLid && options?.stripeColor) {
      const a0 = (options.stripeAngleRad ?? 0) - 0.52;
      const stripePts: ProjectedPoint[] = [];
      for (let s = 0; s <= 6; s++) {
        const ang = a0 + (s / 6) * 1.04;
        stripePts.push(P({ x: centerWorld.x + Math.cos(ang) * radiusMil * 0.94, y: centerWorld.y + Math.sin(ang) * radiusMil * 0.94 }, zTop));
      }
      ctx.beginPath();
      stripePts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = options.stripeColor;
      ctx.fill();
    }

    if (isLid && options?.drawCrossVent) {
      const pA = P({ x: centerWorld.x - radiusMil * 0.46, y: centerWorld.y - radiusMil * 0.46 }, zTop);
      const pB = P({ x: centerWorld.x + radiusMil * 0.46, y: centerWorld.y + radiusMil * 0.46 }, zTop);
      const pC = P({ x: centerWorld.x + radiusMil * 0.46, y: centerWorld.y - radiusMil * 0.46 }, zTop);
      const pD = P({ x: centerWorld.x - radiusMil * 0.46, y: centerWorld.y + radiusMil * 0.46 }, zTop);
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
      ctx.moveTo(pC.x, pC.y); ctx.lineTo(pD.x, pD.y);
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
    ctx.restore();
  };

  if (!topIsFront) drawCap(topRing, topFill, strokeCol, true);
  else drawCap(botRing, wallFill, 'rgba(0, 0, 0, 0.35)', false);

  const axisPx = Math.hypot(cTop.x - cBot.x, cTop.y - cBot.y);
  if (axisPx >= 0.75) {
    // Identify contiguous front-facing arc around the circular barrel
    const segFront: boolean[] = new Array(N).fill(false);
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const mx = (botRing[i].vx + botRing[next].vx + topRing[i].vx + topRing[next].vx) * 0.25;
      const my = (botRing[i].vy + botRing[next].vy + topRing[i].vy + topRing[next].vy) * 0.25;
      const mz = (botRing[i].vz + botRing[next].vz + topRing[i].vz + topRing[next].vz) * 0.25;
      const rx = mx - cMid.vx, ry = my - cMid.vy, rz = mz - cMid.vz;
      const vx = -mx, vy = -my, vz = -proj.camDist - mz;
      segFront[i] = rx * vx + ry * vy + rz * vz > 0;
    }

    // Find start of contiguous front run
    let start = -1;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (segFront[i] && !segFront[(i + N - 1) % N]) {
        start = i;
        while (count < N && segFront[(start + count) % N]) count++;
        break;
      }
    }

    if (start >= 0 && count > 0) {
      ctx.save();
      ctx.globalAlpha *= alpha;

      const endIdx = (start + count) % N;
      const traceArcQuad = (arcStart: number, arcCount: number) => {
        ctx.beginPath();
        ctx.moveTo(botRing[arcStart].x, botRing[arcStart].y);
        for (let s = 1; s <= arcCount; s++) {
          const p = botRing[(arcStart + s) % N];
          ctx.lineTo(p.x, p.y);
        }
        for (let s = arcCount; s >= 0; s--) {
          const p = topRing[(arcStart + s) % N];
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      };

      traceArcQuad(start, count);
      const pA = botRing[start], pB = botRing[endIdx];
      const cylGrad = ctx.createLinearGradient(pA.x, pA.y, pB.x, pB.y);
      cylGrad.addColorStop(0.0, shadeHex(wallFill, 0.78));
      cylGrad.addColorStop(0.28, shadeHex(wallFill, 1.38));
      cylGrad.addColorStop(0.62, shadeHex(wallFill, 0.96));
      cylGrad.addColorStop(1.0, shadeHex(wallFill, 0.66));
      ctx.fillStyle = cylGrad;
      ctx.fill();

      if (options?.stripeColor) {
        const stripeCenter = options.stripeAngleRad ?? 0;
        let sRunStart = -1;
        let sRunLen = 0;
        for (let s = 0; s < count; s++) {
          const idx = (start + s) % N;
          const angle = ((idx + 0.5) / N) * Math.PI * 2;
          let diff = Math.abs(angle - stripeCenter);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff < 0.48) {
            if (sRunStart < 0) sRunStart = idx;
            sRunLen++;
          } else if (sRunStart >= 0) {
            break;
          }
        }
        if (sRunStart >= 0 && sRunLen > 0) {
          traceArcQuad(sRunStart, sRunLen);
          ctx.fillStyle = options.stripeColor;
          ctx.fill();
        }
      }

      traceArcQuad(start, count);
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (topIsFront) drawCap(topRing, topFill, options?.rimStroke || strokeCol, true);
  else drawCap(botRing, wallFill, strokeCol, false);

  return { botRing, topRing };
}

/** Draws a true volumetric 3D Standing TO-220 / Power MOSFET (`Q...`):
 *  - Parallel vertical 3D stamped rectangular leadframes stepping down cleanly into solder fillets (never splayed!)
 *  - Realistic 1:1 depth aluminum backing plate (`~42 mil`) + flush matte black epoxy front package (`~92 mil`)
 *  - True 6-vertex beveled upper heatsink tab with open circular `evenodd` mounting hole & inner metallic bore wall
 *  - Silkscreen label quad placed on the visible lower epoxy/heatsink body waist (never overlapping the mounting hole!) */
function drawStandingMosfet3D(
  ctx: CanvasRenderingContext2D,
  board: Board,
  part: Part,
  polyWorld: Point[],
  zBase: number,
  zSign: number,
  totalH: number,
  proj: Projector3D,
  selected: boolean,
  focused: boolean,
  palette: Palette,
): { roofPts: ProjectedPoint[]; labelQuad: ProjectedPoint[] } {
  const P = proj.project3D;
  const q = orientQuadToEnds(polyWorld);

  // Extract package frame vectors: uD across thickness (0->1), uW along pin row (0->3)
  const rawWVec = { x: q[3].x - q[0].x, y: q[3].y - q[0].y };
  const rawWLen = Math.hypot(rawWVec.x, rawWVec.y) || 1;
  let uW = { x: rawWVec.x / rawWLen, y: rawWVec.y / rawWLen };
  let uD = { x: -uW.y, y: uW.x };
  const dHint = { x: q[1].x - q[0].x, y: q[1].y - q[0].y };
  if (uD.x * dHint.x + uD.y * dHint.y < 0) {
    uD = { x: -uD.x, y: -uD.y };
  }
  // Ensure consistent screen-facing orientation: epoxy plastic side on +uD (+Y bottom / +X right), metal tab on -uD
  if (uD.y < -0.05 || (Math.abs(uD.y) <= 0.05 && uD.x < 0)) {
    uD = { x: -uD.x, y: -uD.y };
  }

  let pinMinW = Infinity, pinMaxW = -Infinity;
  let pinSumX = 0, pinSumY = 0, pCount = 0;
  for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
    const pin = board.pins[pIdx];
    pinSumX += pin.x; pinSumY += pin.y; pCount++;
  }
  const pkgCenter = pCount > 0
    ? { x: pinSumX / pCount, y: pinSumY / pCount }
    : { x: (q[0].x + q[2].x) * 0.5, y: (q[0].y + q[2].y) * 0.5 };
  for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
    const pin = board.pins[pIdx];
    const pw = (pin.x - pkgCenter.x) * uW.x + (pin.y - pkgCenter.y) * uW.y;
    if (pw < pinMinW) pinMinW = pw;
    if (pw > pinMaxW) pinMaxW = pw;
  }
  const pinSpan = Number.isFinite(pinMinW) ? Math.max(0, pinMaxW - pinMinW) : rawWLen;

  // Real JEDEC TO-220 proportions (~300 mil wide x ~135 mil deep x ~380 mil tall)
  const pkgW = Math.max(rawWLen, pinSpan + 76, 210);
  const pkgD = Math.min(165, Math.max(88, pkgW * 0.45));
  const halfW = pkgW * 0.5;
  const tabBackD = -pkgD * 0.56;
  const splitD = -pkgD * 0.24; // ~32% thickness for aluminum plate (~43 mil)
  const bodyFrontD = pkgD * 0.44; // ~68% thickness for molded black epoxy (~92 mil, centered cleanly over pin line d=0!)

  const rectAtDepth = (d0: number, d1: number, hw = halfW): Point[] => [
    { x: pkgCenter.x - uW.x * hw + uD.x * d0, y: pkgCenter.y - uW.y * hw + uD.y * d0 },
    { x: pkgCenter.x - uW.x * hw + uD.x * d1, y: pkgCenter.y - uW.y * hw + uD.y * d1 },
    { x: pkgCenter.x + uW.x * hw + uD.x * d1, y: pkgCenter.y + uW.y * hw + uD.y * d1 },
    { x: pkgCenter.x + uW.x * hw + uD.x * d0, y: pkgCenter.y + uW.y * hw + uD.y * d0 },
  ];

  const tabBase = rectAtDepth(tabBackD, splitD);
  const bodyBase = rectAtDepth(splitD, bodyFrontD);

  const realH = Math.min(430, Math.max(totalH, pkgW * 1.28));
  const leadH = Math.min(62, Math.max(30, realH * 0.16));
  const zBodyBot = zBase + zSign * leadH;
  const zShoulderBot = zBase + zSign * (leadH * 0.46);
  const zBodyTop = zBase + zSign * (realH * 0.62);
  const zTabTop = zBase + zSign * realH;

  // Same-Z front/back depth comparison at epoxy mid-height so metal plate & plastic never swap order
  const zBodyMid = (zBodyBot + zBodyTop) * 0.5;
  const tabMidPos = {
    x: pkgCenter.x + uD.x * ((tabBackD + splitD) * 0.5),
    y: pkgCenter.y + uD.y * ((tabBackD + splitD) * 0.5),
  };
  const bodyMidPos = {
    x: pkgCenter.x + uD.x * ((splitD + bodyFrontD) * 0.5),
    y: pkgCenter.y + uD.y * ((splitD + bodyFrontD) * 0.5),
  };
  const tabBehindBody = P(tabMidPos, zBodyMid).depth >= P(bodyMidPos, zBodyMid).depth;
  const topViewFromBodySide = P(pkgCenter, zTabTop).depth <= P(pkgCenter, zBase).depth;
  const strokeCol = selected ? palette.selectionRing : focused ? palette.active : '#475569';

  const drawVertical3DLeads = () => {
    const pinsList: { pin: Pin; depth: number }[] = [];
    for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
      const pin = board.pins[pIdx];
      pinsList.push({ pin, depth: P(pin, zShoulderBot).depth });
    }
    pinsList.sort((a, b) => b.depth - a.depth);

    const makePinBox = (cx: Point, hwPin: number, hdPin: number): Point[] => [
      { x: cx.x - uW.x * hwPin - uD.x * hdPin, y: cx.y - uW.y * hwPin - uD.y * hdPin },
      { x: cx.x - uW.x * hwPin + uD.x * hdPin, y: cx.y - uW.y * hwPin + uD.y * hdPin },
      { x: cx.x + uW.x * hwPin + uD.x * hdPin, y: cx.y + uW.y * hwPin + uD.y * hdPin },
      { x: cx.x + uW.x * hwPin - uD.x * hdPin, y: cx.y + uW.y * hwPin - uD.y * hdPin },
    ];

    for (const { pin } of pinsList) {
      // Keep W coordinate 100% locked onto the pin so leads drop straight parallel into each pad!
      const pw = (pin.x - pkgCenter.x) * uW.x + (pin.y - pkgCenter.y) * uW.y;
      const bodyAnchorLine = { x: pkgCenter.x + uW.x * pw, y: pkgCenter.y + uW.y * pw };
      const upperPoly = makePinBox(bodyAnchorLine, Math.min(13, Math.max(8, pin.radius * 0.68)), 7);
      const lowerPoly = makePinBox(pin, Math.min(7.5, Math.max(4.5, pin.radius * 0.38)), 5.5);

      drawExtrudedPrism3D(ctx, upperPoly, zShoulderBot, zBodyBot + zSign * 2, proj, '#cbd5e1', '#94a3b8', '#64748b', 0.98);
      drawExtrudedPrism3D(ctx, lowerPoly, zBase, zShoulderBot + zSign * 1, proj, '#f1f5f9', '#cbd5e1', '#64748b', 0.99);
    }
  };

  // True 6-vertex beveled hexagonal aluminum upper heatsink tab with open circular pierced mounting hole
  const renderUpperTabWithHole = () => {
    const chamfer = pkgW * 0.14;
    const hexHeight = Math.abs(zTabTop - zBodyTop);
    const chamferZ = zSign * Math.min(hexHeight * 0.42, chamfer * 1.15);
    const hexCoords: { w: number; z: number }[] = [
      { w: -halfW, z: zBodyTop },
      { w: -halfW, z: zTabTop - chamferZ },
      { w: -halfW + chamfer, z: zTabTop },
      { w: halfW - chamfer, z: zTabTop },
      { w: halfW, z: zTabTop - chamferZ },
      { w: halfW, z: zBodyTop },
    ];

    const backPts = hexCoords.map((c) => P({ x: pkgCenter.x + uW.x * c.w + uD.x * tabBackD, y: pkgCenter.y + uW.y * c.w + uD.y * tabBackD }, c.z));
    const frontPts = hexCoords.map((c) => P({ x: pkgCenter.x + uW.x * c.w + uD.x * splitD, y: pkgCenter.y + uW.y * c.w + uD.y * splitD }, c.z));

    const tabCenterZ = (zBodyTop + zTabTop) * 0.5;
    const interiorMid = P(tabMidPos, tabCenterZ);

    const holeZ = zBodyTop + (zTabTop - zBodyTop) * 0.50;
    const rHole = Math.min(pkgW * 0.145, hexHeight * 0.31);
    const holeN = 16;
    const backHole: ProjectedPoint[] = [];
    const frontHole: ProjectedPoint[] = [];
    for (let s = 0; s < holeN; s++) {
      const a = (s / holeN) * Math.PI * 2;
      const hwOff = Math.cos(a) * rHole;
      const hz = holeZ + Math.sin(a) * rHole;
      backHole.push(P({ x: pkgCenter.x + uW.x * hwOff + uD.x * tabBackD, y: pkgCenter.y + uW.y * hwOff + uD.y * tabBackD }, hz));
      frontHole.push(P({ x: pkgCenter.x + uW.x * hwOff + uD.x * splitD, y: pkgCenter.y + uW.y * hwOff + uD.y * splitD }, hz));
    }
    const holeAxisMid = P(tabMidPos, holeZ);

    const backFaceInfo = faceViewInfo(backPts, interiorMid, proj.camDist);
    const frontFaceInfo = faceViewInfo(frontPts, interiorMid, proj.camDist);
    const frontIsNear = frontFaceInfo.depth <= backFaceInfo.depth;
    const farPts = frontIsNear ? backPts : frontPts;
    const farInfo = frontIsNear ? backFaceInfo : frontFaceInfo;
    const nearPts = frontIsNear ? frontPts : backPts;
    const nearInfo = frontIsNear ? frontFaceInfo : backFaceInfo;

    const drawPiercedPlateFace = (outerRing: ProjectedPoint[], holeRing: ProjectedPoint[], lit: number, stroke: string) => {
      ctx.save();
      ctx.beginPath();
      outerRing.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      holeRing.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = shadeHex('#e2e8f0', lit);
      ctx.fill('evenodd');

      ctx.beginPath();
      outerRing.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.95;
      ctx.stroke();

      ctx.beginPath();
      holeRing.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.72)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    };

    // 1. Far pierced cap face (allows seeing PCB behind through open circular hole!)
    drawPiercedPlateFace(farPts, frontIsNear ? backHole : frontHole, farInfo.lit * 0.92, '#64748b');

    // 2. Visible outer chamfered perimeter edges (edges 0..4, skipping bottom seam 5->0 touching tabLower)
    const perimWalls: { pts: ProjectedPoint[]; fill: string; depth: number }[] = [];
    for (let k = 0; k < 5; k++) {
      const next = (k + 1) % 6;
      const quad = [backPts[k], backPts[next], frontPts[next], frontPts[k]];
      const wInfo = faceViewInfo(quad, interiorMid, proj.camDist);
      if (!wInfo.front) continue;
      perimWalls.push({ pts: quad, fill: shadeHex('#cbd5e1', wInfo.lit), depth: wInfo.depth });
    }
    perimWalls.sort((a, b) => b.depth - a.depth);
    for (const pw of perimWalls) {
      ctx.beginPath();
      pw.pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = pw.fill;
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // 3. Machined cylindrical metal bore inside the pierced mounting hole
    const boreQuads: { pts: ProjectedPoint[]; fill: string; depth: number }[] = [];
    for (let s = 0; s < holeN; s++) {
      const next = (s + 1) % holeN;
      const quad = [backHole[s], backHole[next], frontHole[next], frontHole[s]];
      const bInfo = faceViewInfo(quad, holeAxisMid, proj.camDist, holeAxisMid);
      if (!bInfo.front) continue;
      boreQuads.push({ pts: quad, fill: shadeHex('#94a3b8', bInfo.lit), depth: bInfo.depth });
    }
    boreQuads.sort((a, b) => b.depth - a.depth);
    for (const bq of boreQuads) {
      ctx.beginPath();
      bq.pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = bq.fill;
      ctx.fill();
    }

    // 4. Near pierced aluminum plate face
    drawPiercedPlateFace(nearPts, frontIsNear ? frontHole : backHole, nearInfo.lit, selected ? palette.selectionRing : focused ? palette.active : '#64748b');
  };

  let bodyRes!: { basePts: ProjectedPoint[]; roofPts: ProjectedPoint[] };
  let tabLowerRes!: { basePts: ProjectedPoint[]; roofPts: ProjectedPoint[] };

  if (topViewFromBodySide) {
    drawVertical3DLeads();
    if (tabBehindBody) {
      tabLowerRes = drawExtrudedPrism3D(ctx, tabBase, zBodyBot, zBodyTop, proj, '#e2e8f0', '#cbd5e1', '#64748b', 0.98);
      bodyRes = drawExtrudedPrism3D(ctx, bodyBase, zBodyBot, zBodyTop, proj, '#262d38', '#151a22', strokeCol, 0.99);
    } else {
      bodyRes = drawExtrudedPrism3D(ctx, bodyBase, zBodyBot, zBodyTop, proj, '#262d38', '#151a22', strokeCol, 0.99);
      tabLowerRes = drawExtrudedPrism3D(ctx, tabBase, zBodyBot, zBodyTop, proj, '#e2e8f0', '#cbd5e1', '#64748b', 0.98);
    }
    renderUpperTabWithHole();
  } else {
    renderUpperTabWithHole();
    if (tabBehindBody) {
      tabLowerRes = drawExtrudedPrism3D(ctx, tabBase, zBodyBot, zBodyTop, proj, '#e2e8f0', '#cbd5e1', '#64748b', 0.98);
      bodyRes = drawExtrudedPrism3D(ctx, bodyBase, zBodyBot, zBodyTop, proj, '#262d38', '#151a22', strokeCol, 0.99);
    } else {
      bodyRes = drawExtrudedPrism3D(ctx, bodyBase, zBodyBot, zBodyTop, proj, '#262d38', '#151a22', strokeCol, 0.99);
      tabLowerRes = drawExtrudedPrism3D(ctx, tabBase, zBodyBot, zBodyTop, proj, '#e2e8f0', '#cbd5e1', '#64748b', 0.98);
    }
    drawVertical3DLeads();
  }

  // Place designator label on lower epoxy front wall (or lower metal plate when viewed from behind) — never over the hole!
  const pitchAbs = Math.abs(Math.acos(Math.max(-1, Math.min(1, proj.cosP))) * 180 / Math.PI);
  const labelQuad = pitchAbs < 24
    ? bodyRes.roofPts
    : tabBehindBody
      ? [bodyRes.basePts[1], bodyRes.basePts[2], bodyRes.roofPts[2], bodyRes.roofPts[1]]
      : [tabLowerRes.basePts[0], tabLowerRes.basePts[3], tabLowerRes.roofPts[3], tabLowerRes.roofPts[0]];

  return { roofPts: bodyRes.roofPts, labelQuad };
}

/** Draws an authentic 3D Connector (`J...`) matched to its real physical style:
 *  - Through-hole vertical shrouded box headers (`J1`): hollow cavity with true `(pin.x, pin.y)` gold pins
 *  - Fine-pitch SMD FPC/Mezzanine sockets (`J4800`): low-profile plastic frame + flush gold contact fingers
 *  - Wide SMD Edge I/O Receptacles (`J4400`, `J4600`, `J3200`): closed brushed-steel RF shield + outward front port mouth */
function drawConnector3D(
  ctx: CanvasRenderingContext2D,
  board: Board,
  part: Part,
  polyWorld: Point[],
  zBase: number,
  zSign: number,
  heightMil: number,
  proj: Projector3D,
  selected: boolean,
  focused: boolean,
  xrayAlpha: number,
  palette: Palette,
): { roofPts: ProjectedPoint[]; floatLabel: boolean } {
  const P = proj.project3D;
  const outer = orientQuadToEnds(polyWorld);
  const edgeShort = Math.hypot(outer[1].x - outer[0].x, outer[1].y - outer[0].y);
  const edgeLong = Math.hypot(outer[3].x - outer[0].x, outer[3].y - outer[0].y);
  const shortDim = Math.min(edgeShort, edgeLong);
  const longDim = Math.max(edgeShort, edgeLong);
  const pinCount = Math.max(0, part.pinEnd - part.pinStart);

  // Detect whether any outer wall faces outside the PCB perimeter (edge I/O port like USB/HDMI/SD/mDP)
  let touchesBoardEdge = false;
  if (board.outline.length >= 3) {
    const cWorld = {
      x: (outer[0].x + outer[2].x) * 0.5,
      y: (outer[0].y + outer[2].y) * 0.5,
    };
    for (let k = 0; k < 4; k++) {
      const mid = lerpPt(outer[k], outer[(k + 1) % 4], 0.5);
      const nx = mid.x - cWorld.x;
      const ny = mid.y - cWorld.y;
      const nLen = Math.hypot(nx, ny) || 1;
      const probe = { x: mid.x + (nx / nLen) * 35, y: mid.y + (ny / nLen) * 35 };
      if (!pointInPolygon(probe, board.outline)) {
        touchesBoardEdge = true;
        break;
      }
    }
  }

  // Classify physical connector housing style from mount type, edge placement & real geometry
  const isThroughHeader = part.type === 'through';
  const isWideIoPort = shortDim >= 170 && (!isThroughHeader || touchesBoardEdge || shortDim >= 230);

  if (isWideIoPort) {
    // Closed brushed-steel / aluminum shielded I/O receptacle (USB-A, MiniDP/Thunderbolt, SD card, HDMI, MagSafe)
    const zRoof = zBase + zSign * heightMil;
    const strokeCol = selected ? palette.selectionRing : focused ? palette.active : '#94a3b8';
    const { basePts, roofPts } = drawExtrudedPrism3D(
      ctx,
      outer,
      zBase,
      zRoof,
      proj,
      '#64748b',
      '#475569',
      strokeCol,
      xrayAlpha,
      '#334155',
      '#475569',
    );

    // Subtle stamped RF shield recess border on the metal top roof
    const rCenter = {
      vx: (roofPts[0].vx + roofPts[1].vx + roofPts[2].vx + roofPts[3].vx) * 0.25,
      vy: (roofPts[0].vy + roofPts[1].vy + roofPts[2].vy + roofPts[3].vy) * 0.25,
      vz: (roofPts[0].vz + roofPts[1].vz + roofPts[2].vz + roofPts[3].vz) * 0.25,
    };
    const bCenter = {
      vx: (basePts[0].vx + basePts[1].vx + basePts[2].vx + basePts[3].vx) * 0.25,
      vy: (basePts[0].vy + basePts[1].vy + basePts[2].vy + basePts[3].vy) * 0.25,
      vz: (basePts[0].vz + basePts[1].vz + basePts[2].vz + basePts[3].vz) * 0.25,
    };
    if (rCenter.vz <= bCenter.vz) {
      const stamp = insetQuad(roofPts, 0.08, 0.10);
      ctx.save();
      ctx.globalAlpha *= xrayAlpha;
      ctx.beginPath();
      stamp.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }

    // Draw dark recessed horizontal port mouth on any wall facing outside the board outline
    if (board.outline.length >= 3) {
      const cWorld = {
        x: (outer[0].x + outer[2].x) * 0.5,
        y: (outer[0].y + outer[2].y) * 0.5,
      };
      const interior = {
        vx: (rCenter.vx + bCenter.vx) * 0.5,
        vy: (rCenter.vy + bCenter.vy) * 0.5,
        vz: (rCenter.vz + bCenter.vz) * 0.5,
      };
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        const a = outer[k];
        const b = outer[next];
        const mid = lerpPt(a, b, 0.5);
        const nx = mid.x - cWorld.x;
        const ny = mid.y - cWorld.y;
        const nLen = Math.hypot(nx, ny) || 1;
        const probe = { x: mid.x + (nx / nLen) * 35, y: mid.y + (ny / nLen) * 35 };
        if (pointInPolygon(probe, board.outline)) continue;

        const wInfo = faceViewInfo([basePts[k], basePts[next], roofPts[next], roofPts[k]], interior, proj.camDist);
        if (!wInfo.front) continue;
        const zMouthBot = zBase + zSign * (heightMil * 0.16);
        const zMouthTop = zBase + zSign * (heightMil * 0.84);
        const ma = lerpPt(a, b, 0.10);
        const mb = lerpPt(a, b, 0.90);
        const mouthPts = [P(ma, zMouthBot), P(mb, zMouthBot), P(mb, zMouthTop), P(ma, zMouthTop)];
        ctx.save();
        ctx.globalAlpha *= xrayAlpha;
        ctx.beginPath();
        mouthPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = '#0b0f16';
        ctx.fill();
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Thin central tongue + gold contact pins deep inside horizontal port mouth
        const zTongue = zBase + zSign * (heightMil * 0.48);
        const tA = P(lerpPt(a, b, 0.22), zTongue);
        const tB = P(lerpPt(a, b, 0.78), zTongue);
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = Math.max(1.4, Math.hypot(mouthPts[3].x - mouthPts[0].x, mouthPts[3].y - mouthPts[0].y) * 0.16);
        ctx.beginPath();
        ctx.moveTo(tA.x, tA.y);
        ctx.lineTo(tB.x, tB.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    return { roofPts, floatLabel: false };
  }

  // Hollow Top-Opening Connector: Through-Hole Box Header (`J1`) or Low-Profile SMD FPC/B2B Socket (`J4800`)
  const wallT = isThroughHeader ? 0.22 : Math.min(0.24, Math.max(0.14, 14 / Math.max(40, shortDim)));
  const cavity = insetQuad(outer, Math.min(0.12, Math.max(0.05, 16 / Math.max(60, longDim))), wallT);
  const zRoof = zBase + zSign * heightMil;
  const zFloor = zBase + zSign * (isThroughHeader ? Math.min(20, heightMil * 0.22) : heightMil * 0.42);
  const zPinTip = isThroughHeader
    ? zRoof - zSign * Math.min(8, heightMil * 0.08)
    : zFloor + zSign * Math.max(4, (zRoof - zBase) * zSign * 0.34);

  const oBase = outer.map((pt) => P(pt, zBase));
  const oRoof = outer.map((pt) => P(pt, zRoof));
  const cFloor = cavity.map((pt) => P(pt, zFloor));
  const cRoof = cavity.map((pt) => P(pt, zRoof));

  const interior = { vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 4; i++) {
    interior.vx += oBase[i].vx + oRoof[i].vx;
    interior.vy += oBase[i].vy + oRoof[i].vy;
    interior.vz += oBase[i].vz + oRoof[i].vz;
  }
  interior.vx /= 8; interior.vy /= 8; interior.vz /= 8;

  const roofInfo = faceViewInfo(oRoof, interior, proj.camDist);
  const baseInfo = faceViewInfo(oBase, interior, proj.camDist);

  const outerWalls = [0, 1, 2, 3].map((k) => {
    const next = (k + 1) % 4;
    const quad = [oBase[k], oBase[next], oRoof[next], oRoof[k]];
    const wInfo = faceViewInfo(quad, interior, proj.camDist);
    return { k, next, quad, ...wInfo };
  });
  const backOuter = outerWalls.filter((w) => !w.front).sort((a, b) => b.depth - a.depth);
  const frontOuter = outerWalls.filter((w) => w.front).sort((a, b) => b.depth - a.depth);

  const fillWallPts = (pts: ProjectedPoint[], fill: string, stroke = 'rgba(0,0,0,0.35)') => {
    ctx.beginPath();
    pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };

  ctx.save();
  ctx.globalAlpha *= xrayAlpha;

  if (!roofInfo.front && baseInfo.front) {
    fillWallPts(oRoof, '#1e293b');
  }
  for (const w of backOuter) {
    fillWallPts(w.quad, shadeHex(w.k === 0 || w.k === 2 ? '#2c3543' : '#364152', w.lit));
  }

  // Dark recessed cavity floor & visible inner cavity walls
  ctx.beginPath();
  cFloor.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.fillStyle = '#090d12';
  ctx.fill();

  const cavInterior = { vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 4; i++) {
    cavInterior.vx += cFloor[i].vx + cRoof[i].vx;
    cavInterior.vy += cFloor[i].vy + cRoof[i].vy;
    cavInterior.vz += cFloor[i].vz + cRoof[i].vz;
  }
  cavInterior.vx /= 8; cavInterior.vy /= 8; cavInterior.vz /= 8;

  const innerWalls = [0, 1, 2, 3].map((k) => {
    const next = (k + 1) % 4;
    const quad = [cFloor[k], cFloor[next], cRoof[next], cRoof[k]];
    const wInfo = faceViewInfo(quad, cavInterior, proj.camDist, cavInterior);
    return { quad, ...wInfo };
  }).filter((w) => w.front).sort((a, b) => b.depth - a.depth);
  for (const iw of innerWalls) {
    fillWallPts(iw.quad, shadeHex('#141a22', iw.lit), 'rgba(0,0,0,0.45)');
  }

  // Internal 3D gold contacts placed at true `(pin.x, pin.y)` coordinates clamped within inner cavity bounds (never squished by 0.65)
  if (pinCount > 0 && pinCount <= 80) {
    const cavMidA = lerpPt(cavity[0], cavity[1], 0.5);
    const cavMidB = lerpPt(cavity[3], cavity[2], 0.5);
    const cavCenter = lerpPt(cavMidA, cavMidB, 0.5);
    const ldx = cavMidB.x - cavMidA.x, ldy = cavMidB.y - cavMidA.y;
    const lLen = Math.hypot(ldx, ldy) || 1;
    const wCavLen = Math.hypot(cavity[1].x - cavity[0].x, cavity[1].y - cavity[0].y);
    const uL = { x: ldx / lLen, y: ldy / lLen };
    const uS = { x: -uL.y, y: uL.x };
    const halfCavL = Math.max(4, lLen * 0.5 - 4);
    const halfCavS = Math.max(2, wCavLen * 0.5 - 3);

    const pinObjs: { pBot: ProjectedPoint; pTop: ProjectedPoint; d: number }[] = [];
    for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
      const pin = board.pins[pIdx];
      const rx = pin.x - cavCenter.x, ry = pin.y - cavCenter.y;
      const alongL = Math.max(-halfCavL, Math.min(halfCavL, rx * uL.x + ry * uL.y));
      const acrossS = Math.max(-halfCavS, Math.min(halfCavS, rx * uS.x + ry * uS.y));
      const insidePin = {
        x: cavCenter.x + uL.x * alongL + uS.x * acrossS,
        y: cavCenter.y + uL.y * alongL + uS.y * acrossS,
      };
      const pBot = P(insidePin, zFloor);
      const pTop = P(insidePin, zPinTip);
      pinObjs.push({ pBot, pTop, d: (pBot.depth + pTop.depth) * 0.5 });
    }
    pinObjs.sort((a, b) => b.d - a.d);
    const cavW = Math.hypot(cRoof[1].x - cRoof[0].x, cRoof[1].y - cRoof[0].y);
    const pinW = Math.min(3.4, Math.max(1.2, cavW * 0.12));
    ctx.lineCap = 'butt';
    for (const { pBot, pTop } of pinObjs) {
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = pinW + 0.5;
      ctx.beginPath();
      ctx.moveTo(pBot.x, pBot.y);
      ctx.lineTo(pTop.x, pTop.y);
      ctx.stroke();

      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = Math.max(0.9, pinW * 0.6);
      ctx.beginPath();
      ctx.moveTo(pBot.x, pBot.y);
      ctx.lineTo(pTop.x, pTop.y);
      ctx.stroke();
    }
  }

  // Front exterior housing walls (naturally occlude internal contacts)
  for (const w of frontOuter) {
    fillWallPts(w.quad, shadeHex(w.k === 0 || w.k === 2 ? '#374151' : '#475569', w.lit));
  }

  const strokeCol = selected ? palette.selectionRing : focused ? palette.active : '#94a3b8';
  if (roofInfo.front) {
    ctx.beginPath();
    oRoof.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.moveTo(cRoof[0].x, cRoof[0].y);
    ctx.lineTo(cRoof[3].x, cRoof[3].y);
    ctx.lineTo(cRoof[2].x, cRoof[2].y);
    ctx.lineTo(cRoof[1].x, cRoof[1].y);
    ctx.closePath();
    ctx.fillStyle = shadeHex('#2d3748', roofInfo.lit);
    ctx.fill('evenodd');
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = selected ? 2.2 : 1.05;
    ctx.stroke();

    const notchA = P(lerpPt(lerpPt(outer[0], outer[3], 0.36), lerpPt(outer[1], outer[2], 0.08), 0.5), zRoof);
    const notchB = P(lerpPt(lerpPt(outer[0], outer[3], 0.64), lerpPt(outer[1], outer[2], 0.08), 0.5), zRoof);
    ctx.strokeStyle = '#090d12';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(notchA.x, notchA.y);
    ctx.lineTo(notchB.x, notchB.y);
    ctx.stroke();
  } else {
    fillWallPts(oBase, shadeHex('#334155', baseInfo.lit), strokeCol);
  }

  ctx.restore();
  return { roofPts: oRoof, floatLabel: true };
}

/** Draws a 3D Orientation Compass Gizmo in the top-right corner of the 3D viewport. */
function draw3DGizmo(
  ctx: CanvasRenderingContext2D,
  w: number,
  rotation: number,
  cam: Camera3D,
  flipX: boolean,
  flipY: boolean,
  flipZ: boolean,
  palette: Palette,
): void {
  const compact = w < 780;
  const gx = compact ? w - 34 : w - 48;
  const gy = compact ? 76 : 54;
  const radius = compact ? 22 : 30;
  const len = compact ? 16 : 22;

  const rotRad = ((rotation + cam.yawDeg) * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const pitchRad = (cam.pitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);

  const projAxis = (ax: number, ay: number, az: number) => {
    const dx = flipX ? -ax : ax;
    const dy = flipY ? -ay : ay;
    const dz = flipZ ? -az : az;
    const rx = dx * cosR - dy * sinR;
    const ry = dx * sinR + dy * cosR;
    return {
      x: gx + rx * len,
      y: gy + (ry * cosP - dz * sinP) * len,
    };
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(gx, gy, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.isLightCanvas ? 'rgba(240, 244, 248, 0.9)' : 'rgba(10, 16, 24, 0.86)';
  ctx.fill();
  ctx.strokeStyle = palette.outlineStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const axes: { label: string; col: string; p: { x: number; y: number } }[] = [
    { label: 'X', col: '#ef4444', p: projAxis(1, 0, 0) },
    { label: 'Y', col: '#22c55e', p: projAxis(0, 1, 0) },
    { label: 'Z', col: '#3b82f6', p: projAxis(0, 0, 1) },
  ];

  ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const a of axes) {
    ctx.strokeStyle = a.col;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(a.p.x, a.p.y);
    ctx.stroke();
    ctx.fillStyle = a.col;
    ctx.fillText(a.label, a.p.x + (a.p.x - gx) * 0.28, a.p.y + (a.p.y - gy) * 0.28);
  }
  ctx.restore();
}

/** Renders the full 3D extruded PCB, 3D solder pads/BGA balls, standing 3D MOSFETs,
 *  standing electrolytic cans, standing ferrite inductors, standing pin headers, and 3D ICs. */
export function renderBoard3D(
  ctx: CanvasRenderingContext2D,
  board: Board,
  index: BoardIndex | null,
  layers: Layers,
  view: View,
  size: { w: number; h: number },
  tr2d: Transform,
  proj: Projector3D,
  cam: Camera3D,
  flipX: boolean,
  flipY: boolean,
  rotation: number,
  selection: Selection | null,
  highlightNet: string | null,
  focusParts: Set<number>,
  palette: Palette,
  isClassic: boolean,
  showGizmo = true,
): void {
  const { w, h } = size;
  const P = proj.project3D;
  const zTopSurface = BOARD_HALF_THICKNESS_MIL;
  const zBotSurface = -BOARD_HALF_THICKNESS_MIL;
  const bothSidesActive = layers.top && layers.bottom;
  const topFacesCamera = bothSidesActive ? proj.topFacesCamera : true;

  const activeNetInfo = highlightNet && index ? index.nets.get(highlightNet) : undefined;
  const hasFilter = Boolean(selection || (highlightNet && highlightNet !== 'UNCONNECTED') || focusParts.size > 0);
  const isDenseBoard = board.parts.length > 40;

  // 1. 3D Reference Grid on the far PCB plane
  if (layers.grid) {
    const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
    const step = steps.find((s) => s * view.scale >= 70) ?? 25000;
    const pad = 600;
    const minX = board.bounds.minX - pad, maxX = board.bounds.maxX + pad;
    const minY = board.bounds.minY - pad, maxY = board.bounds.maxY + pad;
    const zGrid = topFacesCamera ? zBotSurface : zTopSurface;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
      const a = P({ x, y: minY }, zGrid), b = P({ x, y: maxY }, zGrid);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      const a = P({ x: minX, y }, zGrid), b = P({ x: maxX, y }, zGrid);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  // 2. Helper to draw a side's components + pins in proper 3D depth order
  const drawSideComponentsAndPins = (side: 'top' | 'bottom', isFarSideUnderBoard: boolean) => {
    const sideEnabled = side === 'top' ? layers.top : layers.bottom;
    if (!sideEnabled) return;

    const { zBase, zSign } = getSideZ(side, layers);

    // 2a. Solder pads / BGA balls on the PCB surface (z = zBase)
    const drawPinsOnSurface = (overlayPass: boolean) => {
      if (!layers.pins) return;
      type PinBucket = 'normal' | 'gnd' | 'nc' | 'testPad' | 'pin1';
      interface Pin3D {
        sx: number;
        sy: number;
        r: number;
        pin: Pin;
        isSelected: boolean;
        isPartSelected: boolean;
        isSameNet: boolean;
        isPin1: boolean;
        isNc: boolean;
      }
      const buckets: Record<PinBucket, Pin3D[]> = {
        normal: [], gnd: [], nc: [], testPad: [], pin1: [],
      };
      const highlighted: Pin3D[] = [];
      const labeled: Pin3D[] = [];

      for (let idx = 0; idx < board.pins.length; idx++) {
        const pin = board.pins[idx];
        const pinMatchesSide = pin.side === side
          || (pin.side === 'both' && (side === (layers.bottom && !layers.top ? 'bottom' : 'top')));
        if (!pinMatchesSide) continue;

        const projPt = P(pin, zBase);
        const r = Math.min(22, Math.max(1.1, pin.radius * view.scale * 0.9 * projPt.persp));
        if (projPt.x < -r - 4 || projPt.x > w + r + 4 || projPt.y < -r - 4 || projPt.y > h + r + 4) continue;

        const isSelected = selection?.kind === 'pin' && selection.index === idx;
        const isPartSelected = (selection?.kind === 'part' && pin.part === selection.index + 1)
          || (pin.part > 0 && focusParts.has(pin.part - 1));
        const isSameNet = Boolean(highlightNet && pin.net === highlightNet && highlightNet !== 'UNCONNECTED' && highlightNet !== 'NC');
        const isNc = !pin.net || pin.net === 'UNCONNECTED' || pin.net === 'NC';
        const isGnd = pin.net === 'GND' || pin.net === 'GROUND';
        const part = pin.part > 0 ? board.parts[pin.part - 1] : undefined;
        const partPinCount = part ? part.pinEnd - part.pinStart : 0;
        const isPin1 = !pin.isTestPad && partPinCount >= 2
          && (pin.name === 'A1' || pin.number === '1' || pin.name === '1');

        const p3: Pin3D = { sx: projPt.x, sy: projPt.y, r, pin, isSelected, isPartSelected, isSameNet, isPin1, isNc };
        if (isSelected || isSameNet) highlighted.push(p3);
        else if (pin.isTestPad) buckets.testPad.push(p3);
        else if (isPin1) buckets.pin1.push(p3);
        else if (isNc) buckets.nc.push(p3);
        else if (isGnd) buckets.gnd.push(p3);
        else buckets.normal.push(p3);

        if (overlayPass && (r >= 10 || ((isSelected || isPartSelected || isSameNet) && r >= 7))) {
          labeled.push(p3);
        }
      }

      if (!overlayPass) {
        const drawBaseBucket = (arr: Pin3D[], fillCol: string, strokeCol: string, alpha: number) => {
          if (!arr.length) return;
          const dim = hasFilter ? 0.48 : 1;
          ctx.save();
          ctx.beginPath();
          for (const p of arr) {
            const pr = p.r * 1.15;
            ctx.moveTo(p.sx + pr, p.sy);
            ctx.arc(p.sx, p.sy, pr, 0, Math.PI * 2);
          }
          ctx.fillStyle = fillCol;
          ctx.globalAlpha = alpha * dim;
          ctx.fill();
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = Math.min(1.5, Math.max(0.8, arr[0].r * 0.22));
          ctx.globalAlpha = Math.min(1, (alpha + 0.2) * dim);
          ctx.stroke();
          ctx.restore();
        };

        drawBaseBucket(buckets.nc, '#475569', '#94a3b8', 0.6);
        drawBaseBucket(buckets.gnd, '#64748b', '#cbd5e1', 0.75);
        drawBaseBucket(
          buckets.normal,
          side === 'top' ? '#eab308' : '#38bdf8',
          side === 'top' ? '#fef08a' : '#bae6fd',
          0.88,
        );
        drawBaseBucket(buckets.testPad, '#facc15', '#ffffff', 0.95);
        drawBaseBucket(buckets.pin1, palette.pinA1, '#ffffff', 0.92);
      } else {
        const drawXrayRing = (arr: Pin3D[], strokeCol: string, alpha: number) => {
          if (!arr.length) return;
          const dim = hasFilter ? 0.42 : 1;
          ctx.save();
          ctx.beginPath();
          for (const p of arr) {
            ctx.moveTo(p.sx + p.r, p.sy);
            ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
          }
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = Math.min(1.4, Math.max(0.85, arr[0].r * 0.22));
          ctx.globalAlpha = alpha * dim;
          ctx.stroke();
          ctx.restore();
        };

        if (!showGizmo || isFarSideUnderBoard) {
          drawXrayRing(buckets.nc, palette.pinNc, 0.4);
          drawXrayRing(buckets.gnd, '#94a3b8', 0.55);
          drawXrayRing(buckets.normal, side === 'top' ? '#fde047' : '#7dd3fc', 0.65);
          drawXrayRing(buckets.pin1, palette.pinA1, 0.85);
        } else {
          // Only draw X-ray pin-1 rings on exposed orphan/test pads so solid 3D bodies stay unblemished
          const exposedPin1 = buckets.pin1.filter((p) => p.pin.part <= 0 || board.parts[p.pin.part - 1]?.isDummy);
          drawXrayRing(exposedPin1, palette.pinA1, 0.78);
        }

        if (highlighted.length) {
          ctx.save();
          for (const p of highlighted) {
            const hr = Math.max(3, p.r + (p.isSelected ? 2.2 : 1.4));
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, hr, 0, Math.PI * 2);
            ctx.fillStyle = p.isSelected ? palette.pinSelected : palette.pinSameNet;
            ctx.fill();
            ctx.strokeStyle = palette.selectionRing;
            ctx.lineWidth = 1.7;
            ctx.stroke();
          }
          ctx.restore();
        }

        const visibleLabels = showGizmo && !isFarSideUnderBoard
          ? labeled.filter((sp) => sp.isSelected || sp.isPartSelected || sp.isSameNet || sp.pin.part <= 0 || board.parts[sp.pin.part - 1]?.isDummy)
          : labeled;
        if (visibleLabels.length && visibleLabels.length <= 500) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const sp of visibleLabels) {
            const pinLabel = sp.pin.name || sp.pin.number || '';
            if (!pinLabel) continue;
            const fontPx = Math.min(10.5, Math.max(6.5, (sp.r * 1.4) / Math.max(1.8, pinLabel.length * 0.58)));
            if (fontPx < 6.5) continue;
            ctx.font = `700 ${fontPx.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 2.2;
            ctx.strokeText(pinLabel, sp.sx, sp.sy);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(pinLabel, sp.sx, sp.sy);
          }
          ctx.restore();
        }
      }
    };

    // Draw base gold/copper PCB solder pads first
    drawPinsOnSurface(false);

    // 2b. Collect and depth-sort visible 3D components on this side (Painter's algorithm: back-to-front)
    interface Part3DItem {
      part: Part;
      i: number;
      spec: PackageSpec;
      polyWorld: Point[];
      basePts: ProjectedPoint[];
      roofPts: ProjectedPoint[];
      depth: number;
      selected: boolean;
      focused: boolean;
      highlighted: boolean;
      screenSize: number;
    }

    const items: Part3DItem[] = [];
    const selectedPinPart = selection?.kind === 'pin' ? board.pins[selection.index]?.part : 0;

    board.parts.forEach((part, i) => {
      if (part.isDummy || !part.box) return;
      const partSide = part.side === 'both'
        ? (layers.bottom && !layers.top ? 'bottom' : 'top')
        : part.side;
      if (partSide !== side) return;

      const rawPoly = part.outline && part.outline.length >= 4
        ? part.outline
        : [
            { x: part.box.minX, y: part.box.minY },
            { x: part.box.maxX, y: part.box.minY },
            { x: part.box.maxX, y: part.box.maxY },
            { x: part.box.minX, y: part.box.maxY },
          ];

      const spec = classifyPartPackage(part);
      const pin1 = part.pinStart < board.pins.length ? board.pins[part.pinStart] : undefined;
      const orientedRaw = (spec.hasEndCaps || spec.kind === 'transistor' || spec.kind === 'connector')
        ? orientQuadToEnds(rawPoly, pin1)
        : rawPoly;
      const polyWorld = spec.hasEndCaps
        ? insetQuad(orientedRaw, 0.02, 0.08)
        : spec.kind === 'ic'
          ? insetQuad(orientedRaw, 0.09, 0.09)
          : orientedRaw;

      const zBodyBot = spec.kind === 'ic' ? zBase + zSign * Math.max(4, spec.heightMil * 0.14) : zBase;
      const zRoof = zBase + zSign * spec.heightMil;
      const basePts = polyWorld.map((pt) => P(pt, zBodyBot));
      const roofPts = polyWorld.map((pt) => P(pt, zRoof));

      let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity;
      let sumDepth = 0;
      for (let k = 0; k < 4; k++) {
        const b = basePts[k], r = roofPts[k];
        if (b.x < minSX) minSX = b.x;
        if (r.x < minSX) minSX = r.x;
        if (b.x > maxSX) maxSX = b.x;
        if (r.x > maxSX) maxSX = r.x;
        if (b.y < minSY) minSY = b.y;
        if (r.y < minSY) minSY = r.y;
        if (b.y > maxSY) maxSY = b.y;
        if (r.y > maxSY) maxSY = r.y;
        sumDepth += b.depth + r.depth;
      }
      if (maxSX < -12 || minSX > w + 12 || maxSY < -12 || minSY > h + 12) return;

      const focused = focusParts.has(i);
      const selected = (selection?.kind === 'part' && selection.index === i) || selectedPinPart === i + 1;
      const onActiveNet = Boolean(activeNetInfo && activeNetInfo.partIds.has(i + 1));
      const highlighted = selected || focused || onActiveNet;
      const screenSize = Math.max(maxSX - minSX, maxSY - minSY);

      items.push({
        part, i, spec, polyWorld, basePts, roofPts,
        depth: sumDepth / 8,
        selected, focused, highlighted, screenSize,
      });
    });

    items.sort((a, b) => b.depth - a.depth);

    // 2c. Render each 3D extruded / standing component package
    for (const item of items) {
      const { part, spec, polyWorld, basePts, selected, focused, highlighted, screenSize } = item;
      let { roofPts } = item;

      ctx.save();
      if (hasFilter && !highlighted) ctx.globalAlpha = 0.38;

      const xrayAlpha = isFarSideUnderBoard
        ? 0.36
        : selected || focused
          ? 0.98
          : spec.kind === 'bga'
            ? 0.8
            : showGizmo
              ? 0.97
              : 0.92;
      const zRoof = zBase + zSign * spec.heightMil;
      const zBodyBot = spec.kind === 'ic' ? zBase + zSign * Math.max(4, spec.heightMil * 0.14) : zBase;

      // Helper to render the 3D Silkscreen Label on `labelQuad`
      const renderRoofLabel = (labelQuad: ProjectedPoint[], floatAbove = false) => {
        if (!layers.labels) return;
        const minScreenForPassive = isFarSideUnderBoard ? 18 : 32;
        if (isDenseBoard && !spec.showLabelAtAllZooms && screenSize < minScreenForPassive && !selected && !focused) {
          return;
        }
        const rcx = (labelQuad[0].x + labelQuad[1].x + labelQuad[2].x + labelQuad[3].x) * 0.25;
        const rcy = (labelQuad[0].y + labelQuad[1].y + labelQuad[2].y + labelQuad[3].y) * 0.25;
        if (floatAbove) {
          ctx.save();
          ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const topY = Math.min(labelQuad[0].y, labelQuad[1].y, labelQuad[2].y, labelQuad[3].y) - 10;
          ctx.strokeStyle = isFarSideUnderBoard ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.88)';
          ctx.lineWidth = 2.6;
          ctx.strokeText(part.name, rcx, topY);
          ctx.fillStyle = selected || focused ? '#fde047' : (isFarSideUnderBoard ? '#94a3b8' : '#ffffff');
          ctx.fillText(part.name, rcx, topY);
          ctx.restore();
          return;
        }
        const dx01 = labelQuad[1].x - labelQuad[0].x, dy01 = labelQuad[1].y - labelQuad[0].y;
        const dx12 = labelQuad[2].x - labelQuad[1].x, dy12 = labelQuad[2].y - labelQuad[1].y;
        const len01 = Math.hypot(dx01, dy01), len12 = Math.hypot(dx12, dy12);
        const longSide = Math.max(len01, len12), shortSide = Math.min(len01, len12);
        const normAngle = (a: number) => {
          let r = a;
          while (r > Math.PI * 0.49) r -= Math.PI;
          while (r <= -Math.PI * 0.51) r += Math.PI;
          return r;
        };
        const ang01 = normAngle(Math.atan2(dy01, dx01));
        const ang12 = normAngle(Math.atan2(dy12, dx12));
        // For near-square ICs/BGAs, prefer the edge closest to horizontal so chip labels stay upright!
        const angle = longSide <= shortSide * 1.18
          ? (Math.abs(ang01) <= Math.abs(ang12) ? ang01 : ang12)
          : (len01 >= len12 ? ang01 : ang12);

        const maxFontW = (longSide * 0.75) / Math.max(1, part.name.length * 0.58);
        const maxFontH = shortSide * 0.72;
        const fontPx = Math.min(12.5, Math.floor(Math.min(maxFontW, maxFontH)));

        if (fontPx >= 7.5 && shortSide >= 9) {
          ctx.save();
          ctx.translate(rcx, rcy);
          ctx.rotate(angle);
          ctx.font = `700 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = isFarSideUnderBoard ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.88)';
          ctx.lineWidth = isFarSideUnderBoard ? 1.8 : 2.5;
          ctx.strokeText(part.name, 0, 0);
          ctx.fillStyle = selected || focused ? '#fde047' : (isFarSideUnderBoard ? '#94a3b8' : '#ffffff');
          ctx.fillText(part.name, 0, 0);
          ctx.restore();
        } else if (selected || focused || (!isDenseBoard && screenSize >= 8)) {
          ctx.save();
          ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const topY = Math.min(labelQuad[0].y, labelQuad[1].y, labelQuad[2].y, labelQuad[3].y) - 10;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.88)';
          ctx.lineWidth = 2.6;
          ctx.strokeText(part.name, rcx, topY);
          ctx.fillStyle = selected || focused ? '#fde047' : '#ffffff';
          ctx.fillText(part.name, rcx, topY);
          ctx.restore();
        }
      };

      // --- 1. STANDING 3D TO-220 / POWER MOSFET (`transistor`) ---
      const pinCount = Math.max(0, part.pinEnd - part.pinStart);
      if (spec.kind === 'transistor' && pinCount <= 3 && spec.heightMil >= 120 && screenSize >= 6) {
        const res = drawStandingMosfet3D(
          ctx, board, part, polyWorld, zBase, zSign, spec.heightMil,
          proj, selected, focused, palette,
        );
        renderRoofLabel(res.labelQuad);
        ctx.restore();
        continue;
      }

      // --- 2. 3D CONNECTOR / SHIELDED EDGE PORT / FPC HEADER (`connector`) ---
      if (spec.kind === 'connector' && screenSize >= 8) {
        const res = drawConnector3D(
          ctx, board, part, polyWorld, zBase, zSign, spec.heightMil,
          proj, selected, focused, xrayAlpha, palette,
        );
        renderRoofLabel(res.roofPts, res.floatLabel);
        ctx.restore();
        continue;
      }

      // --- 3. TRUE PROJECTED 3D RADIAL ELECTROLYTIC CAPACITOR CAN (`electrolytic`) ---
      if (spec.kind === 'electrolytic') {
        // Chamfered phenolic mounting base wafer on the PCB
        const zWaferTop = zBase + zSign * Math.min(16, spec.heightMil * 0.11);
        drawExtrudedPrism3D(ctx, polyWorld, zBase, zWaferTop, proj, '#1a2029', '#11161d', '#475569', xrayAlpha);

        const centerWorld = part.center || {
          x: (polyWorld[0].x + polyWorld[2].x) * 0.5,
          y: (polyWorld[0].y + polyWorld[2].y) * 0.5,
        };
        const edgeA = Math.hypot(polyWorld[1].x - polyWorld[0].x, polyWorld[1].y - polyWorld[0].y);
        const edgeB = Math.hypot(polyWorld[2].x - polyWorld[1].x, polyWorld[2].y - polyWorld[1].y);
        const maxSafeR = Math.min(edgeA, edgeB) * 0.46;
        const worldR = part.expanse
          ? Math.min(maxSafeR, part.expanse * 0.36)
          : Math.min(108, maxSafeR);

        const strokeCan = selected ? palette.selectionRing : focused ? palette.active : '#64748b';
        drawCylinder3D(
          ctx, centerWorld, worldR, zWaferTop, zRoof, proj,
          '#1e293b', spec.bodyTop, strokeCan, xrayAlpha,
          { stripeColor: '#cbd5e1', stripeAngleRad: 0.35, drawCrossVent: worldR * view.scale >= 6 },
        );

        const cTop = P(centerWorld, zRoof);
        const cBase = P(centerWorld, zWaferTop);
        renderRoofLabel(cTop.depth <= cBase.depth ? roofPts : basePts);
        ctx.restore();
        continue;
      }

      // --- 4. WRAP-AROUND 3-SEGMENT SMD PASSIVES (`resistor`, `mlcc`, `tantalum`, `diode`, `led`, `fuse`) ---
      if (spec.hasEndCaps && spec.capColor && screenSize >= 5) {
        const sliceQuad = (q: Point[], t0: number, t1: number): Point[] => [
          lerpPt(q[0], q[3], t0),
          lerpPt(q[1], q[2], t0),
          lerpPt(q[1], q[2], t1),
          lerpPt(q[0], q[3], t1),
        ];

        const zFilletTop = zBase + zSign * Math.max(3, (zRoof - zBase) * zSign * 0.28);
        const filletL = sliceQuad(polyWorld, 0, 0.055);
        const filletR = sliceQuad(polyWorld, 0.945, 1);
        if (screenSize >= 9) {
          const filDepthL = P(lerpPt(filletL[0], filletL[2], 0.5), zBase).depth;
          const filDepthR = P(lerpPt(filletR[0], filletR[2], 0.5), zBase).depth;
          const fillets = [
            { q: filletL, d: filDepthL },
            { q: filletR, d: filDepthR },
          ].sort((a, b) => b.d - a.d);
          for (const fil of fillets) {
            drawExtrudedPrism3D(ctx, fil.q, zBase, zFilletTop, proj, '#cbd5e1', '#94a3b8', 'rgba(100,116,139,0.55)', xrayAlpha * 0.9);
          }
        }

        const capL = sliceQuad(polyWorld, 0, 0.22);
        const midBody = sliceQuad(polyWorld, 0.22, 0.78);
        const capR = sliceQuad(polyWorld, 0.78, 1.0);

        const segs = [
          {
            poly: capL,
            top: spec.capColor,
            side: spec.capColor,
            cap: spec.capColor,
            capShade: '#cbd5e1',
            skip: new Set([2]),
            depth: P(lerpPt(capL[0], capL[2], 0.5), (zBodyBot + zRoof) * 0.5).depth,
          },
          {
            poly: midBody,
            top: spec.bodyTop,
            side: spec.bodySide,
            cap: undefined,
            capShade: undefined,
            skip: new Set([0, 2]),
            depth: P(lerpPt(midBody[0], midBody[2], 0.5), (zBodyBot + zRoof) * 0.5).depth,
          },
          {
            poly: capR,
            top: spec.capColor,
            side: '#e2e8f0',
            cap: spec.capColor,
            capShade: '#cbd5e1',
            skip: new Set([0]),
            depth: P(lerpPt(capR[0], capR[2], 0.5), (zBodyBot + zRoof) * 0.5).depth,
          },
        ].sort((a, b) => b.depth - a.depth);

        const strokePass = selected ? palette.selectionRing : focused ? palette.active : 'rgba(71, 85, 105, 0.55)';
        for (const s of segs) {
          drawExtrudedPrism3D(ctx, s.poly, zBodyBot, zRoof, proj, s.top, s.side, strokePass, xrayAlpha, s.cap, s.capShade, s.skip);
        }

        const roofDepthPassive = (roofPts[0].depth + roofPts[1].depth + roofPts[2].depth + roofPts[3].depth) * 0.25;
        const baseDepthPassive = (basePts[0].depth + basePts[1].depth + basePts[2].depth + basePts[3].depth) * 0.25;
        const roofFacing = roofDepthPassive <= baseDepthPassive;
        if (roofFacing && (spec.kind === 'diode' || spec.kind === 'tantalum') && screenSize >= 8) {
          const k0 = lerpPt(roofPts[0], roofPts[3], 0.30);
          const k1 = lerpPt(roofPts[1], roofPts[2], 0.30);
          ctx.save();
          ctx.globalAlpha *= xrayAlpha;
          ctx.strokeStyle = spec.accentColor || '#f8fafc';
          ctx.lineWidth = Math.max(1.8, screenSize * 0.085);
          ctx.beginPath();
          ctx.moveTo(k0.x, k0.y);
          ctx.lineTo(k1.x, k1.y);
          ctx.stroke();
          ctx.restore();
        } else if (roofFacing && spec.kind === 'led' && screenSize >= 7) {
          const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
          const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
          ctx.save();
          ctx.globalAlpha *= xrayAlpha;
          ctx.beginPath();
          ctx.arc(rcx, rcy, Math.max(2, screenSize * 0.18), 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.restore();
        }

        // Crisp outer rim highlight stroke on roof
        if (roofFacing) {
          ctx.save();
          ctx.beginPath();
          roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
          ctx.closePath();
          ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
          ctx.lineWidth = selected ? 2.2 : focused ? 1.7 : 0.9;
          ctx.stroke();
          ctx.restore();
        }

        renderRoofLabel(roofFacing ? roofPts : basePts);
        ctx.restore();
        continue;
      }

      const baseDepth = (basePts[0].depth + basePts[1].depth + basePts[2].depth + basePts[3].depth) * 0.25;
      const roofDepth = (roofPts[0].depth + roofPts[1].depth + roofPts[2].depth + roofPts[3].depth) * 0.25;
      const centerDepth = (baseDepth + roofDepth) * 0.5;
      const roofIsFront = roofDepth <= baseDepth;

      // Helper to render depth-sorted perpendicular 3D gull-wing metallic IC leads (`back` before body, `front` after walls!)
      const drawIcLeads = (frontPass: boolean) => {
        if (spec.kind !== 'ic' || pinCount < 2 || pinCount > 64 || screenSize < 8) return;
        const zShoulder = (zBodyBot + zRoof) * 0.52;
        const zFoot = zBase + zSign * 2;
        const leadW = Math.min(3.6, Math.max(1.4, screenSize * 0.05));

        const segLeads: { sExit: ProjectedPoint; sShoulder: ProjectedPoint; sAnkle: ProjectedPoint; sToe: ProjectedPoint }[] = [];
        for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
          const pin = board.pins[pIdx];
          // Find closest side edge of `polyWorld` so pins exit 100% perpendicular (`| | | |`)!
          let bestDistSq = Infinity;
          let bestFoot = polyWorld[0];
          for (let e = 0; e < 4; e++) {
            const a = polyWorld[e];
            const b = polyWorld[(e + 1) % 4];
            const abx = b.x - a.x, aby = b.y - a.y;
            const abLenSq = abx * abx + aby * aby || 1;
            const t = Math.max(0.03, Math.min(0.97, ((pin.x - a.x) * abx + (pin.y - a.y) * aby) / abLenSq));
            const projEdge = { x: a.x + abx * t, y: a.y + aby * t };
            const dSq = (pin.x - projEdge.x) ** 2 + (pin.y - projEdge.y) ** 2;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestFoot = projEdge;
            }
          }
          const dx = pin.x - bestFoot.x, dy = pin.y - bestFoot.y;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist, ny = dy / dist;
          const pExitWorld = { x: bestFoot.x - nx * 4, y: bestFoot.y - ny * 4 };
          const pShoulderWorld = { x: bestFoot.x + nx * (dist * 0.34), y: bestFoot.y + ny * (dist * 0.34) };
          const sExit = P(pExitWorld, zShoulder);
          const sShoulder = P(pShoulderWorld, zShoulder);
          const leadDepth = (sExit.depth + sShoulder.depth) * 0.5;
          if ((leadDepth <= centerDepth + 0.05) !== frontPass) continue;

          const sAnkle = P({ x: bestFoot.x + nx * (dist * 0.72), y: bestFoot.y + ny * (dist * 0.72) }, zFoot);
          const sToe = P(pin, zFoot);
          segLeads.push({ sExit, sShoulder, sAnkle, sToe });
        }
        if (!segLeads.length) return;

        ctx.save();
        ctx.globalAlpha *= xrayAlpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const traceAll = () => {
          ctx.beginPath();
          for (const l of segLeads) {
            ctx.moveTo(l.sExit.x, l.sExit.y);
            ctx.lineTo(l.sShoulder.x, l.sShoulder.y);
            ctx.lineTo(l.sAnkle.x, l.sAnkle.y);
            ctx.lineTo(l.sToe.x, l.sToe.y);
          }
        };
        traceAll();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = leadW + 1.0;
        ctx.stroke();

        traceAll();
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = leadW * 0.72;
        ctx.stroke();
        ctx.restore();
      };

      // Far-side perpendicular gull-wing leads drawn behind the molded IC epoxy package
      drawIcLeads(false);

      // --- 5. EXACT VIEW-SPACE CULLING EXTRUDED 3D PRISM FOR ICs, BGAs, INDUCTORS, CRYSTALS ---
      const strokeCol = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
      drawExtrudedPrism3D(
        ctx,
        polyWorld,
        zBodyBot,
        zRoof,
        proj,
        spec.kind === 'bga' ? '#15803d' : spec.bodyTop,
        spec.bodySide,
        strokeCol,
        xrayAlpha,
        undefined,
        undefined,
        undefined,
        isFarSideUnderBoard,
      );

      // Front-side gull-wing leads emerging perpendicularly from the package flanks onto PCB pads
      drawIcLeads(true);

      // --- 6. PACKAGE-SPECIFIC STANDING / 3D ROOF DETAILS ---
      if (!roofIsFront) {
        renderRoofLabel(basePts);
        ctx.restore();
        continue;
      }

      if (spec.kind === 'bga' && screenSize >= 12) {
        const dieRoof = insetQuad(roofPts, 0.14, 0.14);
        ctx.save();
        ctx.beginPath();
        dieRoof.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.75)';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        const f1 = lerpPt(roofPts[0], roofPts[1], 0.15);
        const f3 = lerpPt(roofPts[0], roofPts[3], 0.15);
        ctx.beginPath();
        ctx.moveTo(roofPts[0].x, roofPts[0].y);
        ctx.lineTo(f1.x, f1.y);
        ctx.lineTo(f3.x, f3.y);
        ctx.closePath();
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.restore();
      } else if (spec.kind === 'inductor' && screenSize >= 10) {
        const centerWorld = {
          x: (polyWorld[0].x + polyWorld[2].x) * 0.5,
          y: (polyWorld[0].y + polyWorld[2].y) * 0.5,
        };
        const e01 = Math.hypot(polyWorld[1].x - polyWorld[0].x, polyWorld[1].y - polyWorld[0].y);
        const e12 = Math.hypot(polyWorld[2].x - polyWorld[1].x, polyWorld[2].y - polyWorld[1].y);
        const isOpenDrum = part.type === 'through' && Math.max(e01, e12) >= 110;
        const worldR = Math.min(e01, e12) * 0.32;
        if (isOpenDrum && worldR * view.scale >= 3) {
          const zDrumTop = zBase + zSign * (spec.heightMil * 1.08);
          drawCylinder3D(
            ctx, centerWorld, worldR, zRoof, zDrumTop, proj,
            '#b45309', '#1e242d', '#f59e0b', xrayAlpha,
            { rimStroke: '#f59e0b' },
          );
        } else if (worldR * view.scale >= 4) {
          // Subtle recessed ferrite drum groove flush on shielded SMD alloy choke roof
          const ringPts: ProjectedPoint[] = [];
          for (let s = 0; s < 20; s++) {
            const a = (s / 20) * Math.PI * 2;
            ringPts.push(P({ x: centerWorld.x + Math.cos(a) * worldR, y: centerWorld.y + Math.sin(a) * worldR }, zRoof));
          }
          ctx.save();
          ctx.globalAlpha *= xrayAlpha;
          ctx.beginPath();
          ringPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
          ctx.closePath();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }
      } else if ((spec.kind === 'ic' || spec.kind === 'transistor') && part.pinStart < board.pins.length && screenSize >= 10) {
        const bevel = insetQuad(roofPts, 0.05, 0.05);
        ctx.save();
        ctx.beginPath();
        bevel.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
        ctx.lineWidth = 0.85;
        ctx.stroke();

        // Pin-1 recessed mold crater neatly placed in Pin-1 corner (away from center label!)
        const sp1 = P(board.pins[part.pinStart], zRoof);
        let bestCorner = 0;
        let bestDist = Infinity;
        for (let k = 0; k < 4; k++) {
          const d = Math.hypot(roofPts[k].x - sp1.x, roofPts[k].y - sp1.y);
          if (d < bestDist) { bestDist = d; bestCorner = k; }
        }
        const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
        const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
        const dimple = lerpPt({ x: rcx, y: rcy }, roofPts[bestCorner], 0.64);
        const dR = Math.min(3.5, Math.max(1.8, screenSize * 0.05));
        ctx.beginPath();
        ctx.arc(dimple.x, dimple.y, dR, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.72)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = selected ? 2.2 : focused ? 1.7 : 1.05;
      ctx.stroke();

      renderRoofLabel(roofPts);
      ctx.restore();
    }

    // Draw X-Ray pin rings & active highlights on top of the 3D bodies
    drawPinsOnSurface(true);
  };

  // 3. Draw Far-Side -> 3D PCB Substrate -> Near-Side in true Z-order
  const farSide: 'top' | 'bottom' = topFacesCamera ? 'bottom' : 'top';
  const nearSide: 'top' | 'bottom' = topFacesCamera ? 'top' : 'bottom';

  if (bothSidesActive) {
    drawSideComponentsAndPins(farSide, true);
  }

  // Draw 3D Extruded PCB Substrate (depth-sorted directionally lit FR-4 fiberglass edge band + solder mask)
  if (layers.outline && (board.outline.length > 1 || (board.outlineSegments && board.outlineSegments.length > 0))) {
    const zFar = topFacesCamera ? zBotSurface : zTopSurface;
    const zNear = topFacesCamera ? zTopSurface : zBotSurface;

    ctx.save();
    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zFar);
    ctx.strokeStyle = '#7c6230';
    ctx.lineWidth = Math.max(1.5, Math.min(3.5, 3 * view.scale));
    ctx.stroke();

    if (board.outline.length > 2) {
      const step = Math.max(1, Math.floor(board.outline.length / 180));
      const boardMid = P(proj.center, 0);
      const edgeQuads: { pts: ProjectedPoint[]; fill: string; depth: number }[] = [];
      let contourStart = board.outline[0];
      for (let i = 0; i < board.outline.length - step; i += step) {
        const p0 = board.outline[i];
        const p1 = board.outline[Math.min(i + step, board.outline.length - 1)];
        if (i > 0 && p0.x === contourStart.x && p0.y === contourStart.y) {
          contourStart = p1;
          continue;
        }
        if (p0.x === p1.x && p0.y === p1.y) continue;
        const f0 = P(p0, zFar);
        const f1 = P(p1, zFar);
        const n1 = P(p1, zNear);
        const n0 = P(p0, zNear);
        const quad = [f0, f1, n1, n0];
        const info = faceViewInfo(quad, boardMid, proj.camDist);
        edgeQuads.push({ pts: quad, fill: shadeHex('#685227', info.lit), depth: info.depth });
      }
      edgeQuads.sort((a, b) => b.depth - a.depth);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 0.65;
      for (const eq of edgeQuads) {
        ctx.beginPath();
        ctx.moveTo(eq.pts[0].x, eq.pts[0].y);
        ctx.lineTo(eq.pts[1].x, eq.pts[1].y);
        ctx.lineTo(eq.pts[2].x, eq.pts[2].y);
        ctx.lineTo(eq.pts[3].x, eq.pts[3].y);
        ctx.closePath();
        ctx.fillStyle = eq.fill;
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zNear);
    if (board.outline.length > 2) {
      const alpha = bothSidesActive ? 0.86 : 0.96;
      ctx.fillStyle = isClassic
        ? `rgba(16, 78, 52, ${alpha})`
        : `rgba(13, 35, 39, ${alpha})`;
      ctx.fill('evenodd');
    }
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.85;
    ctx.stroke();
    ctx.restore();
  }

  if (bothSidesActive) {
    drawSideComponentsAndPins(nearSide, false);
  } else if (layers.top) {
    drawSideComponentsAndPins('top', false);
  } else if (layers.bottom) {
    drawSideComponentsAndPins('bottom', false);
  }

  // 4. 3D Parabolic Net Airwire Arcs
  if (highlightNet && highlightNet !== 'UNCONNECTED' && highlightNet !== 'NC' && highlightNet !== 'GND' && highlightNet !== 'GROUND') {
    const info = activeNetInfo;
    if (info && info.pinIndices.length >= 2 && info.pinIndices.length <= 220) {
      const hubIdx = selection?.kind === 'pin' && board.pins[selection.index]?.net === highlightNet
        ? selection.index
        : (info.pinIndices.find((idx) => sideVisible(board.pins[idx].side, layers)) ?? info.pinIndices[0]);
      const hubPin = board.pins[hubIdx];
      const { zBase: zHub, zSign: hubSign } = getSideZ(hubPin.side, layers);
      const sHub = P(hubPin, zHub);

      ctx.save();
      ctx.strokeStyle = palette.netActive;
      ctx.lineWidth = 1.75;
      for (const idx of info.pinIndices) {
        if (idx === hubIdx) continue;
        const targetPin = board.pins[idx];
        const visible = sideVisible(targetPin.side, layers);
        const { zBase: zTarget } = getSideZ(targetPin.side, layers);
        const sTarget = P(targetPin, zTarget);
        const distWorld = Math.hypot(targetPin.x - hubPin.x, targetPin.y - hubPin.y);
        const arcLift = Math.min(260, Math.max(45, distWorld * 0.18)) * hubSign;
        const midWorld: Point = {
          x: (hubPin.x + targetPin.x) * 0.5,
          y: (hubPin.y + targetPin.y) * 0.5,
        };
        const sCtrl = P(midWorld, (zHub + zTarget) * 0.5 + arcLift);

        ctx.beginPath();
        if (!visible) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.moveTo(sHub.x, sHub.y);
        ctx.quadraticCurveTo(sCtrl.x, sCtrl.y, sTarget.x, sTarget.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 5. 3D Selection Beacon Ring
  if (selection) {
    let selPt: ProjectedPoint | null = null;
    if (selection.kind === 'pin' && board.pins[selection.index]) {
      const pin = board.pins[selection.index];
      const { zBase } = getSideZ(pin.side, layers);
      selPt = P(pin, zBase);
    } else if (selection.kind === 'nail' && board.nails[selection.index]) {
      const nail = board.nails[selection.index];
      const { zBase } = getSideZ(nail.side, layers);
      selPt = P(nail, zBase);
    } else if (selection.kind === 'part' && board.parts[selection.index]?.box && !board.parts[selection.index]?.isDummy) {
      const part = board.parts[selection.index];
      const spec = classifyPartPackage(part);
      const b = part.box!;
      const { zBase, zSign } = getSideZ(part.side, layers);
      const zRoof = zBase + zSign * spec.heightMil;
      selPt = P({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, zRoof);
    }
    if (selPt) {
      ctx.save();
      ctx.strokeStyle = palette.selectionRing;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(selPt.x, selPt.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 6. 3D Orientation Compass Gizmo (only in interactive 3D orbit mode)
  if (showGizmo) {
    draw3DGizmo(ctx, w, rotation, cam, flipX, flipY, bothSidesActive && flipY, palette);
  }

  void tr2d;
}

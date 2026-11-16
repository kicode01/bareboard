import type { Board, Layers, Part, Pin, Point, Selection, Side } from '../types';
import type { BoardIndex } from '../lib/search';
import type { Palette } from '../lib/theme';
import type { Transform, View } from '../lib/geometry';

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
    && ((part.expanse && part.expanse > 90) || part.type === 'through' || name.startsWith('CE') || (part.side === 'bottom' && longSide >= 180))
  ) {
    // Standing Radial Electrolytic / Polymer Aluminum Can
    spec = {
      kind: 'electrolytic',
      heightMil: Math.min(260, Math.max(115, longSide * 0.72)),
      bodyTop: '#e2e8f0',
      bodySide: '#1e293b',
      bodyStroke: '#64748b',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if ((p0 === 'C' || (p0 === 'P' && p1 === 'C')) && longSide >= 260 && pinCount === 2) {
    spec = {
      kind: 'tantalum',
      heightMil: Math.min(95, Math.max(48, shortSide * 0.68)),
      bodyTop: '#eab308',
      bodySide: '#ca8a04',
      bodyStroke: '#854d0e',
      capColor: '#e2e8f0',
      accentColor: '#78350f',
      hasEndCaps: true,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'C' || (p0 === 'P' && p1 === 'C')) {
    // SMD Ceramic MLCC Capacitor (warm golden-tan ceramic dielectric + bright silver end-caps)
    spec = {
      kind: 'mlcc',
      heightMil: Math.min(72, Math.max(24, shortSide * 0.72)),
      bodyTop: '#d48c46',
      bodySide: '#a36629',
      bodyStroke: '#6b4218',
      capColor: '#e2e8f0',
      accentColor: '#f3c693',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'R' || (p0 === 'P' && p1 === 'R')) {
    // SMD Chip Resistor (coal-black resistive glaze + white ceramic substrate + bright silver end-caps)
    spec = {
      kind: 'resistor',
      heightMil: Math.min(48, Math.max(18, shortSide * 0.48)),
      bodyTop: '#161b22',
      bodySide: '#e2e8f0',
      bodyStroke: '#475569',
      capColor: '#f1f5f9',
      accentColor: '#ffffff',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'L' || (p0 === 'P' && p1 === 'L') || name.startsWith('FB') || name.startsWith('FL')) {
    // Standing Toroid / Ferrite Drum Power Inductor Coil
    const isPowerCoil = !name.startsWith('FB') && (longSide > 65 || pinCount >= 2);
    spec = {
      kind: 'inductor',
      heightMil: isPowerCoil
        ? Math.min(210, Math.max(90, shortSide * 0.85))
        : Math.min(56, Math.max(22, shortSide * 0.58)),
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
      heightMil: Math.min(85, Math.max(32, shortSide * 0.7)),
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
      heightMil: Math.min(68, Math.max(26, shortSide * 0.62)),
      bodyTop: '#1b2028',
      bodySide: '#10141a',
      bodyStroke: '#64748b',
      capColor: '#e2e8f0',
      accentColor: '#f8fafc',
      hasEndCaps: pinCount === 2,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'Q' || (p0 === 'P' && p1 === 'Q') || p0 === 'T') {
    // Standing TO-220 / TO-252 / SOT Power MOSFET
    spec = {
      kind: 'transistor',
      heightMil: Math.min(240, Math.max(95, longSide * 0.78)),
      bodyTop: '#1e242d',
      bodySide: '#11161d',
      bodyStroke: '#64748b',
      capColor: '#e2e8f0',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if (p0 === 'J' || name.startsWith('CN') || name.startsWith('CON') || name.startsWith('USB') || name.startsWith('HDMI')) {
    // Standing Board-to-Board / Pin Header / FPC Connector
    spec = {
      kind: 'connector',
      heightMil: Math.min(230, Math.max(105, shortSide * 0.85)),
      bodyTop: '#334155',
      bodySide: '#475569',
      bodyStroke: '#cbd5e1',
      capColor: '#facc15',
      accentColor: '#fef08a',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if (p0 === 'Y' || p0 === 'X' || name.startsWith('XTAL') || name.startsWith('OSC')) {
    // Standing HC-49 / SMD Quartz Crystal Can
    spec = {
      kind: 'crystal',
      heightMil: Math.min(130, Math.max(48, shortSide * 0.75)),
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
      heightMil: Math.min(54, Math.max(22, shortSide * 0.55)),
      bodyTop: '#f8fafc',
      bodySide: '#cbd5e1',
      bodyStroke: '#ca8a04',
      capColor: '#eab308',
      accentColor: '#64748b',
      hasEndCaps: true,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'U' || (p0 === 'P' && p1 === 'U') || name.startsWith('IC')) {
    const isBga = pinCount >= 24 && shortSide > 140;
    spec = {
      kind: isBga ? 'bga' : 'ic',
      heightMil: isBga
        ? Math.min(110, Math.max(54, Math.sqrt(longSide * shortSide) * 0.11))
        : Math.min(95, Math.max(48, shortSide * 0.28)),
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
      heightMil: Math.min(64, Math.max(26, shortSide * 0.5)),
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
  quad: Point[],
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
}

export const BOARD_HALF_THICKNESS_MIL = 36;

export function getSideZ(
  side: Side,
  layers: Layers,
  topFacesCamera: boolean,
): { zBase: number; zSign: number } {
  const singleSideMode = (layers.top && !layers.bottom) || (layers.bottom && !layers.top);
  if (singleSideMode) {
    return topFacesCamera
      ? { zBase: BOARD_HALF_THICKNESS_MIL, zSign: 1 }
      : { zBase: -BOARD_HALF_THICKNESS_MIL, zSign: -1 };
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
  // Boost vertical Z relief gently at full-board zoom so standing 3D components are clearly visible
  const zRelief = Math.max(1.3, Math.min(2.35, 0.42 / Math.max(0.12, view.scale)));

  const project3D = (p: Point, z = 0): ProjectedPoint => {
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    let dz = z * zRelief;
    if (flipX) dx = -dx;
    if (flipY) {
      dy = -dy;
      dz = -dz;
    }

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
    };
  };

  const unprojectToPlane = (sx: number, sy: number, zPlane = 0): Point => {
    let dz = zPlane * zRelief;
    if (flipY) dz = -dz;
    const rz = dz * view.scale;

    const u = sx - width / 2;
    const v = sy - height / 2;

    const safeCosP = Math.abs(cosP) < 0.15 ? (cosP >= 0 ? 0.15 : -0.15) : cosP;
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
): View {
  const scale = Math.min(Math.max(view.scale * factor, 0.0005), 40);
  const beforeProj = makeProjector3D(board, width, height, view, flipX, flipY, rotation, cam);
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

/** Helper to draw an extruded 3D prism between `z0` and `z1` given a 4-point world polygon `poly`. */
function drawExtrudedPrism3D(
  ctx: CanvasRenderingContext2D,
  poly: Point[],
  z0: number,
  z1: number,
  P: (pt: Point, z: number) => ProjectedPoint,
  topFill: string,
  sideFill: string,
  strokeCol: string,
  alpha = 0.92,
  endCapFill?: string,
): { basePts: ProjectedPoint[]; roofPts: ProjectedPoint[] } {
  const basePts = poly.map((pt) => P(pt, z0));
  const roofPts = poly.map((pt) => P(pt, z1));

  const walls = [0, 1, 2, 3].map((k) => {
    const next = (k + 1) % 4;
    const wallDepth = (basePts[k].depth + basePts[next].depth + roofPts[next].depth + roofPts[k].depth) * 0.25;
    return { k, next, wallDepth };
  }).sort((a, b) => b.wallDepth - a.wallDepth);

  for (const { k, next } of walls) {
    ctx.beginPath();
    ctx.moveTo(basePts[k].x, basePts[k].y);
    ctx.lineTo(basePts[next].x, basePts[next].y);
    ctx.lineTo(roofPts[next].x, roofPts[next].y);
    ctx.lineTo(roofPts[k].x, roofPts[k].y);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= alpha;
    const isEndWall = Boolean(endCapFill) && (k === 0 || k === 2);
    ctx.fillStyle = isEndWall ? endCapFill! : sideFill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = topFill;
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.restore();

  return { basePts, roofPts };
}

/** Draws a true 3D Standing TO-220 / Power MOSFET (`Q...`):
 *  - 3 vertical metallic legs rising straight up from the PCB pads
 *  - Upright molded black TO-220 package block standing above the legs
 *  - Upright brushed-silver metal heatsink tab rising above the black block with a circular mounting hole! */
function drawStandingMosfet3D(
  ctx: CanvasRenderingContext2D,
  board: Board,
  part: Part,
  polyWorld: Point[],
  zBase: number,
  zSign: number,
  totalH: number,
  P: (pt: Point, z: number) => ProjectedPoint,
  selected: boolean,
  focused: boolean,
  palette: Palette,
): ProjectedPoint[] {
  const zLegTop = zBase + zSign * (totalH * 0.28);
  const zBodyTop = zBase + zSign * (totalH * 0.74);
  const zTabTop = zBase + zSign * totalH;

  // 1. Vertical silver metallic legs rising from each pin pad from zBase to zLegTop
  ctx.save();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
    const pin = board.pins[pIdx];
    const p0 = P(pin, zBase);
    const p1 = P(pin, zLegTop);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();
  ctx.restore();

  // 2. Upright Silver Metal Heatsink Tab along the back edge (from zLegTop to zTabTop)
  const tabPoly: Point[] = [
    polyWorld[0],
    polyWorld[1],
    lerpPt(polyWorld[1], polyWorld[2], 0.22),
    lerpPt(polyWorld[0], polyWorld[3], 0.22),
  ];

  // 3. Upright Black Molded TO-220 Body Block (from zLegTop to zBodyTop)
  const bodyPoly = insetQuad(polyWorld, 0.05, 0.14);

  // Determine whether the metal heatsink tab is behind or in front of the black body relative to the camera
  const tabMid = P(lerpPt(tabPoly[0], tabPoly[1], 0.5), (zBodyTop + zTabTop) * 0.5);
  const bodyMid = P(lerpPt(bodyPoly[0], bodyPoly[2], 0.5), (zLegTop + zBodyTop) * 0.5);
  const strokeCol = selected ? palette.selectionRing : focused ? palette.active : '#64748b';

  const renderHeatsinkTab = () => {
    drawExtrudedPrism3D(ctx, tabPoly, zLegTop, zTabTop, P, '#f1f5f9', '#cbd5e1', '#94a3b8', 0.96);
    // Circular mounting hole in the upper metal heatsink tab
    const holeCenterWorld = lerpPt(lerpPt(tabPoly[0], tabPoly[1], 0.5), lerpPt(tabPoly[3], tabPoly[2], 0.5), 0.5);
    const holePt = P(holeCenterWorld, zBase + zSign * (totalH * 0.87));
    const tabEdgeA = P(tabPoly[0], zTabTop);
    const tabEdgeB = P(tabPoly[1], zTabTop);
    const tabScreenW = Math.hypot(tabEdgeB.x - tabEdgeA.x, tabEdgeB.y - tabEdgeA.y);
    const holeR = Math.min(7, Math.max(2.2, tabScreenW * 0.16));
    ctx.save();
    ctx.beginPath();
    ctx.arc(holePt.x, holePt.y, holeR, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  };

  if (tabMid.depth >= bodyMid.depth) {
    renderHeatsinkTab();
    const { roofPts } = drawExtrudedPrism3D(ctx, bodyPoly, zLegTop, zBodyTop, P, '#222832', '#12161d', strokeCol, 0.94);
    return roofPts;
  } else {
    const { roofPts } = drawExtrudedPrism3D(ctx, bodyPoly, zLegTop, zBodyTop, P, '#222832', '#12161d', strokeCol, 0.94);
    renderHeatsinkTab();
    return roofPts;
  }
}

/** Draws a 3D Orientation Compass Gizmo in the top-right corner of the 3D viewport. */
function draw3DGizmo(
  ctx: CanvasRenderingContext2D,
  w: number,
  rotation: number,
  cam: Camera3D,
  flipX: boolean,
  flipY: boolean,
  palette: Palette,
): void {
  const gx = w - 48;
  const gy = 54;
  const len = 22;

  const rotRad = ((rotation + cam.yawDeg) * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const pitchRad = (cam.pitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);

  const projAxis = (ax: number, ay: number, az: number) => {
    const dx = flipX ? -ax : ax;
    const dy = flipY ? -ay : ay;
    const dz = flipY ? -az : az;
    const rx = dx * cosR - dy * sinR;
    const ry = dx * sinR + dy * cosR;
    return {
      x: gx + rx * len,
      y: gy + (ry * cosP - dz * sinP) * len,
    };
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(gx, gy, 30, 0, Math.PI * 2);
  ctx.fillStyle = palette.bg === '#ffffff' ? 'rgba(240, 244, 248, 0.9)' : 'rgba(10, 16, 24, 0.86)';
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
  preferredFrontSide: 'top' | 'bottom' = 'top',
): void {
  const { w, h } = size;
  const P = proj.project3D;
  const zTopSurface = BOARD_HALF_THICKNESS_MIL;
  const zBotSurface = -BOARD_HALF_THICKNESS_MIL;
  // If tilted past 90° in 3D, flip which side faces the camera; otherwise use preferredFrontSide
  const topFacesCamera = proj.cosP >= 0 ? preferredFrontSide === 'top' : preferredFrontSide !== 'top';

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

    const zBase = isFarSideUnderBoard
      ? ( proj.cosP >= 0 ? zBotSurface : zTopSurface )
      : ( proj.cosP >= 0 ? zTopSurface : zBotSurface );
    const zSign = isFarSideUnderBoard
      ? ( proj.cosP >= 0 ? -1 : 1 )
      : ( proj.cosP >= 0 ? 1 : -1 );

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

        drawXrayRing(buckets.nc, palette.pinNc, 0.45);
        drawXrayRing(buckets.gnd, '#94a3b8', 0.62);
        drawXrayRing(buckets.normal, side === 'top' ? '#fde047' : '#7dd3fc', 0.72);
        drawXrayRing(buckets.pin1, palette.pinA1, 0.92);

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

        if (labeled.length && labeled.length <= 500) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const sp of labeled) {
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
      const polyWorld = spec.hasEndCaps
        ? insetQuad(rawPoly, 0.02, 0.08)
        : spec.kind === 'ic'
          ? insetQuad(rawPoly, 0.1, 0.12)
          : rawPoly;

      const zRoof = zBase + zSign * spec.heightMil;
      const basePts = polyWorld.map((pt) => P(pt, zBase));
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

      const xrayAlpha = selected || focused ? 0.94 : spec.kind === 'bga' ? 0.74 : 0.88;
      const zRoof = zBase + zSign * spec.heightMil;

      // Helper to render the 3D Silkscreen Label on `labelQuad`
      const renderRoofLabel = (labelQuad: ProjectedPoint[]) => {
        if (!layers.labels) return;
        const minScreenForPassive = isFarSideUnderBoard ? 18 : 32;
        if (isDenseBoard && !spec.showLabelAtAllZooms && screenSize < minScreenForPassive && !selected && !focused) {
          return;
        }
        const rcx = (labelQuad[0].x + labelQuad[1].x + labelQuad[2].x + labelQuad[3].x) * 0.25;
        const rcy = (labelQuad[0].y + labelQuad[1].y + labelQuad[2].y + labelQuad[3].y) * 0.25;
        const dx01 = labelQuad[1].x - labelQuad[0].x, dy01 = labelQuad[1].y - labelQuad[0].y;
        const dx12 = labelQuad[2].x - labelQuad[1].x, dy12 = labelQuad[2].y - labelQuad[1].y;
        const len01 = Math.hypot(dx01, dy01), len12 = Math.hypot(dx12, dy12);
        const longSide = Math.max(len01, len12), shortSide = Math.min(len01, len12);
        let angle = len01 >= len12 ? Math.atan2(dy01, dx01) : Math.atan2(dy12, dx12);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;

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
      if (spec.kind === 'transistor' && screenSize >= 6) {
        roofPts = drawStandingMosfet3D(
          ctx, board, part, polyWorld, zBase, zSign, spec.heightMil,
          P, selected, focused, palette,
        );
        renderRoofLabel(roofPts);
        ctx.restore();
        continue;
      }

      // --- 2. STANDING 3D RADIAL ELECTROLYTIC CAPACITOR CAN (`electrolytic`) ---
      if (spec.kind === 'electrolytic') {
        ctx.beginPath();
        basePts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(20, 26, 34, 0.92)';
        ctx.fill();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.stroke();

        const centerWorld = part.center || {
          x: (polyWorld[0].x + polyWorld[2].x) * 0.5,
          y: (polyWorld[0].y + polyWorld[2].y) * 0.5,
        };
        const worldR = part.expanse
          ? part.expanse * 0.36
          : Math.min(
              Math.hypot(polyWorld[1].x - polyWorld[0].x, polyWorld[1].y - polyWorld[0].y),
              Math.hypot(polyWorld[2].x - polyWorld[1].x, polyWorld[2].y - polyWorld[1].y),
            ) * 0.45;
        const cBase = P(centerWorld, zBase);
        const cTop = P(centerWorld, zRoof);
        const rBase = Math.max(4, worldR * view.scale * cBase.persp);
        const rTop = Math.max(4, worldR * view.scale * cTop.persp);

        const dxCyl = cTop.x - cBase.x, dyCyl = cTop.y - cBase.y;
        const perpAngle = Math.atan2(dyCyl, dxCyl) + Math.PI / 2;
        const nx = Math.cos(perpAngle), ny = Math.sin(perpAngle);

        // Tall 3D cylinder sleeve
        ctx.beginPath();
        ctx.moveTo(cBase.x + nx * rBase, cBase.y + ny * rBase);
        ctx.lineTo(cTop.x + nx * rTop, cTop.y + ny * rTop);
        ctx.lineTo(cTop.x - nx * rTop, cTop.y - ny * rTop);
        ctx.lineTo(cBase.x - nx * rBase, cBase.y - ny * rBase);
        ctx.closePath();
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Silver negative-polarity stripe running up the side of the 3D cylinder
        ctx.beginPath();
        ctx.moveTo(cBase.x + nx * rBase * 0.85, cBase.y + ny * rBase * 0.85);
        ctx.lineTo(cTop.x + nx * rTop * 0.85, cTop.y + ny * rTop * 0.85);
        ctx.lineTo(cTop.x + nx * rTop * 0.35, cTop.y + ny * rTop * 0.35);
        ctx.lineTo(cBase.x + nx * rBase * 0.35, cBase.y + ny * rBase * 0.35);
        ctx.closePath();
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();

        // Top brushed-aluminum circular lid
        ctx.beginPath();
        ctx.arc(cTop.x, cTop.y, rTop, 0, Math.PI * 2);
        ctx.fillStyle = spec.bodyTop;
        ctx.fill();
        ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#475569';
        ctx.lineWidth = selected ? 2 : 1.2;
        ctx.stroke();

        // Negative polarity crescent on 3D cap top
        ctx.beginPath();
        ctx.arc(cTop.x, cTop.y, rTop * 0.92, -Math.PI * 0.36, Math.PI * 0.36);
        ctx.closePath();
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        if (rTop >= 6) {
          ctx.beginPath();
          for (let a = 0; a < 3; a++) {
            const ang = (a * Math.PI * 2) / 3 - Math.PI / 6;
            ctx.moveTo(cTop.x, cTop.y);
            ctx.lineTo(cTop.x + Math.cos(ang) * rTop * 0.55, cTop.y + Math.sin(ang) * rTop * 0.55);
          }
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        renderRoofLabel(roofPts);
        ctx.restore();
        continue;
      }

      // --- 3. 3D BENT GULL-WING METALLIC LEADS ON ICs (`ic`) ---
      const pinCount = Math.max(0, part.pinEnd - part.pinStart);
      if (spec.kind === 'ic' && pinCount >= 2 && pinCount <= 48 && screenSize >= 8) {
        const zMid = zBase + zSign * spec.heightMil * 0.5;
        const mcx = (basePts[0].x + basePts[1].x + basePts[2].x + basePts[3].x) * 0.25;
        const mcy = (basePts[0].y + basePts[1].y + basePts[2].y + basePts[3].y) * 0.25;
        ctx.save();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.min(4.2, Math.max(1.6, screenSize * 0.075));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
          const pin = board.pins[pIdx];
          const sPad = P(pin, zBase);
          const sKnee = P(pin, zMid);
          const sShoulder = lerpPt({ x: mcx, y: mcy }, sKnee, 0.62);
          ctx.moveTo(sShoulder.x, sShoulder.y);
          ctx.lineTo(sKnee.x, sKnee.y);
          ctx.lineTo(sPad.x, sPad.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // --- 4. 4 EXTRUDED 3D SIDE WALLS ---
      if (screenSize >= 3) {
        const walls = [0, 1, 2, 3].map((k) => {
          const next = (k + 1) % 4;
          const wallDepth = (basePts[k].depth + basePts[next].depth + roofPts[k].depth + roofPts[next].depth) * 0.25;
          return { k, next, wallDepth };
        }).sort((a, b) => b.wallDepth - a.wallDepth);

        for (const { k, next } of walls) {
          ctx.beginPath();
          ctx.moveTo(basePts[k].x, basePts[k].y);
          ctx.lineTo(basePts[next].x, basePts[next].y);
          ctx.lineTo(roofPts[next].x, roofPts[next].y);
          ctx.lineTo(roofPts[k].x, roofPts[k].y);
          ctx.closePath();

          ctx.save();
          ctx.globalAlpha *= xrayAlpha;
          const isEndCapWall = spec.hasEndCaps && (k === 0 || k === 2);
          ctx.fillStyle = isEndCapWall && spec.capColor ? spec.capColor : spec.bodySide;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.lineWidth = 0.85;
          ctx.stroke();
          ctx.restore();
        }
      }

      // --- 5. 3D ROOF FACE ---
      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();

      ctx.save();
      ctx.globalAlpha *= xrayAlpha;
      ctx.fillStyle = spec.kind === 'bga' ? '#15803d' : spec.bodyTop;
      ctx.fill();
      ctx.restore();

      // --- 6. PACKAGE-SPECIFIC STANDING / 3D ROOF DETAILS ---
      if (spec.hasEndCaps && spec.capColor && screenSize >= 5) {
        ctx.save();
        ctx.globalAlpha *= xrayAlpha * 0.98;
        fillPassiveEndCaps(ctx, roofPts, 0.25, spec.capColor, 'rgba(71, 85, 105, 0.8)');
        ctx.restore();

        if (spec.kind === 'mlcc' && screenSize >= 8) {
          const m0 = lerpPt(lerpPt(roofPts[0], roofPts[1], 0.34), lerpPt(roofPts[3], roofPts[2], 0.34), 0.28);
          const m1 = lerpPt(lerpPt(roofPts[0], roofPts[1], 0.34), lerpPt(roofPts[3], roofPts[2], 0.34), 0.72);
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 240, 215, 0.45)';
          ctx.lineWidth = Math.max(1.2, screenSize * 0.08);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(m0.x, m0.y);
          ctx.lineTo(m1.x, m1.y);
          ctx.stroke();
          ctx.restore();
        }

        if ((spec.kind === 'diode' || spec.kind === 'tantalum') && screenSize >= 8) {
          const k0 = lerpPt(roofPts[0], roofPts[3], 0.34);
          const k1 = lerpPt(roofPts[1], roofPts[2], 0.34);
          ctx.save();
          ctx.strokeStyle = spec.accentColor || '#f8fafc';
          ctx.lineWidth = Math.max(1.8, screenSize * 0.09);
          ctx.beginPath();
          ctx.moveTo(k0.x, k0.y);
          ctx.lineTo(k1.x, k1.y);
          ctx.stroke();
          ctx.restore();
        } else if (spec.kind === 'led' && screenSize >= 7) {
          const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
          const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
          ctx.save();
          ctx.beginPath();
          ctx.arc(rcx, rcy, Math.max(2, screenSize * 0.18), 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.restore();
        }
      } else if (spec.kind === 'bga' && screenSize >= 12) {
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
        // Standing 3D Cylindrical Ferrite Drum Core + Copper Winding rising out of the inductor block!
        const centerWorld = {
          x: (polyWorld[0].x + polyWorld[2].x) * 0.5,
          y: (polyWorld[0].y + polyWorld[2].y) * 0.5,
        };
        const zDrumTop = zBase + zSign * (spec.heightMil * 1.28);
        const cBot = P(centerWorld, zRoof);
        const cTop = P(centerWorld, zDrumTop);
        const d01 = Math.hypot(roofPts[1].x - roofPts[0].x, roofPts[1].y - roofPts[0].y);
        const d12 = Math.hypot(roofPts[2].x - roofPts[1].x, roofPts[2].y - roofPts[1].y);
        const rBoss = Math.min(d01, d12) * 0.38;
        if (rBoss >= 3) {
          const dxCyl = cTop.x - cBot.x, dyCyl = cTop.y - cBot.y;
          const perpAngle = Math.atan2(dyCyl, dxCyl) + Math.PI / 2;
          const nx = Math.cos(perpAngle), ny = Math.sin(perpAngle);

          ctx.save();
          // Copper winding cylinder wall
          ctx.beginPath();
          ctx.moveTo(cBot.x + nx * rBoss, cBot.y + ny * rBoss);
          ctx.lineTo(cTop.x + nx * rBoss, cTop.y + ny * rBoss);
          ctx.lineTo(cTop.x - nx * rBoss, cTop.y - ny * rBoss);
          ctx.lineTo(cBot.x - nx * rBoss, cBot.y - ny * rBoss);
          ctx.closePath();
          ctx.fillStyle = '#b45309';
          ctx.fill();

          // Dark sintered ferrite top drum cap
          ctx.beginPath();
          ctx.arc(cTop.x, cTop.y, rBoss * 1.06, 0, Math.PI * 2);
          ctx.fillStyle = '#1e242d';
          ctx.fill();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
        }
      } else if (spec.kind === 'connector' && screenSize >= 10) {
        // Recessed mating cavity + tall standing 3D gold header posts protruding up from the shroud!
        const slotRoof = insetQuad(roofPts, 0.08, 0.24);
        ctx.save();
        ctx.beginPath();
        slotRoof.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 14, 19, 0.92)';
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (pinCount <= 40) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = Math.min(4, Math.max(1.8, screenSize * 0.045));
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
            const pin = board.pins[pIdx];
            const pBot = P(pin, zBase + zSign * spec.heightMil * 0.15);
            const pTop = P(pin, zRoof + zSign * spec.heightMil * 0.18);
            ctx.moveTo(pBot.x, pBot.y);
            ctx.lineTo(pTop.x, pTop.y);
          }
          ctx.stroke();
        }
        ctx.restore();
      } else if (spec.kind === 'ic' && part.pinStart < board.pins.length && screenSize >= 10) {
        const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
        const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
        const sp1 = P(board.pins[part.pinStart], zRoof);
        const dimple = lerpPt({ x: rcx, y: rcy }, sp1, 0.5);
        ctx.save();
        ctx.beginPath();
        ctx.arc(dimple.x, dimple.y, Math.min(3.8, Math.max(1.8, screenSize * 0.06)), 0, Math.PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.restore();
      }

      // Roof bevel stroke
      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
      ctx.lineWidth = selected ? 2.2 : focused ? 1.7 : 1.1;
      ctx.stroke();

      renderRoofLabel(roofPts);
      ctx.restore();
    }

    // Draw X-Ray pin rings & active highlights on top of the 3D bodies
    drawPinsOnSurface(true);
  };

  // 3. Draw Far-Side -> 3D PCB Substrate -> Near-Side in true Z-order
  const bothSidesActive = layers.top && layers.bottom;
  const farSide: 'top' | 'bottom' = topFacesCamera ? 'bottom' : 'top';
  const nearSide: 'top' | 'bottom' = topFacesCamera ? 'top' : 'bottom';

  if (bothSidesActive) {
    drawSideComponentsAndPins(farSide, true);
  }

  // Draw 3D Extruded PCB Substrate
  if (layers.outline && (board.outline.length > 1 || (board.outlineSegments && board.outlineSegments.length > 0))) {
    const zFar = proj.cosP >= 0 ? zBotSurface : zTopSurface;
    const zNear = proj.cosP >= 0 ? zTopSurface : zBotSurface;

    ctx.save();
    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zFar);
    ctx.strokeStyle = '#927238';
    ctx.lineWidth = Math.max(2, 4.2 * view.scale);
    ctx.stroke();

    if (board.outline.length > 2) {
      const step = Math.max(1, Math.floor(board.outline.length / 90));
      ctx.beginPath();
      for (let i = 0; i < board.outline.length - 1; i += step) {
        const aFar = P(board.outline[i], zFar);
        const aNear = P(board.outline[i], zNear);
        ctx.moveTo(aFar.x, aFar.y);
        ctx.lineTo(aNear.x, aNear.y);
      }
      ctx.strokeStyle = 'rgba(161, 126, 60, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zNear);
    if (board.outline.length > 2) {
      const alpha = bothSidesActive ? 0.72 : 0.92;
      ctx.fillStyle = isClassic
        ? `rgba(16, 78, 52, ${alpha})`
        : `rgba(13, 35, 39, ${alpha})`;
      ctx.fill('evenodd');
    }
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.9;
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
      const { zBase: zHub, zSign: hubSign } = getSideZ(hubPin.side, layers, topFacesCamera);
      const sHub = P(hubPin, zHub);

      ctx.save();
      ctx.strokeStyle = palette.netActive;
      ctx.lineWidth = 1.75;
      for (const idx of info.pinIndices) {
        if (idx === hubIdx) continue;
        const targetPin = board.pins[idx];
        const visible = sideVisible(targetPin.side, layers);
        const { zBase: zTarget } = getSideZ(targetPin.side, layers, topFacesCamera);
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
      const { zBase } = getSideZ(pin.side, layers, topFacesCamera);
      selPt = P(pin, zBase);
    } else if (selection.kind === 'nail' && board.nails[selection.index]) {
      const nail = board.nails[selection.index];
      const { zBase } = getSideZ(nail.side, layers, topFacesCamera);
      selPt = P(nail, zBase);
    } else if (selection.kind === 'part' && board.parts[selection.index]?.box && !board.parts[selection.index]?.isDummy) {
      const part = board.parts[selection.index];
      const spec = classifyPartPackage(part);
      const b = part.box!;
      const { zBase, zSign } = getSideZ(part.side, layers, topFacesCamera);
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
    draw3DGizmo(ctx, w, rotation, cam, flipX, flipY, palette);
  }

  void tr2d;
}

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

/** Automatically infers the real-world physical package and 3D height from any
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
  const shortSide = Math.max(10, h);
  const longSide = Math.max(14, w);

  let spec: PackageSpec;

  if ((p0 === 'C' || (p0 === 'P' && p1 === 'C')) && part.expanse && part.expanse > 90) {
    // Radial electrolytic / polymer aluminum cylindrical can
    spec = {
      kind: 'electrolytic',
      heightMil: Math.min(145, Math.max(58, part.expanse * 0.48)),
      bodyTop: '#dce4ee',
      bodySide: '#8a99ad',
      bodyStroke: '#475569',
      accentColor: '#0f172a',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if ((p0 === 'C' || (p0 === 'P' && p1 === 'C')) && longSide >= 115 && pinCount === 2) {
    // Molded Tantalum / Polymer SMD bulk capacitor (amber-yellow body with anode polarity stripe)
    spec = {
      kind: 'tantalum',
      heightMil: Math.min(62, Math.max(28, shortSide * 0.55)),
      bodyTop: '#eab308',
      bodySide: '#ca8a04',
      bodyStroke: '#854d0e',
      capColor: '#cbd5e1',
      accentColor: '#78350f',
      hasEndCaps: true,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'C' || (p0 === 'P' && p1 === 'C')) {
    // SMD Ceramic MLCC Capacitor (tan ceramic dielectric + bright silver end-caps)
    spec = {
      kind: 'mlcc',
      heightMil: Math.min(42, Math.max(11, shortSide * 0.65)),
      bodyTop: '#c88a4b',
      bodySide: '#9a6530',
      bodyStroke: '#6b441e',
      capColor: '#e2e8f0',
      accentColor: '#dfaa73',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'R' || (p0 === 'P' && p1 === 'R')) {
    // SMD Thick/Thin-Film Chip Resistor (matte black resistive glaze + alumina ceramic substrate + silver end-caps)
    spec = {
      kind: 'resistor',
      heightMil: Math.min(24, Math.max(8, shortSide * 0.38)),
      bodyTop: '#181c22',
      bodySide: '#cbd5e1',
      bodyStroke: '#475569',
      capColor: '#e2e8f0',
      accentColor: '#f8fafc',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'L' || (p0 === 'P' && p1 === 'L') || name.startsWith('FB') || name.startsWith('FL')) {
    // Shielded Power Inductor / Ferrite Coil
    const isPowerCoil = longSide > 80;
    spec = {
      kind: 'inductor',
      heightMil: isPowerCoil
        ? Math.min(125, Math.max(46, shortSide * 0.58))
        : Math.min(38, Math.max(14, shortSide * 0.52)),
      bodyTop: isPowerCoil ? '#2b313a' : '#2d3748',
      bodySide: '#1a1e24',
      bodyStroke: '#64748b',
      capColor: '#cbd5e1',
      accentColor: '#475569',
      hasEndCaps: !isPowerCoil && pinCount === 2,
      showLabelAtAllZooms: isPowerCoil,
    };
  } else if (name.startsWith('LED')) {
    spec = {
      kind: 'led',
      heightMil: Math.min(40, Math.max(14, shortSide * 0.5)),
      bodyTop: '#f8fafc',
      bodySide: '#cbd5e1',
      bodyStroke: '#94a3b8',
      capColor: '#eab308',
      accentColor: '#f59e0b',
      hasEndCaps: pinCount === 2,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'D' || (p0 === 'P' && p1 === 'D') || name.startsWith('ZD')) {
    // Diode / Zener (molded black body + silver cathode band)
    spec = {
      kind: 'diode',
      heightMil: Math.min(44, Math.max(15, shortSide * 0.5)),
      bodyTop: '#1a1e24',
      bodySide: '#0f1318',
      bodyStroke: '#475569',
      capColor: '#dce4ec',
      accentColor: '#e2e8f0',
      hasEndCaps: pinCount === 2,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'Q' || (p0 === 'P' && p1 === 'Q') || p0 === 'T') {
    // Transistor / MOSFET (SOT-23 / SOT-363 / Power DFN)
    spec = {
      kind: 'transistor',
      heightMil: Math.min(45, Math.max(16, shortSide * 0.45)),
      bodyTop: '#1c2128',
      bodySide: '#11151b',
      bodyStroke: '#4b5563',
      capColor: '#cbd5e1',
      accentColor: '#94a3b8',
      hasEndCaps: false,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'J' || name.startsWith('CN') || name.startsWith('CON') || name.startsWith('USB') || name.startsWith('HDMI')) {
    // Board-to-Board / FPC / I/O Connector
    spec = {
      kind: 'connector',
      heightMil: Math.min(135, Math.max(48, shortSide * 0.48)),
      bodyTop: '#1e232a',
      bodySide: '#64748b',
      bodyStroke: '#94a3b8',
      capColor: '#facc15',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else if (p0 === 'Y' || p0 === 'X' || name.startsWith('XTAL') || name.startsWith('OSC')) {
    // Quartz Crystal / Oscillator (gold ceramic base + brushed silver metal lid)
    spec = {
      kind: 'crystal',
      heightMil: Math.min(48, Math.max(20, shortSide * 0.48)),
      bodyTop: '#dce4ee',
      bodySide: '#b45309',
      bodyStroke: '#eab308',
      capColor: '#facc15',
      accentColor: '#94a3b8',
      hasEndCaps: false,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'F' && !name.startsWith('FB') && !name.startsWith('FL')) {
    // SMD Fuse (white ceramic body + gold end-caps)
    spec = {
      kind: 'fuse',
      heightMil: Math.min(34, Math.max(13, shortSide * 0.46)),
      bodyTop: '#f1f5f9',
      bodySide: '#cbd5e1',
      bodyStroke: '#ca8a04',
      capColor: '#eab308',
      accentColor: '#64748b',
      hasEndCaps: true,
      showLabelAtAllZooms: false,
    };
  } else if (p0 === 'U' || (p0 === 'P' && p1 === 'U') || name.startsWith('IC')) {
    // Integrated Circuit: BGA/CSP vs QFN/SOIC/QFP
    const isBga = pinCount >= 20 && shortSide > 105;
    spec = {
      kind: isBga ? 'bga' : 'ic',
      heightMil: isBga
        ? Math.min(68, Math.max(30, Math.sqrt(longSide * shortSide) * 0.06))
        : Math.min(50, Math.max(20, shortSide * 0.34)),
      bodyTop: isBga ? '#111827' : '#1b2028',
      bodySide: isBga ? '#15803d' : '#10141a',
      bodyStroke: isBga ? '#22c55e' : '#475569',
      capColor: '#cbd5e1',
      accentColor: '#facc15',
      hasEndCaps: false,
      showLabelAtAllZooms: true,
    };
  } else {
    spec = {
      kind: 'generic',
      heightMil: Math.min(40, Math.max(15, shortSide * 0.42)),
      bodyTop: '#222730',
      bodySide: '#151920',
      bodyStroke: '#4b5563',
      hasEndCaps: false,
      showLabelAtAllZooms: false,
    };
  }

  PACKAGE_CACHE.set(part, spec);
  return spec;
}

/** Helper to interpolate between two 2D points. */
function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**Shrinks a 4-point quad along its two axes: `tLen` along 0->3 / 1->2, `tWid` along 0->1 / 3->2. */
function insetQuad(q: Point[], tLen: number, tWid: number): Point[] {
  const p0 = lerpPt(lerpPt(q[0], q[3], tLen), lerpPt(q[1], q[2], tLen), tWid);
  const p1 = lerpPt(lerpPt(q[0], q[3], tLen), lerpPt(q[1], q[2], tLen), 1 - tWid);
  const p2 = lerpPt(lerpPt(q[0], q[3], 1 - tLen), lerpPt(q[1], q[2], 1 - tLen), 1 - tWid);
  const p3 = lerpPt(lerpPt(q[0], q[3], 1 - tLen), lerpPt(q[1], q[2], 1 - tLen), tWid);
  return [p0, p1, p2, p3];
}

/** Draws a 2-terminal passive's silver/gold end-caps at the Pin 0 edge (q0-q1) and Pin 1 edge (q3-q2).
 *  In `finalizeBoard`, 2-pin passives always construct `part.outline` so that `q0->q1` is Pin 0's end
 *  and `q2->q3` is Pin 1's end. */
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
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
  }
}

/** 2D Realistic Component Package Illustration Renderer (with X-Ray translucency so BGA balls
 *  and pads remain visible and clickable inside the physical component package). */
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
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x + 1.5, pt.y + 2) : ctx.lineTo(pt.x + 1.5, pt.y + 2)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fill();
    ctx.restore();
  }

  // 2. Radial Electrolytic / Polymer Aluminum Can (`electrolytic`)
  if (spec.kind === 'electrolytic' && part.center && part.expanse) {
    // Dark square baseplate with chamfered corners
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(24, 30, 38, 0.85)';
    ctx.fill();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#64748b';
    ctx.lineWidth = selected ? 2 : 1.1;
    ctx.stroke();

    const sc = S(part.center);
    const cr = Math.max(3.5, part.expanse * 0.36 * scale);
    // Metallic aluminum cylinder top
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, cr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 228, 238, 0.82)';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Inner rolled aluminum groove ring
    if (cr >= 6) {
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, cr * 0.78, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // 3-spoke Y vent score lines
      ctx.beginPath();
      for (let a = 0; a < 3; a++) {
        const ang = (a * Math.PI * 2) / 3 - Math.PI / 6;
        ctx.moveTo(sc.x, sc.y);
        ctx.lineTo(sc.x + Math.cos(ang) * cr * 0.55, sc.y + Math.sin(ang) * cr * 0.55);
      }
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.65)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Black negative polarity crescent band
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, cr * 0.93, -Math.PI * 0.36, Math.PI * 0.36);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.restore();
    return;
  }

  // 3. BGA Package (`bga`): Green fiberglass interposer substrate + dark silicon die + gold A1 fiducial
  if (spec.kind === 'bga') {
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = selected || focused ? 'rgba(21, 128, 61, 0.66)' : 'rgba(20, 83, 45, 0.58)';
    ctx.fill();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#22c55e';
    ctx.lineWidth = selected ? 2.2 : 1.3;
    ctx.stroke();

    if (minDim >= 12) {
      const dieQuad = insetQuad(quad, 0.14, 0.14);
      ctx.beginPath();
      dieQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // Gold corner fiducial at Pin 1 corner
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
      const f1 = lerpPt(c0, cNext, 0.14);
      const f2 = lerpPt(c0, cPrev, 0.14);
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

  // 4. SOT-23 / Multi-lead Transistor (`transistor`) or Molded IC (`ic`) with visible metallic gull-wing leads
  if ((spec.kind === 'transistor' || spec.kind === 'ic') && maxDim >= 9) {
    const pinCount = Math.max(0, part.pinEnd - part.pinStart);
    const bodyQuad = pinCount <= 8 ? insetQuad(quad, 0.12, 0.16) : insetQuad(quad, 0.08, 0.08);

    // Draw metallic silver leads reaching from the molded body out to each pin pad
    if (pinCount >= 2 && pinCount <= 32) {
      ctx.save();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = Math.min(4, Math.max(1.4, minDim * 0.14));
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
        const sp = S(board.pins[pIdx]);
        const anchor = lerpPt({ x: cx, y: cy }, sp, 0.55);
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Molded black epoxy package body
    ctx.beginPath();
    bodyQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.84;
    ctx.fillStyle = spec.bodyTop;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
    ctx.lineWidth = selected ? 2 : 1.15;
    ctx.stroke();

    // Concave Pin-1 dimple near Pin 1
    if (part.pinStart < board.pins.length && minDim >= 10) {
      const sp1 = S(board.pins[part.pinStart]);
      const dimple = lerpPt({ x: cx, y: cy }, sp1, 0.52);
      ctx.beginPath();
      ctx.arc(dimple.x, dimple.y, Math.min(3.5, Math.max(1.6, minDim * 0.1)), 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // 5. 2-Terminal Passives (MLCC Capacitors, Chip Resistors, Tantalum Caps, Diodes, LEDs, Fuses, Small Inductors)
  if (spec.hasEndCaps) {
    // Slightly inset the physical component body along the width so rounded solder pads peek out cleanly
    const bodyQuad = insetQuad(quad, 0.02, 0.1);

    // Center dielectric / resistive body
    ctx.beginPath();
    bodyQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.86;
    ctx.fillStyle = spec.bodyTop;
    ctx.fill();
    ctx.restore();

    // Metallic silver/gold end-cap terminations at Pin 0 (q0-q1) and Pin 1 (q3-q2)
    if (maxDim >= 5 && spec.capColor) {
      ctx.save();
      ctx.globalAlpha *= 0.94;
      fillPassiveEndCaps(ctx, bodyQuad, 0.24, spec.capColor, 'rgba(71, 85, 105, 0.7)');
      ctx.restore();
    }

    // Specular 3D sheen strip down the center of ceramic MLCC capacitors
    if (spec.kind === 'mlcc' && maxDim >= 9) {
      const m0 = lerpPt(lerpPt(bodyQuad[0], bodyQuad[1], 0.35), lerpPt(bodyQuad[3], bodyQuad[2], 0.35), 0.26);
      const m1 = lerpPt(lerpPt(bodyQuad[0], bodyQuad[1], 0.35), lerpPt(bodyQuad[3], bodyQuad[2], 0.35), 0.74);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 235, 205, 0.38)';
      ctx.lineWidth = Math.max(1, minDim * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.stroke();
      ctx.restore();
    }

    // Diode cathode band / Tantalum anode polarity bar near Pin 0 end
    if ((spec.kind === 'diode' || spec.kind === 'tantalum') && maxDim >= 8) {
      const k0 = lerpPt(bodyQuad[0], bodyQuad[3], 0.33);
      const k1 = lerpPt(bodyQuad[1], bodyQuad[2], 0.33);
      ctx.save();
      ctx.strokeStyle = spec.accentColor || '#e2e8f0';
      ctx.lineWidth = Math.max(1.6, maxDim * 0.09);
      ctx.beginPath();
      ctx.moveTo(k0.x, k0.y);
      ctx.lineTo(k1.x, k1.y);
      ctx.stroke();
      ctx.restore();
    }

    // LED glowing amber phosphor dome in center
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

    // Outer package rim
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
  ctx.globalAlpha *= 0.82;
  ctx.fillStyle = spec.bodyTop;
  ctx.fill();
  ctx.restore();

  if (spec.kind === 'inductor' && minDim >= 12) {
    // Raised circular sintered ferrite drum core boss
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 35, 42, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  } else if (spec.kind === 'connector' && minDim >= 10) {
    // Recessed dark mating cavity + gold contact finger bars
    const slotQuad = insetQuad(quad, 0.14, 0.24);
    ctx.save();
    ctx.beginPath();
    slotQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(12, 15, 20, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.7)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  } else if (spec.kind === 'crystal' && minDim >= 8) {
    // Gold ceramic base rim + brushed metallic inner lid
    const lidQuad = insetQuad(quad, 0.12, 0.12);
    ctx.save();
    ctx.beginPath();
    lidQuad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(241, 245, 249, 0.82)';
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
  ctx.lineWidth = selected ? 2.1 : focused ? 1.6 : 1.1;
  ctx.stroke();

  ctx.restore();
}

/* ============================================================================
 * 3D PERSPECTIVE CAMERA & EXTRUDED 3D BOARD RENDERER
 * ========================================================================== */

export interface Camera3D {
  pitchDeg: number; // Tilt angle: 0° = top-down, 50° = default 3D oblique
  yawDeg: number;   // Turntable spin around Z axis
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
}

/** Creates a screen-centered 3D projector:
 *  - Tilting (`pitchDeg`) pivots around the horizontal line passing through the CENTER OF THE SCREEN
 *    `(width/2, height/2)` so the component you are inspecting stays dead-center when you tilt!
 *  - Perspective foreshortening is normalized to screen dimensions so zooming in 50× never warps polygons! */
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
    x: (board.bounds.minX + board.bounds.minX + (board.bounds.maxX - board.bounds.minX)) / 2,
    y: (board.bounds.minY + board.bounds.maxY) / 2,
  };
  const rotRad = ((rotation + cam.yawDeg) * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);

  const pitchRad = (cam.pitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);

  const fov = Math.max(width, height) * 2.6;

  const project3D = (p: Point, z = 0): ProjectedPoint => {
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    let dz = z;
    if (flipX) dx = -dx;
    if (flipY) {
      dy = -dy;
      dz = -dz;
    }

    // Screen-space offset relative to the viewport center (width/2, height/2) BEFORE tilt:
    const rx = (dx * cosR - dy * sinR) * view.scale + view.panX;
    const ry = (dx * sinR + dy * cosR) * view.scale + view.panY;
    const rz = dz * view.scale;

    // Tilt around the viewport center horizontal line (ry = 0)
    const yTilt = ry * cosP - rz * sinP;
    const zDepth = ry * sinP + rz * cosP;

    // Gentle screen-normalized perspective foreshortening that never clips or warps at high zoom
    const zNorm = Math.max(-fov * 0.38, Math.min(fov * 0.38, zDepth));
    const persp = fov / (fov + zNorm * 0.28);

    return {
      x: width / 2 + rx * persp,
      y: height / 2 + yTilt * persp,
      depth: zDepth,
      persp,
    };
  };

  const unprojectToPlane = (sx: number, sy: number, zPlane = 0): Point => {
    let dz = zPlane;
    if (flipY) dz = -dz;
    const rz = dz * view.scale;

    const u = sx - width / 2;
    const v = sy - height / 2;

    // Approximate inverse perspective (2 fixed-point iterations for exact sub-pixel convergence)
    let persp = 1;
    let ry = (v + rz * sinP) / Math.max(0.18, cosP);
    for (let iter = 0; iter < 2; iter++) {
      ry = (v / persp + rz * sinP) / Math.max(0.18, cosP);
      const zDepth = ry * sinP + rz * cosP;
      const zNorm = Math.max(-fov * 0.38, Math.min(fov * 0.38, zDepth));
      persp = fov / (fov + zNorm * 0.28);
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

  return {
    project3D,
    unprojectToPlane,
    cosP,
    sinP,
    cosR,
    sinR,
    center,
  };
}

/** Zooms in 3D about a screen cursor point `(sx, sy)` so the 3D board point under the cursor stays fixed. */
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

  // Compute rx0, ry0 at panX = 0, panY = 0 with the new scale
  let dx = worldPt.x - beforeProj.center.x;
  let dy = worldPt.y - beforeProj.center.y;
  if (flipX) dx = -dx;
  if (flipY) dy = -dy;
  const rx0 = (dx * beforeProj.cosR - dy * beforeProj.sinR) * scale;
  const ry0 = (dx * beforeProj.sinR + dy * beforeProj.cosR) * scale;

  // Preserve the exact screen offset (rx, ry) of worldPt before zoom
  const rxOld = (dx * beforeProj.cosR - dy * beforeProj.sinR) * view.scale + view.panX;
  const ryOld = (dx * beforeProj.sinR + dy * beforeProj.cosR) * view.scale + view.panY;

  return {
    scale,
    panX: rxOld - rx0,
    panY: ryOld - ry0,
  };
}

/** Orbits the 3D camera around the world point currently at the center of the screen `(width/2, height/2)`,
 *  adjusting `panX` and `panY` so the inspected component stays locked at the center of the viewport! */
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

export const BOARD_HALF_THICKNESS_MIL = 31; // Standard 1.6mm (62 mil) FR-4 PCB half-thickness

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
  ctx.fillStyle = palette.bg === '#ffffff' ? 'rgba(240, 244, 248, 0.88)' : 'rgba(10, 16, 24, 0.82)';
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

/** Renders the full 3D extruded PCB, 3D solder pads/BGA balls, 3D extruded realistic
 *  components (X-Ray translucent so pins remain visible & clickable), and 3D net arcs. */
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
): void {
  const { w, h } = size;
  const P = proj.project3D;
  const zTopSurface = BOARD_HALF_THICKNESS_MIL;
  const zBotSurface = -BOARD_HALF_THICKNESS_MIL;

  const activeNetInfo = highlightNet && index ? index.nets.get(highlightNet) : undefined;
  const hasFilter = Boolean(selection || (highlightNet && highlightNet !== 'UNCONNECTED') || focusParts.size > 0);

  // Determine which board surface faces the camera
  const topOrigin = P(proj.center, zTopSurface);
  const botOrigin = P(proj.center, zBotSurface);
  const topFacesCamera = topOrigin.depth <= botOrigin.depth;

  // 1. 3D Reference Grid on the far PCB plane
  if (layers.grid) {
    const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
    const step = steps.find((s) => s * view.scale >= 70) ?? 25000;
    const pad = 600;
    const minX = board.bounds.minX - pad, maxX = board.bounds.maxX + pad;
    const minY = board.bounds.minY - pad, maxY = board.bounds.maxY + pad;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
      const a = P({ x, y: minY }, zBotSurface), b = P({ x, y: maxY }, zBotSurface);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
      const a = P({ x: minX, y }, zBotSurface), b = P({ x: maxX, y }, zBotSurface);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  // 2. Helper to draw a side's components + pins in proper 3D depth order
  const drawSideComponentsAndPins = (side: 'top' | 'bottom') => {
    const sideEnabled = side === 'top' ? layers.top : layers.bottom;
    if (!sideEnabled) return;

    const zBase = side === 'top' ? zTopSurface : zBotSurface;
    const zSign = side === 'top' ? 1 : -1;

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
        if (pin.side !== side && !(pin.side === 'both' && side === (topFacesCamera ? 'top' : 'bottom'))) continue;
        const projPt = P(pin, zBase);
        const r = Math.min(22, Math.max(0.85, pin.radius * view.scale * 0.85 * projPt.persp));
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

        if (overlayPass && (r >= 11 || ((isSelected || isPartSelected || isSameNet) && r >= 7.5))) {
          labeled.push(p3);
        }
      }

      if (!overlayPass) {
        // Base pass: solid gold/silver PCB pads underneath the 3D components
        const drawBaseBucket = (arr: Pin3D[], fillCol: string, strokeCol: string, alpha: number) => {
          if (!arr.length) return;
          const dim = hasFilter ? 0.45 : 1;
          ctx.save();
          ctx.beginPath();
          for (const p of arr) {
            ctx.moveTo(p.sx + p.r, p.sy);
            ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
          }
          ctx.fillStyle = fillCol;
          ctx.globalAlpha = alpha * dim;
          ctx.fill();
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = Math.min(1.4, Math.max(0.75, arr[0].r * 0.2));
          ctx.globalAlpha = Math.min(1, (alpha + 0.25) * dim);
          ctx.stroke();
          ctx.restore();
        };

        drawBaseBucket(buckets.nc, '#334155', '#64748b', 0.5);
        drawBaseBucket(buckets.gnd, '#475569', '#94a3b8', 0.65);
        drawBaseBucket(
          buckets.normal,
          side === 'top' ? '#d4af37' : '#3b82f6',
          side === 'top' ? '#fef08a' : '#93c5fd',
          0.78,
        );
        drawBaseBucket(buckets.testPad, '#eab308', '#fef08a', 0.9);
        drawBaseBucket(buckets.pin1, palette.pinA1, '#ffffff', 0.88);
      } else {
        // X-Ray Overlay pass: subtle rings on top of 3D bodies so BGA balls and pads are always visible & clickable
        const drawXrayRing = (arr: Pin3D[], strokeCol: string, alpha: number) => {
          if (!arr.length) return;
          const dim = hasFilter ? 0.38 : 1;
          ctx.save();
          ctx.beginPath();
          for (const p of arr) {
            ctx.moveTo(p.sx + p.r, p.sy);
            ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
          }
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = Math.min(1.3, Math.max(0.75, arr[0].r * 0.2));
          ctx.globalAlpha = alpha * dim;
          ctx.stroke();
          ctx.restore();
        };

        drawXrayRing(buckets.nc, palette.pinNc, 0.42);
        drawXrayRing(buckets.gnd, palette.pinGround, 0.55);
        drawXrayRing(buckets.normal, side === 'top' ? palette.top : palette.bottom, 0.68);
        drawXrayRing(buckets.pin1, palette.pinA1, 0.9);

        if (highlighted.length) {
          ctx.save();
          for (const p of highlighted) {
            const hr = Math.max(2.8, p.r + (p.isSelected ? 2 : 1.2));
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, hr, 0, Math.PI * 2);
            ctx.fillStyle = p.isSelected ? palette.pinSelected : palette.pinSameNet;
            ctx.fill();
            ctx.strokeStyle = palette.selectionRing;
            ctx.lineWidth = 1.6;
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
            ctx.strokeStyle = palette.bg;
            ctx.lineWidth = 2.2;
            ctx.strokeText(pinLabel, sp.sx, sp.sy);
            ctx.fillStyle = palette.pinText;
            ctx.fillText(pinLabel, sp.sx, sp.sy);
          }
          ctx.restore();
        }
      }
    };

    // Draw base PCB pads first
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
      const partSide = part.side === 'both' ? (topFacesCamera ? 'top' : 'bottom') : part.side;
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
      // Inset 2-pin passives slightly along width so gold solder pads remain visible at both ends
      const polyWorld = spec.hasEndCaps
        ? insetQuad(rawPoly, 0.02, 0.1)
        : (spec.kind === 'transistor' || spec.kind === 'ic')
          ? insetQuad(rawPoly, 0.08, 0.1)
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

    // 2c. Render each 3D extruded component package
    for (const item of items) {
      const { part, spec, basePts, roofPts, selected, focused, highlighted, screenSize } = item;

      ctx.save();
      if (hasFilter && !highlighted) ctx.globalAlpha = 0.36;

      const xrayAlpha = selected || focused ? 0.9 : spec.kind === 'bga' ? 0.68 : 0.82;
      const zRoof = zBase + zSign * spec.heightMil;

      // --- SPECIAL 3D CYLINDRICAL CAN FOR RADIAL ELECTROLYTIC CAPACITORS ---
      if (spec.kind === 'electrolytic' && part.center && part.expanse) {
        // Dark baseplate on PCB surface
        ctx.beginPath();
        basePts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(24, 30, 38, 0.88)';
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.stroke();

        const cBase = P(part.center, zBase);
        const cTop = P(part.center, zRoof);
        const rBase = Math.max(3, part.expanse * 0.36 * view.scale * cBase.persp);
        const rTop = Math.max(3, part.expanse * 0.36 * view.scale * cTop.persp);

        // Extruded 3D cylinder body connecting base circle to top circle
        const dxCyl = cTop.x - cBase.x, dyCyl = cTop.y - cBase.y;
        const perpAngle = Math.atan2(dyCyl, dxCyl) + Math.PI / 2;
        const nx = Math.cos(perpAngle), ny = Math.sin(perpAngle);

        ctx.beginPath();
        ctx.moveTo(cBase.x + nx * rBase, cBase.y + ny * rBase);
        ctx.lineTo(cTop.x + nx * rTop, cTop.y + ny * rTop);
        ctx.lineTo(cTop.x - nx * rTop, cTop.y - ny * rTop);
        ctx.lineTo(cBase.x - nx * rBase, cBase.y - ny * rBase);
        ctx.closePath();
        ctx.fillStyle = spec.bodySide;
        ctx.fill();

        // Top circular aluminum dome
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

        if (rTop >= 7) {
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
        ctx.restore();
        continue;
      }

      // --- METALLIC LEADS ON SOT-23 TRANSISTORS & SOIC/QFN ICs ---
      const pinCount = Math.max(0, part.pinEnd - part.pinStart);
      if ((spec.kind === 'transistor' || spec.kind === 'ic') && pinCount >= 2 && pinCount <= 32 && screenSize >= 10) {
        const bcx = (basePts[0].x + basePts[1].x + basePts[2].x + basePts[3].x) * 0.25;
        const bcy = (basePts[0].y + basePts[1].y + basePts[2].y + basePts[3].y) * 0.25;
        ctx.save();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = Math.min(3.6, Math.max(1.3, screenSize * 0.08));
        ctx.beginPath();
        for (let pIdx = part.pinStart; pIdx < Math.min(part.pinEnd, board.pins.length); pIdx++) {
          const sp = P(board.pins[pIdx], zBase);
          const anchor = lerpPt({ x: bcx, y: bcy }, sp, 0.52);
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // --- 4 EXTRUDED 3D SIDE WALLS ---
      if (screenSize >= 3.2) {
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
          // Edges k===0 (q0->q1) and k===2 (q2->q3) are the Pin 0 and Pin 1 end-cap walls on 2-pin passives!
          const isEndCapWall = spec.hasEndCaps && (k === 0 || k === 2);
          ctx.fillStyle = isEndCapWall && spec.capColor ? spec.capColor : spec.bodySide;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
          ctx.lineWidth = 0.75;
          ctx.stroke();
          ctx.restore();
        }
      }

      // --- 3D ROOF FACE ---
      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();

      ctx.save();
      ctx.globalAlpha *= xrayAlpha;
      ctx.fillStyle = spec.kind === 'bga' ? '#15803d' : spec.bodyTop;
      ctx.fill();
      ctx.restore();

      // --- PACKAGE-SPECIFIC 3D ROOF ILLUSTRATIONS ---
      if (spec.hasEndCaps && spec.capColor && screenSize >= 5) {
        // Silver/gold end-caps at q0-q1 (Pin 0) and q3-q2 (Pin 1)
        ctx.save();
        ctx.globalAlpha *= xrayAlpha * 0.96;
        fillPassiveEndCaps(ctx, roofPts, 0.24, spec.capColor, 'rgba(71, 85, 105, 0.75)');
        ctx.restore();

        // Ceramic capacitor specular highlight or diode/tantalum polarity band
        if ((spec.kind === 'diode' || spec.kind === 'tantalum') && screenSize >= 8) {
          const k0 = lerpPt(roofPts[0], roofPts[3], 0.33);
          const k1 = lerpPt(roofPts[1], roofPts[2], 0.33);
          ctx.save();
          ctx.strokeStyle = spec.accentColor || '#e2e8f0';
          ctx.lineWidth = Math.max(1.5, screenSize * 0.08);
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
        // Raised 3D Silicon Die / Mold Cap on top of the green BGA interposer substrate
        const dieRoof = insetQuad(roofPts, 0.14, 0.14);
        ctx.save();
        ctx.beginPath();
        dieRoof.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // Gold Pin-1 corner triangle on BGA substrate
        const f1 = lerpPt(roofPts[0], roofPts[1], 0.14);
        const f3 = lerpPt(roofPts[0], roofPts[3], 0.14);
        ctx.beginPath();
        ctx.moveTo(roofPts[0].x, roofPts[0].y);
        ctx.lineTo(f1.x, f1.y);
        ctx.lineTo(f3.x, f3.y);
        ctx.closePath();
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.restore();
      } else if (spec.kind === 'inductor' && screenSize >= 12) {
        // Raised circular sintered ferrite drum core boss on power inductors
        const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
        const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
        const d01 = Math.hypot(roofPts[1].x - roofPts[0].x, roofPts[1].y - roofPts[0].y);
        const d12 = Math.hypot(roofPts[2].x - roofPts[1].x, roofPts[2].y - roofPts[1].y);
        const rBoss = Math.min(d01, d12) * 0.36;
        if (rBoss >= 3) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(rcx, rcy, rBoss, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(22, 26, 32, 0.78)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }
      } else if (spec.kind === 'connector' && screenSize >= 10) {
        // Recessed mating cavity + gold contact finger highlights
        const slotRoof = insetQuad(roofPts, 0.14, 0.24);
        ctx.save();
        ctx.beginPath();
        slotRoof.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 14, 19, 0.86)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
      } else if ((spec.kind === 'ic' || spec.kind === 'transistor') && part.pinStart < board.pins.length && screenSize >= 10) {
        // Concave Pin-1 dimple on IC / Transistor roof
        const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
        const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
        const sp1 = P(board.pins[part.pinStart], zRoof);
        const dimple = lerpPt({ x: rcx, y: rcy }, sp1, 0.52);
        ctx.save();
        ctx.beginPath();
        ctx.arc(dimple.x, dimple.y, Math.min(3.5, Math.max(1.5, screenSize * 0.06)), 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
        ctx.restore();
      }

      // Roof bevel stroke
      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
      ctx.lineWidth = selected ? 2.2 : focused ? 1.7 : 1;
      ctx.stroke();

      // 3D Component Silkscreen Label on the Roof Face (shown on ICs/Inductors/Connectors or when zoomed in / selected)
      if (layers.labels && (spec.showLabelAtAllZooms || screenSize >= 28 || selected || focused)) {
        const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
        const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
        const dx01 = roofPts[1].x - roofPts[0].x, dy01 = roofPts[1].y - roofPts[0].y;
        const dx12 = roofPts[2].x - roofPts[1].x, dy12 = roofPts[2].y - roofPts[1].y;
        const len01 = Math.hypot(dx01, dy01), len12 = Math.hypot(dx12, dy12);
        const longSide = Math.max(len01, len12), shortSide = Math.min(len01, len12);
        let angle = len01 >= len12 ? Math.atan2(dy01, dx01) : Math.atan2(dy12, dx12);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;

        const maxFontW = (longSide * 0.72) / Math.max(1, part.name.length * 0.6);
        const maxFontH = shortSide * 0.68;
        const fontPx = Math.min(12, Math.floor(Math.min(maxFontW, maxFontH)));

        if (fontPx >= 7.5 && shortSide >= 10) {
          ctx.save();
          ctx.translate(rcx, rcy);
          ctx.rotate(angle);
          ctx.font = `700 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.lineWidth = 2.4;
          ctx.strokeText(part.name, 0, 0);
          ctx.fillStyle = selected || focused ? '#fde047' : '#f8fafc';
          ctx.fillText(part.name, 0, 0);
          ctx.restore();
        } else if (selected || focused) {
          ctx.save();
          ctx.font = '700 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(part.name).width + 10;
          const th = 16;
          const topY = Math.min(roofPts[0].y, roofPts[1].y, roofPts[2].y, roofPts[3].y) - th - 6;
          ctx.fillStyle = palette.tooltipBg;
          ctx.strokeStyle = selected ? palette.selectionRing : palette.active;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.rect(rcx - tw / 2, topY, tw, th);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = palette.labelFocus;
          ctx.fillText(part.name, rcx, topY + th / 2 + 0.5);
          ctx.restore();
        }
      }

      ctx.restore();
    }

    // Draw X-Ray pin rings & active highlights on top of the 3D bodies
    drawPinsOnSurface(true);
  };

  // 3. Draw Far-Side -> 3D PCB Substrate -> Near-Side in true Z-order
  const farSide: 'top' | 'bottom' = topFacesCamera ? 'bottom' : 'top';
  const nearSide: 'top' | 'bottom' = topFacesCamera ? 'top' : 'bottom';

  drawSideComponentsAndPins(farSide);

  if (layers.outline && (board.outline.length > 1 || (board.outlineSegments && board.outlineSegments.length > 0))) {
    const zFar = topFacesCamera ? zBotSurface : zTopSurface;
    const zNear = topFacesCamera ? zTopSurface : zBotSurface;

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
      ctx.strokeStyle = 'rgba(161, 126, 60, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zNear);
    if (board.outline.length > 2) {
      ctx.fillStyle = isClassic
        ? 'rgba(16, 78, 52, 0.88)'
        : 'rgba(13, 35, 39, 0.9)';
      ctx.fill('evenodd');
    }
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  drawSideComponentsAndPins(nearSide);

  // 4. 3D Parabolic Net Airwire Arcs
  if (highlightNet && highlightNet !== 'UNCONNECTED' && highlightNet !== 'NC' && highlightNet !== 'GND' && highlightNet !== 'GROUND') {
    const info = activeNetInfo;
    if (info && info.pinIndices.length >= 2 && info.pinIndices.length <= 220) {
      const hubIdx = selection?.kind === 'pin' && board.pins[selection.index]?.net === highlightNet
        ? selection.index
        : (info.pinIndices.find((idx) => sideVisible(board.pins[idx].side, layers)) ?? info.pinIndices[0]);
      const hubPin = board.pins[hubIdx];
      const zHub = hubPin.side === 'bottom' ? zBotSurface : zTopSurface;
      const sHub = P(hubPin, zHub);

      ctx.save();
      ctx.strokeStyle = palette.netActive;
      ctx.lineWidth = 1.65;
      for (const idx of info.pinIndices) {
        if (idx === hubIdx) continue;
        const targetPin = board.pins[idx];
        const visible = sideVisible(targetPin.side, layers);
        const zTarget = targetPin.side === 'bottom' ? zBotSurface : zTopSurface;
        const sTarget = P(targetPin, zTarget);
        const distWorld = Math.hypot(targetPin.x - hubPin.x, targetPin.y - hubPin.y);
        const arcLift = Math.min(260, Math.max(45, distWorld * 0.18)) * (topFacesCamera ? 1 : -1);
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
      selPt = P(pin, pin.side === 'bottom' ? zBotSurface : zTopSurface);
    } else if (selection.kind === 'nail' && board.nails[selection.index]) {
      const nail = board.nails[selection.index];
      selPt = P(nail, nail.side === 'bottom' ? zBotSurface : zTopSurface);
    } else if (selection.kind === 'part' && board.parts[selection.index]?.box && !board.parts[selection.index]?.isDummy) {
      const part = board.parts[selection.index];
      const spec = classifyPartPackage(part);
      const b = part.box!;
      const zRoof = (part.side === 'bottom' ? zBotSurface : zTopSurface)
        + (part.side === 'bottom' ? -spec.heightMil : spec.heightMil);
      selPt = P({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, zRoof);
    }
    if (selPt) {
      ctx.save();
      ctx.strokeStyle = palette.selectionRing;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(selPt.x, selPt.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 6. 3D Orientation Compass Gizmo
  draw3DGizmo(ctx, w, rotation, cam, flipX, flipY, palette);

  void tr2d;
}

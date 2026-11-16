import type { Board, Layers, Part, Pin, Point, Selection, Side } from '../types';
import type { BoardIndex } from '../lib/search';
import type { Palette } from '../lib/theme';
import type { Transform, View } from '../lib/geometry';

export type RenderMode = 'cad' | 'realistic' | '3d';

export type PackageKind =
  | 'mlcc'
  | 'electrolytic'
  | 'resistor'
  | 'inductor'
  | 'diode'
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
    // Radial electrolytic / polymer aluminum capacitor can
    spec = {
      kind: 'electrolytic',
      heightMil: Math.min(155, Math.max(60, part.expanse * 0.52)),
      bodyTop: '#d8e0ea',
      bodySide: '#7e8c9c',
      bodyStroke: '#475569',
      accentColor: '#1e293b',
      hasEndCaps: false,
    };
  } else if (p0 === 'C' || (p0 === 'P' && p1 === 'C')) {
    // SMD Ceramic MLCC Capacitor (tan ceramic body + silver end-caps)
    spec = {
      kind: 'mlcc',
      heightMil: Math.min(48, Math.max(12, shortSide * 0.68)),
      bodyTop: '#c69255',
      bodySide: '#9a6b37',
      bodyStroke: '#6e4920',
      capColor: '#dde5ed',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
    };
  } else if (p0 === 'R' || (p0 === 'P' && p1 === 'R')) {
    // SMD Thick/Thin-Film Chip Resistor (coal-black glaze + alumina side + silver end-caps)
    spec = {
      kind: 'resistor',
      heightMil: Math.min(28, Math.max(9, shortSide * 0.42)),
      bodyTop: '#22272e',
      bodySide: '#aeb8c4',
      bodyStroke: '#4b5563',
      capColor: '#dce4ec',
      hasEndCaps: pinCount >= 2 && pinCount <= 4,
    };
  } else if (p0 === 'L' || (p0 === 'P' && p1 === 'L') || name.startsWith('FB') || name.startsWith('FL')) {
    // Power inductor / ferrite coil
    const isPowerCoil = longSide > 85;
    spec = {
      kind: 'inductor',
      heightMil: isPowerCoil
        ? Math.min(130, Math.max(45, shortSide * 0.62))
        : Math.min(44, Math.max(15, shortSide * 0.58)),
      bodyTop: isPowerCoil ? '#2f353d' : '#333b45',
      bodySide: '#1e2228',
      bodyStroke: '#525c68',
      capColor: '#cfd8e3',
      accentColor: '#434c59',
      hasEndCaps: !isPowerCoil && pinCount === 2,
    };
  } else if (p0 === 'D' || (p0 === 'P' && p1 === 'D') || name.startsWith('ZD') || name.startsWith('LED')) {
    // Diode / Zener / LED (dark molded body + silver/white cathode polarity band)
    const isLed = name.startsWith('LED');
    spec = {
      kind: 'diode',
      heightMil: Math.min(46, Math.max(15, shortSide * 0.52)),
      bodyTop: isLed ? '#f59e0b' : '#1e232a',
      bodySide: isLed ? '#b45309' : '#12161b',
      bodyStroke: '#475569',
      capColor: '#d8e0e8',
      accentColor: '#e2e8f0',
      hasEndCaps: pinCount === 2,
    };
  } else if (p0 === 'Q' || (p0 === 'P' && p1 === 'Q') || p0 === 'T') {
    // Transistor / MOSFET (SOT-23 / DFN / QFN power stage)
    spec = {
      kind: 'transistor',
      heightMil: Math.min(48, Math.max(18, shortSide * 0.48)),
      bodyTop: '#20252d',
      bodySide: '#13171d',
      bodyStroke: '#4b5563',
      capColor: '#cbd5e1',
      accentColor: '#94a3b8',
      hasEndCaps: false,
    };
  } else if (p0 === 'J' || name.startsWith('CN') || name.startsWith('CON') || name.startsWith('USB') || name.startsWith('HDMI')) {
    // Board-to-board / FPC / I/O Connector (metallic shield + LCP insulator + gold contacts)
    spec = {
      kind: 'connector',
      heightMil: Math.min(145, Math.max(52, shortSide * 0.52)),
      bodyTop: '#262b33',
      bodySide: '#64748b',
      bodyStroke: '#94a3b8',
      capColor: '#eab308',
      accentColor: '#cbd5e1',
      hasEndCaps: false,
    };
  } else if (p0 === 'Y' || p0 === 'X' || name.startsWith('XTAL') || name.startsWith('OSC')) {
    // Quartz Crystal / Oscillator (brushed metallic can with gold seal ring)
    spec = {
      kind: 'crystal',
      heightMil: Math.min(52, Math.max(22, shortSide * 0.5)),
      bodyTop: '#cbd5e1',
      bodySide: '#94a3b8',
      bodyStroke: '#ca8a04',
      accentColor: '#f8fafc',
      hasEndCaps: false,
    };
  } else if (p0 === 'F' && !name.startsWith('FB') && !name.startsWith('FL')) {
    // SMD Fuse (ceramic white body + gold end-caps)
    spec = {
      kind: 'fuse',
      heightMil: Math.min(38, Math.max(14, shortSide * 0.48)),
      bodyTop: '#e2e8f0',
      bodySide: '#94a3b8',
      bodyStroke: '#ca8a04',
      capColor: '#eab308',
      hasEndCaps: true,
    };
  } else if (p0 === 'U' || (p0 === 'P' && p1 === 'U') || name.startsWith('IC')) {
    // Integrated Circuit: distinguish BGA / CSP packages from QFN / SOIC packages
    const isBga = pinCount >= 20 && shortSide > 110;
    spec = {
      kind: isBga ? 'bga' : 'ic',
      heightMil: isBga
        ? Math.min(72, Math.max(32, Math.sqrt(longSide * shortSide) * 0.065))
        : Math.min(54, Math.max(22, shortSide * 0.36)),
      bodyTop: isBga ? '#19222b' : '#1e232b',
      bodySide: isBga ? '#14532d' : '#12161c',
      bodyStroke: isBga ? '#22c55e' : '#475569',
      accentColor: '#facc15',
      hasEndCaps: false,
    };
  } else {
    spec = {
      kind: 'generic',
      heightMil: Math.min(44, Math.max(16, shortSide * 0.45)),
      bodyTop: '#252b33',
      bodySide: '#171b21',
      bodyStroke: '#4b5563',
      hasEndCaps: false,
    };
  }

  PACKAGE_CACHE.set(part, spec);
  return spec;
}

/** 2D Realistic Component Package Renderer (with X-Ray translucency so BGA balls
 *  and pads remain visible and clickable inside the physical component package). */
export function drawRealistic2DPart(
  ctx: CanvasRenderingContext2D,
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
  if (dimmed) ctx.globalAlpha = 0.38;

  // 1. Soft drop shadow beneath physical component body
  if (maxDim >= 5) {
    ctx.save();
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x + 1.5, pt.y + 2) : ctx.lineTo(pt.x + 1.5, pt.y + 2)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fill();
    ctx.restore();
  }

  // 2. Electrolytic / Polymer Aluminum radial capacitor can
  if (spec.kind === 'electrolytic' && part.center && part.expanse) {
    // Baseplate
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.76)';
    ctx.fill();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#64748b';
    ctx.lineWidth = selected ? 2 : 1.1;
    ctx.stroke();

    const sc = S(part.center);
    const cr = Math.max(3, part.expanse * 0.36 * scale);
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, cr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Negative polarity crescent on the right arc
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, cr * 0.92, -Math.PI * 0.38, Math.PI * 0.38);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fill();
    ctx.restore();
    return;
  }

  // 3. BGA Package: green organic substrate rim + inner silicon die / mold cap
  if (spec.kind === 'bga') {
    ctx.beginPath();
    quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = selected || focused ? 'rgba(22, 101, 52, 0.62)' : 'rgba(20, 83, 45, 0.54)';
    ctx.fill();
    ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : '#22c55e';
    ctx.lineWidth = selected ? 2.2 : 1.3;
    ctx.stroke();

    // Inner silicon die / heatspreader mold cap (inset 18% toward center)
    if (minDim >= 14) {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const ix = cx + (quad[k].x - cx) * 0.74;
        const iy = cy + (quad[k].y - cy) * 0.74;
        if (k === 0) ctx.moveTo(ix, iy);
        else ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(17, 24, 39, 0.64)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Gold corner fiducial at quad[0]
      const f0 = quad[0];
      const f1 = { x: f0.x + (quad[1].x - f0.x) * 0.12, y: f0.y + (quad[1].y - f0.y) * 0.12 };
      const f3 = { x: f0.x + (quad[3].x - f0.x) * 0.12, y: f0.y + (quad[3].y - f0.y) * 0.12 };
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.lineTo(f3.x, f3.y);
      ctx.closePath();
      ctx.fillStyle = '#facc15';
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // 4. Standard SMD / IC / Inductor / Connector / Passive body (X-Ray translucent so pins shine through)
  ctx.beginPath();
  quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.save();
  ctx.globalAlpha *= 0.76;
  ctx.fillStyle = spec.bodyTop;
  ctx.fill();
  ctx.restore();

  // Metallic silver/gold end-caps on 2-terminal passives (MLCC Capacitors, Resistors, Fuses, Small Coils)
  if (spec.hasEndCaps && spec.capColor && maxDim >= 6) {
    // In finalizeBoard, 2-pin passives orient edges (0->1) and (2->3) perpendicular to the pin axis,
    // or determine the longer edge pair automatically.
    const capFrac = 0.22;
    ctx.save();
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = spec.capColor;

    if (len12 >= len01) {
      // Long axis is 1->2 (and 0->3); end-caps sit along 0->1 and 3->2
      const a1 = { x: quad[0].x + (quad[3].x - quad[0].x) * capFrac, y: quad[0].y + (quad[3].y - quad[0].y) * capFrac };
      const a2 = { x: quad[1].x + (quad[2].x - quad[1].x) * capFrac, y: quad[1].y + (quad[2].y - quad[1].y) * capFrac };
      const b1 = { x: quad[3].x + (quad[0].x - quad[3].x) * capFrac, y: quad[3].y + (quad[0].y - quad[3].y) * capFrac };
      const b2 = { x: quad[2].x + (quad[1].x - quad[2].x) * capFrac, y: quad[2].y + (quad[1].y - quad[2].y) * capFrac };

      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      ctx.lineTo(quad[1].x, quad[1].y);
      ctx.lineTo(a2.x, a2.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.closePath();
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(quad[2].x, quad[2].y);
      ctx.lineTo(quad[3].x, quad[3].y);
      ctx.closePath();
      ctx.fill();
    } else {
      // Long axis is 0->1 (and 3->2); end-caps sit along 0->3 and 1->2
      const a1 = { x: quad[0].x + (quad[1].x - quad[0].x) * capFrac, y: quad[0].y + (quad[1].y - quad[0].y) * capFrac };
      const a2 = { x: quad[3].x + (quad[2].x - quad[3].x) * capFrac, y: quad[3].y + (quad[2].y - quad[3].y) * capFrac };
      const b1 = { x: quad[1].x + (quad[0].x - quad[1].x) * capFrac, y: quad[1].y + (quad[0].y - quad[1].y) * capFrac };
      const b2 = { x: quad[2].x + (quad[3].x - quad[2].x) * capFrac, y: quad[2].y + (quad[3].y - quad[2].y) * capFrac };

      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      ctx.lineTo(a1.x, a1.y);
      ctx.lineTo(a2.x, a2.y);
      ctx.lineTo(quad[3].x, quad[3].y);
      ctx.closePath();
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(quad[1].x, quad[1].y);
      ctx.lineTo(quad[2].x, quad[2].y);
      ctx.lineTo(b2.x, b2.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Diode cathode band near Pin 1 end
  if (spec.kind === 'diode' && maxDim >= 8) {
    ctx.save();
    ctx.strokeStyle = spec.accentColor || '#e2e8f0';
    ctx.lineWidth = Math.max(1.5, minDim * 0.18);
    const k0 = { x: quad[0].x + (quad[3].x - quad[0].x) * 0.24, y: quad[0].y + (quad[3].y - quad[0].y) * 0.24 };
    const k1 = { x: quad[1].x + (quad[2].x - quad[1].x) * 0.24, y: quad[1].y + (quad[2].y - quad[1].y) * 0.24 };
    ctx.beginPath();
    ctx.moveTo(k0.x, k0.y);
    ctx.lineTo(k1.x, k1.y);
    ctx.stroke();
    ctx.restore();
  }

  // Power inductor central magnetic core ring
  if (spec.kind === 'inductor' && minDim >= 14) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.34, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  // Connector inner cavity & metallic shield rim
  if (spec.kind === 'connector' && minDim >= 10) {
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const ix = cx + (quad[k].x - cx) * 0.82;
      const iy = cy + (quad[k].y - cy) * 0.82;
      if (k === 0) ctx.moveTo(ix, iy);
      else ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  // Outer package bevel stroke
  ctx.beginPath();
  quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active
    : (part.side === 'bottom' ? palette.partStrokeBottom : spec.bodyStroke);
  ctx.lineWidth = selected ? 2.1 : focused ? 1.6 : 1.05;
  ctx.stroke();

  ctx.restore();
}

/* ============================================================================
 * 3D PERSPECTIVE CAMERA & EXTRUDED 3D BOARD RENDERER
 * ========================================================================== */

export interface Camera3D {
  pitchDeg: number; // Tilt angle: 0° = top-down, 52° = default 3D oblique
  yawDeg: number;   // Turntable spin around Z axis
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
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
  camDir: Point3D;
}

/** Creates a 3D perspective projector that composes seamlessly with the existing
 *  2D zoom/pan/flip/rotation state, plus 3D pitch (tilt) and yaw (turntable spin). */
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

  const fov = Math.max(width, height) * 1.65;

  const project3D = (p: Point, z = 0): ProjectedPoint => {
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    let dz = z;
    if (flipX) dx = -dx;
    if (flipY) {
      dy = -dy;
      dz = -dz;
    }

    // Rotate in board X-Y plane by (rotation + yaw), scaled to screen pixels
    const rx = (dx * cosR - dy * sinR) * view.scale;
    const ry = (dx * sinR + dy * cosR) * view.scale;
    const rz = dz * view.scale;

    // Tilt around screen X axis by pitch
    const yTilt = ry * cosP - rz * sinP;
    const zDepth = ry * sinP + rz * cosP;

    const denom = Math.max(220, fov + zDepth * 0.55);
    const persp = fov / denom;

    return {
      x: width / 2 + view.panX + rx * persp,
      y: height / 2 + view.panY + yTilt * persp,
      depth: zDepth,
      persp,
    };
  };

  // Exact ray-plane intersection against z = zPlane for accurate 3D pin & component clicking
  const unprojectToPlane = (sx: number, sy: number, zPlane = 0): Point => {
    let dz = zPlane;
    if (flipY) dz = -dz;
    const rz = dz * view.scale;

    // Solve perspective & tilt for ry:
    // u = sx - width/2 - panX = rx * fov / (fov + 0.55 * (ry * sinP + rz * cosP))
    // v = sy - height/2 - panY = (ry * cosP - rz * sinP) * fov / (fov + 0.55 * (ry * sinP + rz * cosP))
    const u = sx - width / 2 - view.panX;
    const v = sy - height / 2 - view.panY;

    // From v * (fov + 0.55 * ry * sinP + 0.55 * rz * cosP) = fov * ry * cosP - fov * rz * sinP:
    // ry * (fov * cosP - 0.55 * v * sinP) = v * (fov + 0.55 * rz * cosP) + fov * rz * sinP
    const ryDenom = fov * cosP - 0.55 * v * sinP;
    const ry = Math.abs(ryDenom) > 1e-4
      ? (v * (fov + 0.55 * rz * cosP) + fov * rz * sinP) / ryDenom
      : v / Math.max(0.2, cosP);

    const zDepth = ry * sinP + rz * cosP;
    const persp = fov / Math.max(220, fov + zDepth * 0.55);
    const rx = u / Math.max(0.05, persp);

    const dxScaled = rx / view.scale;
    const dyScaled = ry / view.scale;
    let ux = dxScaled * cosR + dyScaled * sinR;
    let uy = -dxScaled * sinR + dyScaled * cosR;
    if (flipX) ux = -ux;
    if (flipY) uy = -uy;
    return { x: ux + center.x, y: uy + center.y };
  };

  return {
    project3D,
    unprojectToPlane,
    camDir: { x: 0, y: sinP, z: cosP },
  };
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
  const topCorner = P({ x: board.bounds.minX, y: board.bounds.minY }, zTopSurface);
  const botCorner = P({ x: board.bounds.minX, y: board.bounds.minY }, zBotSurface);
  const topFacesCamera = topCorner.depth <= botCorner.depth;

  // 1. 3D Reference Grid on z = 0 midplane
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
    if (layers.pins) {
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

        if (r >= 11 || ((isSelected || isPartSelected || isSameNet) && r >= 7.5)) {
          labeled.push(p3);
        }
      }

      const drawPadBucket = (arr: Pin3D[], fillCol: string, strokeCol: string, alpha: number) => {
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
        ctx.lineWidth = Math.min(1.5, Math.max(0.8, arr[0].r * 0.22));
        ctx.globalAlpha = Math.min(1, (alpha + 0.35) * dim);
        ctx.stroke();
        ctx.restore();
      };

      // Gold ENIG / HASL metallic solder pads on the 3D PCB surface
      drawPadBucket(buckets.nc, '#475569', '#64748b', 0.42);
      drawPadBucket(buckets.gnd, '#64748b', '#94a3b8', 0.58);
      drawPadBucket(
        buckets.normal,
        side === 'top' ? '#d4af37' : '#60a5fa',
        side === 'top' ? palette.top : palette.bottom,
        0.68,
      );
      drawPadBucket(buckets.testPad, '#facc15', '#fef08a', 0.85);
      drawPadBucket(buckets.pin1, palette.pinA1, '#ffffff', 0.85);

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

      const polyWorld = part.outline && part.outline.length >= 4
        ? part.outline
        : [
            { x: part.box.minX, y: part.box.minY },
            { x: part.box.maxX, y: part.box.minY },
            { x: part.box.maxX, y: part.box.maxY },
            { x: part.box.minX, y: part.box.maxY },
          ];

      const spec = classifyPartPackage(part);
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

    // Sort from furthest (highest depth) to closest (lowest depth)
    items.sort((a, b) => b.depth - a.depth);

    // 2c. Render each 3D extruded component prism
    for (const item of items) {
      const { part, spec, polyWorld, basePts, roofPts, selected, focused, highlighted, screenSize } = item;

      ctx.save();
      if (hasFilter && !highlighted) ctx.globalAlpha = 0.36;

      // X-Ray translucency: roof & walls are semi-translucent so BGA balls and pads on zBase stay visible!
      const xrayAlpha = selected || focused ? 0.84 : spec.kind === 'bga' ? 0.62 : 0.76;

      // Draw the 4 extruded side walls (sorted by wall midpoint depth so back walls draw before front walls)
      if (screenSize >= 3.5) {
        const walls = [0, 1, 2, 3].map((k) => {
          const next = (k + 1) % 4;
          const wallDepth = (basePts[k].depth + basePts[next].depth + roofPts[k].depth + roofPts[next].depth) * 0.25;
          // Check if wall is an end-cap wall on 2-pin passives
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
          // Shade walls based on orientation for crisp 3D depth cues
          const isEndWall = spec.hasEndCaps && (k % 2 === 0);
          ctx.fillStyle = isEndWall && spec.capColor ? spec.capColor : spec.bodySide;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)';
          ctx.lineWidth = 0.75;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw the 3D Roof Face (at z = zRoof)
      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();

      ctx.save();
      ctx.globalAlpha *= xrayAlpha;
      ctx.fillStyle = spec.bodyTop;
      ctx.fill();
      ctx.restore();

      // Metallic silver/gold end-caps on the 3D roof face for MLCC Capacitors, Resistors & Fuses
      if (spec.hasEndCaps && spec.capColor && screenSize >= 6) {
        const d01 = Math.hypot(roofPts[1].x - roofPts[0].x, roofPts[1].y - roofPts[0].y);
        const d12 = Math.hypot(roofPts[2].x - roofPts[1].x, roofPts[2].y - roofPts[1].y);
        const capFrac = 0.23;
        ctx.save();
        ctx.globalAlpha *= xrayAlpha * 0.95;
        ctx.fillStyle = spec.capColor;

        if (d12 >= d01) {
          const a1 = { x: roofPts[0].x + (roofPts[3].x - roofPts[0].x) * capFrac, y: roofPts[0].y + (roofPts[3].y - roofPts[0].y) * capFrac };
          const a2 = { x: roofPts[1].x + (roofPts[2].x - roofPts[1].x) * capFrac, y: roofPts[1].y + (roofPts[2].y - roofPts[1].y) * capFrac };
          const b1 = { x: roofPts[3].x + (roofPts[0].x - roofPts[3].x) * capFrac, y: roofPts[3].y + (roofPts[0].y - roofPts[3].y) * capFrac };
          const b2 = { x: roofPts[2].x + (roofPts[1].x - roofPts[2].x) * capFrac, y: roofPts[2].y + (roofPts[1].y - roofPts[2].y) * capFrac };
          ctx.beginPath();
          ctx.moveTo(roofPts[0].x, roofPts[0].y); ctx.lineTo(roofPts[1].x, roofPts[1].y);
          ctx.lineTo(a2.x, a2.y); ctx.lineTo(a1.x, a1.y); ctx.closePath();
          ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
          ctx.lineTo(roofPts[2].x, roofPts[2].y); ctx.lineTo(roofPts[3].x, roofPts[3].y); ctx.closePath();
          ctx.fill();
        } else {
          const a1 = { x: roofPts[0].x + (roofPts[1].x - roofPts[0].x) * capFrac, y: roofPts[0].y + (roofPts[1].y - roofPts[0].y) * capFrac };
          const a2 = { x: roofPts[3].x + (roofPts[2].x - roofPts[3].x) * capFrac, y: roofPts[3].y + (roofPts[2].y - roofPts[3].y) * capFrac };
          const b1 = { x: roofPts[1].x + (roofPts[0].x - roofPts[1].x) * capFrac, y: roofPts[1].y + (roofPts[0].y - roofPts[1].y) * capFrac };
          const b2 = { x: roofPts[2].x + (roofPts[3].x - roofPts[2].x) * capFrac, y: roofPts[2].y + (roofPts[3].y - roofPts[2].y) * capFrac };
          ctx.beginPath();
          ctx.moveTo(roofPts[0].x, roofPts[0].y); ctx.lineTo(a1.x, a1.y);
          ctx.lineTo(a2.x, a2.y); ctx.lineTo(roofPts[3].x, roofPts[3].y); ctx.closePath();
          ctx.moveTo(b1.x, b1.y); ctx.lineTo(roofPts[1].x, roofPts[1].y);
          ctx.lineTo(roofPts[2].x, roofPts[2].y); ctx.lineTo(b2.x, b2.y); ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // BGA 3D inner silicon die / mold cap on roof
      if (spec.kind === 'bga' && screenSize >= 14) {
        const rcx = (roofPts[0].x + roofPts[1].x + roofPts[2].x + roofPts[3].x) * 0.25;
        const rcy = (roofPts[0].y + roofPts[1].y + roofPts[2].y + roofPts[3].y) * 0.25;
        ctx.save();
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const ix = rcx + (roofPts[k].x - rcx) * 0.74;
          const iy = rcy + (roofPts[k].y - rcy) * 0.74;
          if (k === 0) ctx.moveTo(ix, iy);
          else ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // Electrolytic 3D cylindrical cap dome
      if (spec.kind === 'electrolytic' && part.center && part.expanse && screenSize >= 8) {
        const zRoof = zBase + zSign * spec.heightMil;
        const cTop = P(part.center, zRoof);
        const cr = Math.max(3, part.expanse * 0.35 * view.scale * cTop.persp);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cTop.x, cTop.y, cr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // Roof highlight rim
      ctx.beginPath();
      roofPts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active : spec.bodyStroke;
      ctx.lineWidth = selected ? 2.2 : focused ? 1.7 : 1;
      ctx.stroke();

      // 3D Component Silkscreen Label on the Roof Face
      if (layers.labels && (screenSize >= 18 || selected || focused)) {
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

      // Keep polyWorld referenced for lint cleanliness
      void polyWorld;
      ctx.restore();
    }
  };

  // 3. Draw the 3D PCB Substrate + Far-Side Components + Near-Side Components in true 3D Z-order
  const farSide: 'top' | 'bottom' = topFacesCamera ? 'bottom' : 'top';
  const nearSide: 'top' | 'bottom' = topFacesCamera ? 'top' : 'bottom';

  // 3a. Far-side components first (underneath the board when both sides are enabled)
  drawSideComponentsAndPins(farSide);

  // 3b. Extruded 3D PCB Substrate (FR-4 edge wall + Solder Mask surfaces)
  if (layers.outline && (board.outline.length > 1 || (board.outlineSegments && board.outlineSegments.length > 0))) {
    const zFar = topFacesCamera ? zBotSurface : zTopSurface;
    const zNear = topFacesCamera ? zTopSurface : zBotSurface;

    // Far PCB face + FR-4 fiberglass edge rim
    ctx.save();
    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zFar);
    ctx.strokeStyle = '#927238'; // FR-4 fiberglass edge tone
    ctx.lineWidth = Math.max(2, 4.2 * view.scale);
    ctx.stroke();

    // Connect outer perimeter corners between zFar and zNear for thick 3D board edge
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

    // Near PCB Solder-Mask Surface
    ctx.beginPath();
    traceMultiContour3D(ctx, board.outline, board.outlineSegments, P, zNear);
    if (board.outline.length > 2) {
      ctx.fillStyle = isClassic
        ? 'rgba(16, 78, 52, 0.86)'  // Classic emerald PCB solder mask in 3D
        : 'rgba(13, 35, 39, 0.88)'; // Dark stealth teal-charcoal PCB solder mask
      ctx.fill('evenodd');
    }
    ctx.strokeStyle = '#d4af37'; // Gold edge routing / copper bevel
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  // 3c. Near-side components & pins on top of the PCB surface
  drawSideComponentsAndPins(nearSide);

  // 4. 3D Parabolic Net Airwire Arcs (DrawNetWeb in 3D space!)
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

  void tr2d;
}

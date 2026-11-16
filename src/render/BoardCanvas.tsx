import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { Board, Layers, Part, Point, Selection, Side } from '../types';
import type { BoardIndex } from '../lib/search';
import type { Palette } from '../lib/theme';
import { fitView, focusBounds, makeTransform, pointInPolygon, zoomAt, type View } from '../lib/geometry';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import {
  classifyPartPackage,
  drawRealistic2DPart,
  getSideZ,
  makeProjector3D,
  orbitAroundPivot,
  renderBoard3D,
  zoomAt3D,
  type Camera3D,
  type RenderMode,
} from './realistic3d';

export interface BoardCanvasHandle {
  zoomBy: (factor: number) => void;
  setDragMode3d: (mode: 'orbit' | 'pan') => void;
  applyCam3D: (next: Camera3D | ((cur: Camera3D) => Camera3D)) => void;
}

function sideVisible(side: Side, layers: Layers): boolean {
  if (side === 'top') return layers.top;
  if (side === 'bottom') return layers.bottom;
  return layers.top || layers.bottom;
}

function partPoly(part: Part): Point[] | null {
  if (part.outline && part.outline.length >= 3) return part.outline;
  if (!part.box) return null;
  const { minX, minY, maxX, maxY } = part.box;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function hitTestPart(part: Part, world: Point, layers: Layers): boolean {
  if (part.isDummy || !part.box || !sideVisible(part.side, layers)) return false;
  if (part.outline && part.outline.length >= 3) {
    return pointInPolygon(world, part.outline);
  }
  return (
    world.x >= part.box.minX && world.x <= part.box.maxX
    && world.y >= part.box.minY && world.y <= part.box.maxY
  );
}

interface Hover {
  sx: number;
  sy: number;
  title: string;
  lines: string[];
}

interface Props {
  board: Board | null;
  index: BoardIndex | null;
  layers: Layers;
  view: View;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  renderMode: RenderMode;
  selection: Selection | null;
  highlightNet: string | null;
  focusParts: Set<number>;
  onView: (v: View) => void;
  onSelect: (s: Selection | null) => void;
  onCursor: (p: Point | null) => void;
  onFit: () => void;
  onRotate: (delta: number) => void;
  onFlip: () => void;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onDemo?: () => void;
  isClassicTheme?: boolean;
  fitToken: number;
  focusToken: number;
  centerSelectToken: number;
  palette: Palette;
  onCamStateChange?: (cam: Camera3D, dragMode: 'orbit' | 'pan') => void;
}

function gridStep(scale: number): number {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  return steps.find((s) => s * scale >= 70) ?? 25000;
}

/** Shared high-contrast scale bar that avoids bottom mobile touch docks on narrow viewports. */
function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  viewScale: number,
  renderMode: RenderMode,
  cam3d: Camera3D,
  palette: Palette,
  isClassicTheme?: boolean,
) {
  const isCompactStage = !isClassicTheme && w < 780;
  const x = isCompactStage ? 14 : 18;
  // In Studio theme, keep the bottom center clear for the floating CanvasDock by placing the scale bar top-left.
  const barY = isClassicTheme ? h - 18 : (isCompactStage ? 74 : 36);
  const labelY = isClassicTheme ? h - 28 : (isCompactStage ? 64 : 26);
  const barMils = [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000].find((v) => v * viewScale >= 60) ?? 10000;
  const barPx = Math.min(isCompactStage ? 120 : 165, barMils * viewScale);
  const isLight = palette.isLightCanvas;

  ctx.save();
  ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.85)' : 'rgba(13,16,21,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, barY); ctx.lineTo(x + barPx, barY);
  ctx.moveTo(x, barY - 4); ctx.lineTo(x, barY + 4);
  ctx.moveTo(x + barPx, barY - 4); ctx.lineTo(x + barPx, barY + 4);
  ctx.stroke();

  ctx.strokeStyle = palette.scaleText;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '600 10.5px "Inter Variable", Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  const label = renderMode === '3d'
    ? `3D ${Math.round(cam3d.pitchDeg)}°/${Math.round(cam3d.yawDeg)}° | ${barMils} mil (${(barMils * 0.0254).toFixed(2)} mm)`
    : `${barMils} mil / ${(barMils * 0.0254).toFixed(2)} mm`;
  if (isLight) {
    ctx.strokeStyle = 'rgba(248,249,251,0.92)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, x, labelY);
  } else {
    ctx.strokeStyle = 'rgba(13,16,21,0.88)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, x, labelY);
  }
  ctx.fillStyle = palette.scaleText;
  ctx.fillText(label, x, labelY);
  ctx.restore();
}

export const BoardCanvas = forwardRef<BoardCanvasHandle, Props>(function BoardCanvas(props, ref) {
  const { board, index, layers, view, flipX, flipY, rotation, renderMode, selection, highlightNet, focusParts,
    onView, onSelect, onCursor, onFit, onRotate, onFlip, onOpenFile, onOpenFolder, onDemo, isClassicTheme,
    fitToken, focusToken, centerSelectToken, palette, onCamStateChange } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    pitchDeg: number;
    yawDeg: number;
    pivotWorld: Point;
    orbiting: boolean;
    moved: boolean;
  } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [cam3d, setCam3d] = useState<Camera3D>({ pitchDeg: 48, yawDeg: -16 });
  const cam3dRef = useRef(cam3d);
  cam3dRef.current = cam3d;
  const [dragMode3d, setDragMode3d] = useState<'orbit' | 'pan'>('orbit');

  const bothSidesActive = layers.top && layers.bottom;
  const singleSideMode = !bothSidesActive && (layers.top || layers.bottom);
  const flipZ = bothSidesActive && flipY;

  const clampPitch = useCallback(
    (deg: number) => (singleSideMode ? Math.max(-82, Math.min(82, deg)) : Math.max(-175, Math.min(175, deg))),
    [singleSideMode],
  );

  useEffect(() => {
    onCamStateChange?.(cam3d, dragMode3d);
  }, [cam3d, dragMode3d, onCamStateChange]);

  // If user switches to single-side mode while tilted underneath (>85°), smoothly bring camera back to front face
  useEffect(() => {
    if (!singleSideMode) return;
    setCam3d((cur) => {
      if (Math.abs(cur.pitchDeg) <= 82) return cur;
      const mirrored = cur.pitchDeg > 0 ? 180 - cur.pitchDeg : -180 - cur.pitchDeg;
      return { ...cur, pitchDeg: Math.max(-82, Math.min(82, mirrored)) };
    });
  }, [singleSideMode]);

  // --- touch state -----------------------------------------------------------
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<{ view: View; dist: number; mx: number; my: number } | null>(null);
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  const lastPointerType = useRef<string>('mouse');
  const gestureHadPinch = useRef(false);
  const [magnifying, setMagnifying] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const tr = useMemo(
    () => (board && size.w && size.h ? makeTransform(board, size.w, size.h, view, flipX, flipY, rotation) : null),
    [board, size.w, size.h, view, flipX, flipY, rotation],
  );

  const effectiveCam = useMemo<Camera3D>(
    () => (renderMode === '3d' ? cam3d : { pitchDeg: 0, yawDeg: 0 }),
    [renderMode, cam3d],
  );

  const proj3d = useMemo(
    () => (board && size.w && size.h && (renderMode === '3d' || renderMode === 'realistic')
      ? makeProjector3D(board, size.w, size.h, view, flipX, flipY, rotation, effectiveCam, flipZ)
      : null),
    [board, size.w, size.h, view, flipX, flipY, rotation, renderMode, effectiveCam, flipZ],
  );

  // Pivots the 3D camera around whatever world point is currently at the center of the viewport!
  const applyCam3D = useCallback((nextOrFn: Camera3D | ((cur: Camera3D) => Camera3D)) => {
    const cur = cam3dRef.current;
    const rawNext = typeof nextOrFn === 'function' ? nextOrFn(cur) : nextOrFn;
    const nextCam: Camera3D = { ...rawNext, pitchDeg: clampPitch(rawNext.pitchDeg) };
    setCam3d(nextCam);
    if (board && size.w && size.h) {
      const curView = viewRef.current;
      const curProj = makeProjector3D(board, size.w, size.h, curView, flipX, flipY, rotation, cur, flipZ);
      const pivot = curProj.unprojectToPlane(size.w / 2, size.h / 2, 0);
      const { panX, panY } = orbitAroundPivot(pivot, curView.scale, board, flipX, flipY, rotation, nextCam);
      onView({ ...curView, panX, panY });
    }
  }, [board, size.w, size.h, flipX, flipY, flipZ, rotation, clampPitch, onView]);

  // Refs keep the fit / focus effects stable: they fire only when App increments their tokens.
  const onViewRef = useRef(onView); onViewRef.current = onView;
  const boardRef = useRef(board); boardRef.current = board;
  const sizeRef = useRef(size); sizeRef.current = size;
  const viewRef = useRef(view); viewRef.current = view;
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const highlightNetRef = useRef(highlightNet); highlightNetRef.current = highlightNet;
  const indexRef = useRef(index); indexRef.current = index;
  const renderModeRef = useRef(renderMode); renderModeRef.current = renderMode;
  const orientRef = useRef({ flipX, flipY, rotation }); orientRef.current = { flipX, flipY, rotation };
  const lastFitToken = useRef(0);
  const lastFocusToken = useRef(0);

  useEffect(() => {
    if (fitToken === 0) {
      lastFitToken.current = 0;
      return;
    }
    if (fitToken === lastFitToken.current || !boardRef.current || !sizeRef.current.w) return;
    lastFitToken.current = fitToken;
    onViewRef.current(fitView(boardRef.current, sizeRef.current.w, sizeRef.current.h));
  }, [fitToken]);

  // OpenBoardView CenterZoomSearchResults / CenterZoomNet equivalent:
  useEffect(() => {
    if (focusToken <= 0) {
      lastFocusToken.current = 0;
      return;
    }
    if (focusToken === lastFocusToken.current || !boardRef.current || !sizeRef.current.w) return;
    lastFocusToken.current = focusToken;
    const b = boardRef.current;
    const { w, h } = sizeRef.current;
    const sel = selectionRef.current;
    const netName = highlightNetRef.current;
    const { flipX: fx, flipY: fy, rotation: rot } = orientRef.current;
    let box: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

    if (sel?.kind === 'part') {
      const part = b.parts[sel.index];
      if (part?.box) box = part.box;
    } else if (sel?.kind === 'pin') {
      const pin = b.pins[sel.index];
      if (pin) box = { minX: pin.x - 160, minY: pin.y - 160, maxX: pin.x + 160, maxY: pin.y + 160 };
    } else if (sel?.kind === 'nail') {
      const nail = b.nails[sel.index];
      if (nail) box = { minX: nail.x - 160, minY: nail.y - 160, maxX: nail.x + 160, maxY: nail.y + 160 };
    } else if (sel?.kind === 'net' && netName && indexRef.current) {
      const info = indexRef.current.nets.get(netName);
      if (info && info.pinIndices.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const idx of info.pinIndices) {
          const p = b.pins[idx];
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        if (Number.isFinite(minX)) box = { minX, minY, maxX, maxY };
      }
    }
    if (box) {
      const effRot = renderModeRef.current === '3d' ? rot + cam3dRef.current.yawDeg : rot;
      onViewRef.current(focusBounds(b, box, w, h, viewRef.current.scale, fx, fy, effRot));
    }
  }, [focusToken]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = size;

    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.8);
    bg.addColorStop(0, palette.bg);
    bg.addColorStop(1, palette.bgEdge);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (!board || !tr) {
      ctx.strokeStyle = palette.emptyDash;
      ctx.setLineDash([4, 8]);
      ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.setLineDash([]);
      return;
    }

    const isLight = palette.isLightCanvas;
    const isRealistic = renderMode === 'realistic';

    // --- 2D REALISTIC & 3D EXTRUDED BOARD RENDERER ----------------------------
    if ((renderMode === '3d' || renderMode === 'realistic') && proj3d) {
      renderBoard3D(
        ctx, board, index, layers, view, size, tr, proj3d,
        effectiveCam, flipX, flipY, rotation,
        selection, highlightNet, focusParts, palette, isLight,
        renderMode === '3d',
      );

      drawScaleBar(ctx, w, h, view.scale, renderMode, cam3d, palette, isClassicTheme);
      return;
    }

    // --- 2D CAD & 2D REALISTIC RENDERERS --------------------------------------
    const S = (p: Point) => tr.toScreen(p);
    const visible = [tr.toWorld(0, 0), tr.toWorld(w, 0), tr.toWorld(0, h), tr.toWorld(w, h)];
    const minX = Math.min(...visible.map((p) => p.x)), maxX = Math.max(...visible.map((p) => p.x));
    const minY = Math.min(...visible.map((p) => p.y)), maxY = Math.max(...visible.map((p) => p.y));

    // Engineering grid in world coordinates (rotates with the board).
    if (layers.grid) {
      const step = gridStep(view.scale);
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
        const a = S({ x, y: minY }), b = S({ x, y: maxY });
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
        const a = S({ x: minX, y }), b = S({ x: maxX, y });
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }

    // Multi-contour board outline (ported from OpenBoardView DrawOutlinePoints & DrawOutlineSegments).
    if (layers.outline && (board.outline.length > 1 || (board.outlineSegments && board.outlineSegments.length > 0))) {
      ctx.beginPath();
      if (board.outline.length > 1) {
        let fp = board.outline[0];
        const s0 = S(fp);
        ctx.moveTo(s0.x, s0.y);
        let jump = false;
        for (let i = 1; i < board.outline.length; i++) {
          const p = board.outline[i];
          const s = S(p);
          if (jump) {
            ctx.moveTo(s.x, s.y);
            fp = p;
            jump = false;
            continue;
          }
          ctx.lineTo(s.x, s.y);
          if (p.x === fp.x && p.y === fp.y && i < board.outline.length - 1) {
            jump = true;
          }
        }
      }
      if (board.outlineSegments && board.outlineSegments.length > 0) {
        for (const [a, b] of board.outlineSegments) {
          const sa = S(a), sb = S(b);
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
        }
      }
      if (board.outline.length > 2) {
        ctx.fillStyle = isRealistic
          ? (isLight ? 'rgba(18, 82, 54, 0.9)' : 'rgba(13, 36, 40, 0.9)')
          : palette.outlineFill;
        ctx.fill('evenodd');
      }
      ctx.strokeStyle = isRealistic ? '#d4af37' : palette.outlineStroke;
      ctx.lineWidth = isRealistic ? 2 : 1.6;
      ctx.stroke();
    }

    const activeNetInfo = highlightNet && index ? index.nets.get(highlightNet) : undefined;
    const hasFilter = Boolean(selection || (highlightNet && highlightNet !== 'UNCONNECTED') || focusParts.size > 0);

    // Net "ratsnest" lens (when enabled) + OpenBoardView DrawNetWeb active net airwires.
    if (index && (layers.top || layers.bottom)) {
      if (layers.nets) {
        let budget = 900;
        for (const [name, info] of index.nets) {
          if (!name || name === 'UNCONNECTED' || name === 'NC' || name === highlightNet || info.pinIndices.length < 2) continue;
          const visiblePins = info.pinIndices.filter((idx) => sideVisible(board.pins[idx].side, layers));
          if (visiblePins.length < 2 || budget <= 0 || visiblePins.length > 60) continue;
          const o = S(board.pins[visiblePins[0]]);
          ctx.strokeStyle = palette.netIdle;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          const take = Math.min(visiblePins.length, 12);
          for (let k = 1; k < take; k++) {
            const p = S(board.pins[visiblePins[k]]);
            ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          budget -= take;
        }
      }

      if (highlightNet && highlightNet !== 'UNCONNECTED' && highlightNet !== 'NC' && highlightNet !== 'GND' && highlightNet !== 'GROUND') {
        const info = activeNetInfo;
        if (info && info.pinIndices.length >= 2 && info.pinIndices.length <= 220) {
          const hubIdx = selection?.kind === 'pin' && board.pins[selection.index]?.net === highlightNet
            ? selection.index
            : (info.pinIndices.find((idx) => sideVisible(board.pins[idx].side, layers)) ?? info.pinIndices[0]);
          const o = S(board.pins[hubIdx]);

          ctx.strokeStyle = palette.netActive;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          for (const idx of info.pinIndices) {
            if (idx === hubIdx || !sideVisible(board.pins[idx].side, layers)) continue;
            const p = S(board.pins[idx]);
            ctx.moveTo(o.x, o.y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();

          const hiddenPins = info.pinIndices.filter((idx) => idx !== hubIdx && !sideVisible(board.pins[idx].side, layers));
          if (hiddenPins.length > 0 && hiddenPins.length <= 60) {
            ctx.save();
            ctx.strokeStyle = palette.netActive;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            for (const idx of hiddenPins) {
              const p = S(board.pins[idx]);
              ctx.moveTo(o.x, o.y);
              ctx.lineTo(p.x, p.y);
              ctx.moveTo(p.x + 4, p.y);
              ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            }
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    // Test nails / vias
    if (layers.nails) {
      const r = Math.max(0.85, Math.min(4.2, 6 * view.scale));
      ctx.beginPath();
      for (const nail of board.nails) {
        if (!sideVisible(nail.side, layers)) continue;
        const s = S(nail);
        if (s.x < -10 || s.x > w + 10 || s.y < -10 || s.y > h + 10) continue;
        ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y);
        ctx.closePath();
      }
      ctx.fillStyle = palette.nail;
      ctx.globalAlpha = hasFilter ? 0.45 : 0.78;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const drawPins2D = (baseSolderPass: boolean) => {
      if (!layers.pins) return;
      type PinBucket = 'top' | 'bottom' | 'both' | 'gnd' | 'nc' | 'testPad' | 'pin1';
      interface ScreenPin {
        idx: number;
        sx: number;
        sy: number;
        r: number;
        pin: typeof board.pins[number];
        isSelected: boolean;
        isPartSelected: boolean;
        isSameNet: boolean;
        isPin1: boolean;
        isNc: boolean;
      }
      const buckets: Record<PinBucket, ScreenPin[]> = {
        top: [], bottom: [], both: [], gnd: [], nc: [], testPad: [], pin1: [],
      };
      const highlightedPins: ScreenPin[] = [];
      const labeledPins: ScreenPin[] = [];

      for (let idx = 0; idx < board.pins.length; idx++) {
        const pin = board.pins[idx];
        if (!sideVisible(pin.side, layers)) continue;
        const s = S(pin);
        const r = Math.min(24, Math.max(0.8, pin.radius * view.scale * 0.85));
        if (s.x < -r - 4 || s.x > w + r + 4 || s.y < -r - 4 || s.y > h + r + 4) continue;

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

        const sp: ScreenPin = { idx, sx: s.x, sy: s.y, r, pin, isSelected, isPartSelected, isSameNet, isPin1, isNc };

        if (isSelected || isSameNet) {
          highlightedPins.push(sp);
        } else if (pin.isTestPad) {
          buckets.testPad.push(sp);
        } else if (isPin1) {
          buckets.pin1.push(sp);
        } else if (isNc) {
          buckets.nc.push(sp);
        } else if (isGnd) {
          buckets.gnd.push(sp);
        } else {
          buckets[pin.side].push(sp);
        }

        if (!baseSolderPass && (r >= 10 || ((isSelected || isPartSelected || isSameNet) && r >= 7))) {
          labeledPins.push(sp);
        }
      }

      if (baseSolderPass) {
        // Under-component gold/copper PCB solder pads in 2D Realistic mode
        const drawSolderPad = (arr: ScreenPin[], col: string, alpha: number) => {
          if (!arr.length) return;
          const dimFactor = hasFilter ? 0.45 : 1;
          ctx.beginPath();
          for (const sp of arr) {
            ctx.moveTo(sp.sx + sp.r * 1.05, sp.sy);
            ctx.arc(sp.sx, sp.sy, sp.r * 1.05, 0, Math.PI * 2);
          }
          ctx.fillStyle = col;
          ctx.globalAlpha = alpha * dimFactor;
          ctx.fill();
          ctx.globalAlpha = 1;
        };
        drawSolderPad(buckets.nc, '#475569', 0.45);
        drawSolderPad(buckets.gnd, '#64748b', 0.6);
        drawSolderPad(buckets.both, '#a855f7', 0.65);
        drawSolderPad(buckets.bottom, '#3b82f6', 0.72);
        drawSolderPad(buckets.top, '#d4af37', 0.78);
        drawSolderPad(buckets.testPad, '#eab308', 0.88);
        drawSolderPad(buckets.pin1, palette.pinA1, 0.85);
        return;
      }

      const drawBucket = (arr: ScreenPin[], strokeColor: string, fillAlpha: number, strokeAlpha: number) => {
        if (!arr.length) return;
        const dimFactor = hasFilter ? 0.42 : 1;
        ctx.beginPath();
        for (const sp of arr) {
          ctx.moveTo(sp.sx + sp.r, sp.sy);
          ctx.arc(sp.sx, sp.sy, sp.r, 0, Math.PI * 2);
        }
        ctx.fillStyle = isRealistic && strokeColor === palette.top ? '#d4af37' : strokeColor;
        ctx.globalAlpha = (isRealistic ? fillAlpha * 0.75 : fillAlpha) * dimFactor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.min(1.65, Math.max(0.85, arr[0].r * 0.25));
        ctx.globalAlpha = (isRealistic ? strokeAlpha * 0.78 : strokeAlpha) * dimFactor;
        ctx.stroke();
        ctx.globalAlpha = 1;
      };

      drawBucket(buckets.nc, palette.pinNc, 0.18, 0.65);
      drawBucket(buckets.gnd, palette.pinGround, 0.26, 0.82);
      drawBucket(buckets.both, palette.both, 0.28, 0.85);
      drawBucket(buckets.bottom, palette.bottom, 0.26, 0.92);
      drawBucket(buckets.top, palette.top, 0.26, 0.92);
      drawBucket(buckets.testPad, palette.pinTestPad, 0.48, 0.95);

      if (buckets.pin1.length) {
        const dimFactor = hasFilter ? 0.55 : 1;
        ctx.save();
        ctx.beginPath();
        for (const sp of buckets.pin1) {
          if (sp.r >= 2.8) {
            ctx.rect(sp.sx - sp.r, sp.sy - sp.r, sp.r * 2, sp.r * 2);
          } else {
            ctx.moveTo(sp.sx + sp.r, sp.sy);
            ctx.arc(sp.sx, sp.sy, sp.r, 0, Math.PI * 2);
          }
        }
        ctx.fillStyle = palette.pinA1;
        ctx.globalAlpha = 0.38 * dimFactor;
        ctx.fill();
        ctx.strokeStyle = palette.pinA1;
        ctx.lineWidth = Math.min(1.8, Math.max(1.0, buckets.pin1[0].r * 0.28));
        ctx.globalAlpha = 0.95 * dimFactor;
        ctx.stroke();
        ctx.restore();
      }

      if (highlightedPins.length) {
        ctx.save();
        for (const sp of highlightedPins) {
          const hr = Math.max(2.6, sp.r + (sp.isSelected ? 1.8 : 1.0));
          ctx.beginPath();
          if (sp.isPin1 && hr >= 3.2) {
            ctx.rect(sp.sx - hr, sp.sy - hr, hr * 2, hr * 2);
          } else {
            ctx.arc(sp.sx, sp.sy, hr, 0, Math.PI * 2);
          }
          ctx.fillStyle = sp.isSelected ? palette.pinSelected : palette.pinSameNet;
          ctx.globalAlpha = 0.92;
          ctx.fill();
          ctx.strokeStyle = palette.selectionRing;
          ctx.lineWidth = sp.isSelected ? 1.8 : 1.25;
          ctx.globalAlpha = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      if (labeledPins.length && labeledPins.length <= 650) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const sp of labeledPins) {
          const pinLabel = sp.pin.name || sp.pin.number || '';
          if (!pinLabel) continue;
          const showNet = sp.r >= 15 && !sp.isNc && sp.pin.net && sp.pin.net !== pinLabel;
          const maxChars = Math.max(2, pinLabel.length);
          const fontPx = Math.min(11, Math.max(6.5, (sp.r * 1.45) / Math.max(1.8, maxChars * 0.58)));
          if (fontPx < 6.5) continue;

          ctx.font = `700 ${fontPx.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.strokeStyle = palette.bg;
          ctx.lineWidth = 2.4;
          ctx.lineJoin = 'round';
          const yOffset = showNet ? -sp.r * 0.26 : 0;
          ctx.strokeText(pinLabel, sp.sx, sp.sy + yOffset);
          ctx.fillStyle = palette.pinText;
          ctx.fillText(pinLabel, sp.sx, sp.sy + yOffset);

          if (showNet) {
            const netStr = sp.pin.net.length > 9 ? `${sp.pin.net.slice(0, 8)}…` : sp.pin.net;
            const netPx = Math.min(9.5, Math.max(6, (sp.r * 1.35) / Math.max(2.2, netStr.length * 0.56)));
            ctx.font = `600 ${netPx.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            ctx.strokeText(netStr, sp.sx, sp.sy + sp.r * 0.32);
            ctx.fillStyle = palette.pinNetText;
            ctx.fillText(netStr, sp.sx, sp.sy + sp.r * 0.32);
          }
        }
        ctx.restore();
      }
    };

    // In Realistic 2D mode, draw base gold/copper PCB solder pads underneath component packages first!
    if (isRealistic) drawPins2D(true);

    // Component bodies
    interface PartShape {
      part: Part;
      i: number;
      quad: Point[];
      cx: number;
      cy: number;
      minSX: number;
      maxSX: number;
      minSY: number;
      maxSY: number;
      focused: boolean;
      selected: boolean;
    }
    const partShapes: PartShape[] = [];
    const selectedPinPart = selection?.kind === 'pin' ? board.pins[selection.index]?.part : 0;

    board.parts.forEach((part, i) => {
      if (part.isDummy || !part.box || !sideVisible(part.side, layers)) return;
      const poly = partPoly(part);
      if (!poly) return;
      const quad = poly.map(S);
      let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity;
      let cx = 0, cy = 0;
      for (const pt of quad) {
        if (pt.x < minSX) minSX = pt.x;
        if (pt.x > maxSX) maxSX = pt.x;
        if (pt.y < minSY) minSY = pt.y;
        if (pt.y > maxSY) maxSY = pt.y;
        cx += pt.x;
        cy += pt.y;
      }
      cx /= quad.length;
      cy /= quad.length;
      if (maxSX < -10 || minSX > w + 10 || maxSY < -10 || minSY > h + 10) return;

      const focused = focusParts.has(i);
      const selected = (selection?.kind === 'part' && selection.index === i) || selectedPinPart === i + 1;
      const onActiveNet = Boolean(activeNetInfo && activeNetInfo.partIds.has(i + 1));
      const highlighted = selected || focused || onActiveNet;

      if (isRealistic) {
        const spec = classifyPartPackage(part);
        drawRealistic2DPart(
          ctx, board, part, quad, cx, cy, spec, S, view.scale,
          selected, focused, hasFilter && !highlighted, palette,
        );
      } else {
        ctx.save();
        if (hasFilter && !highlighted) ctx.globalAlpha = 0.44;

        if (part.hull && part.hull.length >= 3 && (selected || focused)) {
          ctx.beginPath();
          part.hull.forEach((hp, idx) => {
            const s = S(hp);
            if (idx === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          });
          ctx.closePath();
          ctx.strokeStyle = palette.partHull;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        ctx.beginPath();
        quad.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = focused || selected ? palette.partFillFocus
          : (part.side === 'bottom' ? palette.partFillBottom : palette.partFill);
        ctx.fill();
        ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active
          : (part.side === 'bottom' ? palette.partStrokeBottom : palette.partStroke);
        ctx.lineWidth = selected ? 2 : focused ? 1.6 : 1.05;
        ctx.stroke();

        if (part.expanse && part.expanse > 90 && part.center) {
          const sc = S(part.center);
          const cr = part.expanse * 0.33 * view.scale;
          if (cr > 1.5) {
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, cr, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      partShapes.push({ part, i, quad, cx, cy, minSX, maxSX, minSY, maxSY, focused, selected });
    });

    // Draw X-Ray pin rings & labels on top so every BGA ball and pad stays visible & clickable
    drawPins2D(false);

    // Component labels
    if (layers.labels) {
      const isDenseBoard = board.parts.length > 40;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const { part, quad, cx, cy, minSY, focused, selected } of partShapes) {
        const dx01 = quad[1].x - quad[0].x, dy01 = quad[1].y - quad[0].y;
        const dx12 = quad[2].x - quad[1].x, dy12 = quad[2].y - quad[1].y;
        const len01 = Math.hypot(dx01, dy01);
        const len12 = Math.hypot(dx12, dy12);
        const longSide = Math.max(len01, len12);
        const shortSide = Math.min(len01, len12);
        const normAngle = (a: number) => {
          let r = a;
          while (r > Math.PI * 0.49) r -= Math.PI;
          while (r <= -Math.PI * 0.51) r += Math.PI;
          return r;
        };
        const ang01 = normAngle(Math.atan2(dy01, dx01));
        const ang12 = normAngle(Math.atan2(dy12, dx12));
        const angle = longSide <= shortSide * 1.18
          ? (Math.abs(ang01) <= Math.abs(ang12) ? ang01 : ang12)
          : (len01 >= len12 ? ang01 : ang12);

        const spec = isRealistic ? classifyPartPackage(part) : null;
        // On dense boards in Realistic mode, keep small passives' ceramic/resistive bodies clean until zoomed in (>= 26px)
        if (isDenseBoard && isRealistic && spec && !spec.showLabelAtAllZooms && !selected && !focused && longSide < 26) {
          continue;
        }

        const maxFontW = (longSide * 0.72) / Math.max(1, part.name.length * 0.6);
        const maxFontH = shortSide * 0.68;
        const fontPx = Math.min(12.5, Math.floor(Math.min(maxFontW, maxFontH)));
        const fitsInside = fontPx >= 7.5 && shortSide >= 10;

        if (fitsInside) {
          ctx.save();
          if (hasFilter && !selected && !focused && !(activeNetInfo && activeNetInfo.partIds.has(part.pinStart >= 0 ? board.pins[part.pinStart]?.part : -1))) {
            ctx.globalAlpha = 0.55;
          }
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.font = `700 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.strokeStyle = isRealistic ? 'rgba(0, 0, 0, 0.85)' : palette.bg;
          ctx.lineWidth = 2.8;
          ctx.lineJoin = 'round';
          ctx.strokeText(part.name, 0, 0);
          ctx.fillStyle = focused || selected ? palette.labelFocus
            : isRealistic ? '#f8fafc'
            : (part.side === 'bottom' ? palette.labelBottom : palette.label);
          ctx.fillText(part.name, 0, 0);
          ctx.restore();
        } else if (selected || focused) {
          ctx.save();
          ctx.font = '700 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          const tw = ctx.measureText(part.name).width + 10;
          const th = 16;
          const bx = cx - tw / 2;
          const by = minSY - th - 5;
          ctx.fillStyle = palette.tooltipBg;
          ctx.strokeStyle = selected ? palette.selectionRing : palette.active;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.rect(bx, by, tw, th);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = palette.labelFocus;
          ctx.fillText(part.name, cx, by + th / 2 + 0.5);
          ctx.restore();
        } else if (!isDenseBoard && longSide > 14 && view.scale > 0.025) {
          ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = part.side === 'bottom' ? palette.labelBottom : palette.label;
          ctx.fillText(part.name, cx, minSY - 6);
        }
      }
      ctx.textBaseline = 'alphabetic';
    }

    // Selection marker.
    if (selection) {
      let center: Point | null = null;
      if (selection.kind === 'pin' && board.pins[selection.index] && sideVisible(board.pins[selection.index].side, layers)) {
        center = S(board.pins[selection.index]);
      }
      if (selection.kind === 'nail' && board.nails[selection.index] && sideVisible(board.nails[selection.index].side, layers)) {
        center = S(board.nails[selection.index]);
      }
      if (selection.kind === 'part' && board.parts[selection.index]?.box && !board.parts[selection.index]?.isDummy && sideVisible(board.parts[selection.index].side, layers)) {
        const b = board.parts[selection.index].box!;
        center = S({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
      }
      if (center) {
        ctx.strokeStyle = palette.selectionRing;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(center.x, center.y, 13, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = palette.crosshair;
        ctx.beginPath();
        ctx.moveTo(center.x - 20, center.y); ctx.lineTo(center.x - 14, center.y);
        ctx.moveTo(center.x + 14, center.y); ctx.lineTo(center.x + 20, center.y);
        ctx.moveTo(center.x, center.y - 20); ctx.lineTo(center.x, center.y - 14);
        ctx.moveTo(center.x, center.y + 14); ctx.lineTo(center.x, center.y + 20);
        ctx.stroke();
      }
    }

    // Centre crosshair + scale bar.
    ctx.strokeStyle = palette.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.scaleText;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 8, h / 2); ctx.lineTo(w / 2 + 8, h / 2);
    ctx.moveTo(w / 2, h / 2 - 8); ctx.lineTo(w / 2, h / 2 + 8);
    ctx.stroke();

    drawScaleBar(ctx, w, h, view.scale, renderMode, cam3d, palette, isClassicTheme);
  }, [board, index, layers, view, size, tr, proj3d, effectiveCam, cam3d, renderMode, flipX, flipY, rotation, selection, highlightNet, focusParts, palette, isClassicTheme]);

  const localPoint = (e: ReactPointerEvent | ReactWheelEvent | ReactMouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Pin & test-nail hit testing (works seamlessly in both 2D and 3D modes, with generous touch hit area)
  const nearest = useCallback((sx: number, sy: number) => {
    if (!board || !tr) return null;
    const minTouchR = lastPointerType.current === 'touch' ? 19 : 12;

    if ((renderMode === '3d' || renderMode === 'realistic') && proj3d) {
      const best3d = { kind: 'pin' as 'pin' | 'nail', index: -1, d: Infinity };
      if (layers.pins) {
        board.pins.forEach((pin, i) => {
          if (!sideVisible(pin.side, layers)) return;
          const { zBase } = getSideZ(pin.side, layers);
          const sp = proj3d.project3D(pin, zBase);
          const hitPx = Math.max(minTouchR, pin.radius * view.scale * sp.persp * 1.15);
          const d = Math.hypot(sp.x - sx, sp.y - sy);
          if (d < hitPx && d < best3d.d) {
            best3d.kind = 'pin';
            best3d.index = i;
            best3d.d = d;
          }
        });
      }
      if (layers.nails) {
        board.nails.forEach((nail, i) => {
          if (!sideVisible(nail.side, layers)) return;
          const { zBase } = getSideZ(nail.side, layers);
          const sp = proj3d.project3D(nail, zBase);
          const d = Math.hypot(sp.x - sx, sp.y - sy);
          if (d < minTouchR && d < best3d.d) {
            best3d.kind = 'nail';
            best3d.index = i;
            best3d.d = d;
          }
        });
      }
      return best3d.index >= 0 ? best3d : null;
    }

    const world = tr.toWorld(sx, sy);
    const limit = (lastPointerType.current === 'touch' ? 20 : 14) / view.scale;
    const best = { kind: 'pin' as 'pin' | 'nail', index: -1, d: Infinity };
    if (layers.pins) {
      board.pins.forEach((pin, i) => {
        if (!sideVisible(pin.side, layers)) return;
        const hitR = Math.max(limit, pin.radius * 1.05);
        const d = Math.hypot(pin.x - world.x, pin.y - world.y);
        if (d < hitR && d < best.d) { best.kind = 'pin'; best.index = i; best.d = d; }
      });
    }
    if (layers.nails) {
      board.nails.forEach((nail, i) => {
        if (!sideVisible(nail.side, layers)) return;
        const d = Math.hypot(nail.x - world.x, nail.y - world.y);
        if (d < limit && d < best.d) { best.kind = 'nail'; best.index = i; best.d = d; }
      });
    }
    return best.index >= 0 ? best : null;
  }, [board, tr, proj3d, renderMode, view.scale, layers]);

  // Component polygon hit-testing in both 2D and 3D (checks roof, base, and extruded 3D side walls!)
  const findPartAtScreen = useCallback((sx: number, sy: number): number => {
    if (!board || !tr) return -1;
    if ((renderMode === '3d' || renderMode === 'realistic') && proj3d) {
      const screenPt: Point = { x: sx, y: sy };
      for (let i = 0; i < board.parts.length; i++) {
        const part = board.parts[i];
        if (part.isDummy || !part.box || !sideVisible(part.side, layers)) continue;
        const poly = partPoly(part);
        if (!poly) continue;
        const spec = classifyPartPackage(part);
        const { zBase, zSign } = getSideZ(part.side, layers);
        const zRoof = zBase + zSign * spec.heightMil;
        const roofQuad = poly.map((pt) => proj3d.project3D(pt, zRoof));
        const baseQuad = poly.map((pt) => proj3d.project3D(pt, zBase));
        if (pointInPolygon(screenPt, roofQuad) || pointInPolygon(screenPt, baseQuad)) {
          return i;
        }
        for (let k = 0; k < poly.length; k++) {
          const next = (k + 1) % poly.length;
          if (pointInPolygon(screenPt, [baseQuad[k], baseQuad[next], roofQuad[next], roofQuad[k]])) {
            return i;
          }
        }
      }
      return -1;
    }
    const world = tr.toWorld(sx, sy);
    return board.parts.findIndex((part) => hitTestPart(part, world, layers));
  }, [board, tr, proj3d, renderMode, layers]);

  // "E / Enter" selects whatever sits under the centre crosshair.
  const lastCenter = useRef(0);
  useEffect(() => {
    if (centerSelectToken === lastCenter.current) return;
    lastCenter.current = centerSelectToken;
    if (!board) return;
    const hit = nearest(size.w / 2, size.h / 2);
    if (hit) {
      onSelect({ kind: hit.kind, index: hit.index, key: `${hit.kind}:${hit.index}` });
      return;
    }
    const partIndex = findPartAtScreen(size.w / 2, size.h / 2);
    onSelect(partIndex >= 0 ? { kind: 'part', index: partIndex, key: `part:${partIndex}` } : null);
  }, [centerSelectToken, nearest, findPartAtScreen, board, onSelect, size.w, size.h]);

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    if (!board) return;
    const p = localPoint(e);
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    if (renderMode === '3d') {
      onView(zoomAt3D(view, factor, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation, cam3d, flipZ));
    } else {
      onView(zoomAt(view, factor, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation));
    }
  };

  const quick = useRef<{ view: View } | null>(null);

  const cancelLongPress = () => {
    if (longPress.current) { window.clearTimeout(longPress.current.timer); longPress.current = null; }
  };

  const endMagnifier = () => {
    if (quick.current) { onView(quick.current.view); quick.current = null; setMagnifying(false); }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    lastPointerType.current = e.pointerType;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 2) {
      cancelLongPress();
      drag.current = null;
      endMagnifier();
      setHover(null);
      gestureHadPinch.current = true;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { view, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.current.size > 2) return;

    // Right-click in 2D mode (or Alt+Right-click in 3D) activates the 3x temporary magnifier.
    // Plain right-drag or middle-drag in 3D mode performs the complementary camera action (Pan vs Orbit)!
    if (e.button === 2 && board && (renderMode !== '3d' || e.altKey)) {
      quick.current = { view };
      if (renderMode === '3d') {
        onView(zoomAt3D(view, 3, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation, cam3d, flipZ));
      } else {
        onView(zoomAt(view, 3, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation));
      }
      return;
    }

    if (e.pointerType === 'touch' && board) {
      longPress.current = {
        x: p.x, y: p.y,
        timer: window.setTimeout(() => {
          longPress.current = null;
          if (drag.current?.moved || pointers.current.size !== 1) return;
          drag.current = null;
          quick.current = { view };
          setMagnifying(true);
          if (renderMode === '3d') {
            onView(zoomAt3D(view, 3, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation, cam3d, flipZ));
          } else {
            onView(zoomAt(view, 3, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation));
          }
        }, 440),
      };
    }

    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    const invert3dAction = e.shiftKey || e.button === 1 || e.button === 2;
    const orbiting = renderMode === '3d' && (invert3dAction ? dragMode3d !== 'orbit' : dragMode3d === 'orbit');
    const pivotWorld = proj3d
      ? proj3d.unprojectToPlane(size.w / 2, size.h / 2, 0)
      : { x: ((board?.bounds.minX ?? 0) + (board?.bounds.maxX ?? 0)) / 2, y: ((board?.bounds.minY ?? 0) + (board?.bounds.maxY ?? 0)) / 2 };

    drag.current = {
      x: e.clientX,
      y: e.clientY,
      panX: view.panX,
      panY: view.panY,
      pitchDeg: cam3d.pitchDeg,
      yawDeg: cam3d.yawDeg,
      pivotWorld,
      orbiting,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = localPoint(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);

    if (pinch.current && pointers.current.size >= 2 && board) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const base = pinch.current;
      const z = renderMode === '3d'
        ? zoomAt3D(base.view, dist / base.dist, base.mx, base.my, size.w, size.h, board, flipX, flipY, rotation, cam3d, flipZ)
        : zoomAt(base.view, dist / base.dist, base.mx, base.my, size.w, size.h, board, flipX, flipY, rotation);
      const cosP = Math.cos((cam3d.pitchDeg * Math.PI) / 180);
      const pitchScaleY = renderMode === '3d'
        ? (cosP >= 0 ? Math.max(0.35, cosP) : Math.min(-0.35, cosP))
        : 1;
      onView({ ...z, panX: z.panX + (mx - base.mx), panY: z.panY + (my - base.my) / pitchScaleY });
      onCursor(proj3d ? proj3d.unprojectToPlane(mx, my, 0) : (tr?.toWorld(mx, my) ?? null));
      return;
    }

    if (longPress.current && Math.hypot(p.x - longPress.current.x, p.y - longPress.current.y) > 10) cancelLongPress();

    if (drag.current) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        drag.current.moved = true;
        cancelLongPress();
      }
      if (drag.current.orbiting && board) {
        const nextCam: Camera3D = {
          yawDeg: ((drag.current.yawDeg + dx * 0.45 + 540) % 360) - 180,
          pitchDeg: clampPitch(drag.current.pitchDeg - dy * 0.4),
        };
        setCam3d(nextCam);
        // Pivot around the screen center point so the inspected component never flies off screen!
        const curView = viewRef.current;
        const { panX, panY } = orbitAroundPivot(
          drag.current.pivotWorld,
          curView.scale,
          board,
          flipX,
          flipY,
          rotation,
          nextCam,
        );
        onView({ ...curView, panX, panY });
      } else {
        const curView = viewRef.current;
        const cosP = Math.cos((cam3d.pitchDeg * Math.PI) / 180);
        const pitchScaleY = renderMode === '3d'
          ? (cosP >= 0 ? Math.max(0.35, cosP) : Math.min(-0.35, cosP))
          : 1;
        onView({ ...curView, panX: drag.current.panX + dx, panY: drag.current.panY + dy / pitchScaleY });
      }
      onCursor(proj3d ? proj3d.unprojectToPlane(p.x, p.y, 0) : (tr?.toWorld(p.x, p.y) ?? null));
      return;
    }
    onCursor(proj3d ? proj3d.unprojectToPlane(p.x, p.y, 0) : (tr?.toWorld(p.x, p.y) ?? null));
    if (e.pointerType === 'touch') { setHover(null); return; }
    if (!layers.tooltip) { setHover(null); return; }
    const hit = nearest(p.x, p.y);
    if (hit && board) {
      if (hit.kind === 'pin') {
        const pin = board.pins[hit.index];
        const partObj = pin.part > 0 ? board.parts[pin.part - 1] : undefined;
        const partName = partObj ? (partObj.isDummy ? 'Test Pad' : partObj.name) : '—';
        const pinTitle = pin.name && pin.number && pin.name !== pin.number
          ? `${partName} — Pin ${pin.number} (${pin.name})`
          : `${partName} — Pin ${pin.name || pin.number || hit.index + 1}`;
        setHover({
          sx: p.x, sy: p.y, title: pinTitle,
          lines: [
            `Net: ${pin.net}`,
            `Part: ${partName}`,
            `Side: ${pin.side === 'bottom' ? 'Bottom' : pin.side === 'both' ? 'Both' : 'Top'}`,
            `Coords: ${Math.round(pin.x)}, ${Math.round(pin.y)} mil`,
          ],
        });
      } else {
        const nail = board.nails[hit.index];
        setHover({
          sx: p.x, sy: p.y, title: `Test point ${nail.probe || hit.index + 1}`,
          lines: [
            `Net: ${nail.net}`,
            `Side: ${nail.side === 'bottom' ? 'Bottom' : nail.side === 'both' ? 'Both' : 'Top'}`,
            `Coords: ${Math.round(nail.x)}, ${Math.round(nail.y)} mil`,
          ],
        });
      }
      return;
    }
    if (board) {
      const partIdx = findPartAtScreen(p.x, p.y);
      if (partIdx >= 0) {
        const part = board.parts[partIdx];
        const spec = classifyPartPackage(part);
        setHover({
          sx: p.x, sy: p.y, title: `${part.name} (${spec.kind.toUpperCase()})`,
          lines: [
            `Pins: ${Math.max(0, part.pinEnd - part.pinStart)}`,
            `Side: ${part.side === 'bottom' ? 'Bottom' : part.side === 'both' ? 'Both' : 'Top'} (${part.type.toUpperCase()})`,
          ],
        });
        return;
      }
    }
    setHover(null);
  };

  const releasePointer = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    releasePointer(e);
    cancelLongPress();
    if (quick.current) { endMagnifier(); drag.current = null; return; }
    if (gestureHadPinch.current) {
      drag.current = null;
      if (pointers.current.size === 0) gestureHadPinch.current = false;
      return;
    }

    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (wasDrag) return;
    const p = localPoint(e);
    const hit = nearest(p.x, p.y);
    if (hit && board) {
      onSelect({ kind: hit.kind, index: hit.index, key: `${hit.kind}:${hit.index}` });
      return;
    }
    if (board) {
      const partIndex = findPartAtScreen(p.x, p.y);
      if (partIndex >= 0) { onSelect({ kind: 'part', index: partIndex, key: `part:${partIndex}` }); return; }
    }
    onSelect(null);
  };

  const onPointerCancel = (e: ReactPointerEvent) => {
    releasePointer(e);
    cancelLongPress();
    endMagnifier();
    drag.current = null;
    setHover(null);
    if (pointers.current.size === 0) gestureHadPinch.current = false;
  };

  const zoom = useCallback((factor: number) => {
    if (!board) return;
    if (renderMode === '3d') {
      onView(zoomAt3D(view, factor, size.w / 2, size.h / 2, size.w, size.h, board, flipX, flipY, rotation, cam3d, flipZ));
    } else {
      onView(zoomAt(view, factor, size.w / 2, size.h / 2, size.w, size.h, board, flipX, flipY, rotation));
    }
  }, [board, renderMode, onView, view, size.w, size.h, flipX, flipY, flipZ, rotation, cam3d]);

  useImperativeHandle(ref, () => ({
    zoomBy: zoom,
    setDragMode3d,
    applyCam3D,
  }), [zoom, applyCam3D]);

  const realPartCount = useMemo(
    () => (board ? board.parts.filter((p) => !p.isDummy).length : 0),
    [board],
  );

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="board-canvas"
        style={{ width: '100%', height: '100%', cursor: renderMode === '3d' ? (dragMode3d === 'orbit' ? 'grab' : 'move') : 'crosshair' }}
        role="img"
        aria-label={board
          ? `${board.name}: ${realPartCount} components, ${board.pins.length} pins. Use the inspector to browse parts.`
          : 'No board loaded'}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          drag.current = null;
          cancelLongPress();
          endMagnifier();
          setHover(null);
          onCursor(null);
        }}
        onContextMenu={(e: ReactMouseEvent) => e.preventDefault()}
        onDoubleClick={() => { if (lastPointerType.current !== 'touch') onFit(); }}
      />
      {isClassicTheme && (
        <>
          {renderMode === '3d' && board && (
            <div className="cam3d-bar" role="group" aria-label="3D camera controls">
              <button type="button" className={dragMode3d === 'orbit' ? 'on' : ''} onClick={() => setDragMode3d('orbit')}>Orbit</button>
              <button type="button" className={dragMode3d === 'pan' ? 'on' : ''} onClick={() => setDragMode3d('pan')}>Pan</button>
              <span className="cam3d-sep" />
              <button type="button" onClick={() => applyCam3D({ ...cam3d, pitchDeg: Math.min(175, cam3d.pitchDeg + 15) })}>Tilt +</button>
              <button type="button" onClick={() => applyCam3D({ ...cam3d, pitchDeg: Math.max(-175, cam3d.pitchDeg - 15) })}>Tilt −</button>
              <button type="button" onClick={() => applyCam3D({ ...cam3d, yawDeg: ((cam3d.yawDeg - 25 + 540) % 360) - 180 })}>⟲</button>
              <button type="button" onClick={() => applyCam3D({ ...cam3d, yawDeg: ((cam3d.yawDeg + 25 + 540) % 360) - 180 })}>⟳</button>
              <span className="cam3d-sep" />
              <button type="button" onClick={() => applyCam3D({ pitchDeg: 0, yawDeg: 0 })}>Top 0°</button>
              <button type="button" onClick={() => applyCam3D({ pitchDeg: 48, yawDeg: -16 })}>Iso 3D</button>
            </div>
          )}
          <div className="canvas-controls">
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>＋</button>
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(0.8)}>－</button>
            <button type="button" title="Zoom to fit (F / double-click)" aria-label="Zoom to fit" onClick={onFit}>⤢</button>
            <button type="button" title="Rotate 90° (R)" aria-label="Rotate 90 degrees" onClick={() => onRotate(90)}>⟳</button>
            <button type="button" title="Flip board (Space)" aria-label="Flip board" onClick={onFlip}>⇋</button>
          </div>
        </>
      )}
      {magnifying && <div className="mag-badge" aria-hidden="true">Magnifier 3×</div>}
      {hover && (
        <div className="canvas-tooltip" style={{ left: Math.min(hover.sx + 16, size.w - 220), top: Math.min(hover.sy + 16, size.h - 110) }}>
          <div className="tip-title">{hover.title}</div>
          {hover.lines.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      {!board && (
        <div className="canvas-empty pointer-events-none absolute inset-0 z-4 flex items-center justify-center p-4">
          <div className="empty-card pointer-events-auto max-w-[420px] rounded-xl border border-border-strong bg-glass p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="empty-mark mb-3 flex justify-center">
              <BrandMark size={44} />
            </div>
            <div className="empty-title text-sm font-semibold text-foreground">Drop any boardview file here</div>
            <div className="empty-sub mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Supports <code className="font-medium text-primary">.brd</code>,{' '}
              <code className="font-medium text-primary">.bdv</code>,{' '}
              <code className="font-medium text-primary">.bvr</code>,{' '}
              <code className="font-medium text-primary">.cad</code>,{' '}
              <code className="font-medium text-primary">.cst</code>,{' '}
              <code className="font-medium text-primary">.asc</code> &amp;{' '}
              <code className="font-medium text-primary">.zip</code> rendered locally in 2D Real &amp; 3D.
            </div>
            {(onOpenFile || onOpenFolder || onDemo) && (
              <div className="empty-actions mt-4 flex flex-wrap items-center justify-center gap-2">
                {onOpenFile && <Button variant="primary" size="default" className="btn primary" onClick={onOpenFile}>Open File…</Button>}
                {onOpenFolder && <Button variant="default" size="default" className="btn" onClick={onOpenFolder}>Open ASC Folder</Button>}
                {onDemo && <Button variant="default" size="default" className="btn" onClick={onDemo}>Load Demo Board</Button>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

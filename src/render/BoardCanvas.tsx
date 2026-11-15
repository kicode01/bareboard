import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { Board, Layers, Point, Selection } from '../types';
import type { BoardIndex } from '../lib/search';
import type { Palette } from '../lib/theme';
import { fitView, makeTransform, zoomAt, type View } from '../lib/geometry';

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
  selection: Selection | null;
  highlightNet: string | null;
  focusParts: Set<number>;
  onView: (v: View) => void;
  onSelect: (s: Selection | null) => void;
  onCursor: (p: Point | null) => void;
  onFit: () => void;
  onRotate: (delta: number) => void;
  onFlip: () => void;
  fitToken: number;
  centerSelectToken: number;
  palette: Palette;
}

function gridStep(scale: number): number {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  return steps.find((s) => s * scale >= 70) ?? 25000;
}

export function BoardCanvas(props: Props) {
  const { board, index, layers, view, flipX, flipY, rotation, selection, highlightNet, focusParts,
    onView, onSelect, onCursor, onFit, onRotate, onFlip, fitToken, centerSelectToken, palette } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover | null>(null);

  // --- touch state -----------------------------------------------------------
  // Live pointer positions, keyed by pointerId, so two-finger gestures can be
  // measured without relying on any single event's coordinates.
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<{ view: View; dist: number; mx: number; my: number } | null>(null);
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  const lastPointerType = useRef<string>('mouse');
  // Stays true for the whole gesture once a second finger has landed, so that
  // lifting the last finger of a pinch is not mistaken for a tap.
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

  // Refs keep the fit effect stable: it fires only when App increments fitToken.
  const onViewRef = useRef(onView); onViewRef.current = onView;
  const boardRef = useRef(board); boardRef.current = board;
  const sizeRef = useRef(size); sizeRef.current = size;
  useEffect(() => {
    if (fitToken > 0 && boardRef.current && sizeRef.current.w) {
      onViewRef.current(fitView(boardRef.current, sizeRef.current.w, sizeRef.current.h));
    }
  }, [fitToken]);

  useEffect(() => {
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

    // Net "ratsnest" lens: faint stars for every net, bright star for the active net.
    if (layers.nets && index) {
      let budget = 900;
      for (const [name, info] of index.nets) {
        if (!name || name === 'UNCONNECTED' || info.pinIndices.length < 2) continue;
        const active = name === highlightNet;
        if (!active && (budget <= 0 || info.pinIndices.length > 60)) continue;
        const origin = board.pins[info.pinIndices[0]];
        const o = S(origin);
        ctx.strokeStyle = active ? palette.netActive : palette.netIdle;
        ctx.lineWidth = active ? 1.5 : 0.6;
        ctx.beginPath();
        const take = active ? info.pinIndices.length : Math.min(info.pinIndices.length, 12);
        for (let k = 1; k < take; k++) {
          const p = S(board.pins[info.pinIndices[k]]);
          ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        budget -= take;
      }
    }

    // Board outline.
    if (layers.outline && board.outline.length > 1) {
      ctx.beginPath();
      board.outline.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      ctx.closePath();
      ctx.fillStyle = palette.outlineFill;
      ctx.fill();
      ctx.strokeStyle = palette.outlineStroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Component bodies.
    board.parts.forEach((part, i) => {
      if (!part.box) return;
      const a = S({ x: part.box.minX, y: part.box.minY });
      const b = S({ x: part.box.maxX, y: part.box.maxY });
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const bw = Math.abs(b.x - a.x), bh = Math.abs(b.y - a.y);
      const focused = focusParts.has(i);
      const selected = selection?.kind === 'part' && selection.index === i;
      ctx.fillStyle = focused ? palette.partFillFocus : palette.partFill;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = selected ? palette.selectionRing : focused ? palette.active
        : (part.side === 'bottom' ? palette.partStrokeBottom : palette.partStroke);
      ctx.lineWidth = selected ? 2 : focused ? 1.6 : 1;
      ctx.strokeRect(x, y, bw, bh);
      if (layers.labels && view.scale > 0.035 && bw > 24) {
        ctx.fillStyle = focused ? palette.labelFocus : palette.label;
        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(part.name, x + bw / 2, y - 4);
      }
    });

    // Pins, batched by side for performance on large boards.
    if (layers.pins) {
      const groups: Record<'top' | 'bottom' | 'both', typeof board.pins> = { top: [], bottom: [], both: [] };
      for (const pin of board.pins) {
        if (pin.side === 'top' && !layers.top) continue;
        if (pin.side === 'bottom' && !layers.bottom) continue;
        const s = S(pin);
        if (s.x < -20 || s.x > w + 20 || s.y < -20 || s.y > h + 20) continue;
        groups[pin.side].push({ ...pin, x: s.x, y: s.y });
      }
      (['both', 'bottom', 'top'] as const).forEach((side) => {
        const arr = groups[side];
        if (!arr.length) return;
        ctx.beginPath();
        for (const pin of arr) {
          const r = Math.min(9, Math.max(1.4, pin.radius * view.scale));
          ctx.moveTo(pin.x + r, pin.y);
          ctx.arc(pin.x, pin.y, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = palette[side];
        ctx.globalAlpha = side === 'both' ? 0.7 : 0.88;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      if (highlightNet) {
        ctx.beginPath();
        for (const pin of board.pins) {
          if (pin.net !== highlightNet) continue;
          const s = S(pin);
          ctx.moveTo(s.x + 7, s.y);
          ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        }
        ctx.strokeStyle = palette.netActive;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    // Test nails / vias.
    if (layers.nails) {
      ctx.fillStyle = palette.nail;
      for (const nail of board.nails) {
        const s = S(nail);
        if (s.x < -10 || s.x > w + 10 || s.y < -10 || s.y > h + 10) continue;
        const r = Math.max(2.2, Math.min(5, view.scale * 16));
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y);
        ctx.closePath(); ctx.fill();
      }
    }

    // Selection marker.
    if (selection) {
      let center: Point | null = null;
      if (selection.kind === 'pin' && board.pins[selection.index]) center = S(board.pins[selection.index]);
      if (selection.kind === 'nail' && board.nails[selection.index]) center = S(board.nails[selection.index]);
      if (selection.kind === 'part' && board.parts[selection.index]?.box) {
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

    // Centre crosshair (the original app's "+" mark) + scale bar.
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

    const barMils = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000].find((v) => v * view.scale >= 70) ?? 5000;
    const barPx = barMils * view.scale;
    ctx.strokeStyle = palette.scaleText;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(20, h - 22); ctx.lineTo(20 + barPx, h - 22);
    ctx.moveTo(20, h - 27); ctx.lineTo(20, h - 17);
    ctx.moveTo(20 + barPx, h - 27); ctx.lineTo(20 + barPx, h - 17);
    ctx.stroke();
    ctx.fillStyle = palette.scaleText;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${barMils} mil  /  ${(barMils * 0.0254).toFixed(2)} mm`, 20, h - 32);
  }, [board, index, layers, view, size, tr, flipX, flipY, rotation, selection, highlightNet, focusParts, palette]);

  const localPoint = (e: ReactPointerEvent | ReactWheelEvent | ReactMouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const nearest = useCallback((sx: number, sy: number) => {
    if (!board || !tr) return null;
    const world = tr.toWorld(sx, sy);
    const limit = 14 / view.scale;
    const best = { kind: 'pin' as 'pin' | 'nail', index: -1, d: Infinity };
    board.pins.forEach((pin, i) => {
      const d = Math.hypot(pin.x - world.x, pin.y - world.y);
      if (d < limit && d < best.d) { best.kind = 'pin'; best.index = i; best.d = d; }
    });
    board.nails.forEach((nail, i) => {
      const d = Math.hypot(nail.x - world.x, nail.y - world.y);
      if (d < limit && d < best.d) { best.kind = 'nail'; best.index = i; best.d = d; }
    });
    return best.index >= 0 ? best : null;
  }, [board, tr, view.scale]);

  // "E / Enter" selects whatever sits under the centre crosshair. The hit test
  // lives here, so App bumps a token and this reacts exactly once per bump.
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
    if (!tr) return;
    const world = tr.toWorld(size.w / 2, size.h / 2);
    const partIndex = board.parts.findIndex((part) => part.box
      && world.x >= part.box.minX && world.x <= part.box.maxX
      && world.y >= part.box.minY && world.y <= part.box.maxY);
    onSelect(partIndex >= 0 ? { kind: 'part', index: partIndex, key: `part:${partIndex}` } : null);
  }, [centerSelectToken, nearest, board, tr, onSelect, size.w, size.h]);

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    if (!board) return;
    const p = localPoint(e);
    onView(zoomAt(view, e.deltaY < 0 ? 1.18 : 1 / 1.18, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation));
  };

  // Right-button hold is a temporary magnifier in the original: zoom hard into
  // the cursor while held, snap back to the previous view on release. The left
  // button and wheel stay live during the hold, which the saved view tolerates
  // because it is only restored on release.
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

    // Second finger down: switch from pan/magnify to a pinch. Whatever the first
    // finger was doing is abandoned, including a pending long press.
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

    if (e.button === 2 && board) {
      quick.current = { view };
      onView(zoomAt(view, 3, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation));
      return;
    }

    // Touch has no right button, so long-press stands in for the magnifier.
    if (e.pointerType === 'touch' && board) {
      longPress.current = {
        x: p.x, y: p.y,
        timer: window.setTimeout(() => {
          longPress.current = null;
          quick.current = { view };
          setMagnifying(true);
          onView(zoomAt(view, 3, p.x, p.y, size.w, size.h, board, flipX, flipY, rotation));
        }, 420),
      };
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = localPoint(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);

    // Two-finger pinch: zoom about the starting midpoint and follow the midpoint.
    // Both are computed from the gesture's origin, so error cannot accumulate.
    if (pinch.current && pointers.current.size >= 2 && board) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const base = pinch.current;
      const z = zoomAt(base.view, dist / base.dist, base.mx, base.my, size.w, size.h, board, flipX, flipY, rotation);
      onView({ ...z, panX: z.panX + (mx - base.mx), panY: z.panY + (my - base.my) });
      onCursor(tr?.toWorld(mx, my) ?? null);
      return;
    }

    // Any real movement means this is a pan, not a long press.
    if (longPress.current && Math.hypot(p.x - longPress.current.x, p.y - longPress.current.y) > 10) cancelLongPress();

    if (drag.current) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
      onView({ ...view, panX: drag.current.panX + dx, panY: drag.current.panY + dy });
      onCursor(tr?.toWorld(p.x, p.y) ?? null);
      return;
    }
    onCursor(tr?.toWorld(p.x, p.y) ?? null);
    // Touch has no hover: a tooltip would stick to the last tap.
    if (e.pointerType === 'touch') { setHover(null); return; }
    if (!layers.tooltip) { setHover(null); return; }
    const hit = nearest(p.x, p.y);
    if (!hit || !board) { setHover(null); return; }
    if (hit.kind === 'pin') {
      const pin = board.pins[hit.index];
      const part = pin.part > 0 ? board.parts[pin.part - 1]?.name : '—';
      setHover({ sx: p.x, sy: p.y, title: pin.name || `PIN ${hit.index + 1}`,
        lines: [`NET   ${pin.net}`, `PART  ${part}`, `SIDE  ${pin.side.toUpperCase()}`, `X/Y   ${Math.round(pin.x)} / ${Math.round(pin.y)} mil`] });
    } else {
      const nail = board.nails[hit.index];
      setHover({ sx: p.x, sy: p.y, title: `TEST POINT ${nail.probe || hit.index + 1}`,
        lines: [`NET   ${nail.net}`, `SIDE  ${nail.side.toUpperCase()}`, `X/Y   ${Math.round(nail.x)} / ${Math.round(nail.y)} mil`] });
    }
  };

  const releasePointer = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    releasePointer(e);
    cancelLongPress();
    // A magnifier release never selects: it just restores the view.
    if (quick.current) { endMagnifier(); drag.current = null; return; }
    // A finger lifting out of a pinch must not be read as a tap.
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
    // Fall back to selecting a component body under the pointer.
    if (board && tr) {
      const world = tr.toWorld(p.x, p.y);
      const partIndex = board.parts.findIndex((part) => part.box
        && world.x >= part.box.minX && world.x <= part.box.maxX
        && world.y >= part.box.minY && world.y <= part.box.maxY);
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

  const zoom = (factor: number) => {
    if (!board) return;
    onView(zoomAt(view, factor, size.w / 2, size.h / 2, size.w, size.h, board, flipX, flipY, rotation));
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="board-canvas"
        style={{ width: '100%', height: '100%' }}
        role="img"
        aria-label={board
          ? `${board.name}: ${board.parts.length} components, ${board.pins.length} pins. Use the inspector to browse parts.`
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
      {magnifying && <div className="mag-badge" aria-hidden="true">MAGNIFIER 3× · RELEASE TO RETURN</div>}
      {hover && (
        <div className="canvas-tooltip" style={{ left: Math.min(hover.sx + 16, size.w - 210), top: Math.min(hover.sy + 16, size.h - 110) }}>
          <div className="tip-title">{hover.title}</div>
          {hover.lines.map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      {!board && (
        <div className="canvas-empty">
          <div className="empty-mark">＋</div>
          <div className="empty-title">No board loaded</div>
          <div className="empty-sub">Drop a boardview file here, or open the bundled demo.</div>
        </div>
      )}
      <div className="canvas-controls">
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.25)}>＋</button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(0.8)}>－</button>
        <button type="button" title="Zoom to fit (F / double-click)" aria-label="Zoom to fit" onClick={onFit}>⤢</button>
        <button type="button" title="Rotate 90° (R)" aria-label="Rotate 90 degrees" onClick={() => onRotate(90)}>⟳</button>
        <button type="button" title="Flip board (Space)" aria-label="Flip board" onClick={onFlip}>⇋</button>
      </div>
    </div>
  );
}

import type { Board, Point } from '../types';

export interface View {
  scale: number; // px per mil
  panX: number;
  panY: number;
}

export interface Transform {
  toScreen: (p: Point) => Point;
  toWorld: (sx: number, sy: number) => Point;
  project: (p: Point, scale: number) => Point;
  center: Point;
}

export function fitView(board: Board, width: number, height: number): View {
  const w = Math.max(1, board.bounds.maxX - board.bounds.minX);
  const h = Math.max(1, board.bounds.maxY - board.bounds.minY);
  const scale = Math.min((width - 96) / w, (height - 96) / h);
  return { scale: Math.max(scale, 0.0005), panX: 0, panY: 0 };
}

export function makeTransform(
  board: Board, width: number, height: number, view: View,
  flipX: boolean, flipY: boolean, rotation: number,
): Transform {
  const center: Point = {
    x: (board.bounds.minX + board.bounds.maxX) / 2,
    y: (board.bounds.minY + board.bounds.maxY) / 2,
  };
  const a = (rotation * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);

  const project = (p: Point, scale: number): Point => {
    let dx = p.x - center.x, dy = p.y - center.y;
    if (flipX) dx = -dx;
    if (flipY) dy = -dy;
    return { x: (dx * cos - dy * sin) * scale, y: (dx * sin + dy * cos) * scale };
  };

  return {
    center,
    project,
    toScreen: (p) => {
      const r = project(p, view.scale);
      return { x: width / 2 + r.x + view.panX, y: height / 2 + r.y + view.panY };
    },
    toWorld: (sx, sy) => {
      const dx = (sx - width / 2 - view.panX) / view.scale;
      const dy = (sy - height / 2 - view.panY) / view.scale;
      let ux = dx * cos + dy * sin;
      let uy = -dx * sin + dy * cos;
      if (flipX) ux = -ux;
      if (flipY) uy = -uy;
      return { x: ux + center.x, y: uy + center.y };
    },
  };
}

/** Zoom about a screen point so the world position under the cursor stays fixed. */
export function zoomAt(
  view: View, factor: number, sx: number, sy: number,
  width: number, height: number, board: Board,
  flipX: boolean, flipY: boolean, rotation: number,
): View {
  const scale = Math.min(Math.max(view.scale * factor, 0.0005), 40);
  const before = makeTransform(board, width, height, view, flipX, flipY, rotation).toWorld(sx, sy);
  const after = makeTransform(board, width, height, { ...view, scale }, flipX, flipY, rotation).project(before, scale);
  return { scale, panX: sx - width / 2 - after.x, panY: sy - height / 2 - after.y };
}

/** Center (and optionally zoom in) on a world-space bounding box, matching
 *  OpenBoardView's CenterZoomSearchResults / CenterView behaviour. */
export function focusBounds(
  board: Board,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  width: number, height: number,
  currentScale: number,
  flipX: boolean, flipY: boolean, rotation: number,
): View {
  const bw = Math.max(120, box.maxX - box.minX);
  const bh = Math.max(120, box.maxY - box.minY);
  const fitScale = Math.min(
    Math.max(Math.min((width * 0.42) / bw, (height * 0.42) / bh), currentScale),
    6.5,
  );
  const scale = Math.max(currentScale, Math.min(fitScale, 3.2));
  const target: Point = {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
  const r = makeTransform(board, width, height, { scale, panX: 0, panY: 0 }, flipX, flipY, rotation).project(target, scale);
  return { scale, panX: -r.x, panY: -r.y };
}

/** Ray-casting point-in-polygon check for 4-point oriented bounding quads and hulls. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}


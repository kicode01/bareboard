import type { Board, Layers } from '../types';
import type { RenderMode } from '../render/realistic3d';

interface Props {
  board: Board | null;
  layers: Layers;
  renderMode: RenderMode;
  partNames: string[];
  netNames: string[];
  onSelectSide: (side: 'top' | 'bottom' | 'both') => void;
  onRenderMode: (mode: RenderMode) => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onDemo: () => void;
  onFit: () => void;
  onZoom: (f: number) => void;
  onRotate: (d: number) => void;
  onFlip: () => void;
  onMirror: () => void;
  onPickPart: (name: string) => void;
  onPickNet: (name: string) => void;
}

/** Flat 16px glyphs, drawn to match the small grey toolbar art in the original
 *  rather than using emoji (which render differently on every platform). */
const Icon = ({ d, extra }: { d: string; extra?: string }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    {extra && <path d={extra} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />}
  </svg>
);

const ICONS = {
  open: { d: 'M1.5 4.5h4l1.2 1.6h7.8v7.4h-13z', extra: 'M1.5 4.5V3h4.4l1 1.5' },
  folder: { d: 'M1.5 3.5h4.2l1.1 1.5h7.7v8.5h-13z' },
  demo: { d: 'M3.5 2.5h6l3 3v8h-9z', extra: 'M9.5 2.5v3h3' },
  fit: { d: 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4' },
  zoomin: { d: 'M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z', extra: 'M10.5 10.5L14 14M5 7h4M7 5v4' },
  zoomout: { d: 'M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z', extra: 'M10.5 10.5L14 14M5 7h4' },
  rotL: { d: 'M3.2 8a4.8 4.8 0 114.8 4.8', extra: 'M1.4 5.2L3.4 8l2.6-1.6' },
  rotR: { d: 'M12.8 8A4.8 4.8 0 118 3.2', extra: 'M14.6 5.2L12.6 8 10 6.4' },
  flip: { d: 'M8 2v12', extra: 'M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3' },
  mirror: { d: 'M8 2v12', extra: 'M6 4.5L2 8l4 3.5zM10 4.5L14 8l-4 3.5z' },
};

export function Toolbar(p: Props) {
  const has = Boolean(p.board);
  const btn = (label: string, key: keyof typeof ICONS, onClick: () => void, disabled = false, title?: string) => (
    <button type="button" className="tb-btn" onClick={onClick} disabled={disabled}
      title={title || label} aria-label={label}>
      <Icon {...ICONS[key]} />
    </button>
  );

  return (
    <div className="toolbar" role="toolbar" aria-label="Board tools">
      {btn('Open file', 'open', p.onOpenFile)}
      {btn('Open folder', 'folder', p.onOpenFolder, false, 'Open a folder of .asc files')}
      {btn('Load demo board', 'demo', p.onDemo)}
      <span className="tb-sep" aria-hidden="true" />
      {btn('Zoom to fit', 'fit', p.onFit, !has)}
      {btn('Zoom in', 'zoomin', () => p.onZoom(1.25), !has)}
      {btn('Zoom out', 'zoomout', () => p.onZoom(0.8), !has)}
      <span className="tb-sep" aria-hidden="true" />
      {btn('Rotate 90° anticlockwise', 'rotL', () => p.onRotate(-90), !has)}
      {btn('Rotate 90° clockwise', 'rotR', () => p.onRotate(90), !has)}
      {btn('Flip board', 'flip', p.onFlip, !has)}
      {btn('Mirror board', 'mirror', p.onMirror, !has)}

      <span className="tb-sep" aria-hidden="true" />

      {/* The original exposes the two sides in this bar; clicking switches to that side. */}
      <button type="button" className={`tb-side top${p.layers.top && !p.layers.bottom ? ' on' : ''}`}
        aria-pressed={p.layers.top && !p.layers.bottom} onClick={() => p.onSelectSide('top')}
        title="Show top side only (T)">
        <i className="side-dot top" aria-hidden="true" />Top
      </button>
      <button type="button" className={`tb-side bottom${p.layers.bottom && !p.layers.top ? ' on' : ''}`}
        aria-pressed={p.layers.bottom && !p.layers.top} onClick={() => p.onSelectSide('bottom')}
        title="Show bottom side only (B)">
        <i className="side-dot bottom" aria-hidden="true" />Bottom
      </button>
      <button type="button" className={`tb-side both${p.layers.top && p.layers.bottom ? ' on' : ''}`}
        aria-pressed={p.layers.top && p.layers.bottom} onClick={() => p.onSelectSide('both')}
        title="Overlay both sides">
        Both
      </button>

      <span className="tb-sep" aria-hidden="true" />

      <button type="button" className={`tb-side${p.renderMode === 'cad' ? ' on' : ''}`}
        aria-pressed={p.renderMode === 'cad'} onClick={() => p.onRenderMode('cad')}
        title="2D CAD technical footprints (V)">
        2D CAD
      </button>
      <button type="button" className={`tb-side${p.renderMode === 'realistic' ? ' on' : ''}`}
        aria-pressed={p.renderMode === 'realistic'} onClick={() => p.onRenderMode('realistic')}
        title="2D Realistic physical component figures (V)">
        2D Real
      </button>
      <button type="button" className={`tb-side${p.renderMode === '3d' ? ' on' : ''}`}
        aria-pressed={p.renderMode === '3d'} onClick={() => p.onRenderMode('3d')}
        title="Interactive 3D extruded PCB & components (3)">
        3D View
      </button>

      <span className="tb-sep" aria-hidden="true" />

      <label className="tb-field">
        <span>Parts:</span>
        <select value="" disabled={!has} onChange={(e) => { if (e.target.value) p.onPickPart(e.target.value); }}>
          <option value="">{p.partNames.length ? `${p.partNames.length} parts` : '—'}</option>
          {p.partNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>

      <label className="tb-field">
        <span>Nets:</span>
        <select value="" disabled={!has} onChange={(e) => { if (e.target.value) p.onPickNet(e.target.value); }}>
          <option value="">{p.netNames.length ? `${p.netNames.length} nets` : '—'}</option>
          {p.netNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

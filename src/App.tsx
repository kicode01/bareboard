import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Board, Detection, Layers, Point, Selection } from './types';
import { loadBoard, type InputFile } from './parsers';
import { demoFile } from './parsers/demo';
import { extensionOf } from './parsers/detect';
import { latin1 } from './parsers/util';
import { buildIndex, search } from './lib/search';
import type { View } from './lib/geometry';
import { filesFromDataTransfer, filesFromFileList } from './lib/files';
import { consumeLaunchFiles, initPwa, isStandalone, promptInstall, subscribeInstall } from './lib/pwa';
import { PALETTES, readTheme, saveTheme, type Theme } from './lib/theme';
import { MenuBar, buildMenus } from './components/MenuBar';
import { OptionsDialog } from './components/OptionsDialog';
import { Toolbar } from './components/Toolbar';
import { BoardCanvas } from './render/BoardCanvas';

const DEFAULT_LAYERS: Layers = {
  outline: true, pins: true, nails: true, labels: true, grid: true, nets: true, top: true, bottom: true,
  tooltip: true,
};

const ACCEPT = '.brd,.bdv,.bvr,.cad,.cst,.asc,.bom,.zip,.fz,.cae,.xzzpcb,.tvw,.bv,.gr,.f2b';

interface BatchRow {
  name: string;
  format: string;
  ok: boolean;
  parts: number;
  pins: number;
  nets: number;
  error?: string;
}

interface SampleSpec { label: string; tag: string; files: string[] }

const SAMPLES: SampleSpec[] = [
  { label: 'demo.brd', tag: 'BRD', files: ['samples/demo.brd'] },
  { label: 'demo-encoded.brd', tag: 'BRD · encoded', files: ['samples/demo-encoded.brd'] },
  { label: 'demo-brd2.brd', tag: 'BRD2', files: ['samples/demo-brd2.brd'] },
  { label: 'demo.bdv', tag: 'BDV', files: ['samples/demo.bdv'] },
  { label: 'demo.bvr', tag: 'BVR3', files: ['samples/demo.bvr'] },
  { label: 'demo-bvr1.bvr', tag: 'BVR1', files: ['samples/demo-bvr1.bvr'] },
  { label: 'demo.cad', tag: 'CAD', files: ['samples/demo.cad'] },
  { label: 'demo.cst', tag: 'CST · binary', files: ['samples/demo.cst'] },
  { label: 'asc-tsict', tag: 'ASC folder', files: ['samples/asc-tsict/format.asc', 'samples/asc-tsict/pins.asc', 'samples/asc-tsict/nails.asc'] },
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const mm = (mil: number) => (mil * 0.0254).toFixed(2);

/** The phone shell is the same markup with different chrome, so JS needs to know
 *  which mode it is in for focus management and ARIA semantics. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [view, setView] = useState<View>({ scale: 0.2, panX: 0, panY: 0 });
  const [fitToken, setFitToken] = useState(0);
  // Ctrl held inverts the label layer without changing the saved toggle, which
  // is how the original documents CTRL in the Controls help.
  const [holdLabels, setHoldLabels] = useState(false);
  // Bumped to ask the canvas to select whatever sits under the centre crosshair.
  const [centerSelectToken, setCenterSelectToken] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlightNet, setHighlightNet] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<Point | null>(null);
  const [library, setLibrary] = useState<{ label: string; files: InputFile[] }[]>([]);
  const [batch, setBatch] = useState<BatchRow[]>([]);
  const [installable, setInstallable] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'search' | 'formats' | 'diagnostics'>('search');
  const [rawMode, setRawMode] = useState<'text' | 'hex'>('text');
  const [showRe, setShowRe] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [reModal, setReModal] = useState(false);
  // Mobile shell state. On desktop these are inert: the drawer is a static
  // column and the inspector is a static panel.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('peek');
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [about, setAbout] = useState(false);
  const [options, setOptions] = useState(false);

  const setTheme = useCallback((t: Theme) => { setThemeState(t); saveTheme(t); }, []);
  const palette = PALETTES[theme];

  // The document-level tokens (body background, colour scheme, scrollbars) live
  // on :root, so the theme has to be mirrored onto <html> as well as the shell.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.style.colorScheme = theme === 'classic' ? 'light' : 'dark';
    // The address bar / status bar of an installed app takes its colour from
    // this tag. Left at the dark value it would frame a light app in black.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'classic' ? '#f0f0f0' : '#080b10');
  }, [theme]);

  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const tabBodyRef = useRef<HTMLDivElement>(null);
  const dockFilesRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);
  const gripStart = useRef<number | null>(null);

  const isPhone = useMediaQuery('(max-width: 860px)');

  const index = useMemo(() => (board ? buildIndex(board) : null), [board]);
  const hits = useMemo(() => (index && board ? search(index, query, board) : []), [index, board, query]);
  const focusParts = useMemo(() => new Set(hits.filter((h) => h.kind === 'part').map((h) => h.index)), [hits]);
  const netList = useMemo(() => (index ? [...index.nets.values()].sort((a, b) => b.pinIndices.length - a.pinIndices.length) : []), [index]);
  const partNames = useMemo(() => (board ? board.parts.map((p) => p.name) : []), [board]);
  const netNames = useMemo(() => netList.map((n) => n.name), [netList]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const openFiles = useCallback(async (inputs: InputFile[]) => {
    if (!inputs.length) return;
    setBusy(true); setError(null);
    try {
      // Multiple unrelated files = batch validation. ASC companion files stay a single bundle.
      const isBatch = inputs.length > 1 && !inputs.some((f) => extensionOf(f.name) === '.asc');
      const results = isBatch ? inputs.map((f) => loadBoard([f])) : [loadBoard(inputs)];

      if (isBatch) {
        setBatch(results.map((r, i) => ({
          name: inputs[i].name,
          format: r.board?.format || r.detection.label,
          ok: Boolean(r.board),
          parts: r.board?.parts.length || 0,
          pins: r.board?.pins.length || 0,
          nets: r.board ? new Set(r.board.pins.map((p) => p.net)).size : 0,
          error: r.error,
        })));
      } else {
        setBatch([]);
      }

      const first = results.find((r) => r.board);
      const result = first || results[0];
      setDetection(result.detection);
      if (first?.board) {
        setBoard(first.board);
        setSelection(null); setHighlightNet(null); setQuery('');
        setFlipX(false); setFlipY(false); setRotation(0);
        setFitToken((t) => t + 1);
        const label = first.board.name;
        setLibrary((prev) => [...prev.filter((f) => f.label !== label), { label, files: inputs }].slice(-6));
        // On a phone the file list is a drawer; once a board is open it should
        // get out of the way so the canvas is visible.
        if (isPhone) setDrawerOpen(false);
        notify(isBatch
          ? `Validated ${inputs.length} files · ${results.filter((r) => r.board).length} parsed`
          : `Loaded ${first.board.name} · ${first.board.format}`);
      } else {
        setError(result.error || 'This file could not be parsed.');
        setLeftTab('diagnostics');
        notify('Format not supported — see Diagnostics');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error while reading the file.');
    } finally {
      setBusy(false);
    }
  }, [notify, isPhone]);

  useEffect(() => {
    initPwa();
    const unsub = subscribeInstall(setInstallable);
    consumeLaunchFiles((files) => void openFiles(files));
    const dirInput = dirRef.current;
    if (dirInput) dirInput.setAttribute('webkitdirectory', '');
    // Load the bundled demo only when there is no file handed over by the OS.
    const t = window.setTimeout(() => {
      if (!window.location.search.includes('action=open')) void openFiles([demoFile()]);
    }, 60);
    return () => { unsub(); window.clearTimeout(t); };
  }, [openFiles]);

  const loadFromFileList = useCallback(async (list: FileList) => {
    await openFiles(await filesFromFileList(list));
  }, [openFiles]);

  const loadSample = useCallback(async (spec: SampleSpec) => {
    try {
      const inputs = await Promise.all(spec.files.map(async (p) => {
        const res = await fetch(new URL(p, document.baseURI));
        if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
        return { name: p.split('/').pop() || p, bytes: new Uint8Array(await res.arrayBuffer()) };
      }));
      await openFiles(inputs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the bundled sample.');
      setLeftTab('diagnostics');
    }
  }, [openFiles]);

  const doFit = useCallback(() => setFitToken((t) => t + 1), []);
  const doRotate = useCallback((d: number) => setRotation((r) => (r + d + 360) % 360), []);
  const doFlip = useCallback(() => setFlipY((v) => !v), []);

  const handleSelect = useCallback((s: Selection | null) => {
    setSelection(s);
    if (!s || !board) { setHighlightNet(null); return; }
    if (s.kind === 'pin') setHighlightNet(board.pins[s.index]?.net || null);
    else if (s.kind === 'nail') setHighlightNet(board.nails[s.index]?.net || null);
    else if (s.kind === 'part') setHighlightNet(null);
    // A 'net' selection keeps the highlight the caller just set.
    // On mobile, tapping something should reveal its details rather than leave
    // the inspector collapsed at peek height.
    setSheet((cur) => (cur === 'peek' ? 'half' : cur));
    // Picking a result from the drawer should hand the screen back to the board.
    if (isPhone) setDrawerOpen(false);
  }, [board, isPhone]);

  const cycleSheet = useCallback(() => {
    setSheet((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'));
  }, []);

  // Toolbar combos: picking a part or net is the same action as clicking it.
  const pickPart = useCallback((name: string) => {
    if (!board) return;
    const i = board.parts.findIndex((p) => p.name === name);
    if (i >= 0) handleSelect({ kind: 'part', index: i, key: `part:${i}` });
  }, [board, handleSelect]);

  const pickNet = useCallback((name: string) => {
    setHighlightNet(name);
    handleSelect({ kind: 'net', index: 0, key: `net:${name}` });
  }, [handleSelect]);

  // The drawer is a modal overlay on phones only. Off-screen it must be inert so
  // it is neither painted nor reachable by Tab or a screen reader.
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    if (isPhone && !drawerOpen) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [isPhone, drawerOpen]);

  // Focus follows the drawer: in on open, back to the trigger on close.
  useEffect(() => {
    if (!isPhone) return;
    if (drawerOpen) {
      drawerWasOpen.current = true;
      const t = window.setTimeout(() => drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 80);
      return () => window.clearTimeout(t);
    }
    if (drawerWasOpen.current) { drawerWasOpen.current = false; dockFilesRef.current?.focus(); }
  }, [drawerOpen, isPhone]);

  // Each tab is a fresh view: carrying the previous tab's scroll offset makes
  // the new panel open halfway down, which reads as missing content.
  useEffect(() => {
    if (tabBodyRef.current) tabBodyRef.current.scrollTop = 0;
  }, [leftTab]);

  // Close the layers popover on an outside press.
  useEffect(() => {
    if (!layersOpen) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.layer-pop') || t?.closest('[data-layers-trigger]')) return;
      setLayersOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [layersOpen]);

  const onDrawerKeyDown = (e: ReactKeyboardEvent) => {
    if (!isPhone || !drawerOpen || e.key !== 'Tab') return;
    const nodes = drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || !nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const zoomCenter = useCallback((factor: number) => {
    setView((v) => ({ ...v, scale: Math.min(Math.max(v.scale * factor, 0.0005), 40) }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Control') { setHoldLabels(true); return; }
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const pan = (dx: number, dy: number) => setView((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); fileRef.current?.click(); return; }
      switch (e.key.toLowerCase()) {
        case 'f': doFit(); break;
        case 'r': doRotate(90); break;
        case ' ': e.preventDefault(); doFlip(); break;
        // Escape unwinds the shell layer by layer before touching the selection.
        case 'escape':
          if (drawerOpen) { setDrawerOpen(false); break; }
          if (layersOpen) { setLayersOpen(false); break; }
          if (options) { setOptions(false); break; }
          if (reModal) { setReModal(false); break; }
          handleSelect(null);
          break;
        case 'h': setLayers((l) => ({ ...l, labels: !l.labels })); break;
        case 'g': setLayers((l) => ({ ...l, grid: !l.grid })); break;
        // "," and "." rotate anticlockwise / clockwise, as in the original.
        case ',': doRotate(-90); break;
        case '.': doRotate(90); break;
        case 'm': setFlipX((v) => !v); break;
        case 'tab': {
          e.preventDefault();
          const order = ['search', 'formats', 'diagnostics'] as const;
          setLeftTab((t) => order[(order.indexOf(t) + 1) % order.length]);
          // On a phone the tabs are hidden in the drawer, so reveal it.
          if (isPhone) setDrawerOpen(true);
          break;
        }
        case 'enter': case 'e': e.preventDefault(); setCenterSelectToken((t) => t + 1); break;
        case '+': case '=': zoomCenter(1.25); break;
        case '-': zoomCenter(0.8); break;
        case 'a': pan(60, 0); break;
        case 'd': pan(-60, 0); break;
        case 'w': pan(0, 60); break;
        case 's': pan(0, -60); break;
        case 'arrowleft': e.preventDefault(); pan(60, 0); break;
        case 'arrowright': e.preventDefault(); pan(-60, 0); break;
        case 'arrowup': e.preventDefault(); pan(0, 60); break;
        case 'arrowdown': e.preventDefault(); pan(0, -60); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control') setHoldLabels(false); };
    const onBlur = () => setHoldLabels(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [doFit, doRotate, doFlip, handleSelect, zoomCenter, drawerOpen, layersOpen, reModal, options, isPhone]);

  const onDrop = async (e: ReactDragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = await filesFromDataTransfer(e.dataTransfer);
    await openFiles(files);
  };

  const toggle = (key: keyof Layers) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  const rawText = useMemo(() => {
    if (!board) return '';
    const bytes = board.sourceBytes.subarray(0, 4096);
    if (rawMode === 'text') return latin1(bytes);
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const slice = bytes.subarray(i, i + 16);
      const hex = [...slice].map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
      const ascii = [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
      lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
    }
    return lines.join('\n');
  }, [board, rawMode]);

  const selectedPart = selection?.kind === 'part' && board ? board.parts[selection.index] : null;
  const selectedPin = selection?.kind === 'pin' && board ? board.pins[selection.index] : null;
  const selectedNail = selection?.kind === 'nail' && board ? board.nails[selection.index] : null;
  const activeNet = highlightNet && index ? index.nets.get(highlightNet) : null;

  // The collapsed sheet is only a handle, so the handle has to say what is
  // inside it — otherwise peek gives the user nothing. With no selection it
  // says what tapping will do next instead.
  const sheetLabel = selectedPart
    ? `Part · ${selectedPart.name}`
    : selectedPin
      ? `Pin · ${selectedPin.name || `#${selection!.index + 1}`} · ${selectedPin.net}`
      : selectedNail
        ? `Test point · #${selectedNail.probe || selection!.index + 1} · ${selectedNail.net}`
        : activeNet
          ? `Net · ${activeNet.name}`
          : sheet === 'peek' ? 'Inspector · tap to open'
            : sheet === 'half' ? 'Inspector · tap to expand'
              : 'Inspector · tap to collapse';

  const menus = buildMenus({
    boardName: board?.name ?? null,
    format: board?.format ?? null,
    parts: board?.parts.length ?? 0,
    pins: board?.pins.length ?? 0,
    nets: index?.nets.size ?? 0,
    tests: board?.nails.length ?? 0,
    layers, theme,
    canInstall: installable && !isStandalone(),
    recent: library.map((f) => ({ label: f.label, open: () => void openFiles(f.files) })),
    openFile: () => fileRef.current?.click(),
    openFolder: () => dirRef.current?.click(),
    loadDemo: () => void openFiles([demoFile()]),
    install: () => void promptInstall(),
    fit: doFit,
    zoomIn: () => zoomCenter(1.25),
    zoomOut: () => zoomCenter(0.8),
    rotateCw: () => doRotate(90),
    rotateCcw: () => doRotate(-90),
    flip: doFlip,
    mirror: () => setFlipX((v) => !v),
    toggleLayer: toggle,
    setTheme,
    showKeys: () => { setShowKeys(true); setSheet('half'); },
    showRe: () => { setShowRe(true); setSheet('half'); },
    about: () => setAbout(true),
    openOptions: () => setOptions(true),
    centerSelect: () => setCenterSelectToken((t) => t + 1),
    clearSelection: () => handleSelect(null),
  });

  return (
    <div
      className={`app ${dragOver ? 'is-dragging' : ''}`}
      data-theme={theme}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => void onDrop(e)}
    >
      <a className="skip-link" href="#stage">Skip to board canvas</a>

      {theme === 'classic' && <>
        <MenuBar menus={menus} title={board ? `BareBoard — ${board.name}` : 'BareBoard'}
          subtitle={board ? board.format : undefined} />
        <Toolbar
          board={board} layers={layers}
          partNames={partNames} netNames={netNames}
          onToggle={toggle}
          onOpenFile={() => fileRef.current?.click()}
          onOpenFolder={() => dirRef.current?.click()}
          onDemo={() => void openFiles([demoFile()])}
          onFit={doFit}
          onZoom={zoomCenter}
          onRotate={doRotate}
          onFlip={doFlip}
          onMirror={() => setFlipX((v) => !v)}
          onPickPart={pickPart}
          onPickNet={pickNet}
        />
      </>}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div>
            <div className="brand-name">BARE<em>BOARD</em></div>
            <div className="brand-sub">boardview in the browser</div>
          </div>
        </div>
        <div className="file-chip">
          <span className={`chip-dot ${board ? 'ok' : 'idle'}`} />
          <span className="chip-name">{board ? board.name : 'no board'}</span>
          {board && <span className="chip-format">{board.format}</span>}
        </div>
        <div className="top-stats">
          {board ? <>
            <Stat label="PARTS" value={board.parts.length} />
            <Stat label="PINS" value={board.pins.length} />
            <Stat label="NETS" value={index?.nets.size ?? 0} />
            <Stat label="TEST PTS" value={board.nails.length} />
          </> : <span className="muted">waiting for a boardview file</span>}
        </div>
        <div className="top-actions">
          {/* The dark shell has no menu bar, so this is the only way back to the
              classic theme once you leave it. Without it the switch is one-way. */}
          {theme === 'dark' && (
            <button className="btn" onClick={() => setTheme('classic')}
              title="Switch to the original BoardViewer look">Classic UI</button>
          )}
          {installable && !isStandalone() && <button className="btn accent" onClick={() => void promptInstall()}>Install app</button>}
          <button className="btn desktop-only" onClick={() => setReModal(true)} title="Reverse engineering notes">RE notes</button>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>Open file <kbd>Ctrl O</kbd></button>
        </div>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden
          onChange={(e) => { if (e.target.files) void loadFromFileList(e.target.files); e.target.value = ''; }} />
        <input ref={dirRef} type="file" multiple hidden
          onChange={(e) => { if (e.target.files) void loadFromFileList(e.target.files); e.target.value = ''; }} />
      </header>

      <div className="workspace">
        <aside
          ref={drawerRef}
          id="boardview-drawer"
          className={`panel left${drawerOpen ? ' open' : ''}`}
          aria-label="Files, search and diagnostics"
          onKeyDown={onDrawerKeyDown}
        >
          <div className="drawer-close">
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close panel">✕</button>
          </div>
          <section className="source-block">
            <div className="section-title">Source</div>
            <button className="dropzone" onClick={() => fileRef.current?.click()}>
              <div className="dz-icon">↥</div>
              <div><strong>Drop boardview files</strong><span>or click to browse · .brd .bdv .bvr .cad .cst .asc .zip</span></div>
            </button>
            <div className="source-buttons">
              <button onClick={() => void openFiles([demoFile()])}>Load demo</button>
              <button onClick={() => dirRef.current?.click()} title="For folder-based TSICT / ASC boardviews">Open folder</button>
            </div>
            {library.length > 1 && (
              <div className="recent">
                <div className="mini-title">Session files</div>
                {library.slice().reverse().map((f) => (
                  <button key={f.label} className={board?.name === f.label ? 'recent-item active' : 'recent-item'}
                    onClick={() => void openFiles(f.files)}>
                    <span className="recent-ext">{extensionOf(f.label) || 'DIR'}</span>
                    <span className="recent-name">{f.label}</span>
                    <span className="recent-size">{fmtBytes(f.files.reduce((a, b) => a + b.bytes.length, 0))}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <nav className="tabs" role="tablist" aria-label="Left panel sections">
            <button role="tab" aria-selected={leftTab === 'search'} aria-controls="left-tab-body"
              className={leftTab === 'search' ? 'active' : ''} onClick={() => setLeftTab('search')}>Find</button>
            <button role="tab" aria-selected={leftTab === 'formats'} aria-controls="left-tab-body"
              className={leftTab === 'formats' ? 'active' : ''} onClick={() => setLeftTab('formats')}>Formats</button>
            <button role="tab" aria-selected={leftTab === 'diagnostics'} aria-controls="left-tab-body"
              className={leftTab === 'diagnostics' ? 'active' : ''} onClick={() => setLeftTab('diagnostics')}>Diagnostics</button>
          </nav>

          <div className="tab-body" ref={tabBodyRef} id="left-tab-body" role="tabpanel" aria-label={leftTab === 'search' ? 'Find' : leftTab === 'formats' ? 'Formats' : 'Diagnostics'}>
            {leftTab === 'search' && <>
              <div className="search-box">
                <span>⌕</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Part refdes or net name…" aria-label="Search parts and nets" />
                {query && <button onClick={() => setQuery('')} aria-label="Clear search">✕</button>}
              </div>
              <div className="mini-title">{query ? `${hits.length} matches` : 'Nets on this board'}</div>
              <div className="result-list">
                {query ? hits.map((h) => (
                  <button key={`${h.kind}-${h.label}-${h.index}`} className="result-item"
                    onClick={() => {
                      if (h.kind === 'part') handleSelect({ kind: 'part', index: h.index, key: `part:${h.index}` });
                      else { setHighlightNet(h.label); handleSelect({ kind: 'net', index: 0, key: `net:${h.label}` }); }
                    }}>
                    <span className={`result-kind ${h.kind}`}>{h.kind === 'part' ? 'REF' : 'NET'}</span>
                    <span className="result-label">{h.label}</span>
                    <span className="result-sub">{h.sub}</span>
                  </button>
                )) : netList.slice(0, 30).map((n) => (
                  <button key={n.name} className={`result-item ${highlightNet === n.name ? 'active' : ''}`}
                    onClick={() => { setHighlightNet(n.name); handleSelect({ kind: 'net', index: 0, key: `net:${n.name}` }); }}>
                    <span className="result-kind net">NET</span>
                    <span className="result-label">{n.name}</span>
                    <span className="result-sub">{n.pinIndices.length} pins</span>
                  </button>
                ))}
                {!query && !netList.length && <div className="empty-note">Open a board to see its nets.</div>}
              </div>
            </>}

            {leftTab === 'formats' && <FormatsPanel onLoad={loadSample} />}

            {leftTab === 'diagnostics' && <>
              {error && <div className="alert"><strong>Could not load</strong><span>{error}</span></div>}
              <div className="diag-card">
                <div className="mini-title">Detection</div>
                <Row k="Format" v={detection?.label || '—'} />
                <Row k="Matched by" v={detection?.matchedBy || '—'} />
                <Row k="Parser" v={detection?.supported ? 'available' : 'not available'} />
                {board && <>
                  <Row k="Bytes" v={fmtBytes(board.sourceBytes.length)} />
                  <Row k="Outline points" v={board.outline.length} />
                  <Row k="Bounds" v={`${Math.round(board.bounds.maxX - board.bounds.minX)} × ${Math.round(board.bounds.maxY - board.bounds.minY)} mil`} />
                </>}
                <p className="diag-detail">{detection?.detail}</p>
                {detection?.note && <p className="diag-note">{detection.note}</p>}
              </div>
              {board?.warnings.map((w, i) => <div className="warning" key={i}>⚠ {w}</div>)}
              {batch.length > 0 && (
                <div className="batch">
                  <div className="mini-title">Batch validation · {batch.length} files</div>
                  {batch.map((r) => (
                    <div className={`batch-row ${r.ok ? 'ok' : 'fail'}`} key={r.name} title={r.error}>
                      <span className="batch-dot" />
                      <span className="batch-name">{r.name}</span>
                      <em>{r.ok ? `${r.parts}p / ${r.pins}π / ${r.nets}n` : r.format}</em>
                    </div>
                  ))}
                  <p className="hint" style={{ marginTop: 8 }}>Drop several files at once to validate a whole sample set. Hover a failed row for the reason.</p>
                </div>
              )}
              {board && <>
                <div className="mini-title raw-head">
                  Raw header
                  <div className="seg" role="group" aria-label="Raw header view">
                    <button className={rawMode === 'text' ? 'active' : ''} aria-pressed={rawMode === 'text'} onClick={() => setRawMode('text')}>text</button>
                    <button className={rawMode === 'hex' ? 'active' : ''} aria-pressed={rawMode === 'hex'} onClick={() => setRawMode('hex')}>hex</button>
                  </div>
                </div>
                <pre className="raw-view">{rawText}</pre>
              </>}
            </>}
          </div>

          <div className="layers">
            <div className="mini-title">Layers &amp; sides</div>
            <LayerToggles layers={layers} toggle={toggle} />
          </div>
        </aside>

        <main className="stage" id="stage" tabIndex={-1} aria-label="Board canvas">
          <div className="canvas-tabs" role="tablist" aria-label="Board views">
            <button type="button" role="tab" aria-selected className="active">Main</button>
          </div>
          <div className="stage-hud" aria-hidden="true">
            <span>ZOOM {(view.scale * 1000).toFixed(0)}</span>
            <span>ROT {rotation}°</span>
            <span>{flipX || flipY ? `FLIP ${flipX ? 'H' : ''}${flipY ? 'V' : ''}` : 'FLIP —'}</span>
          </div>
          <BoardCanvas
            board={board} index={index}
            layers={{ ...layers, labels: layers.labels !== holdLabels }}
            view={view} onView={setView}
            flipX={flipX} flipY={flipY} rotation={rotation}
            selection={selection} highlightNet={highlightNet} focusParts={focusParts}
            onSelect={handleSelect} onCursor={setCursor} onFit={doFit}
            onRotate={doRotate} onFlip={doFlip} fitToken={fitToken}
            centerSelectToken={centerSelectToken}
            palette={palette}
          />
          {dragOver && <div className="drop-overlay"><div>↥</div><strong>Release to load boardview</strong><span>Files and folders are both accepted</span></div>}
          {busy && <div className="busy">Parsing…</div>}
        </main>

        <aside className="panel right" data-sheet={sheet} aria-label="Inspector">
          <button type="button" className="sheet-grip"
            aria-expanded={sheet !== 'peek'}
            aria-label={`Inspector, ${sheet === 'peek' ? 'collapsed' : sheet === 'half' ? 'half open' : 'fully open'}. Swipe or activate to resize.`}
            onPointerDown={(e) => { gripStart.current = e.clientY; }}
            onPointerUp={(e) => {
              const from = gripStart.current;
              gripStart.current = null;
              const dy = from == null ? 0 : e.clientY - from;
              // Swipe up/down one step; a plain tap cycles.
              if (dy < -26) setSheet((s) => (s === 'peek' ? 'half' : 'full'));
              else if (dy > 26) setSheet((s) => (s === 'full' ? 'half' : 'peek'));
              else cycleSheet();
            }}
            // Keyboard activation arrives as a click with detail 0; pointer taps
            // are already handled above, so only react to the keyboard path.
            onClick={(e) => { if (e.detail === 0) cycleSheet(); }}
          >
            <i aria-hidden="true" />
            <span>{sheetLabel}</span>
          </button>
          <section className="inspector">
            <div className="section-title">Inspector</div>
            {!board && <div className="empty-note">Nothing selected.</div>}
            {board && !selection && !activeNet && (
              <div className="board-summary">
                <div className="summary-hero">
                  <span className="hero-format">{board.format}</span>
                  <strong>{board.name}</strong>
                </div>
                <Row k="Board size" v={`${mm(board.bounds.maxX - board.bounds.minX)} × ${mm(board.bounds.maxY - board.bounds.minY)} mm`} />
                <Row k="Components" v={board.parts.length} />
                <Row k="Pins" v={board.pins.length} />
                <Row k="Nets" v={index?.nets.size ?? 0} />
                <Row k="Test points" v={board.nails.length} />
                <p className="hint">Click a pin to trace its net. Click a component body to inspect its pins.</p>
              </div>
            )}
            {selectedPart && board && (
              <div className="detail">
                <div className="detail-head"><span className="badge part">PART</span><h2>{selectedPart.name}</h2></div>
                <Row k="Side" v={selectedPart.side} />
                <Row k="Mount" v={selectedPart.type} />
                <Row k="Pins" v={selectedPart.pinEnd - selectedPart.pinStart} />
                {selectedPart.box && <Row k="Footprint" v={`${mm(selectedPart.box.maxX - selectedPart.box.minX)} × ${mm(selectedPart.box.maxY - selectedPart.box.minY)} mm`} />}
                <div className="mini-title">Pinout</div>
                <div className="pin-list">
                  {board.pins.slice(selectedPart.pinStart, selectedPart.pinEnd).map((pin, i) => (
                    <button key={i} className="pin-row" onClick={() => handleSelect({ kind: 'pin', index: selectedPart.pinStart + i, key: `pin:${selectedPart.pinStart + i}` })}>
                      <span>{pin.name || `P${i + 1}`}</span>
                      <strong>{pin.net}</strong>
                      <em>{pin.side[0].toUpperCase()}</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedPin && board && (
              <div className="detail">
                <div className="detail-head"><span className="badge pin">PIN</span><h2>{selectedPin.name || `#${selection!.index + 1}`}</h2></div>
                <Row k="Net" v={selectedPin.net} />
                <Row k="Part" v={selectedPin.part ? board.parts[selectedPin.part - 1]?.name || '—' : 'orphan'} />
                <Row k="Side" v={selectedPin.side} />
                <Row k="Probe" v={selectedPin.probe || '—'} />
                <Row k="Position" v={`${Math.round(selectedPin.x)}, ${Math.round(selectedPin.y)} mil`} />
                <button className="wide-btn" onClick={() => setHighlightNet(selectedPin.net)}>Trace net “{selectedPin.net}”</button>
              </div>
            )}
            {selectedNail && (
              <div className="detail">
                <div className="detail-head"><span className="badge nail">TEST POINT</span><h2>#{selectedNail.probe || selection!.index + 1}</h2></div>
                <Row k="Net" v={selectedNail.net} />
                <Row k="Side" v={selectedNail.side} />
                <Row k="Position" v={`${Math.round(selectedNail.x)}, ${Math.round(selectedNail.y)} mil`} />
              </div>
            )}
            {activeNet && (
              <div className="net-detail">
                <div className="detail-head"><span className="badge net">NET</span><h2>{activeNet.name}</h2></div>
                <Row k="Pins" v={activeNet.pinIndices.length} />
                <Row k="Parts" v={activeNet.partIds.size} />
                <div className="mini-title">Connected components</div>
                <div className="chip-list">
                  {[...activeNet.partIds].slice(0, 24).map((id) => (
                    <button key={id} onClick={() => handleSelect({ kind: 'part', index: id - 1, key: `part:${id - 1}` })}>
                      {board?.parts[id - 1]?.name || `P${id}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="re-panel">
            <button className="accordion" aria-expanded={showRe} onClick={() => setShowRe((v) => !v)}>
              <span>Reverse engineering</span><span aria-hidden="true">{showRe ? '−' : '+'}</span>
            </button>
            {showRe && <ReNotes />}
            <button className="accordion" aria-expanded={showKeys} onClick={() => setShowKeys((v) => !v)}>
              <span>{isPhone ? 'Gestures &amp; keys' : 'Keyboard map'}</span><span aria-hidden="true">{showKeys ? '−' : '+'}</span>
            </button>
            {showKeys && <KeyMap touch={isPhone} />}
          </section>
        </aside>
      </div>

      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      {layersOpen && (
        <div className="layer-pop" role="group" aria-label="Layers and sides">
          <div className="mini-title">Layers &amp; sides
            <button type="button" onClick={() => setLayersOpen(false)} aria-label="Close layers">✕</button>
          </div>
          <LayerToggles layers={layers} toggle={toggle} />
        </div>
      )}
      {layersOpen && <div className="scrim scrim-layers" onClick={() => setLayersOpen(false)} aria-hidden="true" />}

      <nav className="dock" aria-label="Primary">
        <button ref={dockFilesRef} type="button" className={drawerOpen ? 'active' : ''}
          onClick={() => { setLayersOpen(false); setDrawerOpen((v) => !v); }}
          aria-expanded={drawerOpen} aria-controls="boardview-drawer" aria-label="Files and search">
          <b aria-hidden="true">☰</b>Files
        </button>
        <button type="button" onClick={() => { setLayersOpen(false); setLeftTab('search'); setDrawerOpen(true); }}
          aria-label="Search parts and nets">
          <b aria-hidden="true">⌕</b>Find
        </button>
        <button type="button" className={sheet !== 'peek' ? 'active' : ''} onClick={cycleSheet}
          aria-expanded={sheet !== 'peek'} aria-label="Toggle inspector panel">
          <b aria-hidden="true">▤</b>Inspect
        </button>
        <button type="button" data-layers-trigger className={layersOpen ? 'active' : ''}
          onClick={() => { setDrawerOpen(false); setLayersOpen((v) => !v); }}
          aria-expanded={layersOpen} aria-label="Layers">
          <b aria-hidden="true">◈</b>Layers
        </button>
        <button type="button" onClick={doFit} aria-label="Zoom to fit">
          <b aria-hidden="true">⤢</b>Fit
        </button>
      </nav>

      <footer className="statusbar">
        <span className="status-live"><span className="live-dot" />{isStandalone() ? 'PWA · standalone' : 'web · PWA ready'}</span>
        <span>⟡ {board ? `${mm(board.bounds.maxX - board.bounds.minX)} × ${mm(board.bounds.maxY - board.bounds.minY)} mm` : '—'}</span>
        <span>XY {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)} mil` : '— , —'}</span>
        <span>ZOOM {(view.scale * 1000).toFixed(1)} px/in</span>
        <span>ROT {rotation}°</span>
        <span>FLIP {flipX ? 'H' : ''}{flipY ? 'V' : ''}{!flipX && !flipY ? '—' : ''}</span>
        <span className="status-right">{board ? `${fmtBytes(board.sourceBytes.length)} · ${board.format}` : 'no file'}</span>
      </footer>

      {about && (
        <div className="modal-shade" onClick={() => setAbout(false)}>
          <div className="modal about" role="dialog" aria-modal="true" aria-label="About BareBoard"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div><div className="mini-title">About</div><h2>BareBoard</h2></div>
              <button type="button" onClick={() => setAbout(false)} aria-label="Close about">✕</button>
            </div>
            <div className="modal-body about-body">
              <p>An independent browser reimplementation of <b>BoardViewer 2.0.1.8 / 2.0.1.9</b> for opening
                boardview files, tracing nets and inspecting parts. No proprietary code or artwork is included.</p>
              <div className="kv"><span>Version</span><strong>1.0.0</strong></div>
              <div className="kv"><span>Formats</span><strong>BRD · BRD2 · BDV · BVR · CAD · CST · ASC · ZIP</strong></div>
              <div className="kv"><span>Theme</span><strong>{theme === 'classic' ? 'Classic (original)' : 'Dark'}</strong></div>
              <p className="hint"><b>BareBoard</b> — a bare board is a PCB before any parts are placed on it, which is
                exactly what these files describe: copper, pads and nets, with no components. The name is the thing
                the tool opens.</p>
              <p className="hint">The classic theme follows the original WinForms chrome, with colours sampled from the
                manual screenshots shipped in the 2.0.1.8 archive.</p>
            </div>
          </div>
        </div>
      )}

      {options && (
        <OptionsDialog theme={theme} setTheme={setTheme} layers={layers} toggle={toggle}
          onClose={() => setOptions(false)} />
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {reModal && (
        <div className="modal-shade" onClick={() => setReModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Reverse engineering report"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div><div className="mini-title">Reverse engineering report</div><h2>What was inside the two Windows builds</h2></div>
              <button type="button" onClick={() => setReModal(false)} aria-label="Close report">✕</button>
            </div>
            <div className="modal-body"><ReNotes /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}

function Row({ k, v }: { k: string; v: string | number }) {
  return <div className="kv"><span>{k}</span><strong>{v}</strong></div>;
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={onClick}
      aria-pressed={on} aria-label={`${label} layer`}>
      <i aria-hidden="true" />{label}
    </button>
  );
}

function LayerToggles({ layers, toggle }: { layers: Layers; toggle: (k: keyof Layers) => void }) {
  return (
    <div className="layer-grid">
      <Toggle on={layers.outline} onClick={() => toggle('outline')} label="Outline" />
      <Toggle on={layers.pins} onClick={() => toggle('pins')} label="Pins" />
      <Toggle on={layers.nails} onClick={() => toggle('nails')} label="Test nails" />
      <Toggle on={layers.labels} onClick={() => toggle('labels')} label="Labels" />
      <Toggle on={layers.nets} onClick={() => toggle('nets')} label="Net lens" />
      <Toggle on={layers.grid} onClick={() => toggle('grid')} label="Grid" />
      <Toggle on={layers.top} onClick={() => toggle('top')} label="Top side" />
      <Toggle on={layers.bottom} onClick={() => toggle('bottom')} label="Bottom side" />
      <Toggle on={layers.tooltip} onClick={() => toggle('tooltip')} label="Tooltip" />
    </div>
  );
}

function FormatsPanel({ onLoad }: { onLoad: (s: SampleSpec) => void }) {
  const rows: [string, string, string][] = [
    ['BRD', 'Classic text / encoded header', 'full'],
    ['BRD2', 'BRDOUT + NETS variant', 'full'],
    ['BDV', 'Encoded ASC bundle', 'full'],
    ['BVR / BVR3', 'BVRAW_FORMAT_1 / _3', 'full'],
    ['CAD', '###Panel Added / C_PIN', 'full'],
    ['CST', 'Binary CPad tables', 'full'],
    ['ASC / TSICT', 'format / pins / nails.asc folder', 'full'],
    ['ZIP', 'Container with any of the above', 'full'],
    ['FZ / CAE', 'Vendor-encrypted', 'key required'],
    ['XZZPCB', 'XOR-obfuscated', 'detect only'],
    ['GenCAD / AD', 'CAD netlists, not boardviews', 'n/a'],
  ];
  return <div className="formats">
    <p className="hint">Formats were reimplemented from public format descriptions and the open-source OpenBoardView reference parsers. No proprietary code was copied.</p>
    {rows.map(([name, desc, state]) => (
      <div className="format-row" key={name}>
        <div><strong>{name}</strong><span>{desc}</span></div>
        <em className={state === 'full' ? 'ok' : 'na'}>{state}</em>
      </div>
    ))}
    <div className="mini-title">Reference samples · click to load</div>
    <div className="sample-list">
      {SAMPLES.map((s) => (
        <button key={s.label} onClick={() => onLoad(s)}>
          <span>{s.label}</span><em>{s.tag}</em>
        </button>
      ))}
    </div>
    <p className="hint" style={{ marginTop: 12 }}>These are synthetic boards generated for format validation. Add your real files to <code>samples/</code> and run <code>npm run validate</code>, or drop them into the app.</p>
  </div>;
}

function ReNotes() {
  return <div className="re-notes">
    <h3>Decompiled, not string-mined <span>ILSpy 8.2 + custom ECMA-335 reader</span></h3>
    <ul>
      <li>2.0.1.8: <b>167 types / 211,532 lines</b> of C#, plus a 24.1 MB IL dump.</li>
      <li>2.0.1.9: <b>131 types / 136,021 lines</b>. Volante: 90 types / 18,073 lines.</li>
      <li>Only five identifiers survived obfuscation: Translator, TranslationHelper, Settings, DeviceFileType, ConfusedByAttribute.</li>
      <li>Volante is <b>not</b> a format engine — it is Krzysztof Kowalczyk's object database, used for the parts catalogue.</li>
    </ul>
    <h3>ConfuserEx v1.0.0 <span>on both executables</span></h3>
    <ul>
      <li>Control flow flattened into <code>switch ((uint)n ^ 0x5313C92D) % k</code> dispatchers; calls routed through proxy stubs.</li>
      <li>Constants encrypted: <code>id = (id * 1624843015) ^ 0x23F6FE5D</code>, tag = top 2 bits, offset = low 30 bits × 4, then <code>[len][UTF-8]</code>.</li>
      <li>The whole 24 MB of IL contains <b>25 ldstr instructions, all empty</b>. No plaintext survives in the binary.</li>
      <li>Resources decrypted with PBKDF2 + Rijndael; 38 randomised manifest resources.</li>
    </ul>
    <h3>UI text recovered from <code>Lang/*.lng</code></h3>
    <p>Those files are <code>key=value</code> pairs where the key is the English source string — 163 keys in 2.0.1.8, 322 in 2.0.1.9. Every shortcut, menu label and error message on this page comes from them, not from guessing.</p>
    <h3>The "Enhanced" plug-in is 易语言 <span>native, packed</span></h3>
    <p>A separate 32-bit EPL executable, not a DLL and not MFC-authored. It embeds itself with <code>SetParent</code> + <code>SetWindowsHookEx</code> and talks via <code>SendMessage</code>. It imports no <code>keybd_event</code>/<code>SendInput</code>, so it does not inject synthetic input.</p>
    <h3>2.0.1.9 adds a catalogue</h3>
    <p>195 new strings, all asset management: categories, brands, devices, files, storage, auto-backup, multi-tab UI. That explains the SQLite and Volante dependencies.</p>
    <h3>Deliberately not ported</h3>
    <p>FZ/CAE vendor keys, the XZZPCB XOR key, the SQLite catalogue, the plug-in's window hooking, the auto-updater, and any proprietary binary or artwork.</p>
    <h3>The classic theme is measured, not guessed <span>Options ▸ Theme</span></h3>
    <p>The light chrome is sampled from the four screenshots embedded in <code>How to set up and use BoardViewer.pdf</code>
      inside the 2.0.1.8 archive: control face <code>#f0f0f0</code>, window <code>#ffffff</code>, control border
      <code>#898c95</code>, black text. Two more constants survive in the decompiled IL —
      <code>FromArgb(255,244,247,252)</code> and the selection blue <code>FromArgb(255,51,153,255)</code>.
      The board's own drawing colours are <em>not</em> recoverable: they are built from floats inside the
      encrypted constant pool, and the manual never shows a loaded board. The light canvas therefore uses the
      industry convention (top side red, bottom side blue).</p>
    <h3>Options ▸ Options… <span>four tabs, one of them visible</span></h3>
    <p>The manual only shows the <b>Graphics</b> tab, so the dialog's shape is certain but three of its four
      panels are not. The tab names — General, Graphics, Associations, Network — survive as keys in
      <code>Lang/*.lng</code>, as do <code>Graphics Acceleration:</code>, <code>Direct2D</code>, <code>GDI</code>
      and <code>GDI Quality:</code>. General, Associations and Network are reconstructed from those keys and
      filled with settings this build actually has. A browser offers neither Direct2D nor GDI, so the Graphics
      tab drives the renderer switch the canvas does expose.</p>
  </div>;
}

function KeyMap({ touch }: { touch: boolean }) {
  const rows: [string, string][] = [
    ['Ctrl + O', 'Open file'], ['F / dbl-click', 'Zoom to fit'], ['R', 'Rotate 90° CW'],
    ['Comma / Period', 'Rotate 90° CCW / CW'], ['Space', 'Flip board'], ['M', 'Mirror board'],
    ['A / W / S / D', 'Move centre mark'], ['Arrows', 'Pan board'], ['+ / − / wheel', 'Zoom'],
    ['E / Enter', 'Select under crosshair'], ['Tab', 'Cycle inspector tabs'],
    ['H', 'Toggle labels'], ['Ctrl (hold)', 'Invert labels'], ['Right-drag', 'Magnifier'],
    ['Esc', 'Clear selection'],
  ];
  const gestures: [string, string][] = [
    ['Drag', 'Pan board'], ['Pinch', 'Zoom in / out'], ['Long press', 'Magnifier, release to return'],
    ['Tap', 'Select pin or component'], ['Tap handle', 'Collapse / half / full sheet'],
  ];
  return <>
    {touch && <>
      <div className="mini-title">Touch</div>
      <div className="keymap touch">{gestures.map(([k, v]) => <div key={k}><kbd>{k}</kbd><span>{v}</span></div>)}</div>
    </>}
    <div className="mini-title">Keyboard</div>
    <div className="keymap">{rows.map(([k, v]) => <div key={k}><kbd>{k}</kbd><span>{v}</span></div>)}</div>
  </>;
}

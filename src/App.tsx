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
import { CommandPalette } from './components/CommandPalette';
import { ExplorerPanel, SAMPLES, type BatchRow, type RealPartEntry, type SampleSpec } from './components/ExplorerPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { CanvasDock } from './components/CanvasDock';
import { BrandMark } from '@/components/BrandMark';
import { MaterialIcon } from '@/components/MaterialIcon';
import { packageShortLabel } from './components/PackageGlyph';
import { BoardCanvas, type BoardCanvasHandle } from './render/BoardCanvas';
import { classifyPartPackage, type Camera3D, type RenderMode } from './render/realistic3d';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { PortalContainerProvider } from '@/components/ui/portal-context';
import { cn } from '@/lib/utils';

const DEFAULT_LAYERS: Layers = {
  outline: true,
  pins: true,
  nails: false,
  labels: true,
  grid: true,
  nets: false,
  top: true,
  bottom: false,
  tooltip: true,
};

const ACCEPT = '.brd,.bdv,.bvr,.cad,.cst,.asc,.bom,.zip,.fz,.cae,.xzzpcb,.tvw,.bv,.gr,.f2b';

const LAYER_META: readonly [keyof Layers, string, 'top' | 'bottom' | undefined][] = [
  ['outline', 'Outline', undefined],
  ['pins', 'Pins & Pads', undefined],
  ['nails', 'Test Nails', undefined],
  ['labels', 'RefDes Labels', undefined],
  ['nets', 'Net Lens', undefined],
  ['grid', 'Grid', undefined],
  ['top', 'Top Side', 'top'],
  ['bottom', 'Bottom Side', 'bottom'],
  ['tooltip', 'Tooltips', undefined],
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const mm = (mil: number) => (mil * 0.0254).toFixed(2);

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

export default function App() {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [view, setView] = useState<View>({ scale: 0.2, panX: 0, panY: 0 });
  const [fitToken, setFitToken] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [holdLabels, setHoldLabels] = useState(false);
  const [centerSelectToken, setCenterSelectToken] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>('realistic');
  const [cam3d, setCam3d] = useState<Camera3D>({ pitchDeg: 48, yawDeg: -16 });
  const [dragMode3d, setDragMode3d] = useState<'orbit' | 'pan'>('orbit');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlightNet, setHighlightNet] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [browseFilter, setBrowseFilter] = useState<'all' | 'parts' | 'nets'>('all');
  const [pinFilter, setPinFilter] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [library, setLibrary] = useState<{ label: string; files: InputFile[] }[]>([]);
  const [batch, setBatch] = useState<BatchRow[]>([]);
  const [installable, setInstallable] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'search' | 'formats' | 'diagnostics'>('search');
  const [rawMode, setRawMode] = useState<'text' | 'hex'>('text');

  // Desktop collapsible + resizable studio rails
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(276);
  const [rightWidth, setRightWidth] = useState(308);

  // Dialogs
  const [keysModal, setKeysModal] = useState(false);
  const [reModal, setReModal] = useState(false);
  const [about, setAbout] = useState(false);
  const [options, setOptions] = useState(false);

  // Mobile workbench state (Vaul Drawers + Classic Mobile fallback sheet)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [mobileSnap, setMobileSnap] = useState<number | string | null>(0.45);
  const [classicSheet, setClassicSheet] = useState<'peek' | 'half' | 'full'>('peek');

  const [theme, setThemeState] = useState<Theme>(readTheme);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    saveTheme(t);
  }, []);
  const palette = PALETTES[theme];

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.classList.toggle('dark', theme === 'dark');
    const isLight = theme === 'light' || theme === 'classic';
    el.style.colorScheme = isLight ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'classic' ? '#f0f0f0' : theme === 'light' ? '#f8fafc' : '#090d13',
    );
  }, [theme]);

  const canvasHandleRef = useRef<BoardCanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const classicGripStart = useRef<number | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const isPhone = useMediaQuery('(max-width: 860px)');
  const isCompactDesktop = useMediaQuery('(max-width: 1180px)');

  const index = useMemo(() => (board ? buildIndex(board) : null), [board]);
  const hits = useMemo(() => (index && board ? search(index, query, board, 250) : []), [index, board, query]);
  const focusParts = useMemo(() => new Set(hits.filter((h) => h.kind === 'part').map((h) => h.index)), [hits]);
  const netList = useMemo(
    () => (index ? [...index.nets.values()].sort((a, b) => b.pinIndices.length - a.pinIndices.length) : []),
    [index],
  );

  const realPartEntries = useMemo<RealPartEntry[]>(() => {
    if (!board) return [];
    const list: RealPartEntry[] = [];
    board.parts.forEach((part, idx) => {
      if (!part.isDummy) list.push({ part, index: idx, kind: classifyPartPackage(part).kind });
    });
    return list;
  }, [board]);

  const realParts = useMemo(() => realPartEntries.map((e) => e.part), [realPartEntries]);
  const partNames = useMemo(() => realParts.map((p) => p.name), [realParts]);
  const netNames = useMemo(() => netList.map((n) => n.name), [netList]);

  const packageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { kind } of realPartEntries) {
      const label = packageShortLabel(kind);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [realPartEntries]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const openFiles = useCallback(
    async (inputs: InputFile[]) => {
      if (!inputs.length) return;
      setBusy(true);
      setError(null);
      try {
        const isBatch = inputs.length > 1 && !inputs.some((f) => extensionOf(f.name) === '.asc');
        const results = isBatch ? inputs.map((f) => loadBoard([f])) : [loadBoard(inputs)];

        if (isBatch) {
          setBatch(
            results.map((r, i) => ({
              name: inputs[i].name,
              format: r.board?.format || r.detection.label,
              ok: Boolean(r.board),
              parts: r.board?.parts.length || 0,
              pins: r.board?.pins.length || 0,
              nets: r.board ? new Set(r.board.pins.map((p) => p.net)).size : 0,
              error: r.error,
            })),
          );
        } else {
          setBatch([]);
        }

        const first = results.find((r) => r.board);
        const result = first || results[0];
        setDetection(result.detection);
        if (first?.board) {
          const b = first.board;
          const hasTop = b.parts.some((p) => p.side === 'top') || b.pins.some((p) => p.side === 'top');
          const hasBottom = b.parts.some((p) => p.side === 'bottom') || b.pins.some((p) => p.side === 'bottom');
          setBoard(b);
          setLayers((l) => ({
            ...l,
            top: hasTop || !hasBottom,
            bottom: !hasTop && hasBottom,
          }));
          setSelection(null);
          setHighlightNet(null);
          setQuery('');
          setPinFilter('');
          setFlipX(false);
          setFlipY(false);
          setRotation(0);
          setFitToken((t) => t + 1);
          const label = b.name;
          setLibrary((prev) => [...prev.filter((f) => f.label !== label), { label, files: inputs }].slice(-6));
          if (isPhone) {
            setDrawerOpen(false);
            setMobileInspectorOpen(false);
          }
          notify(
            isBatch
              ? `Validated ${inputs.length} files · ${results.filter((r) => r.board).length} parsed`
              : `Loaded ${first.board.name} · ${first.board.format}`,
          );
        } else {
          setError(result.error || 'This file could not be parsed.');
          setLeftTab('diagnostics');
          if (isPhone) setDrawerOpen(true);
          else setLeftOpen(true);
          notify('Format not supported — see Diagnostics');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error while reading the file.');
      } finally {
        setBusy(false);
      }
    },
    [notify, isPhone],
  );

  useEffect(() => {
    initPwa();
    const unsub = subscribeInstall(setInstallable);
    consumeLaunchFiles((files) => void openFiles(files));
    const dirInput = dirRef.current;
    if (dirInput) dirInput.setAttribute('webkitdirectory', '');
    const t = window.setTimeout(() => {
      if (!window.location.search.includes('action=open')) void openFiles([demoFile()]);
    }, 60);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [openFiles]);

  const loadFromFileList = useCallback(
    async (list: FileList) => {
      await openFiles(await filesFromFileList(list));
    },
    [openFiles],
  );

  const loadSample = useCallback(
    async (spec: SampleSpec) => {
      try {
        const inputs = await Promise.all(
          spec.files.map(async (p) => {
            const res = await fetch(new URL(p, document.baseURI));
            if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
            return { name: p.split('/').pop() || p, bytes: new Uint8Array(await res.arrayBuffer()) };
          }),
        );
        await openFiles(inputs);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the bundled sample.');
        setLeftTab('diagnostics');
      }
    },
    [openFiles],
  );

  const doFit = useCallback(() => setFitToken((t) => t + 1), []);
  const doRotate = useCallback((d: number) => setRotation((r) => (r + d + 360) % 360), []);
  const doFlip = useCallback(() => setFlipY((v) => !v), []);

  const closeBoard = useCallback(() => {
    setBoard(null);
    setSelection(null);
    setHighlightNet(null);
    setQuery('');
    setPinFilter('');
    setDetection(null);
    setError(null);
    setBatch([]);
    setFlipX(false);
    setFlipY(false);
    setRotation(0);
    setMobileInspectorOpen(false);
    notify('Board closed');
  }, [notify]);

  const handleSelect = useCallback(
    (s: Selection | null, centerZoom = false) => {
      setSelection(s);
      setPinFilter('');
      if (!s || !board) {
        setHighlightNet(null);
        if (isPhone) {
          setMobileInspectorOpen(false);
          setClassicSheet('peek');
        }
        return;
      }
      let targetSide: 'top' | 'bottom' | 'both' | undefined;
      if (s.kind === 'pin') {
        const pin = board.pins[s.index];
        setHighlightNet(pin?.net || null);
        targetSide = pin?.side;
      } else if (s.kind === 'nail') {
        const nail = board.nails[s.index];
        setHighlightNet(nail?.net || null);
        targetSide = nail?.side;
      } else if (s.kind === 'part') {
        setHighlightNet(null);
        targetSide = board.parts[s.index]?.side;
      }
      if (targetSide === 'top' || targetSide === 'bottom') {
        setLayers((l) => {
          if (l[targetSide!]) return l;
          if (l.top !== l.bottom) return { ...l, top: targetSide === 'top', bottom: targetSide === 'bottom' };
          return { ...l, [targetSide!]: true };
        });
      } else if (targetSide === 'both') {
        setLayers((l) => (l.top || l.bottom ? l : { ...l, top: true, bottom: false }));
      }
      if (centerZoom) setFocusToken((t) => t + 1);
      setRightOpen(true);
      if (isPhone) {
        setDrawerOpen(false);
        setMobileSnap(0.45);
        setMobileInspectorOpen(true);
        setClassicSheet((cur) => (cur === 'peek' ? 'half' : cur));
      }
    },
    [board, isPhone],
  );

  const pickPart = useCallback(
    (name: string) => {
      if (!board) return;
      const i = board.parts.findIndex((p) => !p.isDummy && p.name === name);
      if (i >= 0) handleSelect({ kind: 'part', index: i, key: `part:${i}` }, true);
    },
    [board, handleSelect],
  );

  const pickNet = useCallback(
    (name: string) => {
      setHighlightNet(name);
      handleSelect({ kind: 'net', index: 0, key: `net:${name}` }, true);
    },
    [handleSelect],
  );

  const onCamStateChange = useCallback((cam: Camera3D, mode: 'orbit' | 'pan') => {
    setCam3d(cam);
    setDragMode3d(mode);
  }, []);

  const zoomCenter = useCallback((factor: number) => {
    if (canvasHandleRef.current) {
      canvasHandleRef.current.zoomBy(factor);
    } else {
      setView((v) => ({ ...v, scale: Math.min(Math.max(v.scale * factor, 0.0005), 40) }));
    }
  }, []);

  // Desktop panel drag-resizing
  const startResizeLeft = (e: React.PointerEvent) => {
    if (isPhone) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    const onMove = (ev: PointerEvent) => {
      setLeftWidth(Math.min(420, Math.max(220, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResizeRight = (e: React.PointerEvent) => {
    if (isPhone) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    const onMove = (ev: PointerEvent) => {
      setRightWidth(Math.min(440, Math.max(250, startW - (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setHoldLabels(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileRef.current?.click();
        return;
      }
      const target = e.target as HTMLElement;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('[cmdk-root]'))) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      const pan = (dx: number, dy: number) => setView((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      switch (e.key.toLowerCase()) {
        case '/':
          e.preventDefault();
          setCmdOpen(true);
          break;
        case '[':
          setLeftOpen((v) => !v);
          break;
        case ']':
          setRightOpen((v) => !v);
          break;
        case 'f':
          doFit();
          break;
        case 'r':
          doRotate(90);
          break;
        case ' ':
          e.preventDefault();
          doFlip();
          break;
        case 'escape':
          if (cmdOpen || options || reModal || keysModal || about) break;
          if (drawerOpen) {
            setDrawerOpen(false);
            break;
          }
          if (layersOpen) {
            setLayersOpen(false);
            break;
          }
          if (mobileInspectorOpen) {
            setMobileInspectorOpen(false);
            break;
          }
          handleSelect(null);
          break;
        case 'h':
          setLayers((l) => ({ ...l, labels: !l.labels }));
          break;
        case 'g':
          setLayers((l) => ({ ...l, grid: !l.grid }));
          break;
        case 't':
          setLayers((l) => ({ ...l, top: true, bottom: false }));
          break;
        case 'b':
          setLayers((l) => ({ ...l, top: false, bottom: true }));
          break;
        case 'v':
          setRenderMode((m) => (m === 'cad' ? 'realistic' : m === 'realistic' ? '3d' : 'cad'));
          break;
        case '3':
          setRenderMode((m) => (m === '3d' ? 'realistic' : '3d'));
          break;
        case ',':
          doRotate(-90);
          break;
        case '.':
          doRotate(90);
          break;
        case 'm':
          setFlipX((v) => !v);
          break;
        case 'tab': {
          e.preventDefault();
          const order = ['search', 'formats', 'diagnostics'] as const;
          setLeftTab((t) => order[(order.indexOf(t) + 1) % order.length]);
          if (isPhone) setDrawerOpen(true);
          else setLeftOpen(true);
          break;
        }
        case 'enter':
        case 'e':
          e.preventDefault();
          setCenterSelectToken((t) => t + 1);
          break;
        case '+':
        case '=':
          zoomCenter(1.25);
          break;
        case '-':
          zoomCenter(0.8);
          break;
        case 'a':
          pan(60, 0);
          break;
        case 'd':
          pan(-60, 0);
          break;
        case 'w':
          pan(0, 60);
          break;
        case 's':
          pan(0, -60);
          break;
        case 'arrowleft':
          e.preventDefault();
          pan(60, 0);
          break;
        case 'arrowright':
          e.preventDefault();
          pan(-60, 0);
          break;
        case 'arrowup':
          e.preventDefault();
          pan(0, 60);
          break;
        case 'arrowdown':
          e.preventDefault();
          pan(0, -60);
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setHoldLabels(false);
    };
    const onBlur = () => setHoldLabels(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    doFit,
    doRotate,
    doFlip,
    handleSelect,
    zoomCenter,
    drawerOpen,
    layersOpen,
    mobileInspectorOpen,
    reModal,
    keysModal,
    about,
    options,
    cmdOpen,
    isPhone,
  ]);

  const onDrop = async (e: ReactDragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = await filesFromDataTransfer(e.dataTransfer);
    await openFiles(files);
  };

  const toggle = useCallback((key: keyof Layers) => setLayers((l) => ({ ...l, [key]: !l[key] })), []);
  const selectSide = useCallback((side: 'top' | 'bottom' | 'both') => {
    setLayers((l) => ({
      ...l,
      top: side === 'top' || side === 'both',
      bottom: side === 'bottom' || side === 'both',
    }));
  }, []);

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
  const selectedPartIndex = selection?.kind === 'part' ? selection.index : -1;
  const selectedPin = selection?.kind === 'pin' && board ? board.pins[selection.index] : null;
  const selectedNail = selection?.kind === 'nail' && board ? board.nails[selection.index] : null;
  const activeNet = highlightNet && index ? index.nets.get(highlightNet) ?? null : null;

  const peekHeadline = useMemo(() => {
    if (selectedPart) {
      const spec = classifyPartPackage(selectedPart);
      return `${selectedPart.name} (${packageShortLabel(spec.kind)}, ${selectedPart.pinEnd - selectedPart.pinStart}p)`;
    }
    if (selectedPin) {
      return `Pin ${selectedPin.name || selectedPin.number || `#${selection!.index + 1}`} — ${selectedPin.net}`;
    }
    if (selectedNail) {
      return `Test Pt #${selectedNail.probe || selection!.index + 1} — ${selectedNail.net}`;
    }
    if (activeNet) {
      return `Net ${activeNet.name} (${activeNet.pinIndices.length}p)`;
    }
    if (board) {
      return `${board.name} — ${realParts.length.toLocaleString()}p, ${netNames.length.toLocaleString()}n`;
    }
    return 'Inspector — No board loaded';
  }, [selectedPart, selectedPin, selectedNail, activeNet, board, realParts.length, netNames.length, selection]);

  const menus = buildMenus({
    boardName: board?.name ?? null,
    format: board?.format ?? null,
    parts: realParts.length,
    pins: board?.pins.length ?? 0,
    nets: index?.nets.size ?? 0,
    tests: board?.nails.length ?? 0,
    layers,
    theme,
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
    showKeys: () => setKeysModal(true),
    showRe: () => setReModal(true),
    about: () => setAbout(true),
    openOptions: () => setOptions(true),
    centerSelect: () => setCenterSelectToken((t) => t + 1),
    clearSelection: () => handleSelect(null),
    closeBoard,
    canClose: Boolean(board),
  });

  const topPartCount = useMemo(() => realParts.filter((p) => p.side === 'top').length, [realParts]);
  const botPartCount = useMemo(() => realParts.filter((p) => p.side === 'bottom').length, [realParts]);
  const topPinCount = useMemo(() => (board ? board.pins.filter((p) => p.side === 'top').length : 0), [board]);
  const botPinCount = useMemo(() => (board ? board.pins.filter((p) => p.side === 'bottom').length : 0), [board]);

  const toggleStudioTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const onDrawerKeyDown = (e: ReactKeyboardEvent) => {
    if (!isPhone || theme !== 'classic' || !drawerOpen || e.key !== 'Tab') return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href]',
    );
    if (!focusable || !focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const explorerNode = (
    <ExplorerPanel
      board={board}
      detection={detection}
      error={error}
      batch={batch}
      library={library}
      query={query}
      onQueryChange={setQuery}
      browseFilter={browseFilter}
      onBrowseFilterChange={setBrowseFilter}
      leftTab={leftTab}
      onLeftTabChange={setLeftTab}
      rawMode={rawMode}
      onRawModeChange={setRawMode}
      rawText={rawText}
      hits={hits}
      realPartEntries={realPartEntries}
      netList={netList}
      selectedPartIndex={selectedPartIndex}
      highlightNet={highlightNet}
      theme={theme}
      isPhone={isPhone}
      onSelect={handleSelect}
      onSelectNet={pickNet}
      onOpenFiles={(files) => void openFiles(files)}
      onOpenFileDialog={() => fileRef.current?.click()}
      onOpenFolderDialog={() => dirRef.current?.click()}
      onLoadDemo={() => void openFiles([demoFile()])}
      onCloseBoard={closeBoard}
      onLoadSample={(s) => void loadSample(s)}
      onToggleTheme={toggleStudioTheme}
      onOpenOptions={() => {
        setDrawerOpen(false);
        setOptions(true);
      }}
      onOpenKeys={() => {
        setDrawerOpen(false);
        setKeysModal(true);
      }}
      onOpenReNotes={() => {
        setDrawerOpen(false);
        setReModal(true);
      }}
      onOpenAbout={() => {
        setDrawerOpen(false);
        setAbout(true);
      }}
    />
  );

  const inspectorNode = (hideHeader?: boolean) => (
    <InspectorPanel
      board={board}
      selection={selection}
      activeNet={activeNet}
      realPartCount={realParts.length}
      topPartCount={topPartCount}
      botPartCount={botPartCount}
      topPinCount={topPinCount}
      botPinCount={botPinCount}
      netCount={netNames.length}
      packageCounts={packageCounts}
      pinFilter={pinFilter}
      onPinFilterChange={setPinFilter}
      isPhone={isPhone}
      onSelect={handleSelect}
      onHighlightNet={setHighlightNet}
      onFitNet={pickNet}
      onCenterSelection={() => setFocusToken((t) => t + 1)}
      onOpenKeys={() => setKeysModal(true)}
      onOpenReNotes={() => setReModal(true)}
      onOpenAbout={() => setAbout(true)}
      onCloseMobileSheet={isPhone && theme !== 'classic' ? () => setMobileInspectorOpen(false) : undefined}
      hideHeader={hideHeader}
    />
  );

  const desktopCols = useMemo(() => {
    if (isPhone || theme === 'classic') return undefined;
    const lw = isCompactDesktop ? Math.min(leftWidth, 248) : leftWidth;
    const rw = isCompactDesktop ? Math.min(rightWidth, 268) : rightWidth;
    return `${leftOpen ? lw : 0}px minmax(0, 1fr) ${rightOpen ? rw : 0}px`;
  }, [isPhone, theme, isCompactDesktop, leftWidth, rightWidth, leftOpen, rightOpen]);

  return (
    <div
      ref={setPortalContainer}
      className={cn(
        'app bg-background text-foreground',
        dragOver && 'is-dragging',
        !leftOpen && 'no-left',
        !rightOpen && 'no-right',
      )}
      data-theme={theme}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <PortalContainerProvider value={portalContainer}>
        <a
          className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:z-50 focus:-translate-x-1/2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:font-bold focus:text-primary-foreground"
          href="#stage"
        >
          Skip to board canvas
        </a>

        {theme === 'classic' && (
          <>
            <MenuBar
              menus={menus}
              title={board ? `BareBoard — ${board.name}` : 'BareBoard'}
              subtitle={board ? board.format : undefined}
            />
            <Toolbar
              board={board}
              layers={layers}
              renderMode={renderMode}
              partNames={partNames}
              netNames={netNames}
              onSelectSide={selectSide}
              onRenderMode={setRenderMode}
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
          </>
        )}

        {/* STUDIO RESPONSIVE TOPBAR (Desktop & Mobile) */}
        <header className="topbar flex h-12 min-w-0 items-center justify-between gap-2 border-b border-border bg-card px-2.5 z-20 font-sans">
          <div className="top-left-group flex min-w-0 items-center gap-2">
            {isPhone ? (
              <Button
                size="icon"
                variant={drawerOpen ? 'active' : 'outline'}
                onClick={() => setDrawerOpen((v) => !v)}
                aria-label="Open Explorer drawer"
                aria-expanded={drawerOpen}
              >
                <MaterialIcon name="menu" size={18} />
              </Button>
            ) : (
              <Button
                size="icon"
                variant={leftOpen ? 'active' : 'outline'}
                onClick={() => setLeftOpen((v) => !v)}
                title="Toggle Explorer panel ([)"
                aria-label="Toggle Explorer panel"
                aria-pressed={leftOpen}
              >
                <MaterialIcon name="dock_to_left" size={18} filled={leftOpen} />
              </Button>
            )}

            <div className="brand flex shrink-0 items-center gap-2">
              <div
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/75"
              >
                <BrandMark size={20} />
              </div>
              <span className="hidden sm:inline text-[13px] font-semibold tracking-tight text-foreground">
                BareBoard
              </span>
            </div>

            <div
              className="file-chip flex min-w-0 max-w-[125px] sm:max-w-[240px] items-center gap-1.5 rounded-md border border-border bg-secondary/70 px-2 py-1 sm:px-2.5"
              title={board ? `${board.name} (${board.format})` : 'No board loaded'}
            >
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {board ? board.name : 'No board'}
              </span>
              {board && (
                <Badge variant="default" className="hidden sm:inline-flex">
                  {board.format}
                </Badge>
              )}
            </div>
          </div>

          {/* Center Interactive Command Search Trigger */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            aria-label="Open Command Palette (Search parts, nets & commands)"
            className="hidden md:flex h-8 w-full max-w-[380px] items-center gap-2 rounded-md border border-border bg-secondary/80 px-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MaterialIcon name="search" size={16} className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {board
                ? `Search ${realParts.length.toLocaleString()} parts or ${netNames.length.toLocaleString()} nets…`
                : 'Commands & board search…'}
            </span>
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <div className="top-actions flex shrink-0 items-center gap-1.5">
            {board && (
              <div
                className="hidden xl:flex items-center gap-2.5 px-1.5 text-[11px] text-muted-foreground"
                aria-label="Board summary"
              >
                <span className="tabular-nums">
                  <strong className="font-semibold text-foreground">{realParts.length.toLocaleString()}</strong> parts
                </span>
                <span className="tabular-nums">
                  <strong className="font-semibold text-foreground">{netNames.length.toLocaleString()}</strong> nets
                </span>
              </div>
            )}

            {isPhone && (
              <Button
                size="icon"
                variant="outline"
                onClick={() => setCmdOpen(true)}
                aria-label="Search parts, nets and commands"
              >
                <MaterialIcon name="search" size={18} />
              </Button>
            )}

            <Button
              variant="primary"
              size={isPhone ? 'icon' : 'default'}
              onClick={() => fileRef.current?.click()}
              title="Open boardview file (Ctrl+O)"
              aria-label="Open boardview file"
            >
              <MaterialIcon name="upload_file" size={16} />
              {!isPhone && <span>Open</span>}
            </Button>

            {!isPhone && (
              <Button
                variant="default"
                size="default"
                onClick={() => dirRef.current?.click()}
                title="Open folder of .asc boardview files"
              >
                <MaterialIcon name="folder_open" size={16} />
                <span>Folder</span>
              </Button>
            )}

            <Button
              size="icon"
              variant="outline"
              onClick={toggleStudioTheme}
              title={theme === 'dark' ? 'Switch to Studio Light' : 'Switch to Studio Dark'}
              aria-label="Toggle light or dark theme"
            >
              <MaterialIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={17} />
            </Button>

            <Button
              size="icon"
              variant="outline"
              onClick={() => setOptions(true)}
              title="Settings & Classic Theme"
              aria-label="Settings"
            >
              <MaterialIcon name="tune" size={17} />
            </Button>

            {!isPhone && (
              <Button
                size="icon"
                variant={rightOpen ? 'active' : 'outline'}
                onClick={() => setRightOpen((v) => !v)}
                title="Toggle Inspector panel (])"
                aria-label="Toggle Inspector panel"
                aria-pressed={rightOpen}
              >
                <MaterialIcon name="dock_to_right" size={18} filled={rightOpen} />
              </Button>
            )}

            {installable && !isStandalone() && (
              <Button variant="default" size="sm" onClick={() => void promptInstall()}>
                Install
              </Button>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files) void loadFromFileList(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={dirRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void loadFromFileList(e.target.files);
              e.target.value = '';
            }}
          />
        </header>

        {/* WORKSPACE: DESKTOP RAILS + CANVAS STAGE + MOBILE VAUL WORKBENCH */}
        <div
          className={cn(
            'workspace min-h-0 min-w-0',
            theme !== 'classic' && !isPhone && 'grid',
            theme !== 'classic' && isPhone && 'grid grid-cols-1',
          )}
          style={desktopCols ? { gridTemplateColumns: desktopCols } : undefined}
        >
          {/* DESKTOP / CLASSIC LEFT EXPLORER RAIL */}
          {(theme === 'classic' || !isPhone) && (
            <aside
              ref={drawerRef}
              id="boardview-drawer"
              onKeyDown={onDrawerKeyDown}
              aria-label="Explorer, Samples and Diagnostics"
              className={cn(
                'panel left relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-card',
                theme === 'classic' && drawerOpen && 'open',
                !leftOpen && theme !== 'classic' && 'border-r-0 opacity-0 pointer-events-none',
              )}
            >
              {theme === 'classic' && (
                <div className="drawer-close">
                  <span className="drawer-title">Explorer</span>
                  <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close panel">
                    ✕
                  </button>
                </div>
              )}
              {explorerNode}
              {theme === 'classic' && (
                <div className="layers">
                  <div className="mini-title">Layers &amp; sides</div>
                  <LayerToggles layers={layers} toggle={toggle} />
                </div>
              )}
              {theme !== 'classic' && !isPhone && leftOpen && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Explorer panel"
                  onPointerDown={startResizeLeft}
                  onDoubleClick={() => setLeftWidth(276)}
                  title="Drag to resize · Double-click to reset"
                  className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/50"
                />
              )}
            </aside>
          )}

          {/* CENTER BOARD CANVAS STAGE */}
          <main className="stage relative min-h-0 min-w-0 overflow-hidden" id="stage" tabIndex={-1} aria-label="Board canvas">
            {theme === 'classic' && (
              <div className="canvas-tabs" role="tablist" aria-label="Board views">
                <button type="button" role="tab" aria-selected className="active">
                  Main
                </button>
              </div>
            )}

            {/* Floating Segmented Top/Bottom/Both + View Mode Switcher */}
            {theme !== 'classic' && (
              <div
                className="no-scrollbar pointer-events-none absolute top-2.5 inset-x-2 z-10 flex items-center justify-center gap-1.5 overflow-x-auto"
                role="group"
                aria-label="Board sides and render mode"
              >
                <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border-strong bg-glass p-0.5 shadow-sm backdrop-blur-md">
                  <button
                    type="button"
                    aria-pressed={layers.top && !layers.bottom}
                    onClick={() => selectSide('top')}
                    title="Show top side only (T)"
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-1 sm:px-2.5 text-[11px] sm:text-[11.5px] font-medium whitespace-nowrap transition-colors',
                      layers.top && !layers.bottom
                        ? 'bg-primary/14 font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    aria-pressed={layers.bottom && !layers.top}
                    onClick={() => selectSide('bottom')}
                    title="Show bottom side only (B)"
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-1 sm:px-2.5 text-[11px] sm:text-[11.5px] font-medium whitespace-nowrap transition-colors',
                      layers.bottom && !layers.top
                        ? 'bg-indigo-500/14 font-semibold text-indigo-600 dark:text-indigo-400'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    Bottom
                  </button>
                  <button
                    type="button"
                    aria-pressed={layers.top && layers.bottom}
                    onClick={() => selectSide('both')}
                    title="Overlay both sides"
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-1 sm:px-2.5 text-[11px] sm:text-[11.5px] font-medium whitespace-nowrap transition-colors',
                      layers.top && layers.bottom
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    Both
                  </button>
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border-strong bg-glass p-0.5 shadow-sm backdrop-blur-md">
                  {(
                    [
                      ['cad', '2D CAD', '2D CAD technical footprints (V)'],
                      ['realistic', '2D Real', '2D Realistic physical packages (V)'],
                      ['3d', '3D View', 'Interactive 3D extruded PCB (3)'],
                    ] as const
                  ).map(([mode, label, title]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={renderMode === mode}
                      onClick={() => setRenderMode(mode)}
                      title={title}
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-1 sm:px-2.5 text-[11px] sm:text-[11.5px] font-medium whitespace-nowrap transition-colors',
                        renderMode === mode
                          ? 'bg-primary/14 font-semibold text-primary'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {theme === 'classic' && (
              <div className="stage-hud" aria-hidden="true">
                <span>{renderMode.toUpperCase()}</span>
                <span>ROT {rotation}°</span>
                <span>{flipX || flipY ? `FLIP ${flipX ? 'H' : ''}${flipY ? 'V' : ''}` : '—'}</span>
              </div>
            )}

            <BoardCanvas
              ref={canvasHandleRef}
              board={board}
              index={index}
              layers={{ ...layers, labels: layers.labels !== holdLabels }}
              view={view}
              onView={setView}
              flipX={flipX}
              flipY={flipY}
              rotation={rotation}
              renderMode={renderMode}
              selection={selection}
              highlightNet={highlightNet}
              focusParts={focusParts}
              onSelect={handleSelect}
              onCursor={setCursor}
              onFit={doFit}
              onRotate={doRotate}
              onFlip={doFlip}
              onOpenFile={() => fileRef.current?.click()}
              onOpenFolder={() => dirRef.current?.click()}
              onDemo={() => void openFiles([demoFile()])}
              isClassicTheme={theme === 'classic'}
              fitToken={fitToken}
              focusToken={focusToken}
              centerSelectToken={centerSelectToken}
              palette={palette}
              onCamStateChange={onCamStateChange}
            />

            {theme !== 'classic' && (
              <CanvasDock
                board={board}
                layers={layers}
                flipX={flipX}
                flipY={flipY}
                renderMode={renderMode}
                cam3d={cam3d}
                dragMode3d={dragMode3d}
                isPhone={isPhone}
                onToggleLayer={toggle}
                onZoom={zoomCenter}
                onFit={doFit}
                onRotate={doRotate}
                onFlipV={doFlip}
                onFlipX={() => setFlipX((v) => !v)}
                onSetDragMode3d={(m) => canvasHandleRef.current?.setDragMode3d(m)}
                onApplyCam3D={(next) => canvasHandleRef.current?.applyCam3D(next)}
              />
            )}

            {board && !layers.top && !layers.bottom && (
              <div className="canvas-empty sides-hidden absolute inset-0 z-20 flex items-center justify-center bg-background/60 p-4 backdrop-blur-xs">
                <div className="empty-card max-w-[380px] rounded-xl border border-border-strong bg-glass p-5 text-center shadow-2xl">
                  <div className="empty-title text-sm font-bold text-foreground">Top and Bottom sides are hidden</div>
                  <div className="empty-sub mt-1.5 text-xs text-muted-foreground">
                    Enable at least one board side to see components, pins and test points.
                  </div>
                  <div className="sides-hidden-actions mt-4 flex flex-wrap justify-center gap-2">
                    <Button variant="default" size="sm" className="btn" onClick={() => setLayers((l) => ({ ...l, top: true }))}>
                      Show Top
                    </Button>
                    <Button variant="default" size="sm" className="btn" onClick={() => setLayers((l) => ({ ...l, bottom: true }))}>
                      Show Bottom
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="btn primary"
                      onClick={() => setLayers((l) => ({ ...l, top: true, bottom: true }))}
                    >
                      Show Both
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {dragOver && (
              <div className="drop-overlay pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-md">
                <MaterialIcon name="upload_file" size={36} className="text-primary" />
                <strong className="text-sm font-semibold text-foreground">Release to load boardview</strong>
                <span className="text-xs text-muted-foreground">Files, folders &amp; ZIP archives supported</span>
              </div>
            )}

            {busy && (
              <div className="busy absolute top-14 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border-strong bg-card px-3.5 py-1.5 text-xs font-medium text-primary shadow-xl">
                Parsing board…
              </div>
            )}
          </main>

          {/* DESKTOP / CLASSIC RIGHT INSPECTOR RAIL */}
          {(theme === 'classic' || !isPhone) && (
            <aside
              data-sheet={classicSheet}
              aria-label="Inspector"
              className={cn(
                'panel right relative flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-card',
                !rightOpen && theme !== 'classic' && 'border-l-0 opacity-0 pointer-events-none',
              )}
            >
              {theme === 'classic' && (
                <button
                  type="button"
                  className="sheet-grip"
                  aria-expanded={classicSheet !== 'peek'}
                  aria-label="Toggle classic mobile inspector sheet"
                  onPointerDown={(e) => {
                    classicGripStart.current = e.clientY;
                  }}
                  onPointerUp={(e) => {
                    const from = classicGripStart.current;
                    classicGripStart.current = null;
                    const dy = from == null ? 0 : e.clientY - from;
                    if (dy < -26) setClassicSheet((s) => (s === 'peek' ? 'half' : 'full'));
                    else if (dy > 26) setClassicSheet((s) => (s === 'full' ? 'half' : 'peek'));
                    else setClassicSheet((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'));
                  }}
                >
                  <i aria-hidden="true" />
                  <span>{peekHeadline}</span>
                </button>
              )}
              {inspectorNode(false)}
              {theme !== 'classic' && !isPhone && rightOpen && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Inspector panel"
                  onPointerDown={startResizeRight}
                  onDoubleClick={() => setRightWidth(308)}
                  title="Drag to resize · Double-click to reset"
                  className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/50"
                />
              )}
            </aside>
          )}
        </div>

        {/* MOBILE VAUL WORKBENCH (Non-Classic Phone/Small-Tablet Mode) */}
        {theme !== 'classic' && isPhone && (
          <>
            {/* Slide-Over Left Explorer Drawer (Vaul direction="left") */}
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="left">
              <DrawerContent
                aria-label="Explorer Drawer"
                className="top-0 bottom-0 left-0 w-[min(340px,88vw)] rounded-r-xl border-r"
              >
                <DrawerHeader>
                  <div>
                    <DrawerTitle className="text-xs font-semibold text-foreground">
                      Explorer
                    </DrawerTitle>
                    <DrawerDescription className="sr-only">Browse boardview components, nets, samples and diagnostics</DrawerDescription>
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDrawerOpen(false)} aria-label="Close Explorer">
                    <MaterialIcon name="close" size={18} />
                  </Button>
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{explorerNode}</div>
              </DrawerContent>
            </Drawer>

            {/* Touch-Physics Snap-Detent Bottom Sheet for Inspector (non-modal so canvas stays interactive!) */}
            <Drawer
              open={mobileInspectorOpen}
              onOpenChange={setMobileInspectorOpen}
              modal={false}
              snapPoints={[0.45, 0.88]}
              activeSnapPoint={mobileSnap}
              setActiveSnapPoint={setMobileSnap}
            >
              <DrawerContent
                showOverlay={false}
                aria-label="Component & Net Inspector"
                className="inset-x-0 bottom-0 z-25 h-dvh rounded-t-2xl border-t"
              >
                <div className="flex shrink-0 flex-col border-b border-border bg-secondary/70 pt-1.5 pb-2 px-3">
                  <DrawerHandle />
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <DrawerTitle className="truncate text-xs font-semibold text-foreground">
                        {peekHeadline}
                      </DrawerTitle>
                      <DrawerDescription className="sr-only">Swipe up to expand or down to dismiss</DrawerDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      {selection && (
                        <Button size="xs" variant="outline" onClick={() => handleSelect(null)}>
                          Clear
                        </Button>
                      )}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => setMobileInspectorOpen(false)}
                        aria-label="Hide Inspector sheet"
                      >
                        <MaterialIcon name="close" size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex flex-col overflow-hidden transition-[height] duration-200',
                    mobileSnap === 0.88
                      ? 'h-[calc(88dvh-138px-env(safe-area-inset-bottom))]'
                      : 'h-[calc(45dvh-138px-env(safe-area-inset-bottom))]',
                  )}
                >
                  {inspectorNode(true)}
                </div>
              </DrawerContent>
            </Drawer>

            {/* Display Layers & View Modes Vaul Sheet */}
            <Drawer open={layersOpen} onOpenChange={setLayersOpen}>
              <DrawerContent aria-label="Layers and Display Options" className="inset-x-0 bottom-0 max-h-[82dvh] rounded-t-2xl border-t pb-[calc(12px+env(safe-area-inset-bottom))]">
                <div className="pt-2 px-4 pb-2 border-b border-border flex items-center justify-between">
                  <div>
                    <DrawerTitle className="text-xs font-semibold text-foreground">
                      Display layers &amp; camera
                    </DrawerTitle>
                    <DrawerDescription className="sr-only">Toggle layers, sides, render mode, and board transforms</DrawerDescription>
                  </div>
                  <Button size="icon-xs" variant="ghost" onClick={() => setLayersOpen(false)} aria-label="Close layers">
                    <MaterialIcon name="close" size={16} />
                  </Button>
                </div>
                <div className="p-3 space-y-3 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-1.5">
                    {LAYER_META.map(([key, label, side]) => {
                      const active = layers[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggle(key)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors',
                            active
                              ? side === 'bottom'
                                ? 'border-indigo-500/40 bg-indigo-500/12 font-semibold text-foreground'
                                : 'border-primary/40 bg-primary/12 font-semibold text-foreground'
                              : 'border-border bg-secondary text-muted-foreground',
                          )}
                        >
                          <MaterialIcon
                            name="check"
                            size={15}
                            className={
                              active
                                ? (side === 'bottom' ? 'text-indigo-600 dark:text-indigo-400' : 'text-primary')
                                : 'text-transparent'
                            }
                          />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

            {/* Mobile Peek Selection Bar + Bottom Navigation Bar */}
            <div className="z-30 flex flex-col border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
              <button
                type="button"
                onClick={() => {
                  setMobileSnap(0.45);
                  setMobileInspectorOpen((v) => !v);
                }}
                className="flex h-8 w-full items-center justify-between gap-2 border-b border-border/70 bg-secondary/75 px-3 text-left"
              >
                <span className="truncate text-[11px] font-medium text-foreground">{peekHeadline}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
                  <span>{mobileInspectorOpen ? 'Hide' : 'Inspect'}</span>
                  <MaterialIcon name={mobileInspectorOpen ? 'keyboard_arrow_down' : 'keyboard_arrow_up'} size={16} />
                </span>
              </button>

              <nav className="grid h-[52px] grid-cols-5" aria-label="Mobile Primary">
                <button
                  type="button"
                  onClick={() => {
                    setLayersOpen(false);
                    setDrawerOpen((v) => !v);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                    drawerOpen ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  <MaterialIcon name="menu" size={19} />
                  <span>Browse</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLayersOpen(false);
                    setDrawerOpen(false);
                    setCmdOpen(true);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                    cmdOpen ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  <MaterialIcon name="search" size={19} />
                  <span>Find</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLayersOpen(false);
                    setMobileSnap(0.45);
                    setMobileInspectorOpen((v) => !v);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                    mobileInspectorOpen ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  <MaterialIcon name="explore" size={19} filled={mobileInspectorOpen} />
                  <span>Inspect</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setLayersOpen((v) => !v);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                    layersOpen ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  <MaterialIcon name="layers" size={19} filled={layersOpen} />
                  <span>Layers</span>
                </button>
                <button
                  type="button"
                  onClick={doFit}
                  className="flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-muted-foreground active:text-primary"
                >
                  <MaterialIcon name="fit_screen" size={19} />
                  <span>Fit</span>
                </button>
              </nav>
            </div>
          </>
        )}

        {/* CLASSIC MOBILE OVERLAYS (Preserved when Classic WinForms theme is active on mobile) */}
        {theme === 'classic' && drawerOpen && (
          <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        )}
        {theme === 'classic' && layersOpen && (
          <>
            <div className="layer-pop" role="group" aria-label="Layers and sides">
              <div className="mini-title">
                Layers &amp; sides
                <button type="button" onClick={() => setLayersOpen(false)} aria-label="Close layers">
                  ✕
                </button>
              </div>
              <LayerToggles layers={layers} toggle={toggle} />
            </div>
            <div className="scrim scrim-layers" onClick={() => setLayersOpen(false)} aria-hidden="true" />
          </>
        )}
        {theme === 'classic' && (
          <nav className="dock" aria-label="Primary">
            <button
              type="button"
              className={drawerOpen ? 'active' : ''}
              onClick={() => {
                setLayersOpen(false);
                setDrawerOpen((v) => !v);
              }}
            >
              <b aria-hidden="true">☰</b>Browse
            </button>
            <button
              type="button"
              onClick={() => {
                setLayersOpen(false);
                setLeftTab('search');
                setDrawerOpen(true);
              }}
            >
              <b aria-hidden="true">⌕</b>Find
            </button>
            <button
              type="button"
              className={classicSheet !== 'peek' ? 'active' : ''}
              onClick={() => setClassicSheet((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'))}
            >
              <b aria-hidden="true">▤</b>Inspect
            </button>
            <button
              type="button"
              data-layers-trigger
              className={layersOpen ? 'active' : ''}
              onClick={() => {
                setDrawerOpen(false);
                setLayersOpen((v) => !v);
              }}
            >
              <b aria-hidden="true">◈</b>Layers
            </button>
            <button type="button" onClick={doFit}>
              <b aria-hidden="true">⤢</b>Fit
            </button>
          </nav>
        )}

        {/* DESKTOP TELEMETRY STATUS BAR */}
        <footer className="statusbar hidden md:flex items-center gap-4 border-t border-border bg-card px-3 font-sans text-[11px] tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {isStandalone() ? 'Offline PWA' : 'Local'}
          </span>
          <span>
            {board ? `${mm(board.bounds.maxX - board.bounds.minX)} × ${mm(board.bounds.maxY - board.bounds.minY)} mm` : '—'}
          </span>
          <span>XY {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)} mil` : '—'}</span>
          <span>{(view.scale * 1000).toFixed(0)} px/in</span>
          <span>{renderMode === '3d' ? '3D' : renderMode === 'realistic' ? '2D Real' : '2D CAD'}</span>
          {renderMode === '3d' && <span>Cam {Math.round(cam3d.pitchDeg)}°/{Math.round(cam3d.yawDeg)}°</span>}
          <span>Rot {rotation}°</span>
          <span className="status-right ml-auto flex items-center gap-2 text-muted-foreground">
            {board ? (
              <>
                <span>{fmtBytes(board.sourceBytes.length)}</span>
                <span className="font-medium text-foreground/80">{board.format}</span>
              </>
            ) : (
              'Ready'
            )}
          </span>
        </footer>

        {/* UNIFIED COMMAND PALETTE (⌘K Desktop & Search/Find Mobile) */}
        <CommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          board={board}
          index={index}
          netList={netList}
          renderMode={renderMode}
          theme={theme}
          onSelect={handleSelect}
          onSelectNet={pickNet}
          onRenderMode={setRenderMode}
          onSelectSide={selectSide}
          onFit={doFit}
          onRotate={doRotate}
          onFlipV={doFlip}
          onFlipX={() => setFlipX((v) => !v)}
          onToggleTheme={toggleStudioTheme}
          onOpenFile={() => fileRef.current?.click()}
          onOpenOptions={() => setOptions(true)}
          onOpenKeys={() => setKeysModal(true)}
        />

        {/* BASE UI ACCESSIBLE MODALS */}
        <OptionsDialog
          open={options}
          theme={theme}
          setTheme={setTheme}
          layers={layers}
          toggle={toggle}
          onClose={() => setOptions(false)}
        />

        <Dialog open={about} onOpenChange={setAbout}>
          <DialogContent className="about max-w-[460px]" aria-label="About BareBoard">
            <DialogHeader className="flex-row items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/75">
                <BrandMark size={28} />
              </div>
              <div>
                <DialogDescription>About</DialogDescription>
                <DialogTitle>BareBoard Studio</DialogTitle>
              </div>
            </DialogHeader>
            <DialogBody className="about-body space-y-2.5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                An independent offline-capable boardview workbench for inspecting PCBs in{' '}
                <b className="text-foreground">2D CAD</b>, <b className="text-foreground">2D Realistic</b>, and interactive{' '}
                <b className="text-foreground">3D Extruded</b> views. Everything parses locally in your browser — no board
                data leaves your device.
              </p>
              <div className="kv flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Formats</span>
                <strong className="font-medium text-foreground">BRD, BRD2, BDV, BVR, BVR3, CAD, CST, ASC, ZIP</strong>
              </div>
              <div className="kv flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Active theme</span>
                <strong className="font-medium text-foreground">
                  {theme === 'dark' ? 'Studio Dark' : theme === 'light' ? 'Studio Light' : 'Classic WinForms'}
                </strong>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>

        <Dialog open={keysModal} onOpenChange={setKeysModal}>
          <DialogContent aria-label="Keyboard and touch controls">
            <DialogHeader>
              <DialogDescription>Controls</DialogDescription>
              <DialogTitle>Keyboard &amp; Touch Reference</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <KeyMap touch={isPhone} />
            </DialogBody>
          </DialogContent>
        </Dialog>

        <Dialog open={reModal} onOpenChange={setReModal}>
          <DialogContent aria-label="Reverse engineering notes">
            <DialogHeader>
              <DialogDescription>Format Architecture</DialogDescription>
              <DialogTitle>Parser &amp; Compatibility Notes</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <ReNotes />
            </DialogBody>
          </DialogContent>
        </Dialog>

        {toast && (
          <div className="toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </PortalContainerProvider>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  label,
  side,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  side?: 'top' | 'bottom';
}) {
  return (
    <button
      type="button"
      className={`toggle${side ? ` side-${side}` : ''} ${on ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={`${label} layer`}
    >
      <i aria-hidden="true" />
      {label}
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
      <Toggle on={layers.top} onClick={() => toggle('top')} label="Top side" side="top" />
      <Toggle on={layers.bottom} onClick={() => toggle('bottom')} label="Bottom side" side="bottom" />
      <Toggle on={layers.tooltip} onClick={() => toggle('tooltip')} label="Tooltip" />
    </div>
  );
}

function ReNotes() {
  return (
    <div className="re-notes">
      <h3>Architecture &amp; Reference Parsers</h3>
      <p>
        BareBoard parses classic PCB boardview formats directly in the browser and renders component packages in{' '}
        <b>2D CAD</b>, <b>2D Realistic</b>, and interactive <b>3D Extruded</b> modes using inferred physical package models.
      </p>
      <h3>Format Support</h3>
      <ul>
        <li>
          <b>Full local parsing</b>: <code>.brd</code> (plain &amp; <code>0x23E26328</code> encoded), <code>.brd2</code>,{' '}
          <code>.bdv</code>, <code>.bvr</code>, <code>BVR3</code>, <code>.cad</code>, <code>.cst</code>,{' '}
          <code>ASC/TSICT</code> folders, and <code>.zip</code> archives ({SAMPLES.length} bundled samples).
        </li>
        <li>
          <b>OpenBoardView 10.0.0 Geometry</b>: Minimum-area oriented bounding boxes, convex hulls, virtual{' '}
          <code>&quot;...&quot;</code> test-pad separation, multi-contour board outlines, and EPC Y-flip correction.
        </li>
        <li>
          <b>Excluded proprietary assets</b>: Vendor-encrypted FZ/CAE keys and XZZPCB XOR keys are intentionally not bundled.
        </li>
      </ul>
    </div>
  );
}

function KeyMap({ touch }: { touch: boolean }) {
  const rows: [string, string][] = [
    ['Cmd/Ctrl + K', 'Command Palette — jump to Part, Net or Action'],
    ['Ctrl + O', 'Open boardview file'],
    ['[ / ]', 'Toggle Explorer / Inspector'],
    ['V / 3', 'Cycle 2D CAD, 2D Real & 3D'],
    ['F / Dbl-click', 'Zoom to fit board'],
    ['R / , / .', 'Rotate 90° CW / CCW'],
    ['Space / M', 'Flip vertically / Mirror horizontally'],
    ['T / B', 'Show Top / Bottom side'],
    ['H / G', 'Toggle Labels / Grid'],
    ['A W S D / Arrows', 'Pan camera'],
    ['E / Enter', 'Select item under crosshair'],
    ['Right-drag (2D)', '3× Temporary Magnifier'],
    ['Right-drag (3D)', 'Pan (while Orbit active)'],
    ['Esc', 'Clear selection / close dialog'],
  ];
  const gestures: [string, string][] = [
    ['Drag', 'Pan (2D) or Orbit (3D)'],
    ['Pinch', 'Zoom in / out'],
    ['Long press', '3× Magnifier'],
    ['Tap', 'Select pad, pin or component'],
  ];
  return (
    <>
      {touch && (
        <>
          <div className="mini-title mb-1 text-[11px] font-medium text-muted-foreground">
            Touch
          </div>
          <div className="keymap touch mb-3">
            {gestures.map(([k, v]) => (
              <div key={k}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mini-title mb-1 text-[11px] font-medium text-muted-foreground">
        Keyboard
      </div>
      <div className="keymap">
        {rows.map(([k, v]) => (
          <div key={k}>
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}

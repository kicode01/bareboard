import { useEffect, useRef, useState } from 'react';
import type { Layers } from '../types';

export interface MenuAction {
  /** Omitted on separators. */
  label?: string;
  onSelect?: () => void;
  /** Trailing hint, e.g. "Ctrl+O" or a state word. */
  hint?: string;
  /** Renders a tick in the gutter. */
  checked?: boolean;
  disabled?: boolean;
  /** Nested items open on hover, exactly like a Win32 submenu. */
  items?: MenuAction[];
  separator?: boolean;
}

export interface MenuDef {
  label: string;
  items: MenuAction[];
}

interface Props {
  menus: MenuDef[];
  /** Right-hand side of the bar, where the original puts the window title. */
  title: string;
  subtitle?: string;
}

const isSep = (a: MenuAction) => a.separator === true;

export function MenuBar({ menus, title, subtitle }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) { setOpen(null); setSub(null); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); setSub(null); }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Once a menu is open, hovering a sibling switches to it — the Win32 behaviour.
  const hover = (i: number) => { if (open !== null) { setOpen(i); setSub(null); } };

  const run = (a: MenuAction) => {
    if (a.disabled || !a.onSelect) return;
    a.onSelect();
    setOpen(null);
    setSub(null);
  };

  return (
    <div className="menubar" ref={barRef}>
      <nav className="menubar-items" aria-label="Main menu">
        {menus.map((m, i) => (
          <div className="menubar-item" key={m.label}>
            <button
              type="button"
              className={open === i ? 'open' : ''}
              aria-haspopup="menu"
              aria-expanded={open === i}
              onPointerDown={(e) => { e.preventDefault(); setOpen(open === i ? null : i); setSub(null); }}
              onPointerEnter={() => hover(i)}
            >
              {m.label}
            </button>
            {open === i && (
              <div className="menu-drop" role="menu">
                {m.items.map((a, j) => (
                  /* Hover is a mouse-only affordance. On touch, and for keyboard
                     users pressing Enter, the click is what opens the submenu. */
                  isSep(a) ? (
                  <div className="menu-sep" key={`sep${j}`} role="separator" />
                ) : (
                  <div className="menu-row" key={a.label ?? `r${j}`}
                    onPointerEnter={(e) => { if (e.pointerType === 'mouse') setSub(a.items ? j : null); }}>
                    <button type="button" role="menuitem"
                      className={`menu-entry${a.disabled ? ' disabled' : ''}`}
                      aria-disabled={a.disabled || undefined}
                      aria-haspopup={a.items ? 'menu' : undefined}
                      aria-expanded={a.items ? sub === j : undefined}
                      onClick={() => (a.items ? setSub(sub === j ? null : j) : run(a))}>
                      <span className="menu-check" aria-hidden="true">{a.checked ? '✓' : ''}</span>
                      <span className="menu-label">{a.label}</span>
                      <span className="menu-hint">{a.items ? '▸' : a.hint || ''}</span>
                    </button>
                    {a.items && sub === j && (
                      <div className="menu-drop submenu" role="menu">
                        {a.items.map((b, k) => isSep(b) ? (
                          <div className="menu-sep" key={`s${k}`} role="separator" />
                        ) : (
                          <button type="button" role="menuitem" key={b.label ?? `s${k}`}
                            className={`menu-entry${b.disabled ? ' disabled' : ''}`}
                            aria-disabled={b.disabled || undefined}
                            onClick={() => run(b)}>
                            <span className="menu-check" aria-hidden="true">{b.checked ? '✓' : ''}</span>
                            <span className="menu-label">{b.label}</span>
                            <span className="menu-hint">{b.hint || ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="menubar-title" title={title}>
        <span>{title}</span>
        {subtitle && <em>{subtitle}</em>}
      </div>
    </div>
  );
}

/** Builds the File/View/Options/Help tree from the app's real commands. */
export function buildMenus(o: {
  boardName: string | null;
  format: string | null;
  parts: number;
  pins: number;
  nets: number;
  tests: number;
  layers: Layers;
  theme: 'classic' | 'dark';
  canInstall: boolean;
  recent: { label: string; open: () => void }[];
  openFile: () => void;
  openFolder: () => void;
  loadDemo: () => void;
  install: () => void;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  rotateCw: () => void;
  rotateCcw: () => void;
  flip: () => void;
  mirror: () => void;
  toggleLayer: (k: keyof Layers) => void;
  setTheme: (t: 'classic' | 'dark') => void;
  openOptions: () => void;
  showKeys: () => void;
  showRe: () => void;
  about: () => void;
  centerSelect: () => void;
  clearSelection: () => void;
}): MenuDef[] {
  const L = (k: keyof Layers, label: string) => ({
    label, checked: o.layers[k], onSelect: () => o.toggleLayer(k),
  });

  return [
    {
      label: 'File',
      items: [
        { label: 'Open file…', hint: 'Ctrl+O', onSelect: o.openFile },
        { label: 'Open folder…', onSelect: o.openFolder },
        { label: 'Load demo board', onSelect: o.loadDemo },
        { separator: true },
        ...(o.recent.length > 0
          ? ([
            { label: 'Recent files', items: o.recent.map((r) => ({ label: r.label, onSelect: r.open })) },
            { separator: true },
          ] as MenuAction[])
          : ([] as MenuAction[])),
        { label: 'Install app', hint: o.canInstall ? '' : 'unavailable', disabled: !o.canInstall, onSelect: o.install },
        { separator: true },
        { label: o.boardName ? `Loaded: ${o.boardName}` : 'No board loaded', disabled: true },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom to fit', hint: 'F', onSelect: o.fit },
        { label: 'Zoom in', hint: '+', onSelect: o.zoomIn },
        { label: 'Zoom out', hint: '−', onSelect: o.zoomOut },
        { separator: true },
        { label: 'Rotate 90° CW', hint: 'R / .', onSelect: o.rotateCw },
        { label: 'Rotate 90° CCW', hint: ',', onSelect: o.rotateCcw },
        { label: 'Flip board', hint: 'Space', onSelect: o.flip },
        { label: 'Mirror board', hint: 'M', onSelect: o.mirror },
        { separator: true },
        {
          label: 'Layers', items: [
            L('outline', 'Outline'), L('pins', 'Pins'), L('nails', 'Test nails'),
            L('labels', 'Labels'), L('nets', 'Net lens'), L('grid', 'Grid'),
            { separator: true },
            L('top', 'Top side'), L('bottom', 'Bottom side'),
            { separator: true },
            L('tooltip', 'Tooltips'),
          ],
        },
        { separator: true },
        { label: 'Select under crosshair', hint: 'E', onSelect: o.centerSelect },
        { label: 'Clear selection', hint: 'Esc', onSelect: o.clearSelection },
      ],
    },
    {
      label: 'Options',
      items: [
        { label: 'Options…', onSelect: o.openOptions },
        { separator: true },
        {
          label: 'Theme', items: [
            { label: 'Classic (original)', checked: o.theme === 'classic', onSelect: () => o.setTheme('classic') },
            { label: 'Dark', checked: o.theme === 'dark', onSelect: () => o.setTheme('dark') },
          ],
        },
        {
          label: 'Language', items: [
            { label: 'English', checked: true },
            { label: '中文', disabled: true, hint: 'lng only' },
          ],
        },
        { separator: true },
        { label: 'Remember window position', disabled: true, hint: 'n/a on web' },
        { separator: true },
        { label: 'Board statistics', disabled: true,
          hint: `${o.parts}p · ${o.pins}π · ${o.nets}n · ${o.tests}t` },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Gestures & keys', onSelect: o.showKeys },
        { label: 'Reverse engineering notes', onSelect: o.showRe },
        { separator: true },
        { label: 'About BareBoard', onSelect: o.about },
      ],
    },
  ];
}

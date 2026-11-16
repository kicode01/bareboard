import { useEffect, useMemo, useState } from 'react';
import type { Board, Selection } from '../types';
import { search, type BoardIndex, type NetInfo } from '../lib/search';
import type { Theme } from '../lib/theme';
import { classifyPartPackage, type RenderMode } from '../render/realistic3d';
import { MaterialIcon, type MaterialIconName } from './MaterialIcon';
import { PackageGlyph } from './PackageGlyph';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: Board | null;
  index: BoardIndex | null;
  netList: NetInfo[];
  renderMode: RenderMode;
  theme: Theme;
  onSelect: (s: Selection, centerZoom?: boolean) => void;
  onSelectNet: (netName: string) => void;
  onRenderMode: (m: RenderMode) => void;
  onSelectSide: (side: 'top' | 'bottom' | 'both') => void;
  onFit: () => void;
  onRotate: (d: number) => void;
  onFlipV: () => void;
  onFlipX: () => void;
  onToggleTheme: () => void;
  onOpenFile: () => void;
  onOpenOptions: () => void;
  onOpenKeys: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  board,
  index,
  netList,
  renderMode,
  theme,
  onSelect,
  onSelectNet,
  onRenderMode,
  onSelectSide,
  onFit,
  onRotate,
  onFlipV,
  onFlipX,
  onToggleTheme,
  onOpenFile,
  onOpenOptions,
  onOpenKeys,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const hits = useMemo(() => {
    if (!board || !index || !query.trim()) return [];
    return search(index, query, board, 90);
  }, [board, index, query]);

  const partHits = useMemo(() => hits.filter((h) => h.kind === 'part'), [hits]);
  const netHits = useMemo(() => hits.filter((h) => h.kind === 'net'), [hits]);

  const runAndClose = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  const quickActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: { id: string; label: string; shortcut: string; icon: MaterialIconName; iconClass?: string; run: () => void }[] = [
      {
        id: 'act-3d',
        label: renderMode === '3d' ? 'Switch to 2D Realistic view' : 'Switch to 3D Extruded view',
        shortcut: '3',
        icon: 'view_in_ar',
        run: () => onRenderMode(renderMode === '3d' ? 'realistic' : '3d'),
      },
      {
        id: 'act-fit',
        label: 'Zoom board to fit viewport',
        shortcut: 'F',
        icon: 'fit_screen',
        run: onFit,
      },
      {
        id: 'act-top',
        label: 'Show Top side only',
        shortcut: 'T',
        icon: 'layers',
        run: () => onSelectSide('top'),
      },
      {
        id: 'act-bot',
        label: 'Show Bottom side only',
        shortcut: 'B',
        icon: 'layers',
        run: () => onSelectSide('bottom'),
      },
      {
        id: 'act-both',
        label: 'Overlay Both board sides',
        shortcut: '',
        icon: 'layers',
        run: () => onSelectSide('both'),
      },
      {
        id: 'act-rot',
        label: 'Rotate board 90° clockwise',
        shortcut: 'R',
        icon: 'rotate_90_degrees_cw',
        run: () => onRotate(90),
      },
      {
        id: 'act-flipv',
        label: 'Flip board vertically',
        shortcut: 'Space',
        icon: 'flip',
        iconClass: 'rotate-90',
        run: onFlipV,
      },
      {
        id: 'act-flipx',
        label: 'Mirror board horizontally',
        shortcut: 'M',
        icon: 'flip',
        run: onFlipX,
      },
      {
        id: 'act-theme',
        label: theme === 'dark' ? 'Switch to Studio Light theme' : 'Switch to Studio Dark theme',
        shortcut: '',
        icon: theme === 'dark' ? 'light_mode' : 'dark_mode',
        run: onToggleTheme,
      },
      {
        id: 'act-open',
        label: 'Open boardview file…',
        shortcut: 'Ctrl+O',
        icon: 'folder_open',
        run: onOpenFile,
      },
      {
        id: 'act-options',
        label: 'Open Settings & Appearance…',
        shortcut: '',
        icon: 'tune',
        run: onOpenOptions,
      },
      {
        id: 'act-keys',
        label: 'Keyboard & touch gestures reference',
        shortcut: '',
        icon: 'keyboard',
        run: onOpenKeys,
      },
    ];
    if (!q) return list;
    return list.filter((a) => a.label.toLowerCase().includes(q));
  }, [
    query,
    renderMode,
    theme,
    onRenderMode,
    onFit,
    onSelectSide,
    onRotate,
    onFlipV,
    onFlipX,
    onToggleTheme,
    onOpenFile,
    onOpenOptions,
    onOpenKeys,
  ]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Parts, Nets & Commands">
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={
            board
              ? `Jump to part, net, or command (${board.parts.filter((p) => !p.isDummy).length.toLocaleString()} parts, ${netList.length.toLocaleString()} nets)…`
              : 'Search commands or open a boardview file…'
          }
          rightSlot={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
            ) : (
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Esc
              </kbd>
            )
          }
        />
        <CommandList>
          <CommandEmpty>No matching parts, nets, or studio commands.</CommandEmpty>

          {board && query.trim() && partHits.length > 0 && (
            <CommandGroup heading={`Components (${partHits.length})`}>
              {partHits.map((h) => {
                const part = board.parts[h.index];
                const spec = part ? classifyPartPackage(part) : null;
                return (
                  <CommandItem
                    key={`part-${h.index}-${h.label}`}
                    value={`part:${h.label}:${h.index}`}
                    onSelect={() => runAndClose(() => onSelect({ kind: 'part', index: h.index, key: `part:${h.index}` }, true))}
                  >
                    {spec ? <PackageGlyph kind={spec.kind} /> : <Badge variant="top">PART</Badge>}
                    <span className="font-medium text-foreground">{h.label}</span>
                    {part && (
                      <Badge variant={part.side === 'bottom' ? 'bottom' : 'top'} className="ml-1">
                        {part.side === 'bottom' ? 'Bot' : part.side === 'both' ? 'Both' : 'Top'}
                      </Badge>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {board && query.trim() && netHits.length > 0 && (
            <CommandGroup heading={`Nets (${netHits.length})`}>
              {netHits.map((h) => (
                <CommandItem
                  key={`net-${h.label}`}
                  value={`net:${h.label}`}
                  onSelect={() => runAndClose(() => onSelectNet(h.label))}
                >
                  <MaterialIcon name="hub" size={15} className="text-muted-foreground" />
                  <span className="truncate font-medium text-foreground">{h.label}</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{h.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {board && !query.trim() && netList.length > 0 && (
            <CommandGroup heading="Top Nets on Board">
              {netList.slice(0, 8).map((n) => (
                <CommandItem
                  key={`topnet-${n.name}`}
                  value={`net:${n.name}`}
                  onSelect={() => runAndClose(() => onSelectNet(n.name))}
                >
                  <MaterialIcon name="hub" size={15} className="text-muted-foreground" />
                  <span className="truncate font-medium text-foreground">{n.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {n.pinIndices.length} pins, {n.partIds.size} parts
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {quickActions.length > 0 && (
            <CommandGroup heading="Commands">
              {quickActions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.id}
                  onSelect={() => runAndClose(a.run)}
                >
                  <MaterialIcon name={a.icon} size={16} className={a.iconClass ? `text-primary ${a.iconClass}` : 'text-primary'} />
                  <span>{a.label}</span>
                  {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

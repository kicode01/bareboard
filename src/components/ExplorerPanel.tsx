import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Board, Detection, Part, Selection } from '../types';
import type { InputFile } from '../parsers';
import { extensionOf } from '../parsers/detect';
import type { NetInfo, SearchHit } from '../lib/search';
import type { Theme } from '../lib/theme';
import type { PackageKind } from '../render/realistic3d';
import { describeNet, getPackageMeta } from '../lib/packages';
import { MaterialIcon } from '@/components/MaterialIcon';
import { PackageGlyph } from './PackageGlyph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface SampleSpec {
  label: string;
  tag: string;
  files: string[];
}

export interface BatchRow {
  name: string;
  format: string;
  ok: boolean;
  parts: number;
  pins: number;
  nets: number;
  error?: string;
}

export interface RealPartEntry {
  part: Part;
  index: number;
  kind: PackageKind;
}

export const SAMPLES: SampleSpec[] = [
  { label: 'demo.brd', tag: 'BRD', files: ['samples/demo.brd'] },
  { label: 'demo-encoded.brd', tag: 'BRD (encoded)', files: ['samples/demo-encoded.brd'] },
  { label: 'demo-brd2.brd', tag: 'BRD2', files: ['samples/demo-brd2.brd'] },
  { label: 'demo.bdv', tag: 'BDV', files: ['samples/demo.bdv'] },
  { label: 'demo.bvr', tag: 'BVR3', files: ['samples/demo.bvr'] },
  { label: 'demo-bvr1.bvr', tag: 'BVR1', files: ['samples/demo-bvr1.bvr'] },
  { label: 'demo.cad', tag: 'CAD', files: ['samples/demo.cad'] },
  { label: 'demo.cst', tag: 'CST (binary)', files: ['samples/demo.cst'] },
  {
    label: 'asc-tsict',
    tag: 'ASC folder',
    files: ['samples/asc-tsict/format.asc', 'samples/asc-tsict/pins.asc', 'samples/asc-tsict/nails.asc'],
  },
];

const SUPPORTED_FORMAT_ROWS: [string, string, 'full' | 'key required' | 'detect only'][] = [
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
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type BrowseRow =
  | { type: 'hit'; hit: SearchHit; kind: PackageKind | null; side?: 'top' | 'bottom' | 'both' }
  | { type: 'part'; entry: RealPartEntry }
  | { type: 'net'; net: NetInfo };

interface ExplorerPanelProps {
  board: Board | null;
  detection: Detection | null;
  error: string | null;
  batch: BatchRow[];
  library: { label: string; files: InputFile[] }[];
  query: string;
  onQueryChange: (q: string) => void;
  browseFilter: 'all' | 'parts' | 'nets';
  onBrowseFilterChange: (f: 'all' | 'parts' | 'nets') => void;
  leftTab: 'search' | 'formats' | 'diagnostics';
  onLeftTabChange: (t: 'search' | 'formats' | 'diagnostics') => void;
  rawMode: 'text' | 'hex';
  onRawModeChange: (m: 'text' | 'hex') => void;
  rawText: string;
  hits: SearchHit[];
  realPartEntries: RealPartEntry[];
  netList: NetInfo[];
  selectedPartIndex: number;
  highlightNet: string | null;
  theme: Theme;
  isPhone: boolean;
  onSelect: (s: Selection | null, centerZoom?: boolean) => void;
  onSelectNet: (name: string) => void;
  onOpenFiles: (files: InputFile[]) => void;
  onOpenFileDialog: () => void;
  onOpenFolderDialog: () => void;
  onLoadDemo: () => void;
  onCloseBoard: () => void;
  onLoadSample: (spec: SampleSpec) => void;
  onToggleTheme?: () => void;
  onOpenOptions?: () => void;
  onOpenKeys?: () => void;
  onOpenGuide?: () => void;
  onOpenReNotes?: () => void;
  onOpenAbout?: () => void;
}

export function ExplorerPanel({
  board,
  detection,
  error,
  batch,
  library,
  query,
  onQueryChange,
  browseFilter,
  onBrowseFilterChange,
  leftTab,
  onLeftTabChange,
  rawMode,
  onRawModeChange,
  rawText,
  hits,
  realPartEntries,
  netList,
  selectedPartIndex,
  highlightNet,
  theme,
  isPhone,
  onSelect,
  onSelectNet,
  onOpenFiles,
  onOpenFileDialog,
  onOpenFolderDialog,
  onLoadDemo,
  onCloseBoard,
  onLoadSample,
  onToggleTheme,
  onOpenOptions,
  onOpenKeys,
  onOpenGuide,
  onOpenReNotes,
  onOpenAbout,
}: ExplorerPanelProps) {
  const listScrollRef = useRef<HTMLDivElement>(null);

  const filteredHits = useMemo(() => {
    if (browseFilter === 'parts') return hits.filter((h) => h.kind === 'part');
    if (browseFilter === 'nets') return hits.filter((h) => h.kind === 'net');
    return hits;
  }, [hits, browseFilter]);

  const rows: BrowseRow[] = useMemo(() => {
    if (!board) return [];
    if (query.trim()) {
      return filteredHits.map((hit) => {
        const entry = hit.kind === 'part' ? realPartEntries.find((e) => e.index === hit.index) : undefined;
        return {
          type: 'hit',
          hit,
          kind: entry?.kind ?? null,
          side: board.parts[hit.index]?.side,
        };
      });
    }
    if (browseFilter === 'parts') {
      return realPartEntries.map((entry) => ({ type: 'part', entry }));
    }
    if (browseFilter === 'nets') {
      return netList.map((net) => ({ type: 'net', net }));
    }
    return [
      ...realPartEntries.map((entry): BrowseRow => ({ type: 'part', entry })),
      ...netList.map((net): BrowseRow => ({ type: 'net', net })),
    ];
  }, [board, query, filteredHits, browseFilter, realPartEntries, netList]);

  const rowHeight = isPhone ? 36 : 29;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 14,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card font-sans">
      {theme === 'classic' && (
        <section className="source-block">
          <div className="section-title">Source</div>
          <button type="button" className="dropzone" onClick={onOpenFileDialog}>
            <div className="dz-icon">↥</div>
            <div>
              <strong>Drop boardview files</strong>
              <span>or click to browse (.brd, .bdv, .bvr, .cad, .cst, .asc, .zip)</span>
            </div>
          </button>
          <div className="source-buttons">
            <button type="button" onClick={onLoadDemo}>Load demo</button>
            <button type="button" onClick={onOpenFolderDialog} title="For folder-based TSICT / ASC boardviews">
              Open folder
            </button>
          </div>
          {library.length > 1 && (
            <div className="recent">
              <div className="mini-title">Session files</div>
              {library.slice().reverse().map((f) => (
                <button
                  key={f.label}
                  type="button"
                  className={board?.name === f.label ? 'recent-item active' : 'recent-item'}
                  onClick={() => onOpenFiles(f.files)}
                >
                  <span className="recent-ext">{extensionOf(f.label) || 'DIR'}</span>
                  <span className="recent-name">{f.label}</span>
                  <span className="recent-size">{fmtBytes(f.files.reduce((a, b) => a + b.bytes.length, 0))}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <Tabs
        value={leftTab}
        onValueChange={(v) => onLeftTabChange(v as 'search' | 'formats' | 'diagnostics')}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList aria-label="Explorer sections">
          <TabsTrigger value="search">Browse</TabsTrigger>
          <TabsTrigger value="formats">Files</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="tab-body flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
          <div className="search-box flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 focus-within:border-primary">
            <MaterialIcon name="search" size={16} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search part, type, or net (e.g. resistor, usb)…"
              aria-label="Filter parts, types, and nets"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="Clear filter"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MaterialIcon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="filter-chips flex shrink-0 gap-1" role="group" aria-label="Filter results by type">
            {(
              [
                ['all', `All (${realPartEntries.length + netList.length})`],
                ['parts', `Parts (${realPartEntries.length})`],
                ['nets', `Nets (${netList.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onBrowseFilterChange(key)}
                className={cn(
                  'flex-1 truncate rounded-md border px-1.5 py-1 text-[11px] font-medium tabular-nums transition-colors',
                  browseFilter === key
                    ? 'on border-primary/35 bg-primary/10 text-primary'
                    : 'border-border/80 bg-secondary/70 text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mini-title flex shrink-0 items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>
              {query.trim()
                ? `${rows.length.toLocaleString()} matches`
                : browseFilter === 'parts'
                  ? 'Components'
                  : browseFilter === 'nets'
                    ? 'Nets'
                    : 'Parts & nets'}
            </span>
            <span className="tabular-nums">{rows.length.toLocaleString()}</span>
          </div>

          <div ref={listScrollRef} className="result-list min-h-0 flex-1 overflow-y-auto pr-0.5">
            {!board && (
              <div className="empty-note py-4 text-xs leading-relaxed text-muted-foreground">
                Open or drop a boardview file to browse all parts and nets.
              </div>
            )}
            {board && rows.length === 0 && (
              <div className="empty-note py-4 text-xs text-muted-foreground">No matching items.</div>
            )}
            {board && rows.length > 0 && (
              <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const row = rows[vi.index];
                  if (row.type === 'hit') {
                    const { hit, kind, side } = row;
                    const active =
                      (hit.kind === 'part' && selectedPartIndex === hit.index) ||
                      (hit.kind === 'net' && highlightNet === hit.label);
                    if (hit.kind === 'part') {
                      const part = board.parts[hit.index];
                      const meta = kind ? getPackageMeta(kind) : null;
                      const pinCount = part ? Math.max(0, part.pinEnd - part.pinStart) : 0;
                      return (
                        <button
                          key={vi.key}
                          type="button"
                          title={meta ? `${hit.label} — ${meta.label} (${meta.short}): ${meta.role}` : hit.label}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${vi.size}px`,
                            transform: `translateY(${vi.start}px)`,
                          }}
                          className={cn(
                            'result-item flex items-center gap-2 rounded-md px-2 text-left transition-colors',
                            active ? 'active bg-primary/12' : 'hover:bg-secondary',
                          )}
                          onClick={() => onSelect({ kind: 'part', index: hit.index, key: `part:${hit.index}` }, true)}
                        >
                          {kind ? (
                            <PackageGlyph kind={kind} />
                          ) : (
                            <MaterialIcon name="memory" size={15} className="text-muted-foreground" />
                          )}
                          <span className={cn('result-label text-xs font-medium text-foreground', meta ? 'shrink-0' : 'min-w-0 flex-1 truncate')}>
                            {hit.label}
                          </span>
                          {meta && (
                            <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                              {meta.friendly}
                            </span>
                          )}
                          {side && (
                            <span
                              className={cn(
                                'shrink-0 text-[10.5px] font-medium',
                                side === 'bottom' ? 'text-indigo-600 dark:text-indigo-400' : 'text-primary',
                              )}
                            >
                              {side === 'bottom' ? 'Bot' : side === 'both' ? 'Both' : 'Top'}
                            </span>
                          )}
                          <span className="result-sub shrink-0 w-7 text-right text-[11px] tabular-nums text-muted-foreground">
                            {pinCount}p
                          </span>
                        </button>
                      );
                    }
                    const netMeta = describeNet(hit.label);
                    const netInfo = netList.find((n) => n.name === hit.label);
                    return (
                      <button
                        key={vi.key}
                        type="button"
                        title={netMeta ? `${hit.label} — ${netMeta.badge}: ${netMeta.description}` : `${hit.label} — ${hit.sub}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${vi.size}px`,
                          transform: `translateY(${vi.start}px)`,
                        }}
                        className={cn(
                          'result-item flex items-center gap-2 rounded-md px-2 text-left transition-colors',
                          active ? 'active bg-primary/12' : 'hover:bg-secondary',
                        )}
                        onClick={() => onSelectNet(hit.label)}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          <MaterialIcon name="hub" size={15} className="text-amber-600 dark:text-amber-400" />
                        </span>
                        <span className={cn('result-label text-xs font-medium text-foreground', netMeta ? 'shrink-0' : 'min-w-0 flex-1 truncate')}>
                          {hit.label}
                        </span>
                        {netMeta && (
                          <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                            {netMeta.friendly}
                          </span>
                        )}
                        <span className="result-sub shrink-0 w-7 text-right text-[11px] tabular-nums text-muted-foreground">
                          {netInfo ? `${netInfo.pinIndices.length}p` : hit.sub}
                        </span>
                      </button>
                    );
                  }

                  if (row.type === 'part') {
                    const { part, index: pIdx, kind } = row.entry;
                    const meta = getPackageMeta(kind);
                    const active = selectedPartIndex === pIdx;
                    return (
                      <button
                        key={vi.key}
                        type="button"
                        title={`${part.name} — ${meta.label} (${meta.short}): ${meta.role}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${vi.size}px`,
                          transform: `translateY(${vi.start}px)`,
                        }}
                        className={cn(
                          'result-item flex items-center gap-2 rounded-md px-2 text-left transition-colors',
                          active ? 'active bg-primary/12' : 'hover:bg-secondary',
                        )}
                        onClick={() => onSelect({ kind: 'part', index: pIdx, key: `part:${pIdx}` }, true)}
                      >
                        <PackageGlyph kind={kind} />
                        <span className="result-label shrink-0 text-xs font-medium text-foreground">
                          {part.name}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                          {meta.friendly}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[10.5px] font-medium',
                            part.side === 'bottom' ? 'text-indigo-600 dark:text-indigo-400' : 'text-primary',
                          )}
                        >
                          {part.side === 'bottom' ? 'Bot' : part.side === 'both' ? 'Both' : 'Top'}
                        </span>
                        <span className="result-sub shrink-0 w-7 text-right text-[11px] tabular-nums text-muted-foreground">
                          {Math.max(0, part.pinEnd - part.pinStart)}p
                        </span>
                      </button>
                    );
                  }

                  const { net } = row;
                  const netMeta = describeNet(net.name);
                  const active = highlightNet === net.name;
                  return (
                    <button
                      key={vi.key}
                      type="button"
                      title={
                        netMeta
                          ? `${net.name} — ${netMeta.badge}: ${netMeta.description} (${net.pinIndices.length} pins, ${net.partIds.size} parts)`
                          : `${net.name} — ${net.pinIndices.length} connected pins across ${net.partIds.size} parts`
                      }
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${vi.size}px`,
                        transform: `translateY(${vi.start}px)`,
                      }}
                      className={cn(
                        'result-item flex items-center gap-2 rounded-md px-2 text-left transition-colors',
                        active ? 'active bg-primary/12' : 'hover:bg-secondary',
                      )}
                      onClick={() => onSelectNet(net.name)}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <MaterialIcon name="hub" size={15} className="text-amber-600 dark:text-amber-400" />
                      </span>
                      <span className={cn('result-label text-xs font-medium text-foreground', netMeta ? 'shrink-0' : 'min-w-0 flex-1 truncate')}>
                        {net.name}
                      </span>
                      {netMeta && (
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                          {netMeta.friendly}
                        </span>
                      )}
                      <span
                        className="result-sub shrink-0 w-7 text-right text-[11px] tabular-nums text-muted-foreground"
                        title={`${net.pinIndices.length} pins across ${net.partIds.size} parts`}
                      >
                        {net.pinIndices.length}p
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="formats" className="tab-body flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
          {theme !== 'classic' && (
            <div className="source-actions-card grid grid-cols-2 gap-1.5">
              <Button variant="primary" size="sm" onClick={onOpenFileDialog}>
                <MaterialIcon name="upload_file" size={15} />
                <span>Open file…</span>
              </Button>
              <Button variant="default" size="sm" onClick={onOpenFolderDialog}>
                <MaterialIcon name="folder_open" size={15} />
                <span>ASC folder</span>
              </Button>
              {board && (
                <Button variant="outline" size="sm" onClick={onCloseBoard} className="col-span-2">
                  Close active board
                </Button>
              )}
            </div>
          )}

          {library.length > 0 && (
            <div className="recent-card flex flex-col gap-1">
              <div className="mini-title text-[11px] font-medium text-muted-foreground">
                Recent in session
              </div>
              {library.slice().reverse().map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => onOpenFiles(f.files)}
                  className={cn(
                    'recent-item flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    board?.name === f.label ? 'active bg-primary/12' : 'hover:bg-secondary',
                  )}
                >
                  <Badge variant="default" className="w-9 justify-center uppercase">{extensionOf(f.label).replace('.', '') || 'DIR'}</Badge>
                  <span className="recent-name min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {f.label}
                  </span>
                  <span className="recent-size shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                    {fmtBytes(f.files.reduce((a, b) => a + b.bytes.length, 0))}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="formats flex flex-col gap-1">
            <div className="mini-title text-[11px] font-medium text-muted-foreground">
              Reference samples
            </div>
            <div className="sample-list flex flex-col divide-y divide-border/70 rounded-md border border-border bg-secondary/30">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onLoadSample(s)}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-primary/10"
                >
                  <span className="truncate text-xs font-medium text-foreground">{s.label}</span>
                  <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
                    {s.tag}
                  </span>
                </button>
              ))}
            </div>

            <div className="mini-title mt-3 text-[11px] font-medium text-muted-foreground">
              Supported formats
            </div>
            <div className="divide-y divide-border/60 rounded-md border border-border bg-secondary/30 px-2.5">
              {SUPPORTED_FORMAT_ROWS.map(([name, desc, state]) => (
                <div className="format-row flex items-center justify-between gap-2 py-1.5" key={name}>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[11.5px] font-semibold text-foreground">{name}</strong>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{desc}</span>
                  </div>
                  <Badge variant={state === 'full' ? 'top' : 'default'}>{state}</Badge>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="diagnostics" className="tab-body flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
          {error && (
            <div className="alert rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
              <strong className="block text-xs font-semibold text-destructive">Could not load</strong>
              <span className="text-[11px] leading-snug text-foreground">{error}</span>
            </div>
          )}

          <div className="diag-card flex flex-col divide-y divide-border/70 rounded-md border border-border bg-secondary/35 px-2.5 py-1">
            <div className="mini-title py-1.5 text-[11px] font-medium text-muted-foreground">
              Detection
            </div>
            <DiagRow k="Format" v={detection?.label || '—'} />
            <DiagRow k="Matched by" v={detection?.matchedBy || '—'} />
            <DiagRow k="Parser" v={detection?.supported ? 'available' : 'not available'} />
            {board && (
              <>
                <DiagRow k="Bytes" v={fmtBytes(board.sourceBytes.length)} />
                <DiagRow k="Outline points" v={board.outline.length} />
                <DiagRow
                  k="Bounds"
                  v={`${Math.round(board.bounds.maxX - board.bounds.minX)} × ${Math.round(board.bounds.maxY - board.bounds.minY)} mil (${((board.bounds.maxX - board.bounds.minX) * 0.0254).toFixed(1)} × ${((board.bounds.maxY - board.bounds.minY) * 0.0254).toFixed(1)} mm)`}
                />
              </>
            )}
            {detection?.detail && (
              <p className="diag-detail py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {detection.detail}
              </p>
            )}
            {detection?.note && (
              <p className="diag-note py-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                {detection.note}
              </p>
            )}
          </div>

          {board?.warnings.map((w, i) => (
            <div
              className="warning flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-foreground"
              key={i}
            >
              <MaterialIcon name="warning" size={15} className="mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{w}</span>
            </div>
          ))}

          {batch.length > 0 && (
            <div className="batch flex flex-col gap-1">
              <div className="mini-title text-[11px] font-medium text-muted-foreground">
                Batch validation ({batch.length})
              </div>
              {batch.map((r) => (
                <div
                  className={cn(
                    'batch-row flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-2 py-1.5',
                    r.ok && 'ok',
                  )}
                  key={r.name}
                  title={r.error}
                >
                  <MaterialIcon
                    name={r.ok ? 'check_circle' : 'error'}
                    size={14}
                    className={r.ok ? 'text-primary' : 'text-destructive'}
                  />
                  <span className="batch-name min-w-0 flex-1 truncate text-[11px] font-medium">{r.name}</span>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                    {r.ok ? `${r.parts} parts · ${r.pins} pins · ${r.nets} nets` : r.format}
                  </span>
                </div>
              ))}
            </div>
          )}

          {board && (
            <div className="flex flex-col gap-1.5">
              <div className="mini-title raw-head flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>Raw header</span>
                <div className="seg inline-flex overflow-hidden rounded border border-border" role="group" aria-label="Raw header view">
                  <button
                    type="button"
                    className={cn('px-2 py-0.5 text-[10.5px] font-medium', rawMode === 'text' ? 'active bg-primary/12 text-primary' : 'text-muted-foreground')}
                    aria-pressed={rawMode === 'text'}
                    onClick={() => onRawModeChange('text')}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    className={cn('px-2 py-0.5 text-[10.5px] font-medium', rawMode === 'hex' ? 'active bg-primary/12 text-primary' : 'text-muted-foreground')}
                    aria-pressed={rawMode === 'hex'}
                    onClick={() => onRawModeChange('hex')}
                  >
                    Hex
                  </button>
                </div>
              </div>
              <pre className="raw-view max-h-56 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {rawText}
              </pre>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {isPhone && theme !== 'classic' && (
        <div className="shrink-0 border-t border-border bg-secondary/40 p-2">
          <div className="grid grid-cols-3 gap-1">
            {onOpenGuide && (
              <Button size="xs" variant="outline" onClick={onOpenGuide}>
                <MaterialIcon name="memory" size={14} className="text-primary" />
                <span>Parts guide</span>
              </Button>
            )}
            {onToggleTheme && (
              <Button size="xs" variant="outline" onClick={onToggleTheme} title="Switch Dark / Light theme">
                <MaterialIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={14} />
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </Button>
            )}
            {onOpenOptions && (
              <Button size="xs" variant="outline" onClick={onOpenOptions}>
                <MaterialIcon name="tune" size={14} />
                <span>Prefs</span>
              </Button>
            )}
            {onOpenKeys && (
              <Button size="xs" variant="outline" onClick={onOpenKeys}>
                <MaterialIcon name="keyboard" size={14} />
                <span>Controls</span>
              </Button>
            )}
            {onOpenReNotes && (
              <Button size="xs" variant="outline" onClick={onOpenReNotes}>
                <MaterialIcon name="description" size={14} />
                <span>Formats</span>
              </Button>
            )}
            {onOpenAbout && (
              <Button size="xs" variant="outline" onClick={onOpenAbout}>
                <MaterialIcon name="info" size={14} />
                <span>About</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiagRow({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="kv flex items-center justify-between gap-2 py-1.5 text-[11px]">
      <span className="text-muted-foreground">{k}</span>
      <strong className="break-all text-right font-medium tabular-nums text-foreground">{v}</strong>
    </div>
  );
}

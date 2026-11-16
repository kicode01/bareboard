import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Board, Selection } from '../types';
import type { NetInfo } from '../lib/search';
import { classifyPartPackage } from '../render/realistic3d';
import { MaterialIcon } from '@/components/MaterialIcon';
import { PackageGlyph, packageShortLabel } from './PackageGlyph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const mm = (mil: number) => (mil * 0.0254).toFixed(2);

interface InspectorPanelProps {
  board: Board | null;
  selection: Selection | null;
  activeNet: NetInfo | null;
  realPartCount: number;
  topPartCount: number;
  botPartCount: number;
  topPinCount: number;
  botPinCount: number;
  netCount: number;
  packageCounts: [string, number][];
  pinFilter: string;
  onPinFilterChange: (q: string) => void;
  isPhone: boolean;
  onSelect: (s: Selection | null, centerZoom?: boolean) => void;
  onHighlightNet: (net: string) => void;
  onFitNet: (net: string) => void;
  onCenterSelection: () => void;
  onOpenKeys: () => void;
  onOpenReNotes: () => void;
  onOpenAbout: () => void;
  onCloseMobileSheet?: () => void;
  hideHeader?: boolean;
}

export function InspectorPanel({
  board,
  selection,
  activeNet,
  realPartCount,
  topPartCount,
  botPartCount,
  topPinCount,
  botPinCount,
  netCount,
  packageCounts,
  pinFilter,
  onPinFilterChange,
  isPhone,
  onSelect,
  onHighlightNet,
  onFitNet,
  onCenterSelection,
  onOpenKeys,
  onOpenReNotes,
  onOpenAbout,
  onCloseMobileSheet,
  hideHeader,
}: InspectorPanelProps) {
  const pinScrollRef = useRef<HTMLDivElement>(null);

  const selectedPart = selection?.kind === 'part' && board ? board.parts[selection.index] : null;
  const selectedPin = selection?.kind === 'pin' && board ? board.pins[selection.index] : null;
  const selectedNail = selection?.kind === 'nail' && board ? board.nails[selection.index] : null;

  const filteredPartPins = useMemo(() => {
    if (!selectedPart || !board) return [];
    const pins = board.pins.slice(selectedPart.pinStart, selectedPart.pinEnd).map((pin, offset) => ({
      pin,
      globalIndex: selectedPart.pinStart + offset,
      localNum: pin.name || pin.number || `P${offset + 1}`,
    }));
    const pf = pinFilter.trim().toUpperCase();
    if (!pf) return pins;
    return pins.filter((p) => p.localNum.toUpperCase().includes(pf) || p.pin.net.toUpperCase().includes(pf));
  }, [selectedPart, board, pinFilter]);

  const pinRowH = isPhone ? 34 : 28;
  const pinVirtualizer = useVirtualizer({
    count: filteredPartPins.length,
    getScrollElement: () => pinScrollRef.current,
    estimateSize: () => pinRowH,
    overscan: 12,
  });

  const activeNetParts = useMemo(() => {
    if (!activeNet) return [];
    return [...activeNet.partIds];
  }, [activeNet]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card font-sans">
      <section className="inspector flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!hideHeader && (
          <div className="insp-top flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="section-title text-xs font-semibold text-foreground">
              Inspector
            </span>
            <div className="flex items-center gap-1">
              {selection && (
                <Button size="xs" variant="outline" className="insp-clear" onClick={() => onSelect(null)} title="Clear selection (Esc)">
                  Clear
                </Button>
              )}
              {onCloseMobileSheet && (
                <Button size="icon-xs" variant="ghost" onClick={onCloseMobileSheet} aria-label="Collapse inspector">
                  <MaterialIcon name="close" size={15} />
                </Button>
              )}
            </div>
          </div>
        )}

        {!board && (
          <div className="empty-note px-3 py-4 text-xs leading-relaxed text-muted-foreground">
            Open a boardview file to inspect parts, pinouts and net connectivity.
          </div>
        )}

        {board && !selection && !activeNet && (
          <div className="board-summary flex flex-col divide-y divide-border">
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <strong className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                  {board.name}
                </strong>
                <Badge variant="default" className="hero-format">{board.format}</Badge>
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {mm(board.bounds.maxX - board.bounds.minX)} × {mm(board.bounds.maxY - board.bounds.minY)} mm
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border/0">
              <StatCell label="Parts" value={realPartCount.toLocaleString()} />
              <StatCell label="Pins" value={board.pins.length.toLocaleString()} />
              <StatCell label="Nets" value={netCount.toLocaleString()} />
              <StatCell label="Test points" value={board.nails.length.toLocaleString()} />
            </div>

            <div className="px-3 py-2.5">
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                Layer distribution
              </div>
              <div
                className="mb-2 flex h-1.5 overflow-hidden rounded-sm bg-indigo-500/80"
                title={`Top: ${topPartCount} parts, Bottom: ${botPartCount} parts`}
              >
                <div
                  className="h-full bg-primary"
                  style={{ width: `${realPartCount ? (topPartCount / realPartCount) * 100 : 50}%` }}
                />
              </div>
              <div className="flex flex-col gap-1 text-[11px] tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-primary">Top</span>
                  <span className="text-muted-foreground">{topPartCount} parts, {topPinCount} pins</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">Bottom</span>
                  <span className="text-muted-foreground">{botPartCount} parts, {botPinCount} pins</span>
                </div>
              </div>
            </div>

            {packageCounts.length > 0 && (
              <div className="px-3 py-2.5">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                  Package breakdown
                </div>
                <div className="flex flex-wrap gap-1">
                  {packageCounts.slice(0, 12).map(([label, count]) => (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                      key={label}
                    >
                      <span>{label}</span>
                      <span className="font-semibold text-foreground">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Select a component, pin, or pad on the board to inspect its package details and net connections.
            </p>
          </div>
        )}

        {selectedPart && board && (() => {
          const spec = classifyPartPackage(selectedPart);
          const totalPins = selectedPart.pinEnd - selectedPart.pinStart;
          return (
            <div className="detail flex min-h-0 flex-1 flex-col gap-2.5 p-3">
              <div className="detail-card-head flex items-center gap-2.5">
                <div className="pkg-svg flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary p-1">
                  <PackageGlyph kind={spec.kind} />
                </div>
                <div className="detail-title-col min-w-0 flex-1">
                  <div className="detail-badges mb-0.5 flex items-center gap-1">
                    <Badge variant="default" className="badge part">{packageShortLabel(spec.kind)}</Badge>
                    <Badge variant={selectedPart.side === 'bottom' ? 'bottom' : selectedPart.side === 'both' ? 'both' : 'top'}>
                      {selectedPart.side === 'bottom' ? 'Bottom' : selectedPart.side === 'both' ? 'Both' : 'Top'}
                    </Badge>
                  </div>
                  <h2 className="m-0 break-all text-sm font-semibold text-foreground">{selectedPart.name}</h2>
                </div>
                <Button size="xs" variant="outline" className="focus-btn" onClick={onCenterSelection} title="Center camera on component">
                  <MaterialIcon name="center_focus_strong" size={14} className="text-primary" />
                  <span>Center</span>
                </Button>
              </div>

              <div className="grid grid-cols-2 divide-x divide-border rounded-md border border-border bg-secondary/40">
                <StatCell compact label="Pins" value={totalPins} />
                <StatCell compact label="Mount" value={selectedPart.type.toUpperCase()} />
              </div>

              {selectedPart.box && (
                <InspRow
                  k="Footprint"
                  v={`${mm(selectedPart.box.maxX - selectedPart.box.minX)} × ${mm(selectedPart.box.maxY - selectedPart.box.minY)} mm`}
                />
              )}

              <div className="mt-0.5 flex items-center justify-between border-t border-border pt-2">
                <span className="text-[11px] font-medium text-muted-foreground">Pinout</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{totalPins.toLocaleString()} pins</span>
              </div>

              {totalPins > 6 && (
                <div className="pin-filter-box flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 focus-within:border-primary">
                  <MaterialIcon name="search" size={14} className="text-muted-foreground" />
                  <input
                    value={pinFilter}
                    onChange={(e) => onPinFilterChange(e.target.value)}
                    placeholder="Filter pin or net…"
                    aria-label="Filter component pins"
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  {pinFilter && (
                    <button
                      type="button"
                      onClick={() => onPinFilterChange('')}
                      aria-label="Clear pin filter"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <MaterialIcon name="close" size={14} />
                    </button>
                  )}
                </div>
              )}

              <div
                ref={pinScrollRef}
                className="pin-list min-h-[160px] flex-1 max-h-[340px] overflow-y-auto pr-0.5"
              >
                {filteredPartPins.length === 0 ? (
                  <div className="empty-note py-2 text-xs text-muted-foreground">No matching pins</div>
                ) : (
                  <div style={{ height: `${pinVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {pinVirtualizer.getVirtualItems().map((vi) => {
                      const { pin, globalIndex, localNum } = filteredPartPins[vi.index];
                      const isGnd = pin.net === 'GND' || pin.net === 'GROUND';
                      const isNc = !pin.net || pin.net === 'UNCONNECTED' || pin.net === 'NC';
                      return (
                        <button
                          key={vi.key}
                          type="button"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${vi.size - 2}px`,
                            transform: `translateY(${vi.start}px)`,
                          }}
                          className={cn(
                            'pin-row flex items-center gap-2 rounded px-2 text-left text-[11.5px] tabular-nums transition-colors hover:bg-secondary',
                            isGnd ? 'is-gnd' : isNc ? 'is-nc' : 'is-sig',
                          )}
                          onClick={() => onSelect({ kind: 'pin', index: globalIndex, key: `pin:${globalIndex}` }, true)}
                        >
                          <span className="w-9 shrink-0 truncate font-medium text-muted-foreground">{localNum}</span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate font-medium',
                              isGnd
                                ? 'text-muted-foreground'
                                : isNc
                                  ? 'font-normal text-muted-foreground/65'
                                  : 'text-foreground',
                            )}
                          >
                            {pin.net}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-[10.5px] font-medium',
                              pin.side === 'bottom' ? 'text-indigo-600 dark:text-indigo-400' : 'text-primary',
                            )}
                          >
                            {pin.side === 'bottom' ? 'Bot' : 'Top'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {selectedPin && board && (
          <div className="detail flex flex-col gap-2 p-3">
            <div className="detail-card-head flex items-center gap-2">
              <div className="detail-title-col min-w-0 flex-1">
                <div className="detail-badges mb-0.5 flex items-center gap-1">
                  <Badge variant="default" className="badge pin">Pin</Badge>
                  <Badge variant={selectedPin.side === 'bottom' ? 'bottom' : selectedPin.side === 'both' ? 'both' : 'top'}>
                    {selectedPin.side === 'bottom' ? 'Bottom' : selectedPin.side === 'both' ? 'Both' : 'Top'}
                  </Badge>
                </div>
                <h2 className="m-0 break-all text-sm font-semibold tabular-nums text-foreground">
                  {selectedPin.name || selectedPin.number || `#${selection!.index + 1}`}
                </h2>
              </div>
              <Button size="xs" variant="outline" className="focus-btn" onClick={onCenterSelection} title="Center camera on pin">
                <MaterialIcon name="center_focus_strong" size={14} className="text-primary" />
                <span>Center</span>
              </Button>
            </div>

            <div className="divide-y divide-border/70 border-y border-border/70">
              <InspRow k="Net" v={selectedPin.net} />
              {selectedPin.part > 0 && board.parts[selectedPin.part - 1] && !board.parts[selectedPin.part - 1].isDummy ? (
                <div className="kv flex items-center justify-between gap-2 py-1.5 text-[11.5px]">
                  <span className="text-muted-foreground">Component</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[11.5px] font-semibold text-primary hover:bg-primary/15"
                    onClick={() => onSelect({ kind: 'part', index: selectedPin.part - 1, key: `part:${selectedPin.part - 1}` }, true)}
                  >
                    <span>{board.parts[selectedPin.part - 1].name}</span>
                    <MaterialIcon name="arrow_outward" size={13} />
                  </button>
                </div>
              ) : (
                <InspRow k="Component" v={selectedPin.isTestPad ? 'Test Pad' : 'Orphan'} />
              )}
              <InspRow k="Probe" v={selectedPin.probe || '—'} />
              <InspRow k="Coords" v={`${Math.round(selectedPin.x)}, ${Math.round(selectedPin.y)} mil`} />
            </div>

            <Button variant="active" size="default" className="wide-btn mt-1 w-full" onClick={() => onHighlightNet(selectedPin.net)}>
              <MaterialIcon name="hub" size={15} />
              <span>Trace net “{selectedPin.net}”</span>
            </Button>
          </div>
        )}

        {selectedNail && (
          <div className="detail flex flex-col gap-2 p-3">
            <div className="detail-card-head flex items-center gap-2">
              <div className="detail-title-col min-w-0 flex-1">
                <div className="detail-badges mb-0.5 flex items-center gap-1">
                  <Badge variant="violet" className="badge nail">Test point</Badge>
                  <Badge variant={selectedNail.side === 'bottom' ? 'bottom' : selectedNail.side === 'both' ? 'both' : 'top'}>
                    {selectedNail.side === 'bottom' ? 'Bottom' : selectedNail.side === 'both' ? 'Both' : 'Top'}
                  </Badge>
                </div>
                <h2 className="m-0 text-sm font-semibold tabular-nums text-foreground">
                  #{selectedNail.probe || selection!.index + 1}
                </h2>
              </div>
              <Button size="xs" variant="outline" className="focus-btn" onClick={onCenterSelection} title="Center on test point">
                <MaterialIcon name="center_focus_strong" size={14} className="text-primary" />
                <span>Center</span>
              </Button>
            </div>
            <div className="divide-y divide-border/70 border-y border-border/70">
              <InspRow k="Net" v={selectedNail.net} />
              <InspRow k="Coords" v={`${Math.round(selectedNail.x)}, ${Math.round(selectedNail.y)} mil`} />
            </div>
          </div>
        )}

        {activeNet && (
          <div className="net-detail flex flex-col gap-2.5 border-t border-border p-3">
            <div className="detail-card-head flex items-center gap-2">
              <div className="detail-title-col min-w-0 flex-1">
                <Badge variant="amber" className="badge net mb-0.5">Net</Badge>
                <h2 className="m-0 break-all text-sm font-semibold text-foreground">{activeNet.name}</h2>
              </div>
              <Button size="xs" variant="outline" className="focus-btn" onClick={() => onFitNet(activeNet.name)} title="Fit all pins on this net">
                <MaterialIcon name="center_focus_strong" size={14} className="text-primary" />
                <span>Fit net</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border rounded-md border border-border bg-secondary/40">
              <StatCell compact label="Pins" value={activeNet.pinIndices.length.toLocaleString()} />
              <StatCell compact label="Parts" value={activeNet.partIds.size.toLocaleString()} />
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">
              Connected components ({activeNetParts.length})
            </div>
            <div className="chip-list flex max-h-44 flex-wrap gap-1 overflow-y-auto pr-0.5">
              {activeNetParts.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect({ kind: 'part', index: id - 1, key: `part:${id - 1}` }, true)}
                  className="rounded border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10"
                >
                  {board?.parts[id - 1]?.name || `P${id}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {!isPhone && (
        <footer className="insp-foot flex shrink-0 gap-1.5 border-t border-border bg-secondary/40 px-3 py-2">
          <Button size="xs" variant="outline" className="flex-1" onClick={onOpenKeys}>
            Shortcuts
          </Button>
          <Button size="xs" variant="outline" className="flex-1" onClick={onOpenReNotes}>
            Formats
          </Button>
          <Button size="xs" variant="outline" className="flex-1" onClick={onOpenAbout}>
            About
          </Button>
        </footer>
      )}
    </div>
  );
}

function StatCell({ label, value, compact }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', compact ? 'px-2.5 py-1.5' : 'px-3 py-2')}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <strong className="text-sm font-semibold tabular-nums text-foreground">{value}</strong>
    </div>
  );
}

function InspRow({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="kv flex items-center justify-between gap-2 py-1.5 text-[11.5px]">
      <span className="text-muted-foreground">{k}</span>
      <strong className="break-all text-right font-medium tabular-nums text-foreground">{v}</strong>
    </div>
  );
}

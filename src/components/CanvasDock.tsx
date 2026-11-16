import { useState } from 'react';
import type { Board, Layers } from '../types';
import type { Camera3D, RenderMode } from '../render/realistic3d';
import { MaterialIcon } from '@/components/MaterialIcon';
import { Button } from '@/components/ui/button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CanvasDockProps {
  board: Board | null;
  layers: Layers;
  flipX: boolean;
  flipY: boolean;
  renderMode: RenderMode;
  cam3d: Camera3D;
  dragMode3d: 'orbit' | 'pan';
  isPhone: boolean;
  onToggleLayer: (key: keyof Layers) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onRotate: (delta: number) => void;
  onFlipV: () => void;
  onFlipX: () => void;
  onSetDragMode3d: (mode: 'orbit' | 'pan') => void;
  onApplyCam3D: (next: Camera3D | ((cur: Camera3D) => Camera3D)) => void;
}

const LAYER_ITEMS: readonly [keyof Layers, string][] = [
  ['outline', 'Board Outline'],
  ['pins', 'Pins & Pads'],
  ['labels', 'Part Labels (R1, U1…)'],
  ['nails', 'Test Points (Nails)'],
  ['nets', 'Net Connections'],
  ['grid', 'Grid'],
  ['tooltip', 'Hover Tooltips'],
];

export function CanvasDock({
  board,
  layers,
  flipX,
  flipY,
  renderMode,
  cam3d,
  dragMode3d,
  isPhone,
  onToggleLayer,
  onZoom,
  onFit,
  onRotate,
  onFlipV,
  onFlipX,
  onSetDragMode3d,
  onApplyCam3D,
}: CanvasDockProps) {
  const [flipTrayOpen, setFlipTrayOpen] = useState(false);

  if (!board) return null;

  const is3d = renderMode === '3d';

  const orbitCamControls = (
    <>
      <Button
        size="xs"
        variant={dragMode3d === 'orbit' ? 'active' : 'ghost'}
        onClick={() => onSetDragMode3d('orbit')}
        title="Drag to orbit 3D view"
        className="px-1.5 text-[11px]"
      >
        <MaterialIcon name="3d_rotation" size={15} />
        <span>Orbit</span>
      </Button>
      <Button
        size="xs"
        variant={dragMode3d === 'pan' ? 'active' : 'ghost'}
        onClick={() => onSetDragMode3d('pan')}
        title="Drag to pan board"
        className="px-1.5 text-[11px]"
      >
        <MaterialIcon name="drag_pan" size={15} />
        <span>Pan</span>
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => onApplyCam3D((c) => ({ ...c, pitchDeg: Math.max(-175, c.pitchDeg - 15) }))}
        title="Tilt flatter"
        aria-label="Tilt flatter"
      >
        <MaterialIcon name="keyboard_arrow_down" size={16} />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => onApplyCam3D((c) => ({ ...c, pitchDeg: Math.min(175, c.pitchDeg + 15) }))}
        title="Tilt steeper"
        aria-label="Tilt steeper"
      >
        <MaterialIcon name="keyboard_arrow_up" size={16} />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => onApplyCam3D((c) => ({ ...c, yawDeg: ((c.yawDeg - 25 + 540) % 360) - 180 }))}
        title="Yaw left"
        aria-label="Yaw left"
      >
        <MaterialIcon name="rotate_left" size={15} />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => onApplyCam3D((c) => ({ ...c, yawDeg: ((c.yawDeg + 25 + 540) % 360) - 180 }))}
        title="Yaw right"
        aria-label="Yaw right"
      >
        <MaterialIcon name="rotate_right" size={15} />
      </Button>
      <Button
        size="xs"
        variant={cam3d.pitchDeg === 0 && cam3d.yawDeg === 0 ? 'active' : 'ghost'}
        onClick={() => onApplyCam3D({ pitchDeg: 0, yawDeg: 0 })}
        title="Top-down 0°"
        className="px-1.5 text-[11px] tabular-nums"
      >
        0°
      </Button>
      <Button
        size="xs"
        variant={cam3d.pitchDeg === 48 && cam3d.yawDeg === -16 ? 'active' : 'ghost'}
        onClick={() => onApplyCam3D({ pitchDeg: 48, yawDeg: -16 })}
        title="Reset isometric 3D"
        className="px-1.5 text-[11px]"
      >
        Iso
      </Button>
    </>
  );

  // Mobile floating compact camera, transform & 3D ribbon above bottom dock
  if (isPhone) {
    return (
      <div className="pointer-events-none absolute inset-x-2 bottom-2.5 z-10 flex flex-col items-center gap-1.5">
        {flipTrayOpen && (
          <div
            role="group"
            aria-label="Board flip and mirror"
            className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border-strong bg-glass px-1.5 py-1 shadow-lg backdrop-blur-md"
          >
            <Button size="xs" variant={flipY ? 'active' : 'ghost'} onClick={onFlipV} aria-pressed={flipY}>
              <MaterialIcon name="flip" size={15} className="rotate-90" />
              <span>Flip V</span>
            </Button>
            <Button size="xs" variant={flipX ? 'active' : 'ghost'} onClick={onFlipX} aria-pressed={flipX}>
              <MaterialIcon name="flip" size={15} />
              <span>Mirror</span>
            </Button>
          </div>
        )}

        {is3d && (
          <div
            role="toolbar"
            aria-label="3D camera controls"
            className="no-scrollbar pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border-strong bg-glass px-1 py-1 shadow-lg backdrop-blur-md"
          >
            {orbitCamControls}
          </div>
        )}

        <div
          role="toolbar"
          aria-label="Mobile canvas tools"
          className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-lg border border-border-strong bg-glass px-1.5 py-1 shadow-lg backdrop-blur-md"
        >
          <Button size="icon-sm" variant="ghost" onClick={() => onZoom(0.8)} aria-label="Zoom out">
            <MaterialIcon name="zoom_out" size={16} />
          </Button>
          <Button size="sm" variant="ghost" onClick={onFit} className="px-2 text-[11px]">
            <MaterialIcon name="fit_screen" size={15} />
            <span>Fit</span>
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => onZoom(1.25)} aria-label="Zoom in">
            <MaterialIcon name="zoom_in" size={16} />
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-4" />
          <Button size="icon-sm" variant="ghost" onClick={() => onRotate(-90)} aria-label="Rotate counter-clockwise">
            <MaterialIcon name="rotate_90_degrees_ccw" size={16} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => onRotate(90)} aria-label="Rotate clockwise">
            <MaterialIcon name="rotate_90_degrees_cw" size={16} />
          </Button>
          <Button
            size="sm"
            variant={flipTrayOpen || flipX || flipY ? 'active' : 'ghost'}
            onClick={() => setFlipTrayOpen((v) => !v)}
            aria-expanded={flipTrayOpen}
            className="px-2 text-[11px]"
          >
            <MaterialIcon name="flip" size={15} />
            <span>Flip</span>
          </Button>
          {is3d && (
            <span className="ml-0.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary">
              <MaterialIcon name="view_in_ar" size={13} />
              {Math.round(cam3d.pitchDeg)}°/{Math.round(cam3d.yawDeg)}°
            </span>
          )}
        </div>
      </div>
    );
  }

  // Desktop unified floating Material-styled control dock (single clean row on desktop)
  return (
    <TooltipProvider delay={350}>
      <div
        role="toolbar"
        aria-label="Canvas controls"
        className="no-scrollbar pointer-events-auto absolute bottom-3 left-1/2 z-10 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg border border-border-strong bg-glass px-1.5 py-1 shadow-lg backdrop-blur-md"
      >
        <Popover>
          <PopoverTrigger
            render={(triggerProps) => (
              <Button
                {...triggerProps}
                size="xs"
                variant="ghost"
                className={cn(
                  'px-1.5 text-[11px]',
                  triggerProps['aria-expanded'] && 'border-primary/35 bg-primary/12 text-primary',
                )}
              >
                <MaterialIcon name="layers" size={15} className="text-primary" />
                <span>Layers</span>
              </Button>
            )}
          />
          <PopoverContent side="top" align="start" sideOffset={10} className="w-[256px] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                Display layers
              </span>
              <PopoverClose
                aria-label="Close layers"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MaterialIcon name="close" size={14} />
              </PopoverClose>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {LAYER_ITEMS.map(([key, label]) => {
                const active = layers[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onToggleLayer(key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
                      active
                        ? 'border-primary/35 bg-primary/10 font-medium text-foreground'
                        : 'border-border/70 bg-secondary/50 text-muted-foreground hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    <MaterialIcon
                      name="check"
                      size={14}
                      className={active ? 'text-primary' : 'text-transparent'}
                    />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-0.5 h-3.5" />

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button {...p} size="icon-xs" variant="ghost" aria-label="Zoom out" onClick={() => onZoom(0.8)}>
                <MaterialIcon name="zoom_out" size={16} />
              </Button>
            )}
          />
          <TooltipContent>Zoom out (−)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button {...p} size="xs" variant="ghost" className="px-1.5 text-[11px]" onClick={onFit}>
                Fit
              </Button>
            )}
          />
          <TooltipContent>Zoom to fit (F)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button {...p} size="icon-xs" variant="ghost" aria-label="Zoom in" onClick={() => onZoom(1.25)}>
                <MaterialIcon name="zoom_in" size={16} />
              </Button>
            )}
          />
          <TooltipContent>Zoom in (+)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-3.5" />

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button {...p} size="icon-xs" variant="ghost" aria-label="Rotate 90° CCW" onClick={() => onRotate(-90)}>
                <MaterialIcon name="rotate_90_degrees_ccw" size={15} />
              </Button>
            )}
          />
          <TooltipContent>Rotate 90° CCW (,)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button {...p} size="icon-xs" variant="ghost" aria-label="Rotate 90° CW" onClick={() => onRotate(90)}>
                <MaterialIcon name="rotate_90_degrees_cw" size={15} />
              </Button>
            )}
          />
          <TooltipContent>Rotate 90° CW (R)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button
                {...p}
                size="xs"
                variant={flipY ? 'active' : 'ghost'}
                className="px-1.5 text-[11px]"
                aria-pressed={flipY}
                onClick={onFlipV}
              >
                <MaterialIcon name="flip" size={15} className="rotate-90" />
                <span>Flip</span>
              </Button>
            )}
          />
          <TooltipContent>Flip vertically (Space)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(p) => (
              <Button
                {...p}
                size="xs"
                variant={flipX ? 'active' : 'ghost'}
                className="px-1.5 text-[11px]"
                aria-pressed={flipX}
                onClick={onFlipX}
              >
                <MaterialIcon name="flip" size={15} />
                <span>Mirror</span>
              </Button>
            )}
          />
          <TooltipContent>Mirror horizontally (M)</TooltipContent>
        </Tooltip>

        {is3d && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-3.5" />
            {orbitCamControls}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-context';

export const TooltipProvider = BaseTooltip.Provider;
export const Tooltip = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;

export function TooltipContent({
  className,
  side = 'top',
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> & {
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}) {
  const container = usePortalContainer();
  return (
    <BaseTooltip.Portal container={container}>
      <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className="z-50 pointer-events-none">
        <BaseTooltip.Popup
          data-slot="tooltip-content"
          className={cn(
            'rounded border border-border-strong bg-popover px-2 py-1 font-mono text-[10px] font-medium text-popover-foreground shadow-md transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        />
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}

import * as React from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-context';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof BasePopover.Popup> {
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

export function PopoverContent({
  className,
  side = 'top',
  align = 'center',
  sideOffset = 8,
  children,
  ...props
}: PopoverContentProps) {
  const container = usePortalContainer();
  return (
    <BasePopover.Portal container={container}>
      <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-40">
        <BasePopover.Popup
          data-slot="popover-content"
          className={cn(
            'rounded-lg border border-border-strong bg-popover p-2.5 text-popover-foreground shadow-xl outline-none transition-all duration-120 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

import * as React from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-context';

export const Drawer = VaulDrawer.Root;
export const DrawerNested = VaulDrawer.NestedRoot;
export const DrawerTrigger = VaulDrawer.Trigger;
export const DrawerClose = VaulDrawer.Close;

export function DrawerPortal({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof VaulDrawer.Portal>) {
  const container = usePortalContainer();
  return (
    <VaulDrawer.Portal container={container} {...props}>
      {children}
    </VaulDrawer.Portal>
  );
}

export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    data-slot="drawer-overlay"
    className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]', className)}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof VaulDrawer.Content> {
  showOverlay?: boolean;
  overlayClassName?: string;
}

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  DrawerContentProps
>(({ className, children, showOverlay = true, overlayClassName, ...props }, ref) => (
  <DrawerPortal>
    {showOverlay && <DrawerOverlay className={overlayClassName} />}
    <VaulDrawer.Content
      ref={ref}
      data-slot="drawer-content"
      className={cn(
        'fixed z-45 flex flex-col bg-card text-card-foreground border-border-strong shadow-2xl outline-none pointer-events-auto',
        className,
      )}
      {...props}
    >
      {children}
    </VaulDrawer.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

export function DrawerHandle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('mx-auto my-1.5 h-1 w-10 shrink-0 rounded-full bg-border-strong', className)}
      {...props}
    />
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex items-center justify-between gap-2 border-b border-border px-3 py-2', className)}
      {...props}
    />
  );
}

export const DrawerTitle = VaulDrawer.Title;
export const DrawerDescription = VaulDrawer.Description;

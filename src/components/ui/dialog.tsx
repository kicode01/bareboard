import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { MaterialIcon } from '@/components/MaterialIcon';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-context';

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogBackdrop({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        'modal-shade fixed inset-0 z-50 bg-black/65 backdrop-blur-xs transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> {
  showClose?: boolean;
}

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogContentProps) {
  const container = usePortalContainer();
  return (
    <BaseDialog.Portal container={container}>
      <DialogBackdrop />
      <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-none">
        <BaseDialog.Popup
          data-slot="dialog-content"
          className={cn(
            'modal pointer-events-auto relative flex w-full max-w-[600px] max-h-[86dvh] flex-col overflow-hidden rounded-lg border border-border-strong bg-card text-card-foreground shadow-2xl outline-none transition-all duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
          {showClose && (
            <BaseDialog.Close
              aria-label="Close dialog"
              className="absolute top-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MaterialIcon name="close" size={16} />
            </BaseDialog.Close>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('modal-head flex flex-col gap-0.5 border-b border-border px-4 py-3 pr-10', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      data-slot="dialog-title"
      className={cn('text-sm font-semibold leading-tight tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      data-slot="dialog-description"
      className={cn('text-[11px] font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('modal-body flex-1 overflow-y-auto px-4 py-3 text-xs', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('opt-foot flex items-center justify-end gap-2 border-t border-border px-4 py-2.5 bg-secondary/40', className)}
      {...props}
    />
  );
}

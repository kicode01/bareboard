import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { MaterialIcon } from '@/components/MaterialIcon';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from './dialog';

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    data-slot="command"
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
      className,
    )}
    {...props}
  />
));
Command.displayName = 'Command';

export interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}

export function CommandDialog({ open, onOpenChange, title = 'Command Palette', children }: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        aria-label={title}
        className="max-w-[540px] p-0 overflow-hidden gap-0 top-auto"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { rightSlot?: React.ReactNode }
>(({ className, rightSlot, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-border px-3 h-10 bg-secondary/40" cmdk-input-wrapper="">
    <MaterialIcon name="search" size={16} className="text-muted-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      data-slot="command-input"
      className={cn(
        'flex h-9 w-full bg-transparent text-xs font-medium text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
    {rightSlot}
  </div>
));
CommandInput.displayName = 'CommandInput';

export const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    data-slot="command-list"
    className={cn('max-h-[55dvh] overflow-y-auto overflow-x-hidden p-1.5', className)}
    {...props}
  />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn('py-6 text-center text-xs text-muted-foreground', className)}
    {...props}
  />
));
CommandEmpty.displayName = 'CommandEmpty';

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden py-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = 'CommandGroup';

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    data-slot="command-item"
    className={cn(
      'relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';

export function CommandShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <kbd
      className={cn(
        'ml-auto rounded border border-border bg-background/80 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

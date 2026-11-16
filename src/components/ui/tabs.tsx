import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

export const Tabs = BaseTabs.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      data-slot="tabs-list"
      className={cn(
        'tabs inline-flex w-full items-center gap-0.5 border-b border-border bg-card px-2 pt-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      data-slot="tabs-trigger"
      className={cn(
        'relative flex-1 whitespace-nowrap px-1.5 py-2 text-[11.5px] font-medium text-muted-foreground transition-colors outline-none border-b-2 border-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:border-primary data-[active]:text-primary data-[active]:font-semibold',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      data-slot="tabs-content"
      className={cn('min-h-0 flex-1 overflow-y-auto outline-none', className)}
      {...props}
    />
  );
}

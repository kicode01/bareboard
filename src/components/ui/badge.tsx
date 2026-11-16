import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 font-sans text-[10.5px] font-medium leading-none whitespace-nowrap select-none tabular-nums',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-muted-foreground border border-border/80',
        primary: 'bg-primary/12 text-primary border border-primary/25',
        top: 'bg-primary/10 text-primary border border-primary/25',
        bottom: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25',
        both: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/25',
        amber: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25',
        blue: 'bg-primary/10 text-primary border border-primary/25',
        violet: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

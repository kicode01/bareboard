import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-sans text-xs font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:border-border-strong',
        primary:
          'border border-primary bg-primary text-primary-foreground font-medium hover:brightness-105 shadow-xs',
        ghost:
          'border border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        outline:
          'border border-border bg-card text-foreground hover:bg-accent hover:border-border-strong',
        glass:
          'border border-border bg-glass text-muted-foreground backdrop-blur-md hover:bg-accent hover:text-foreground',
        active:
          'border border-primary/35 bg-primary/12 text-primary font-medium',
        amber:
          'border border-amber-600/30 bg-amber-500/12 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-medium',
        destructive:
          'border border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25',
      },
      size: {
        xs: 'h-6 px-2 text-[11px] rounded',
        sm: 'h-7 px-2.5 text-[11.5px]',
        default: 'h-8 px-3 text-xs',
        lg: 'h-9 px-3.5 text-xs',
        'icon-xs': 'h-6 w-6 p-0',
        'icon-sm': 'h-7 w-7 p-0',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };

'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * SkillSharp Design System Buttons — Ivory / Sage / Gold Theme
 * - Primary: Sage fill (bg-primary text-primary-foreground), hover darker sage (hover:bg-primary/90)
 * - Secondary/Outline: bg-card, border-border, text-foreground, hover bg-muted
 * - Dark: bg-foreground, text-background, hover bg-foreground/90
 * - Ghost: Transparent bg, hover bg-muted, text-foreground
 * - Destructive: bg-destructive, text-destructive-foreground
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium ' +
    'transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs hover:-translate-y-0.5 active:translate-y-0',
        secondary:
          'bg-card text-foreground border border-border hover:bg-muted hover:border-border shadow-xs hover:-translate-y-0.5 active:translate-y-0',
        dark:
          'bg-foreground text-background hover:bg-foreground/90 border border-foreground shadow-xs hover:-translate-y-0.5 active:translate-y-0',
        ghost:
          'text-foreground hover:bg-muted',
        link:
          'text-foreground hover:text-accent underline-offset-4 hover:underline p-0 h-auto active:scale-100',
        subtle:
          'bg-accent/20 text-foreground border border-accent/40 hover:bg-accent/30',
        glass:
          'bg-card/80 backdrop-blur-md text-foreground border border-border hover:bg-card shadow-xs',
        gradient:
          'bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-xs',
        danger:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-sm sm:text-base [&_svg]:size-4.5',
        icon: 'size-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Component>
    );
  },
);
Button.displayName = 'Button';
export { buttonVariants };

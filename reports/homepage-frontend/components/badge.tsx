import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all duration-200',
  {
    variants: {
      tone: {
        mustard: 'bg-secondary text-secondary-foreground border border-secondary',
        amber: 'bg-accent/30 text-foreground border border-accent/40',
        neutral: 'bg-muted text-muted-foreground border border-border',
        charcoal: 'bg-foreground text-background border border-foreground',
        dark: 'bg-foreground text-background border border-foreground',
        white: 'bg-card text-foreground border border-border shadow-xs',
        success: 'bg-primary/10 text-primary border border-primary/20',
        danger: 'bg-destructive/10 text-destructive border border-destructive/20 font-bold',
        info: 'bg-primary/10 text-primary border border-primary/20',
        purple: 'bg-muted text-muted-foreground border border-border',
        teal: 'bg-primary/10 text-primary border border-primary/20',
        indigo: 'bg-accent/20 text-foreground border border-accent/30',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ className, tone, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && (
        <span className="relative flex size-2 items-center justify-center" aria-hidden>
          {pulse && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
          )}
          <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
        </span>
      )}
      {children}
    </span>
  );
}

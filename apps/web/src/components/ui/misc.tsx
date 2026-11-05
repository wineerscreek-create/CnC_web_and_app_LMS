'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

// ------------------------------------------------------------------ switch
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-[15px] rounded-full bg-card shadow-xs ring-0',
        'transition-transform data-[state=checked]:translate-x-[15px]',
        'data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

// ------------------------------------------------------------------ checkbox
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-[18px] shrink-0 rounded-md border border-input bg-card',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
      'data-[state=checked]:text-primary-foreground disabled:opacity-50 transition-colors',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check className="size-3" strokeWidth={3} aria-hidden />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

// ------------------------------------------------------------------ progress
export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value?: number | null;
    barClassName?: string;
    thin?: boolean;
  }
>(({ className, value, barClassName, thin, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={Math.min(100, Math.max(0, value ?? 0))}
    className={cn(
      'relative w-full overflow-hidden rounded-full bg-muted',
      thin ? 'h-1.5' : 'h-2',
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn('h-full rounded-full bg-accent transition-transform duration-700 ease-out', barClassName)}
      style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';

// ------------------------------------------------------------------ avatar
export function Avatar({
  name,
  color,
  size = 28,
  className,
  src,
}: {
  name?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
  src?: string | null;
}) {
  const label = (name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <AvatarPrimitive.Root
      className={cn('inline-flex shrink-0 select-none overflow-hidden rounded-full border border-border', className)}
      style={{ width: size, height: size }}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name ?? ''} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className="flex size-full items-center justify-center font-bold text-accent-foreground bg-accent"
        style={{
          fontSize: Math.max(9, Math.round(size * 0.38)),
        }}
      >
        {label}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

// ------------------------------------------------------------------ separator
export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

// ------------------------------------------------------------------ tooltip
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[280px] rounded-xl border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-enter"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-popover stroke-border" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

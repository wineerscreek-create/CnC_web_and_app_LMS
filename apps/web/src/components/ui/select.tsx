'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative flex h-11 w-full max-w-full min-w-0 items-center rounded-xl border border-input bg-card pl-3.5 pr-9 text-base font-medium text-foreground',
      'truncate whitespace-nowrap overflow-hidden text-ellipsis shadow-xs',
      'data-[placeholder]:text-muted-foreground hover:bg-muted focus:border-ring focus:ring-2 focus:ring-ring/30',
      'disabled:cursor-not-allowed disabled:text-muted-foreground transition-all text-left',
      '[&>span]:truncate [&>span]:block [&>span]:min-w-0 [&>span]:max-w-full [&>span]:overflow-hidden [&>span]:text-ellipsis',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 shrink-0 text-muted-foreground pointer-events-none" aria-hidden />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'z-50 max-h-72 min-w-[10rem] overflow-hidden rounded-[10px] border border-border',
        'bg-popover shadow-2xl text-popover-foreground data-[state=open]:animate-fade',
        position === 'popper' && 'data-[side=bottom]:translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="scroll-thin max-h-72 overflow-y-auto p-1">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-[6px] py-1.5 pl-7 pr-2.5',
      'text-base text-foreground outline-none data-[highlighted]:bg-muted',
      'data-[highlighted]:text-foreground data-[disabled]:opacity-50 transition-colors',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5 text-primary" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

import * as React from 'react';

import { cn } from '@/lib/cn';

/** A table that scrolls horizontally rather than breaking the page layout. */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'table-scroll scroll-thin rounded-2xl border border-border bg-card shadow-xs overflow-hidden',
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-base', className)} {...props} />;
}

/** Columns that may be dropped on narrow screens rather than squeezing the whole table. */
const HIDE_BELOW: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export function Th({
  className,
  align = 'left',
  hideBelow,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-border bg-muted px-4 py-3 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  align = 'left',
  hideBelow,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <td
      className={cn(
        'border-b border-border px-4 py-3.5 align-middle text-[13.5px] sm:text-[14px] text-foreground',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'bg-card transition-colors duration-150 hover:bg-muted/60 last:[&>td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

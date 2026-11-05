import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-[6px] bg-muted animate-pulse',
        className,
      )}
    />
  );
}

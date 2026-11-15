'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
}

interface HorizontalTabSliderProps {
  tabs?: TabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
  listClassName?: string;
  triggerClassName?: string;
  children?: React.ReactNode;
  showArrows?: boolean;
}

/**
 * Universal Mobile Horizontal Tab Slider
 * Provides smooth touch scrolling, active tab auto-scroll-into-view,
 * overflow gradient indicators, and optional scroll arrow buttons.
 */
export function HorizontalTabSlider({
  tabs,
  activeTab,
  onTabChange,
  className,
  listClassName,
  triggerClassName,
  children,
  showArrows = true,
}: HorizontalTabSliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize, { passive: true });
    el.addEventListener('scroll', checkScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('scroll', checkScroll);
    };
  }, [checkScroll, tabs, children]);

  // Auto-scroll active tab into view whenever activeTab changes
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Find active element either by data-active or data-state="active"
    const activeEl =
      el.querySelector<HTMLElement>('[data-state="active"]') ||
      el.querySelector<HTMLElement>('[data-active="true"]');

    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeTab]);

  const scrollByAmount = (delta: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className={cn('relative w-full max-w-full min-w-0 group/tabs', className)}>
      {/* Left Arrow Button (visible on hover / when scrollable) */}
      {showArrows && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-180)}
          aria-label="Scroll tabs left"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex size-7 items-center justify-center rounded-full bg-card/90 border border-border shadow-md text-foreground transition-all duration-200 hover:bg-muted hover:scale-105"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}

      {/* Left fade gradient */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 top-0 bottom-0 z-[5] w-6 bg-gradient-to-r from-background to-transparent transition-opacity duration-200',
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Main horizontal scrolling container */}
      <div
        ref={containerRef}
        className={cn(
          'flex w-full min-w-0 max-w-full items-center overflow-x-auto scroll-smooth py-1 px-0.5',
          'no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          '-webkit-overflow-scrolling-touch',
          listClassName
        )}
      >
        {children ? (
          children
        ) : tabs ? (
          <div className="inline-flex min-w-0 items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => onTabChange?.(tab.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 select-none',
                    isActive
                      ? 'bg-card text-heading shadow-xs font-bold scale-[1.02]'
                      : 'text-muted-foreground hover:bg-card/50 hover:text-foreground',
                    triggerClassName
                  )}
                >
                  {Icon && <Icon className="size-3.5 shrink-0" />}
                  <span>{tab.label}</span>
                  {tab.badge && <span className="ml-1">{tab.badge}</span>}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Right fade gradient */}
      <div
        className={cn(
          'pointer-events-none absolute right-0 top-0 bottom-0 z-[5] w-6 bg-gradient-to-l from-background to-transparent transition-opacity duration-200',
          canScrollRight ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Right Arrow Button */}
      {showArrows && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(180)}
          aria-label="Scroll tabs right"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex size-7 items-center justify-center rounded-full bg-card/90 border border-border shadow-md text-foreground transition-all duration-200 hover:bg-muted hover:scale-105"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

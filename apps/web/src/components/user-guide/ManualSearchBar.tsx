'use client';

import * as React from 'react';
import { Search, X, ChevronRight, FileText } from 'lucide-react';
import type { GuideModule, GuideFAQ } from '@/data/userGuide/types';
import { GuideIcon } from './GuideIcon';

interface SearchResult {
  module: GuideModule;
  faq?: GuideFAQ;
  matchType: 'module' | 'faq';
}

interface ManualSearchBarProps {
  modules: GuideModule[];
  onSelectResult: (moduleId: string, faqId?: string) => void;
}

export function ManualSearchBar({ modules, onSelectResult }: ManualSearchBarProps) {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close results popup when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = React.useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const found: SearchResult[] = [];

    for (const mod of modules) {
      const matchModTitle = mod.title.toLowerCase().includes(q);
      const matchModDesc = mod.description.toLowerCase().includes(q);
      const matchModRoute = mod.pageRoute.toLowerCase().includes(q);

      if (matchModTitle || matchModDesc || matchModRoute) {
        found.push({ module: mod, matchType: 'module' });
      }

      for (const faq of mod.faqs) {
        const matchFaqQ = faq.question.toLowerCase().includes(q);
        const matchFaqDesc = faq.shortDescription.toLowerCase().includes(q);
        const matchFaqSteps = faq.steps.some((s) => s.toLowerCase().includes(q));

        if (matchFaqQ || matchFaqDesc || matchFaqSteps) {
          found.push({ module: mod, faq, matchType: 'faq' });
        }
      }
    }

    return found.slice(0, 12); // Limit to top 12 matches for speed and clean display
  }, [query, modules]);

  const handleSelect = (r: SearchResult) => {
    onSelectResult(r.module.id, r.faq?.id);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          placeholder="Search features, buttons, instructions..."
          className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-9 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2.5 flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.trim().length > 0 && (
        <div className="scroll-thin absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg animate-in fade-in-50 slide-in-from-top-1">
          {results.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No instructions matching &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Search Results ({results.length})
              </div>
              {results.map((res, i) => (
                <button
                  key={`${res.module.id}-${res.faq?.id || 'mod'}-${i}`}
                  type="button"
                  onClick={() => handleSelect(res)}
                  className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-muted transition-colors group"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                    {res.faq ? (
                      <FileText className="size-3.5" />
                    ) : (
                      <GuideIcon name={res.module.iconName} className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs font-semibold text-primary truncate">
                        {res.module.title}
                      </span>
                      <span className="text-2xs text-muted-foreground/60">•</span>
                      <span className="text-2xs font-mono text-muted-foreground truncate">
                        {res.module.pageRoute}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground truncate mt-0.5">
                      {res.faq ? res.faq.question : res.module.description}
                    </p>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-foreground shrink-0 self-center" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

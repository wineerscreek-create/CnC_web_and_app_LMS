'use client';

import * as React from 'react';
import {
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Info,
  Lightbulb,
  ExternalLink,
  Sparkles,
  HelpCircle,
  Check,
} from 'lucide-react';
import type { GuideFAQ } from '@/data/userGuide/types';
import { cn } from '@/lib/cn';

interface GuideAccordionProps {
  faqs: GuideFAQ[];
  completedFaqIds?: Set<string>;
  onToggleFaqRead?: (faqId: string) => void;
  onNavigateToModule?: (moduleTitle: string) => void;
}

export function GuideAccordion({
  faqs,
  completedFaqIds = new Set(),
  onToggleFaqRead,
  onNavigateToModule,
}: GuideAccordionProps) {
  // Open the first item by default
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => new Set(faqs.length > 0 ? [faqs[0].id] : []));

  // When faqs change (module switch), open the first FAQ
  React.useEffect(() => {
    if (faqs.length > 0) {
      setOpenIds(new Set([faqs[0].id]));
    }
  }, [faqs]);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setOpenIds(new Set(faqs.map((f) => f.id)));
  const collapseAll = () => setOpenIds(new Set());

  return (
    <div className="space-y-3">
      {/* Accordion header controls */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Feature Workflows ({faqs.length})
        </p>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={expandAll}
            className="text-primary hover:underline font-medium"
          >
            Expand all
          </button>
          <span className="text-muted-foreground/40">•</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-muted-foreground hover:text-foreground font-medium"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Accordion items */}
      <div className="space-y-3">
        {faqs.map((faq, index) => {
          const isOpen = openIds.has(faq.id);
          const isDone = completedFaqIds.has(faq.id);

          return (
            <div
              key={faq.id}
              className={cn(
                'rounded-xl border transition-all duration-200 overflow-hidden',
                isOpen
                  ? 'border-primary/40 bg-card shadow-xs'
                  : 'border-border/80 bg-card/60 hover:border-border hover:bg-card'
              )}
            >
              {/* Accordion Trigger */}
              <button
                type="button"
                onClick={() => toggle(faq.id)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors select-none"
                aria-expanded={isOpen}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono transition-colors',
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : isOpen
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isDone ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <div>
                    <h4
                      className={cn(
                        'text-sm font-bold leading-tight transition-colors',
                        isOpen ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {faq.question}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {faq.shortDescription}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isDone && (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3" />
                      Understood
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform duration-200',
                      isOpen && 'rotate-180 text-primary'
                    )}
                  />
                </div>
              </button>

              {/* Accordion Content */}
              {isOpen && (
                <div className="border-t border-border/70 p-4 sm:p-5 pt-3 space-y-4 bg-muted/10">
                  {/* Purpose Box */}
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Objective &amp; Purpose
                    </span>
                    <p className="text-xs text-foreground leading-relaxed">{faq.purpose}</p>
                  </div>

                  {/* Step-by-Step Instructions */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-foreground mb-2 flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" />
                      Step-by-Step Instructions
                    </span>
                    <ol className="space-y-2">
                      {faq.steps.map((step, sIdx) => (
                        <li
                          key={sIdx}
                          className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background p-2.5 text-xs text-foreground/90 transition-colors hover:border-primary/30"
                        >
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-bold font-mono text-2xs">
                            {sIdx + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Expected Result */}
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span>Expected Result</span>
                    </div>
                    <p className="text-xs text-foreground/90 leading-relaxed pl-5">
                      {faq.expectedResult}
                    </p>
                  </div>

                  {/* Notes / Warnings / Tips */}
                  {faq.noteOrWarning && (
                    <div
                      className={cn(
                        'rounded-lg border p-3',
                        faq.noteOrWarning.type === 'warning'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                          : faq.noteOrWarning.type === 'tip'
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200'
                          : 'border-border/80 bg-muted/50 text-foreground'
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
                        {faq.noteOrWarning.type === 'warning' && (
                          <>
                            <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-amber-700 dark:text-amber-300 uppercase tracking-wider text-2xs">
                              Important Warning
                            </span>
                          </>
                        )}
                        {faq.noteOrWarning.type === 'tip' && (
                          <>
                            <Lightbulb className="size-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="text-blue-700 dark:text-blue-300 uppercase tracking-wider text-2xs">
                              Pro Tip
                            </span>
                          </>
                        )}
                        {faq.noteOrWarning.type === 'note' && (
                          <>
                            <Info className="size-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground uppercase tracking-wider text-2xs">
                              System Note
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed pl-5 font-normal">
                        {faq.noteOrWarning.text}
                      </p>
                    </div>
                  )}

                  {/* Related Features & Action */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
                    {faq.relatedFeatures && faq.relatedFeatures.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-2xs text-muted-foreground font-medium">
                          Related Features:
                        </span>
                        {faq.relatedFeatures.map((feat) => (
                          <button
                            key={feat}
                            type="button"
                            onClick={() => onNavigateToModule?.(feat)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-2xs font-semibold text-foreground hover:bg-muted hover:border-primary/40 transition-colors"
                          >
                            <span>{feat}</span>
                            <ExternalLink className="size-2.5 opacity-60" />
                          </button>
                        ))}
                      </div>
                    )}

                    {onToggleFaqRead && (
                      <button
                        type="button"
                        onClick={() => onToggleFaqRead(faq.id)}
                        className={cn(
                          'ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
                          isDone
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                            : 'border border-border bg-background text-foreground hover:bg-muted'
                        )}
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>{isDone ? 'Marked as Understood' : 'Mark as Understood'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

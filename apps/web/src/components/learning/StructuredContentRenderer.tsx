'use client';

import * as React from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  HelpCircle,
  Lightbulb,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface StructuredContentRendererProps {
  content: string;
  className?: string;
}

export function StructuredContentRenderer({ content, className }: StructuredContentRendererProps) {
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [showExplanation, setShowExplanation] = React.useState<Record<string, boolean>>({});

  if (!content) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
        <p className="text-sm leading-relaxed italic">
          Lesson material for this session is delivered in class by your certified trainer. Use the
          practice lab to rehearse what it covers, then mark the lesson complete to keep your progress
          up to date.
        </p>
      </div>
    );
  }

  // Parse lines into logical blocks
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let currentList: string[] = [];
  let isNumbered = false;

  const flushList = (key: string) => {
    if (currentList.length === 0) return;
    if (isNumbered) {
      elements.push(
        <ol key={key} className="my-2.5 space-y-1.5 pl-5 list-decimal text-foreground text-sm leading-relaxed">
          {currentList.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={key} className="my-2.5 space-y-1.5 pl-5 list-disc text-foreground text-sm leading-relaxed">
          {currentList.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ul>
      );
    }
    currentList = [];
    isNumbered = false;
  };

  const formatInline = (text: string): string => {
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    formatted = formatted.replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-primary text-xs font-mono border border-border">$1</code>');
    return formatted;
  };

  let blockIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList(`list-${blockIdx++}`);
      continue;
    }

    // Heading 1
    if (trimmed.startsWith('# ')) {
      flushList(`list-${blockIdx++}`);
      elements.push(
        <div key={`h1-${blockIdx++}`} className="mb-4 pb-3 border-b border-border">
          <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {trimmed.slice(2)}
          </h1>
        </div>
      );
      continue;
    }

    // Heading 2 (e.g. ## 1. Introduction, ## 8. Case Study, ## 10. Knowledge Check)
    if (trimmed.startsWith('## ')) {
      flushList(`list-${blockIdx++}`);
      const title = trimmed.slice(3);
      const isDosAndDonts = title.toLowerCase().includes("do's") || title.toLowerCase().includes('dos and don');
      const isCaseStudy = title.toLowerCase().includes('case study');
      const isKnowledgeCheck = title.toLowerCase().includes('knowledge check');
      const isObjectives = title.toLowerCase().includes('learning objectives');

      elements.push(
        <div key={`h2-wrap-${blockIdx++}`} className="mt-6 mb-2.5 flex items-center gap-2 pt-2">
          {isDosAndDonts && <CheckCircle2 className="size-4 text-emerald-500" />}
          {isCaseStudy && <Lightbulb className="size-4 text-amber-500" />}
          {isKnowledgeCheck && <HelpCircle className="size-4 text-primary" />}
          {isObjectives && <Sparkles className="size-4 text-primary" />}
          <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground tracking-tight">
            {title}
          </h2>
        </div>
      );
      continue;
    }

    // Heading 3
    if (trimmed.startsWith('### ')) {
      flushList(`list-${blockIdx++}`);
      elements.push(
        <h3
          key={`h3-${blockIdx++}`}
          className="mt-3.5 mb-1.5 font-heading text-sm sm:text-base font-semibold text-foreground"
        >
          {trimmed.slice(4)}
        </h3>
      );
      continue;
    }

    // Bulleted list item (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (isNumbered && currentList.length > 0) flushList(`list-${blockIdx++}`);
      isNumbered = false;
      currentList.push(trimmed.slice(2));
      continue;
    }

    // Numbered list item (1. 2. etc)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!isNumbered && currentList.length > 0) flushList(`list-${blockIdx++}`);
      isNumbered = true;
      currentList.push(numMatch[2]);
      continue;
    }

    // Blockquote
    flushList(`list-${blockIdx++}`);
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${blockIdx++}`}
          className="my-3 border-l-2 border-primary/80 pl-3.5 py-1 text-sm italic text-muted-foreground bg-muted/30 rounded-r-lg"
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }}
        />
      );
    } else {
      elements.push(
        <p
          key={`p-${blockIdx++}`}
          className="my-1.5 text-sm leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }}
        />
      );
    }
  }

  flushList(`list-${blockIdx++}`);

  return <div className={cn('prose-sm max-w-none text-foreground leading-relaxed', className)}>{elements}</div>;
}

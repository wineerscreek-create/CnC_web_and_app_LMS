'use client';

import * as React from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
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
  if (!content) {
    return (
      <p className="text-base leading-relaxed text-muted-foreground italic">
        Lesson material for this session is delivered in class by your certified trainer. Use the
        practice lab to rehearse what it covers, then mark the lesson complete to keep your progress
        up to date.
      </p>
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
        <ol key={key} className="my-3 space-y-1.5 pl-6 list-decimal text-foreground text-sm sm:text-base leading-relaxed">
          {currentList.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={key} className="my-3 space-y-1.5 pl-6 list-disc text-foreground text-sm sm:text-base leading-relaxed">
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
    // Bold **text**
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-heading">$1</strong>');
    // Italic *text*
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    // Code `text`
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
        <h1
          key={`h1-${blockIdx++}`}
          className="mt-6 mb-3 font-heading text-2xl sm:text-3xl font-extrabold text-heading tracking-tight border-b border-border pb-2"
        >
          {trimmed.slice(2)}
        </h1>
      );
      continue;
    }

    // Heading 2
    if (trimmed.startsWith('## ')) {
      flushList(`list-${blockIdx++}`);
      const title = trimmed.slice(3);
      const isDosAndDonts = title.toLowerCase().includes("do's") || title.toLowerCase().includes('dos and don');
      const isCaseStudy = title.toLowerCase().includes('case study');
      const isKnowledgeCheck = title.toLowerCase().includes('knowledge check');

      elements.push(
        <div key={`h2-wrap-${blockIdx++}`} className="mt-7 mb-3 flex items-center gap-2">
          {isDosAndDonts && <CheckCircle2 className="size-5 text-accent" />}
          {isCaseStudy && <Lightbulb className="size-5 text-accent" />}
          {isKnowledgeCheck && <HelpCircle className="size-5 text-primary" />}
          <h2 className="font-heading text-lg sm:text-xl font-bold text-heading">
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
          className="mt-4 mb-2 font-heading text-base sm:text-lg font-bold text-heading"
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

    // Standard paragraph or blockquote
    flushList(`list-${blockIdx++}`);

    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${blockIdx++}`}
          className="my-3 border-l-4 border-primary pl-4 py-1.5 italic text-muted-foreground bg-muted/30 rounded-r-xl text-sm"
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }}
        />
      );
    } else {
      elements.push(
        <p
          key={`p-${blockIdx++}`}
          className="my-2 text-sm sm:text-base leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }}
        />
      );
    }
  }

  flushList(`list-${blockIdx++}`);

  return <div className={cn('space-y-1', className)}>{elements}</div>;
}


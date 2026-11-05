'use client';

import {
  ArrowRight,
  Bot,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { CNCLogo } from '@/components/ui/CNCLogo';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface AssistantCourse {
  id: string;
  title: string;
  slug: string;
  category?: string;
  fee?: number;
}

interface AssistantAnswer {
  id: string;
  question: string;
  answer: string;
  grounded: boolean;
  courses?: AssistantCourse[];
  links?: { label: string; href: string }[];
  escalation?: { available: boolean; message?: string; href?: string; label?: string };
  provider?: string;
  createdAt: string;
}

const STARTER_PROMPTS = [
  'What is SkillSharp?',
  'What courses are available?',
  'How does practice & interview coaching work?',
];

/**
 * Floating Homepage AI Chatbot (§6) — Ivory / Sage / Gold Theme.
 */
export function HomeAssistant() {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [thread, setThread] = React.useState<AssistantAnswer[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = React.useState<string | null>(null);

  const launcherRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  React.useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [thread, pending, open]);

  // Focus management: focus input on open, focus trigger button on close
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else if (thread.length > 0) {
      launcherRef.current?.focus();
    }
  }, [open, thread.length]);

  // Keyboard navigation: Escape key closes the chat panel
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  async function submitQuestion(text: string) {
    const asked = text.trim();
    if (!asked || pending) return;

    setPending(true);
    setErrorMessage(null);
    setLastFailedQuestion(null);
    setQuestion('');

    try {
      const response = await api.post('/home/assistant', { question: asked });
      const data = response.data;
      const newEntry: AssistantAnswer = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        question: asked,
        answer: data.answer || 'I could not generate an answer at this time.',
        grounded: Boolean(data.grounded),
        courses: data.courses || [],
        links: data.links || [],
        escalation: data.escalation,
        provider: data.provider,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setThread((current) => [...current, newEntry]);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to reach the AI assistant. Please check your connection and try again.';
      setErrorMessage(message);
      setLastFailedQuestion(asked);
    } finally {
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    submitQuestion(question);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion(question);
    }
  }

  function handleRetry() {
    if (lastFailedQuestion) {
      submitQuestion(lastFailedQuestion);
    }
  }

  function handleClear() {
    setThread([]);
    setErrorMessage(null);
    setLastFailedQuestion(null);
  }

  return (
    <aside aria-label="AI Chatbot Widget" className="relative">
      {/* ---------------------------------------------------- Floating Trigger Button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center">
        <div className="group relative">
          {/* Tooltip */}
          {!open && (
            <span
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-lg border border-border transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              Chat with AI
              <span className="absolute left-full top-1/2 -ml-1 -translate-y-1/2 border-4 border-transparent border-l-popover" />
            </span>
          )}

          <button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls="home-assistant-panel"
            aria-label={open ? 'Close AI chat panel' : 'Chat with AI'}
            className={cn(
              'relative flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-2xl transition-all duration-300',
              'bg-primary hover:bg-primary/90',
              'hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
              open ? 'rotate-90 bg-foreground text-background' : 'animate-bounce-subtle'
            )}
          >
            {open ? (
              <X className="size-6 transition-transform duration-200" aria-hidden />
            ) : (
              <>
                <Bot className="size-6 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                <span className="absolute -top-1 -right-1 flex size-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex size-3.5 rounded-full border-2 border-background bg-accent" />
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- Floating Chatbot Panel */}
      <div
        id="home-assistant-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="SkillSharp AI Assistant"
        className={cn(
          'fixed bottom-24 right-4 sm:right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out text-popover-foreground',
          'w-[calc(100vw-32px)] sm:w-[400px] h-[550px] max-h-[calc(100dvh-120px)]',
          open
            ? 'scale-100 opacity-100 translate-y-0 pointer-events-auto'
            : 'pointer-events-none scale-95 opacity-0 translate-y-4'
        )}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-border bg-card/80 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-primary border border-border">
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-heading">
                  CNC
                </p>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                  AI Live
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Grounded academic &amp; course advisor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {thread.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear conversation history"
                title="Clear chat"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm scroll-thin">
          {/* Welcome Intro */}
          <div className="rounded-xl border border-border bg-card/60 p-3.5">
            <p className="text-xs font-medium leading-relaxed text-foreground">
              👋 Hi! Ask me about our courses, interactive skill games, practice interviews, or
              how the EEDI employability rubric works. All answers are grounded in real platform data.
            </p>
          </div>

          {/* Quick Starter Chips (shown when no messages yet) */}
          {thread.length === 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested questions:
              </p>
              <div className="flex flex-col gap-1.5">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitQuestion(prompt)}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Thread */}
          {thread.map((entry) => (
            <div key={entry.id} className="space-y-2">
              {/* User Question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-xs sm:text-sm font-medium text-primary-foreground shadow-sm">
                  {entry.question}
                </div>
              </div>

              {/* Assistant Answer */}
              <div className="flex flex-col items-start gap-1">
                <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed text-foreground shadow-sm">
                  <p className="whitespace-pre-line">{entry.answer}</p>

                  {/* Course Recommendations */}
                  {entry.courses && entry.courses.length > 0 && (
                    <div className="mt-3 border-t border-border pt-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Related Courses:
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {entry.courses.map((course) => (
                          <li key={course.id}>
                            <Link
                              href={`/courses/${course.slug}`}
                              className="group flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/80"
                            >
                              <span className="truncate group-hover:underline">{course.title}</span>
                              <ArrowRight className="size-3 shrink-0 text-gold-text transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Navigation Links */}
                  {entry.links && entry.links.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {entry.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground transition-colors hover:opacity-90"
                        >
                          <span>{link.label}</span>
                          <ArrowRight className="size-2.5" />
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Support Escalation */}
                  {entry.escalation?.available && (
                    <div className="mt-2.5 pt-2 border-t border-border text-[11px] text-muted-foreground">
                      <span>{entry.escalation.message ?? 'Have questions about admissions or batch schedules?'} </span>
                      <Link
                        href={entry.escalation.href ?? '/contact'}
                        className="font-semibold text-gold-text underline hover:opacity-90"
                      >
                        {entry.escalation.label ?? 'Contact programme office'}
                      </Link>
                    </div>
                  )}
                </div>
                <span className="pl-1 text-[10px] text-muted-foreground">{entry.createdAt}</span>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
                <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.4s]" />
              </div>
              <span className="text-[11px]">Consulting knowledge base…</span>
            </div>
          )}

          {/* Error Message with Retry */}
          {errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-medium">{errorMessage}</p>
              {lastFailedQuestion && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={pending}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-destructive underline hover:opacity-90"
                >
                  <RotateCcw className="size-3" /> Retry question
                </button>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input Footer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-border bg-card/70 p-3"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="home-assistant-input" className="sr-only">
              Ask AI assistant
            </label>
            <textarea
              ref={inputRef}
              id="home-assistant-input"
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={pending}
              placeholder="Ask about courses, games, or practice..."
              className={cn(
                'flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground',
                'focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
                'disabled:cursor-not-allowed disabled:bg-muted'
              )}
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              loading={pending}
              disabled={pending || !question.trim()}
              aria-label="Send message"
              className="size-9 shrink-0 rounded-xl shadow-xs"
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-foreground">Enter</kbd> to send, <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-foreground">Shift+Enter</kbd> for new line
          </p>
        </form>
      </div>
    </aside>
  );
}

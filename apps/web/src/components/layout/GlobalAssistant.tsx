'use client';

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CNCLogo } from '@/components/ui/CNCLogo';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { type Role } from '@/lib/roleRoutes';
import type { SessionUser } from '@/store/authSlice';
import { useOffline } from '@/context/OfflineContext';

interface ChatTurn {
  id: string;
  question: string;
  answer: string;
  executionMode?: string;
  provider?: string;
  providerStatus?: string;
  citations?: string[];
  createdAt?: string;
}

const ROLE_STARTERS: Record<string, string[]> = {
  STUDENT: [
    'What are my weakest EEDI employability areas?',
    'Review my ATS resume compatibility score',
    'Which courses am I enrolled in?',
    'What is my upcoming academic schedule?',
  ],
  TRAINER: [
    'What batches and cohorts are assigned to me?',
    'Show my cohort schedule today',
    'Which students need evaluation intervention?',
    'Review practice assessment rubric parameters',
  ],
  HOD: [
    'What is my department average EEDI readiness score?',
    'List active department batches and cohorts',
    'Check trainer assignment completion rates',
    'Show curriculum compliance metrics',
  ],
  ADMIN: [
    'Show institution-wide participant count and active courses',
    'Platform overview and catalog metrics',
    'Check AI and storage provider status',
  ],
  SUPER_ADMIN: [
    'Platform overview across all colleges and courses',
    'Check active AI models and storage driver status',
    'System health and user distribution',
  ],
};

const ROLE_QUICK_LINKS: Record<string, { label: string; href: string }[]> = {
  STUDENT: [
    { label: 'Resume Analyzer', href: '/student/resume-analyzer' },
    { label: 'Practice Lab', href: '/student/practice' },
    { label: 'My Progress', href: '/student/progress' },
    { label: 'My Profile', href: '/student/profile' },
  ],
  TRAINER: [
    { label: 'Cohorts', href: '/trainer/batches' },
    { label: 'Schedule', href: '/trainer/schedule' },
    { label: 'Assessments', href: '/trainer/assessments' },
  ],
  HOD: [
    { label: 'Dashboard', href: '/hod/dashboard' },
    { label: 'Students', href: '/hod/students' },
    { label: 'Reports', href: '/hod/reports' },
  ],
  ADMIN: [
    { label: 'Dashboard', href: '/admin/dashboard' },
    { label: 'Users', href: '/admin/users' },
    { label: 'Courses', href: '/admin/courses' },
  ],
  SUPER_ADMIN: [
    { label: 'Platform Operations', href: '/super-admin' },
    { label: 'Colleges', href: '/super-admin/colleges' },
  ],
};

export function GlobalAssistant({ user }: { user: SessionUser }) {
  const { isOnline } = useOffline();
  const [open, setOpen] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState<ChatTurn[]>([]);
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Destructive action confirmation state
  const [confirmAction, setConfirmAction] = React.useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const role = (user.role as string) || 'STUDENT';
  const starters = ROLE_STARTERS[role] || ROLE_STARTERS.STUDENT;
  const quickLinks = ROLE_QUICK_LINKS[role] || ROLE_QUICK_LINKS.STUDENT;

  // Auto-scroll on new message
  React.useEffect(() => {
    if (open) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [history, loading, open]);

  // Load history on first open
  React.useEffect(() => {
    if (open && !historyLoaded) {
      api
        .get<{ success: boolean; data: ChatTurn[] }>('/ai/chat/history')
        .then((res) => {
          if (Array.isArray(res?.data) && res.data.length > 0) {
            setHistory(res.data);
          }
        })
        .catch(() => {})
        .finally(() => setHistoryLoaded(true));
    }
  }, [open, historyLoaded]);

  // Focus textarea on open
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? query).trim();
    if (!text || loading) return;

    setErrorMsg(null);
    setLoading(true);
    setQuery('');

    const optimisticId = `turn-${Date.now()}`;
    const optimisticTurn: ChatTurn = {
      id: optimisticId,
      question: text,
      answer: '',
      createdAt: new Date().toISOString(),
    };

    setHistory((prev) => [...prev, optimisticTurn]);

    try {
      const response = await api.post('/ai/chat', { question: text });
      const data = response.data;
      setHistory((prev) =>
        prev.map((turn) =>
          turn.id === optimisticId
            ? {
                ...turn,
                answer: data.answer || 'No answer generated.',
                executionMode: data.executionMode,
                provider: data.provider,
                providerStatus: data.providerStatus,
                citations: data.citations,
              }
            : turn
        )
      );
    } catch (caught) {
      const apiError = caught as ApiError;
      const message =
        apiError.message ||
        'Unable to complete query. Please check your connection and try again.';
      setErrorMsg(message);
      setHistory((prev) =>
        prev.map((turn) =>
          turn.id === optimisticId
            ? {
                ...turn,
                answer: `⚠️ Error: ${message}`,
                executionMode: 'ERROR',
              }
            : turn
        )
      );
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleClearHistory() {
    setConfirmAction({
      title: 'Clear Conversation History',
      description: 'Are you sure you want to permanently delete your AI chat history? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await api.delete('/ai/chat/history');
          setHistory([]);
          toast.success('Conversation history cleared');
        } catch {
          toast.error('Failed to clear history');
        } finally {
          setConfirmAction(null);
        }
      },
    });
  }

  function copyAnswer(id: string, text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Copied to clipboard');
    }
  }

  return (
    <>
      {/* Floating Launcher Button */}
      <div className="fixed bottom-5 right-5 z-40 flex items-center">
        <div className="group relative">
          {!open && (
            <span
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-xl bg-card border border-border px-3 py-1.5 text-xs font-semibold text-foreground opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
            >
              SkillSharp AI Assistant
              <span className="absolute left-full top-1/2 -ml-1 -translate-y-1/2 border-4 border-transparent border-l-card" />
            </span>
          )}

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label={open ? 'Close AI Assistant' : 'Open SkillSharp AI Assistant'}
            className={cn(
              'relative flex size-13 items-center justify-center rounded-2xl text-primary-foreground shadow-2xl transition-all duration-300',
              'bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
              open ? 'rotate-90 bg-foreground text-background' : 'shadow-primary/30'
            )}
          >
            {open ? (
              <X className="size-5 transition-transform duration-200" aria-hidden />
            ) : (
              <>
                <Bot className="size-6 text-primary-foreground transition-transform duration-200 group-hover:scale-110" aria-hidden />
                <span className="absolute -top-1 -right-1 flex size-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-80" />
                  <span className="relative inline-flex size-3.5 rounded-full border-2 border-background bg-accent" />
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Floating Chatbot Window */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label="SkillSharp AI Assistant"
        className={cn(
          'fixed bottom-22 right-4 sm:right-6 z-40 flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl backdrop-blur-2xl transition-all duration-200 ease-out text-foreground',
          maximized
            ? 'w-[calc(100vw-32px)] sm:w-[680px] h-[720px] max-h-[calc(100dvh-110px)]'
            : 'w-[calc(100vw-32px)] sm:w-[420px] h-[580px] max-h-[calc(100dvh-110px)]',
          open
            ? 'scale-100 opacity-100 translate-y-0 pointer-events-auto'
            : 'pointer-events-none scale-95 opacity-0 translate-y-4'
        )}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-heading truncate">
                  AI Academic Coach
                </p>
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                  Gemini + Groq
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {user.name} · {user.roleLabel || user.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                aria-label="Clear chat history"
                title="Clear chat history"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMaximized((prev) => !prev)}
              aria-label={maximized ? 'Restore window' : 'Maximize window'}
              title={maximized ? 'Restore window' : 'Maximize window'}
              className="hidden sm:flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Offline Notice */}
        {!isOnline && (
          <div className="mx-3 mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-foreground flex items-center gap-2.5 shrink-0">
            <WifiOff className="size-4 text-amber-500 shrink-0" />
            <span className="text-[11px] leading-snug">
              AI Academic Coach is offline. Inference requires an internet connection. Downloaded materials remain available.
            </span>
          </div>
        )}

        {/* Destructive Action Confirmation Modal */}
        {confirmAction && (
          <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-xs shrink-0 animate-enter">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-heading">{confirmAction.title}</p>
                <p className="mt-0.5 text-muted-foreground leading-relaxed">{confirmAction.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    className="text-xs h-7 px-3"
                    onClick={() => void confirmAction.onConfirm()}
                  >
                    Confirm Action
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-3"
                    onClick={() => setConfirmAction(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Links Navigation Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-border/60 bg-muted/30 shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
            Quick Portals:
          </span>
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold bg-card border border-border text-foreground hover:bg-muted hover:text-accent transition-colors"
            >
              <span>{link.label}</span>
              <ExternalLink className="size-2.5 opacity-60" />
            </Link>
          ))}
        </div>

        {/* Conversation Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-thin">
          {history.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="size-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold font-heading text-heading">
                  Hello, {user.name.split(' ')[0]}!
                </h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  I am your personalized AI Academic Assistant grounded in your live course records, EEDI metrics, and institutional schedule.
                </p>
              </div>

              {/* Starter questions */}
              <div className="pt-2 text-left space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                  Suggested Queries:
                </p>
                {starters.map((starter, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void handleSend(starter)}
                    className="w-full text-left p-2.5 rounded-xl border border-border bg-card/60 hover:bg-muted text-xs font-medium text-foreground transition-all duration-150 hover:border-accent/40 flex items-center justify-between group"
                  >
                    <span className="truncate">{starter}</span>
                    <ArrowRight className="size-3 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((turn) => (
              <div key={turn.id} className="space-y-3">
                {/* User Message */}
                <div className="flex items-start gap-2 justify-end">
                  <div className="rounded-2xl rounded-tr-xs bg-primary px-3.5 py-2.5 text-xs text-primary-foreground max-w-[85%] shadow-xs leading-relaxed">
                    {turn.question}
                  </div>
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary mt-1 text-[10px] font-bold">
                    {user.name.charAt(0)}
                  </div>
                </div>

                {/* Assistant Message */}
                <div className="flex items-start gap-2 justify-start">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground mt-1">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-muted/60 border border-border px-3.5 py-2.5 text-xs text-foreground max-w-[90%] shadow-xs space-y-2">
                    {turn.answer ? (
                      <div className="prose prose-xs dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                        {turn.answer}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground py-1">
                        <RefreshCw className="size-3 animate-spin" />
                        <span className="text-xs">Grounding response against records…</span>
                      </div>
                    )}

                    {/* Metadata & Actions footer */}
                    {turn.answer && (
                      <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {turn.provider && (
                            <span className="font-semibold uppercase tracking-wider text-accent">
                              {turn.provider}
                            </span>
                          )}
                          {turn.executionMode === 'REAL_PROVIDER_RESPONSE' && (
                            <span className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="size-2.5" />
                              Live AI
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => copyAnswer(turn.id, turn.answer)}
                          className="flex items-center gap-1 hover:text-foreground transition-colors p-1"
                          aria-label="Copy answer"
                        >
                          {copiedId === turn.id ? (
                            <Check className="size-3 text-success" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          <span>{copiedId === turn.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-border bg-card shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-end gap-2"
          >
            <div className="min-w-0 flex-1 relative">
              <textarea
                ref={inputRef}
                rows={1}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isOnline}
                placeholder={
                  isOnline
                    ? 'Ask about your courses, EEDI scores, schedule…'
                    : 'AI assistant is offline. Reconnect to chat.'
                }
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-24 leading-relaxed disabled:opacity-50"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={loading}
              disabled={!query.trim() || loading || !isOnline}
              className="size-8 rounded-xl p-0 flex items-center justify-center shrink-0"
              aria-label="Send message"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

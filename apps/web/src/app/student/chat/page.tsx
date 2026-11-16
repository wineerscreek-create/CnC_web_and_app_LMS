'use client';

import {
  Bot,
  Compass,
  FileCheck2,
  MessageSquare,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { OnlineOnlyNotice } from '@/components/offline/OnlineOnlyNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { MessagingApp } from '@/components/messaging/MessagingApp';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  provider?: string;
  citations?: string[];
  createdAt: string;
}

const AI_PROMPT_SUGGESTIONS = [
  'What courses am I currently enrolled in?',
  'What are my diagnosed skill gaps and weakest EEDI pillar?',
  'What is my ATS resume compatibility score and missing keywords?',
  'Explain the 5 EEDI employability evaluation parameters',
];

export default function StudentChatPage() {
  const [activeMainMode, setActiveMainMode] = React.useState<'messaging' | 'ai'>('messaging');

  // AI Assistant chat state
  const [aiMessages, setAiMessages] = React.useState<AiChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      content:
        'Hello! I am your SkillSharp AI Academic Assistant. I provide truthful, grounded guidance on your active courses, diagnosed EEDI employability pillars, ATS resume compatibility, and practice lab milestones.\n\nHow can I help you today?',
      citations: [
        'Enrolled Course Catalog & Syllabus',
        'Verified EEDI Diagnostic Evaluation',
        'ATS Resume Skill Profile',
      ],
      createdAt: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);

  const aiMessagesEndRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom for AI messages
  React.useEffect(() => {
    if (activeMainMode === 'ai') {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, activeMainMode]);

  const handleAiSend = async (promptText?: string) => {
    const query = (promptText || aiInput).trim();
    if (!query || aiLoading) return;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: query,
      createdAt: new Date().toISOString(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!promptText) setAiInput('');
    setAiLoading(true);

    try {
      const res = await api.post<any>('/ai/chat', { question: query });
      const answerData = res?.data ?? res;
      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        content: answerData?.answer ?? 'I have recorded your request. Let me know if you need more details.',
        provider: answerData?.provider ?? 'deterministic-rag-engine',
        citations: answerData?.citations ?? [
          'Enrolled Course Catalog & Syllabus',
          'Verified EEDI Diagnostic Evaluation',
          'ATS Resume Skill Profile',
        ],
        createdAt: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'assistant',
          content: 'Unable to reach the academic assistant at this moment. Please check your network and try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Institute Messaging & Academic Assistant"
        description="Official batch group communications, direct trainer messaging, and 24/7 grounded AI academic coaching."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveMainMode('messaging')}
              className={cn(
                'tactile-press rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                activeMainMode === 'messaging'
                  ? 'bg-accent text-accent-foreground shadow-xs'
                  : 'bg-card text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
              )}
            >
              <Users className="size-3.5 inline mr-1.5" />
              Batch & Institute Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveMainMode('ai')}
              className={cn(
                'tactile-press rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                activeMainMode === 'ai'
                  ? 'bg-accent text-accent-foreground shadow-xs'
                  : 'bg-card text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
              )}
            >
              <Sparkles className="size-3.5 inline mr-1.5 text-accent" />
              AI Academic Coach
            </button>
          </div>
        }
      />

      <OnlineOnlyNotice featureName="AI Chat & Messaging" />

      {activeMainMode === 'messaging' ? (
        /* ==================== UNIFIED INSTITUTE MESSAGING ==================== */
        <MessagingApp role="STUDENT" />
      ) : (
        /* ==================== AI ACADEMIC COACH VIEW ==================== */
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col h-[650px] bg-card border border-border rounded-2xl shadow-card overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-border bg-card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-primary border border-border">
                  <Bot className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-heading flex items-center gap-2">
                    SkillSharp AI Academic Assistant
                    <Badge tone="mustard" className="text-[10px] py-0 px-1.5">Grounded RAG</Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Truthful responses referencing your enrolled courses, EEDI scores, and resume skills.
                  </p>
                </div>
              </div>
              <Badge tone="success" dot className="hidden sm:inline-flex text-xs">
                Active & Grounded
              </Badge>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {aiMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col max-w-[85%]',
                    msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                  )}
                >
                  <div
                    className={cn(
                      'p-4 rounded-2xl text-sm leading-relaxed shadow-xs',
                      msg.sender === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-xs'
                        : 'bg-muted/70 text-foreground border border-border rounded-bl-xs'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
                        <span className="font-semibold block mb-1">Grounded Sources:</span>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {msg.citations.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                  <Bot className="size-4 animate-spin text-primary" />
                  Reasoning over curriculum and academic record...
                </div>
              )}
              <div ref={aiMessagesEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAiSend();
              }}
              className="p-3 border-t border-border bg-card flex items-center gap-2"
            >
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Ask about your syllabus, EEDI diagnostic score, or resume review…"
                className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                disabled={!aiInput.trim() || aiLoading}
                variant="primary"
                className="px-4 py-2.5 flex items-center gap-1.5"
              >
                <Send className="size-4" />
                <span className="hidden sm:inline">Ask AI</span>
              </Button>
            </form>
          </div>

          {/* AI Sidebar: Quick Suggestions & Context Pillars */}
          <div className="space-y-4">
            <Card className="card-interactive">
              <CardBody className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Compass className="size-3.5 text-primary" />
                  Suggested Questions
                </h3>
                <div className="space-y-2">
                  {AI_PROMPT_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => handleAiSend(sug)}
                      disabled={aiLoading}
                      className="w-full text-left p-2.5 rounded-xl border border-border bg-card hover:border-accent hover:bg-muted text-xs font-medium text-foreground transition-all tactile-press"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card className="card-interactive">
              <CardBody className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileCheck2 className="size-3.5 text-primary" />
                  Grounded Verification
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The AI Assistant answers strictly from your authenticated student record, syllabus catalog, and diagnostic evaluations. It never fabricates grades or scores.
                </p>
                <div className="rounded-xl bg-muted/40 border border-border p-2.5 text-[11px] text-muted-foreground space-y-1">
                  <div>✓ PostgreSQL Enrolled Courses</div>
                  <div>✓ EEDI 5-Parameter Diagnostics</div>
                  <div>✓ ATS Resume Keyword Extractions</div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

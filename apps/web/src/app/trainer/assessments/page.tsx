'use client';

import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit,
  Eye,
  FileSpreadsheet,
  Lock,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';

import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const DEFAULT_FEEDBACK = {
  FAIL: "Don't be discouraged. Every attempt is a step forward in learning. Review the fundamental concepts, practice the weak areas, and you will come back stronger on the next attempt!",
  NEED_IMPROVEMENT: 'Good effort, but there is clear room for growth. Focus on revisiting the topics where questions were missed, take time to understand the explanations, and aim higher next time!',
  GOOD: 'Well done! You have demonstrated a solid understanding of the concepts. With a little more attention to detail and practice on advanced questions, you can reach excellence!',
  EXCELLENT: 'Outstanding performance! You have mastered the subject matter and achieved exceptional results. Keep up the high standard and continue to inspire your peers!',
};

export default function TrainerAssessmentsPage() {
  const [selectedBatch, setSelectedBatch] = React.useState<string>('all');
  const batchesQuery = useApi<any[]>('/trainer/batches');
  const coursesQuery = useApi<{ courses: any[]; total: number }>('/trainer/courses');
  const quizzesQuery = useApi<any[]>(
    `/trainer/assessments${selectedBatch !== 'all' ? `?batchId=${selectedBatch}` : ''}`
  );

  // Dialog States
  const [createOpen, setCreateOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [resultsOpen, setResultsOpen] = React.useState(false);
  const [eediOpen, setEediOpen] = React.useState(false);

  const [activeQuiz, setActiveQuiz] = React.useState<any>(null);
  const [createTab, setCreateTab] = React.useState<'details' | 'timing' | 'scheduling' | 'classification' | 'feedback' | 'preview'>('details');

  // Create form state organized across Sections A - E
  const [createForm, setCreateForm] = React.useState({
    // Section A: Basic Assessment Details
    title: '',
    description: '',
    instructions: '',
    courseId: '',
    batchIds: [] as string[],
    maxScore: 100,
    enableNegativeMarking: false,
    negativeMarkValue: 0.25,

    // Section B: Timing & Proctoring Configuration
    timingMode: 'FIXED_TOTAL' as 'FIXED_TOTAL' | 'PER_QUESTION',
    durationMinutes: 30,
    questionDuration: 60,
    answerRevealDuration: 10,
    cameraRequired: true,
    fullscreenRequired: true,
    maxWarnings: 3,

    // Section C: Scheduling
    opensAt: '',
    closesAt: '',

    // Section D: Performance Classification percentage upper bounds
    failMax: 39,
    needImprovementMax: 59,
    goodMax: 79,

    // Section E: Motivational Feedback Configuration
    feedbackFail: DEFAULT_FEEDBACK.FAIL,
    feedbackNeedImprovement: DEFAULT_FEEDBACK.NEED_IMPROVEMENT,
    feedbackGood: DEFAULT_FEEDBACK.GOOD,
    feedbackExcellent: DEFAULT_FEEDBACK.EXCELLENT,
  });
  const [creating, setCreating] = React.useState(false);

  // Batch assign state
  const [selectedAssignBatches, setSelectedAssignBatches] = React.useState<string[]>([]);
  const [assigning, setAssigning] = React.useState(false);

  // CSV upload state
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [uploadingCsv, setUploadingCsv] = React.useState(false);

  // Results & EEDI state
  const [resultsData, setResultsData] = React.useState<any>(null);
  const [loadingResults, setLoadingResults] = React.useState(false);
  const [eediData, setEediData] = React.useState<any>(null);
  const [loadingEedi, setLoadingEedi] = React.useState(false);

  const batches = batchesQuery.data ?? [];
  const courses = coursesQuery.data?.courses ?? [];
  const quizzes = quizzesQuery.data ?? [];

  // Reset form helper
  const resetCreateForm = () => {
    setCreateForm({
      title: '',
      description: '',
      instructions: '',
      courseId: '',
      batchIds: [],
      maxScore: 100,
      enableNegativeMarking: false,
      negativeMarkValue: 0.25,
      timingMode: 'FIXED_TOTAL',
      durationMinutes: 30,
      questionDuration: 60,
      answerRevealDuration: 10,
      cameraRequired: true,
      fullscreenRequired: true,
      maxWarnings: 3,
      opensAt: '',
      closesAt: '',
      failMax: 39,
      needImprovementMax: 59,
      goodMax: 79,
      feedbackFail: DEFAULT_FEEDBACK.FAIL,
      feedbackNeedImprovement: DEFAULT_FEEDBACK.NEED_IMPROVEMENT,
      feedbackGood: DEFAULT_FEEDBACK.GOOD,
      feedbackExcellent: DEFAULT_FEEDBACK.EXCELLENT,
    });
    setCreateTab('details');
  };

  // Handle Create Quiz
  async function handleCreateQuiz(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error('Assessment title is required');
      setCreateTab('details');
      return;
    }

    if (createForm.timingMode === 'PER_QUESTION') {
      const qDur = Number(createForm.questionDuration);
      const revDur = Number(createForm.answerRevealDuration);
      if (qDur <= revDur) {
        toast.error('Question Duration must be strictly greater than Answer Reveal Duration');
        setCreateTab('timing');
        return;
      }
    }

    if (createForm.opensAt && createForm.closesAt) {
      const oDate = new Date(createForm.opensAt).getTime();
      const cDate = new Date(createForm.closesAt).getTime();
      if (cDate <= oDate) {
        toast.error('End Date & Time must be strictly after Start Date & Time');
        setCreateTab('scheduling');
        return;
      }
    }

    const fMax = Number(createForm.failMax);
    const niMax = Number(createForm.needImprovementMax);
    const gMax = Number(createForm.goodMax);

    if (fMax < 0 || fMax >= niMax || niMax >= gMax || gMax >= 100) {
      toast.error('Performance brackets must be strictly ascending: 0 <= FAIL < NEED IMPROVEMENT < GOOD < 100');
      setCreateTab('classification');
      return;
    }

    setCreating(true);
    try {
      await api.post('/trainer/assessments', {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        instructions: createForm.instructions.trim() || undefined,
        courseId: createForm.courseId || undefined,
        durationMinutes: Number(createForm.durationMinutes),
        maxScore: Number(createForm.maxScore),
        batchIds: createForm.batchIds,
        opensAt: createForm.opensAt ? new Date(createForm.opensAt).toISOString() : undefined,
        closesAt: createForm.closesAt ? new Date(createForm.closesAt).toISOString() : undefined,
        settings: {
          timing_mode: createForm.timingMode,
          duration_minutes: Number(createForm.durationMinutes),
          camera_required: createForm.cameraRequired,
          fullscreen_required: createForm.fullscreenRequired,
          max_warnings: Number(createForm.maxWarnings),
          enable_timed_questions: createForm.timingMode === 'PER_QUESTION',
          question_duration: Number(createForm.questionDuration),
          answer_reveal_duration: Number(createForm.answerRevealDuration),
          auto_advance: true,
          allow_previous: false,
          allow_modification: false,
          negative_marking: createForm.enableNegativeMarking ? Number(createForm.negativeMarkValue) : 0,
          performance_classification: {
            FAIL: [0, fMax],
            NEED_IMPROVEMENT: [fMax + 1, niMax],
            GOOD: [niMax + 1, gMax],
            EXCELLENT: [gMax + 1, 100],
          },
          motivational_feedback: {
            FAIL: createForm.feedbackFail.trim(),
            NEED_IMPROVEMENT: createForm.feedbackNeedImprovement.trim(),
            GOOD: createForm.feedbackGood.trim(),
            EXCELLENT: createForm.feedbackExcellent.trim(),
          },
        },
      });
      toast.success('Assessment created and published successfully');
      setCreateOpen(false);
      resetCreateForm();
      quizzesQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to create assessment');
    } finally {
      setCreating(false);
    }
  }

  // Open Assign Batches Modal
  function openAssignModal(quiz: any) {
    setActiveQuiz(quiz);
    const currentBatches = (quiz.assignedBatches || []).map((b: any) => b.batchId);
    setSelectedAssignBatches(currentBatches);
    setAssignOpen(true);
  }

  // Save Batch Assignments
  async function handleSaveBatches() {
    if (!activeQuiz) return;
    setAssigning(true);
    try {
      await api.post(`/trainer/assessments/${activeQuiz.id}/assign-batches`, {
        batchIds: selectedAssignBatches,
      });
      toast.success('Batches assigned successfully');
      setAssignOpen(false);
      quizzesQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to update batch assignments');
    } finally {
      setAssigning(false);
    }
  }

  // Open CSV Upload Modal
  function openCsvModal(quiz: any) {
    setActiveQuiz(quiz);
    setCsvFile(null);
    setCsvOpen(true);
  }

  // Upload CSV
  async function handleUploadCsv() {
    if (!activeQuiz || !csvFile) {
      toast.error('Please select a valid CSV file');
      return;
    }
    setUploadingCsv(true);
    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await api.upload(`/trainer/assessments/${activeQuiz.id}/upload-csv`, formData);
      toast.success(res.message || 'Questions imported successfully');
      setCsvOpen(false);
      quizzesQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to import CSV');
    } finally {
      setUploadingCsv(false);
    }
  }

  // Open Results Modal
  async function openResultsModal(quiz: any) {
    setActiveQuiz(quiz);
    setResultsOpen(true);
    setLoadingResults(true);
    try {
      const res = await api.get<any>(`/trainer/assessments/${quiz.id}/results`);
      setResultsData(res.data);
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to load results');
    } finally {
      setLoadingResults(false);
    }
  }

  // Open EEDI Analytics Modal
  async function openEediModal(quiz: any) {
    setActiveQuiz(quiz);
    setEediOpen(true);
    setLoadingEedi(true);
    try {
      const res = await api.get<any>(`/trainer/assessments/${quiz.id}/eedi-analytics`);
      setEediData(res.data);
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to load EEDI analytics');
    } finally {
      setLoadingEedi(false);
    }
  }

  // Delete Quiz
  async function handleDeleteQuiz(quizId: string) {
    if (!confirm('Are you sure you want to delete this assessment? All associated data will be removed.')) return;
    try {
      await api.delete(`/trainer/assessments/${quizId}`);
      toast.success('Assessment deleted');
      quizzesQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to delete assessment');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments &amp; Quizzes"
        description="Create, schedule, and assign proctored assessments across your authorized batches with EEDI scoring."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Plus className="size-4" aria-hidden />
            New Assessment
          </Button>
        }
      />

      {/* Filter Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Filter by Batch:</span>
          <Select value={selectedBatch} onValueChange={setSelectedBatch}>
            <SelectTrigger className="w-52 h-9 text-xs">
              <SelectValue placeholder="All Managed Batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Managed Batches</SelectItem>
              {batches.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {quizzes.length} assessment(s)
        </p>
      </div>

      {/* Assessment Cards Grid */}
      <AsyncSection query={quizzesQuery} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
        {(rows) => (
          <div className="grid gap-5 lg:grid-cols-2">
            {rows.map((quiz) => (
              <Card
                key={quiz.id}
                className="border-border bg-card shadow-card transition-all duration-300 hover:shadow-card hover:-translate-y-0.5"
              >
                <CardBody className="p-5 flex flex-col h-full space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
                      <ClipboardList className="size-5" aria-hidden />
                    </span>
                    <div className="flex items-center gap-2">
                      {/* Scheduling Status Badge */}
                      {(() => {
                        const now = new Date();
                        if (quiz.opensAt && new Date(quiz.opensAt) > now) {
                          return (
                            <Badge tone="info" className="text-[10px] font-bold">
                              UPCOMING
                            </Badge>
                          );
                        }
                        if (quiz.closesAt && new Date(quiz.closesAt) < now) {
                          return (
                            <Badge tone="danger" className="text-[10px] font-bold">
                              EXPIRED
                            </Badge>
                          );
                        }
                        return (
                          <Badge tone="success" className="text-[10px] font-bold">
                            ACTIVE
                          </Badge>
                        );
                      })()}
                      {quiz.quizCode && (
                        <Badge tone="neutral" className="font-mono text-[10px]">
                          {quiz.quizCode}
                        </Badge>
                      )}
                      <StatusBadge status={quiz.status} />
                    </div>
                  </div>

                  <div>
                    <h2 className="text-base font-bold font-heading text-heading">{quiz.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {quiz.questions} question(s) · {quiz.durationMinutes} mins · Max Score: {quiz.maxScore}
                    </p>
                    {/* Timing & Scheduling Metadata Pills */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 font-medium">
                        <Clock className="size-3 text-primary" />
                        {quiz.settings?.timing_mode === 'PER_QUESTION' ? 'Per-Question' : 'Fixed Duration'}
                        {Number(quiz.settings?.answer_reveal_duration || 0) > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold ml-0.5">
                            · Reveal: {quiz.settings.answer_reveal_duration}s
                          </span>
                        )}
                      </span>
                      {(quiz.opensAt || quiz.closesAt) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60">
                          <CalendarClock className="size-3 text-muted-foreground" />
                          {quiz.opensAt ? formatDate(quiz.opensAt) : 'Immediate'} → {quiz.closesAt ? formatDate(quiz.closesAt) : 'No Deadline'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Assigned Batches Pills */}
                  <div>
                    <span className="block text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Users className="size-3" /> Assigned Batches ({(quiz.assignedBatches || []).length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(quiz.assignedBatches || []).length > 0 ? (
                        quiz.assignedBatches.map((b: any) => (
                          <Badge
                            key={b.batchId}
                            tone="mustard"
                            className="text-[11px]"
                          >
                            {b.batchName}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-amber-500 italic">No batches assigned yet</span>
                      )}
                    </div>
                  </div>

                  {/* Stats Bar */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 border border-border p-2.5 text-center">
                    <div>
                      <span className="block text-[10px] text-muted-foreground">Total Attempts</span>
                      <span className="text-sm font-bold text-heading font-mono">{quiz.totalAttempts || 0}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted-foreground">Submitted</span>
                      <span className="text-sm font-bold text-emerald-500 font-mono">{quiz.submittedAttempts || 0}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openAssignModal(quiz)}
                        className="text-xs flex items-center gap-1"
                      >
                        <Users className="size-3" /> Assign Batches
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openCsvModal(quiz)}
                        className="text-xs flex items-center gap-1"
                      >
                        <Upload className="size-3" /> Questions CSV
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        asChild
                        variant="primary"
                        size="sm"
                        className="text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Link href={`/trainer/assessments/${quiz.id}/monitor`}>
                          <Eye className="size-3" /> Monitor Live
                        </Link>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openResultsModal(quiz)}
                        className="text-xs flex items-center gap-1"
                      >
                        <BarChart3 className="size-3" /> Results
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEediModal(quiz)}
                        className="text-xs flex items-center gap-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/30"
                      >
                        <Shield className="size-3" /> EEDI Analytics
                      </Button>
                      {quiz.isCreator && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteQuiz(quiz.id)}
                          className="text-destructive hover:bg-destructive/10 p-1.5"
                          title="Delete Assessment"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </AsyncSection>

      {/* -------------------- 1. CREATE ASSESSMENT MODAL (SECTIONS A - E + PREVIEW) -------------------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create &amp; Configure Assessment</DialogTitle>
          </DialogHeader>

          {/* Stepped Section Navigation */}
          <div className="flex border-b border-border overflow-x-auto gap-1 pb-1 scroll-thin">
            {[
              { id: 'details', label: 'A. Basic Details' },
              { id: 'timing', label: 'B. Timing & Mode' },
              { id: 'scheduling', label: 'C. Scheduling' },
              { id: 'classification', label: 'D. Grading Brackets' },
              { id: 'feedback', label: 'E. Motivational Feedback' },
              { id: 'preview', label: 'F. Review & Publish' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCreateTab(t.id as any)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors',
                  createTab === t.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateQuiz}>
            <DialogBody className="space-y-4 pt-2">
              {/* ---------------- SECTION A: BASIC DETAILS ---------------- */}
              {createTab === 'details' && (
                <div className="space-y-4">
                  <Field label="Assessment Title" htmlFor="quiz-title">
                    <Input
                      id="quiz-title"
                      required
                      placeholder="e.g. Business Communication & Ethics Midterm"
                      value={createForm.title}
                      onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-heading">Course Selection</label>
                      <Select
                        value={createForm.courseId}
                        onValueChange={(val) => setCreateForm({ ...createForm, courseId: val === 'none' ? '' : val })}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Course (Optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Specific Course / General Assessment</SelectItem>
                          {courses.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title} ({c.code || 'Course'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Field label="Total Marks" htmlFor="quiz-maxscore">
                      <Input
                        id="quiz-maxscore"
                        type="number"
                        min={1}
                        max={1000}
                        value={createForm.maxScore}
                        onChange={(e) => setCreateForm({ ...createForm, maxScore: Number(e.target.value) })}
                      />
                    </Field>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-heading">Description</label>
                    <textarea
                      rows={2}
                      placeholder="Brief overview of assessment topics and coverage..."
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      className="w-full rounded-xl border border-input bg-card p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-heading">Student Instructions</label>
                    <textarea
                      rows={2}
                      placeholder="Guidelines, allowed materials, and examination rules for candidates..."
                      value={createForm.instructions}
                      onChange={(e) => setCreateForm({ ...createForm, instructions: e.target.value })}
                      className="w-full rounded-xl border border-input bg-card p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                    />
                  </div>

                  {/* Negative Marking Configuration */}
                  <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/20">
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.enableNegativeMarking}
                        onChange={(e) => setCreateForm({ ...createForm, enableNegativeMarking: e.target.checked })}
                        className="rounded border-input text-primary size-4"
                      />
                      <span>Enable Negative Marking for Incorrect Answers</span>
                    </label>
                    {createForm.enableNegativeMarking && (
                      <div className="flex items-center gap-2 pt-1 pl-6">
                        <span className="text-xs text-muted-foreground">Penalty per incorrect response:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="5"
                          value={createForm.negativeMarkValue}
                          onChange={(e) => setCreateForm({ ...createForm, negativeMarkValue: Number(e.target.value) })}
                          className="w-20 h-7 text-xs rounded border border-input px-2 text-center"
                        />
                        <span className="text-xs text-muted-foreground">Marks</span>
                      </div>
                    )}
                  </div>

                  {/* Multi-Batch Selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-heading">
                      Assigned Batches (Candidate Access Scope)
                    </label>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-input p-2 space-y-1.5 bg-muted/20">
                      {batches.map((b: any) => {
                        const checked = createForm.batchIds.includes(b.id);
                        return (
                          <label key={b.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1.5 rounded-lg">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCreateForm({ ...createForm, batchIds: [...createForm.batchIds, b.id] });
                                } else {
                                  setCreateForm({ ...createForm, batchIds: createForm.batchIds.filter((id) => id !== b.id) });
                                }
                              }}
                              className="rounded border-input text-primary focus:ring-primary size-4"
                            />
                            <span className="font-medium">{b.name}</span>
                            <span className="text-muted-foreground text-[10px]">({b.code})</span>
                          </label>
                        );
                      })}
                      {batches.length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">No authorized batches found.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- SECTION B: TIMING & PROCTORING ---------------- */}
              {createTab === 'timing' && (
                <div className="space-y-4">
                  {/* Mode Selector */}
                  <div className="rounded-xl border border-border p-3 space-y-3 bg-muted/20">
                    <span className="text-xs font-bold text-heading block">Independent Timing Mode</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label
                        className={cn(
                          'flex flex-col p-3 rounded-lg border cursor-pointer transition-all',
                          createForm.timingMode === 'FIXED_TOTAL'
                            ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                            : 'border-border/80 bg-card hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="timing_mode"
                            checked={createForm.timingMode === 'FIXED_TOTAL'}
                            onChange={() => setCreateForm({ ...createForm, timingMode: 'FIXED_TOTAL' })}
                            className="accent-primary"
                          />
                          <span>1. Fixed Duration Mode (Total Quiz Timer)</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-normal mt-1 leading-snug">
                          Single continuous countdown timer for the entire assessment. Questions lock upon answer submission.
                        </span>
                      </label>

                      <label
                        className={cn(
                          'flex flex-col p-3 rounded-lg border cursor-pointer transition-all',
                          createForm.timingMode === 'PER_QUESTION'
                            ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                            : 'border-border/80 bg-card hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="timing_mode"
                            checked={createForm.timingMode === 'PER_QUESTION'}
                            onChange={() => setCreateForm({ ...createForm, timingMode: 'PER_QUESTION' })}
                            className="accent-primary"
                          />
                          <span>2. Variable Duration Mode (Per-Question Timer)</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-normal mt-1 leading-snug">
                          Dedicated independent countdown timer per question. Automatically reveals answer and advances when time expires.
                        </span>
                      </label>
                    </div>

                    {createForm.timingMode === 'FIXED_TOTAL' ? (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60">
                        <div>
                          <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            Total Assessment Duration (minutes)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={360}
                            value={createForm.durationMinutes}
                            onChange={(e) => setCreateForm({ ...createForm, durationMinutes: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            Answer Reveal Duration (sec)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={120}
                            value={createForm.answerRevealDuration}
                            onChange={(e) => setCreateForm({ ...createForm, answerRevealDuration: Number(e.target.value) })}
                            className="h-8 text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground block mt-1">
                            Set to 0 to advance directly without reveal
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-2 border-t border-border/60">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                              Question Total Duration (sec)
                            </label>
                            <Input
                              type="number"
                              min={2}
                              max={300}
                              value={createForm.questionDuration}
                              onChange={(e) => setCreateForm({ ...createForm, questionDuration: Number(e.target.value) })}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                              Answer Reveal Duration (sec)
                            </label>
                            <Input
                              type="number"
                              min={0}
                              max={Math.max(0, createForm.questionDuration - 1)}
                              value={createForm.answerRevealDuration}
                              onChange={(e) => setCreateForm({ ...createForm, answerRevealDuration: Number(e.target.value) })}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="rounded-md bg-card p-2.5 text-[11px] text-muted-foreground border border-border">
                          Candidate has{' '}
                          <b className="text-foreground">
                            {Math.max(1, createForm.questionDuration - createForm.answerRevealDuration)} seconds
                          </b>{' '}
                          to answer, followed by{' '}
                          <b className="text-foreground">{createForm.answerRevealDuration} seconds</b> of answer reveal before auto-advancing.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Proctoring & Security */}
                  <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/20">
                    <span className="text-xs font-bold text-heading block">Proctoring &amp; Anti-Cheat Security</span>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.cameraRequired}
                        onChange={(e) => setCreateForm({ ...createForm, cameraRequired: e.target.checked })}
                        className="rounded border-input text-primary size-4"
                      />
                      <span>Require Camera Monitoring (Periodic Proctoring Snapshots)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.fullscreenRequired}
                        onChange={(e) => setCreateForm({ ...createForm, fullscreenRequired: e.target.checked })}
                        className="rounded border-input text-primary size-4"
                      />
                      <span>Enforce Fullscreen Mode</span>
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">Max Warnings before auto-submit:</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={createForm.maxWarnings}
                        onChange={(e) => setCreateForm({ ...createForm, maxWarnings: Number(e.target.value) })}
                        className="w-16 h-7 text-xs rounded border border-input px-2 text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- SECTION C: SCHEDULING ---------------- */}
              {createTab === 'scheduling' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-muted/30 border border-border p-4 text-xs space-y-2">
                    <span className="font-bold text-heading block flex items-center gap-1.5">
                      <Calendar className="size-4 text-primary" />
                      Authoritative Scheduling Window
                    </span>
                    <p className="text-muted-foreground leading-relaxed">
                      Configure when the assessment opens and closes. Before the start date, students see an <b>Upcoming</b> notice. After the end date, the assessment is marked <b>Expired</b> and no new attempts can be started.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-heading mb-1.5">
                        Start Date &amp; Time (Opens At)
                      </label>
                      <input
                        type="datetime-local"
                        value={createForm.opensAt}
                        onChange={(e) => setCreateForm({ ...createForm, opensAt: e.target.value })}
                        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                      />
                      <span className="text-[10px] text-muted-foreground block mt-1">Leave empty to open immediately</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-heading mb-1.5">
                        End Date &amp; Time (Closes At)
                      </label>
                      <input
                        type="datetime-local"
                        value={createForm.closesAt}
                        onChange={(e) => setCreateForm({ ...createForm, closesAt: e.target.value })}
                        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                      />
                      <span className="text-[10px] text-muted-foreground block mt-1">Leave empty for no deadline</span>
                    </div>
                  </div>

                  {(createForm.opensAt || createForm.closesAt) && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCreateForm({ ...createForm, opensAt: '', closesAt: '' })}
                        className="text-xs text-muted-foreground"
                      >
                        Clear Schedule Dates
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- SECTION D: PERFORMANCE CLASSIFICATION ---------------- */}
              {createTab === 'classification' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-muted/30 border border-border p-4 text-xs space-y-1">
                    <span className="font-bold text-heading block">Performance Classification Ranges (0% – 100%)</span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Configure the upper bounds for the 4 performance categories. The system automatically ensures contiguous coverage with zero gaps or overlaps.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-1">
                      <span className="text-xs font-bold text-rose-700 dark:text-rose-400 block uppercase">
                        FAIL (0% to {createForm.failMax}%)
                      </span>
                      <label className="text-[10px] text-muted-foreground block">Max Percentage for FAIL:</label>
                      <input
                        type="number"
                        min={0}
                        max={createForm.needImprovementMax - 1}
                        value={createForm.failMax}
                        onChange={(e) => setCreateForm({ ...createForm, failMax: Number(e.target.value) })}
                        className="w-full h-8 text-xs rounded border border-input px-2 bg-card"
                      />
                    </div>

                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 block uppercase">
                        NEED IMPROVEMENT ({Number(createForm.failMax) + 1}% to {createForm.needImprovementMax}%)
                      </span>
                      <label className="text-[10px] text-muted-foreground block">Max Percentage for NEED IMPROVEMENT:</label>
                      <input
                        type="number"
                        min={Number(createForm.failMax) + 1}
                        max={createForm.goodMax - 1}
                        value={createForm.needImprovementMax}
                        onChange={(e) => setCreateForm({ ...createForm, needImprovementMax: Number(e.target.value) })}
                        className="w-full h-8 text-xs rounded border border-input px-2 bg-card"
                      />
                    </div>

                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-1">
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-400 block uppercase">
                        GOOD ({Number(createForm.needImprovementMax) + 1}% to {createForm.goodMax}%)
                      </span>
                      <label className="text-[10px] text-muted-foreground block">Max Percentage for GOOD:</label>
                      <input
                        type="number"
                        min={Number(createForm.needImprovementMax) + 1}
                        max={99}
                        value={createForm.goodMax}
                        onChange={(e) => setCreateForm({ ...createForm, goodMax: Number(e.target.value) })}
                        className="w-full h-8 text-xs rounded border border-input px-2 bg-card"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                        EXCELLENT Bracket
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        Automatically calculated as the top tier.
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-300">
                      {Number(createForm.goodMax) + 1}% – 100%
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateForm({ ...createForm, failMax: 39, needImprovementMax: 59, goodMax: 79 })}
                      className="text-xs text-muted-foreground"
                    >
                      Reset to Standard Brackets (0-39, 40-59, 60-79, 80-100)
                    </Button>
                  </div>
                </div>
              )}

              {/* ---------------- SECTION E: MOTIVATIONAL FEEDBACK ---------------- */}
              {createTab === 'feedback' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-muted/30 border border-border p-4 text-xs space-y-1">
                    <span className="font-bold text-heading block flex items-center gap-1.5">
                      <Sparkles className="size-4 text-primary" />
                      Trainer-Defined Motivational Messages
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Customize the feedback messages candidates receive upon assessment submission. Line breaks and paragraph formatting are strictly preserved on the student result card.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-rose-600 dark:text-rose-400 mb-1 uppercase tracking-wider">
                        1. FAIL Category Message (0% – {createForm.failMax}%)
                      </label>
                      <textarea
                        rows={2}
                        value={createForm.feedbackFail}
                        onChange={(e) => setCreateForm({ ...createForm, feedbackFail: e.target.value })}
                        className="w-full rounded-xl border border-input bg-card p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 mb-1 uppercase tracking-wider">
                        2. NEED IMPROVEMENT Category Message ({Number(createForm.failMax) + 1}% – {createForm.needImprovementMax}%)
                      </label>
                      <textarea
                        rows={2}
                        value={createForm.feedbackNeedImprovement}
                        onChange={(e) => setCreateForm({ ...createForm, feedbackNeedImprovement: e.target.value })}
                        className="w-full rounded-xl border border-input bg-card p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wider">
                        3. GOOD Category Message ({Number(createForm.needImprovementMax) + 1}% – {createForm.goodMax}%)
                      </label>
                      <textarea
                        rows={2}
                        value={createForm.feedbackGood}
                        onChange={(e) => setCreateForm({ ...createForm, feedbackGood: e.target.value })}
                        className="w-full rounded-xl border border-input bg-card p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1 uppercase tracking-wider">
                        4. EXCELLENT Category Message ({Number(createForm.goodMax) + 1}% – 100%)
                      </label>
                      <textarea
                        rows={2}
                        value={createForm.feedbackExcellent}
                        onChange={(e) => setCreateForm({ ...createForm, feedbackExcellent: e.target.value })}
                        className="w-full rounded-xl border border-input bg-card p-3 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCreateForm({
                          ...createForm,
                          feedbackFail: DEFAULT_FEEDBACK.FAIL,
                          feedbackNeedImprovement: DEFAULT_FEEDBACK.NEED_IMPROVEMENT,
                          feedbackGood: DEFAULT_FEEDBACK.GOOD,
                          feedbackExcellent: DEFAULT_FEEDBACK.EXCELLENT,
                        })
                      }
                      className="text-xs text-muted-foreground"
                    >
                      Reset to Default Feedback Messages
                    </Button>
                  </div>
                </div>
              )}

              {/* ---------------- SECTION F: CONFIGURATION PREVIEW ---------------- */}
              {createTab === 'preview' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-primary tracking-wider block">
                          Configuration Summary
                        </span>
                        <h3 className="text-base font-bold text-foreground">
                          {createForm.title || <span className="text-muted-foreground italic">Untitled Assessment</span>}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Max Score: {createForm.maxScore} Marks · Batches: {createForm.batchIds.length} Selected
                        </p>
                      </div>
                      <Badge tone={createForm.timingMode === 'PER_QUESTION' ? 'mustard' : 'indigo'}>
                        {createForm.timingMode === 'PER_QUESTION' ? 'Per-Question Timer' : 'Fixed Duration'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground block">Duration</span>
                        <span className="font-semibold text-foreground">
                          {createForm.timingMode === 'PER_QUESTION'
                            ? `${createForm.questionDuration}s / question`
                            : `${createForm.durationMinutes} Minutes`}
                        </span>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground block">Answer Reveal</span>
                        <span className="font-semibold text-foreground">
                          {createForm.answerRevealDuration > 0
                            ? `${createForm.answerRevealDuration} seconds`
                            : 'Disabled'}
                        </span>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground block">Negative Marking</span>
                        <span className="font-semibold text-foreground">
                          {createForm.enableNegativeMarking ? `-${createForm.negativeMarkValue}` : 'None'}
                        </span>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground block">Proctoring</span>
                        <span className="font-semibold text-foreground">
                          {createForm.cameraRequired ? 'Camera Snapshots' : 'Standard'}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs space-y-1.5 border-t border-border pt-3">
                      <span className="font-semibold text-foreground block">Schedule:</span>
                      <p className="text-muted-foreground">
                        Opens: {createForm.opensAt ? formatDate(createForm.opensAt) : 'Immediately'}
                        {' · '}
                        Closes: {createForm.closesAt ? formatDate(createForm.closesAt) : 'No Deadline'}
                      </p>
                    </div>

                    <div className="text-xs space-y-1.5 border-t border-border pt-3">
                      <span className="font-semibold text-foreground block">Grading Categories:</span>
                      <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                        <span className="p-1 rounded bg-rose-500/10 text-rose-600">
                          FAIL: 0-{createForm.failMax}%
                        </span>
                        <span className="p-1 rounded bg-amber-500/10 text-amber-600">
                          IMPROVE: {Number(createForm.failMax) + 1}-{createForm.needImprovementMax}%
                        </span>
                        <span className="p-1 rounded bg-blue-500/10 text-blue-600">
                          GOOD: {Number(createForm.needImprovementMax) + 1}-{createForm.goodMax}%
                        </span>
                        <span className="p-1 rounded bg-emerald-500/10 text-emerald-600">
                          EXCELLENT: {Number(createForm.goodMax) + 1}-100%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DialogBody>

            <DialogFooter className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>

              <div className="flex items-center gap-2">
                {createTab !== 'details' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const tabs = ['details', 'timing', 'scheduling', 'classification', 'feedback', 'preview'];
                      const curIdx = tabs.indexOf(createTab);
                      if (curIdx > 0) setCreateTab(tabs[curIdx - 1] as any);
                    }}
                  >
                    Previous Section
                  </Button>
                )}

                {createTab !== 'preview' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const tabs = ['details', 'timing', 'scheduling', 'classification', 'feedback', 'preview'];
                      const curIdx = tabs.indexOf(createTab);
                      if (curIdx < tabs.length - 1) setCreateTab(tabs[curIdx + 1] as any);
                    }}
                  >
                    Next Section
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" loading={creating}>
                    Publish Assessment
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -------------------- 2. ASSIGN BATCHES MODAL -------------------- */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Batches: {activeQuiz?.title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Select one or multiple batches you are authorized to manage. Only students belonging to selected batches will have access to this assessment.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-input p-3 space-y-2 bg-muted/20">
              {batches.map((b: any) => {
                const checked = selectedAssignBatches.includes(b.id);
                return (
                  <label key={b.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-2 rounded-lg">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAssignBatches([...selectedAssignBatches, b.id]);
                        } else {
                          setSelectedAssignBatches(selectedAssignBatches.filter((id) => id !== b.id));
                        }
                      }}
                      className="rounded border-input text-primary size-4"
                    />
                    <div>
                      <span className="font-semibold text-heading block">{b.name}</span>
                      <span className="text-muted-foreground text-[10px]">Code: {b.code}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={assigning} onClick={handleSaveBatches}>
              Save Batch Assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------- 3. CSV UPLOAD MODAL -------------------- */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Questions CSV: {activeQuiz?.title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-xl bg-muted/40 border border-border p-3 text-xs space-y-1">
              <span className="font-bold text-heading block">Supported CSV Columns:</span>
              <p className="text-muted-foreground font-mono text-[11px]">
                question, option_a, option_b, option_c, option_d, correct, marks, negative, <b>eedi_index</b>, <b>eedi_term</b>
              </p>
              <p className="text-muted-foreground text-[11px] pt-1">
                Both legacy CSVs and extended CSVs with <b>eedi_index</b> &amp; <b>eedi_term</b> are automatically recognized.
              </p>
            </div>

            <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center hover:bg-muted/10 transition-colors">
              <Upload className="size-8 mx-auto text-primary mb-2" />
              <p className="text-xs font-semibold text-heading mb-1">
                {csvFile ? csvFile.name : 'Choose a CSV file from your computer'}
              </p>
              <p className="text-[11px] text-muted-foreground mb-4">UTF-8 encoded comma-separated file</p>
              <input
                type="file"
                accept=".csv"
                id="csv-file-input"
                className="hidden"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
              <Button asChild variant="secondary" size="sm">
                <label htmlFor="csv-file-input" className="cursor-pointer">
                  Browse Files
                </label>
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCsvOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={uploadingCsv} onClick={handleUploadCsv} disabled={!csvFile}>
              Upload &amp; Replace Questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------- 4. RESULTS MODAL -------------------- */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assessment Submissions: {activeQuiz?.title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {loadingResults ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Loading submission records...</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Total Submissions: {resultsData?.totalSubmissions || 0}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted text-heading font-semibold text-left border-b border-border">
                      <tr>
                        <th className="p-2.5">Rank</th>
                        <th className="p-2.5">Student Name</th>
                        <th className="p-2.5">Roll Number</th>
                        <th className="p-2.5">Batch</th>
                        <th className="p-2.5">Score</th>
                        <th className="p-2.5">Result</th>
                        <th className="p-2.5">Warnings</th>
                        <th className="p-2.5">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(resultsData?.results || []).map((r: any) => (
                        <tr key={r.attemptId} className="hover:bg-muted/30">
                          <td className="p-2.5 font-bold font-mono">#{r.rank}</td>
                          <td className="p-2.5 font-medium text-heading">{r.name}</td>
                          <td className="p-2.5 font-mono">{r.rollNumber}</td>
                          <td className="p-2.5">{r.batchName}</td>
                          <td className="p-2.5 font-mono font-bold">
                            {r.score} / {r.maxScore} ({r.percentage}%)
                          </td>
                          <td className="p-2.5">
                            <Badge tone={r.passed ? 'success' : 'danger'} className="text-[10px]">
                              {r.passed ? 'Pass' : 'Fail'}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-center">{r.warnings}</td>
                          <td className="p-2.5 text-muted-foreground">{formatDate(r.completedAt, true)}</td>
                        </tr>
                      ))}
                      {(resultsData?.results || []).length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-muted-foreground">
                            No student submissions recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                if (!resultsData?.results?.length) return;
                try {
                  const { exportAssessmentResultsToExcel } = await import('@/lib/quiz/excelExport');
                  await exportAssessmentResultsToExcel(
                    activeQuiz?.title || 'Assessment',
                    resultsData.results.map((r: any) => ({
                      rank: r.rank,
                      rollNumber: r.rollNumber || '—',
                      name: r.name,
                      batchName: r.batchName,
                      marks: r.score,
                      maxMarks: r.maxScore || 100,
                      percentage: r.percentage || 0,
                      passed: Boolean(r.passed),
                      warnings: r.warnings || 0,
                      sessionId: r.studentId || r.attemptId,
                    }))
                  );
                  toast.success('Excel workbook exported successfully');
                } catch (err) {
                  toast.error('Failed to export Excel workbook');
                }
              }}
              disabled={!resultsData?.results?.length}
            >
              <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600" />
              Export Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setResultsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------- 5. TRAINER-ONLY EEDI ANALYTICS MODAL -------------------- */}
      <Dialog open={eediOpen} onOpenChange={setEediOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-amber-500" />
              <DialogTitle>EEDI Competency Analytics: {activeQuiz?.title}</DialogTitle>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-500 flex items-center gap-2">
              <Lock className="size-4 shrink-0" />
              <span>
                <b>Trainer-Only View:</b> These EEDI index and term-based scores are calculated from question-level tags and are strictly confidential to authorized trainers. They are not displayed to students.
              </span>
            </div>

            {loadingEedi ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Computing EEDI analytics...</p>
            ) : (
              <div className="space-y-6">
                {/* Pillar / Term Summary Table */}
                <div>
                  <h3 className="text-xs font-bold text-heading uppercase tracking-wider mb-2">
                    Competency Breakdown Across Managed Batches
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-heading font-semibold text-left border-b border-border">
                        <tr>
                          <th className="p-2.5">EEDI Term / Pillar</th>
                          <th className="p-2.5">Index</th>
                          <th className="p-2.5">Participants</th>
                          <th className="p-2.5">Average Score</th>
                          <th className="p-2.5">Highest</th>
                          <th className="p-2.5">Lowest</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(eediData?.eediSummary || []).map((s: any, idx: number) => (
                          <tr key={idx} className="hover:bg-muted/30">
                            <td className="p-2.5 font-bold text-heading">{s.eediTerm}</td>
                            <td className="p-2.5 font-mono">{s.eediIndex != null ? s.eediIndex : '—'}</td>
                            <td className="p-2.5">{s.participants}</td>
                            <td className="p-2.5 font-mono font-bold text-primary">{s.avgScore}%</td>
                            <td className="p-2.5 font-mono text-emerald-500">{s.maxScore}%</td>
                            <td className="p-2.5 font-mono text-rose-500">{s.minScore}%</td>
                          </tr>
                        ))}
                        {(eediData?.eediSummary || []).length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-muted-foreground">
                              No EEDI-tagged questions or submissions found for this assessment.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Student-wise Breakdown */}
                <div>
                  <h3 className="text-xs font-bold text-heading uppercase tracking-wider mb-2">
                    Student-by-Student EEDI Performance
                  </h3>
                  <div className="space-y-2">
                    {(eediData?.studentBreakdown || []).map((student: any) => (
                      <div key={student.studentId} className="rounded-xl border border-border p-3 bg-card space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-xs text-heading">{student.studentName}</span>
                            <span className="text-[11px] text-muted-foreground ml-2">
                              Roll: {student.rollNumber} · Batch: {student.batchName}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {student.pillars.map((p: any, pIdx: number) => (
                            <div
                              key={pIdx}
                              className="rounded-lg bg-muted/50 border border-border px-2.5 py-1 text-[11px] flex items-center gap-1.5"
                            >
                              <span className="font-medium">{p.eediTerm}:</span>
                              <span className="font-mono font-bold text-primary">{p.scorePercentage}%</span>
                              <span className="text-[10px] text-muted-foreground">
                                ({p.earnedMarks}/{p.possibleMarks})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(eediData?.studentBreakdown || []).length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No student scores recorded yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEediOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

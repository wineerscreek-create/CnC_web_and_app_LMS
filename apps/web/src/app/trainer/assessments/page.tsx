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
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Lock,
  MessageSquare,
  Plus,
  RotateCcw,
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ExportAssessmentModal } from '@/components/quiz/ExportAssessmentModal';
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

  // Edit, Delete, Export & Mobile Action Hint states
  const [editOpen, setEditOpen] = React.useState(false);
  const [loadingEdit, setLoadingEdit] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [editForm, setEditForm] = React.useState<any>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<any>(null);
  const [deletingQuiz, setDeletingQuiz] = React.useState(false);
  const [exportQuiz, setExportQuiz] = React.useState<any>(null);
  const [mobileHint, setMobileHint] = React.useState<{ quizId: string; label: string } | null>(null);

  // Reassignment & Recovery state
  const [recoveryOpen, setRecoveryOpen] = React.useState(false);
  const [selectedAttempt, setSelectedAttempt] = React.useState<any>(null);
  const [recoveryAction, setRecoveryAction] = React.useState<'RESTART' | 'RESUME'>('RESUME');
  const [recoveryReason, setRecoveryReason] = React.useState('');
  const [recovering, setRecovering] = React.useState(false);

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

  function openRecoveryModal(attempt: any) {
    setSelectedAttempt(attempt);
    setRecoveryAction('RESUME');
    setRecoveryReason('');
    setRecoveryOpen(true);
  }

  async function handleConfirmRecovery() {
    if (!activeQuiz?.id || !selectedAttempt?.attemptId) return;
    if (!recoveryReason.trim() || recoveryReason.trim().length < 5) {
      toast.error('Please enter a recovery reason of at least 5 characters');
      return;
    }

    setRecovering(true);
    try {
      await api.post(`/trainer/assessments/${activeQuiz.id}/attempts/${selectedAttempt.attemptId}/recover`, {
        action: recoveryAction,
        reason: recoveryReason.trim(),
      });
      toast.success(`Assessment successfully ${recoveryAction === 'RESUME' ? 'resumed' : 'restarted'} for candidate!`);
      setRecoveryOpen(false);
      if (activeQuiz) {
        await openResultsModal(activeQuiz);
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to recover assessment attempt');
    } finally {
      setRecovering(false);
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

  // Open Edit Modal (loads canonical quiz record from backend)
  async function openEditModal(quiz: any) {
    if (quiz.canEdit === false) {
      toast.info(quiz.editRestrictionReason || 'Editing is not permitted for this assessment');
      return;
    }
    setActiveQuiz(quiz);
    setEditOpen(true);
    setLoadingEdit(true);
    try {
      const res = await api.get<any>(`/trainer/assessments/${quiz.id}`);
      const q = res.data;
      const toLocalInput = (iso?: string | null) => {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setEditForm({
        id: q.id,
        title: q.title || '',
        description: q.description || '',
        instructions: q.instructions || '',
        durationMinutes: q.durationMinutes || 30,
        maxScore: q.maxScore || 100,
        opensAt: toLocalInput(q.opensAt),
        closesAt: toLocalInput(q.closesAt),
        status: q.status || 'active',
        timingMode: q.timingMode || q.settings?.timing_mode || 'FIXED_TOTAL',
        negativeMarking: Number(q.settings?.negative_marking || 0),
        batchIds: (q.assignedBatches || []).map((b: any) => b.batchId),
        totalAttempts: q.totalAttempts || 0,
      });
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to load assessment details');
      setEditOpen(false);
    } finally {
      setLoadingEdit(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    if (!editForm.title.trim()) {
      toast.error('Assessment title is required');
      return;
    }
    if (editForm.opensAt && editForm.closesAt && new Date(editForm.closesAt) <= new Date(editForm.opensAt)) {
      toast.error('End Date & Time must be strictly after Start Date & Time');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await api.put<any>(`/trainer/assessments/${editForm.id}`, {
        title: editForm.title.trim(),
        description: editForm.description,
        instructions: editForm.instructions,
        durationMinutes: Number(editForm.durationMinutes),
        maxScore: Number(editForm.maxScore),
        opensAt: editForm.opensAt ? new Date(editForm.opensAt).toISOString() : undefined,
        closesAt: editForm.closesAt ? new Date(editForm.closesAt).toISOString() : undefined,
        status: editForm.status,
        batchIds: editForm.batchIds,
        settings: {
          timing_mode: editForm.timingMode,
          negative_marking: Number(editForm.negativeMarking || 0),
        },
      });
      if (res.data?.restrictionMessage) {
        toast.warning(res.data.restrictionMessage);
      } else {
        toast.success('Assessment updated and synchronized across all views');
      }
      setEditOpen(false);
      quizzesQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to update assessment');
    } finally {
      setSavingEdit(false);
    }
  }

  // Delete Quiz (with confirmation dialog)
  async function confirmDeleteQuiz() {
    if (!deleteTarget) return;
    setDeletingQuiz(true);
    try {
      const res = await api.delete<any>(`/trainer/assessments/${deleteTarget.id}`);
      toast.success(
        res.data?.archived
          ? 'Assessment archived safely (historical results & reports preserved)'
          : 'Assessment deleted'
      );
      setDeleteTarget(null);
      quizzesQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to delete assessment');
    } finally {
      setDeletingQuiz(false);
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
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                      <ClipboardList className="size-5" aria-hidden />
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {(() => {
                        const lc = (quiz.lifecycleStatus || 'LIVE').toUpperCase();
                        const pub = (quiz.publicationStatus || 'ACTIVE').toUpperCase();
                        const tone =
                          lc === 'LIVE'
                            ? 'success'
                            : lc === 'SCHEDULED'
                            ? 'info'
                            : lc === 'COMPLETED'
                            ? 'purple'
                            : lc === 'EXPIRED' || lc === 'CANCELLED'
                            ? 'danger'
                            : 'neutral';
                        return (
                          <>
                            <Badge tone={tone} className="text-[10px] font-bold">
                              {lc}
                            </Badge>
                            {pub === 'INACTIVE' && (
                              <Badge tone="neutral" className="text-[10px] font-semibold">
                                INACTIVE
                              </Badge>
                            )}
                            {quiz.manuallyEnded && lc === 'COMPLETED' && (
                              <Badge tone="amber" className="text-[10px]">
                                Ended
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                      {quiz.quizCode && (
                        <Badge tone="neutral" className="font-mono text-[10px]">
                          {quiz.quizCode}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => void openEditModal(quiz)}
                        disabled={quiz.canEdit === false}
                        aria-label={quiz.canEdit === false ? (quiz.editRestrictionReason || 'Edit disabled') : 'Edit Assessment'}
                        title={quiz.canEdit === false ? (quiz.editRestrictionReason || 'Editing disabled') : 'Edit Assessment'}
                        className={cn(
                          'size-7 rounded-lg border flex items-center justify-center transition-all ml-0.5',
                          quiz.canEdit === false
                            ? 'border-border/60 text-muted-foreground/40 cursor-not-allowed'
                            : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shadow-[0_0_8px_rgba(20,184,166,0.28)] animate-pulse'
                        )}
                      >
                        <Edit className="size-3.5" />
                      </button>
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

                  {/* Compact Action Buttons */}
                  <div className="pt-2 border-t border-border space-y-1.5 mt-auto">
                    {mobileHint && mobileHint.quizId === quiz.id && (
                      <div className="sm:hidden text-[11px] font-medium text-primary bg-primary/10 rounded-md px-2 py-1 flex items-center justify-between">
                        <span>{mobileHint.label}</span>
                        <button type="button" onClick={() => setMobileHint(null)} className="text-xs px-1">×</button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        asChild
                        variant="primary"
                        size="sm"
                        className="h-8 text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Link href={`/trainer/assessments/${quiz.id}/monitor`}>
                          <Eye className="size-3.5" /> Monitor Live
                        </Link>
                      </Button>

                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMobileHint({ quizId: quiz.id, label: 'Assign Batches' });
                            openAssignModal(quiz);
                          }}
                          className="size-8 p-0"
                          title="Assign Batches"
                          aria-label="Assign Batches"
                        >
                          <Users className="size-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMobileHint({ quizId: quiz.id, label: 'Upload Questions CSV' });
                            openCsvModal(quiz);
                          }}
                          className="size-8 p-0"
                          title="Questions CSV"
                          aria-label="Questions CSV"
                        >
                          <Upload className="size-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMobileHint({ quizId: quiz.id, label: 'View Results' });
                            void openResultsModal(quiz);
                          }}
                          className="size-8 p-0"
                          title="Results"
                          aria-label="Results"
                        >
                          <BarChart3 className="size-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMobileHint({ quizId: quiz.id, label: 'Export Excel' });
                            setExportQuiz(quiz);
                          }}
                          className="size-8 p-0 text-emerald-600 hover:bg-emerald-500/10"
                          title="Export Excel"
                          aria-label="Export Excel"
                        >
                          <FileSpreadsheet className="size-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMobileHint({ quizId: quiz.id, label: 'EEDI Analytics' });
                            void openEediModal(quiz);
                          }}
                          className="size-8 p-0 text-amber-500 hover:bg-amber-500/15"
                          title="EEDI Analytics"
                          aria-label="EEDI Analytics"
                        >
                          <Shield className="size-3.5" />
                        </Button>
                        <Button
                          asChild
                          variant="secondary"
                          size="sm"
                          className="relative size-8 p-0 text-primary hover:bg-primary/15"
                          title={`View Feedback (${quiz.feedbackCount || 0})`}
                          aria-label="View Feedback"
                        >
                          <Link href={`/trainer/assessments/${quiz.id}/feedback`}>
                            <MessageSquare className="size-3.5" />
                            {(quiz.feedbackCount || 0) > 0 && (
                              <span className="absolute -top-1 -right-1 rounded-full bg-primary text-white text-[9px] font-bold px-1 leading-tight">
                                {quiz.feedbackCount}
                              </span>
                            )}
                          </Link>
                        </Button>
                        {(quiz.canDelete ?? quiz.isCreator) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMobileHint({ quizId: quiz.id, label: 'Delete Assessment' });
                              setDeleteTarget(quiz);
                            }}
                            className="size-8 p-0 text-destructive hover:bg-destructive/10"
                            title="Delete Assessment"
                            aria-label="Delete Assessment"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
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
                  {activeQuiz && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setExportQuiz(activeQuiz)}
                      className="h-7 text-xs gap-1.5 text-emerald-600"
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Export Excel
                    </Button>
                  )}
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
                        <th className="p-2.5">Status / Reason</th>
                        <th className="p-2.5">Submitted At</th>
                        <th className="p-2.5 text-right">Action</th>
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
                          <td className="p-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider inline-block w-fit',
                                  r.candidateStatus === 'ABANDONED' || r.submissionReason === 'ABANDONMENT_TIMEOUT'
                                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                                    : r.submissionReason === 'TIMER_EXPIRED'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                )}
                              >
                                {r.candidateStatus || (r.passed ? 'Completed' : 'Submitted')}
                              </span>
                              {r.submissionReason && (
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  {r.submissionReason.replace(/_/g, ' ')}
                                </span>
                              )}
                              {r.isRecovered && (
                                <span className="text-[9px] text-purple-600 dark:text-purple-400 font-medium">
                                  Recovered
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 text-muted-foreground">{formatDate(r.completedAt, true)}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    toast.loading('Generating 4-sheet report...', { id: `indiv-${r.attemptId}` });
                                    await api.download(
                                      `/trainer/assessments/${activeQuiz?.id}/attempts/${r.attemptId}/export-excel`,
                                      `${r.rollNumber || r.name}_${activeQuiz?.title || 'Assessment'}_Report.xlsx`
                                    );
                                    toast.success('Downloaded 4-sheet report successfully!', { id: `indiv-${r.attemptId}` });
                                  } catch (err: any) {
                                    toast.error(err?.message || 'Failed to download report', { id: `indiv-${r.attemptId}` });
                                  }
                                }}
                                className="h-7 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                title="Download individual 4-sheet assessment report (Excel)"
                              >
                                <FileSpreadsheet className="size-3" />
                                Report (.xlsx)
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openRecoveryModal(r)}
                                className="h-7 text-[11px] gap-1"
                                title="Reassign or recover this student assessment"
                              >
                                <RotateCcw className="size-3" />
                                Recover
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(resultsData?.results || []).length === 0 && (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-muted-foreground">
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
            <div className="flex items-center gap-2">
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
                        warnings: r.warnings ?? r.warningCount ?? 0,
                        sessionId: r.studentId || r.attemptId,
                        attemptId: r.attemptId,
                        assessmentId: activeQuiz?.id,
                        submissionTimestamp: r.submittedAt || r.completedAt,
                        status: r.status,
                        submissionReason: r.submissionReason,
                        snapshots: r.snapshots || [],
                      })),
                      undefined,
                      { assessmentId: activeQuiz?.id }
                    );
                    toast.success('Excel workbook exported successfully');
                  } catch (err) {
                    toast.error('Failed to export Excel workbook');
                  }
                }}
                disabled={!resultsData?.results?.length}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600" />
                Export Results Excel
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (!resultsData?.results?.length) return;
                  try {
                    toast.loading('Packaging bulk individual reports into ZIP archive...', { id: 'bulk-zip' });
                    await api.download(
                      `/trainer/assessments/${activeQuiz?.id}/export-bulk-reports`,
                      `${activeQuiz?.title || 'Assessment'}_Bulk_Reports.zip`
                    );
                    toast.success('Downloaded bulk reports ZIP archive successfully!', { id: 'bulk-zip' });
                  } catch (err: any) {
                    toast.error(err?.message || 'Failed to download bulk ZIP archive', { id: 'bulk-zip' });
                  }
                }}
                disabled={!resultsData?.results?.length}
                className="gap-1.5"
                title="Download all student individual reports in a ZIP archive"
              >
                <Download className="size-3.5 text-accent" />
                Bulk Reports (.zip)
              </Button>
            </div>

            <Button variant="secondary" size="sm" onClick={() => setResultsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------- 4.5 RECOVERY MODAL -------------------- */}
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-primary" />
              Recover Assessment Attempt
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 text-xs">
            {selectedAttempt && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student:</span>
                  <span className="font-semibold text-foreground">{selectedAttempt.name} ({selectedAttempt.rollNumber})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Score:</span>
                  <span className="font-mono font-semibold text-foreground">{selectedAttempt.score} / {selectedAttempt.maxScore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submission Reason:</span>
                  <span className="font-mono text-foreground">{selectedAttempt.submissionReason || 'MANUAL'}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="font-semibold text-foreground block">Select Recovery Action:</label>

              <div
                onClick={() => setRecoveryAction('RESUME')}
                className={cn(
                  'rounded-xl border p-3 cursor-pointer transition-all space-y-1',
                  recoveryAction === 'RESUME'
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-border bg-card hover:bg-muted/30'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Option B: Resume Assessment (Recommended)</span>
                  <Badge tone={recoveryAction === 'RESUME' ? 'teal' : 'neutral'} className="text-[10px]">
                    Preserve Progress
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Restores previously saved answers, question navigation position, and remaining time. The candidate continues from the point of interruption without losing work.
                </p>
              </div>

              <div
                onClick={() => setRecoveryAction('RESTART')}
                className={cn(
                  'rounded-xl border p-3 cursor-pointer transition-all space-y-1',
                  recoveryAction === 'RESTART'
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-border bg-card hover:bg-muted/30'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Option A: Restart Assessment</span>
                  <Badge tone={recoveryAction === 'RESTART' ? 'amber' : 'neutral'} className="text-[10px]">
                    Fresh Attempt
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Creates a fresh assessment attempt from Question 1 and resets the exam timer to the full allotted duration. Preserves previous attempt in audit history.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="font-semibold text-foreground block">
                Recovery Reason <span className="text-rose-500">*</span>:
              </label>
              <textarea
                value={recoveryReason}
                onChange={(e) => setRecoveryReason(e.target.value)}
                placeholder="e.g. Student encountered power failure / accidental browser tab closure. Trainer authorized recovery."
                className="w-full h-20 rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground">
                This action and reason will be immutably recorded in the LMS audit log.
              </span>
            </div>
          </DialogBody>
          <DialogFooter className="flex items-center justify-end gap-2 w-full">
            <Button variant="secondary" size="sm" onClick={() => setRecoveryOpen(false)} disabled={recovering}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmRecovery}
              loading={recovering}
              disabled={!recoveryReason.trim() || recoveryReason.trim().length < 5}
            >
              Confirm Recovery
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

      {/* -------------------- 6. EDIT ASSESSMENT MODAL -------------------- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="size-4 text-primary" />
              Edit Assessment: {activeQuiz?.title}
            </DialogTitle>
          </DialogHeader>
          {loadingEdit || !editForm ? (
            <DialogBody>
              <p className="py-6 text-center text-xs text-muted-foreground">Loading assessment configuration...</p>
            </DialogBody>
          ) : (
            <form onSubmit={handleSaveEdit}>
              <DialogBody className="space-y-4 text-xs">
                {editForm.totalAttempts > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>
                      <b>Attempt-Safety Active:</b> {editForm.totalAttempts} candidate attempt(s) already exist. Max Score, Negative Marking, and Question keys are locked to preserve grading integrity. You may safely update title, instructions, schedule, duration, and batch assignments.
                    </span>
                  </div>
                )}

                <Field label="Title" htmlFor="edit-quiz-title">
                  <Input
                    id="edit-quiz-title"
                    required
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Duration (mins)" htmlFor="edit-quiz-dur">
                    <Input
                      id="edit-quiz-dur"
                      type="number"
                      min={1}
                      max={300}
                      value={editForm.durationMinutes}
                      onChange={(e) => setEditForm({ ...editForm, durationMinutes: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Max Score" htmlFor="edit-quiz-max">
                    <Input
                      id="edit-quiz-max"
                      type="number"
                      min={1}
                      disabled={editForm.totalAttempts > 0}
                      value={editForm.maxScore}
                      onChange={(e) => setEditForm({ ...editForm, maxScore: Number(e.target.value) })}
                    />
                  </Field>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-heading">Publication Status</label>
                    <Select
                      value={editForm.status}
                      onValueChange={(val) => setEditForm({ ...editForm, status: val })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active (Published)</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="completed">Completed (Closed)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-heading">Start Date &amp; Time</label>
                    <input
                      type="datetime-local"
                      value={editForm.opensAt}
                      onChange={(e) => setEditForm({ ...editForm, opensAt: e.target.value })}
                      className="w-full h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-heading">End Date &amp; Time</label>
                    <input
                      type="datetime-local"
                      value={editForm.closesAt}
                      onChange={(e) => setEditForm({ ...editForm, closesAt: e.target.value })}
                      className="w-full h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-heading">Description</label>
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full rounded-xl border border-input bg-card p-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-heading">Instructions</label>
                  <textarea
                    rows={2}
                    value={editForm.instructions}
                    onChange={(e) => setEditForm({ ...editForm, instructions: e.target.value })}
                    className="w-full rounded-xl border border-input bg-card p-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block font-semibold text-heading">Assigned Batches</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                    {batches.map((b: any) => {
                      const checked = (editForm.batchIds || []).includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={cn(
                            'flex items-center justify-between rounded-lg border p-2 cursor-pointer text-xs',
                            checked ? 'border-primary bg-primary/10' : 'border-border'
                          )}
                        >
                          <span className="truncate font-medium">
                            {b.name} ({b.code})
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editForm.batchIds, b.id]
                                : editForm.batchIds.filter((id: string) => id !== b.id);
                              setEditForm({ ...editForm, batchIds: next });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={savingEdit}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* -------------------- 7. DELETE CONFIRMATION DIALOG -------------------- */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title || 'Assessment'}"?`}
        description={
          (deleteTarget?.totalAttempts || 0) > 0
            ? 'This assessment has existing student attempts. It will be safely archived so all historical results, reports, and feedback remain preserved.'
            : 'Are you sure you want to remove this assessment?'
        }
        confirmLabel="Confirm Delete"
        onConfirm={confirmDeleteQuiz}
        pending={deletingQuiz}
      />

      {/* -------------------- 8. BATCH-SCOPED EXCEL EXPORT MODAL -------------------- */}
      {exportQuiz && (
        <ExportAssessmentModal
          open={Boolean(exportQuiz)}
          onOpenChange={(o) => !o && setExportQuiz(null)}
          quizId={exportQuiz.id}
          quizTitle={exportQuiz.title}
          batches={batches}
        />
      )}
    </div>
  );
}

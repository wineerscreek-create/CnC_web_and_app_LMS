'use client';

import {
  Award,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Edit,
  Eye,
  FileSpreadsheet,
  Lock,
  Plus,
  Shield,
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

export default function TrainerAssessmentsPage() {
  const [selectedBatch, setSelectedBatch] = React.useState<string>('all');
  const batchesQuery = useApi<any[]>('/trainer/batches');
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

  // Create form state
  const [createForm, setCreateForm] = React.useState({
    title: '',
    durationMinutes: 30,
    maxScore: 100,
    cameraRequired: true,
    fullscreenRequired: true,
    maxWarnings: 3,
    batchIds: [] as string[],
    timingMode: 'FIXED_TOTAL' as 'FIXED_TOTAL' | 'PER_QUESTION',
    enableTimedQuestions: false,
    questionDuration: 10,
    answerRevealDuration: 2,
    autoAdvance: true,
    allowPrevious: false,
    allowModification: false,
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
  const quizzes = quizzesQuery.data ?? [];

  // Handle Create Quiz
  async function handleCreateQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error('Assessment title is required');
      return;
    }

    if (createForm.timingMode === 'PER_QUESTION') {
      const qDur = Number(createForm.questionDuration);
      const revDur = Number(createForm.answerRevealDuration);
      if (qDur <= revDur) {
        toast.error('Question Duration must be strictly greater than Answer Reveal Duration');
        return;
      }
    }

    setCreating(true);
    try {
      await api.post('/trainer/assessments', {
        title: createForm.title.trim(),
        durationMinutes: Number(createForm.durationMinutes),
        maxScore: Number(createForm.maxScore),
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
        },
        batchIds: createForm.batchIds,
      });
      toast.success('Assessment created successfully');
      setCreateOpen(false);
      setCreateForm({
        title: '',
        durationMinutes: 30,
        maxScore: 100,
        cameraRequired: true,
        fullscreenRequired: true,
        maxWarnings: 3,
        batchIds: [],
        timingMode: 'FIXED_TOTAL',
        enableTimedQuestions: false,
        questionDuration: 10,
        answerRevealDuration: 2,
        autoAdvance: true,
        allowPrevious: false,
        allowModification: false,
      });
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

      {/* -------------------- 1. CREATE ASSESSMENT MODAL -------------------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Assessment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateQuiz}>
            <DialogBody className="space-y-4">
              <Field label="Assessment Title" htmlFor="quiz-title">
                <Input
                  id="quiz-title"
                  required
                  placeholder="e.g. Business Communication &amp; Ethics Midterm"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Duration (minutes)" htmlFor="quiz-duration">
                  <Input
                    id="quiz-duration"
                    type="number"
                    min={1}
                    max={360}
                    value={createForm.durationMinutes}
                    onChange={(e) => setCreateForm({ ...createForm, durationMinutes: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Max Score" htmlFor="quiz-maxscore">
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

              {/* Multi-Batch Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-heading">
                  Assign to Batches (You can select multiple)
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

              {/* Anti-cheat Proctoring Toggles */}
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

              {/* Timing Architecture: Two Mutually Exclusive Independent Modes */}
              <div className="rounded-xl border border-border p-3 space-y-3 bg-muted/20">
                <span className="text-xs font-bold text-heading block">Assessment Timing Mode</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label
                    className={cn(
                      'flex flex-col p-2.5 rounded-lg border cursor-pointer transition-all',
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
                        onChange={() =>
                          setCreateForm({
                            ...createForm,
                            timingMode: 'FIXED_TOTAL',
                            enableTimedQuestions: false,
                          })
                        }
                        className="accent-primary"
                      />
                      <span>Fixed Duration Mode</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-normal mt-1 leading-snug">
                      Single continuous countdown timer for the entire assessment. Questions lock upon answer submission.
                    </span>
                  </label>

                  <label
                    className={cn(
                      'flex flex-col p-2.5 rounded-lg border cursor-pointer transition-all',
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
                        onChange={() =>
                          setCreateForm({
                            ...createForm,
                            timingMode: 'PER_QUESTION',
                            enableTimedQuestions: true,
                          })
                        }
                        className="accent-primary"
                      />
                      <span>Variable Duration Mode</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-normal mt-1 leading-snug">
                      Dedicated countdown timer per question. Automatically advances or submits when time runs out.
                    </span>
                  </label>
                </div>

                {createForm.timingMode === 'PER_QUESTION' && (
                  <div className="space-y-3 border-t border-border/60 pt-2 text-xs">
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

                    <div className="rounded-md bg-card p-2 text-[11px] text-muted-foreground border border-border">
                      Candidate has{' '}
                      <b className="text-foreground">
                        {Math.max(1, createForm.questionDuration - createForm.answerRevealDuration)} seconds
                      </b>{' '}
                      to submit an answer, followed by{' '}
                      <b className="text-foreground">{createForm.answerRevealDuration} seconds</b> of answer reveal before auto-advancing.
                    </div>
                  </div>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={creating}>
                Create Assessment
              </Button>
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

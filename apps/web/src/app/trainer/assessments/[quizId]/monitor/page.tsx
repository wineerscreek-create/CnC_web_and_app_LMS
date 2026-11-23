'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  Download,
  FileSpreadsheet,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  StopCircle,
  Users,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Check,
  HardDrive,
  WifiOff,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { duration } from '@/lib/format';
import {
  recordCameraSnapshot,
  startCameraSnapshotSession,
  clearCameraSnapshotSamples,
} from '@/lib/quiz/cameraSnapshots';
import { exportAssessmentResultsToExcel, StudentResultRow } from '@/lib/quiz/excelExport';
import { getAssessmentWsUrl } from '@/lib/quiz/ws';

interface MonitoredStudent {
  session_id: string;
  name: string;
  roll_number: string;
  current_question: number;
  total_questions: number;
  remaining_seconds: number;
  warnings: number;
  camera_on: boolean;
  camera_status?: string;
  fullscreen: boolean;
  online: boolean;
  status: string;
  candidate_status?: string;
  submission_reason?: string;
  is_recovered?: boolean;
  attempt_id?: string;
  last_seen_seconds_ago: number;
  stale: boolean;
}

interface SnapshotState {
  url: string;
  name: string;
  rollNumber: string;
  updatedAt: number;
}

export default function TrainerAssessmentMonitorPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();

  const [quizInfo, setQuizInfo] = useState<any>(null);
  const [students, setStudents] = useState<MonitoredStudent[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotState>>({});
  const [events, setEvents] = useState<Array<{ text: string; at: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endingQuiz, setEndingQuiz] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  // Assessment Reassignment & Recovery state
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<MonitoredStudent | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<'RESTART' | 'RESUME'>('RESUME');
  const [recoveryReason, setRecoveryReason] = useState('');
  const [recovering, setRecovering] = useState(false);

  // Decentralized Offline Examination Cohort state
  const [activeTab, setActiveTab] = useState<'ONLINE_MONITOR' | 'OFFLINE_COHORT'>('ONLINE_MONITOR');
  const [offlineReadiness, setOfflineReadiness] = useState<any>(null);
  const [loadingOffline, setLoadingOffline] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;

  // Initialize snapshot reservoir session
  useEffect(() => {
    if (params.quizId) {
      startCameraSnapshotSession(params.quizId);
    }
    return () => {
      clearCameraSnapshotSamples();
    };
  }, [params.quizId]);

  // Wall-clock tick for snapshot age calculations
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial monitor data
  const fetchMonitorData = useCallback(async () => {
    try {
      const res = await api.get(`/assessments/${params.quizId}/monitor`);
      if (res.data) {
        setQuizInfo(res.data.quiz);
        setStudents(res.data.students || []);
      }
    } catch (err) {
      toast.error('Failed to load assessment monitor data');
    } finally {
      setLoading(false);
    }
  }, [params.quizId]);

  const fetchOfflineReadiness = useCallback(async () => {
    if (!params.quizId) return;
    setLoadingOffline(true);
    try {
      const res = await api.get(`/trainer/assessments/${params.quizId}/offline-readiness`);
      if (res.data) {
        setOfflineReadiness(res.data?.data || res.data);
      }
    } catch (err) {
      console.warn('Failed to load offline readiness:', err);
    } finally {
      setLoadingOffline(false);
    }
  }, [params.quizId]);

  useEffect(() => {
    fetchMonitorData();
    fetchOfflineReadiness();
    const interval = setInterval(fetchMonitorData, 30000); // 30s safety poll
    return () => clearInterval(interval);
  }, [fetchMonitorData, fetchOfflineReadiness]);

  // Push activity feed event
  const pushActivity = useCallback((text: string) => {
    setEvents((prev) => [{ text, at: Date.now() }, ...prev].slice(0, 30));
  }, []);

  // Handle incoming camera snapshots
  const handleSnapshotMessage = useCallback((eventData: any) => {
    const sessionId = eventData.session_id;
    const frame = eventData.frame;
    if (!sessionId || !frame) return;

    recordCameraSnapshot(eventData);

    try {
      const [header, encoded] = String(frame).split(',');
      if (!header?.includes('data:image/jpeg;base64') || !encoded) return;

      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const newUrl = URL.createObjectURL(blob);

      setSnapshots((prev) => {
        // Revoke previous blob URL for this student to prevent memory leaks
        if (prev[sessionId]?.url) {
          URL.revokeObjectURL(prev[sessionId].url);
        }
        return {
          ...prev,
          [sessionId]: {
            url: newUrl,
            name: eventData.name || 'Student',
            rollNumber: eventData.roll_number || '—',
            updatedAt: eventData.timestamp || Date.now(),
          },
        };
      });

      // Update student's camera status in the table
      setStudents((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, camera_on: true, online: true } : s))
      );
    } catch (err) {
      console.warn('Malformed snapshot frame ignored', err);
    }
  }, []);

  // Establish real-time supervisor WebSocket
  useEffect(() => {
    if (!params.quizId) return;

    let ws: WebSocket | null = null;
    let cancelled = false;

    async function connectSupervisorWs() {
      try {
        const tokenRes = await api.post(`/assessments/${params.quizId}/monitor-token`);
        const token = tokenRes.data?.token;
        if (!token || cancelled) return;

        const wsUrl = getAssessmentWsUrl(params.quizId);

        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const evt = msg.event;
            const data = msg.data;

            if (evt === 'camera_snapshot') {
              handleSnapshotMessage(data);
            } else if (evt === 'student_joined') {
              pushActivity(`${data.name} (${data.roll_number}) joined`);
              fetchMonitorData();
            } else if (evt === 'student_status') {
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id
                    ? {
                        ...s,
                        online: data.online ?? s.online,
                        camera_on: data.camera_on ?? s.camera_on,
                        fullscreen: data.fullscreen ?? s.fullscreen,
                      }
                    : s
                )
              );
            } else if (evt === 'warning') {
              pushActivity(`⚠ ${data.roll_number}: ${data.warning_type} (Warning #${data.count})`);
              toast.error(`Warning on ${data.roll_number}: ${data.warning_type}`);
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id ? { ...s, warnings: data.count } : s
                )
              );
            } else if (evt === 'answer_saved') {
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id
                    ? { ...s, current_question: data.current_question ?? s.current_question }
                    : s
                )
              );
            } else if (evt === 'submit') {
              pushActivity(`✔ ${data.roll_number} submitted`);
              fetchMonitorData();
            } else if (evt === 'abandonment_warning') {
              pushActivity(`⚠ Abandonment warning on ${data.roll_number || 'Candidate'}`);
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id
                    ? { ...s, candidate_status: 'ABANDONMENT_WARNING', status: 'abandonment_warning' }
                    : s
                )
              );
            } else if (evt === 'abandonment_cancel') {
              pushActivity(`✔ Candidate ${data.roll_number || 'Candidate'} returned to exam`);
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id
                    ? { ...s, candidate_status: 'IN_PROGRESS', status: 'in_progress' }
                    : s
                )
              );
            } else if (evt === 'attempt_recovered') {
              pushActivity(`↺ Candidate ${data.roll_number || 'Candidate'} attempt recovered (${data.action})`);
              fetchMonitorData();
            }
          } catch (e) {
            // Ignore parse errors
          }
        };
      } catch (err) {
        console.warn('Failed to connect supervisor monitoring WebSocket', err);
      }
    }

    connectSupervisorWs();

    return () => {
      cancelled = true;
      if (ws) ws.close();
      socketRef.current = null;
      // Revoke all snapshot object URLs on unmount
      Object.values(snapshotsRef.current).forEach((s) => URL.revokeObjectURL(s.url));
    };
  }, [params.quizId, handleSnapshotMessage, pushActivity, fetchMonitorData]);

  // Only remove snapshots when an attempt is definitively completed or submitted
  useEffect(() => {
    const finishedIds = new Set(
      students
        .filter((s) => s.status === 'completed' || s.status === 'submitted' || s.candidate_status === 'COMPLETED' || s.candidate_status === 'SUBMITTED')
        .map((s) => s.session_id)
    );
    setSnapshots((prev) => {
      const next = { ...prev };
      let modified = false;
      Object.keys(next).forEach((sessionId) => {
        if (finishedIds.has(sessionId)) {
          URL.revokeObjectURL(next[sessionId].url);
          delete next[sessionId];
          modified = true;
        }
      });
      return modified ? next : prev;
    });
  }, [students]);

  function openRecoveryModal(student: MonitoredStudent) {
    setSelectedStudent(student);
    setRecoveryAction('RESUME');
    setRecoveryReason('');
    setRecoveryOpen(true);
  }

  async function handleConfirmRecovery() {
    if (!params.quizId || !selectedStudent) return;
    const attemptId = selectedStudent.attempt_id || selectedStudent.session_id;
    if (!attemptId) return;
    if (!recoveryReason.trim() || recoveryReason.trim().length < 5) {
      toast.error('Please enter a recovery reason of at least 5 characters');
      return;
    }

    setRecovering(true);
    try {
      await api.post(`/trainer/assessments/${params.quizId}/attempts/${attemptId}/recover`, {
        action: recoveryAction,
        reason: recoveryReason.trim(),
      });
      toast.success(`Assessment successfully ${recoveryAction === 'RESUME' ? 'resumed' : 'restarted'} for candidate!`);
      setRecoveryOpen(false);
      fetchMonitorData();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to recover assessment attempt');
    } finally {
      setRecovering(false);
    }
  }

  // Force End Quiz
  const handleForceEnd = async () => {
    setEndingQuiz(true);
    try {
      await api.post(`/assessments/${params.quizId}/force-end`);
      toast.success('Assessment concluded. In-progress attempts auto-submitted.');
      fetchMonitorData();
    } catch (err) {
      toast.error('Failed to conclude assessment');
    } finally {
      setEndingQuiz(false);
      setEndDialogOpen(false);
    }
  };

  // Export Excel with Embedded Photos
  const handleExportExcelWithPhotos = async () => {
    setExportingExcel(true);
    try {
      // Fetch latest official results from database
      const resultsRes = await api.get(`/trainer/assessments/${params.quizId}/results`);
      const rawResults = resultsRes.data?.results || [];

      const rows: StudentResultRow[] = rawResults.map((r: any, idx: number) => ({
        rank: idx + 1,
        rollNumber: r.rollNumber || '—',
        name: r.name,
        batchName: r.batchName,
        marks: r.score,
        maxMarks: r.maxScore || r.possible || 100,
        percentage: r.percentage || 0,
        passed: Boolean(r.passed),
        warnings: r.warnings ?? r.warningCount ?? 0,
        sessionId: r.studentId,
        attemptId: r.attemptId,
        assessmentId: params.quizId,
        submissionTimestamp: r.submittedAt || r.completedAt,
        status: r.status,
        submissionReason: r.submissionReason,
        snapshots: r.snapshots || [],
      }));

      await exportAssessmentResultsToExcel(
        quizInfo?.name || 'Assessment',
        rows,
        undefined,
        { assessmentId: params.quizId }
      );
      toast.success('Excel workbook with embedded camera snapshots exported successfully!');
    } catch (err) {
      toast.error('Failed to export Excel workbook');
    } finally {
      setExportingExcel(false);
    }
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const fmtAge = (timestamp: number) => {
    if (!timestamp) return 'No camera feed';
    const sec = Math.max(0, Math.round((nowMs - timestamp) / 1000));
    return `${sec}s ago`;
  };

  const activeCount = students.filter((s) => s.online && (s.status === 'in_progress' || s.candidate_status === 'IN_PROGRESS')).length;
  const submittedCount = students.filter((s) => s.status === 'submitted' || s.status === 'completed' || s.candidate_status === 'SUBMITTED' || s.candidate_status === 'COMPLETED').length;
  const warningsTotal = students.reduce((acc, s) => acc + (s.warnings || 0), 0);
  const liveFeedsCount = Object.values(snapshots).filter((s) => nowMs - s.updatedAt < 30000).length;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/trainer/assessments')}
            className="mb-1 text-ink-3 hover:text-ink-1"
          >
            <ArrowLeft className="mr-1 size-3.5" />
            Back to Assessments
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-ink-1">
            Live Assessment Monitor: {quizInfo?.name || 'Loading...'}
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Real-time candidate statuses, snapshot proctoring feeds, and violation alerts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchMonitorData}
            title="Refresh monitor state"
          >
            <RefreshCw className="mr-1 size-3.5" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportExcelWithPhotos}
            loading={exportingExcel}
          >
            <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600" />
            Export Excel with Photos
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/trainer/assessments/${params.quizId}/feedback`}>
              <MessageSquare className="mr-1.5 size-3.5 text-primary" />
              View Feedback
            </Link>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setEndDialogOpen(true)}
          >
            <StopCircle className="mr-1.5 size-3.5" />
            End Assessment
          </Button>
        </div>
      </div>

      {/* View Switcher: Live Online Monitor vs Offline Cohort Readiness */}
      <div className="flex border-b border-line gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('ONLINE_MONITOR')}
          className={cn(
            'pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2',
            activeTab === 'ONLINE_MONITOR'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-3 hover:text-ink-1'
          )}
        >
          <Users className="size-4" />
          Live Online Proctoring (WebSocket)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('OFFLINE_COHORT');
            void fetchOfflineReadiness();
          }}
          className={cn(
            'pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2',
            activeTab === 'OFFLINE_COHORT'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-3 hover:text-ink-1'
          )}
        >
          <HardDrive className="size-4" />
          Offline Cohort &amp; Sync Readiness
          {offlineReadiness?.attemptMetrics?.totalSynchronized != null && (
            <Badge tone="success" className="text-[10px] ml-1">
              {offlineReadiness.attemptMetrics.totalSynchronized} Synced
            </Badge>
          )}
        </button>
      </div>

      {activeTab === 'OFFLINE_COHORT' ? (
        <div className="space-y-6">
          {/* Offline Cohort Metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Authorized Packages</span>
                <p className="tnum mt-1 text-2xl font-bold text-ink-1">
                  {offlineReadiness?.downloadedPackagesCount ?? offlineReadiness?.downloadMetrics?.uniqueStudentsDownloaded ?? 0}
                </p>
                <span className="text-[10px] text-ink-3">Students downloaded package</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Synchronized Attempts</span>
                <p className="tnum mt-1 text-2xl font-bold text-emerald-600">
                  {offlineReadiness?.synchronizedAttemptsCount ?? offlineReadiness?.attemptMetrics?.totalSynchronized ?? 0}
                </p>
                <span className="text-[10px] text-emerald-600/80">Evaluated on server</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Pending Synchronization</span>
                <p className="tnum mt-1 text-2xl font-bold text-amber-600">
                  {offlineReadiness?.pendingSyncCount ?? offlineReadiness?.attemptMetrics?.pendingSyncEstimated ?? 0}
                </p>
                <span className="text-[10px] text-amber-600/80">Awaiting student reconnect</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Offline Proctoring Events</span>
                <p className="tnum mt-1 text-2xl font-bold text-indigo-600">
                  {offlineReadiness?.offlineProctoringEventsCount ?? offlineReadiness?.proctoringSummary?.totalOfflineSnapshots ?? 0}
                </p>
                <span className="text-[10px] text-indigo-600/80">
                  Recorded and ingested
                </span>
              </CardBody>
            </Card>
          </div>

          {/* Architecture Status Banner */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex items-start gap-3.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-ink-1">
                Decentralized Offline-First Examination Cohort
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Students execute this assessment completely offline on their own devices without any LAN or local server requirement.
                No artificial heartbeats are generated while candidates are disconnected. All answers and proctoring logs are sealed locally with SHA-256 integrity checksums and automatically evaluated authoritatively upon network synchronization.
              </p>
            </div>
          </div>

          {/* Synchronized Cohort Roster */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-line px-4 py-3 flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Synchronized Attempts &amp; Verification Log
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchOfflineReadiness}
                disabled={loadingOffline}
                className="text-xs h-7"
              >
                <RefreshCw className={cn('size-3 mr-1', loadingOffline && 'animate-spin')} />
                Refresh Roster
              </Button>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-app text-ink-3 font-medium border-b border-line">
                  <tr>
                    <th className="p-3">Roll</th>
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Score</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Integrity Hash</th>
                    <th className="p-3">Synchronized At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(() => {
                    const syncedList = offlineReadiness?.synchronizedAttempts || offlineReadiness?.recentSynchronizedAttempts || [];
                    if (syncedList.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-ink-3">
                            No synchronized offline attempts recorded yet.
                          </td>
                        </tr>
                      );
                    }
                    return syncedList.map((att: any) => (
                      <tr key={att.attemptId} className="hover:bg-card-hover transition-colors">
                        <td className="p-3 font-mono font-medium text-ink-1">
                          {att.rollNumber || '—'}
                        </td>
                        <td className="p-3 font-medium text-ink-1">
                          {att.studentName || 'Student'}
                        </td>
                        <td className="p-3 font-mono text-ink-2">
                          {att.durationSeconds || att.timeTakenSeconds ? fmtTime(att.durationSeconds || att.timeTakenSeconds) : '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-ink-1">
                          {att.score}
                        </td>
                        <td className="p-3">
                          <Badge tone={att.score >= 50 ? 'success' : 'danger'}>
                            {att.score >= 50 ? 'PASSED' : 'FAILED'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge tone="purple" className="font-mono text-[10px]">
                            {att.submissionSource || 'OFFLINE_SYNC'}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-ink-3 max-w-[140px] truncate" title={att.integrityHash}>
                          {att.integrityHash ? `${att.integrityHash.slice(0, 12)}…` : '—'}
                        </td>
                        <td className="p-3 text-ink-3">
                          {att.syncedAt || att.submittedAt ? new Date(att.syncedAt || att.submittedAt).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <>
          {/* Metrics Header */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardBody className="p-4">
            <span className="text-xs text-ink-3">Total Candidates</span>
            <p className="tnum mt-1 text-2xl font-bold text-ink-1">{students.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <span className="text-xs text-ink-3">Active (Online)</span>
            <p className="tnum mt-1 text-2xl font-bold text-emerald-600">{activeCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <span className="text-xs text-ink-3">Completed</span>
            <p className="tnum mt-1 text-2xl font-bold text-indigo-600">{submittedCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <span className="text-xs text-ink-3">Proctoring Warnings</span>
            <p className="tnum mt-1 text-2xl font-bold text-red-600">{warningsTotal}</p>
          </CardBody>
        </Card>
      </div>

      {/* Main Monitoring View */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Live Candidates Table (2 Columns) */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-line px-4 py-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Candidates List</span>
                <span className="text-xs text-ink-3 font-normal">
                  Auto-updates via WebSockets
                </span>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-app text-ink-3 font-medium border-b border-line">
                  <tr>
                    <th className="p-3">Roll</th>
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Q Progress</th>
                    <th className="p-3">Time Left</th>
                    <th className="p-3">Warnings</th>
                    <th className="p-3">Camera Feed</th>
                    <th className="p-3">FS</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {students.map((s) => {
                    const snap = snapshots[s.session_id];
                    const candStatus = s.candidate_status || s.status;
                    const isEligibleForRecovery =
                      candStatus === 'SUBMITTED' ||
                      candStatus === 'COMPLETED' ||
                      candStatus === 'ABANDONED' ||
                      candStatus === 'AUTO_SUBMITTED' ||
                      s.status === 'submitted' ||
                      s.status === 'completed' ||
                      s.status === 'abandoned';

                    return (
                      <tr
                        key={s.session_id}
                        className={cn(
                          'hover:bg-card-hover transition-colors',
                          s.stale && 'bg-amber-500/5',
                          candStatus === 'ABANDONMENT_WARNING' && 'bg-rose-500/10 animate-pulse'
                        )}
                      >
                        <td className="p-3 font-mono font-medium text-ink-1">{s.roll_number}</td>
                        <td className="p-3">
                          <p className="font-medium text-ink-1">{s.name}</p>
                          <span className="flex items-center gap-1 text-[10px] text-ink-3">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                s.online ? 'bg-emerald-500' : 'bg-ink-4'
                              )}
                            />
                            {s.online ? 'Connected' : 'Offline'}
                          </span>
                        </td>
                        <td className="p-3 font-mono">
                          {s.current_question + 1}
                          {s.total_questions > 0 && `/${s.total_questions}`}
                        </td>
                        <td className="p-3 font-mono">
                          {s.status === 'in_progress' ? fmtTime(s.remaining_seconds) : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              'font-bold',
                              s.warnings > 0 ? 'text-red-600' : 'text-ink-3'
                            )}
                          >
                            {s.warnings}
                          </span>
                        </td>
                        <td className="p-3">
                          {snap?.url ? (
                            <div>
                              <img
                                src={snap.url}
                                alt={`${s.name} webcam`}
                                className="h-16 w-24 rounded border border-line object-cover bg-black"
                              />
                              <p className="mt-0.5 text-[10px] text-ink-3">
                                {fmtAge(snap.updatedAt)}
                              </p>
                            </div>
                          ) : s.camera_on ? (
                            <span className="text-[11px] text-ink-3">Awaiting frame...</span>
                          ) : (
                            <span className="text-[11px] text-red-500 font-medium">Off</span>
                          )}
                        </td>
                        <td className="p-3">
                          {s.fullscreen ? (
                            <span className="text-emerald-500" title="Fullscreen Active">🟢</span>
                          ) : (
                            <span className="text-red-500" title="Exited Fullscreen">🔴</span>
                          )}
                        </td>
                        <td className="p-3">
                          {candStatus === 'ABANDONMENT_WARNING' ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-rose-500/20 text-rose-600 border border-rose-500/30 animate-pulse">
                              Abandon Warning
                            </span>
                          ) : candStatus === 'ABANDONED' ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-rose-100 text-rose-800">
                              Abandoned
                            </span>
                          ) : candStatus === 'DISCONNECTED' || candStatus === 'TEMPORARILY_DISCONNECTED' ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                              Disconnected
                            </span>
                          ) : candStatus === 'AUTO_SUBMITTED' ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-300 dark:border-purple-700">
                              Auto-Submitted
                            </span>
                          ) : candStatus === 'SUBMITTED' || candStatus === 'COMPLETED' || s.status === 'submitted' || s.status === 'completed' ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                              Completed
                            </span>
                          ) : (
                            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-blue-100 text-blue-800">
                              In Progress
                            </span>
                          )}
                          {s.is_recovered && (
                            <span className="block text-[9px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                              Recovered
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {isEligibleForRecovery ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openRecoveryModal(s)}
                              className="h-6 text-[10px] gap-1"
                              title="Reassign or recover this student assessment attempt"
                            >
                              <RotateCcw className="size-2.5" />
                              Recover
                            </Button>
                          ) : (
                            <span className="text-[10px] text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && !loading && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-ink-3">
                        No candidate sessions registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Live Camera Card Gallery & Activity Feed (1 Column) */}
        <div className="space-y-6">
          {/* Live Camera Card Gallery */}
          <Card>
            <CardHeader className="border-b border-line px-4 py-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Live Camera Feeds ({liveFeedsCount})</span>
                <Camera className="size-4 text-ink-3" />
              </CardTitle>
            </CardHeader>
            <CardBody className="p-4">
              <div className="grid grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                {Object.entries(snapshots).map(([sessionId, snap]) => {
                  const isLive = nowMs - snap.updatedAt < 30000;
                  return (
                    <div
                      key={sessionId}
                      className="flex flex-col items-center rounded-lg border border-line bg-app p-2 text-center"
                    >
                      <div className="relative h-24 w-full overflow-hidden rounded bg-black">
                        <img
                          src={snap.url}
                          alt={`${snap.name} feed`}
                          className="h-full w-full object-cover"
                        />
                        <span
                          className={cn(
                            'absolute bottom-1 right-1 rounded px-1 text-[9px] font-medium',
                            isLive
                              ? 'bg-black/70 text-emerald-400'
                              : 'bg-black/70 text-amber-400'
                          )}
                        >
                          {isLive ? 'LIVE · ' : 'SNAPSHOT · '}
                          {fmtAge(snap.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-semibold text-ink-1 truncate w-full">
                        {snap.name}
                      </p>
                      <p className="text-[10px] font-mono text-ink-3">{snap.rollNumber}</p>
                    </div>
                  );
                })}
                {Object.keys(snapshots).length === 0 && (
                  <div className="col-span-2 py-8 text-center text-xs text-ink-3">
                    Waiting for camera feeds to stream...
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Activity Event Stream */}
          <Card>
            <CardHeader className="border-b border-line px-4 py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="size-4 text-ink-3" />
                Live Proctoring Events
              </CardTitle>
            </CardHeader>
            <CardBody className="p-4">
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                {events.map((evt, idx) => (
                  <p key={idx} className="leading-snug text-ink-2 border-b border-line/50 pb-1.5">
                    {evt.text}
                  </p>
                ))}
                {events.length === 0 && (
                  <p className="text-ink-3 py-4 text-center">No proctoring events recorded.</p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )}

      {/* Confirm End Quiz Modal */}
      <ConfirmDialog
        open={endDialogOpen}
        onOpenChange={setEndDialogOpen}
        title="End this assessment now?"
        description="This will immediately conclude the exam for all candidates. Any in-progress attempts will be automatically scored and submitted."
        confirmLabel="Conclude Exam"
        onConfirm={handleForceEnd}
        pending={endingQuiz}
      />

      {/* Reassignment & Recovery Modal */}
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-primary" />
              Recover Assessment Attempt
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 text-xs">
            {selectedStudent && (
              <div className="rounded-xl border border-line bg-app p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-ink-3">Candidate:</span>
                  <span className="font-semibold text-ink-1">{selectedStudent.name} ({selectedStudent.roll_number})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Status:</span>
                  <span className="font-mono font-semibold text-ink-1 uppercase">{selectedStudent.candidate_status || selectedStudent.status}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="font-semibold text-ink-1 block">Select Recovery Action:</label>

              <div
                onClick={() => setRecoveryAction('RESUME')}
                className={cn(
                  'rounded-xl border p-3 cursor-pointer transition-all space-y-1',
                  recoveryAction === 'RESUME'
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-line bg-card hover:bg-card-hover'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-1">Option B: Resume Assessment (Recommended)</span>
                  <Badge tone={recoveryAction === 'RESUME' ? 'teal' : 'neutral'} className="text-[10px]">
                    Preserve Progress
                  </Badge>
                </div>
                <p className="text-[11px] text-ink-3 leading-relaxed">
                  Restores previously saved answers, question navigation position, and remaining time. The candidate continues seamlessly without losing work.
                </p>
              </div>

              <div
                onClick={() => setRecoveryAction('RESTART')}
                className={cn(
                  'rounded-xl border p-3 cursor-pointer transition-all space-y-1',
                  recoveryAction === 'RESTART'
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-line bg-card hover:bg-card-hover'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-1">Option A: Restart Assessment</span>
                  <Badge tone={recoveryAction === 'RESTART' ? 'amber' : 'neutral'} className="text-[10px]">
                    Fresh Attempt
                  </Badge>
                </div>
                <p className="text-[11px] text-ink-3 leading-relaxed">
                  Creates a fresh assessment attempt starting from Question 1 and resets the timer to full duration. Preserves previous attempt in audit history.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="font-semibold text-ink-1 block">
                Recovery Reason <span className="text-red-500">*</span>:
              </label>
              <textarea
                value={recoveryReason}
                onChange={(e) => setRecoveryReason(e.target.value)}
                placeholder="e.g. Accidental navigation / power outage during exam. Trainer authorized recovery."
                className="w-full h-20 rounded-lg border border-line bg-app p-2.5 text-xs text-ink-1 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-ink-3">
                This recovery action and reason will be immutably recorded in quiz_recovery_logs.
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
    </div>
  );
}

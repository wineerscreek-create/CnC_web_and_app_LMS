'use client';

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  HardDrive,
  History,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  StopCircle,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

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
import {
  recordCameraSnapshot,
  startCameraSnapshotSession,
  clearCameraSnapshotSamples,
} from '@/lib/quiz/cameraSnapshots';
import { ExportAssessmentModal } from '@/components/quiz/ExportAssessmentModal';
import { getAssessmentWsUrl } from '@/lib/quiz/ws';

interface MonitoredStudent {
  session_id: string;
  attempt_id: string;
  attempt_count: number;
  name: string;
  email?: string | null;
  roll_number: string;
  current_question: number;
  total_questions: number;
  remaining_seconds: number;
  warnings: number;
  camera_on: boolean;
  camera_status: string;
  has_snapshot: boolean;
  last_camera_frame_at?: string | null;
  fullscreen: boolean;
  online: boolean;
  status: string;
  candidate_status: string;
  submission_status?: string;
  connection_status?: 'ONLINE' | 'DISCONNECTED' | 'OFFLINE' | 'UNKNOWN';
  submission_source: string;
  submission_reason?: string | null;
  is_recovered?: boolean;
  completed_at?: string | null;
  local_submitted_at?: string | null;
  last_seen_seconds_ago: number;
  stale: boolean;
}

interface MonitorCounters {
  totalCandidates: number;
  startedCount: number;
  notStartedCount: number;
  activeCount: number;
  completedCount: number;
  offlineSubmittedCount: number;
  syncPendingCount: number;
  autoSubmittedCount: number;
  abandonedCount: number;
  disconnectedCount: number;
  warningsTotal: number;
}

interface SnapshotState {
  url: string;
  name: string;
  rollNumber: string;
  updatedAt: number;
  isObjectUrl?: boolean;
}

const STATUS_FILTERS = [
  { key: 'ALL_STARTED', label: 'All Started' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'OFFLINE_SUBMITTED', label: 'Offline Submitted' },
  { key: 'SYNC_PENDING', label: 'Sync Pending' },
  { key: 'AUTO_SUBMITTED', label: 'Auto-Submitted' },
  { key: 'ABANDONED', label: 'Abandoned' },
  { key: 'DISCONNECTED', label: 'Disconnected' },
  { key: 'WITH_WARNINGS', label: 'With Warnings' },
  { key: 'NOT_STARTED', label: 'Not Started' },
] as const;

/** Isolated 1-second timer so the main monitor table and camera grid do not re-render every second. */
const SnapshotAgeLabel = memo(function SnapshotAgeLabel({
  updatedAt,
  prefix,
}: {
  updatedAt: number;
  prefix?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!updatedAt) return <span>No camera feed</span>;
  const sec = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span>
      {prefix ? `${prefix} · ` : ''}
      {sec}s ago
    </span>
  );
});

const FINALIZED_SUBMISSION_STATUSES = new Set([
  'COMPLETED',
  'AUTO_SUBMITTED',
  'OFFLINE_SUBMITTED',
  'ABANDONED',
]);

function isFinalizedSubmission(s: Pick<MonitoredStudent, 'status' | 'candidate_status' | 'submission_status'>): boolean {
  return (
    s.status === 'completed' ||
    FINALIZED_SUBMISSION_STATUSES.has((s.submission_status || '').toUpperCase()) ||
    FINALIZED_SUBMISSION_STATUSES.has((s.candidate_status || '').toUpperCase())
  );
}

const EMPTY_COUNTERS: MonitorCounters = {
  totalCandidates: 0,
  startedCount: 0,
  notStartedCount: 0,
  activeCount: 0,
  completedCount: 0,
  offlineSubmittedCount: 0,
  syncPendingCount: 0,
  autoSubmittedCount: 0,
  abandonedCount: 0,
  disconnectedCount: 0,
  warningsTotal: 0,
};

export default function TrainerAssessmentMonitorPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();

  const [quizInfo, setQuizInfo] = useState<any>(null);
  const [students, setStudents] = useState<MonitoredStudent[]>([]);
  const [counters, setCounters] = useState<MonitorCounters>(EMPTY_COUNTERS);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotState>>({});
  const [events, setEvents] = useState<Array<{ text: string; at: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endingQuiz, setEndingQuiz] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Search, Status Filters, Sorting, and Pagination
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL_STARTED');
  const [sortBy, setSortBy] = useState<string>('roll_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalFiltered: 0, totalPages: 1 });

  // Attempt History & Historical Snapshots lazy modals
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<MonitoredStudent | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attemptHistory, setAttemptHistory] = useState<{ attempts: any[]; recoveryLogs: any[] }>({
    attempts: [],
    recoveryLogs: [],
  });

  const [snapHistoryOpen, setSnapHistoryOpen] = useState(false);
  const [snapHistoryStudent, setSnapHistoryStudent] = useState<MonitoredStudent | null>(null);
  const [snapHistoryLoading, setSnapHistoryLoading] = useState(false);
  const [historicalSnapshots, setHistoricalSnapshots] = useState<any[]>([]);

  // Assessment Reassignment & Recovery state
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<MonitoredStudent | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<'RESTART' | 'RESUME'>('RESUME');
  const [recoveryReason, setRecoveryReason] = useState('');
  const [recovering, setRecovering] = useState(false);

  // Decentralized Offline Examination Cohort & Report Approvals state (lazy loaded on tab switch)
  const [activeTab, setActiveTab] = useState<'ONLINE_MONITOR' | 'OFFLINE_COHORT' | 'REPORTS_APPROVAL'>('ONLINE_MONITOR');
  const [offlineReadiness, setOfflineReadiness] = useState<any>(null);
  const [loadingOffline, setLoadingOffline] = useState(false);

  const [reportsData, setReportsData] = useState<{ counts: any; items: any[] }>({
    counts: { total: 0, pending: 0, approved: 0, rejected: 0 },
    items: [],
  });
  const [reportsStatusFilter, setReportsStatusFilter] = useState<string>('ALL');
  const [loadingReports, setLoadingReports] = useState(false);
  const [reviewingReportId, setReviewingReportId] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;
  const studentsRef = useRef(students);
  studentsRef.current = students;
  const inFlightMonitorRef = useRef(false);
  const pollErrorCountRef = useRef(0);
  const quizCompletedRef = useRef(false);

  // Initialize snapshot reservoir session
  useEffect(() => {
    if (params.quizId) {
      startCameraSnapshotSession(params.quizId);
    }
    return () => {
      clearCameraSnapshotSamples();
    };
  }, [params.quizId]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Lazy-load latest snapshots ONLY for visible candidates on current page who have snapshots
  const fetchVisibleSnapshots = useCallback(
    async (visibleStudents: MonitoredStudent[]) => {
      if (!params.quizId) return;
      const missingIds = visibleStudents
        .filter((s) => s.has_snapshot && !snapshotsRef.current[s.session_id])
        .map((s) => s.session_id)
        .slice(0, 50);

      if (missingIds.length === 0) return;

      try {
        const res = await api.get(
          `/assessments/${params.quizId}/snapshots/latest?student_ids=${encodeURIComponent(missingIds.join(','))}`
        );
        const snapMap = res.data?.snapshots || {};
        if (Object.keys(snapMap).length === 0) return;

        setSnapshots((prev) => {
          const next = { ...prev };
          for (const uid of Object.keys(snapMap)) {
            if (next[uid]) continue;
            const stu = visibleStudents.find((s) => s.session_id === uid);
            const item = snapMap[uid];
            if (item?.imageData) {
              next[uid] = {
                url: item.imageData,
                name: stu?.name || 'Student',
                rollNumber: stu?.roll_number || '—',
                updatedAt: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
                isObjectUrl: false,
              };
            }
          }
          return next;
        });
      } catch {
        // Non-critical lazy snapshot error
      }
    },
    [params.quizId]
  );

  // Deduplicated monitor fetch
  const fetchMonitorData = useCallback(async () => {
    if (!params.quizId || inFlightMonitorRef.current) return;
    inFlightMonitorRef.current = true;
    try {
      const qs = new URLSearchParams({
        status: statusFilter,
        sort_by: sortBy,
        sort_dir: sortDir,
        page: String(page),
        page_size: '50',
      });
      if (debouncedSearch) qs.set('search', debouncedSearch);

      const res = await api.get(`/assessments/${params.quizId}/monitor?${qs.toString()}`);
      if (res.data) {
        setQuizInfo(res.data.quiz);
        quizCompletedRef.current = res.data.quiz?.status === 'completed';
        const list: MonitoredStudent[] = res.data.students || [];
        setStudents(list);
        if (res.data.counters) {
          setCounters(res.data.counters);
        } else {
          setCounters({
            ...EMPTY_COUNTERS,
            totalCandidates: list.length,
            startedCount: list.length,
            activeCount: list.filter((s) => s.candidate_status === 'ACTIVE' || s.candidate_status === 'IN_PROGRESS').length,
            completedCount: list.filter((s) => s.candidate_status === 'COMPLETED' || s.status === 'completed').length,
            abandonedCount: list.filter((s) => s.candidate_status === 'ABANDONED').length,
            disconnectedCount: list.filter((s) => s.candidate_status === 'DISCONNECTED').length,
            warningsTotal: list.reduce((acc, s) => acc + (s.warnings || 0), 0),
          });
        }
        if (res.data.pagination) setPagination(res.data.pagination);
        pollErrorCountRef.current = 0;
        void fetchVisibleSnapshots(list);
      }
    } catch {
      pollErrorCountRef.current += 1;
      toast.error('Failed to load assessment monitor data');
    } finally {
      inFlightMonitorRef.current = false;
      setLoading(false);
    }
  }, [params.quizId, statusFilter, sortBy, sortDir, page, debouncedSearch, fetchVisibleSnapshots]);

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

  const fetchAssessmentReports = useCallback(
    async (statusVal?: string) => {
      if (!params.quizId) return;
      setLoadingReports(true);
      try {
        const effStatus = statusVal ?? reportsStatusFilter;
        const qs = new URLSearchParams({ page: '1', page_size: '100' });
        if (effStatus !== 'ALL') qs.set('status', effStatus);
        const res = await api.get(`/trainer/assessments/${params.quizId}/reports?${qs.toString()}`);
        if (res.data) {
          setReportsData(res.data?.data || res.data);
        }
      } catch {
        toast.error('Failed to load assessment reports');
      } finally {
        setLoadingReports(false);
      }
    },
    [params.quizId, reportsStatusFilter]
  );

  const handleReviewReport = async (reportId: string, decision: 'approve' | 'reject') => {
    setReviewingReportId(reportId);
    try {
      await api.post(`/trainer/assessments/reports/${reportId}/${decision}`, {});
      toast.success(`Report ${decision === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await fetchAssessmentReports();
    } catch (err) {
      toast.error((err as ApiError).message || `Failed to ${decision} report`);
    } finally {
      setReviewingReportId(null);
    }
  };

  // Initial fetch & visibility-aware polling (pauses when tab is hidden or quiz is completed)
  useEffect(() => {
    void fetchMonitorData();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      if (quizCompletedRef.current) return;
      const backoff = Math.min(120000, 30000 * Math.pow(2, Math.min(2, pollErrorCountRef.current)));
      timer = setTimeout(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !quizCompletedRef.current) {
          void fetchMonitorData().finally(scheduleNext);
        } else {
          scheduleNext();
        }
      }, backoff);
    };
    scheduleNext();

    const onVisChange = () => {
      if (document.visibilityState === 'visible' && !quizCompletedRef.current) {
        void fetchMonitorData();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [fetchMonitorData]);

  // Push activity feed event
  const pushActivity = useCallback((text: string) => {
    setEvents((prev) => [{ text, at: Date.now() }, ...prev].slice(0, 30));
  }, []);

  // Handle incoming live camera snapshots
  const handleSnapshotMessage = useCallback((eventData: any) => {
    const sessionId = eventData.session_id;
    const frame = eventData.frame;
    if (!sessionId || !frame) return;

    // Do not overwrite finalized DONE state for already-completed students
    const target = studentsRef.current.find((s) => s.session_id === sessionId);
    if (target && isFinalizedSubmission(target)) return;

    recordCameraSnapshot(eventData);

    try {
      const [header, encoded] = String(frame).split(',');
      if (!header?.includes('data:image/jpeg;base64') || !encoded) return;

      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const newUrl = URL.createObjectURL(blob);

      setSnapshots((prev) => {
        if (prev[sessionId]?.isObjectUrl && prev[sessionId]?.url) {
          URL.revokeObjectURL(prev[sessionId].url);
        }
        return {
          ...prev,
          [sessionId]: {
            url: newUrl,
            name: eventData.name || 'Student',
            rollNumber: eventData.roll_number || '—',
            updatedAt: eventData.timestamp || Date.now(),
            isObjectUrl: true,
          },
        };
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.session_id === sessionId && !isFinalizedSubmission(s)
            ? { ...s, camera_on: true, camera_status: 'LIVE', online: true, connection_status: 'ONLINE', has_snapshot: true }
            : s
        )
      );
    } catch {
      // Ignore malformed frame
    }
  }, []);

  // Keep stable refs for WS callbacks so socket does not reconnect on filter/page changes
  const fetchMonitorRef = useRef(fetchMonitorData);
  fetchMonitorRef.current = fetchMonitorData;

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
              const exists = studentsRef.current.some((s) => s.session_id === data.session_id);
              if (exists) {
                setStudents((prev) =>
                  prev.map((s) => {
                    if (s.session_id !== data.session_id) return s;
                    if (isFinalizedSubmission(s)) {
                      return { ...s, online: true, connection_status: 'ONLINE' };
                    }
                    if (s.candidate_status === 'OFFLINE_SYNC_PENDING') {
                      return { ...s, online: true, connection_status: 'ONLINE', stale: false };
                    }
                    return { ...s, online: true, connection_status: 'ONLINE', candidate_status: 'ACTIVE', stale: false };
                  })
                );
              } else {
                void fetchMonitorRef.current();
              }
            } else if (evt === 'student_status') {
              setStudents((prev) =>
                prev.map((s) => {
                  if (s.session_id !== data.session_id) return s;
                  const nextOnline = data.online ?? s.online;
                  const nextConn: MonitoredStudent['connection_status'] = nextOnline ? 'ONLINE' : 'DISCONNECTED';
                  if (isFinalizedSubmission(s) || data.is_finalized) {
                    return {
                      ...s,
                      online: nextOnline,
                      connection_status: nextConn,
                    };
                  }
                  if (s.candidate_status === 'OFFLINE_SYNC_PENDING') {
                    return {
                      ...s,
                      online: nextOnline,
                      connection_status: nextOnline ? 'ONLINE' : 'OFFLINE',
                    };
                  }
                  return {
                    ...s,
                    online: nextOnline,
                    connection_status: nextConn,
                    camera_on: data.camera_on ?? s.camera_on,
                    fullscreen: data.fullscreen ?? s.fullscreen,
                    candidate_status: nextOnline ? 'ACTIVE' : 'DISCONNECTED',
                    camera_status: !nextOnline && s.has_snapshot ? 'HISTORICAL' : s.camera_status,
                  };
                })
              );
            } else if (evt === 'warning') {
              pushActivity(`⚠ ${data.roll_number}: ${data.warning_type} (Warning #${data.count})`);
              toast.error(`Warning on ${data.roll_number}: ${data.warning_type}`);
              setStudents((prev) =>
                prev.map((s) => (s.session_id === data.session_id ? { ...s, warnings: data.count } : s))
              );
              setCounters((c) => ({ ...c, warningsTotal: c.warningsTotal + 1 }));
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
              void fetchMonitorRef.current();
            } else if (evt === 'abandonment_warning') {
              pushActivity(`⚠ Abandonment warning on ${data.roll_number || 'Candidate'}`);
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id && !isFinalizedSubmission(s)
                    ? { ...s, candidate_status: 'ABANDONMENT_WARNING', status: 'in_progress' }
                    : s
                )
              );
            } else if (evt === 'abandonment_cancel') {
              pushActivity(`✔ Candidate ${data.roll_number || 'Candidate'} returned to exam`);
              setStudents((prev) =>
                prev.map((s) =>
                  s.session_id === data.session_id && !isFinalizedSubmission(s)
                    ? { ...s, candidate_status: 'ACTIVE', status: 'in_progress' }
                    : s
                )
              );
            } else if (evt === 'attempt_recovered') {
              pushActivity(`↺ Candidate ${data.roll_number || 'Candidate'} attempt recovered (${data.action})`);
              void fetchMonitorRef.current();
            }
          } catch {
            // Ignore parse errors
          }
        };
      } catch (err) {
        console.warn('Failed to connect supervisor monitoring WebSocket', err);
      }
    }

    void connectSupervisorWs();

    return () => {
      cancelled = true;
      if (ws) ws.close();
      socketRef.current = null;
      Object.values(snapshotsRef.current).forEach((s) => {
        if (s.isObjectUrl && s.url) URL.revokeObjectURL(s.url);
      });
    };
  }, [params.quizId, handleSnapshotMessage, pushActivity]);

  function openRecoveryModal(student: MonitoredStudent) {
    setSelectedStudent(student);
    setRecoveryAction('RESUME');
    setRecoveryReason('');
    setRecoveryOpen(true);
  }

  async function openAttemptHistory(student: MonitoredStudent) {
    setHistoryStudent(student);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/assessments/${params.quizId}/students/${student.session_id}/attempts`);
      setAttemptHistory(res.data || { attempts: [], recoveryLogs: [] });
    } catch {
      toast.error('Failed to load candidate attempt history');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openSnapshotHistory(student: MonitoredStudent) {
    setSnapHistoryStudent(student);
    setSnapHistoryOpen(true);
    setSnapHistoryLoading(true);
    try {
      const res = await api.get(`/assessments/${params.quizId}/students/${student.session_id}/snapshots`);
      setHistoricalSnapshots(res.data?.snapshots || []);
    } catch {
      toast.error('Failed to load historical snapshots');
    } finally {
      setSnapHistoryLoading(false);
    }
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
      void fetchMonitorData();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to recover assessment attempt');
    } finally {
      setRecovering(false);
    }
  }

  const handleForceEnd = async () => {
    setEndingQuiz(true);
    try {
      await api.post(`/assessments/${params.quizId}/force-end`);
      toast.success('Assessment concluded. In-progress attempts auto-submitted.');
      void fetchMonitorData();
    } catch {
      toast.error('Failed to conclude assessment');
    } finally {
      setEndingQuiz(false);
      setEndDialogOpen(false);
    }
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const fmtClock = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('ALL_STARTED');
    setSortBy('roll_number');
    setSortDir('asc');
    setPage(1);
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'last_activity' || field === 'submission_time' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const liveCameraEntries = Object.entries(snapshots).filter(([uid]) => {
    const stu = students.find((s) => s.session_id === uid);
    return stu && stu.status !== 'completed';
  });

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
            Real-time candidate statuses, demand-loaded proctoring feeds, and lifecycle audit
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void fetchMonitorData()} title="Refresh monitor state">
            <RefreshCw className="mr-1 size-3.5" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExportModalOpen(true)}
          >
            <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600" />
            Export Excel
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/trainer/assessments/${params.quizId}/feedback`}>
              <MessageSquare className="mr-1.5 size-3.5 text-primary" />
              View Feedback
            </Link>
          </Button>
          <Button variant="danger" size="sm" onClick={() => setEndDialogOpen(true)}>
            <StopCircle className="mr-1.5 size-3.5" />
            End Assessment
          </Button>
        </div>
      </div>

      {/* View Switcher */}
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
          Live Proctoring &amp; Status Monitor
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('OFFLINE_COHORT');
            if (!offlineReadiness) void fetchOfflineReadiness();
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
          {counters.offlineSubmittedCount > 0 && (
            <Badge tone="success" className="text-[10px] ml-1">
              {counters.offlineSubmittedCount} Synced
            </Badge>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('REPORTS_APPROVAL');
            void fetchAssessmentReports();
          }}
          className={cn(
            'pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2',
            activeTab === 'REPORTS_APPROVAL'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-3 hover:text-ink-1'
          )}
        >
          <FileSpreadsheet className="size-4" />
          Reports &amp; Approvals
          {reportsData.counts.pending > 0 && (
            <Badge tone="amber" className="text-[10px] ml-1">
              {reportsData.counts.pending} Pending
            </Badge>
          )}
        </button>
      </div>

      {activeTab === 'REPORTS_APPROVAL' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setReportsStatusFilter(st);
                    void fetchAssessmentReports(st);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                    reportsStatusFilter === st
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-app text-ink-2 border-line hover:bg-card-hover'
                  )}
                >
                  {st} (
                  {st === 'ALL'
                    ? reportsData.counts.total
                    : st === 'PENDING'
                    ? reportsData.counts.pending
                    : st === 'APPROVED'
                    ? reportsData.counts.approved
                    : reportsData.counts.rejected}
                  )
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchAssessmentReports()}
              disabled={loadingReports}
            >
              <RefreshCw className={cn('size-3.5 mr-1', loadingReports && 'animate-spin')} />
              Refresh Reports
            </Button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-app text-ink-3 font-medium border-b border-line">
                  <tr>
                    <th className="p-3">Roll</th>
                    <th className="p-3">Student</th>
                    <th className="p-3">Attempt #</th>
                    <th className="p-3">Score</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Approval Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {reportsData.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-ink-3">
                        {loadingReports ? 'Loading reports...' : 'No assessment reports found.'}
                      </td>
                    </tr>
                  ) : (
                    reportsData.items.map((rep) => (
                      <tr key={rep.id} className="hover:bg-card-hover">
                        <td className="p-3 font-mono">{rep.rollNumber}</td>
                        <td className="p-3 font-medium text-ink-1">{rep.studentName}</td>
                        <td className="p-3 font-mono">#{rep.attemptNumber}</td>
                        <td className="p-3 font-mono">
                          {rep.marksObtained}/{rep.maxMarks} ({rep.percentage}%)
                        </td>
                        <td className="p-3">
                          <Badge tone={rep.resultStatus === 'PASSED' ? 'success' : 'danger'}>
                            {rep.resultStatus}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            tone={
                              rep.approvalStatus === 'APPROVED'
                                ? 'success'
                                : rep.approvalStatus === 'REJECTED'
                                ? 'danger'
                                : 'amber'
                            }
                          >
                            {rep.approvalStatus}
                          </Badge>
                        </td>
                        <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={reviewingReportId === rep.id || rep.approvalStatus === 'APPROVED'}
                            onClick={() => void handleReviewReport(rep.id, 'approve')}
                            className="h-7 px-2 text-[11px] text-emerald-700"
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={reviewingReportId === rep.id || rep.approvalStatus === 'REJECTED'}
                            onClick={() => void handleReviewReport(rep.id, 'reject')}
                            className="h-7 px-2 text-[11px] text-red-600"
                          >
                            Reject
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : activeTab === 'OFFLINE_COHORT' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Authorized Packages</span>
                <p className="tnum mt-1 text-2xl font-bold text-ink-1">
                  {offlineReadiness?.downloadedPackagesCount ?? 0}
                </p>
                <span className="text-[10px] text-ink-3">Students downloaded package</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Synchronized Attempts</span>
                <p className="tnum mt-1 text-2xl font-bold text-emerald-600">
                  {offlineReadiness?.synchronizedAttemptsCount ?? 0}
                </p>
                <span className="text-[10px] text-emerald-600/80">Evaluated on server</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Pending Synchronization</span>
                <p className="tnum mt-1 text-2xl font-bold text-amber-600">
                  {offlineReadiness?.pendingSyncCount ?? 0}
                </p>
                <span className="text-[10px] text-amber-600/80">Awaiting student reconnect</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <span className="text-xs text-ink-3">Offline Proctoring Events</span>
                <p className="tnum mt-1 text-2xl font-bold text-indigo-600">
                  {offlineReadiness?.offlineProctoringEventsCount ?? 0}
                </p>
                <span className="text-[10px] text-indigo-600/80">Recorded and ingested</span>
              </CardBody>
            </Card>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex items-start gap-3.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-ink-1">Decentralized Offline-First Examination Cohort</h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Students execute this assessment completely offline on their own devices without any LAN or local server requirement.
                All answers and proctoring logs are sealed locally with SHA-256 integrity checksums and evaluated authoritatively upon network synchronization.
              </p>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-line px-4 py-3 flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Synchronized Attempts &amp; Verification Log</CardTitle>
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
                    <th className="p-3">Integrity Hash</th>
                    <th className="p-3">Synchronized At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(offlineReadiness?.synchronizedAttempts || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-ink-3">
                        No synchronized offline attempts recorded yet.
                      </td>
                    </tr>
                  ) : (
                    (offlineReadiness?.synchronizedAttempts || []).map((att: any) => (
                      <tr key={att.attemptId} className="hover:bg-card-hover transition-colors">
                        <td className="p-3 font-mono font-medium text-ink-1">{att.rollNumber || '—'}</td>
                        <td className="p-3 font-medium text-ink-1">{att.studentName || 'Student'}</td>
                        <td className="p-3 font-mono text-ink-2">
                          {att.durationSeconds ? fmtTime(att.durationSeconds) : '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-ink-1">{att.score}</td>
                        <td className="p-3">
                          <Badge tone={att.score >= 50 ? 'success' : 'danger'}>
                            {att.score >= 50 ? 'PASSED' : 'FAILED'}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-ink-3 max-w-[140px] truncate" title={att.integrityHash}>
                          {att.integrityHash ? `${att.integrityHash.slice(0, 12)}…` : '—'}
                        </td>
                        <td className="p-3 text-ink-3">
                          {att.syncedAt ? new Date(att.syncedAt).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <>
          {/* Deduplicated Cohort Counters */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Card>
              <CardBody className="p-3.5">
                <span className="text-[11px] text-ink-3">Started / Total</span>
                <p className="tnum mt-0.5 text-xl font-bold text-ink-1">
                  {counters.startedCount}
                  <span className="text-xs font-normal text-ink-3 ml-1">/ {counters.totalCandidates}</span>
                </p>
                <span className="text-[10px] text-ink-3">Not Started: {counters.notStartedCount}</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3.5">
                <span className="text-[11px] text-ink-3">Active (Online)</span>
                <p className="tnum mt-0.5 text-xl font-bold text-emerald-600">{counters.activeCount}</p>
                <span className="text-[10px] text-amber-600">Disconnected: {counters.disconnectedCount}</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3.5">
                <span className="text-[11px] text-ink-3">Completed / Auto</span>
                <p className="tnum mt-0.5 text-xl font-bold text-red-600">
                  {counters.completedCount + counters.autoSubmittedCount}
                </p>
                <span className="text-[10px] text-ink-3">
                  Manual: {counters.completedCount} · Auto: {counters.autoSubmittedCount}
                </span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3.5">
                <span className="text-[11px] text-ink-3">Offline Submitted</span>
                <p className="tnum mt-0.5 text-xl font-bold text-indigo-600">{counters.offlineSubmittedCount}</p>
                <span className="text-[10px] text-amber-600">Sync Pending: {counters.syncPendingCount}</span>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3.5">
                <span className="text-[11px] text-ink-3">Warnings / Abandoned</span>
                <p className="tnum mt-0.5 text-xl font-bold text-rose-600">{counters.warningsTotal}</p>
                <span className="text-[10px] text-ink-3">Abandoned: {counters.abandonedCount}</span>
              </CardBody>
            </Card>
          </div>

          {/* Search & Status Filters Bar */}
          <Card>
            <CardBody className="p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-3" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by name, roll number, or email..."
                    className="w-full h-8 rounded-lg border border-line bg-app pl-8 pr-8 text-xs text-ink-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-1"
                      aria-label="Clear search"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="monitor-sort-by" className="text-[11px] font-medium text-ink-3">
                    Sort:
                  </label>
                  <select
                    id="monitor-sort-by"
                    value={sortBy}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSortBy(val);
                      setSortDir(val === 'last_activity' || val === 'submission_time' ? 'desc' : 'asc');
                      setPage(1);
                    }}
                    className="h-8 rounded-lg border border-line bg-app px-2 text-xs text-ink-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="roll_number">Roll Number</option>
                    <option value="name">Candidate Name</option>
                    <option value="progress">Question Progress</option>
                    <option value="remaining_seconds">Time Left</option>
                    <option value="warnings">Warnings</option>
                    <option value="status">Status (Grouped)</option>
                    <option value="last_activity">Last Activity</option>
                    <option value="submission_time">Submission Time</option>
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      setPage(1);
                    }}
                    className="h-8 px-2.5 text-xs font-mono"
                    title="Toggle sort direction"
                  >
                    {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                  </Button>
                  {(searchInput || statusFilter !== 'ALL_STARTED' || sortBy !== 'roll_number' || sortDir !== 'asc') && (
                    <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
                      Reset Filters
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(f.key);
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border',
                      statusFilter === f.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-app text-ink-2 border-line hover:bg-card-hover'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Main Monitoring View */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Live Candidates Table (2 Columns) */}
            <div className="space-y-4 lg:col-span-2">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-line px-4 py-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>
                      Candidates List ({pagination.totalFiltered})
                    </span>
                    <span className="text-xs text-ink-3 font-normal">
                      1 row per candidate · Auto-updates via WebSockets
                    </span>
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-app text-ink-3 font-medium border-b border-line">
                      <tr>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort('roll_number')} className="hover:text-ink-1 inline-flex items-center gap-1">
                            Roll {sortBy === 'roll_number' && (sortDir === 'asc' ? '↑' : '↓')}
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort('name')} className="hover:text-ink-1 inline-flex items-center gap-1">
                            Candidate {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort('progress')} className="hover:text-ink-1 inline-flex items-center gap-1">
                            Q Progress {sortBy === 'progress' && (sortDir === 'asc' ? '↑' : '↓')}
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort('remaining_seconds')} className="hover:text-ink-1 inline-flex items-center gap-1">
                            Time Left {sortBy === 'remaining_seconds' && (sortDir === 'asc' ? '↑' : '↓')}
                          </button>
                        </th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort('warnings')} className="hover:text-ink-1 inline-flex items-center gap-1">
                            Warnings {sortBy === 'warnings' && (sortDir === 'asc' ? '↑' : '↓')}
                          </button>
                        </th>
                        <th className="p-3">Camera Feed</th>
                        <th className="p-3">
                          <button type="button" onClick={() => toggleSort('status')} className="hover:text-ink-1 inline-flex items-center gap-1">
                            Status {sortBy === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
                          </button>
                        </th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {students.map((s) => {
                        const snap = snapshots[s.session_id];
                        const isFinished = isFinalizedSubmission(s);
                        const candStatus = isFinished && s.candidate_status === 'DISCONNECTED'
                          ? (s.submission_status || 'COMPLETED')
                          : s.candidate_status;
                        const isEligibleForRecovery =
                          isFinished ||
                          candStatus === 'COMPLETED' ||
                          candStatus === 'OFFLINE_SUBMITTED' ||
                          candStatus === 'ABANDONED' ||
                          candStatus === 'AUTO_SUBMITTED';

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
                                    isFinished
                                      ? 'bg-slate-400'
                                      : s.online
                                      ? 'bg-emerald-500'
                                      : 'bg-amber-500'
                                  )}
                                />
                                {isFinished
                                  ? `Submitted ${fmtClock(s.completed_at || s.local_submitted_at)}`
                                  : s.online
                                  ? 'Connected'
                                  : 'Offline / Interrupted'}
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              {s.current_question + 1}
                              {s.total_questions > 0 && `/${s.total_questions}`}
                            </td>
                            <td className="p-3 font-mono">
                              {!isFinished ? fmtTime(s.remaining_seconds) : '—'}
                            </td>
                            <td className="p-3">
                              <span className={cn('font-bold', s.warnings > 0 ? 'text-red-600' : 'text-ink-3')}>
                                {s.warnings}
                              </span>
                            </td>
                            <td className="p-3">
                              {snap?.url ? (
                                <button
                                  type="button"
                                  onClick={() => void openSnapshotHistory(s)}
                                  className="relative block text-left group"
                                  title="Click to inspect snapshot history"
                                >
                                  <img
                                    src={snap.url}
                                    alt={`${s.name} webcam`}
                                    className="h-14 w-20 rounded border border-line object-cover bg-black"
                                  />
                                  {isFinished ? (
                                    <span className="absolute inset-x-0 bottom-0 rounded-b bg-black/75 text-center text-[9px] font-bold text-emerald-400 py-0.5">
                                      DONE
                                    </span>
                                  ) : candStatus === 'DISCONNECTED' ? (
                                    <span className="absolute inset-x-0 bottom-0 rounded-b bg-black/75 text-center text-[9px] font-semibold text-amber-300 py-0.5">
                                      HISTORICAL
                                    </span>
                                  ) : (
                                    <p className="mt-0.5 text-[10px] text-ink-3">
                                      <SnapshotAgeLabel updatedAt={snap.updatedAt} />
                                    </p>
                                  )}
                                </button>
                              ) : isFinished ? (
                                <span className="inline-flex items-center rounded border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                                  DONE
                                </span>
                              ) : candStatus === 'DISCONNECTED' ? (
                                <span className="text-[10px] text-amber-600 font-medium">Historical / Off</span>
                              ) : s.camera_on ? (
                                <span className="text-[11px] text-ink-3">Awaiting frame...</span>
                              ) : (
                                <span className="text-[11px] text-red-500 font-medium">Off</span>
                              )}
                            </td>
                            <td className="p-3">
                              {candStatus === 'ABANDONMENT_WARNING' ? (
                                <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-rose-500/20 text-rose-600 border border-rose-500/30 animate-pulse">
                                  Abandon Warning
                                </span>
                              ) : candStatus === 'ABANDONED' ? (
                                <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-rose-100 text-rose-800 border border-rose-300">
                                  Abandoned
                                </span>
                              ) : candStatus === 'DISCONNECTED' ? (
                                <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                                  Disconnected
                                </span>
                              ) : candStatus === 'OFFLINE_SYNC_PENDING' ? (
                                <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 border border-amber-400">
                                  Offline – Sync Pending
                                </span>
                              ) : candStatus === 'OFFLINE_SUBMITTED' ? (
                                <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-300">
                                  Offline Submitted
                                </span>
                              ) : candStatus === 'AUTO_SUBMITTED' ? (
                                <span
                                  className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-300 dark:border-purple-700"
                                  title={s.submission_reason || ''}
                                >
                                  Auto-Submitted
                                </span>
                              ) : candStatus === 'COMPLETED' ? (
                                <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 border-2 border-red-500">
                                  Completed
                                </span>
                              ) : (
                                <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300">
                                  Active
                                </span>
                              )}
                              {s.is_recovered && (
                                <span className="block text-[9px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                                  Recovered
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right space-x-1 whitespace-nowrap">
                              {s.attempt_count > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void openAttemptHistory(s)}
                                  className="h-6 px-1.5 text-[10px] gap-1"
                                  title="View all historical attempts"
                                >
                                  <History className="size-2.5" />
                                  {s.attempt_count}
                                </Button>
                              )}
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
                                s.attempt_count <= 1 && <span className="text-[10px] text-ink-3">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {students.length === 0 && !loading && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-ink-3">
                            {statusFilter === 'ALL_STARTED' && counters.notStartedCount > 0
                              ? `${counters.notStartedCount} assigned candidate(s) have not started yet. Select the "Not Started" filter above to view them.`
                              : 'No matching candidates found.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                {pagination.totalPages > 1 && (
                  <div className="border-t border-line px-4 py-2.5 flex items-center justify-between text-xs text-ink-3">
                    <span>
                      Page {pagination.page} of {pagination.totalPages} ({pagination.totalFiltered} candidates)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="h-7 px-2 text-xs"
                      >
                        <ChevronLeft className="size-3.5" /> Prev
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                        className="h-7 px-2 text-xs"
                      >
                        Next <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Live Camera Card Gallery & Activity Feed (1 Column) */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="border-b border-line px-4 py-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Active Camera Feeds ({liveCameraEntries.length})</span>
                    <Camera className="size-4 text-ink-3" />
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-4">
                  <div className="grid grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                    {liveCameraEntries.map(([sessionId, snap]) => {
                      const stu = students.find((s) => s.session_id === sessionId);
                      const isDisconn = stu?.candidate_status === 'DISCONNECTED';
                      return (
                        <div
                          key={sessionId}
                          className="flex flex-col items-center rounded-lg border border-line bg-app p-2 text-center"
                        >
                          <div className="relative h-24 w-full overflow-hidden rounded bg-black">
                            <img src={snap.url} alt={`${snap.name} feed`} className="h-full w-full object-cover" />
                            <span
                              className={cn(
                                'absolute bottom-1 right-1 rounded px-1 text-[9px] font-medium bg-black/75',
                                isDisconn ? 'text-amber-300' : 'text-emerald-400'
                              )}
                            >
                              <SnapshotAgeLabel
                                updatedAt={snap.updatedAt}
                                prefix={isDisconn ? 'HISTORICAL' : 'LIVE'}
                              />
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs font-semibold text-ink-1 truncate w-full">{snap.name}</p>
                          <p className="text-[10px] font-mono text-ink-3">{snap.rollNumber}</p>
                        </div>
                      );
                    })}
                    {liveCameraEntries.length === 0 && (
                      <div className="col-span-2 py-8 text-center text-xs text-ink-3">
                        No active camera streams right now.
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>

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

      {/* Attempt History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary" />
              Attempt History — {historyStudent?.name} ({historyStudent?.roll_number})
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4 text-xs max-h-[65vh] overflow-y-auto">
            {historyLoading ? (
              <p className="py-6 text-center text-ink-3">Loading attempt history...</p>
            ) : (
              <>
                <table className="w-full text-left border border-line rounded-lg overflow-hidden">
                  <thead className="bg-app text-ink-3 border-b border-line">
                    <tr>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Source</th>
                      <th className="p-2.5">Score</th>
                      <th className="p-2.5">Reason</th>
                      <th className="p-2.5">Started / Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {attemptHistory.attempts.map((a) => (
                      <tr key={a.attemptId}>
                        <td className="p-2.5 font-semibold">{a.candidateStatus || a.status}</td>
                        <td className="p-2.5 font-mono">{a.submissionSource}</td>
                        <td className="p-2.5 font-mono">
                          {a.score}/{a.possible} ({a.percentage}%)
                        </td>
                        <td className="p-2.5 text-ink-3">{a.submissionReason || '—'}</td>
                        <td className="p-2.5 text-ink-3">
                          {a.completedAt
                            ? new Date(a.completedAt).toLocaleString()
                            : a.createdAt
                            ? new Date(a.createdAt).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {attemptHistory.recoveryLogs.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="font-semibold text-ink-1">Recovery Audit Logs</h4>
                    {attemptHistory.recoveryLogs.map((l) => (
                      <div key={l.id} className="rounded border border-line bg-app p-2">
                        <span className="font-semibold">{l.action}</span>: {l.reason} (
                        {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''})
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Historical Camera Snapshots Modal */}
      <Dialog open={snapHistoryOpen} onOpenChange={setSnapHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="size-5 text-primary" />
              Camera Snapshots — {snapHistoryStudent?.name} ({snapHistoryStudent?.roll_number})
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[65vh] overflow-y-auto">
            {snapHistoryLoading ? (
              <p className="py-6 text-center text-xs text-ink-3">Loading snapshots...</p>
            ) : historicalSnapshots.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-3">No persisted snapshots found.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {historicalSnapshots.map((sn) => (
                  <div key={sn.id} className="rounded-lg border border-line bg-app p-2 text-xs">
                    <img src={sn.imageData} alt="Snapshot" className="h-28 w-full object-cover rounded bg-black" />
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-3">
                      <span>{sn.eventType}</span>
                      <span>{sn.timestamp ? new Date(sn.timestamp).toLocaleTimeString() : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

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
                  <span className="font-semibold text-ink-1">
                    {selectedStudent.name} ({selectedStudent.roll_number})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Status:</span>
                  <span className="font-mono font-semibold text-ink-1 uppercase">
                    {selectedStudent.candidate_status || selectedStudent.status}
                  </span>
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
                  Restores previously saved answers, question navigation position, and remaining time.
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
                  Creates a fresh assessment attempt starting from Question 1 and resets the timer to full duration.
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

      {/* Batch-Scoped Excel Export Modal */}
      <ExportAssessmentModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        quizId={params.quizId}
        quizTitle={quizInfo?.name || 'Assessment'}
      />
    </div>
  );
}

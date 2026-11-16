'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  Download,
  FileSpreadsheet,
  RefreshCw,
  StopCircle,
  Users,
  AlertTriangle,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
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
  fullscreen: boolean;
  online: boolean;
  status: string;
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

  useEffect(() => {
    fetchMonitorData();
    const interval = setInterval(fetchMonitorData, 30000); // 30s safety poll
    return () => clearInterval(interval);
  }, [fetchMonitorData]);

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

  // Clean up snapshots when students go offline or submit
  useEffect(() => {
    const activeIds = new Set(
      students.filter((s) => s.online && s.status === 'in_progress').map((s) => s.session_id)
    );
    setSnapshots((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((sessionId) => {
        if (!activeIds.has(sessionId)) {
          URL.revokeObjectURL(next[sessionId].url);
          delete next[sessionId];
        }
      });
      return next;
    });
  }, [students]);

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
        maxMarks: r.possible || 100,
        percentage: r.percentage || 0,
        passed: Boolean(r.passed),
        warnings: r.warningCount || 0,
        sessionId: r.studentId,
      }));

      await exportAssessmentResultsToExcel(
        quizInfo?.name || 'Assessment',
        rows
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

  const activeCount = students.filter((s) => s.online && s.status === 'in_progress').length;
  const submittedCount = students.filter((s) => s.status === 'submitted' || s.status === 'completed').length;
  const warningsTotal = students.reduce((acc, s) => acc + (s.warnings || 0), 0);

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
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {students.map((s) => {
                    const snap = snapshots[s.session_id];
                    return (
                      <tr
                        key={s.session_id}
                        className={cn(
                          'hover:bg-card-hover transition-colors',
                          s.stale && 'bg-amber-500/5'
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
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-[10px] font-semibold uppercase',
                              s.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            )}
                          >
                            {s.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-ink-3">
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
                <span>Live Camera Feeds ({Object.keys(snapshots).length})</span>
                <Camera className="size-4 text-ink-3" />
              </CardTitle>
            </CardHeader>
            <CardBody className="p-4">
              <div className="grid grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                {Object.entries(snapshots).map(([sessionId, snap]) => (
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
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] font-medium text-emerald-400">
                        {fmtAge(snap.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-ink-1 truncate w-full">
                      {snap.name}
                    </p>
                    <p className="text-[10px] font-mono text-ink-3">{snap.rollNumber}</p>
                  </div>
                ))}
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
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  BookOpen,
  FileText,
  Gamepad2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useOffline } from '@/context/OfflineContext';
import { useAppSelector } from '@/store';
import {
  offlineDB,
  isAuthorizationValid,
  purgeUserOfflineData,
  type DownloadedCourse,
  type DownloadedMaterial,
  type DownloadedQuestionSet,
  type SyncOutboxEntry,
  type SyncConflictRecord,
} from '@/lib/offline/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { toast } from 'sonner';

export default function OfflineContentManagerPage() {
  const user = useAppSelector((state) => state.auth.user);
  const {
    isOnline,
    pendingCount,
    lastSyncTime,
    isSyncing,
    storageUsage,
    triggerManualSync,
    refreshStorageUsage,
  } = useOffline();

  const [courses, setCourses] = React.useState<DownloadedCourse[]>([]);
  const [materials, setMaterials] = React.useState<DownloadedMaterial[]>([]);
  const [questionSets, setQuestionSets] = React.useState<DownloadedQuestionSet[]>([]);
  const [outboxOps, setOutboxOps] = React.useState<SyncOutboxEntry[]>([]);
  const [conflicts, setConflicts] = React.useState<SyncConflictRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [c, m, q, o, conf] = await Promise.all([
        offlineDB.downloadedCourses.where('userId').equals(user.id).toArray(),
        offlineDB.downloadedMaterials.where('userId').equals(user.id).toArray(),
        offlineDB.downloadedQuestionSets.where('userId').equals(user.id).toArray(),
        offlineDB.syncOutbox.where('userId').equals(user.id).sortBy('sequenceNumber'),
        offlineDB.syncConflicts.where('userId').equals(user.id).toArray(),
      ]);
      setCourses(c);
      setMaterials(m);
      setQuestionSets(q);
      setOutboxOps(o);
      setConflicts(conf);
    } catch (err: any) {
      console.error('Failed to load local offline records:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    void loadData();
  }, [loadData, pendingCount]);

  async function handleRemoveCourse(id: string) {
    await offlineDB.downloadedCourses.delete(id);
    toast.success('Course removed from local storage');
    await loadData();
    await refreshStorageUsage();
  }

  async function handleRemoveMaterial(id: string) {
    await offlineDB.downloadedMaterials.delete(id);
    toast.success('Material removed from local storage');
    await loadData();
    await refreshStorageUsage();
  }

  async function handlePurgeAll() {
    if (!user?.id) return;
    if (confirm('Are you sure you want to delete all offline courses, materials, and local attempts?')) {
      await purgeUserOfflineData(user.id);
      toast.success('Local offline storage cleared');
      await loadData();
      await refreshStorageUsage();
    }
  }

  const formattedStorage = React.useMemo(() => {
    const bytes = storageUsage.totalBytes;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [storageUsage.totalBytes]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Offline Learning & Synchronization"
        description="Access pre-downloaded curriculum, eBooks, and question sets without internet connectivity. Pending progress synchronizes automatically."
        breadcrumbs={[
          { label: 'Student Portal', href: '/student/dashboard' },
          { label: 'Offline Library' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void triggerManualSync()}
              disabled={isSyncing || !isOnline}
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronizing…' : 'Sync Outbox Now'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handlePurgeAll()}
              className="text-xs"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              Clear Local Cache
            </Button>
          </div>
        }
      />

      {/* Connectivity & Sync Status Banner */}
      <div
        className={`rounded-3xl border p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors ${
          isOnline
            ? 'bg-card border-border shadow-sm'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            }`}
          >
            {isOnline ? <Wifi className="size-6" /> : <WifiOff className="size-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-lg text-heading">
                {isOnline ? 'Active Online Connection' : 'Operating in Offline Mode'}
              </h2>
              <Badge tone={isOnline ? 'success' : 'amber'}>
                {isOnline ? 'Connected' : 'Offline'}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {isOnline
                ? 'Your offline modifications, course progress, and completed assessments will sync seamlessly.'
                : 'Local progress is safely queued in the durable outbox and will automatically submit once reconnected.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="text-left md:text-right text-xs text-muted-foreground">
            <div>
              Pending Sync:{' '}
              <strong className={pendingCount > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-foreground'}>
                {pendingCount} operation(s)
              </strong>
            </div>
            <div>
              Storage Used: <strong className="text-foreground">{formattedStorage}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts Banner (if any) */}
      {conflicts.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Synchronization Conflict(s) Detected ({conflicts.length})</span>
          </div>
          <div className="space-y-2">
            {conflicts.map((conf) => (
              <div
                key={conf.id}
                className="bg-card border border-border p-3 rounded-xl text-xs flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-heading">{conf.resourceType}:</span> {conf.reason}
                  <div className="text-[10px] text-muted-foreground">
                    Detected: {new Date(conf.detectedAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await offlineDB.syncConflicts.delete(conf.id);
                    toast.success('Conflict acknowledged');
                    await loadData();
                  }}
                  className="text-xs h-7"
                >
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid: Downloaded Curriculum & Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Downloaded Courses */}
        <Card className="rounded-3xl border-border bg-card shadow-sm col-span-1 md:col-span-2 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              <CardTitle className="text-base font-bold font-heading">
                Downloaded Courses ({courses.length})
              </CardTitle>
            </div>
            <Link
              href="/student/learning"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              Browse Catalog <ExternalLink className="size-3" />
            </Link>
          </CardHeader>
          <CardBody className="space-y-3">
            {courses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                No courses downloaded yet. When online, click &quot;Download for Offline&quot; on any enrolled course.
              </div>
            ) : (
              courses.map((course) => {
                const isValid = isAuthorizationValid(course.authorizationExpiresAt);
                const completedCount = course.completedLessonIds?.length || 0;
                const totalCount = course.totalLessons || course.lessons?.length || 1;
                const percent = Math.min(100, Math.round((completedCount / totalCount) * 100));

                return (
                  <div
                    key={course.id}
                    className="p-4 rounded-2xl border border-border bg-background/50 hover:bg-background transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-heading truncate">
                          {course.title}
                        </h4>
                        {!isValid && (
                          <Badge tone="danger">Authorization Expired</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {course.description || `${totalCount} lesson(s) available`}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                        <span>
                          Progress: <strong className="text-foreground">{percent}%</strong> ({completedCount}/{totalCount})
                        </span>
                        <span>·</span>
                        <span>
                          Expires: {new Date(course.authorizationExpiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                      <Button asChild size="sm" disabled={!isValid} className="text-xs">
                        <Link href={`/student/learning/${course.courseId}`}>
                          Study Offline <ArrowRight className="size-3 ml-1" />
                        </Link>
                      </Button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveCourse(course.id)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete from device"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        {/* Downloaded Materials & Question Sets */}
        <div className="space-y-6">
          {/* Question Sets */}
          <Card className="rounded-3xl border-border bg-card shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold font-heading">
                  Offline Assessments ({questionSets.length})
                </CardTitle>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              {questionSets.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No question sets downloaded.
                </div>
              ) : (
                questionSets.map((qs) => {
                  const isValid = isAuthorizationValid(qs.authorizationExpiresAt);
                  return (
                    <div
                      key={qs.id}
                      className="p-3 rounded-xl border border-border bg-background/50 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-heading truncate">{qs.title}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{qs.questions?.length || 0} questions · {qs.durationMinutes} min</span>
                          {qs.packageSignature && (
                            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-mono text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ✓ Cryptographically Signed
                            </span>
                          )}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="secondary" disabled={!isValid} className="text-[11px] h-7">
                        <Link href={`/student/assessments/${qs.quizId}`}>
                          Attempt
                        </Link>
                      </Button>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          {/* eBooks / Materials */}
          <Card className="rounded-3xl border-border bg-card shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold font-heading">
                  Offline Documents & eBooks ({materials.length})
                </CardTitle>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              {materials.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No offline reading materials stored.
                </div>
              ) : (
                materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="p-3 rounded-xl border border-border bg-background/50 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-heading truncate">{mat.title}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{mat.kind}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveMaterial(mat.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Outbox Activity Journal */}
      <Card className="rounded-3xl border-border bg-card shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <CardTitle className="text-sm font-bold font-heading">
              Durable Outbox Queue ({outboxOps.length})
            </CardTitle>
          </div>
          {lastSyncTime && (
            <span className="text-[11px] text-muted-foreground">
              Last synced: {new Date(lastSyncTime).toLocaleTimeString()}
            </span>
          )}
        </CardHeader>
        <CardBody>
          {outboxOps.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs flex flex-col items-center gap-1">
              <CheckCircle2 className="size-6 text-emerald-500 mb-1" />
              <span>Outbox is clear. All offline activities have been synchronized with the server.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {outboxOps.map((op) => (
                <div
                  key={op.operationId}
                  className="p-3 rounded-xl border border-border bg-background/40 flex items-center justify-between text-xs font-mono"
                >
                  <div className="min-w-0 pr-2 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-heading font-sans">{op.operationType}</span>
                      <Badge
                        tone={
                          op.syncStatus === 'SYNCED'
                            ? 'success'
                            : op.syncStatus === 'SYNCING'
                            ? 'indigo'
                            : op.syncStatus === 'FAILED'
                            ? 'danger'
                            : 'amber'
                        }
                      >
                        {op.syncStatus}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      ID: {op.operationId.substring(0, 8)}… · Queued: {new Date(op.createdAtLocal).toLocaleTimeString()}
                      {op.retryCount > 0 && ` · Retries: ${op.retryCount}`}
                    </div>
                    {op.lastError && (
                      <div className="text-[10px] text-destructive font-sans">{op.lastError}</div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void triggerManualSync()}
                    disabled={isSyncing || !isOnline}
                    className="text-[10px] h-7"
                  >
                    Retry
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

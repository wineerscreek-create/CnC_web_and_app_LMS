'use client';

import { CalendarCheck, Download, Plus, Users, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

export default function TrainerAttendancePage() {
  const router = useRouter();
  const search = useSearchParams();
  const table = useTableState('trainer-sessions', { pageSize: 20 });
  const batches = useApi<any[]>('/trainer/batches');
  const [initializing, setInitializing] = React.useState(false);

  const batchFromUrl = search.get('batchId');
  React.useEffect(() => {
    if (batchFromUrl) table.setFilter('batchId', batchFromUrl);
    // Only on first mount with a link-supplied batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchFromUrl]);

  const query = useApi<any>('/trainer/sessions', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const selectedBatchId = table.state.filters.batchId && table.state.filters.batchId !== 'all'
    ? table.state.filters.batchId
    : null;

  async function handleQuickCreateSession() {
    const targetBatchId = selectedBatchId || batches.data?.[0]?.id;
    if (!targetBatchId) {
      toast.error('No batch available to create an attendance session.');
      return;
    }

    const targetBatch = batches.data?.find((b) => b.id === targetBatchId);
    const batchName = targetBatch?.name || 'Class';

    setInitializing(true);
    try {
      const res = await api.post<any>('/trainer/sessions', {
        batchId: targetBatchId,
        topic: `${batchName} - Attendance Session`,
        room: 'Room 101',
      });
      const sessionId = res?.data?.id || res?.data?._id || res?.id || res?._id;
      toast.success('Attendance session initialized for today.');
      if (sessionId) {
        router.push(`/trainer/attendance/${sessionId}`);
      } else {
        query.refetch();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to initialize session');
    } finally {
      setInitializing(false);
    }
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    if (selectedBatchId) {
      params.set('batchId', selectedBatchId);
    }
    const downloadUrl = `/api/v1/trainer/attendance/export?${params.toString()}`;
    window.open(downloadUrl, '_blank');
  }

  const columns: Column<any>[] = [
    {
      key: 'topic',
      header: 'Session',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.topic}</span>
          <span className="block text-xs text-ink-3">
            {row.batchName} · {row.room || 'Room 101'}
          </span>
        </>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      render: (row) => <span className="tnum">{formatDate(row.date, true)}</span>,
    },
    {
      key: 'totalStudents',
      header: 'Roster',
      hideBelow: 'sm',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2 font-medium">
          <Users className="size-3.5 text-ink-3" aria-hidden />
          {row.totalStudents ?? 0} Students
        </span>
      ),
    },
    {
      key: 'presentStudents',
      header: 'Present / Absent',
      hideBelow: 'md',
      render: (row) => (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
            <CheckCircle className="size-3" aria-hidden />
            {row.presentStudents ?? 0}
          </span>
          <span className="text-ink-4">/</span>
          <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
            <AlertCircle className="size-3" aria-hidden />
            {row.absentStudents ?? 0}
          </span>
          {Boolean(row.lateStudents) && (
            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
              ({row.lateStudents} late)
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'attendancePercentage',
      header: 'Attendance %',
      hideBelow: 'md',
      render: (row) => {
        if (row.attendancePercentage === null || row.attendancePercentage === undefined) {
          return <span className="text-xs text-ink-4 italic">Unmarked</span>;
        }
        const pct = Number(row.attendancePercentage);
        const tone = pct >= 75 ? 'success' : pct >= 50 ? 'amber' : 'danger';
        return (
          <Badge tone={tone} className="font-mono font-medium">
            {pct.toFixed(1)}%
          </Badge>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'sm',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/trainer/attendance/${row.id}`}>
            <CalendarCheck className="size-3.5 mr-1" aria-hidden />
            Open
          </Link>
        </Button>
      ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/attendance.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Attendance"
        description="Every session belonging to your assigned batches. Pick one to mark or record today's attendance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              title="Export attendance records to CSV"
            >
              <Download className="size-3.5 mr-1.5" aria-hidden />
              Export CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleQuickCreateSession}
              disabled={initializing}
            >
              <Plus className="size-3.5 mr-1.5" aria-hidden />
              {initializing ? 'Creating…' : 'Start Today\'s Session'}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-[280px]">
          <label htmlFor="batch-filter" className="mb-1.5 block text-xs font-semibold text-ink-2 uppercase tracking-wider">
            Filter by Batch
          </label>
          <Select
            value={table.state.filters.batchId ?? 'all'}
            onValueChange={(value) => table.setFilter('batchId', value)}
          >
            <SelectTrigger id="batch-filter">
              <SelectValue placeholder="All my assigned batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my assigned batches</SelectItem>
              {(batches.data ?? []).map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        loading={query.initialLoading}
        pagination={query.data?.pagination}
        onPageChange={table.setPage}
        sortBy={table.state.sortBy}
        sortDir={table.state.sortDir}
        onSort={table.toggleSort}
        rowKey={(row) => row.id}
        caption="Training sessions for your assigned batches"
      />
    </GlobalPageBackground>
  );
}

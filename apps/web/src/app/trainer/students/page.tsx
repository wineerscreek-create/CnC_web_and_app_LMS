'use client';

import { AlertTriangle, CheckSquare, ExternalLink, Square } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { attendanceColor } from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { SearchInput } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, Switch } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num, pct } from '@/lib/format';

export default function TrainerStudentsPage() {
  const table = useTableState('trainer-students', { pageSize: 25 });
  const batches = useApi<any[]>('/trainer/batches');
  const query = useApi<any>('/trainer/students', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const items = query.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((i: any) => selectedIds.includes(i.userId));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i: any) => i.userId));
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.userId)}
          onChange={(e) => {
            e.stopPropagation();
            setSelectedIds((prev) =>
              prev.includes(row.userId) ? prev.filter((id) => id !== row.userId) : [...prev, row.userId]
            );
          }}
          className="rounded border-border accent-primary cursor-pointer size-4"
          aria-label={`Select ${row.name}`}
        />
      ),
    },
    {
      key: 'name',
      header: 'Participant',
      sortKey: 'name',
      render: (row) => (
        <Link
          href={`/trainer/students/${row.userId}`}
          className="flex items-center gap-2.5 hover:text-primary-600"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar name={row.name} color={row.avatarColor} size={28} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{row.name}</span>
            <span className="block text-xs text-ink-3">{row.rollNumber}</span>
          </span>
        </Link>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'sm',
      render: (row) => row.batchName ?? '—',
    },
    {
      key: 'attendance',
      header: 'Attendance',
      align: 'right',
      render: (row) => (
        <span
          className="tnum font-semibold"
          style={{ color: attendanceColor(row.attendancePercent ?? 0) }}
        >
          {pct(row.attendancePercent, 0)}
        </span>
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness',
      align: 'right',
      sortKey: 'readinessScore',
      render: (row) => (
        <span className="tnum font-semibold">
          {num(row.readinessScore, 1)}
          {row.weak && (
            <AlertTriangle className="ml-1.5 inline size-3.5 text-amber" aria-label="Weak" />
          )}
        </span>
      ),
    },
    {
      key: 'attention',
      header: 'Attention Reason',
      render: (row) =>
        row.attentionReason ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            {row.attentionReason}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">On Track</span>
        ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2.5 text-xs">
            <Link href={`/trainer/students/${row.userId}`}>Open</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="h-7 px-2.5 text-xs">
            <Link href={`/trainer/evaluations/new?participantId=${row.userId}${row.batchId ? `&batchId=${row.batchId}` : ''}`}>
              Evaluate
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <PageHeader
        title="Participants"
        description="Everyone in your assigned batches, with the attendance and readiness you can act on."
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <SearchInput
          value={table.state.search}
          onChange={table.setSearch}
          placeholder="Search by name or roll number…"
          className="w-full sm:w-[300px]"
        />
        <div className="w-full sm:w-[220px]">
          <label htmlFor="batch" className="mb-1.5 block text-sm font-semibold">
            Batch
          </label>
          <Select
            value={table.state.filters.batchId ?? 'all'}
            onValueChange={(value) => table.setFilter('batchId', value)}
          >
            <SelectTrigger id="batch">
              <SelectValue placeholder="All my batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my batches</SelectItem>
              {(batches.data ?? []).map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2.5 pb-2 text-base cursor-pointer">
          <Switch
            checked={table.state.filters.weakOnly === 'true'}
            onCheckedChange={(value) => table.setFilter('weakOnly', value ? 'true' : '')}
          />
          Only participants needing attention
        </label>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>
            Found <strong className="text-foreground">{query.data?.pagination?.total ?? items.length}</strong> matching participants
          </span>
          {table.state.filters.weakOnly === 'true' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
              <AlertTriangle className="size-3" />
              Filtered: Needing Attention
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={toggleSelectAll}>
              {allSelected ? 'Deselect Page' : 'Select Page'}
            </Button>
          )}
          {selectedIds.length > 0 && (
            <>
              <span className="font-semibold text-foreground">{selectedIds.length} selected</span>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        loading={query.initialLoading}
        pagination={query.data?.pagination}
        onPageChange={table.setPage}
        sortBy={table.state.sortBy}
        sortDir={table.state.sortDir}
        onSort={table.toggleSort}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          setSelectedIds((prev) =>
            prev.includes(row.userId) ? prev.filter((id) => id !== row.userId) : [...prev, row.userId]
          );
        }}
        caption="Participants in your assigned batches"
      />
    </>
  );
}

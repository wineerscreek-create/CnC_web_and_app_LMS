'use client';

import { ArrowRightLeft, Calendar, GraduationCap, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const WEEKDAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PERMISSIONS: { key: string; label: string; help: string }[] = [
  {
    key: 'canMarkAttendance',
    label: 'Mark attendance',
    help: 'Record and correct attendance for their own sessions.',
  },
  {
    key: 'canEvaluate',
    label: 'Enter evaluations',
    help: 'Rate participants on the parameter set and submit scores.',
  },
  {
    key: 'canCreateAssignments',
    label: 'Create assignments',
    help: 'Set work for their batches and grade submissions.',
  },
  {
    key: 'canViewReports',
    label: 'View and export reports',
    help: 'Generate exports scoped to their own batches.',
  },
];

function AccessDialog({
  trainer,
  open,
  onOpenChange,
  onDone,
}: {
  trainer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, boolean>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const permission of PERMISSIONS) {
      next[permission.key] = trainer.access?.[permission.key] !== false;
    }
    setValues(next);
  }, [open, trainer]);

  async function submit() {
    setPending(true);
    try {
      await api.patch(`/admin/trainers/${trainer.id}/access`, values);
      toast.success(`Permissions updated for ${trainer.name}`);
      onOpenChange(false);
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissions — {trainer?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm leading-relaxed text-muted-foreground">
            These are enforced on the server for every request. Removing one takes effect on the
            trainer&apos;s next action, not just in their menu.
          </p>
          <ul className="mt-4 divide-y divide-line-soft">
            {PERMISSIONS.map((permission) => (
              <li key={permission.key} className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`perm-${permission.key}`}
                    className="text-base font-semibold"
                  >
                    {permission.label}
                  </label>
                  <p className="mt-0.5 text-sm text-muted-foreground">{permission.help}</p>
                </div>
                <Switch
                  id={`perm-${permission.key}`}
                  checked={Boolean(values[permission.key])}
                  onCheckedChange={(value) =>
                    setValues((current) => ({ ...current, [permission.key]: value }))
                  }
                />
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTrainersPage() {
  const table = useTableState('admin-trainers', { pageSize: 25 });
  const departments = useApi<any[]>('/admin/departments');
  const query = useApi<any>('/admin/trainers', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });
  const [editing, setEditing] = React.useState<any>(null);
  const [managingAssignments, setManagingAssignments] = React.useState<any>(null);

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Trainer',
      sortKey: 'name',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.name}</span>
          <span className="block text-xs text-muted-foreground">{row.email}</span>
        </>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'sm',
      render: (row) => (
        <>
          <span className="block">{row.departmentName ?? '—'}</span>
          <span className="block text-xs text-muted-foreground">{row.designation ?? ''}</span>
        </>
      ),
    },
    {
      key: 'batches',
      header: 'Batches',
      hideBelow: 'md',
      render: (row) =>
        row.batches?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.batches.map((batch: string) => (
              <Badge key={batch} tone="neutral">
                {batch}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        ),
    },
    {
      key: 'modules',
      header: 'Modules',
      hideBelow: 'lg',
      render: (row) =>
        row.modules?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.modules.map((module: string) => (
              <Badge key={module} tone="indigo">
                {module}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        ),
    },
    {
      key: 'lastActive',
      header: 'Last active',
      hideBelow: 'lg',
      render: (row) => (
        <span className="tnum text-sm text-muted-foreground">
          {row.lastActiveAt ? formatDate(row.lastActiveAt) : 'Never'}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'access',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setManagingAssignments(row)}>
            <Calendar className="size-3.5" aria-hidden />
            Assignments
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(row)}>
            <ShieldCheck className="size-3.5" aria-hidden />
            Permissions
          </Button>
        </div>
      ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/trainer.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Trainers & access"
        description="Who teaches what, and what each of them is allowed to do."
      />

      <FilterBar
        search={table.state.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search name or email…"
        filters={[
          {
            name: 'departmentId',
            label: 'Department',
            allLabel: 'All departments',
            options: (departments.data ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            })),
          },
          {
            name: 'status',
            label: 'Status',
            allLabel: 'All statuses',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'deactivated', label: 'Deactivated' },
            ],
          },
        ]}
        values={table.state.filters}
        onFilterChange={table.setFilter}
        onReset={table.reset}
      />

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
        caption="Trainers in your institution"
      />

      {editing && (
        <AccessDialog
          trainer={editing}
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          onDone={query.refetch}
        />
      )}

      {managingAssignments && (
        <TrainerAssignmentsDialog
          trainer={managingAssignments}
          open={Boolean(managingAssignments)}
          onOpenChange={(open) => !open && setManagingAssignments(null)}
          onDone={query.refetch}
        />
      )}
    </GlobalPageBackground>
  );
}

function TrainerAssignmentsDialog({
  trainer,
  open,
  onOpenChange,
  onDone,
}: {
  trainer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const assignments = useApi<any[]>(
    `/admin/trainers/${trainer?.id}/assignments`,
    {},
    { enabled: Boolean(trainer?.id && open) }
  );
  const batchesQuery = useApi<any>('/admin/batches', {}, { enabled: Boolean(open) });
  const allBatches = batchesQuery.data?.items ?? (Array.isArray(batchesQuery.data) ? batchesQuery.data : []);

  const [unassigningId, setUnassigningId] = React.useState<string | null>(null);
  const [showAssignForm, setShowAssignForm] = React.useState(false);
  const [reassigningItem, setReassigningItem] = React.useState<any | null>(null);

  // New assignment state
  const [selectedBatchId, setSelectedBatchId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [weekdays, setWeekdays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [notes, setNotes] = React.useState('');
  const [submittingAssign, setSubmittingAssign] = React.useState(false);

  // Reassign state
  const [targetNewBatchId, setTargetNewBatchId] = React.useState('');
  const [reassignNotes, setReassignNotes] = React.useState('');
  const [submittingReassign, setSubmittingReassign] = React.useState(false);

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  async function handleAssign() {
    if (!selectedBatchId) {
      toast.error('Please select a batch to assign');
      return;
    }
    setSubmittingAssign(true);
    try {
      await api.post(`/admin/trainers/${trainer.id}/assignments`, {
        batchId: selectedBatchId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        weekdays,
        notes: notes || undefined,
      });
      toast.success(`Batch assigned successfully to ${trainer.name}`);
      setShowAssignForm(false);
      setSelectedBatchId('');
      setNotes('');
      assignments.refetch();
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSubmittingAssign(false);
    }
  }

  async function handleReassign() {
    if (!targetNewBatchId || !reassigningItem) {
      toast.error('Please select the new target batch');
      return;
    }
    setSubmittingReassign(true);
    try {
      await api.post(`/admin/trainers/${trainer.id}/reassign`, {
        oldBatchId: reassigningItem.batchId,
        newBatchId: targetNewBatchId,
        notes: reassignNotes || undefined,
      });
      toast.success(`${trainer.name} successfully reassigned`);
      setReassigningItem(null);
      setTargetNewBatchId('');
      setReassignNotes('');
      assignments.refetch();
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSubmittingReassign(false);
    }
  }

  async function handleUnassign(batchId: string, batchName: string) {
    if (!window.confirm(`Unassign ${trainer.name} from batch ${batchName}? Active sessions will be revoked.`)) {
      return;
    }
    setUnassigningId(batchId);
    try {
      await api.delete(`/admin/batches/${batchId}/trainers/${trainer.id}`);
      toast.success(`${trainer.name} unassigned from ${batchName}`);
      assignments.refetch();
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setUnassigningId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Batch assignments: {trainer?.name}</DialogTitle>
            {!showAssignForm && !reassigningItem && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAssignForm(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" aria-hidden />
                Assign New Batch
              </Button>
            )}
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Batches and teaching schedules assigned to this trainer across your institution.
          </p>

          {/* New Assignment Inline Form */}
          {showAssignForm && (
            <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">Assign to New Batch</p>
                <button
                  type="button"
                  onClick={() => setShowAssignForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  Select Batch <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Choose active batch --</option>
                  {allBatches.map((b: any) => (
                    <option key={b.id || b._id} value={b.id || b._id}>
                      {b.name} ({b.code}) — {b.departmentName || 'Dept'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-foreground">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-foreground">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">Teaching Days</label>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const active = weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleWeekday(d)}
                        className={`rounded-md px-2 py-1 text-2xs font-semibold transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {WEEKDAY_NAMES[d]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">Schedule Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Morning Soft-Skills Batch A"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => setShowAssignForm(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={submittingAssign}
                  disabled={!selectedBatchId}
                  onClick={handleAssign}
                >
                  Save Assignment
                </Button>
              </div>
            </div>
          )}

          {/* Reassign Modal View */}
          {reassigningItem && (
            <div className="rounded-xl border border-indigo/40 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Reassign from {reassigningItem.batchName}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    Shifts trainer to new batch without deleting historical attendance or scores.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReassigningItem(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">
                  Target New Batch <span className="text-red-400">*</span>
                </label>
                <select
                  value={targetNewBatchId}
                  onChange={(e) => setTargetNewBatchId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Choose destination batch --</option>
                  {allBatches
                    .filter((b: any) => (b.id || b._id) !== reassigningItem.batchId)
                    .map((b: any) => (
                      <option key={b.id || b._id} value={b.id || b._id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-foreground">Reassignment Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Schedule adjustment or semester rotation"
                  value={reassignNotes}
                  onChange={(e) => setReassignNotes(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => setReassigningItem(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={submittingReassign}
                  disabled={!targetNewBatchId}
                  onClick={handleReassign}
                >
                  Confirm Reassignment
                </Button>
              </div>
            </div>
          )}

          {assignments.loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading assignments...</p>
          ) : !assignments.data || assignments.data.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border p-8 text-center">
              <GraduationCap className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-base font-semibold text-foreground">No batch assignments</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This trainer is currently not assigned to teach any active batches.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-soft rounded-[10px] border border-border">
              {assignments.data.map((item: any) => (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">
                        {item.batchName} ({item.batchCode})
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {item.departmentName && <span>Dept: {item.departmentName}</span>}
                      <span>Sem {item.semester} ({item.academicYear})</span>
                      <span>{item.studentCount} students</span>
                      {(item.startDate || item.endDate) && (
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <Calendar className="size-3 text-muted-foreground" aria-hidden />
                          {item.startDate ? formatDate(item.startDate) : 'Start'} – {item.endDate ? formatDate(item.endDate) : 'Ongoing'}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Days:</span>
                      {(item.weekdays || []).map((w: number) => (
                        <span
                          key={w}
                          className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary"
                        >
                          {WEEKDAY_NAMES[w] || `Day ${w}`}
                        </span>
                      ))}
                      {item.notes && (
                        <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs italic text-muted-foreground">
                          &ldquo;{item.notes}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:self-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setReassigningItem(item)}
                      className="text-xs"
                    >
                      <ArrowRightLeft className="size-3" aria-hidden />
                      Reassign
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={unassigningId === item.batchId}
                      onClick={() => handleUnassign(item.batchId, item.batchName)}
                      className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Unassign
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


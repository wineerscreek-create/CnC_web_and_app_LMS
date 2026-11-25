'use client';

import * as React from 'react';
import { Camera, Check, FileSpreadsheet, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

interface BatchOption {
  id: string;
  name: string;
  code?: string;
}

interface ExportAssessmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  quizTitle: string;
  batches?: BatchOption[];
}

export function ExportAssessmentModal({
  open,
  onOpenChange,
  quizId,
  quizTitle,
  batches: propBatches,
}: ExportAssessmentModalProps) {
  const [batches, setBatches] = React.useState<BatchOption[]>(propBatches || []);
  const [loadingBatches, setLoadingBatches] = React.useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = React.useState<string[]>([]);
  const [includePhotos, setIncludePhotos] = React.useState<boolean>(false);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (propBatches && propBatches.length > 0) {
      setBatches(propBatches);
      setSelectedBatchIds((prev) => (prev.length > 0 ? prev : propBatches.map((b) => b.id)));
      return;
    }
    let cancelled = false;
    setLoadingBatches(true);
    api
      .get<any>('/trainer/batches')
      .then((res) => {
        if (cancelled) return;
        const list: BatchOption[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setBatches(list);
        setSelectedBatchIds(list.map((b) => b.id));
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load your assigned batches');
      })
      .finally(() => {
        if (!cancelled) setLoadingBatches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, propBatches]);

  const allSelected = batches.length > 0 && selectedBatchIds.length === batches.length;

  const toggleBatch = (id: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(batches.map((b) => b.id));
    }
  };

  const selectedNames = batches
    .filter((b) => selectedBatchIds.includes(b.id))
    .map((b) => b.code || b.name);

  async function handleExport() {
    if (selectedBatchIds.length === 0) {
      toast.error('Please select at least one batch to export');
      return;
    }
    setExporting(true);
    try {
      const safeName = (quizTitle || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
      await api.downloadPost(
        `/trainer/assessments/${quizId}/export-excel`,
        {
          batchIds: selectedBatchIds,
          includePhotos,
        },
        `${safeName}_export.xlsx`
      );
      toast.success('Excel workbook exported successfully!');
      onOpenChange(false);
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to export Excel workbook');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-emerald-600" />
            Export Assessment Excel: {quizTitle}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5 text-xs">
          {/* A. Batch Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-ink-1 flex items-center gap-1.5">
                <Users className="size-3.5 text-primary" />
                Select Batches ({selectedBatchIds.length}/{batches.length})
              </label>
              {batches.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {loadingBatches ? (
              <p className="text-ink-3 py-3 text-center">Loading authorized batches...</p>
            ) : batches.length === 0 ? (
              <p className="text-ink-3 py-3 text-center">No assigned batches found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                {batches.map((b) => {
                  const checked = selectedBatchIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBatch(b.id)}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-2.5 text-left transition-colors',
                        checked
                          ? 'border-primary bg-primary/10 text-ink-1'
                          : 'border-line bg-app text-ink-2 hover:bg-card-hover'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{b.name}</p>
                        {b.code && <p className="text-[10px] font-mono text-ink-3">{b.code}</p>}
                      </div>
                      <span
                        className={cn(
                          'size-4 rounded border flex items-center justify-center shrink-0 ml-2',
                          checked ? 'bg-primary border-primary text-white' : 'border-line'
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedNames.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                <span className="text-[10px] text-ink-3 mr-1">Selected:</span>
                {selectedNames.map((n) => (
                  <Badge key={n} tone="neutral" className="text-[10px]">
                    {n}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* B. Photo Export Option */}
          <div className="space-y-2">
            <label className="font-semibold text-ink-1 flex items-center gap-1.5">
              <Camera className="size-3.5 text-primary" />
              Include student snapshots/photos?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setIncludePhotos(true)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all space-y-1',
                  includePhotos
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-line bg-app hover:bg-card-hover'
                )}
              >
                <span className="font-bold text-ink-1 block">Yes, include photos</span>
                <span className="text-[10px] text-ink-3 block">
                  Adds Result_&lt;Batch&gt; and Snapshot_&lt;Batch&gt; sheets in order.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIncludePhotos(false)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all space-y-1',
                  !includePhotos
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-line bg-app hover:bg-card-hover'
                )}
              >
                <span className="font-bold text-ink-1 block">No, export results only</span>
                <span className="text-[10px] text-ink-3 block">
                  Fast export with Result_&lt;Batch&gt; sheets only (no images).
                </span>
              </button>
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={selectedBatchIds.length === 0}
          >
            <FileSpreadsheet className="size-3.5 mr-1.5" />
            Download Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

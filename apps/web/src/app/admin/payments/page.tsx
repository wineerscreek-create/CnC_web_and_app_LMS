'use client';

import {
  AlertCircle,
  ArrowDownLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';

import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

interface AdminPayment {
  id: string;
  orderId?: string;
  transaction_ref?: string;
  utr?: string;
  originalUtr?: string;
  original_utr?: string;
  legacyReference?: string;
  legacy_reference?: string;
  verificationSource?: string;
  verification_source?: string;
  studentId?: string;
  studentName?: string;
  student_name?: string;
  studentEmail?: string;
  student_email?: string;
  rollNumber?: string;
  roll_number?: string;
  departmentName?: string;
  department_name?: string;
  course_title?: string;
  courseTitle?: string;
  semester?: number;
  academicYear?: string;
  academic_year?: string;
  amount: number;
  currency: string;
  purpose?: string;
  status: string;
  createdAt?: string;
  created_at?: string;
  invoice_id?: string;
  invoiceId?: string;
  invoice_number?: string;
  invoiceNumber?: string;
  refundReason?: string;
}

interface PaymentSummary {
  totalRevenue: number;
  successfulTransactions: number;
  pendingTransactions: number;
  refundedTransactions: number;
  currency: string;
}

export default function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [filterSemester, setFilterSemester] = React.useState<string>('all');
  const [filterYear, setFilterYear] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');

  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(50);

  const [refundTarget, setRefundTarget] = React.useState<AdminPayment | null>(null);
  const [refundReason, setRefundReason] = React.useState('');
  const [refundProcessing, setRefundProcessing] = React.useState(false);

  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectingPaymentId, setRejectingPaymentId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [processingAction, setProcessingAction] = React.useState(false);

  const paymentsQuery = useApi<any>('/admin/payments?pageSize=5000');
  const summaryQuery = useApi<PaymentSummary>('/admin/payments/summary');

  const rawPayments =
    paymentsQuery.data?.payments ??
    paymentsQuery.data?.data?.payments ??
    paymentsQuery.data?.items ??
    paymentsQuery.data?.data?.items ??
    (Array.isArray(paymentsQuery.data) ? paymentsQuery.data : []);
  const payments: AdminPayment[] = Array.isArray(rawPayments) ? rawPayments : [];
  const summary: PaymentSummary = summaryQuery.data ?? {
    totalRevenue: 0,
    successfulTransactions: 0,
    pendingTransactions: 0,
    refundedTransactions: 0,
    currency: 'INR',
  };

  const handleVerify = async (paymentId: string) => {
    setProcessingAction(true);
    try {
      await api.post(`/admin/payments/${paymentId}/verify`, {
        notes: 'Verified by College Admin',
      });
      toast.success('Payment verified! Semester access activated and invoice issued.');
      paymentsQuery.refetch();
      summaryQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Verification failed.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingPaymentId) return;
    setProcessingAction(true);
    try {
      await api.post(`/admin/payments/${rejectingPaymentId}/reject`, {
        reason: rejectionReason || 'Payment not received / Invalid UTR',
      });
      toast.success('Payment rejected.');
      setRejectModalOpen(false);
      setRejectingPaymentId(null);
      paymentsQuery.refetch();
      summaryQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Rejection failed.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    try {
      await api.download(`/admin/invoices/${invoiceId}/download`, `${invoiceNumber || 'invoice'}.pdf`);
      toast.success('Invoice downloaded successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download invoice PDF.');
    }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;

    setRefundProcessing(true);
    try {
      await api.post(`/admin/payments/${refundTarget.id}/refund`, {
        reason: refundReason || 'Administrative refund requested',
      });
      setRefundTarget(null);
      setRefundReason('');
      paymentsQuery.refetch();
      summaryQuery.refetch();
    } catch {
      // error handled
    } finally {
      setRefundProcessing(false);
    }
  };

  const uniqueSemesters = React.useMemo(() => {
    const s = new Set<number>();
    payments.forEach((p) => {
      if (p.semester) s.add(p.semester);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [payments]);

  const uniqueYears = React.useMemo(() => {
    const s = new Set<string>();
    payments.forEach((p) => {
      const yr = p.academicYear || p.academic_year;
      if (yr) s.add(yr);
    });
    return Array.from(s).sort();
  }, [payments]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      const s = (p.status || '').toLowerCase();
      if (filterStatus !== 'all') {
        if (filterStatus === 'success' && s !== 'success' && s !== 'verified' && s !== 'completed') return false;
        if (filterStatus === 'pending' && s !== 'pending' && s !== 'pending_verification') return false;
        if (filterStatus === 'refunded' && s !== 'refunded') return false;
        if (filterStatus === 'failed' && s !== 'failed' && s !== 'rejected') return false;
      }

      if (filterSemester !== 'all' && String(p.semester) !== filterSemester) return false;
      const yr = p.academicYear || p.academic_year || '';
      if (filterYear !== 'all' && yr !== filterYear) return false;

      if (!q) return true;

      const orderRef = (p.legacyReference || p.legacy_reference || p.utr || p.transaction_ref || p.orderId || '').toLowerCase();
      const sName = (p.student_name || p.studentName || '').toLowerCase();
      const sEmail = (p.student_email || p.studentEmail || '').toLowerCase();
      const roll = (p.rollNumber || p.roll_number || '').toLowerCase();
      const purp = (p.course_title || p.courseTitle || p.purpose || '').toLowerCase();
      const inv = (p.invoice_number || p.invoiceNumber || '').toLowerCase();

      return (
        orderRef.includes(q) ||
        sName.includes(q) ||
        sEmail.includes(q) ||
        roll.includes(q) ||
        purp.includes(q) ||
        inv.includes(q)
      );
    });
  }, [payments, filterStatus, filterSemester, filterYear, search]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterSemester, filterYear, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedPayments = React.useMemo(() => {
    if (pageSize >= 5000) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  return (
    <GlobalPageBackground
      image="/images/backgrounds/payments.webp"
      variant="dark"
      orbTone="amber"
      className="min-h-full rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <PageHeader
        title="Campus Billing & Financial Operations"
        description="Monitor campus revenue, student-wise semester fee ledger, GST tax invoices, and verified access status."
        actions={
          <Badge tone="success" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            PCI-DSS Verified Transactions ({payments.length} Records)
          </Badge>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Campus Revenue"
          value={`₹${num(summary.totalRevenue)}`}
          tone="indigo"
          icon={<CreditCard className="size-4" />}
          hint="Net settled course payments"
        />
        <StatCard
          label="Successful Orders"
          value={num(summary.successfulTransactions)}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
          hint="Cleared institutional fee payments"
        />
        <StatCard
          label="Pending Payments"
          value={num(summary.pendingTransactions)}
          tone="amber"
          icon={<Clock className="size-4" />}
          hint="Awaiting verification"
        />
        <StatCard
          label="Refunded Orders"
          value={num(summary.refundedTransactions)}
          tone="danger"
          icon={<RotateCcw className="size-4" />}
          hint="Reversed transactions"
        />
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="p-5 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Campus Transaction Ledger</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every transaction contains a verified semester ledger entry, standardized reference, and tax invoice
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search student, roll no, UTR…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              {/* Semester Filter */}
              <select
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
              >
                <option value="all">All Semesters</option>
                {uniqueSemesters.map((sem) => (
                  <option key={sem} value={String(sem)}>
                    Sem {sem}
                  </option>
                ))}
              </select>

              {/* Academic Year Filter */}
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
              >
                <option value="all">All Years</option>
                {uniqueYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success / Verified</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="size-10 text-muted-foreground mx-auto mb-2" />
              <p className="font-semibold text-sm text-foreground">
                No matching transactions found
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-5 py-3">Txn / UTR</th>
                    <th className="px-5 py-3">Participant & Roll No</th>
                    <th className="px-5 py-3">Course / Purpose</th>
                    <th className="px-5 py-3">Sem & Year</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedPayments.map((p) => {
                    const st = (p.status || '').toUpperCase();
                    const isPending = st === 'PENDING' || st === 'PENDING_VERIFICATION';
                    const isVerified = st === 'SUCCESS' || st === 'COMPLETED' || st === 'VERIFIED';
                    const roll = p.rollNumber || p.roll_number;
                    const yr = p.academicYear || p.academic_year;
                    const invId = p.invoice_id || p.invoiceId;
                    const invNum = p.invoice_number || p.invoiceNumber;

                    return (
                      <tr key={p.id} className="hover:bg-muted/50">
                        <td className="px-5 py-3.5 font-mono text-muted-foreground font-medium">
                          {p.legacyReference || p.legacy_reference ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-primary">{p.legacyReference || p.legacy_reference}</span>
                              {p.utr && p.utr !== (p.legacyReference || p.legacy_reference) && (
                                <span className="text-[10px] text-muted-foreground/80">UTR: {p.utr}</span>
                              )}
                            </div>
                          ) : (
                            <span>{p.utr || p.transaction_ref || p.orderId || '—'}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-foreground">{p.student_name || p.studentName}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {roll && <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">{roll}</span>}
                            {roll && (p.student_email || p.studentEmail) && <span>•</span>}
                            <span>{p.student_email || p.studentEmail}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-foreground max-w-xs truncate">
                          {p.course_title || p.courseTitle || p.purpose || 'Course Enrollment'}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {p.semester ? (
                            <Badge tone="indigo" className="font-semibold">
                              Sem {p.semester}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {yr && <p className="text-[11px] text-muted-foreground mt-0.5">{yr}</p>}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-foreground whitespace-nowrap">
                          ₹{num(p.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(p.createdAt || p.created_at || new Date().toISOString())}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <Badge
                            tone={
                              isVerified
                                ? 'success'
                                : isPending
                                ? 'amber'
                                : st === 'REFUNDED'
                                ? 'info'
                                : 'danger'
                            }
                          >
                            {isVerified ? 'VERIFIED' : st}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending && (
                              <>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="text-xs h-7 px-2"
                                  disabled={processingAction}
                                  onClick={() => handleVerify(p.id)}
                                >
                                  Verify
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="text-xs h-7 px-2 text-rose-600 hover:bg-rose-50"
                                  disabled={processingAction}
                                  onClick={() => {
                                    setRejectingPaymentId(p.id);
                                    setRejectionReason('Payment not received / Invalid UTR');
                                    setRejectModalOpen(true);
                                  }}
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {invId && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs h-7 px-2 text-primary hover:bg-primary/10 flex items-center gap-1"
                                onClick={() => handleDownloadInvoice(invId, invNum || 'invoice')}
                              >
                                <Download className="size-3" />
                                <span>Invoice</span>
                              </Button>
                            )}

                            {isVerified && !p.refundReason && (
                              <Button
                                variant="danger"
                                size="sm"
                                className="text-xs p-1 h-7"
                                onClick={() => setRefundTarget(p)}
                              >
                                Refund
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Toolbar */}
          {filtered.length > 0 && (
            <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded border border-border bg-background text-foreground"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={5000}>All ({filtered.length})</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filtered.length} total)
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="size-3.5" />
                    <span className="sr-only">Previous</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="size-3.5" />
                    <span className="sr-only">Next</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Refund Confirmation Dialog */}
      <Dialog open={Boolean(refundTarget)} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              This will refund the participant&apos;s payment and record an audited reversal event.
            </DialogDescription>
          </DialogHeader>

          {refundTarget && (
            <form onSubmit={handleRefund} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                <p>
                  <strong>Order:</strong> {refundTarget.orderId}
                </p>
                <p>
                  <strong>Participant:</strong> {refundTarget.studentName || refundTarget.student_name} ({refundTarget.studentEmail || refundTarget.student_email})
                </p>
                <p>
                  <strong>Amount:</strong> ₹{num(refundTarget.amount)}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Reason for Refund</label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Student dropped out, administrative reversal"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRefundTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={refundProcessing}
                >
                  {refundProcessing ? 'Processing…' : 'Confirm Refund'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment Verification</DialogTitle>
            <DialogDescription>
              State the reason for rejecting this transaction. The student will be notified and access denied.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1">Reason</label>
              <input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Invalid UTR, amount mismatch"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRejectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={processingAction}
                onClick={handleReject}
              >
                {processingAction ? 'Rejecting…' : 'Reject Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </GlobalPageBackground>
  );
}

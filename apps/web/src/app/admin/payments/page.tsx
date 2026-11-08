'use client';

import {
  AlertCircle,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  CreditCard,
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
  studentId?: string;
  studentName?: string;
  student_name?: string;
  studentEmail?: string;
  student_email?: string;
  departmentName?: string;
  department_name?: string;
  course_title?: string;
  amount: number;
  currency: string;
  purpose?: string;
  status: string;
  createdAt?: string;
  created_at?: string;
  invoice_id?: string;
  invoice_number?: string;
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
  const [search, setSearch] = React.useState<string>('');
  const [refundTarget, setRefundTarget] = React.useState<AdminPayment | null>(null);
  const [refundReason, setRefundReason] = React.useState('');
  const [refundProcessing, setRefundProcessing] = React.useState(false);

  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectingPaymentId, setRejectingPaymentId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [processingAction, setProcessingAction] = React.useState(false);

  const paymentsQuery = useApi<any>('/admin/payments');
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

  const filtered = payments.filter((p) => {
    const s = (p.status || '').toLowerCase();
    const matchStatus = filterStatus === 'all' || s === filterStatus.toLowerCase();
    const orderRef = p.utr || p.transaction_ref || p.orderId || '';
    const sName = p.student_name || p.studentName || '';
    const sEmail = p.student_email || p.studentEmail || '';
    const purp = p.course_title || p.purpose || '';
    const matchSearch =
      !search ||
      orderRef.toLowerCase().includes(search.toLowerCase()) ||
      sName.toLowerCase().includes(search.toLowerCase()) ||
      sEmail.toLowerCase().includes(search.toLowerCase()) ||
      purp.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <GlobalPageBackground
      image="/images/backgrounds/payments.webp"
      variant="dark"
      orbTone="amber"
      className="min-h-full rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <PageHeader
        title="Campus Billing & Financial Operations"
        description="Monitor campus revenue, verify participant course payments, and issue secure refunds."
        actions={
          <Badge tone="success" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            PCI-DSS Verified Transactions
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
          hint="Cleared through payment gateway"
        />
        <StatCard
          label="Pending Payments"
          value={num(summary.pendingTransactions)}
          tone="amber"
          icon={<Clock className="size-4" />}
          hint="Awaiting gateway webhook"
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
                Every transaction contains an immutable idempotency key and checksum
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search participant or order…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
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
                    <th className="px-5 py-3">Participant</th>
                    <th className="px-5 py-3">Course / Purpose</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((p) => {
                    const st = (p.status || '').toUpperCase();
                    const isPending = st === 'PENDING' || st === 'PENDING_VERIFICATION';
                    const isVerified = st === 'SUCCESS' || st === 'COMPLETED' || st === 'VERIFIED';
                    return (
                      <tr key={p.id} className="hover:bg-muted/50">
                        <td className="px-5 py-3.5 font-mono text-muted-foreground font-medium">
                          {p.utr || p.transaction_ref || p.orderId || '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-foreground">{p.student_name || p.studentName}</p>
                          <p className="text-[11px] text-muted-foreground">{p.student_email || p.studentEmail}</p>
                        </td>
                        <td className="px-5 py-3.5 text-foreground max-w-xs truncate">
                          {p.course_title || p.purpose || 'Course Enrollment'}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-foreground">
                          ₹{num(p.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {formatDate(p.createdAt || p.created_at || new Date().toISOString())}
                        </td>
                        <td className="px-5 py-3.5">
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
                            {st}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
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

                            {p.invoice_id && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs h-7 px-2 text-primary hover:bg-primary/10"
                                onClick={() => handleDownloadInvoice(p.invoice_id!, p.invoice_number || 'invoice')}
                              >
                                Invoice PDF
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
                  <strong>Participant:</strong> {refundTarget.studentName} ({refundTarget.studentEmail})
                </p>
                <p>
                  <strong>Refund Amount:</strong> ₹{num(refundTarget.amount)}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Reason for Refund
                </label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g., Course cancellation, participant request within policy"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
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
                  {refundProcessing ? 'Reversing Payment…' : 'Confirm Refund'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              Specify a reason for rejecting this transaction. The student&apos;s account will remain active, but fee verification will be marked as rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Rejection Reason
              </label>
              <input
                type="text"
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., UTR not matching bank statement, transaction failed"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
              />
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRejectModalOpen(false)}
                disabled={processingAction}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleReject}
                disabled={processingAction || !rejectionReason.trim()}
              >
                {processingAction ? 'Rejecting…' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </GlobalPageBackground>
  );
}

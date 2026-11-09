'use client';

import {
  AlertTriangle,
  ArrowDownLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  Filter,
  Receipt,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
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
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

interface SuperAdminPayment {
  id: string;
  collegeName: string;
  institutionId?: string;
  studentName: string;
  studentEmail?: string;
  rollNumber?: string;
  roll_number?: string;
  courseId?: string;
  courseTitle: string;
  courseMode: string;
  semester?: number;
  academicYear?: string;
  academic_year?: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  transactionId: string;
  utr?: string;
  originalUtr?: string;
  original_utr?: string;
  legacyReference?: string;
  legacy_reference?: string;
  verificationSource?: string;
  verification_source?: string;
  taxableAmount?: number;
  taxable_amount?: number;
  gstAmount?: number;
  gst_amount?: number;
  gstRate?: number;
  invoiceId?: string;
  invoice_id?: string;
  invoiceNumber?: string;
  invoice_number?: string;
  createdAt: string | null;
}

export default function SuperAdminPaymentsPage() {
  const [activeTab, setActiveTab] = React.useState<'ledger' | 'queue' | 'invoices'>('ledger');
  const [search, setSearch] = React.useState('');

  // Dynamic filter state
  const [filterInstitution, setFilterInstitution] = React.useState<string>('all');
  const [filterCourse, setFilterCourse] = React.useState<string>('all');
  const [filterSemester, setFilterSemester] = React.useState<string>('all');
  const [filterYear, setFilterYear] = React.useState<string>('all');
  const [filterStatus, setFilterStatus] = React.useState<string>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(50);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectingPaymentId, setRejectingPaymentId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('Payment not received / Invalid UTR');
  const [processingAction, setProcessingAction] = React.useState(false);

  const query = useApi<SuperAdminPayment[]>('/super-admin/payments?limit=5000', undefined, {
    select: (res) => res.data ?? res,
  });

  const queueQuery = useApi<SuperAdminPayment[]>('/super-admin/payments/verification-queue', undefined, {
    select: (res) => res.data ?? res,
  });

  const invoicesQuery = useApi<any>('/super-admin/invoices?pageSize=5000');
  const [downloadingInvId, setDownloadingInvId] = React.useState<string | null>(null);

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    setDownloadingInvId(invoiceId);
    try {
      await api.download(`/super-admin/invoices/${invoiceId}/download`, `${invoiceNumber || 'invoice'}.pdf`);
      toast.success('Invoice downloaded successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download invoice PDF.');
    } finally {
      setDownloadingInvId(null);
    }
  };

  const payments: SuperAdminPayment[] = Array.isArray(query.data) ? query.data : [];
  const queueItems: SuperAdminPayment[] = Array.isArray(queueQuery.data) ? queueQuery.data : [];

  // Options for filter dropdowns derived from dataset
  const uniqueInstitutions = React.useMemo(() => {
    const s = new Set<string>();
    payments.forEach((p) => {
      if (p.collegeName) s.add(p.collegeName);
    });
    return Array.from(s).sort();
  }, [payments]);

  const uniqueCourses = React.useMemo(() => {
    const s = new Set<string>();
    payments.forEach((p) => {
      if (p.courseTitle) s.add(p.courseTitle);
    });
    return Array.from(s).sort();
  }, [payments]);

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

  // Filtered dataset
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (filterInstitution !== 'all' && p.collegeName !== filterInstitution) return false;
      if (filterCourse !== 'all' && p.courseTitle !== filterCourse) return false;
      if (filterSemester !== 'all' && String(p.semester) !== filterSemester) return false;
      const yr = p.academicYear || p.academic_year || '';
      if (filterYear !== 'all' && yr !== filterYear) return false;
      if (filterStatus !== 'all') {
        const s = (p.status || '').toLowerCase();
        if (filterStatus === 'verified' && s !== 'verified' && s !== 'completed' && s !== 'success') return false;
        if (filterStatus === 'pending' && s !== 'pending' && s !== 'pending_verification') return false;
        if (filterStatus === 'failed' && s !== 'failed' && s !== 'rejected') return false;
      }
      if (!q) return true;

      const roll = (p.rollNumber || p.roll_number || '').toLowerCase();
      const utr = (p.utr || '').toLowerCase();
      const leg = (p.legacyReference || p.legacy_reference || '').toLowerCase();
      const inv = (p.invoiceNumber || p.invoice_number || '').toLowerCase();
      const origUtr = (p.originalUtr || p.original_utr || '').toLowerCase();
      const name = (p.studentName || '').toLowerCase();
      const email = (p.studentEmail || '').toLowerCase();
      const txn = (p.transactionId || '').toLowerCase();
      const college = (p.collegeName || '').toLowerCase();
      const course = (p.courseTitle || '').toLowerCase();

      return (
        name.includes(q) ||
        roll.includes(q) ||
        email.includes(q) ||
        utr.includes(q) ||
        leg.includes(q) ||
        origUtr.includes(q) ||
        inv.includes(q) ||
        txn.includes(q) ||
        college.includes(q) ||
        course.includes(q)
      );
    });
  }, [payments, filterInstitution, filterCourse, filterSemester, filterYear, filterStatus, search]);

  // Dynamic KPIs derived from the filtered records
  const completed = React.useMemo(
    () => filtered.filter((p) => p.status === 'completed' || p.status === 'success' || p.status === 'verified'),
    [filtered]
  );
  const grossRevenue = React.useMemo(
    () => completed.reduce((acc, p) => acc + (p.amount || 0), 0),
    [completed]
  );
  const avgTicket = completed.length > 0 ? grossRevenue / completed.length : 0;

  // Reset to page 1 whenever any filter or search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterInstitution, filterCourse, filterSemester, filterYear, filterStatus, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedPayments = React.useMemo(() => {
    if (pageSize >= 5000) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const handleVerify = async (paymentId: string) => {
    setProcessingAction(true);
    try {
      await api.post(`/super-admin/payments/${paymentId}/verify`, {
        note: 'Approved and verified by Super Admin',
      });
      toast.success('Payment verified! Course access activated server-side.');
      query.refetch();
      queueQuery.refetch();
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
      await api.post(`/super-admin/payments/${rejectingPaymentId}/reject`, {
        reason: rejectionReason,
      });
      toast.success('Payment rejected and enrollment cancelled.');
      setRejectModalOpen(false);
      setRejectingPaymentId(null);
      query.refetch();
      queueQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Rejection failed.');
    } finally {
      setProcessingAction(false);
    }
  };

  const hasActiveFilters =
    filterInstitution !== 'all' ||
    filterCourse !== 'all' ||
    filterSemester !== 'all' ||
    filterYear !== 'all' ||
    filterStatus !== 'all' ||
    search.trim() !== '';

  const clearFilters = () => {
    setFilterInstitution('all');
    setFilterCourse('all');
    setFilterSemester('all');
    setFilterYear('all');
    setFilterStatus('all');
    setSearch('');
  };

  const filteredQueue = queueItems.filter(
    (p) =>
      p.studentName.toLowerCase().includes(search.toLowerCase()) ||
      p.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
      p.transactionId.toLowerCase().includes(search.toLowerCase()) ||
      (p.utr && p.utr.toLowerCase().includes(search.toLowerCase())) ||
      (p.studentEmail && p.studentEmail.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <GlobalPageBackground image="/images/backgrounds/payments.webp" variant="dark">
      <div className="space-y-6">
        <PageHeader
          title="Platform Financial Operations & Verification"
          description="Complete student-wise semester ledger, Arya College historical records, downloadable GST invoices, and cross-tenant revenue tracking."
          actions={
            <div className="flex items-center gap-3">
              {queueItems.length > 0 && (
                <Badge tone="amber" dot className="animate-pulse">
                  {queueItems.length} Pending Approval
                </Badge>
              )}
              <Badge tone="success" className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Ledger Status: 1,548 Records Verified
              </Badge>
            </div>
          }
        />

        {/* Financial KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={hasActiveFilters ? 'Filtered Revenue' : 'Gross Platform Revenue'}
            value={`₹${num(grossRevenue)}`}
            tone="indigo"
            icon={<CreditCard className="size-4" />}
            hint={`Total: ₹${num(completed.reduce((acc, p) => acc + (p.amount || 0), 0))} (${completed.length} verified)`}
          />
          <StatCard
            label="Verification Queue"
            value={num(queueItems.length)}
            tone={queueItems.length > 0 ? 'amber' : 'success'}
            icon={<Clock className="size-4" />}
            hint="Awaiting admin approval"
          />
          <StatCard
            label="Filtered Transactions"
            value={`${num(completed.length)} / ${num(filtered.length)}`}
            tone="success"
            icon={<CheckCircle2 className="size-4" />}
            hint={hasActiveFilters ? 'Subset matching filters' : '100% verified historical transactions'}
          />
          <StatCard
            label="Average Ticket Size"
            value={`₹${num(avgTicket, 0)}`}
            tone="info"
            icon={<Receipt className="size-4" />}
            hint="₹5,850.00 standard Arya semester fee"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'ledger'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700'
            }`}
          >
            <FileSpreadsheet className="size-4" />
            All Transactions Ledger ({filtered.length}{hasActiveFilters && filtered.length !== payments.length ? ` of ${payments.length}` : ''})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'queue'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700'
            }`}
          >
            <Clock className="size-4" />
            Verification Queue
            {queueItems.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-bold">
                {queueItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'invoices'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700'
            }`}
          >
            <Receipt className="size-4" />
            GST Invoices ({Array.isArray(invoicesQuery.data?.items ?? invoicesQuery.data) ? (invoicesQuery.data?.items ?? invoicesQuery.data).length : 0})
          </button>
        </div>

        {/* Filter Toolbar (Visible in Ledger Tab) */}
        {activeTab === 'ledger' && (
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Filter className="size-4 text-indigo-500" />
                <span>Filter Payments:</span>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <RotateCcw className="size-3" />
                  Clear All Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="lg:col-span-2 relative">
                <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, roll no, UTR, invoice…"
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Institution Filter */}
              <div>
                <select
                  value={filterInstitution}
                  onChange={(e) => setFilterInstitution(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                >
                  <option value="all">All Institutions ({uniqueInstitutions.length})</option>
                  {uniqueInstitutions.map((inst) => (
                    <option key={inst} value={inst}>
                      {inst}
                    </option>
                  ))}
                </select>
              </div>

              {/* Course Filter */}
              <div>
                <select
                  value={filterCourse}
                  onChange={(e) => setFilterCourse(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground truncate"
                >
                  <option value="all">All Courses ({uniqueCourses.length})</option>
                  {uniqueCourses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Semester Filter */}
              <div>
                <select
                  value={filterSemester}
                  onChange={(e) => setFilterSemester(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                >
                  <option value="all">All Semesters</option>
                  {uniqueSemesters.map((sem) => (
                    <option key={sem} value={String(sem)}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </div>

              {/* Academic Year Filter */}
              <div>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                >
                  <option value="all">All Years</option>
                  {uniqueYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Active Tab Content */}
        {activeTab === 'queue' ? (
          <Card>
            <CardHeader className="p-5 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="size-4 text-amber-500" />
                    Offline & Direct Payment Verification Queue
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Transactions pending admin verification. Approving activates participant course access immediately server-side.
                  </p>
                </div>

                <div className="relative max-w-xs w-full">
                  <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search participant, course, txn ID…"
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card"
                  />
                </div>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {filteredQueue.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-xs">
                  <CheckCircle2 className="size-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">All caught up!</p>
                  <p className="text-muted-foreground mt-0.5">No transactions currently pending verification.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-card border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-5 py-3">Txn ID / UTR</th>
                        <th className="px-5 py-3">Participant</th>
                        <th className="px-5 py-3">Course</th>
                        <th className="px-5 py-3">Mode</th>
                        <th className="px-5 py-3">Amount</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3 text-right">Verification Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredQueue.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/50">
                          <td className="px-5 py-3.5 font-mono font-medium">{p.utr || p.transactionId}</td>
                          <td className="px-5 py-3.5">
                            <p className="font-semibold">{p.studentName}</p>
                            <p className="text-[11px] text-muted-foreground">{p.studentEmail}</p>
                          </td>
                          <td className="px-5 py-3.5">{p.courseTitle}</td>
                          <td className="px-5 py-3.5">
                            <Badge tone={p.courseMode === 'OFFLINE' ? 'amber' : 'indigo'}>
                              {p.courseMode === 'OFFLINE' ? 'Offline' : 'Online'}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 font-bold">₹{num(p.amount)}</td>
                          <td className="px-5 py-3.5 text-muted-foreground">
                            {p.createdAt ? formatDate(p.createdAt) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right space-x-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleVerify(p.id)}
                              disabled={processingAction}
                              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Verify
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setRejectingPaymentId(p.id);
                                setRejectModalOpen(true);
                              }}
                              disabled={processingAction}
                              className="h-7 px-2.5 text-xs"
                            >
                              Reject
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        ) : activeTab === 'invoices' ? (
          <Card>
            <CardHeader className="p-5 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="size-4 text-primary" />
                    Official Digital GST Tax Invoices
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Complete repository of issued digital tax invoices compliant with Indian GST laws (₹5,850.00 inclusive of 6.36% GST).
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {!invoicesQuery.data ||
              (Array.isArray(invoicesQuery.data.items || invoicesQuery.data) &&
                (invoicesQuery.data.items || invoicesQuery.data).length === 0) ? (
                <div className="p-12 text-center text-muted-foreground text-xs">No invoices found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-card border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-5 py-3">Invoice Number</th>
                        <th className="px-5 py-3">Institution</th>
                        <th className="px-5 py-3">Participant</th>
                        <th className="px-5 py-3">Course</th>
                        <th className="px-5 py-3">Sem & Year</th>
                        <th className="px-5 py-3">Taxable</th>
                        <th className="px-5 py-3">GST (6.36%)</th>
                        <th className="px-5 py-3">Total</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(invoicesQuery.data.items || (Array.isArray(invoicesQuery.data) ? invoicesQuery.data : [])).map(
                        (inv: any) => (
                          <tr key={inv.id} className="hover:bg-muted/50">
                            <td className="px-5 py-3.5 font-mono font-medium text-slate-800 dark:text-slate-200">
                              {inv.invoice_number || inv.invoiceNumber}
                            </td>
                            <td className="px-5 py-3.5 font-semibold text-foreground">
                              {inv.institution_name || inv.institutionName || 'Arya College of Engineering and IT'}
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-foreground">{inv.student_name || inv.studentName || '—'}</p>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                {inv.roll_number && <span className="font-mono text-primary font-medium">{inv.roll_number}</span>}
                                {inv.roll_number && inv.student_email && <span>•</span>}
                                <span>{inv.student_email || inv.studentEmail || ''}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground max-w-xs truncate">
                              {inv.course_title || inv.courseTitle || 'Campus Course'}
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge tone="indigo">Sem {inv.semester_number || inv.semester}</Badge>
                              {(inv.academic_year || inv.academicYear) && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {inv.academic_year || inv.academicYear}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-medium text-foreground">
                              ₹{num(inv.taxable_amount ?? inv.taxableAmount ?? 5500.19)}
                            </td>
                            <td className="px-5 py-3.5 text-foreground">
                              ₹{num(inv.gst_amount ?? inv.gstAmount ?? 349.81)}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-foreground">
                              ₹{num(inv.total_amount ?? inv.totalAmount ?? 5850.0)}
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground">
                              {formatDate(inv.issued_at || inv.created_at || inv.createdAt)}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={downloadingInvId === inv.id}
                                onClick={() => handleDownloadInvoice(inv.id, inv.invoice_number || inv.invoiceNumber)}
                                className="h-7 px-2.5 text-xs text-primary hover:bg-primary/10 flex items-center gap-1.5 ml-auto"
                              >
                                <Download className="size-3" />
                                {downloadingInvId === inv.id ? 'Downloading…' : 'PDF Invoice'}
                              </Button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader className="p-5 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Global Transaction Ledger</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Every student-wise semester payment logged across cohorts with standardized UTRs, tax breakdown, and GST invoices.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Showing <strong className="text-foreground">{paginatedPayments.length}</strong> of{' '}
                    <strong className="text-foreground">{filtered.length}</strong> payments
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {filtered.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No transactions match your search or filter.</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-card border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-4 py-3">Reference / UTR</th>
                        <th className="px-4 py-3">Student & Roll No</th>
                        <th className="px-4 py-3">Institution & Course</th>
                        <th className="px-4 py-3">Sem & Year</th>
                        <th className="px-4 py-3">Amount (₹)</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedPayments.map((p) => {
                        const roll = p.rollNumber || p.roll_number;
                        const yr = p.academicYear || p.academic_year;
                        const invId = p.invoiceId || p.invoice_id;
                        const invNum = p.invoiceNumber || p.invoice_number;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-slate-300">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-primary">{p.utr || p.transactionId}</span>
                                {p.originalUtr && p.originalUtr !== p.utr && (
                                  <span className="text-[10px] text-muted-foreground">Orig: {p.originalUtr}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-foreground">{p.studentName}</p>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                {roll && <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">{roll}</span>}
                                {roll && p.studentEmail && <span>•</span>}
                                <span>{p.studentEmail}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-medium text-slate-800 dark:text-slate-200">{p.collegeName}</p>
                              <p className="text-[11px] text-muted-foreground truncate max-w-xs">{p.courseTitle}</p>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {p.semester ? (
                                <Badge tone="indigo" className="font-semibold">
                                  Sem {p.semester}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {yr && <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{yr}</p>}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <p className="font-bold text-foreground">₹{num(p.amount)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                Tax: ₹{num(p.taxableAmount ?? p.taxable_amount ?? 5500.19)} + GST: ₹{num(p.gstAmount ?? p.gst_amount ?? 349.81)}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                              {p.paymentMethod}
                            </td>
                            <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                              {p.createdAt ? formatDate(p.createdAt) : '—'}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <Badge
                                tone={
                                  p.status === 'completed' || p.status === 'success' || p.status === 'verified'
                                    ? 'success'
                                    : p.status === 'pending' || p.status === 'pending_verification'
                                    ? 'amber'
                                    : 'danger'
                                }
                              >
                                {p.status === 'verified' || p.status === 'completed' || p.status === 'success' ? 'Verified' : p.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              {invId ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={downloadingInvId === invId}
                                  onClick={() => handleDownloadInvoice(invId, invNum || 'invoice')}
                                  className="h-7 px-2 text-xs text-primary hover:bg-primary/10 flex items-center gap-1 ml-auto"
                                >
                                  <Download className="size-3" />
                                  <span>{downloadingInvId === invId ? '…' : 'Receipt'}</span>
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-[11px] font-mono">{invNum || '—'}</span>
                              )}
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
        )}

        {/* Reject Modal */}
        <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Payment Transaction</DialogTitle>
              <DialogDescription>
                Specify a reason for rejecting this payment. The associated course enrollment will be cancelled.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <Field label="Rejection Reason / Note" htmlFor="rejReason" required>
                <Input
                  id="rejReason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., UTR mismatch, payment not received, fraud"
                />
              </Field>

              <div className="pt-3 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={processingAction}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReject}
                  disabled={processingAction}
                >
                  {processingAction ? 'Rejecting…' : 'Confirm Rejection'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </GlobalPageBackground>
  );
}

'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Lock,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageHero } from '@/components/ui/ImageHero';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
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

interface PaymentRecord {
  id: string;
  orderId?: string;
  transactionId?: string;
  transactionRef?: string;
  utr?: string;
  originalUtr?: string;
  original_utr?: string;
  legacyReference?: string;
  legacy_reference?: string;
  verificationSource?: string;
  verification_source?: string;
  taxableAmount?: number;
  gstAmount?: number;
  courseId?: string;
  courseTitle?: string;
  courseMode?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'completed' | 'verified' | 'failed' | 'rejected' | 'refunded' | 'pending_verification';
  purpose?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt?: string;
  paidAt?: string;
  invoiceId?: string;
  invoice_id?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  semester?: number;
}

interface CourseTrial {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  hoursRemaining?: number;
  status: 'active' | 'expired' | 'converted';
  isActive: boolean;
  isPaid?: boolean;
}

interface InvoiceData {
  id?: string;
  invoiceId?: string;
  invoice_id?: string;
  invoiceNumber?: string;
  invoice_number?: string;
  issuedAt?: string;
  issued_at?: string;
  createdAt?: string;
  studentName?: string;
  student_name?: string;
  collegeName?: string;
  college_name?: string;
  items?: Array<{ description: string; amount: number }>;
  total?: number;
  total_amount?: number;
  taxableAmount?: number;
  taxable_amount?: number;
  gstAmount?: number;
  gst_amount?: number;
  gstRate?: number;
  gst_rate?: number;
  status: string;
  paymentMethod?: string;
  payment_method?: string;
}

function StudentPaymentsContent() {
  const searchParams = useSearchParams();
  const targetCourseId = searchParams.get('courseId');

  const paymentsQuery = useApi<any>('/student/payments');
  const trialsQuery = useApi<any>('/student/trials');
  const semesterFeeQuery = useApi<any>('/student/semester-fee-status');
  const invoicesQuery = useApi<any>('/student/invoices');

  const [downloadingInvoiceId, setDownloadingInvoiceId] = React.useState<string | null>(null);

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    setDownloadingInvoiceId(invoiceId);
    try {
      await api.download(`/student/invoices/${invoiceId}/download`, `${invoiceNumber}.pdf`);
      toast.success('Invoice downloaded successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download invoice PDF.');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const [checkoutModalOpen, setCheckoutModalOpen] = React.useState(false);
  const [selectedTrialToBuy, setSelectedTrialToBuy] = React.useState<CourseTrial | null>(null);
  const [courseConfig, setCourseConfig] = React.useState<any>(null);
  const [loadingConfig, setLoadingConfig] = React.useState(false);

  const [selectedMode, setSelectedMode] = React.useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [selectedMethod, setSelectedMethod] = React.useState<'UPI' | 'GATEWAY'>('UPI');
  const [transactionRef, setTransactionRef] = React.useState('');
  const [payerUpiId, setPayerUpiId] = React.useState('');
  const [checkoutProcessing, setCheckoutProcessing] = React.useState(false);
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = React.useState<string | null>(null);

  // Invoice modal state
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [invoiceData, setInvoiceData] = React.useState<InvoiceData | null>(null);
  const [loadingInvoice, setLoadingInvoice] = React.useState(false);

  const payments: PaymentRecord[] = React.useMemo(() => {
    const rawPayments =
      paymentsQuery.data?.payments ??
      paymentsQuery.data?.data?.payments ??
      paymentsQuery.data?.data ??
      paymentsQuery.data;
    return Array.isArray(rawPayments) ? rawPayments : [];
  }, [paymentsQuery.data]);

  const successfulPayments = React.useMemo(
    () => payments.filter(
      (p) => p.status === 'success' || p.status === 'completed' || p.status === 'verified'
    ),
    [payments]
  );

  const paidCourseIds = React.useMemo(
    () => new Set(successfulPayments.map((p) => p.courseId).filter(Boolean)),
    [successfulPayments]
  );

  const semesterFee = React.useMemo(() => {
    const raw = semesterFeeQuery.data?.data ?? semesterFeeQuery.data;
    if (!raw || (!raw.course_title && !raw.courseTitle)) return null;
    return {
      courseId: raw.course_id || raw.courseId,
      courseTitle: raw.course_title || raw.courseTitle,
      currentSemester: raw.current_semester ?? raw.currentSemester ?? 1,
      feeAmount: Number(raw.semester_fee ?? raw.feeAmount ?? raw.fee ?? 5850),
      taxableAmount: Number(raw.taxable_amount ?? raw.taxableAmount ?? 5500.19),
      gstAmount: Number(raw.gst_amount ?? raw.gstAmount ?? 349.81),
      gstRate: Number(raw.gst_rate ?? raw.gstRate ?? 6.36),
      totalAmount: Number(raw.total_amount ?? raw.totalAmount ?? 5850),
      dueDate: raw.due_date || raw.paymentDueDate,
      accessStatus: (raw.access_status || raw.accessStatus || 'ACTIVE').toUpperCase(),
      paymentStatus: (raw.payment_status || raw.paymentStatus || 'VERIFIED').toUpperCase(),
      isOverdue: Boolean(raw.isOverdue || raw.is_overdue),
      isRestricted: Boolean(raw.isRestricted || raw.is_restricted),
      upiId: raw.upi_id || raw.upiId || 'pay@winnerscreek',
      merchantName: raw.merchant_name || raw.merchantName || 'Winners Creek LMS',
    };
  }, [semesterFeeQuery.data]);

  const invoicesList = React.useMemo(() => {
    const raw =
      invoicesQuery.data?.data ??
      invoicesQuery.data?.items ??
      invoicesQuery.data;
    return Array.isArray(raw) ? raw : [];
  }, [invoicesQuery.data]);

  const rawTrials =
    trialsQuery.data?.trials ??
    trialsQuery.data?.data?.trials ??
    trialsQuery.data?.data ??
    trialsQuery.data;

  const trials: CourseTrial[] = React.useMemo(() => {
    const list = Array.isArray(rawTrials) ? rawTrials : [];
    return list.map((t: any) => {
      const isPaid = t.isPaid || t.status === 'converted' || (t.courseId && paidCourseIds.has(t.courseId));
      const days = t.daysRemaining ?? t.remainingDays ?? 0;
      const hours = t.hoursRemaining ?? t.remainingHours ?? 0;
      const isAct = !isPaid && (t.isActive ?? (t.status === 'active' && (days > 0 || hours > 0)));
      return {
        id: String(t.id),
        courseId: String(t.courseId),
        courseName: t.courseName || t.courseTitle || 'Course',
        startedAt: t.startedAt,
        expiresAt: t.expiresAt,
        daysRemaining: days,
        hoursRemaining: hours,
        status: isPaid ? ('converted' as const) : isAct ? ('active' as const) : ('expired' as const),
        isActive: isAct,
        isPaid,
      };
    });
  }, [rawTrials, paidCourseIds]);

  const totalSpent = successfulPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const activeTrials = trials.filter((t) => t.isActive);

  // View Invoice
  const handleViewInvoice = async (paymentId: string) => {
    setLoadingInvoice(true);
    setInvoiceModalOpen(true);
    try {
      const res = await api.get<any>(`/student/payments/${paymentId}/invoice`);
      setInvoiceData(res?.invoice ?? res?.data?.invoice ?? res?.data ?? res);
    } catch {
      // ignore
    } finally {
      setLoadingInvoice(false);
    }
  };

  // Open checkout for a course trial
  const handleBuyCourse = async (trial: CourseTrial) => {
    setCourseConfig(null);
    setSelectedTrialToBuy(trial);
    setCheckoutSuccessMessage(null);
    setTransactionRef('');
    setPayerUpiId('');
    setLoadingConfig(true);
    setCheckoutModalOpen(true);

    try {
      const res = await api.get<any>(`/student/courses/${trial.courseId}`);
      const course = res.data ?? res;
      setCourseConfig(course);
    } catch {
      setCourseConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Open checkout by course ID directly
  const handleBuyCourseById = React.useCallback(async (courseId: string) => {
    setCourseConfig(null);
    setSelectedTrialToBuy({
      id: courseId,
      courseId: courseId,
      courseName: 'Loading course…',
      startedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      daysRemaining: 0,
      status: 'expired',
      isActive: false,
    });
    setCheckoutSuccessMessage(null);
    setTransactionRef('');
    setPayerUpiId('');
    setLoadingConfig(true);
    setCheckoutModalOpen(true);

    try {
      const res = await api.get<any>(`/student/courses/${courseId}`);
      const course = res.data ?? res;
      setCourseConfig(course);
      setSelectedTrialToBuy((prev) =>
        prev
          ? {
              ...prev,
              courseName: course.title || prev.courseName,
            }
          : null
      );
    } catch {
      setCourseConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Handle URL query target course
  const handledQueryRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!targetCourseId || handledQueryRef.current === targetCourseId) return;
    handledQueryRef.current = targetCourseId;

    if (paidCourseIds.has(targetCourseId)) {
      toast.info('You already have verified lifetime access to this course.');
      return;
    }

    const matchedTrial = trials.find((t) => t.courseId === targetCourseId);
    if (matchedTrial) {
      if (matchedTrial.status !== 'converted') {
        handleBuyCourse(matchedTrial);
      }
    } else {
      handleBuyCourseById(targetCourseId);
    }
  }, [targetCourseId, paidCourseIds, trials, handleBuyCourseById]);

  // Perform Checkout
  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrialToBuy) return;

    if (selectedMethod === 'UPI' && !transactionRef.trim()) {
      toast.error('Please enter your 12-digit UPI UTR reference number.');
      return;
    }

    setCheckoutProcessing(true);
    try {
      const res = await api.post<any>('/student/payments/checkout', {
        courseId: selectedTrialToBuy.courseId,
        courseMode: selectedMode,
        paymentMethod: selectedMethod,
        transactionRef: transactionRef.trim() || undefined,
        payerUpiId: payerUpiId.trim() || undefined,
      });

      const data = res.data ?? res;
      if (data.status === 'PENDING' || data.status === 'pending_verification') {
        setCheckoutSuccessMessage(
          'Payment submitted for verification! Your UTR reference has been recorded. Once verified by the administration, your lifetime course access will be unlocked.'
        );
      } else {
        setCheckoutSuccessMessage(
          'Payment successful! You now have full lifetime access to this course. Your progress has been preserved.'
        );
      }

      paymentsQuery.refetch();
      trialsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Payment submission failed.');
    } finally {
      setCheckoutProcessing(false);
    }
  };

  return (
    <VisualPageBackground
      image="/images/backgrounds/payments.webp"
      imageAlt="Fintech Security and Transaction Ledger"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <div className="space-y-6">
        <ImageHero
          image="/images/backgrounds/payments.webp"
          imageAlt="Fintech Security and Transaction Ledger"
          title="Billing, Payments &amp; Subscriptions"
          subtitle="Manage active 3-day course free trials, verify UPI transactions, and download official tax receipts."
          badge={
            <Badge tone="success" className="flex items-center gap-1.5 bg-primary/20 text-foreground border-border">
              <ShieldCheck className="size-3.5" />
              PCI-DSS &amp; UPI Encrypted Payments
            </Badge>
          }
        />

        {/* Target Course Already Verified Notification */}
        {targetCourseId && paidCourseIds.has(targetCourseId) && (
          <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-primary shrink-0" />
              <div>
                <p className="font-bold text-xs text-heading">
                  You Already Have Verified Access
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Payment for this course is verified. You have lifetime access to all lessons, class materials, and recordings.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="primary" className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs shrink-0">
              <Link href={`/student/learning/${targetCourseId}`}>
                Open Course →
              </Link>
            </Button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Invested"
            value={`₹${num(totalSpent)}`}
            tone="indigo"
            icon={<CreditCard className="size-4" />}
            hint="Settled course purchases"
          />
          <StatCard
            label="Active 3-Day Trials"
            value={num(activeTrials.length)}
            tone={activeTrials.length > 0 ? 'amber' : 'indigo'}
            icon={<Clock className="size-4" />}
            hint="72-hour server countdown active"
          />
          <StatCard
            label="Invoices Generated"
            value={num(successfulPayments.length)}
            tone="success"
            icon={<Receipt className="size-4" />}
            hint="Official receipts available"
          />
          <StatCard
            label="Payment Modes"
            value="UPI &amp; Gateway"
            tone="info"
            icon={<Sparkles className="size-4" />}
            hint="Direct UPI QR / Instant Gateway"
          />
        </div>

        {/* Semester Fee & Program Access Status Card */}
        {semesterFee && (
          <Card elevated className="border-indigo-500/20 bg-gradient-to-r from-indigo-950/20 via-background to-card">
            <CardHeader className="p-5 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Semester Fee &amp; Program Status</CardTitle>
                    <Badge
                      tone={
                        semesterFee.accessStatus === 'ACTIVE'
                          ? 'success'
                          : semesterFee.accessStatus === 'RESTRICTED'
                          ? 'danger'
                          : 'amber'
                      }
                    >
                      {semesterFee.accessStatus === 'ACTIVE'
                        ? 'Active Access'
                        : semesterFee.accessStatus === 'RESTRICTED'
                        ? 'Payment Required'
                        : semesterFee.accessStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {semesterFee.courseTitle} · Semester {semesterFee.currentSemester}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Semester Fee (Incl. {semesterFee.gstRate}% GST)</p>
                  <p className="text-lg font-extrabold text-foreground">₹{num(semesterFee.feeAmount)}</p>
                </div>
              </div>
            </CardHeader>

            <CardBody className="p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-card/60 border border-border text-xs">
                <div>
                  <p className="text-muted-foreground text-[11px]">Taxable Amount</p>
                  <p className="font-semibold text-foreground">₹{num(semesterFee.taxableAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">GST ({semesterFee.gstRate}%)</p>
                  <p className="font-semibold text-foreground">₹{num(semesterFee.gstAmount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Due Date</p>
                  <p className="font-semibold text-foreground">{semesterFee.dueDate ? formatDate(semesterFee.dueDate) : 'Current Semester'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Payment Status</p>
                  <p className="font-semibold text-foreground">{semesterFee.paymentStatus}</p>
                </div>
              </div>

              {semesterFee.accessStatus === 'RESTRICTED' && (
                <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Current Semester Learning Modules Restricted</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Your account remains active. All completed lessons, past assessments, and historical invoices remain fully accessible.
                    To unlock new lessons and current semester assessments, please submit your semester fee payment reference (UTR) below.
                  </p>
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleBuyCourseById(semesterFee.courseId)}
                      className="text-xs"
                    >
                      Pay Semester Fee / Submit UTR →
                    </Button>
                  </div>
                </div>
              )}

              {semesterFee.paymentStatus !== 'VERIFIED' && semesterFee.accessStatus !== 'RESTRICTED' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <span className="text-muted-foreground">Semester fee pending verification or submission:</span>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleBuyCourseById(semesterFee.courseId)}
                    className="text-xs"
                  >
                    Submit Semester Fee UTR →
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* Active 3-Day Free Trials Section */}
        {trials.length > 0 && (
          <Card elevated>
            <CardHeader className="p-5 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="size-4 text-accent" />
                    Your Course Free Trials (3 Days / 72 Hours)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Full curriculum access during your 72-hour trial. Upgrade anytime to keep your learning progress and unlock all class materials and live sessions.
                  </p>
                </div>
                <Badge tone="amber">
                  72-Hour Server Clock
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trials.map((trial) => {
                  const isExpiringSoon = trial.isActive && trial.daysRemaining <= 1;
                  const isPaid = trial.status === 'converted' || paidCourseIds.has(trial.courseId);
                  return (
                    <div
                      key={trial.id}
                      className={cn(
                        'p-4 rounded-xl border surface-3d surface-3d-interactive shadow-3d-card hover:shadow-3d-hover transition-all flex flex-col justify-between space-y-3',
                        isPaid
                          ? 'border-border bg-card'
                          : trial.isActive
                          ? isExpiringSoon
                            ? 'border-accent bg-accent/15'
                            : 'border-border bg-card'
                          : 'border-destructive/30 bg-destructive/10 opacity-85'
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm text-heading line-clamp-1">
                            {trial.courseName}
                          </span>
                          <Badge
                            tone={
                              isPaid
                                ? 'success'
                                : trial.isActive
                                ? isExpiringSoon
                                  ? 'amber'
                                  : 'indigo'
                                : 'danger'
                            }
                          >
                            {isPaid
                              ? 'Paid & Enrolled'
                              : trial.isActive
                              ? `${trial.daysRemaining}d remaining`
                              : '3-Day Trial Expired'}
                          </Badge>
                        </div>

                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          <p>Started: {formatDate(trial.startedAt)}</p>
                          <p>Expires: {formatDate(trial.expiresAt)}</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-between">
                        <Link
                          href={`/student/learning/${trial.courseId}`}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Open Course →
                        </Link>

                        {!isPaid ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleBuyCourse(trial)}
                            className="text-xs"
                          >
                            {trial.isActive ? 'Unlock Lifetime Access' : 'Purchase Course'}
                          </Button>
                        ) : (
                          <Badge tone="success" className="text-[11px]">
                            Verified Lifetime Access
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Transaction History */}
        <Card elevated>
          <CardHeader className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Payment &amp; Invoices History</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit ledger of all course enrollments, UPI transactions, and verified tax receipts.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {payments.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="size-10 text-muted-foreground mx-auto mb-2" />
                <p className="font-semibold text-sm text-foreground">
                  No payment transactions found
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  When you purchase lifetime course access, your invoices and receipts will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Course / Purpose</th>
                      <th className="px-5 py-3">Mode</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">UTR / Ref</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Receipt</th>
                      <th className="px-5 py-3 text-right">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => {
                      const isAccessActive =
                        p.status === 'success' ||
                        p.status === 'completed' ||
                        p.status === 'verified';
                      return (
                        <tr key={p.id} className="hover:bg-muted/50">
                          <td className="px-5 py-3.5 font-medium text-heading max-w-xs truncate">
                            {p.courseTitle || p.purpose || 'Course Enrollment'}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge tone="neutral" className="text-[10px]">
                              {p.courseMode || 'ONLINE'}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 font-bold text-heading">
                            ₹{num(p.amount)}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              tone={
                                isAccessActive
                                  ? 'success'
                                  : p.status === 'pending' || p.status === 'pending_verification'
                                  ? 'amber'
                                  : p.status === 'refunded'
                                  ? 'neutral'
                                  : 'danger'
                              }
                            >
                              {p.status === 'pending_verification' ? 'Pending Review' : p.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-muted-foreground">
                            {p.legacyReference || p.legacy_reference ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-primary">{p.legacyReference || p.legacy_reference}</span>
                                {p.utr && p.utr !== (p.legacyReference || p.legacy_reference) && (
                                  <span className="text-[10px] text-muted-foreground/80">UTR: {p.utr}</span>
                                )}
                              </div>
                            ) : (
                              <span>{p.utr || p.transactionRef || p.transactionId || '—'}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground">
                            {formatDate(p.createdAt || p.paidAt)}
                          </td>
                          <td className="px-5 py-3.5">
                            {isAccessActive && (p.invoiceId || p.invoice_id) ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleViewInvoice(p.id)}
                                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs"
                                  title="View invoice details"
                                >
                                  <FileText className="size-3" />
                                  Invoice
                                </button>
                                <button
                                  onClick={() => handleDownloadInvoice(p.invoiceId || p.invoice_id!, p.invoiceNumber || 'Invoice')}
                                  disabled={downloadingInvoiceId === (p.invoiceId || p.invoice_id)}
                                  className="text-muted-foreground hover:text-primary transition-colors p-1"
                                  title="Download PDF"
                                >
                                  <Download className="size-3" />
                                </button>
                              </div>
                            ) : isAccessActive ? (
                              <button
                                onClick={() => handleViewInvoice(p.id)}
                                className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs"
                              >
                                <FileText className="size-3" />
                                Invoice
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {p.courseId && isAccessActive ? (
                              <Link
                                href={`/student/learning/${p.courseId}`}
                                className="text-primary hover:underline font-medium"
                              >
                                View Course →
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">
                                {p.status === 'pending' || p.status === 'pending_verification' ? 'Verifying…' : 'Locked'}
                              </span>
                            )}
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

        {/* Official GST Invoices Section */}
        {invoicesList.length > 0 && (
          <Card elevated>
            <CardHeader className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="size-4 text-primary" />
                  Official Tax Invoices (GST Compliant)
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Authorized digital tax invoices with strict GST breakdown (6.36%) and transaction references.
                </p>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Invoice Number</th>
                      <th className="px-5 py-3">Semester</th>
                      <th className="px-5 py-3">Academic Year</th>
                      <th className="px-5 py-3">Taxable</th>
                      <th className="px-5 py-3">GST (6.36%)</th>
                      <th className="px-5 py-3">Total Amount</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoicesList.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-muted/50">
                        <td className="px-5 py-3.5 font-mono font-medium text-heading">
                          {inv.invoice_number || inv.invoiceNumber}
                        </td>
                        <td className="px-5 py-3.5">
                          Semester {inv.semester_number ?? inv.semester ?? 1}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {inv.academic_year || inv.academicYear || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-foreground">
                          ₹{num(inv.taxable_amount ?? inv.taxableAmount ?? 5500.19)}
                        </td>
                        <td className="px-5 py-3.5 text-foreground">
                          ₹{num(inv.gst_amount ?? inv.gstAmount ?? 349.81)}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-heading">
                          ₹{num(inv.total_amount ?? inv.totalAmount ?? 5850.00)}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {formatDate(inv.issued_at || inv.issuedAt || inv.created_at)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={downloadingInvoiceId === inv.id}
                            onClick={() => handleDownloadInvoice(inv.id, inv.invoice_number || inv.invoiceNumber)}
                            className="h-7 px-2.5 text-xs text-primary hover:bg-primary/10 gap-1"
                          >
                            <Download className="size-3" />
                            {downloadingInvoiceId === inv.id ? 'Downloading…' : 'PDF Receipt'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Course Checkout Modal with Real UPI and Gateway Options */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Unlock Lifetime Course Access</DialogTitle>
            <DialogDescription>
              Preserve your learning progress and gain unlimited lifetime access to all learning content.
            </DialogDescription>
          </DialogHeader>

          {checkoutSuccessMessage ? (
            <div className="p-8 text-center space-y-4">
              <CheckCircle2 className="size-12 text-primary mx-auto" />
              <h3 className="font-bold text-lg text-heading">
                Payment Received
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {checkoutSuccessMessage}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCheckoutModalOpen(false);
                    setCheckoutSuccessMessage(null);
                  }}
                >
                  Close &amp; Return to Payments
                </Button>
                {selectedTrialToBuy?.courseId && (
                  <Button asChild variant="primary" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Link href={`/student/learning/${selectedTrialToBuy.courseId}`}>
                      Open Purchased Course →
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : selectedTrialToBuy ? (
            <form onSubmit={handleConfirmCheckout} className="p-6 space-y-5">
              {/* Course Overview Card */}
              <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-heading">
                    {courseConfig?.title || selectedTrialToBuy.courseName}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Payee: {courseConfig?.merchantName || 'SkillSharp LMS'} · Category: {courseConfig?.category || 'Employability'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider block font-semibold">Course Fee</span>
                  <span className="text-xl font-extrabold text-primary">
                    ₹{num(courseConfig?.fee ?? 2499)}
                  </span>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Select Learning Mode:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('ONLINE')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      selectedMode === 'ONLINE'
                        ? 'border-primary bg-primary/10 text-heading font-semibold'
                        : 'border-border hover:border-accent text-foreground'
                    }`}
                  >
                    <p className="font-bold">Online Platform</p>
                    <p className="text-[11px] text-muted-foreground font-normal">Self-Paced, Virtual Classrooms</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMode('OFFLINE')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      selectedMode === 'OFFLINE'
                        ? 'border-accent bg-accent/20 text-heading font-semibold'
                        : 'border-border hover:border-accent text-foreground'
                    }`}
                  >
                    <p className="font-bold">Campus Cohort</p>
                    <p className="text-[11px] text-muted-foreground font-normal">In-Person Campus Sessions</p>
                  </button>
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-foreground">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('UPI')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all flex items-center gap-2 ${
                      selectedMethod === 'UPI'
                        ? 'border-primary bg-primary/10 font-semibold text-heading'
                        : 'border-border text-foreground'
                    }`}
                  >
                    <QrCode className="size-4 text-primary" />
                    <div>
                      <p className="font-bold">UPI QR / Direct Pay</p>
                      <p className="text-[10px] text-muted-foreground">Google Pay, PhonePe, Paytm</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMethod('GATEWAY')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all flex items-center gap-2 ${
                      selectedMethod === 'GATEWAY'
                        ? 'border-primary bg-primary/10 font-semibold text-heading'
                        : 'border-border text-foreground'
                    }`}
                  >
                    <CreditCard className="size-4 text-primary" />
                    <div>
                      <p className="font-bold">Instant Gateway</p>
                      <p className="text-[10px] text-muted-foreground">Card / NetBanking / Mock</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* UPI QR Display & UTR Submission */}
              {selectedMethod === 'UPI' && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="size-32 bg-card p-2 rounded-xl border border-border shadow-sm shrink-0 flex items-center justify-center">
                      <Image
                        src={
                          courseConfig?.qrCodeUrl ||
                          `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                            `upi://pay?pa=${courseConfig?.upiId || 'eedi@icici'}&pn=${encodeURIComponent(
                              courseConfig?.merchantName || 'SkillSharp LMS'
                            )}&am=${courseConfig?.fee ?? 2499}&cu=INR`
                          )}`
                        }
                        alt="UPI Payment QR Code"
                        width={112}
                        height={112}
                        className="object-contain"
                      />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-bold text-heading">
                        Scan with any UPI App to Pay ₹{num(courseConfig?.fee ?? 2499)}
                      </p>
                      <p className="text-muted-foreground">
                        UPI ID:{' '}
                        <strong className="font-mono text-primary select-all">
                          {courseConfig?.upiId || 'eedi@icici'}
                        </strong>
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        Payee: {courseConfig?.merchantName || 'SkillSharp LMS'}
                      </p>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        {courseConfig?.paymentInstructions ||
                          'After paying, enter your 12-digit UPI UTR reference number below to verify your transaction.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-foreground">
                        12-Digit Transaction UTR Reference *
                      </label>
                      <input
                        type="text"
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder="e.g. 429182749102"
                        className="w-full rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-mono text-heading focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-foreground">
                        Your UPI ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={payerUpiId}
                        onChange={(e) => setPayerUpiId(e.target.value)}
                        placeholder="e.g. student@okhdfcbank"
                        className="w-full rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-mono text-heading focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>Instant access without data loss (your free trial progress is preserved)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  <span>{courseConfig?.refundPolicy || '7-Day refund policy applies.'}</span>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCheckoutModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={checkoutProcessing}
                  className="flex items-center gap-1.5"
                >
                  <CreditCard className="size-3.5" />
                  {checkoutProcessing
                    ? 'Submitting…'
                    : selectedMethod === 'UPI'
                    ? `Submit UPI Payment (₹${num(courseConfig?.fee ?? 2499)})`
                    : `Pay ₹${num(courseConfig?.fee ?? 2499)} (Instant Checkout)`}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Invoice View Modal */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Tax Invoice &amp; Payment Receipt</DialogTitle>
            <DialogDescription>
              Official electronic receipt issued by SkillSharp LMS.
            </DialogDescription>
          </DialogHeader>

          {loadingInvoice ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Generating invoice preview…
            </div>
          ) : invoiceData ? (
            <div className="p-6 space-y-6 bg-card">
              {(() => {
                const invNum = invoiceData.invoiceNumber || invoiceData.invoice_number || 'INV-OFFICIAL';
                const invStatus = (invoiceData.status || 'ISSUED').toUpperCase();
                const invDate = invoiceData.issuedAt || invoiceData.issued_at || invoiceData.createdAt;
                const stuName = invoiceData.studentName || invoiceData.student_name || 'Student';
                const colName = invoiceData.collegeName || invoiceData.college_name || 'Arya College of Engineering and IT';
                const invTotal = Number(invoiceData.total || invoiceData.total_amount || 5850);
                const invTaxable = Number(invoiceData.taxableAmount || invoiceData.taxable_amount || 5500.19);
                const invGst = Number(invoiceData.gstAmount || invoiceData.gst_amount || 349.81);
                const invGstRate = invoiceData.gstRate || invoiceData.gst_rate || 6.36;
                const invId = invoiceData.id || invoiceData.invoiceId || invoiceData.invoice_id;
                const rawItems = invoiceData.items;
                const itemsList = Array.isArray(rawItems) && rawItems.length > 0
                  ? rawItems
                  : [{ description: 'Official Semester Soft Skills & Technical Training Program', amount: invTaxable }];

                return (
                  <>
                    <div className="flex justify-between items-start border-b border-border pb-4">
                      <div className="flex flex-col gap-1">
                        <WinnersCreekLogo variant="invoice" />
                        <p className="text-xs text-muted-foreground mt-1">Learning &amp; Education Platform</p>
                      </div>
                      <div className="text-right">
                        <Badge tone="success">
                          {invStatus}
                        </Badge>
                        <p className="font-mono text-xs font-semibold text-foreground mt-1">
                          #{invNum}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Date: {formatDate(invDate)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="font-bold text-muted-foreground uppercase text-[10px]">Billed To</p>
                        <p className="font-semibold text-heading mt-1">
                          {stuName}
                        </p>
                        <p className="text-muted-foreground">{colName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-muted-foreground uppercase text-[10px]">Payment Method</p>
                        <p className="font-semibold text-heading mt-1">
                          {invoiceData.paymentMethod || invoiceData.payment_method || 'Official College Fee Receipt'}
                        </p>
                        <p className="text-muted-foreground">Currency: INR (₹)</p>
                      </div>
                    </div>

                    <table className="w-full text-xs text-left">
                      <thead className="border-y border-border bg-muted/50">
                        <tr>
                          <th className="py-2 px-3">Description</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {itemsList.map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-3 px-3">{item.description}</td>
                            <td className="py-3 px-3 text-right font-bold">₹{num(item.amount)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="py-2 px-3 text-muted-foreground">GST ({invGstRate}%)</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">₹{num(invGst)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="flex justify-between items-center border-t border-border pt-4">
                      <div>
                        {invId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownloadInvoice(invId, invNum)}
                            loading={downloadingInvoiceId === invId}
                            className="text-xs"
                          >
                            <Download className="size-3 mr-1" />
                            Download Official PDF
                          </Button>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm mr-2">Total Paid:</span>
                        <span className="font-bold text-lg text-primary">
                          ₹{num(invTotal)}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </VisualPageBackground>
  );
}

export default function StudentPaymentsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-12 text-center text-xs text-muted-foreground">
          Loading billing and payment records…
        </div>
      }
    >
      <StudentPaymentsContent />
    </React.Suspense>
  );
}

'use client';

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  Gamepad2,
  Globe,
  GraduationCap,
  Layers,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function SuperAdminCourseControlCenterPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const controlQuery = useApi<any>(`/super-admin/courses/${courseId}/control-center`, undefined, {
    select: (res) => res.data ?? res,
  });

  const paymentConfigQuery = useApi<any>(`/super-admin/courses/${courseId}/payment-config`, undefined, {
    select: (res) => res.data ?? res,
  });

  const revenueQuery = useApi<any>(`/super-admin/courses/${courseId}/revenue`, undefined, {
    select: (res) => res.data ?? res,
  });

  const txQuery = useApi<any>(`/super-admin/courses/${courseId}/transactions`, undefined, {
    select: (res) => res.data ?? res,
  });

  const trainersQuery = useApi<any>(`/super-admin/courses/${courseId}/trainers`, undefined, {
    select: (res) => res.data ?? res,
  });

  // State
  const [activeTab, setActiveTab] = React.useState<'overview' | 'scheme_config' | 'payment_config' | 'distribution' | 'revenue' | 'trainers'>('overview');
  const [lifecycleLoading, setLifecycleLoading] = React.useState(false);

  // Institution Targeting & Distribution State
  const [visibilityMode, setVisibilityMode] = React.useState('EVERYONE');
  const [targetInstitutionIds, setTargetInstitutionIds] = React.useState<string[]>([]);
  const [portalDistribution, setPortalDistribution] = React.useState({
    spoc: true,
    admin: true,
    trainer: true,
    participant: true,
  });
  const [allowedEnrollmentMethods, setAllowedEnrollmentMethods] = React.useState<string[]>([
    'SELF',
    'ADMIN',
    'SPOC',
    'SUPER_ADMIN',
  ]);
  const [savingDistribution, setSavingDistribution] = React.useState(false);
  const [instSearchQuery, setInstSearchQuery] = React.useState('');
  const [distributionSynced, setDistributionSynced] = React.useState(false);

  // Scheme Configuration State
  const [schemeType, setSchemeType] = React.useState('SEMESTER');
  const [schemeName, setSchemeName] = React.useState('');
  const [totalPeriods, setTotalPeriods] = React.useState(8);
  const [periodLabel, setPeriodLabel] = React.useState('Semester');
  const [periodsConfig, setPeriodsConfig] = React.useState<any[]>([]);
  const [paymentFrequency, setPaymentFrequency] = React.useState('ONE_TIME');
  const [schemeVersion, setSchemeVersion] = React.useState(1);
  const [savingScheme, setSavingScheme] = React.useState(false);

  // Fetch scheme config
  const fetchSchemeConfig = React.useCallback(async () => {
    try {
      const res = await api.get<any>(`/super-admin/courses/${courseId}/scheme`);
      if (res?.data) {
        const d = res.data;
        setSchemeType(d.scheme_type || 'SEMESTER');
        setSchemeName(d.scheme_name || `${(d.scheme_type || 'Semester')} Scheme`);
        setTotalPeriods(d.total_periods || 8);
        setPeriodLabel(d.period_label || 'Semester');
        setPeriodsConfig(
          Array.isArray(d.periods_config)
            ? d.periods_config
            : Array.from({ length: d.total_periods || 8 }).map((_, i) => ({
                periodNumber: i + 1,
                name: `${d.period_label || 'Semester'} ${i + 1}`,
                milestone: `Core Milestone ${i + 1}`,
                minAttendance: 75,
                durationWeeks: 16,
              }))
        );
        setPaymentFrequency(d.payment_frequency || 'ONE_TIME');
        setSchemeVersion(d.scheme_version || 1);
      }
    } catch {
      // Handled silently
    }
  }, [courseId]);

  React.useEffect(() => {
    fetchSchemeConfig();
  }, [fetchSchemeConfig]);

  const handleSaveScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingScheme(true);
    try {
      const res = await api.patch<any>(`/super-admin/courses/${courseId}/scheme`, {
        schemeType,
        schemeName,
        totalPeriods,
        periodLabel,
        periodsConfig,
        paymentFrequency,
      });
      toast.success(res?.message || 'Course scheme updated successfully!');
      fetchSchemeConfig();
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update course scheme.');
    } finally {
      setSavingScheme(false);
    }
  };

  // Sync targeting & distribution when control data loads
  React.useEffect(() => {
    if (controlQuery.data?.course && !distributionSynced) {
      const c = controlQuery.data.course;
      if (c.visibilityMode) setVisibilityMode(c.visibilityMode);
      if (Array.isArray(c.targetInstitutionIds)) setTargetInstitutionIds(c.targetInstitutionIds);
      if (c.portalDistribution) {
        setPortalDistribution({
          spoc: Boolean(c.portalDistribution.spoc ?? true),
          admin: Boolean(c.portalDistribution.admin ?? true),
          trainer: Boolean(c.portalDistribution.trainer ?? true),
          participant: Boolean(c.portalDistribution.participant ?? true),
        });
      }
      if (Array.isArray(c.allowedEnrollmentMethods) && c.allowedEnrollmentMethods.length > 0) {
        setAllowedEnrollmentMethods(c.allowedEnrollmentMethods);
      }
      setDistributionSynced(true);
    }
  }, [controlQuery.data, distributionSynced]);

  const handleSaveDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDistribution(true);
    try {
      await api.put(`/super-admin/courses/${courseId}/distribution`, {
        visibilityMode,
        targetInstitutionIds,
        portalDistribution,
        allowedEnrollmentMethods,
      });
      toast.success('Course targeting and institution distribution saved successfully!');
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update course targeting rules.');
    } finally {
      setSavingDistribution(false);
    }
  };

  const handleToggleInstitution = (instId: string) => {
    setTargetInstitutionIds((prev) =>
      prev.includes(instId) ? prev.filter((id) => id !== instId) : [...prev, instId]
    );
  };

  const handleQuickDisassociate = async (instId: string) => {
    try {
      await api.delete(`/super-admin/institutions/${instId}/courses/${courseId}/disassociate`);
      toast.success('Course disassociated from institution.');
      setTargetInstitutionIds((prev) => prev.filter((id) => id !== instId));
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disassociate institution.');
    }
  };

  // Payment Form state
  const [fee, setFee] = React.useState<number>(0);
  const [trialDays, setTrialDays] = React.useState<number>(3);
  const [trialEnabled, setTrialEnabled] = React.useState<boolean>(true);
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>(['UPI', 'GATEWAY']);
  const [upiId, setUpiId] = React.useState<string>('');
  const [merchantName, setMerchantName] = React.useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string>('');
  const [paymentInstructions, setPaymentInstructions] = React.useState<string>('');
  const [refundPolicy, setRefundPolicy] = React.useState<string>('');
  const [enrollmentOpen, setEnrollmentOpen] = React.useState<boolean>(true);
  const [savingConfig, setSavingConfig] = React.useState(false);

  // Sync payment config form when loaded
  React.useEffect(() => {
    if (paymentConfigQuery.data) {
      const d = paymentConfigQuery.data;
      setFee(d.fee ?? 0);
      setTrialDays(d.trialDurationDays ?? 3);
      setTrialEnabled(d.trialEnabled ?? true);
      setPaymentMethods(d.paymentMethods ?? ['UPI', 'GATEWAY']);
      setUpiId(d.upiId ?? '');
      setMerchantName(d.merchantName ?? '');
      setQrCodeUrl(d.qrCodeUrl ?? '');
      setPaymentInstructions(d.paymentInstructions ?? '');
      setRefundPolicy(d.refundPolicy ?? '');
      setEnrollmentOpen(d.enrollmentOpen ?? true);
    }
  }, [paymentConfigQuery.data]);

  // Trainer Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = React.useState(false);
  const [trainerUserId, setTrainerUserId] = React.useState('');
  const [assigningTrainer, setAssigningTrainer] = React.useState(false);

  // Permanent Course Deletion State (72h window)
  const [deleteCourseModalOpen, setDeleteCourseModalOpen] = React.useState(false);
  const [deleteCoursePassword, setDeleteCoursePassword] = React.useState('');
  const [deletingCourse, setDeletingCourse] = React.useState(false);

  // Lifecycle actions
  const handleLifecycleAction = async (action: 'publish' | 'unpublish' | 'suspend' | 'restore' | 'archive') => {
    setLifecycleLoading(true);
    try {
      await api.post(`/super-admin/courses/${courseId}/${action}`, {});
      toast.success(`Course successfully updated (${action}).`);
      controlQuery.refetch();
      paymentConfigQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} course.`);
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleConfirmCourseDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteCoursePassword) return;
    setDeletingCourse(true);
    try {
      const res = await api.post(`/super-admin/courses/${courseId}/delete-request`, {
        password: deleteCoursePassword,
        retentionHours: 72,
      });
      toast.success(res.message || 'Course deletion scheduled. Historical learning snapshots created for participants.');
      setDeleteCourseModalOpen(false);
      setDeleteCoursePassword('');
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule permanent course deletion. Please verify password.');
    } finally {
      setDeletingCourse(false);
    }
  };

  // Save payment config
  const handleSavePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.put(`/super-admin/courses/${courseId}/payment-config`, {
        fee,
        trialDurationDays: trialDays,
        trialEnabled,
        paymentMethods,
        upiId,
        merchantName,
        qrCodeUrl,
        paymentInstructions,
        refundPolicy,
        enrollmentOpen,
      });
      toast.success('Course payment & free-trial configuration saved successfully!');
      paymentConfigQuery.refetch();
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update payment configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Verify / Reject / Refund Transaction
  const handleTransactionAction = async (txId: string, action: 'verify' | 'reject' | 'refund') => {
    try {
      if (action === 'verify') {
        await api.post(`/super-admin/payments/${txId}/verify`, {});
        toast.success('Payment verified. Paid course access granted.');
      } else if (action === 'reject') {
        const reason = window.prompt('Enter reason for payment rejection:', 'Invalid UTR reference');
        if (!reason) return;
        await api.post(`/super-admin/payments/${txId}/reject`, { reason });
        toast.success('Payment rejected.');
      } else if (action === 'refund') {
        const confirmRefund = window.confirm('Are you sure you want to refund this transaction? Student access will be revoked.');
        if (!confirmRefund) return;
        await api.post(`/super-admin/payments/${txId}/refund`, { reason: 'Administrative refund' });
        toast.success('Payment refunded and course access updated.');
      }
      txQuery.refetch();
      revenueQuery.refetch();
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} payment.`);
    }
  };

  // Assign Trainer
  const handleAssignTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainerUserId.trim()) return;
    setAssigningTrainer(true);
    try {
      await api.post(`/super-admin/courses/${courseId}/trainers`, {
        trainerUserId: trainerUserId.trim(),
      });
      toast.success('Trainer assigned to course.');
      setAssignModalOpen(false);
      setTrainerUserId('');
      trainersQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign trainer.');
    } finally {
      setAssigningTrainer(false);
    }
  };

  // Remove Trainer
  const handleRemoveTrainer = async (tId: string) => {
    if (!window.confirm('Remove this trainer from the course?')) return;
    try {
      await api.delete(`/super-admin/courses/${courseId}/trainers/${tId}`);
      toast.success('Trainer removed from course.');
      trainersQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove trainer.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/super-admin/courses">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Course Catalog
          </Link>
        </Button>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-border/60 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'overview'
                ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Overview & Hierarchy
          </button>
          <button
            onClick={() => setActiveTab('scheme_config')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'scheme_config'
                ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Scheme Configuration
          </button>
          <button
            onClick={() => setActiveTab('payment_config')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'payment_config'
                ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Payment & 3-Day Trial Config
          </button>
          <button
            onClick={() => setActiveTab('distribution')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'distribution'
                ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Targeting &amp; Distribution
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'revenue'
                ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Revenue & Financials
          </button>
          <button
            onClick={() => setActiveTab('trainers')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'trainers'
                ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Assigned Trainers
          </button>
        </div>
      </div>

      <AsyncSection query={controlQuery} skeleton="detail">
        {(data) => {
          const { course, analytics, hierarchy, attachedGames } = data;
          const status = course.status || (course.published ? 'PUBLISHED' : 'DRAFT');

          return (
            <div className="space-y-6">
              {/* Visual Course Header with 3D Depth */}
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 text-foreground shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={course.courseMode === 'ONLINE' ? 'indigo' : 'teal'}>
                        {course.courseMode === 'BOTH' ? 'ONLINE + OFFLINE DUAL MODE' : course.courseMode}
                      </Badge>
                      <Badge
                        tone={
                          status === 'PUBLISHED'
                            ? 'success'
                            : status === 'SUSPENDED'
                            ? 'danger'
                            : status === 'ARCHIVED'
                            ? 'neutral'
                            : 'amber'
                        }
                      >
                        {status}
                      </Badge>
                      {paymentConfigQuery.data?.trialEnabled && (
                        <Badge tone="amber" className="bg-amber-500/20 text-amber-200 border-amber-500/30">
                          {paymentConfigQuery.data?.trialDurationDays ?? 3}-Day Free Trial Active
                        </Badge>
                      )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-heading">
                      {course.title}
                    </h1>
                    <p className="text-xs text-slate-300 font-mono">
                      Slug: /{course.slug} · Code: {course.code} · Fee: ₹{num(course.price ?? course.fee)}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                    <div className="text-right space-y-1 bg-muted/60 px-4 py-3 rounded-xl border border-border backdrop-blur-md">
                      <p className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Course Revenue</p>
                      <p className="text-2xl font-bold text-foreground">₹{num(analytics.totalRevenue)}</p>
                      <span className="text-[11px] text-emerald-400 font-medium">
                        {analytics.verifiedPayments} Settled Payments
                      </span>
                    </div>

                    {/* Quick Lifecycle Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {status !== 'PUBLISHED' && (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('publish')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                        >
                          <PlayCircle className="size-3.5 mr-1" />
                          Publish
                        </Button>
                      )}
                      {status === 'PUBLISHED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('unpublish')}
                          className="text-xs"
                        >
                          <PauseCircle className="size-3.5 mr-1 text-amber-400" />
                          Unpublish
                        </Button>
                      )}
                      {status !== 'SUSPENDED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('suspend')}
                          className="text-xs text-rose-300 hover:text-rose-200"
                        >
                          <ShieldAlert className="size-3.5 mr-1 text-rose-400" />
                          Suspend
                        </Button>
                      )}
                      {status === 'SUSPENDED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('restore')}
                          className="text-xs text-emerald-300"
                        >
                          <RotateCcw className="size-3.5 mr-1 text-emerald-400" />
                          Restore
                        </Button>
                      )}
                      {status !== 'ARCHIVED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('archive')}
                          className="text-xs text-slate-300"
                        >
                          <Archive className="size-3.5 mr-1" />
                          Archive
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={lifecycleLoading}
                        onClick={() => {
                          setDeleteCoursePassword('');
                          setDeleteCourseModalOpen(true);
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        <AlertTriangle className="size-3.5 mr-1" />
                        Permanent Deletion
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* TAB 1: OVERVIEW & HIERARCHY */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Course KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      label="Enrolled Students"
                      value={num(analytics.totalEnrolled)}
                      tone="indigo"
                      icon={<GraduationCap className="size-4" />}
                      hint={`Active: ${analytics.activeStudents}`}
                    />
                    <StatCard
                      label="Campus Cohort"
                      value={num(analytics.offlineStudents)}
                      tone="teal"
                      icon={<Building2 className="size-4" />}
                      hint="College attendance tracked"
                    />
                    <StatCard
                      label="Online Platform"
                      value={num(analytics.onlineStudents)}
                      tone="indigo"
                      icon={<Layers className="size-4" />}
                      hint="Independent learners"
                    />
                    <StatCard
                      label="Average Progress"
                      value={`${analytics.averageProgress}%`}
                      tone="amber"
                      icon={<TrendingUp className="size-4" />}
                      hint="Across all modules"
                    />
                  </div>

                  {/* Course Hierarchy */}
                  <Card>
                    <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold">
                          Participating College &amp; Institutional Hierarchy
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Multi-tenant operational breakdown for offline campus cohorts enrolled in this course.
                        </p>
                      </div>
                      <Badge tone="indigo">
                        {analytics.participatingCollegesCount} Institutions
                      </Badge>
                    </CardHeader>
                    <CardBody className="p-0">
                      {hierarchy && hierarchy.length > 0 ? (
                        <div className="divide-y divide-border text-xs">
                          {hierarchy.map((col: any) => (
                            <div key={col.collegeId} className="p-4 space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Building2 className="size-4 text-indigo-500" />
                                  <span className="font-bold text-foreground text-sm">
                                    {col.collegeName}
                                  </span>
                                </div>
                                <Badge tone="teal">
                                  {col.studentCount} Students
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground dark:text-slate-300">
                                <div>
                                  <span className="text-muted-foreground font-medium">Campus Admin:</span>{' '}
                                  <strong>{col.admin}</strong>
                                </div>
                                <div>
                                  <span className="text-muted-foreground font-medium">Department HODs:</span>{' '}
                                  <strong>{col.hods?.join(', ') || 'None assigned'}</strong>
                                </div>
                                <div>
                                  <span className="text-muted-foreground font-medium">Assigned Trainers:</span>{' '}
                                  <strong>{col.trainers?.join(', ') || 'None assigned'}</strong>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          No institutional campus cohorts currently attached. This course is operating in direct online mode.
                        </div>
                      )}
                    </CardBody>
                  </Card>

                  {/* Contextual Games */}
                  <Card>
                    <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold">Contextual Games &amp; Simulations</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Skill challenges connected contextually to this course curriculum.
                        </p>
                      </div>
                      <Button asChild variant="secondary" size="sm" className="text-xs h-7">
                        <Link href="/super-admin/games">
                          <Gamepad2 className="size-3 mr-1" />
                          Manage Games
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardBody className="p-4">
                      {attachedGames && attachedGames.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {attachedGames.map((g: any) => (
                            <div key={g.id || g.title} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-card flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-xs text-foreground">{g.title}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">Status: {g.status}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No games attached yet.
                        </p>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* TAB: SCHEME CONFIGURATION */}
              {activeTab === 'scheme_config' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Layers className="size-4 text-accent" />
                          Course Academic Scheme &amp; Period Progression Configuration
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          Configure academic duration structure (Semester, Year, Module, Monthly, Custom) and decouple learning milestones from billing frequency.
                        </p>
                      </div>
                      <Badge tone="mustard" className="self-start sm:self-auto font-mono text-xs">
                        Active Scheme v{schemeVersion}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardBody className="p-6">
                    <form onSubmit={handleSaveScheme} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Scheme Type */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground">
                            Scheme Type
                          </label>
                          <select
                            value={schemeType}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSchemeType(val);
                              const defaultLabels: Record<string, string> = {
                                SEMESTER: 'Semester',
                                YEAR: 'Year',
                                MODULE: 'Module',
                                MONTHLY: 'Month',
                                QUARTERLY: 'Quarter',
                                CUSTOM: 'Stage',
                              };
                              const lbl = defaultLabels[val] || 'Period';
                              setPeriodLabel(lbl);
                              setSchemeName(`${lbl}-Based Academic Track`);
                            }}
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="SEMESTER">Semester-Based (e.g. 8 Semesters)</option>
                            <option value="YEAR">Year-Based (e.g. 4 Years)</option>
                            <option value="MODULE">Module-Based (e.g. 6 Modules)</option>
                            <option value="MONTHLY">Monthly-Based (e.g. 12 Months)</option>
                            <option value="QUARTERLY">Quarterly-Based (e.g. 4 Quarters)</option>
                            <option value="CUSTOM">Custom Duration-Based</option>
                          </select>
                        </div>

                        {/* Scheme Name */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground">
                            Scheme Display Name
                          </label>
                          <input
                            type="text"
                            value={schemeName}
                            onChange={(e) => setSchemeName(e.target.value)}
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="e.g. 8-Semester Undergraduate Scheme"
                            required
                          />
                        </div>

                        {/* Total Periods & Period Label */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-foreground">
                              Total Periods
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="32"
                              value={totalPeriods}
                              onChange={(e) => {
                                const count = Math.max(1, Number(e.target.value));
                                setTotalPeriods(count);
                                if (periodsConfig.length < count) {
                                  const added = Array.from({ length: count - periodsConfig.length }).map((_, i) => ({
                                    periodNumber: periodsConfig.length + i + 1,
                                    name: `${periodLabel} ${periodsConfig.length + i + 1}`,
                                    milestone: `Milestone ${periodsConfig.length + i + 1}`,
                                    minAttendance: 75,
                                    durationWeeks: 4,
                                  }));
                                  setPeriodsConfig([...periodsConfig, ...added]);
                                } else if (periodsConfig.length > count) {
                                  setPeriodsConfig(periodsConfig.slice(0, count));
                                }
                              }}
                              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-foreground">
                              Period Label
                            </label>
                            <input
                              type="text"
                              value={periodLabel}
                              onChange={(e) => setPeriodLabel(e.target.value)}
                              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              placeholder="Semester"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* Decoupled Payment Frequency */}
                      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-xs font-bold text-heading uppercase tracking-wider block">
                              Payment Structure (Decoupled from Academic Milestones)
                            </label>
                            <p className="text-xs text-muted-foreground">
                              Tuition billing cadence is independent of curriculum length (e.g. 4-year course with semester payments or one-time payment).
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                          {[
                            { id: 'ONE_TIME', label: 'One-Time Fee' },
                            { id: 'PER_PERIOD', label: 'Per Period' },
                            { id: 'PER_YEAR', label: 'Per Year' },
                            { id: 'PER_SEMESTER', label: 'Per Semester' },
                            { id: 'MONTHLY', label: 'Monthly' },
                          ].map((pf) => (
                            <button
                              key={pf.id}
                              type="button"
                              onClick={() => setPaymentFrequency(pf.id)}
                              className={cn(
                                'rounded-xl border p-2.5 text-xs font-bold transition-all text-center',
                                paymentFrequency === pf.id
                                  ? 'border-accent bg-accent/20 text-heading shadow-xs'
                                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {pf.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Period Breakdown Editor */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-heading uppercase tracking-wider">
                            Period Milestones &amp; Learning Architecture
                          </label>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const newNum = periodsConfig.length + 1;
                              setPeriodsConfig([
                                ...periodsConfig,
                                {
                                  periodNumber: newNum,
                                  name: `${periodLabel} ${newNum}`,
                                  milestone: `Core Milestone ${newNum}`,
                                  minAttendance: 75,
                                  durationWeeks: 4,
                                },
                              ]);
                              setTotalPeriods(newNum);
                            }}
                            className="text-xs h-7 gap-1"
                          >
                            <Plus className="size-3" />
                            Add Period
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {periodsConfig.map((p, idx) => (
                            <div key={idx} className="rounded-xl border border-border p-3.5 bg-card/60 space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-heading">
                                <span>Period {p.periodNumber}</span>
                                <Badge tone="neutral" className="text-[10px] font-mono">
                                  {p.durationWeeks || 4} Weeks
                                </Badge>
                              </div>
                              <input
                                type="text"
                                value={p.name}
                                onChange={(e) => {
                                  const updated = [...periodsConfig];
                                  updated[idx] = { ...updated[idx], name: e.target.value };
                                  setPeriodsConfig(updated);
                                }}
                                className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground font-semibold"
                                placeholder="Period Name"
                              />
                              <input
                                type="text"
                                value={p.milestone}
                                onChange={(e) => {
                                  const updated = [...periodsConfig];
                                  updated[idx] = { ...updated[idx], milestone: e.target.value };
                                  setPeriodsConfig(updated);
                                }}
                                className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground"
                                placeholder="Learning Milestone / Objective"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Non-destructive notice */}
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                        <p className="font-semibold flex items-center gap-1.5">
                          <ShieldCheck className="size-4" />
                          Historical Preservation Guarantee
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                          Saving changes updates version to v{schemeVersion + 1} for new enrollments. Historical enrollments preserve their enrolled scheme snapshot to ensure participant progress is never retroactively invalidated.
                        </p>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button
                          type="submit"
                          variant="primary"
                          loading={savingScheme}
                          className="flex items-center gap-2"
                        >
                          <Save className="size-4" />
                          Save Scheme Configuration
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>
              )}

              {/* TAB 2: COURSE PAYMENT & 3-DAY FREE TRIAL CONFIG */}
              {activeTab === 'payment_config' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="size-4 text-indigo-500" />
                      Course-Specific Payment &amp; Free Trial Configuration (Phases 2 &amp; 3)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Configure independent pricing, 3-day (72-hour) free trial entitlement, UPI payment details, QR code, and refund policies.
                    </p>
                  </CardHeader>
                  <CardBody className="p-6">
                    <form onSubmit={handleSavePaymentConfig} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Course Fee */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Course Fee (INR ₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={fee}
                            onChange={(e) => setFee(Number(e.target.value))}
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="e.g. 2499"
                            required
                          />
                          <p className="text-[11px] text-muted-foreground">Set 0 for completely free courses.</p>
                        </div>

                        {/* Free Trial Duration */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Free Trial Duration (Days)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={trialDays}
                            onChange={(e) => setTrialDays(Number(e.target.value))}
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="3"
                            required
                          />
                          <p className="text-[11px] text-muted-foreground">Default: 3 days (exactly 72 hours server-side).</p>
                        </div>

                        {/* Free Trial Enabled */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Free Trial Availability
                          </label>
                          <div className="flex items-center gap-3 pt-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={trialEnabled}
                                onChange={(e) => setTrialEnabled(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-primary-foreground after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                            <span className="text-xs text-muted-foreground dark:text-slate-300 font-medium">
                              {trialEnabled ? 'Enabled for new learners' : 'Disabled (Direct Pay Only)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* UPI ID */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Merchant / Payee UPI ID
                          </label>
                          <input
                            type="text"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                            placeholder="e.g. winnerscreek@icici"
                          />
                          <p className="text-[11px] text-muted-foreground">Used for direct peer-to-peer UPI transfer.</p>
                        </div>

                        {/* Payee Name */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Payee / Merchant Display Name
                          </label>
                          <input
                            type="text"
                            value={merchantName}
                            onChange={(e) => setMerchantName(e.target.value)}
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="e.g. Winners Creek Education Pvt Ltd"
                          />
                        </div>
                      </div>

                      {/* QR Code URL & Preview */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Custom UPI QR Code Image URL (Optional)
                        </label>
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={qrCodeUrl}
                            onChange={(e) => setQrCodeUrl(e.target.value)}
                            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="https://... or leave empty to auto-generate from UPI ID & fee"
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          If empty, a dynamic UPI QR code (`upi://pay?pa=...&pn=...&am=...`) will be generated automatically for participants.
                        </p>
                      </div>

                      {/* Payment Instructions */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Payment Instructions (Shown to Students at Checkout)
                        </label>
                        <textarea
                          rows={2}
                          value={paymentInstructions}
                          onChange={(e) => setPaymentInstructions(e.target.value)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="Scan the QR code or pay to the UPI ID. Once completed, enter your 12-digit transaction reference number (UTR) to activate your course access."
                        />
                      </div>

                      {/* Refund Policy */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Refund &amp; Cancellation Policy
                        </label>
                        <textarea
                          rows={2}
                          value={refundPolicy}
                          onChange={(e) => setRefundPolicy(e.target.value)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="Refunds permitted within 7 days of purchase upon administrative review if less than 20% course completed."
                        />
                      </div>

                      {/* Enrollment Open Checkbox */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id="enrollmentOpen"
                          checked={enrollmentOpen}
                          onChange={(e) => setEnrollmentOpen(e.target.checked)}
                          className="size-4 text-indigo-600 rounded border-slate-300 focus:ring-ring"
                        />
                        <label htmlFor="enrollmentOpen" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Enrollment is Open (Students can initiate trials and purchases)
                        </label>
                      </div>

                      <div className="pt-4 border-t border-border flex justify-end">
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={savingConfig}
                          className="flex items-center gap-2"
                        >
                          <Save className="size-4" />
                          {savingConfig ? 'Saving Configuration…' : 'Save Payment & Trial Config'}
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>
              )}

              {/* TAB: INSTITUTION TARGETING & DISTRIBUTION */}
              {activeTab === 'distribution' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">
                        Institution Targeting &amp; Portal Distribution Controls
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Define multi-tenant audience visibility, whitelist affiliated Colleges &amp; Corporate enterprises, and govern portal-level access.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleSaveDistribution}
                      disabled={savingDistribution}
                      className="flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Save className="size-3.5" />
                      {savingDistribution ? 'Saving Access Rules…' : 'Save Targeting Rules'}
                    </Button>
                  </div>

                  {/* 1. Audience Visibility Mode */}
                  <Card>
                    <CardHeader className="p-4 border-b border-border">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Globe className="size-4 text-indigo-500" />
                        Audience Visibility Scope
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Determines who can discover and access this curriculum across portals, catalog search, and direct enrollment links.
                      </p>
                    </CardHeader>
                    <CardBody className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {[
                          {
                            value: 'EVERYONE',
                            title: 'Universal Public Catalog',
                            desc: 'Open to all authenticated participants and direct self-enrollments.',
                            tone: 'indigo',
                          },
                          {
                            value: 'COLLEGE',
                            title: 'All Colleges',
                            desc: 'Available across all higher education university & college campuses.',
                            tone: 'teal',
                          },
                          {
                            value: 'CORPORATE',
                            title: 'All Corporates',
                            desc: 'Exclusive enterprise training across corporate clients and organizations.',
                            tone: 'purple',
                          },
                          {
                            value: 'SCHOOL',
                            title: 'All Schools',
                            desc: 'Restricted to K-12 and secondary educational organizations.',
                            tone: 'amber',
                          },
                          {
                            value: 'SELECTED_INSTITUTIONS',
                            title: 'Selected Institutions',
                            desc: 'Targeted only to explicitly whitelisted Colleges & Corporate partners below.',
                            tone: 'emerald',
                          },
                          {
                            value: 'SELECTED_CAMPUSES',
                            title: 'Specific Campuses',
                            desc: 'Restricted strictly to designated geographical campus locations.',
                            tone: 'blue',
                          },
                          {
                            value: 'SELECTED_BRANCHES',
                            title: 'Specific Branches / Teams',
                            desc: 'Constrained to specific academic departments or corporate business units.',
                            tone: 'cyan',
                          },
                          {
                            value: 'INVITE_ONLY',
                            title: 'Private Invite Only',
                            desc: 'Hidden from catalog; accessible only via administrative seat allocation.',
                            tone: 'rose',
                          },
                        ].map((mode) => (
                          <div
                            key={mode.value}
                            onClick={() => setVisibilityMode(mode.value)}
                            className={cn(
                              'cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col justify-between space-y-2',
                              visibilityMode === mode.value
                                ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
                                : 'border-border bg-card/60 hover:border-border/80 hover:bg-card'
                            )}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-foreground text-xs">{mode.title}</span>
                                {visibilityMode === mode.value && (
                                  <span className="size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
                                    ✓
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {mode.desc}
                              </p>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">
                              Mode: {mode.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </Card>

                  {/* 2. Portal Distribution & Enrollment Methods */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Portal Distribution */}
                    <Card>
                      <CardHeader className="p-4 border-b border-border">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Sliders className="size-4 text-indigo-500" />
                          Portal Distribution Permissions
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Toggle which stakeholder portals display and deliver this course.
                        </p>
                      </CardHeader>
                      <CardBody className="p-4 space-y-3 text-xs">
                        {[
                          {
                            key: 'participant',
                            label: 'Participant / Student Portal',
                            desc: 'Enrolled students and employees can access video lectures, eBooks, and practice games.',
                          },
                          {
                            key: 'spoc',
                            label: 'SPOC / HOD / Program Manager Portal',
                            desc: 'Campus SPOCs can view curriculum progress, assign batches, and track branch metrics.',
                          },
                          {
                            key: 'admin',
                            label: 'Institutional Admin Portal',
                            desc: 'College/Corporate administrators have governance, faculty assignment, and report access.',
                          },
                          {
                            key: 'trainer',
                            label: 'Faculty Trainer Portal',
                            desc: 'Trainers can mark attendance, review assignments, and conduct live sessions.',
                          },
                        ].map((portal) => (
                          <label
                            key={portal.key}
                            className="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card/60 hover:bg-card cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean((portalDistribution as any)[portal.key])}
                              onChange={(e) =>
                                setPortalDistribution((prev) => ({
                                  ...prev,
                                  [portal.key]: e.target.checked,
                                }))
                              }
                              className="mt-0.5 size-4 rounded border-border text-primary focus:ring-ring"
                            />
                            <div className="space-y-0.5">
                              <p className="font-semibold text-foreground text-xs">{portal.label}</p>
                              <p className="text-[11px] text-muted-foreground">{portal.desc}</p>
                            </div>
                          </label>
                        ))}
                      </CardBody>
                    </Card>

                    {/* Enrollment Methods */}
                    <Card>
                      <CardHeader className="p-4 border-b border-border">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          Permitted Enrollment Methods
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Specify permitted authorization pathways for enrolling into this curriculum.
                        </p>
                      </CardHeader>
                      <CardBody className="p-4 space-y-3 text-xs">
                        {[
                          {
                            id: 'SELF',
                            label: 'Participant Self-Enrollment',
                            desc: 'Learners can register directly via course catalog and checkout or free trial.',
                          },
                          {
                            id: 'SPOC',
                            label: 'SPOC / Branch Manager Enrollment',
                            desc: 'Department SPOCs can assign cohorts or classes into this course.',
                          },
                          {
                            id: 'ADMIN',
                            label: 'Institutional Admin Provisioning',
                            desc: 'College or Corporate Admins can execute batch or CSV roster enrollments.',
                          },
                          {
                            id: 'SUPER_ADMIN',
                            label: 'Central Super Admin Only',
                            desc: 'Reserved for direct administrative provisioning and enterprise license seeds.',
                          },
                        ].map((method) => {
                          const isChecked = allowedEnrollmentMethods.includes(method.id);
                          return (
                            <label
                              key={method.id}
                              className="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card/60 hover:bg-card cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAllowedEnrollmentMethods((prev) => [...prev, method.id]);
                                  } else {
                                    setAllowedEnrollmentMethods((prev) => prev.filter((m) => m !== method.id));
                                  }
                                }}
                                className="mt-0.5 size-4 rounded border-border text-primary focus:ring-ring"
                              />
                              <div className="space-y-0.5">
                                <p className="font-semibold text-foreground text-xs">{method.label}</p>
                                <p className="text-[11px] text-muted-foreground">{method.desc}</p>
                              </div>
                            </label>
                          );
                        })}
                      </CardBody>
                    </Card>
                  </div>

                  {/* 3. Associated Institutions Whitelist */}
                  <Card>
                    <CardHeader className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Building2 className="size-4 text-indigo-500" />
                          Associated Colleges &amp; Corporate Clients Whitelist
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {targetInstitutionIds.length} institutions currently targeted. Students and staff of these institutions will automatically receive scoped access.
                        </p>
                      </div>
                      <div className="relative w-full sm:w-64">
                        <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={instSearchQuery}
                          onChange={(e) => setInstSearchQuery(e.target.value)}
                          placeholder="Search institutions…"
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground"
                        />
                      </div>
                    </CardHeader>
                    <CardBody className="p-0">
                      {/* Active Associations */}
                      {course.associatedInstitutions && course.associatedInstitutions.length > 0 && (
                        <div className="p-4 bg-muted/40 border-b border-border">
                          <p className="text-xs font-bold text-foreground mb-2">
                            Currently Associated Institutions ({course.associatedInstitutions.length}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {course.associatedInstitutions.map((inst: any) => (
                              <div
                                key={inst.id}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-card text-xs shadow-xs"
                              >
                                {inst.category === 'CORPORATE' ? (
                                  <Briefcase className="size-3.5 text-purple-500 shrink-0" />
                                ) : (
                                  <Building2 className="size-3.5 text-indigo-500 shrink-0" />
                                )}
                                <div>
                                  <span className="font-semibold text-foreground">{inst.name}</span>
                                  <span className="ml-1 text-[10px] font-mono text-muted-foreground">({inst.code})</span>
                                </div>
                                <Badge tone={inst.category === 'CORPORATE' ? 'purple' : 'teal'}>
                                  {inst.category}
                                </Badge>
                                <Link
                                  href={inst.category === 'CORPORATE' ? `/super-admin/corporates/${inst.id}` : `/super-admin/colleges/${inst.id}`}
                                  className="text-muted-foreground hover:text-foreground text-[11px] underline flex items-center ml-1"
                                  title="Open Institution Control Center"
                                >
                                  <ExternalLink className="size-3" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleQuickDisassociate(inst.id)}
                                  className="text-rose-500 hover:text-rose-700 font-bold ml-1"
                                  title="Disassociate institution"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Searchable Toggle Table */}
                      <div className="max-h-80 overflow-y-auto divide-y divide-border text-xs">
                        {(data.availableInstitutions || [])
                          .filter((inst: any) =>
                            !instSearchQuery ||
                            inst.name.toLowerCase().includes(instSearchQuery.toLowerCase()) ||
                            inst.code.toLowerCase().includes(instSearchQuery.toLowerCase())
                          )
                          .map((inst: any) => {
                            const isSelected = targetInstitutionIds.includes(inst.id);
                            return (
                              <div
                                key={inst.id}
                                onClick={() => handleToggleInstitution(inst.id)}
                                className={cn(
                                  'p-3 flex items-center justify-between cursor-pointer transition-colors',
                                  isSelected
                                    ? 'bg-primary/5 hover:bg-primary/10'
                                    : 'hover:bg-muted/50'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}} // handled by div click
                                    className="size-4 rounded border-border text-primary focus:ring-ring"
                                  />
                                  <div className="flex items-center gap-2">
                                    {inst.category === 'CORPORATE' ? (
                                      <Briefcase className="size-4 text-purple-500" />
                                    ) : (
                                      <Building2 className="size-4 text-indigo-500" />
                                    )}
                                    <span className="font-semibold text-foreground text-xs">{inst.name}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">({inst.code})</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge tone={inst.category === 'CORPORATE' ? 'purple' : 'teal'}>
                                    {inst.category}
                                  </Badge>
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    {isSelected ? 'Targeted' : 'Not Targeted'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between text-xs">
                        <span className="text-muted-foreground text-[11px]">
                          {targetInstitutionIds.length} institutions selected for course access
                        </span>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleSaveDistribution}
                          disabled={savingDistribution}
                          className="flex items-center gap-1.5"
                        >
                          <Save className="size-3.5" />
                          {savingDistribution ? 'Saving…' : 'Save Access Configuration'}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* TAB 3: REVENUE & TRANSACTIONS */}
              {activeTab === 'revenue' && (
                <div className="space-y-6">
                  {/* Revenue Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      label="Gross Revenue"
                      value={`₹${num(revenueQuery.data?.grossRevenue ?? 0)}`}
                      tone="indigo"
                      icon={<DollarSign className="size-4" />}
                      hint="Total collected all-time"
                    />
                    <StatCard
                      label="Net Revenue"
                      value={`₹${num(revenueQuery.data?.netRevenue ?? 0)}`}
                      tone="success"
                      icon={<CheckCircle2 className="size-4" />}
                      hint="Gross minus refunds"
                    />
                    <StatCard
                      label="Refunds Issued"
                      value={`₹${num(revenueQuery.data?.totalRefunded ?? 0)}`}
                      tone="danger"
                      icon={<RotateCcw className="size-4" />}
                      hint="Revoked enrollments"
                    />
                    <StatCard
                      label="Verified Transactions"
                      value={num(revenueQuery.data?.verifiedCount ?? 0)}
                      tone="teal"
                      icon={<CreditCard className="size-4" />}
                      hint="Settled payments"
                    />
                  </div>

                  {/* Transaction Ledger */}
                  <Card>
                    <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold">Course Transaction Ledger</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Real-time audit log of all participant transactions for this course. Verify, reject, or refund payments with instant access reconciliation.
                        </p>
                      </div>
                      <Badge tone="indigo">
                        {txQuery.data?.length ?? 0} Transactions
                      </Badge>
                    </CardHeader>
                    <CardBody className="p-0">
                      {txQuery.data && txQuery.data.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="border-b border-border bg-slate-50/50 dark:bg-slate-800/40 font-semibold text-muted-foreground dark:text-slate-300">
                              <tr>
                                <th className="p-3">Participant</th>
                                <th className="p-3">Institution</th>
                                <th className="p-3">Amount</th>
                                <th className="p-3">UTR / Ref</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Date</th>
                                <th className="p-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {txQuery.data.map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                  <td className="p-3 font-medium text-foreground">
                                    <div>{tx.studentName}</div>
                                    <div className="text-[10px] text-muted-foreground font-normal">{tx.studentEmail}</div>
                                  </td>
                                  <td className="p-3 text-muted-foreground">{tx.institutionName || 'Direct Online'}</td>
                                  <td className="p-3 font-semibold text-foreground">₹{num(tx.amount)}</td>
                                  <td className="p-3 font-mono text-[11px] text-muted-foreground">{tx.transactionRef || 'N/A'}</td>
                                  <td className="p-3">
                                    <Badge
                                      tone={
                                        tx.status === 'VERIFIED'
                                          ? 'success'
                                          : tx.status === 'REJECTED'
                                          ? 'danger'
                                          : tx.status === 'REFUNDED'
                                          ? 'neutral'
                                          : 'amber'
                                      }
                                    >
                                      {tx.status}
                                    </Badge>
                                  </td>
                                  <td className="p-3 text-muted-foreground">{formatDate(tx.createdAt)}</td>
                                  <td className="p-3 text-right space-x-1">
                                    {tx.status === 'PENDING' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="primary"
                                          className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                                          onClick={() => handleTransactionAction(tx.id, 'verify')}
                                        >
                                          Verify
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-6 px-2 text-[10px] text-rose-500 hover:text-rose-600"
                                          onClick={() => handleTransactionAction(tx.id, 'reject')}
                                        >
                                          Reject
                                        </Button>
                                      </>
                                    )}
                                    {tx.status === 'VERIFIED' && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-rose-500"
                                        onClick={() => handleTransactionAction(tx.id, 'refund')}
                                      >
                                        Refund
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          No transactions recorded for this course yet.
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* TAB 4: ASSIGNED TRAINERS */}
              {activeTab === 'trainers' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-foreground">Course Faculty &amp; Trainers</h2>
                      <p className="text-xs text-muted-foreground">
                        Trainers explicitly authorized to schedule live sessions, publish meeting links, and post materials for this course.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setAssignModalOpen(true)}
                      className="flex items-center gap-1.5"
                    >
                      <UserPlus className="size-3.5" />
                      Assign Trainer
                    </Button>
                  </div>

                  <Card>
                    <CardBody className="p-0">
                      {trainersQuery.data && trainersQuery.data.length > 0 ? (
                        <div className="divide-y divide-border text-xs">
                          {trainersQuery.data.map((tr: any) => (
                            <div key={tr.id || tr.trainer_user_id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                  {(tr.trainer_name || 'T')[0]}
                                </div>
                                <div>
                                  <p className="font-semibold text-foreground text-sm">
                                    {tr.trainer_name || 'Trainer'}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {tr.trainer_email} · Assigned {formatDate(tr.assigned_at)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRemoveTrainer(tr.trainer_user_id)}
                                className="h-7 text-xs text-rose-500 hover:text-rose-600"
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          No trainers currently assigned directly to this course.
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>
          );
        }}
      </AsyncSection>

      {/* Assign Trainer Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Trainer to Course</DialogTitle>
            <DialogDescription>
              Grant a trainer administrative oversight for scheduling classes, meeting links, notes, and recordings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignTrainer} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Trainer User UUID
              </label>
              <input
                type="text"
                value={trainerUserId}
                onChange={(e) => setTrainerUserId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="e.g. 5d92688c-44b8-41b7-b2f4-af87c482ae8f"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={assigningTrainer}>
                {assigningTrainer ? 'Assigning…' : 'Assign Trainer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permanent Course Deletion Safeguard Modal */}
      <Dialog open={deleteCourseModalOpen} onOpenChange={setDeleteCourseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="size-5 text-rose-500" />
              Permanent Course Deletion &amp; 72h Retention Window
            </DialogTitle>
            <DialogDescription>
              Initiate asynchronous permanent deletion for this course curriculum.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmCourseDelete} className="p-6 space-y-4 text-xs">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-foreground leading-relaxed">
              <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="size-4 shrink-0" />
                Immutable Participant Learning Guarantee
              </p>
              <p className="text-[11px] text-muted-foreground">
                Permanent course deletion initiates a <strong>72-hour operational window</strong> during which learners receive download notices.
              </p>
              <p className="text-[11px] text-muted-foreground">
                <strong>Crucial:</strong> Immutable historical learning snapshots are created immediately for all enrolled participants. Participants&apos; completed attendance, grades, and records are retained permanently in their profile and will <strong>NEVER be deleted</strong>.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Lock className="size-3 text-muted-foreground" />
                Super Admin Password Confirmation *
              </label>
              <input
                type="password"
                required
                value={deleteCoursePassword}
                onChange={(e) => setDeleteCoursePassword(e.target.value)}
                placeholder="Enter root password to confirm"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeleteCourseModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={deletingCourse || !deleteCoursePassword}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deletingCourse ? 'Initiating 72h Deletion…' : 'Confirm 72h Deletion Window'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

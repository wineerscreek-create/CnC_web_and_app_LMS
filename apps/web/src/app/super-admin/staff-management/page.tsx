'use client';

import {
  AlertTriangle,
  Award,
  Ban,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  GraduationCap,
  Key,
  Layers,
  Loader2,
  Lock,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
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

interface StaffUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  phone: string;
  employeeId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'TRAINER';
  collegeId?: string | null;
  institutionId?: string | null;
  collegeName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  designation?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  affiliationType?: 'INSTITUTION' | 'ONLINE' | 'PLATFORM';
  status: 'active' | 'suspended' | 'inactive';
  accountStatus: string;
  mustChangePassword: boolean;
  activationToken?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

interface CourseInvitation {
  id: string;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  category?: string;
  trainerUserId: string;
  trainerName: string;
  trainerEmail: string;
  institutionId?: string | null;
  institutionName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
  notes?: string | null;
  proposedStartDate?: string | null;
  proposedEndDate?: string | null;
  responseNotes?: string | null;
  respondedAt?: string | null;
  createdAt: string;
}

interface StaffMetrics {
  totalStaff: number;
  totalAdmins: number;
  totalHods: number;
  totalTrainers: number;
  activeStaff: number;
  pendingFirstLogin: number;
  pendingInvitations: number;
  suspendedStaff: number;
}

interface UsersApiResponse {
  items: StaffUser[];
  total: number;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function SuperAdminStaffManagementPage() {
  const [activeTab, setActiveTab] = React.useState<'directory' | 'invitations'>('directory');
  
  // Filter states
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [collegeFilter, setCollegeFilter] = React.useState<string>('all');
  const [affiliationFilter, setAffiliationFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>('');
  const [page, setPage] = React.useState<number>(1);

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Queries
  const staffQuery = useApi<UsersApiResponse>('/super-admin/users', {
    role: roleFilter !== 'all' ? roleFilter : undefined,
    college_id: collegeFilter !== 'all' ? collegeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    affiliation_type: affiliationFilter !== 'all' ? affiliationFilter : undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize: 20,
  });

  const metricsQuery = useApi<{ success: boolean; data: StaffMetrics }>('/super-admin/staff/metrics');
  const metrics = metricsQuery.data?.data ?? {
    totalStaff: 0,
    totalAdmins: 0,
    totalHods: 0,
    totalTrainers: 0,
    activeStaff: 0,
    pendingFirstLogin: 0,
    pendingInvitations: 0,
    suspendedStaff: 0,
  };

  const collegesQuery = useApi<any[]>('/super-admin/colleges', undefined, {
    select: (res) => res.data ?? res,
  });
  const colleges = Array.isArray(collegesQuery.data) ? collegesQuery.data : [];

  const coursesQuery = useApi<any[]>('/super-admin/courses', undefined, {
    select: (res) => (res.items ?? res.data ?? res),
  });
  const courses = Array.isArray(coursesQuery.data) ? coursesQuery.data : [];

  const invitationsQuery = useApi<{ items: CourseInvitation[] }>('/super-admin/staff/course-invitations', undefined, {
    select: (res) => res.data ?? res,
  });
  const invitations = invitationsQuery.data?.items ?? [];

  // Provisioning Modal State
  const [provisionOpen, setProvisionOpen] = React.useState(false);
  const [provisioning, setProvisioning] = React.useState(false);
  const [provisionForm, setProvisionForm] = React.useState({
    name: '',
    email: '',
    mobile: '',
    employeeId: '',
    role: 'TRAINER' as 'TRAINER' | 'ADMIN' | 'HOD' | 'SUPER_ADMIN',
    affiliationType: 'INSTITUTION' as 'INSTITUTION' | 'ONLINE',
    collegeId: '',
    departmentId: '',
    designation: '',
    qualification: '',
    specialization: '',
    temporaryPassword: '',
    passwordMode: 'auto' as 'auto' | 'manual',
  });
  const [provisionResult, setProvisionResult] = React.useState<{
    activationToken: string;
    activationUrl: string;
    temporaryPassword?: string;
    user: any;
  } | null>(null);

  // Dynamic Departments for Provisioning Form
  const [departments, setDepartments] = React.useState<any[]>([]);
  React.useEffect(() => {
    if (!provisionForm.collegeId) {
      setDepartments([]);
      return;
    }
    api.get<any>(`/super-admin/colleges/${provisionForm.collegeId}/departments`)
      .then((res) => {
        const depts = res?.data ?? res ?? [];
        setDepartments(Array.isArray(depts) ? depts : []);
      })
      .catch(() => setDepartments([]));
  }, [provisionForm.collegeId]);

  // Edit Staff Modal State
  const [editOpen, setEditOpen] = React.useState(false);
  const [editingStaff, setEditingStaff] = React.useState<StaffUser | null>(null);
  const [editForm, setEditForm] = React.useState({
    name: '',
    phone: '',
    designation: '',
    qualification: '',
    specialization: '',
    affiliationType: 'INSTITUTION',
    collegeId: '',
    departmentId: '',
  });
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Reset Password Modal State
  const [resetPwdOpen, setResetPwdOpen] = React.useState(false);
  const [resetStaff, setResetStaff] = React.useState<StaffUser | null>(null);
  const [resetTempPassword, setResetTempPassword] = React.useState('');
  const [resettingPwd, setResettingPwd] = React.useState(false);
  const [resetResult, setResetResult] = React.useState<string | null>(null);

  // Offer Course Modal State
  const [offerCourseOpen, setOfferCourseOpen] = React.useState(false);
  const [selectedTrainer, setSelectedTrainer] = React.useState<StaffUser | null>(null);
  const [offerForm, setOfferForm] = React.useState({
    courseId: '',
    notes: '',
    proposedStartDate: '',
    proposedEndDate: '',
    institutionId: '',
  });
  const [offeringCourse, setOfferingCourse] = React.useState(false);

  // Copy feedback states
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleGeneratePassword = () => {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const nums = '23456789';
    const special = '@#!$%';
    const r1 = letters[Math.floor(Math.random() * letters.length)];
    const r2 = lower[Math.floor(Math.random() * lower.length)];
    const r3 = nums[Math.floor(Math.random() * nums.length)];
    const r4 = special[Math.floor(Math.random() * special.length)];
    const rest = Math.random().toString(36).substring(2, 6);
    const pwd = `Staff@${r1}${r2}${r3}${r4}${rest}`;
    setProvisionForm((prev) => ({ ...prev, temporaryPassword: pwd }));
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    try {
      const isOnline = provisionForm.role === 'TRAINER' && provisionForm.affiliationType === 'ONLINE';
      const payload: any = {
        name: provisionForm.name.trim(),
        email: provisionForm.email.trim().toLowerCase(),
        mobile: provisionForm.mobile.trim(),
        employeeId: provisionForm.employeeId.trim(),
        role: provisionForm.role,
        affiliationType: isOnline ? 'ONLINE' : 'INSTITUTION',
        collegeId: isOnline ? undefined : (provisionForm.collegeId || undefined),
        departmentId: isOnline ? undefined : (provisionForm.departmentId || undefined),
        designation: provisionForm.designation.trim(),
        qualification: provisionForm.qualification.trim(),
        specialization: provisionForm.specialization.trim(),
        temporaryPassword: provisionForm.temporaryPassword.trim() || undefined,
      };

      const res = await api.post<any>('/super-admin/users', payload);
      toast.success(`${provisionForm.role} account provisioned successfully!`);
      setProvisionResult({
        activationToken: res.activationToken,
        activationUrl: res.activationUrl,
        temporaryPassword: res.temporaryPassword,
        user: res.data,
      });
      staffQuery.refetch();
      metricsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to provision user.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleStatusToggle = async (user: StaffUser) => {
    const nextAction = user.status === 'active' ? 'suspend' : 'activate';
    try {
      await api.post(`/super-admin/users/${user.id}/${nextAction}`);
      toast.success(`Staff user ${user.name} is now ${nextAction === 'activate' ? 'active' : 'suspended'}.`);
      staffQuery.refetch();
      metricsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status.');
    }
  };

  const handleOpenEdit = (user: StaffUser) => {
    setEditingStaff(user);
    setEditForm({
      name: user.name || '',
      phone: user.phone || user.mobile || '',
      designation: user.designation || '',
      qualification: user.qualification || '',
      specialization: user.specialization || '',
      affiliationType: user.affiliationType || 'INSTITUTION',
      collegeId: user.collegeId || '',
      departmentId: user.departmentId || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setSavingEdit(true);
    try {
      await api.patch(`/super-admin/users/${editingStaff.id}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        designation: editForm.designation.trim(),
        qualification: editForm.qualification.trim(),
        specialization: editForm.specialization.trim(),
        affiliationType: editForm.affiliationType,
        collegeId: editForm.collegeId || '',
        departmentId: editForm.departmentId || '',
      });
      toast.success('Staff details updated successfully.');
      setEditOpen(false);
      staffQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update staff details.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenResetPwd = (user: StaffUser) => {
    setResetStaff(user);
    setResetResult(null);
    setResetTempPassword(`Temp@${Math.random().toString(36).substring(2, 6).toUpperCase()}#!`);
    setResetPwdOpen(true);
  };

  const handleExecuteResetPwd = async () => {
    if (!resetStaff) return;
    setResettingPwd(true);
    try {
      const res = await api.post<any>(`/super-admin/users/${resetStaff.id}/reset-password`, {
        temporaryPassword: resetTempPassword.trim(),
      });
      toast.success('Temporary password configured successfully.');
      setResetResult(res.temporaryPassword || resetTempPassword);
      staffQuery.refetch();
      metricsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password.');
    } finally {
      setResettingPwd(false);
    }
  };

  const handleOpenOfferCourse = (trainer: StaffUser) => {
    setSelectedTrainer(trainer);
    setOfferForm({
      courseId: courses[0]?.id || '',
      notes: '',
      proposedStartDate: '',
      proposedEndDate: '',
      institutionId: trainer.collegeId || '',
    });
    setOfferCourseOpen(true);
  };

  const handleOfferCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrainer || !offerForm.courseId) return;
    setOfferingCourse(true);
    try {
      await api.post('/super-admin/staff/course-invitations', {
        trainerUserId: selectedTrainer.id,
        courseId: offerForm.courseId,
        institutionId: offerForm.institutionId || undefined,
        notes: offerForm.notes.trim() || undefined,
        proposedStartDate: offerForm.proposedStartDate || undefined,
        proposedEndDate: offerForm.proposedEndDate || undefined,
      });
      toast.success(`Course teaching offer sent to ${selectedTrainer.name}. Pending their acceptance.`);
      setOfferCourseOpen(false);
      invitationsQuery.refetch();
      metricsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to offer course.');
    } finally {
      setOfferingCourse(false);
    }
  };

  const handleWithdrawInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to withdraw this course invitation?')) return;
    try {
      await api.delete(`/super-admin/staff/course-invitations/${invitationId}`);
      toast.success('Course invitation withdrawn.');
      invitationsQuery.refetch();
      metricsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to withdraw invitation.');
    }
  };

  const staffItems = staffQuery.data?.items ?? [];
  const pagination = staffQuery.data?.pagination ?? {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  };

  const getRoleTone = (role: string): 'indigo' | 'purple' | 'teal' | 'amber' | 'neutral' => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'purple';
      case 'ADMIN':
        return 'indigo';
      case 'HOD':
        return 'teal';
      case 'TRAINER':
        return 'amber';
      default:
        return 'neutral';
    }
  };

  return (
    <GlobalPageBackground image="/images/backgrounds/users.webp" variant="dark">
      <div className="space-y-6">
        <PageHeader
          title="Staff Management & Provisioning"
          description="Provision institutional leadership, department HODs, and independent trainers with centralized RBAC and course assignment workflows."
          actions={
            <div className="flex items-center gap-3">
              <Link href="/super-admin/users">
                <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  All Users
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setProvisionResult(null);
                  setProvisionForm({
                    name: '',
                    email: '',
                    mobile: '',
                    employeeId: '',
                    role: 'TRAINER',
                    affiliationType: 'INSTITUTION',
                    collegeId: colleges[0]?.id || '',
                    departmentId: '',
                    designation: '',
                    qualification: '',
                    specialization: '',
                    temporaryPassword: '',
                    passwordMode: 'auto',
                  });
                  setProvisionOpen(true);
                }}
                className="flex items-center gap-1.5 shadow-sm"
              >
                <UserPlus className="size-4" />
                Provision Staff Account
              </Button>
            </div>
          }
        />

        {/* Top Operational Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="Total Staff" value={metrics.totalStaff} icon={<Shield className="size-4 text-indigo-500" />} />
          <StatCard label="College Admins" value={metrics.totalAdmins} icon={<Building2 className="size-4 text-blue-500" />} />
          <StatCard label="Dept HODs" value={metrics.totalHods} icon={<Layers className="size-4 text-teal-500" />} />
          <StatCard label="Trainers" value={metrics.totalTrainers} icon={<GraduationCap className="size-4 text-amber-500" />} />
          <StatCard label="Active Staff" value={metrics.activeStaff} icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
          <StatCard label="Pending 1st Login" value={metrics.pendingFirstLogin} icon={<Key className="size-4 text-orange-500" />} />
          <StatCard label="Pending Invites" value={metrics.pendingInvitations} icon={<Clock className="size-4 text-amber-500" />} />
          <StatCard label="Suspended" value={metrics.suspendedStaff} icon={<Ban className="size-4 text-rose-500" />} />
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
              activeTab === 'directory'
                ? 'text-primary border-b-2 border-primary font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="size-4" />
            Staff Directory
            <Badge tone="indigo" className="ml-1">
              {num(pagination.total)}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invitations')}
            className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
              activeTab === 'invitations'
                ? 'text-primary border-b-2 border-primary font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Award className="size-4" />
            Course Invitations & Acceptance
            {metrics.pendingInvitations > 0 && (
              <Badge tone="amber" dot>
                {metrics.pendingInvitations} Pending
              </Badge>
            )}
          </button>
        </div>

        {/* TAB 1: STAFF DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="space-y-4">
            {/* Filters */}
            <Card>
              <CardBody className="p-4">
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search staff by name, email, phone, or ID…"
                      className="pl-9 text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={roleFilter}
                      onChange={(e) => {
                        setRoleFilter(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                    >
                      <option value="all">All Roles</option>
                      <option value="ADMIN">College Administrator</option>
                      <option value="HOD">Department HOD / SPOC</option>
                      <option value="TRAINER">Trainer</option>
                      <option value="SUPER_ADMIN">Platform Super Admin</option>
                    </select>

                    <select
                      value={affiliationFilter}
                      onChange={(e) => {
                        setAffiliationFilter(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                    >
                      <option value="all">All Affiliations</option>
                      <option value="INSTITUTION">Institution Affiliated</option>
                      <option value="ONLINE">Independent / Online</option>
                    </select>

                    <select
                      value={collegeFilter}
                      onChange={(e) => {
                        setCollegeFilter(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium max-w-[200px] truncate"
                    >
                      <option value="all">All Institutions</option>
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                    >
                      <option value="all">All Statuses</option>
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => staffQuery.refetch()}
                      className="size-8 p-0"
                      title="Refresh Staff List"
                    >
                      <RefreshCw className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                    <tr>
                      <th className="px-4 py-3">Staff Member</th>
                      <th className="px-4 py-3">Role & Scope</th>
                      <th className="px-4 py-3">Designation & Credentials</th>
                      <th className="px-4 py-3">Security & Password</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {staffQuery.loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
                          Loading privileged staff records…
                        </td>
                      </tr>
                    ) : staffItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          <Users className="size-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p className="font-semibold text-sm text-foreground">No staff members found</p>
                          <p className="text-xs mt-1">Adjust filters or click &ldquo;Provision Staff Account&rdquo; to onboard staff.</p>
                        </td>
                      </tr>
                    ) : (
                      staffItems.map((u) => {
                        const isTrainer = u.role === 'TRAINER';
                        const isOnline = u.affiliationType === 'ONLINE';

                        return (
                          <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                            {/* Member info */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="size-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                                  {u.name ? u.name.substring(0, 2).toUpperCase() : 'ST'}
                                </div>
                                <div>
                                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                                    {u.name}
                                    {u.employeeId && (
                                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {u.employeeId}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                    <span>{u.email}</span>
                                    {(u.phone || u.mobile) && (
                                      <>
                                        <span>•</span>
                                        <span>{u.phone || u.mobile}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role & Scope */}
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <Badge tone={getRoleTone(u.role)}>
                                  {u.role.replace('_', ' ')}
                                </Badge>
                                <div className="text-[11px] text-muted-foreground font-medium">
                                  {u.role === 'SUPER_ADMIN' ? (
                                    <span className="text-purple-700 font-semibold">Global Platform Scope</span>
                                  ) : isOnline ? (
                                    <span className="text-indigo-600 font-semibold">Independent / Online</span>
                                  ) : (
                                    <span>
                                      {u.collegeName || 'Unassigned College'}
                                      {u.departmentName && ` • Dept of ${u.departmentName}`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Designation */}
                            <td className="px-4 py-3">
                              <div className="space-y-0.5">
                                <div className="font-medium text-foreground">{u.designation || 'Staff'}</div>
                                {(u.qualification || u.specialization) && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {[u.qualification, u.specialization].filter(Boolean).join(' • ')}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Password / Security */}
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                {u.mustChangePassword ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                    <Key className="size-3" />
                                    Must Change Pwd
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                    <Check className="size-3" />
                                    Password Set
                                  </span>
                                )}
                                <div className="text-[10px] text-muted-foreground">
                                  {u.lastLoginAt ? `Login: ${formatDate(u.lastLoginAt)}` : 'Never logged in'}
                                </div>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <Badge
                                tone={
                                  u.status === 'active'
                                    ? 'success'
                                    : u.status === 'suspended'
                                    ? 'danger'
                                    : 'neutral'
                                }
                              >
                                {u.status.toUpperCase()}
                              </Badge>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isTrainer && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleOpenOfferCourse(u)}
                                    className="text-[11px] h-7 px-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    title="Offer course teaching assignment"
                                  >
                                    <Send className="size-3 mr-1" />
                                    Offer Course
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenResetPwd(u)}
                                  className="text-[11px] h-7 px-2 text-slate-600 hover:text-slate-900"
                                  title="Reset password"
                                >
                                  <Key className="size-3 mr-1" />
                                  Reset Pwd
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEdit(u)}
                                  className="text-[11px] h-7 px-2 text-slate-600 hover:text-slate-900"
                                  title="Edit details"
                                >
                                  Edit
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleStatusToggle(u)}
                                  className={`text-[11px] h-7 px-2 ${
                                    u.status === 'active'
                                      ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                                      : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                  title={u.status === 'active' ? 'Suspend Staff' : 'Activate Staff'}
                                >
                                  {u.status === 'active' ? 'Suspend' : 'Activate'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <div>
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} staff members)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!pagination.hasPrev}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="size-7 p-0"
                    >
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!pagination.hasNext}
                      onClick={() => setPage((p) => p + 1)}
                      className="size-7 p-0"
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: COURSE INVITATIONS WORKFLOW */}
        {activeTab === 'invitations' && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Award className="size-4 text-indigo-600" />
                    Course Invitations & Assignment Protocol
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Courses offered by Super Admin remain in PENDING state until explicitly accepted by the Trainer in their portal.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => invitationsQuery.refetch()}
                  className="size-8 p-0"
                >
                  <RefreshCw className="size-3.5 text-muted-foreground" />
                </Button>
              </CardHeader>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                    <tr>
                      <th className="px-4 py-3">Course Offered</th>
                      <th className="px-4 py-3">Target Trainer</th>
                      <th className="px-4 py-3">Institution / Batch Scope</th>
                      <th className="px-4 py-3">Dates & Notes</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invitationsQuery.loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
                          Loading course invitations…
                        </td>
                      </tr>
                    ) : invitations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          <Award className="size-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p className="font-semibold text-sm text-foreground">No course invitations found</p>
                          <p className="text-xs mt-1">
                            Go to Staff Directory, click &ldquo;Offer Course&rdquo; on any Trainer to send a teaching invitation.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      invitations.map((inv) => {
                        const isPending = inv.status === 'PENDING';
                        const isAccepted = inv.status === 'ACCEPTED';
                        const isRejected = inv.status === 'REJECTED';
                        const isWithdrawn = inv.status === 'WITHDRAWN';

                        return (
                          <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                            {/* Course */}
                            <td className="px-4 py-3">
                              <div className="font-semibold text-foreground">{inv.courseTitle}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">{inv.courseCode}</div>
                            </td>

                            {/* Trainer */}
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{inv.trainerName}</div>
                              <div className="text-[11px] text-muted-foreground">{inv.trainerEmail}</div>
                            </td>

                            {/* Scope */}
                            <td className="px-4 py-3">
                              <div className="text-[11px] text-foreground font-medium">
                                {inv.institutionName || 'All Institutions (Open)'}
                              </div>
                              {inv.departmentName && (
                                <div className="text-[10px] text-muted-foreground">Dept: {inv.departmentName}</div>
                              )}
                              {inv.batchName && (
                                <div className="text-[10px] text-indigo-600 font-semibold">Batch: {inv.batchName}</div>
                              )}
                            </td>

                            {/* Dates & Notes */}
                            <td className="px-4 py-3">
                              <div className="text-[11px] text-foreground">
                                {inv.proposedStartDate ? `${inv.proposedStartDate} to ${inv.proposedEndDate || 'Open'}` : 'Flexible timeline'}
                              </div>
                              {inv.notes && (
                                <div className="text-[10px] text-muted-foreground italic truncate max-w-xs" title={inv.notes}>
                                  &ldquo;{inv.notes}&rdquo;
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <Badge
                                tone={
                                  isAccepted
                                    ? 'success'
                                    : isPending
                                    ? 'amber'
                                    : isRejected
                                    ? 'danger'
                                    : 'neutral'
                                }
                              >
                                {inv.status}
                              </Badge>
                              {inv.respondedAt && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  Responded {formatDate(inv.respondedAt)}
                                </div>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3 text-right">
                              {isPending ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleWithdrawInvitation(inv.id)}
                                  className="text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7"
                                >
                                  Withdraw Offer
                                </Button>
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* DIALOG 1: PROVISION PRIVILEGED STAFF ACCOUNT */}
        <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <UserPlus className="size-5 text-indigo-600" />
                Provision Privileged Staff Account
              </DialogTitle>
              <DialogDescription className="text-xs">
                Creates a centralized identity record across LMS portals with a secure initial password and forced first-login password update.
              </DialogDescription>
            </DialogHeader>

            {provisionResult ? (
              <div className="space-y-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  Account Successfully Provisioned!
                </div>
                <div className="text-xs text-emerald-700">
                  Account is active. The staff member has been flagged with <strong>Must Change Password</strong> on their first login.
                </div>

                {provisionResult.temporaryPassword && (
                  <div className="space-y-1.5 bg-white p-3 rounded-lg border border-emerald-200 shadow-xs">
                    <label className="text-xs font-semibold text-slate-800">Generated Initial Password:</label>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={provisionResult.temporaryPassword}
                        className="flex-1 bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg font-mono font-bold text-indigo-700"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(provisionResult.temporaryPassword!, 'res_pwd')}
                        className="flex items-center gap-1 shrink-0"
                      >
                        {copiedKey === 'res_pwd' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copiedKey === 'res_pwd' ? 'Copied' : 'Copy Pwd'}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 bg-white p-3 rounded-lg border border-emerald-200 shadow-xs">
                  <label className="text-xs font-semibold text-slate-800">Direct Activation Link:</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}${provisionResult.activationUrl}`}
                      className="flex-1 bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg font-mono text-slate-600 truncate"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(`${window.location.origin}${provisionResult.activationUrl}`, 'res_url')}
                      className="flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'res_url' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedKey === 'res_url' ? 'Copied' : 'Copy Link'}
                    </Button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setProvisionOpen(false);
                      setProvisionResult(null);
                    }}
                  >
                    Done & Close
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProvisionSubmit} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full Name" htmlFor="pName" required>
                    <Input
                      id="pName"
                      required
                      value={provisionForm.name}
                      onChange={(e) => setProvisionForm({ ...provisionForm, name: e.target.value })}
                      placeholder="Dr. Rajesh Sharma"
                    />
                  </Field>

                  <Field label="Institutional / Staff Email" htmlFor="pEmail" required>
                    <Input
                      id="pEmail"
                      type="email"
                      required
                      value={provisionForm.email}
                      onChange={(e) => setProvisionForm({ ...provisionForm, email: e.target.value })}
                      placeholder="rsharma@winnerscreek.com"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Staff Role" htmlFor="pRole" required>
                    <select
                      id="pRole"
                      value={provisionForm.role}
                      onChange={(e) =>
                        setProvisionForm({
                          ...provisionForm,
                          role: e.target.value as any,
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                    >
                      <option value="TRAINER">Lead Trainer / Trainer</option>
                      <option value="HOD">Department HOD / SPOC</option>
                      <option value="ADMIN">Institutional Administrator</option>
                      <option value="SUPER_ADMIN">Platform Super Admin</option>
                    </select>
                  </Field>

                  <Field label="Mobile Number" htmlFor="pMobile">
                    <Input
                      id="pMobile"
                      value={provisionForm.mobile}
                      onChange={(e) => setProvisionForm({ ...provisionForm, mobile: e.target.value })}
                      placeholder="+91 98765 43210"
                    />
                  </Field>

                  <Field label="Employee ID / Staff Code" htmlFor="pEmpId">
                    <Input
                      id="pEmpId"
                      value={provisionForm.employeeId}
                      onChange={(e) => setProvisionForm({ ...provisionForm, employeeId: e.target.value })}
                      placeholder="STF-2026-01"
                    />
                  </Field>
                </div>

                {/* Trainer Affiliation Scope */}
                {provisionForm.role === 'TRAINER' && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800">Trainer Affiliation Type</label>
                      <span className="text-[11px] text-muted-foreground">Select independent or college-linked</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition-all ${
                          provisionForm.affiliationType === 'INSTITUTION'
                            ? 'border-primary bg-primary/5 font-semibold text-primary'
                            : 'border-border bg-card text-muted-foreground'
                        }`}
                      >
                        <input
                          type="radio"
                          name="pAffil"
                          checked={provisionForm.affiliationType === 'INSTITUTION'}
                          onChange={() => setProvisionForm({ ...provisionForm, affiliationType: 'INSTITUTION' })}
                          className="text-primary focus:ring-primary"
                        />
                        <span>Institution-Affiliated Trainer</span>
                      </label>
                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs transition-all ${
                          provisionForm.affiliationType === 'ONLINE'
                            ? 'border-indigo-500 bg-indigo-50/50 font-semibold text-indigo-700'
                            : 'border-border bg-card text-muted-foreground'
                        }`}
                      >
                        <input
                          type="radio"
                          name="pAffil"
                          checked={provisionForm.affiliationType === 'ONLINE'}
                          onChange={() =>
                            setProvisionForm({
                              ...provisionForm,
                              affiliationType: 'ONLINE',
                              collegeId: '',
                              departmentId: '',
                            })
                          }
                          className="text-indigo-600 focus:ring-indigo-600"
                        />
                        <span>Independent / Online Trainer</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Institution & Department Mapping */}
                {provisionForm.role !== 'SUPER_ADMIN' &&
                  !(provisionForm.role === 'TRAINER' && provisionForm.affiliationType === 'ONLINE') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Target Institution / College" htmlFor="pCollege" required>
                        <select
                          id="pCollege"
                          required
                          value={provisionForm.collegeId}
                          onChange={(e) =>
                            setProvisionForm({
                              ...provisionForm,
                              collegeId: e.target.value,
                              departmentId: '',
                            })
                          }
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                        >
                          <option value="">Select College…</option>
                          {colleges.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code})
                            </option>
                          ))}
                        </select>
                      </Field>

                      {provisionForm.role === 'HOD' ? (
                        <Field label="Department (Branch)" htmlFor="pDept" required>
                          <select
                            id="pDept"
                            required
                            value={provisionForm.departmentId}
                            onChange={(e) => setProvisionForm({ ...provisionForm, departmentId: e.target.value })}
                            disabled={!provisionForm.collegeId || departments.length === 0}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                          >
                            <option value="">
                              {departments.length === 0
                                ? provisionForm.collegeId
                                  ? 'No departments found'
                                  : 'Select College first'
                                : 'Select Department…'}
                            </option>
                            {departments.map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.code})
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : (
                        <Field label="Designation / Title" htmlFor="pDesig">
                          <Input
                            id="pDesig"
                            value={provisionForm.designation}
                            onChange={(e) => setProvisionForm({ ...provisionForm, designation: e.target.value })}
                            placeholder="Senior Technical Trainer"
                          />
                        </Field>
                      )}
                    </div>
                  )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Qualification" htmlFor="pQual">
                    <Input
                      id="pQual"
                      value={provisionForm.qualification}
                      onChange={(e) => setProvisionForm({ ...provisionForm, qualification: e.target.value })}
                      placeholder="M.Tech CSE, Ph.D, MBA"
                    />
                  </Field>

                  <Field label="Specialization & Skills" htmlFor="pSpec">
                    <Input
                      id="pSpec"
                      value={provisionForm.specialization}
                      onChange={(e) => setProvisionForm({ ...provisionForm, specialization: e.target.value })}
                      placeholder="Cloud Architecture, Python, DSA, AI/ML"
                    />
                  </Field>
                </div>

                {/* Explicit Password Handling */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Key className="size-3.5 text-indigo-600" />
                      Temporary Password Configuration
                    </label>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      Must Change on 1st Login
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                      <input
                        type="radio"
                        name="pwdMode"
                        checked={provisionForm.passwordMode === 'auto'}
                        onChange={() => {
                          setProvisionForm({ ...provisionForm, passwordMode: 'auto' });
                          handleGeneratePassword();
                        }}
                      />
                      <span>Auto-generate secure password</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                      <input
                        type="radio"
                        name="pwdMode"
                        checked={provisionForm.passwordMode === 'manual'}
                        onChange={() => setProvisionForm({ ...provisionForm, passwordMode: 'manual', temporaryPassword: '' })}
                      />
                      <span>Enter custom password</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      id="pTempPwd"
                      value={provisionForm.temporaryPassword}
                      onChange={(e) => setProvisionForm({ ...provisionForm, temporaryPassword: e.target.value })}
                      placeholder="Click 'Generate Random' or type password"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleGeneratePassword}
                      className="shrink-0 text-xs"
                    >
                      <Sparkles className="size-3.5 mr-1 text-indigo-600" />
                      Generate
                    </Button>
                    {provisionForm.temporaryPassword && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(provisionForm.temporaryPassword, 'preview_pwd')}
                        className="shrink-0 text-xs"
                      >
                        {copiedKey === 'preview_pwd' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copiedKey === 'preview_pwd' ? 'Copied' : 'Copy'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setProvisionOpen(false)}
                    disabled={provisioning}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={provisioning}
                    disabled={provisioning || !provisionForm.name || !provisionForm.email}
                  >
                    Provision Staff Account
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* DIALOG 2: EDIT STAFF DETAILS */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Edit Staff Profile</DialogTitle>
              <DialogDescription className="text-xs">
                Update credential details, contact info, and department scoping for {editingStaff?.name}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
              <Field label="Full Name" htmlFor="eName" required>
                <Input
                  id="eName"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Phone / Mobile" htmlFor="ePhone">
                  <Input
                    id="ePhone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </Field>

                <Field label="Designation" htmlFor="eDesig">
                  <Input
                    id="eDesig"
                    value={editForm.designation}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Qualification" htmlFor="eQual">
                  <Input
                    id="eQual"
                    value={editForm.qualification}
                    onChange={(e) => setEditForm({ ...editForm, qualification: e.target.value })}
                  />
                </Field>

                <Field label="Specialization" htmlFor="eSpec">
                  <Input
                    id="eSpec"
                    value={editForm.specialization}
                    onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })}
                  />
                </Field>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={savingEdit}>
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* DIALOG 3: RESET STAFF PASSWORD */}
        <Dialog open={resetPwdOpen} onOpenChange={setResetPwdOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Key className="size-4 text-indigo-600" />
                Reset Temporary Password
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure a new initial password for <strong>{resetStaff?.name}</strong> ({resetStaff?.email}).
              </DialogDescription>
            </DialogHeader>

            {resetResult ? (
              <div className="space-y-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Password successfully reset!
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={resetResult}
                    className="flex-1 bg-white border border-emerald-300 text-xs px-3 py-2 rounded-lg font-mono font-bold text-indigo-700"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(resetResult, 'rst_res')}
                    className="shrink-0"
                  >
                    {copiedKey === 'rst_res' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiedKey === 'rst_res' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-[11px] text-emerald-700">
                  The user must change this password upon their next login.
                </p>
                <div className="pt-2 flex justify-end">
                  <Button variant="primary" size="sm" onClick={() => setResetPwdOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800">New Temporary Password:</label>
                    <button
                      type="button"
                      onClick={() =>
                        setResetTempPassword(`Temp@${Math.random().toString(36).substring(2, 6).toUpperCase()}#!`)
                      }
                      className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium underline"
                    >
                      Generate Random
                    </button>
                  </div>
                  <Input
                    value={resetTempPassword}
                    onChange={(e) => setResetTempPassword(e.target.value)}
                    className="font-mono text-xs font-bold"
                  />
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">
                  Staff member will be prompted immediately to set their own permanent password on login.
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => setResetPwdOpen(false)} disabled={resettingPwd}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleExecuteResetPwd}
                    loading={resettingPwd}
                    disabled={!resetTempPassword.trim()}
                  >
                    Set Password
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* DIALOG 4: OFFER COURSE TO TRAINER */}
        <Dialog open={offerCourseOpen} onOpenChange={setOfferCourseOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Send className="size-4 text-indigo-600" />
                Offer Course Teaching Assignment
              </DialogTitle>
              <DialogDescription className="text-xs">
                Offer a course to <strong>{selectedTrainer?.name}</strong>. The course will not auto-assign until the trainer explicitly accepts.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleOfferCourseSubmit} className="space-y-4 pt-2">
              <Field label="Select Course" htmlFor="oCourse" required>
                <select
                  id="oCourse"
                  required
                  value={offerForm.courseId}
                  onChange={(e) => setOfferForm({ ...offerForm, courseId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                >
                  <option value="">Select Course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.code})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Target Institution (Optional)" htmlFor="oInst">
                <select
                  id="oInst"
                  value={offerForm.institutionId}
                  onChange={(e) => setOfferForm({ ...offerForm, institutionId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground font-medium"
                >
                  <option value="">All Institutions / Global Program</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Proposed Start Date" htmlFor="oStart">
                  <Input
                    id="oStart"
                    type="date"
                    value={offerForm.proposedStartDate}
                    onChange={(e) => setOfferForm({ ...offerForm, proposedStartDate: e.target.value })}
                  />
                </Field>

                <Field label="Proposed End Date" htmlFor="oEnd">
                  <Input
                    id="oEnd"
                    type="date"
                    value={offerForm.proposedEndDate}
                    onChange={(e) => setOfferForm({ ...offerForm, proposedEndDate: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Teaching Notes & Syllabus Highlights" htmlFor="oNotes">
                <textarea
                  id="oNotes"
                  rows={3}
                  value={offerForm.notes}
                  onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                  placeholder="Outline schedule, expected hours per week, student batch sizes, etc."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
                />
              </Field>

              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-2.5 text-[11px] text-indigo-800">
                <strong>Protocol Notice:</strong> The trainer will receive this offer in their portal under &ldquo;Course Invitations&rdquo; with options to Accept or Decline.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOfferCourseOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={offeringCourse} disabled={!offerForm.courseId}>
                  Send Teaching Offer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </GlobalPageBackground>
  );
}

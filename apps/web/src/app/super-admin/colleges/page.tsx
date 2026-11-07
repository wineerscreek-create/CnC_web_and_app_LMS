'use client';

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Edit2,
  GraduationCap,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
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

interface College {
  id: string;
  name: string;
  code: string;
  address: string;
  contact: {
    email?: string;
    phone?: string;
  };
  status: string;
  timezone: string;
  institutionType?: string;
  trainingType?: string;
  campusesCount?: number;
  departmentsCount: number;
  studentsCount: number;
  participantsCount?: number;
  trainersCount: number;
  createdAt: string;
}

export default function SuperAdminCollegesPage() {
  const query = useApi<College[]>('/super-admin/colleges', undefined, {
    select: (res) => res.data ?? res,
  });

  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<'ALL' | 'COLLEGE' | 'SCHOOL' | 'COMPANY' | 'INDIVIDUAL'>('ALL');
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Safe Deletion state
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [selectedCollegeForDeletion, setSelectedCollegeForDeletion] = React.useState<College | null>(null);
  const [deletePassword, setDeletePassword] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deletionPreview, setDeletionPreview] = React.useState<any>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);

  // SPOC Multi-Branch Manager state
  const [spocModalOpen, setSpocModalOpen] = React.useState(false);
  const [spocsList, setSpocsList] = React.useState<any[]>([]);
  const [loadingSpocs, setLoadingSpocs] = React.useState(false);

  // Form state
  const [formName, setFormName] = React.useState('');
  const [formCode, setFormCode] = React.useState('');
  const [formType, setFormType] = React.useState('COLLEGE');
  const [formCampuses, setFormCampuses] = React.useState(1);
  const [formAddress, setFormAddress] = React.useState('');
  const [formEmail, setFormEmail] = React.useState('');
  const [formPhone, setFormPhone] = React.useState('');
  const [formTimezone, setFormTimezone] = React.useState('Asia/Kolkata');

  const colleges: College[] = Array.isArray(query.data) ? query.data : [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!formName || !formCode) return;

    setSubmitting(true);
    try {
      await api.post('/super-admin/institutions/onboard', {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        category: formType,
        campusesCount: Number(formCampuses) || 1,
        address: formAddress.trim(),
        contactEmail: formEmail.trim(),
        contactPhone: formPhone.trim(),
        timezone: formTimezone,
      });
      toast.success(`Institution ${formName} onboarded successfully.`);
      setCreateModalOpen(false);
      setFormName('');
      setFormCode('');
      setFormType('COLLEGE');
      setFormCampuses(1);
      setFormAddress('');
      setFormEmail('');
      setFormPhone('');
      query.refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create institution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDelete = async (college: College) => {
    setSelectedCollegeForDeletion(college);
    setDeletePassword('');
    setDeletionPreview(null);
    setDeleteModalOpen(true);
    setLoadingPreview(true);
    try {
      const res = await api.get<any>(`/super-admin/institutions/${college.id}/deletion-preview`);
      setDeletionPreview(res.data ?? res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load institution dependency preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollegeForDeletion || !deletePassword) return;

    setDeleting(true);
    try {
      const res = await api.post(`/super-admin/institutions/${selectedCollegeForDeletion.id}/delete`, {
        password: deletePassword,
      });
      toast.success(res.message || 'Institution safely archived. Student accounts preserved.');
      setDeleteModalOpen(false);
      setSelectedCollegeForDeletion(null);
      setDeletePassword('');
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete institution. Please verify password.');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenSpocManager = async () => {
    setSpocModalOpen(true);
    setLoadingSpocs(true);
    try {
      const res = await api.get('/super-admin/spocs');
      setSpocsList(res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load SPOCs list');
    } finally {
      setLoadingSpocs(false);
    }
  };

  const toggleCollegeStatus = async (college: College) => {
    const nextStatus = college.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/super-admin/colleges/${college.id}`, {
        status: nextStatus,
      });
      toast.success(`Institution status updated to ${nextStatus}`);
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const filtered = colleges.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.address && c.address.toLowerCase().includes(search.toLowerCase()));

    const instType = (c.institutionType || 'COLLEGE').toUpperCase();
    const matchCat =
      categoryFilter === 'ALL' ||
      (categoryFilter === 'COLLEGE' && (instType === 'COLLEGE' || instType === 'UNIVERSITY')) ||
      (categoryFilter === 'SCHOOL' && instType === 'SCHOOL') ||
      (categoryFilter === 'COMPANY' && (instType === 'COMPANY' || instType === 'CORPORATE')) ||
      (categoryFilter === 'INDIVIDUAL' && instType === 'INDIVIDUAL');

    return matchSearch && matchCat;
  });

  return (
    <GlobalPageBackground image="/images/backgrounds/colleges.webp" variant="dark">
      <div className="space-y-6">
      <PageHeader
        title="Institutions & Multi-Campus Control Center"
        description="Onboard, manage tenant environments, and configure SPOC branch assignments across Colleges, Schools, Corporates, and Individual Learners."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenSpocManager}
              className="flex items-center gap-1.5"
            >
              <Users className="size-4 text-indigo-400" />
              SPOC Branch Matrix
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setErrorMsg('');
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Plus className="size-4" />
              Onboard Institution
            </Button>
          </div>
        }
      />

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {[
          { key: 'ALL', label: 'All Institutions' },
          { key: 'COLLEGE', label: 'Colleges & Universities' },
          { key: 'SCHOOL', label: 'Schools & Academies' },
          { key: 'COMPANY', label: 'Corporate Partners' },
          { key: 'INDIVIDUAL', label: 'Individual Learners' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategoryFilter(tab.key as any)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              categoryFilter === tab.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter and stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by institution name, code, or city…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
          />
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="indigo" dot>
            {filtered.length} Displayed / {colleges.length} Total
          </Badge>
        </div>
      </div>

      {/* Colleges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((college) => (
          <Card
            key={college.id}
            className={cn(
              'flex flex-col justify-between transition-all hover:shadow-md border border-border',
              college.status !== 'active' && 'opacity-70 bg-card/40'
            )}
          >
            <CardBody className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="p-2.5 rounded-xl bg-indigo/10 text-indigo inline-block">
                    <Building2 className="size-5" />
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Badge tone="indigo">
                      {college.institutionType || 'COLLEGE'}
                    </Badge>
                    <Badge tone={college.status === 'active' ? 'success' : 'danger'}>
                      {college.status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-foreground line-clamp-1">
                      {college.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono text-indigo font-bold">{college.code}</span>
                    {college.campusesCount && college.campusesCount > 1 && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {college.campusesCount} Campuses
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {college.address && (
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                      {college.address}
                    </p>
                  )}
                  {college.contact?.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                      {college.contact.email}
                    </p>
                  )}
                  {college.contact?.phone && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                      {college.contact.phone}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-1 text-center">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <p className="font-bold text-foreground text-sm">
                      {num(college.departmentsCount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Branches</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <p className="font-bold text-foreground text-sm">
                      {num(college.participantsCount ?? college.studentsCount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Participants</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <p className="font-bold text-foreground text-sm">
                      {num(college.trainersCount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Trainers</p>
                  </div>
                </div>
              </div>

                <div className="pt-3 border-t border-border">
                  <Button asChild size="sm" variant="secondary" className="w-full text-xs">
                    <Link href={`/super-admin/colleges/${college.id}`} className="flex items-center justify-center gap-1.5">
                      Open Control Center
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground text-[11px]">
                    Onboarded {college.createdAt ? formatDate(college.createdAt) : 'Recently'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleCollegeStatus(college)}
                      className="text-xs flex items-center gap-1 h-7 p-1 text-muted-foreground hover:text-foreground"
                      title={college.status === 'active' ? 'Suspend' : 'Activate'}
                    >
                      <Power className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenDelete(college)}
                      className="text-xs flex items-center gap-1 h-7 p-1 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      title="Safely Archive Institution"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Onboard Institution Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Onboard New Tenant Institution</DialogTitle>
            <DialogDescription>
              Create an isolated tenant workspace for a College, School, Corporate, or Individual learner cohort.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Institution Category *
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
              >
                <option value="COLLEGE">College / University (Semester/Degree programmes)</option>
                <option value="SCHOOL">School / Academy (Foundation/K-12 programmes)</option>
                <option value="COMPANY">Corporate / Enterprise (Executive/Workforce training)</option>
                <option value="INDIVIDUAL">Individual Learner Track (Direct access)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Institution Name *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., National Institute of Technology, Bangalore"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Institution Code (Unique) *
                </label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g., NITB"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Campuses Count
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formCampuses}
                  onChange={(e) => setFormCampuses(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Primary Campus Address
              </label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="e.g., Electronic City Phase 1, Bengaluru, Karnataka"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Admin Contact Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="admin@nitb.edu.in"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Phone
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+91 80 2852 0000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting}
              >
                {submitting ? 'Creating Tenant…' : 'Create Institution'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Safe Archive / Deletion Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="size-5 text-rose-500" />
              Safe Archive Institution
            </DialogTitle>
            <DialogDescription>
              {selectedCollegeForDeletion?.name} ({selectedCollegeForDeletion?.code})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmDelete} className="p-6 space-y-4 text-xs">
            {loadingPreview ? (
              <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
                Auditing institutional dependencies and safety constraints…
              </div>
            ) : deletionPreview ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                  <p className="text-xs font-bold text-foreground">Impact &amp; Dependency Audit:</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Participants:</span>{' '}
                      <strong className="text-emerald-500 font-bold">
                        {deletionPreview.dependencies?.participants ?? 0} (Preserved)
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Staff &amp; HODs:</span>{' '}
                      <strong className="text-amber-500 font-bold">
                        {deletionPreview.dependencies?.staff ?? 0} (Unlinked)
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Departments:</span>{' '}
                      <strong className="text-foreground">
                        {deletionPreview.dependencies?.departments ?? 0}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Batches:</span>{' '}
                      <strong className="text-foreground">
                        {deletionPreview.dependencies?.batches ?? 0}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Course Enrollments:</span>{' '}
                      <strong className="text-emerald-500">
                        {deletionPreview.dependencies?.enrollments ?? 0} (Preserved)
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Targeted Courses:</span>{' '}
                      <strong className="text-foreground">
                        {deletionPreview.dependencies?.associatedCourses ?? 0}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5 text-foreground leading-relaxed">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    Guaranteed Participant Protection
                  </p>
                  <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                    {deletionPreview.preservationGuarantees?.map((g: string, i: number) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-foreground leading-relaxed">
                <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert className="size-4 shrink-0" />
                  Participant Protection Guarantee
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Deleting or archiving an institution <strong>NEVER deletes participant accounts</strong>. All registered students retain access to their profiles, courses, assessments, and verifiable historical certificates.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Affected students are automatically flagged with <em>Affiliation Action Required</em> and prompted to select a new academic institution upon next login.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Lock className="size-3 text-muted-foreground" />
                Super Admin Password Re-authentication *
              </label>
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter root password to confirm"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={deleting || !deletePassword}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? 'Safely Archiving…' : 'Confirm Safe Archive'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* SPOC Multi-Branch Manager Modal */}
      <Dialog open={spocModalOpen} onOpenChange={setSpocModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-indigo-400" />
              SPOC (HOD) Many-to-Many Branch Matrix
            </DialogTitle>
            <DialogDescription>
              A single SPOC can govern multiple academic branches (e.g., CSE, IT, AI&DS). Branch-scoped security is strictly verified server-side.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {loadingSpocs ? (
              <p className="text-xs text-muted-foreground text-center py-6">Loading SPOC matrices…</p>
            ) : spocsList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No SPOCs currently registered.</p>
            ) : (
              <div className="space-y-3">
                {spocsList.map((spoc) => (
                  <div
                    key={spoc.id}
                    className="p-3.5 rounded-xl border border-border bg-card/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground text-sm">{spoc.name}</p>
                        <p className="text-muted-foreground text-[11px]">{spoc.email} · {spoc.institution_name || 'All Campuses'}</p>
                      </div>
                      <Badge tone="indigo">
                        {spoc.assigned_branches?.length || 0} Branches Assigned
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {spoc.assigned_branches && spoc.assigned_branches.length > 0 ? (
                        spoc.assigned_branches.map((b: any) => (
                          <span
                            key={b.branch_id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-mono"
                          >
                            {b.branch_name} ({b.branch_code})
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          No branch assigned yet. SPOC operates across general college scope.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </GlobalPageBackground>
  );
}

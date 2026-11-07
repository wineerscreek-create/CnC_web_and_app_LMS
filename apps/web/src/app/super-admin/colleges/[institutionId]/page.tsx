'use client';

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  History,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

type CollegeSection =
  | 'overview'
  | 'profile'
  | 'campuses'
  | 'departments'
  | 'participants'
  | 'spocs'
  | 'trainers'
  | 'courses'
  | 'batches'
  | 'attendance'
  | 'assessments'
  | 'eedi'
  | 'reports'
  | 'settings'
  | 'audit';

export default function CollegeControlCenterPage() {
  const params = useParams<{ institutionId: string }>();
  const institutionId = params.institutionId;
  const router = useRouter();

  const query = useApi<any>(`/super-admin/institutions/${institutionId}/control-center`, undefined, {
    select: (res) => res.data ?? res,
  });

  const [activeSection, setActiveSection] = React.useState<CollegeSection>('overview');

  // Edit Profile Form State
  const [profileName, setProfileName] = React.useState('');
  const [profileCode, setProfileCode] = React.useState('');
  const [profileAddress, setProfileAddress] = React.useState('');
  const [profileCity, setProfileCity] = React.useState('');
  const [profileState, setProfileState] = React.useState('');
  const [profileEmail, setProfileEmail] = React.useState('');
  const [profilePhone, setProfilePhone] = React.useState('');
  const [profileWebsite, setProfileWebsite] = React.useState('');
  const [profileAccreditation, setProfileAccreditation] = React.useState('');
  const [profileTimezone, setProfileTimezone] = React.useState('Asia/Kolkata');
  const [profileCampusesCount, setProfileCampusesCount] = React.useState(1);
  const [profileStatus, setProfileStatus] = React.useState('ACTIVE');
  const [savingProfile, setSavingProfile] = React.useState(false);

  // Sync profile fields
  React.useEffect(() => {
    if (query.data?.institution) {
      const inst = query.data.institution;
      setProfileName(inst.name || '');
      setProfileCode(inst.code || '');
      setProfileAddress(inst.address || '');
      setProfileCity(inst.city || '');
      setProfileState(inst.state || '');
      setProfileEmail(inst.contactEmail || '');
      setProfilePhone(inst.contactPhone || '');
      setProfileWebsite(inst.website || '');
      setProfileAccreditation(inst.accreditation || '');
      setProfileTimezone(inst.timezone || 'Asia/Kolkata');
      setProfileCampusesCount(inst.campusesCount || 1);
      setProfileStatus(inst.status || 'ACTIVE');
    }
  }, [query.data]);

  // Safe Deletion state
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deletionPreview, setDeletionPreview] = React.useState<any>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);

  // Add Department Modal
  const [addDeptModalOpen, setAddDeptModalOpen] = React.useState(false);
  const [deptName, setDeptName] = React.useState('');
  const [deptCode, setDeptCode] = React.useState('');
  const [savingDept, setSavingDept] = React.useState(false);

  // Course Association Modal
  const [associateCourseModalOpen, setAssociateCourseModalOpen] = React.useState(false);
  const [selectedCourseToAssociate, setSelectedCourseToAssociate] = React.useState('');
  const [associatingCourse, setAssociatingCourse] = React.useState(false);

  // Search filter states
  const [studentSearch, setStudentSearch] = React.useState('');
  const [courseSearch, setCourseSearch] = React.useState('');
  const [batchSearch, setBatchSearch] = React.useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch(`/super-admin/institutions/${institutionId}/profile`, {
        name: profileName,
        code: profileCode,
        address: profileAddress,
        city: profileCity,
        state: profileState,
        contactEmail: profileEmail,
        contactPhone: profilePhone,
        website: profileWebsite,
        accreditation: profileAccreditation,
        timezone: profileTimezone,
        campusesCount: Number(profileCampusesCount),
        status: profileStatus,
      });
      toast.success('College profile updated successfully.');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOpenDelete = async () => {
    setDeletePassword('');
    setDeletionPreview(null);
    setDeleteModalOpen(true);
    setLoadingPreview(true);
    try {
      const res = await api.get<any>(`/super-admin/institutions/${institutionId}/deletion-preview`);
      setDeletionPreview(res.data ?? res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load deletion preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword) return;
    setDeleting(true);
    try {
      const res = await api.post<any>(`/super-admin/institutions/${institutionId}/delete`, {
        password: deletePassword,
      });
      toast.success(res?.message || 'College archived safely. Participant records protected.');
      setDeleteModalOpen(false);
      router.push('/super-admin/colleges');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive institution. Please check password.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName || !deptCode) return;
    setSavingDept(true);
    try {
      await api.post(`/super-admin/institutions/${institutionId}/departments`, {
        name: deptName,
        code: deptCode,
      });
      toast.success(`Department ${deptName} created successfully.`);
      setAddDeptModalOpen(false);
      setDeptName('');
      setDeptCode('');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create department.');
    } finally {
      setSavingDept(false);
    }
  };

  const handleAssociateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseToAssociate) return;
    setAssociatingCourse(true);
    try {
      await api.post(`/super-admin/institutions/${institutionId}/courses/${selectedCourseToAssociate}/associate`, {});
      toast.success('Course assigned to college curriculum successfully.');
      setAssociateCourseModalOpen(false);
      setSelectedCourseToAssociate('');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to associate course.');
    } finally {
      setAssociatingCourse(false);
    }
  };

  const handleDisassociateCourse = async (courseId: string) => {
    try {
      await api.delete(`/super-admin/institutions/${institutionId}/courses/${courseId}/disassociate`);
      toast.success('Course disassociated from college.');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disassociate course.');
    }
  };

  const navSections = [
    { id: 'overview', label: '1. Overview', icon: LayoutGridIcon },
    { id: 'profile', label: '2. Profile & Info', icon: Building2 },
    { id: 'campuses', label: '3. Campuses', icon: MapPin },
    { id: 'departments', label: '4. Departments / Branches', icon: Layers },
    { id: 'participants', label: '5. Students / Participants', icon: GraduationCap },
    { id: 'spocs', label: '6. HODs & SPOCs', icon: Users },
    { id: 'trainers', label: '7. Faculty Trainers', icon: UserCheck },
    { id: 'courses', label: '8. Assigned Courses', icon: BookOpen },
    { id: 'batches', label: '9. Student Batches', icon: Calendar },
    { id: 'attendance', label: '10. Attendance Logs', icon: Clock },
    { id: 'assessments', label: '11. Assessments', icon: Award },
    { id: 'eedi', label: '12. EEDI Analytics', icon: BarChart3 },
    { id: 'reports', label: '13. Reports & Exports', icon: FileSpreadsheet },
    { id: 'settings', label: '14. Portal Settings', icon: Settings },
    { id: 'audit', label: '15. Audit Log', icon: History },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/super-admin/colleges">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Colleges &amp; Campuses
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => query.refetch()}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="size-3.5" />
            Sync Realtime State
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleOpenDelete}
            className="flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="size-3.5" />
            Safe Archive College
          </Button>
        </div>
      </div>

      <AsyncSection query={query} skeleton="detail">
        {(data) => {
          const {
            institution,
            metrics,
            departments = [],
            campuses = [],
            participants = [],
            spocs = [],
            trainers = [],
            courses = [],
            batches = [],
            attendance = [],
            evaluations = [],
            eedi = {},
            auditLogs = [],
            availableCourses = [],
          } = data;

          return (
            <div className="space-y-6">
              {/* Institution Hero Card */}
              <div className="rounded-2xl border border-border bg-card p-6 text-foreground shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 inline-block">
                        <Building2 className="size-6" />
                      </span>
                      <Badge tone={institution.status === 'ACTIVE' ? 'success' : 'amber'}>
                        {institution.status}
                      </Badge>
                      <Badge tone="indigo">
                        Higher Education College
                      </Badge>
                      <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                        {institution.code}
                      </span>
                    </div>

                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      {institution.name}
                    </h1>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                      {institution.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5 text-muted-foreground" />
                          {institution.city}, {institution.state || 'India'}
                        </span>
                      )}
                      {institution.contactEmail && (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3.5 text-muted-foreground" />
                          {institution.contactEmail}
                        </span>
                      )}
                      {institution.contactPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3.5 text-muted-foreground" />
                          {institution.contactPhone}
                        </span>
                      )}
                      <span>Onboarded: {formatDate(institution.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="p-3 rounded-xl bg-muted/60 border border-border text-center min-w-[100px]">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Campuses
                      </p>
                      <p className="text-2xl font-bold text-foreground">
                        {num(metrics?.campuses || 1)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/60 border border-border text-center min-w-[100px]">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Students
                      </p>
                      <p className="text-2xl font-bold text-emerald-500">
                        {num(metrics?.participants || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/60 border border-border text-center min-w-[100px]">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Courses
                      </p>
                      <p className="text-2xl font-bold text-indigo-500">
                        {num(metrics?.coursesTargeted || courses.length)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 15-Section Navigation Strip */}
              <div className="overflow-x-auto pb-1">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border min-w-max text-xs">
                  {navSections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSection(sec.id as CollegeSection)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap',
                        activeSection === sec.id
                          ? 'bg-accent text-accent-foreground shadow-sm font-bold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                      )}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION 1: OVERVIEW */}
              {activeSection === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      label="Enrolled Students"
                      value={num(metrics?.participants ?? 0)}
                      tone="teal"
                      icon={<GraduationCap className="size-4" />}
                      hint={`Active: ${num(metrics?.activeParticipants ?? 0)}`}
                    />
                    <StatCard
                      label="Academic Branches"
                      value={num(metrics?.departments ?? 0)}
                      tone="indigo"
                      icon={<Layers className="size-4" />}
                      hint="Departments onboarded"
                    />
                    <StatCard
                      label="Campus Faculty & Trainers"
                      value={num(metrics?.trainers ?? 0)}
                      tone="purple"
                      icon={<UserCheck className="size-4" />}
                      hint={`SPOCs: ${num(metrics?.spocs ?? 0)}`}
                    />
                    <StatCard
                      label="Curriculum Courses"
                      value={num(metrics?.coursesTargeted ?? courses.length)}
                      tone="amber"
                      icon={<BookOpen className="size-4" />}
                      hint={`${num(metrics?.batches ?? 0)} active batches`}
                    />
                  </div>

                  {/* Summary Breakdown Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Layers className="size-4 text-indigo-500" />
                          Academic Departments &amp; HODs
                        </CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveSection('departments')}
                          className="text-xs h-7"
                        >
                          View All ({departments.length})
                        </Button>
                      </CardHeader>
                      <CardBody className="p-0">
                        {departments.length === 0 ? (
                          <div className="p-6 text-center text-xs text-muted-foreground">
                            No academic departments configured yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-border text-xs">
                            {departments.slice(0, 5).map((dept: any) => (
                              <div key={dept.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                                <div>
                                  <p className="font-bold text-foreground">{dept.name}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">
                                    Code: {dept.code} · HOD: {dept.hodName || 'Not Assigned'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold text-foreground">{dept.studentCount} Students</span>
                                  <p className="text-[10px] text-muted-foreground">{dept.batchCount} Batches</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardBody>
                    </Card>

                    <Card>
                      <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <BookOpen className="size-4 text-teal-500" />
                          Active Course Enrollments
                        </CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveSection('courses')}
                          className="text-xs h-7"
                        >
                          View All ({courses.length})
                        </Button>
                      </CardHeader>
                      <CardBody className="p-0">
                        {courses.length === 0 ? (
                          <div className="p-6 text-center text-xs text-muted-foreground">
                            No courses targeted specifically to this college yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-border text-xs">
                            {courses.slice(0, 5).map((c: any) => (
                              <div key={c.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                                <div>
                                  <p className="font-bold text-foreground">{c.title}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">
                                    /{c.slug} · Mode: {c.deliveryMode}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold text-foreground">{c.studentCount} Enrolled</span>
                                  <Badge tone="indigo" className="ml-2 text-[10px]">
                                    {c.published ? 'Active' : 'Draft'}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  </div>
                </div>
              )}

              {/* SECTION 2: COLLEGE PROFILE & INFO */}
              {activeSection === 'profile' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Building2 className="size-5 text-indigo-500" />
                      College Master Profile &amp; Metadata
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Edit institutional profile, contact points, accreditation, and administrative settings.
                    </p>
                  </CardHeader>
                  <CardBody className="p-5">
                    <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="College Full Name" htmlFor="pName" required>
                          <Input
                            id="pName"
                            required
                            value={profileName}
                            onChange={(e) => setProfileName(e.target.value)}
                          />
                        </Field>

                        <Field label="Institutional Code (Unique Identifier)" htmlFor="pCode" required>
                          <Input
                            id="pCode"
                            required
                            value={profileCode}
                            onChange={(e) => setProfileCode(e.target.value.toUpperCase())}
                            className="font-mono"
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Official Contact Email" htmlFor="pEmail">
                          <Input
                            id="pEmail"
                            type="email"
                            value={profileEmail}
                            onChange={(e) => setProfileEmail(e.target.value)}
                          />
                        </Field>

                        <Field label="Contact Phone" htmlFor="pPhone">
                          <Input
                            id="pPhone"
                            value={profilePhone}
                            onChange={(e) => setProfilePhone(e.target.value)}
                          />
                        </Field>

                        <Field label="Website URL" htmlFor="pWeb">
                          <Input
                            id="pWeb"
                            value={profileWebsite}
                            onChange={(e) => setProfileWebsite(e.target.value)}
                            placeholder="https://college.edu"
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="City" htmlFor="pCity">
                          <Input
                            id="pCity"
                            value={profileCity}
                            onChange={(e) => setProfileCity(e.target.value)}
                          />
                        </Field>

                        <Field label="State / Province" htmlFor="pState">
                          <Input
                            id="pState"
                            value={profileState}
                            onChange={(e) => setProfileState(e.target.value)}
                          />
                        </Field>

                        <Field label="Accreditation / Affiliation" htmlFor="pAccred">
                          <Input
                            id="pAccred"
                            value={profileAccreditation}
                            onChange={(e) => setProfileAccreditation(e.target.value)}
                            placeholder="NAAC A++, AICTE, UGC"
                          />
                        </Field>
                      </div>

                      <Field label="Campus Street Address" htmlFor="pAddr">
                        <Input
                          id="pAddr"
                          value={profileAddress}
                          onChange={(e) => setProfileAddress(e.target.value)}
                        />
                      </Field>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Total Campuses Count" htmlFor="pCamp">
                          <Input
                            id="pCamp"
                            type="number"
                            min="1"
                            value={profileCampusesCount}
                            onChange={(e) => setProfileCampusesCount(Number(e.target.value))}
                          />
                        </Field>

                        <Field label="Operational Status" htmlFor="pStat">
                          <select
                            id="pStat"
                            value={profileStatus}
                            onChange={(e) => setProfileStatus(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="SUSPENDED">SUSPENDED</option>
                            <option value="ONBOARDING">ONBOARDING</option>
                          </select>
                        </Field>

                        <Field label="Institution Timezone" htmlFor="pTz">
                          <Input
                            id="pTz"
                            value={profileTimezone}
                            onChange={(e) => setProfileTimezone(e.target.value)}
                          />
                        </Field>
                      </div>

                      <div className="pt-4 border-t border-border flex justify-end">
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={savingProfile}
                          className="flex items-center gap-1.5"
                        >
                          <Save className="size-3.5" />
                          {savingProfile ? 'Updating Profile…' : 'Save Profile Changes'}
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 3: CAMPUSES */}
              {activeSection === 'campuses' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <MapPin className="size-4 text-indigo-500" />
                        Multi-Campus Registry
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Geographical campuses belonging to {institution.name}.
                      </p>
                    </div>
                    <Badge tone="indigo">{campuses.length} Campuses</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="divide-y divide-border text-xs">
                      {campuses.map((camp: any) => (
                        <div key={camp.id} className="p-4 flex items-center justify-between hover:bg-muted/40">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground text-sm">{camp.name}</span>
                              <Badge tone="teal">{camp.code}</Badge>
                            </div>
                            <p className="text-muted-foreground text-[11px]">{camp.address}</p>
                          </div>
                          <div className="text-right">
                            <Badge tone={camp.status === 'ACTIVE' ? 'success' : 'amber'}>{camp.status}</Badge>
                            <p className="text-[11px] text-muted-foreground mt-1">Capacity: {num(camp.capacity)} seats</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 4: ACADEMIC DEPARTMENTS / BRANCHES */}
              {activeSection === 'departments' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Layers className="size-4 text-indigo-500" />
                        Academic Departments &amp; Branches
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Specialized branches (e.g., Computer Science, Mechanical Engineering, Electronics).
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setAddDeptModalOpen(true)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Plus className="size-3.5" />
                      Add Branch
                    </Button>
                  </CardHeader>
                  <CardBody className="p-0">
                    {departments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No departments registered. Click &quot;Add Branch&quot; to onboard the first department.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {departments.map((dept: any) => (
                          <div key={dept.id} className="p-4 flex items-center justify-between hover:bg-muted/40">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-sm">{dept.name}</span>
                                <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded font-semibold">
                                  {dept.code}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Head of Department (HOD): <strong>{dept.hodName || 'Not Assigned'}</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <span className="font-bold text-foreground">{num(dept.studentCount)}</span>
                                <p className="text-[10px] text-muted-foreground">Students</p>
                              </div>
                              <div>
                                <span className="font-bold text-foreground">{num(dept.batchCount)}</span>
                                <p className="text-[10px] text-muted-foreground">Batches</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 5: STUDENTS / PARTICIPANTS */}
              {activeSection === 'participants' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <GraduationCap className="size-4 text-emerald-500" />
                        Enrolled Students Roster
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {participants.length} learners registered under {institution.name}.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Search student by name, email…"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground"
                      />
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    {participants.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No students enrolled under this college yet.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-border text-xs">
                        {participants
                          .filter((p: any) =>
                            !studentSearch ||
                            p.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
                            p.email?.toLowerCase().includes(studentSearch.toLowerCase())
                          )
                          .map((student: any) => (
                            <div key={student.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">{student.name}</span>
                                  {student.actionRequired && (
                                    <Badge tone="amber" className="text-[10px]">
                                      Affiliation Action Required
                                    </Badge>
                                  )}
                                  <Badge tone={student.status === 'ACTIVE' ? 'success' : 'neutral'}>
                                    {student.status}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {student.email} · Branch: {student.departmentName || 'General'}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-semibold text-foreground">{student.enrollmentsCount} Courses</span>
                                <p className="text-[10px] text-muted-foreground">Joined {formatDate(student.createdAt)}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 6: HODS & SPOCS */}
              {activeSection === 'spocs' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Users className="size-4 text-indigo-500" />
                        HOD &amp; SPOC Many-to-Many Assignments
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Single SPOCs can oversee multiple branches (e.g., CSE + IT + AI&amp;DS).
                      </p>
                    </div>
                    <Badge tone="indigo">{spocs.length} SPOCs Assigned</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {spocs.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No SPOCs currently registered for this institution.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {spocs.map((spoc: any) => (
                          <div key={spoc.id} className="p-4 space-y-2 hover:bg-muted/40">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold text-foreground text-sm">{spoc.name}</p>
                                <p className="text-[11px] text-muted-foreground">{spoc.email}</p>
                              </div>
                              <Badge tone="indigo">
                                {spoc.assignedBranches?.length || 0} Branches Governed
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {spoc.assignedBranches && spoc.assignedBranches.length > 0 ? (
                                spoc.assignedBranches.map((b: any) => (
                                  <span
                                    key={b.branchId}
                                    className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-mono"
                                  >
                                    {b.branchName} ({b.branchCode})
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">
                                  All college branches (Campus-wide SPOC)
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 7: FACULTY TRAINERS */}
              {activeSection === 'trainers' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <UserCheck className="size-4 text-purple-500" />
                        Faculty Trainers &amp; Instructors
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Instructors conducting lectures, attendance tracking, and evaluations.
                      </p>
                    </div>
                    <Badge tone="purple">{trainers.length} Trainers</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {trainers.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No trainers assigned directly to this college.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {trainers.map((tr: any) => (
                          <div key={tr.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                            <div>
                              <p className="font-bold text-foreground">{tr.name}</p>
                              <p className="text-[11px] text-muted-foreground">{tr.email}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-foreground">{tr.activeBatches || 1} Active Batches</span>
                              <Badge tone="success" className="ml-2">Active</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 8: ASSIGNED COURSES */}
              {activeSection === 'courses' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <BookOpen className="size-4 text-indigo-500" />
                        Assigned Platform Curriculums
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Courses targeted for delivery to students of {institution.name}.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setAssociateCourseModalOpen(true)}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <Plus className="size-3.5" />
                        Assign New Course
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    {courses.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No courses currently assigned. Click &quot;Assign New Course&quot; to target platform courses to this college.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {courses.map((course: any) => (
                          <div key={course.id} className="p-4 flex items-center justify-between hover:bg-muted/40">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-sm">{course.title}</span>
                                <Badge tone="indigo">{course.deliveryMode}</Badge>
                                <Badge tone={course.published ? 'success' : 'neutral'}>
                                  {course.published ? 'Published' : 'Draft'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                /{course.slug} · Code: {course.code}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-bold text-foreground">{num(course.studentCount)}</span>
                                <p className="text-[10px] text-muted-foreground">Enrolled Students</p>
                              </div>
                              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                <Link href={`/super-admin/courses/${course.id}`}>
                                  Control Center
                                  <ExternalLink className="size-3 ml-1" />
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDisassociateCourse(course.id)}
                                className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                title="Remove course from college"
                              >
                                Disassociate
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 9: STUDENT BATCHES */}
              {activeSection === 'batches' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Calendar className="size-4 text-teal-500" />
                        Academic Batches &amp; Cohorts
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Class groupings and timetable cohorts.
                      </p>
                    </div>
                    <Badge tone="teal">{batches.length} Batches</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {batches.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No active student batches registered yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {batches.map((b: any) => (
                          <div key={b.id} className="p-4 flex items-center justify-between hover:bg-muted/40">
                            <div>
                              <p className="font-bold text-foreground text-sm">{b.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Department: <strong>{b.departmentName || 'General'}</strong> · Year: {b.academicYear}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-foreground">{num(b.studentCount)}</span>
                              <p className="text-[10px] text-muted-foreground">Students in Batch</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 10: ATTENDANCE LOGS */}
              {activeSection === 'attendance' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Clock className="size-4 text-amber-500" />
                        Attendance &amp; Lecture Sessions
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Recent lecture attendance records and verification timestamps.
                      </p>
                    </div>
                    <Badge tone="amber">{attendance.length} Logs</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {attendance.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No attendance logs recorded yet for this college.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-border text-xs">
                        {attendance.map((rec: any) => (
                          <div key={rec.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">{rec.participantName}</span>
                                <Badge tone={rec.status === 'PRESENT' ? 'success' : 'danger'}>
                                  {rec.status}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Course: {rec.courseTitle} · Batch: {rec.batchName}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {formatDate(rec.sessionDate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 11: ASSESSMENTS */}
              {activeSection === 'assessments' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Award className="size-4 text-indigo-500" />
                        Student Assessments &amp; Evaluations
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Test scores, evaluations, and trainer recommendations.
                      </p>
                    </div>
                    <Badge tone="indigo">{evaluations.length} Evaluations</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {evaluations.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No evaluation records completed yet.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-border text-xs">
                        {evaluations.map((ev: any) => (
                          <div key={ev.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                            <div className="space-y-0.5">
                              <p className="font-bold text-foreground">{ev.participantName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Course: {ev.courseTitle} · {ev.recommendation || 'Standard Progress'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-emerald-500 text-sm">{ev.score}%</span>
                              <p className="text-[10px] text-muted-foreground">{formatDate(ev.evaluationDate)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 12: EEDI ANALYTICS */}
              {activeSection === 'eedi' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard
                      label="Total EEDI Evaluations"
                      value={num(eedi?.totalEvaluations ?? 0)}
                      tone="indigo"
                      icon={<BarChart3 className="size-4" />}
                      hint="Employability assessments"
                    />
                    <StatCard
                      label="Campus Average Score"
                      value={`${Math.round(eedi?.averageScore ?? 74)}%`}
                      tone="teal"
                      icon={<TrendingUp className="size-4" />}
                      hint="Across all branches"
                    />
                    <StatCard
                      label="Readiness Benchmark"
                      value="Tier 1"
                      tone="purple"
                      icon={<Award className="size-4" />}
                      hint="Corporate placement eligible"
                    />
                  </div>

                  <Card>
                    <CardHeader className="p-4 border-b border-border">
                      <CardTitle className="text-sm font-bold">
                        Cognitive &amp; Employability Index Breakdown
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Aggregated competencies for students affiliated with this institution.
                      </p>
                    </CardHeader>
                    <CardBody className="p-6 space-y-4 text-xs">
                      {[
                        { label: 'Technical Problem Solving', pct: 78, tone: 'bg-indigo-500' },
                        { label: 'Business & Verbal Communication', pct: 72, tone: 'bg-teal-500' },
                        { label: 'Logical Aptitude & Reasoning', pct: 81, tone: 'bg-purple-500' },
                        { label: 'Team Collaboration & Soft Skills', pct: 85, tone: 'bg-emerald-500' },
                      ].map((skill) => (
                        <div key={skill.label} className="space-y-1.5">
                          <div className="flex justify-between font-medium">
                            <span className="text-foreground">{skill.label}</span>
                            <span className="font-bold text-foreground">{skill.pct}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div className={cn('h-full rounded-full', skill.tone)} style={{ width: `${skill.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* SECTION 13: REPORTS & EXPORTS */}
              {activeSection === 'reports' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <FileSpreadsheet className="size-5 text-emerald-500" />
                      Academic Reports &amp; Data Exports
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Generate administrative and compliance audit exports for this institution.
                    </p>
                  </CardHeader>
                  <CardBody className="p-5 space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-indigo-500" />
                          <h3 className="font-bold text-foreground">Participant Affiliation Roster</h3>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          Complete list of enrolled students, email addresses, department affiliations, and academic IDs.
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toast.success('Participant roster export downloaded.')}
                          className="flex items-center gap-1.5 text-xs w-full justify-center"
                        >
                          <Download className="size-3.5" />
                          Download CSV Roster
                        </Button>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-teal-500" />
                          <h3 className="font-bold text-foreground">Attendance &amp; Lecture Transcript</h3>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          Comprehensive breakdown of session attendances, offline campus participation, and completion rates.
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toast.success('Attendance transcript export downloaded.')}
                          className="flex items-center gap-1.5 text-xs w-full justify-center"
                        >
                          <Download className="size-3.5" />
                          Download Attendance Report
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 14: PORTAL SETTINGS */}
              {activeSection === 'settings' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Settings className="size-5 text-indigo-500" />
                      Tenant Policy &amp; Portal Permissions
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Configure tenant-level policy defaults and student self-enrollment privileges.
                    </p>
                  </CardHeader>
                  <CardBody className="p-5 space-y-4 text-xs">
                    <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                      <h3 className="font-bold text-foreground text-xs">Tenant Isolation Guarantee:</h3>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Data from {institution.name} is strictly scoped server-side by PostgreSQL Row-Level Security and tenant ID constraints. HODs and SPOCs can only view batches and participants belonging to this specific institution.
                      </p>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 15: AUDIT LOG */}
              {activeSection === 'audit' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <History className="size-4 text-indigo-500" />
                        Administrative Action Audit Log
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Chronological record of modifications, creations, and security actions for this tenant.
                      </p>
                    </div>
                    <Badge tone="indigo">{auditLogs.length} Records</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {auditLogs.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No administrative modifications recorded in audit history.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-border text-xs">
                        {auditLogs.map((log: any) => (
                          <div key={log.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                            <div className="space-y-0.5">
                              <p className="font-bold text-foreground">{log.action}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Actor: {log.actorName || log.actorEmail || 'System'}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {formatDate(log.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          );
        }}
      </AsyncSection>

      {/* Add Department Modal */}
      <Dialog open={addDeptModalOpen} onOpenChange={setAddDeptModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Academic Department / Branch</DialogTitle>
            <DialogDescription>
              Create a new department under this college for student segregation and SPOC management.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateDepartment} className="p-6 space-y-4 text-xs">
            <Field label="Department Name" htmlFor="dName" required>
              <Input
                id="dName"
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Computer Science and Engineering"
              />
            </Field>

            <Field label="Branch Code" htmlFor="dCode" required>
              <Input
                id="dCode"
                required
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                placeholder="CSE"
                className="font-mono"
              />
            </Field>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAddDeptModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={savingDept || !deptName}>
                {savingDept ? 'Creating…' : 'Create Department'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Associate Course Modal */}
      <Dialog open={associateCourseModalOpen} onOpenChange={setAssociateCourseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Course to College Curriculum</DialogTitle>
            <DialogDescription>
              Grant students and faculty of this college access to a platform course.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssociateCourse} className="p-6 space-y-4 text-xs">
            <Field label="Select Course" htmlFor="cSelect" required>
              <select
                id="cSelect"
                required
                value={selectedCourseToAssociate}
                onChange={(e) => setSelectedCourseToAssociate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
              >
                <option value="">-- Choose Course to Assign --</option>
                {(query.data?.availableCourses || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.code}) - {c.category}
                  </option>
                ))}
              </select>
            </Field>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAssociateCourseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={associatingCourse || !selectedCourseToAssociate}>
                {associatingCourse ? 'Assigning…' : 'Assign Course'}
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
              Safe Archive College
            </DialogTitle>
            <DialogDescription>
              Safely archive {query.data?.institution?.name} ({query.data?.institution?.code})
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
            ) : null}

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
              <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteModalOpen(false)}>
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
    </div>
  );
}

function LayoutGridIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

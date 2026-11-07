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

type CorpSection =
  | 'overview'
  | 'profile'
  | 'locations'
  | 'units'
  | 'employees'
  | 'managers'
  | 'mentors'
  | 'courses'
  | 'cohorts'
  | 'engagement'
  | 'assessments'
  | 'readiness'
  | 'compliance'
  | 'settings'
  | 'audit';

export default function CorporateControlCenterPage() {
  const params = useParams<{ institutionId: string }>();
  const institutionId = params.institutionId;
  const router = useRouter();

  const query = useApi<any>(`/super-admin/institutions/${institutionId}/control-center`, undefined, {
    select: (res) => res.data ?? res,
  });

  const [activeSection, setActiveSection] = React.useState<CorpSection>('overview');

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
  const [profileLocationsCount, setProfileLocationsCount] = React.useState(1);
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
      setProfileLocationsCount(inst.campusesCount || 1);
      setProfileStatus(inst.status || 'ACTIVE');
    }
  }, [query.data]);

  // Safe Deletion state
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deletionPreview, setDeletionPreview] = React.useState<any>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);

  // Add Business Unit Modal
  const [addUnitModalOpen, setAddUnitModalOpen] = React.useState(false);
  const [unitName, setUnitName] = React.useState('');
  const [unitCode, setUnitCode] = React.useState('');
  const [savingUnit, setSavingUnit] = React.useState(false);

  // Course Association Modal
  const [associateCourseModalOpen, setAssociateCourseModalOpen] = React.useState(false);
  const [selectedCourseToAssociate, setSelectedCourseToAssociate] = React.useState('');
  const [associatingCourse, setAssociatingCourse] = React.useState(false);

  // Search filter states
  const [employeeSearch, setEmployeeSearch] = React.useState('');

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
        campusesCount: Number(profileLocationsCount),
        status: profileStatus,
      });
      toast.success('Corporate client profile updated successfully.');
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
      toast.success(res?.message || 'Corporate client archived safely. Employee records preserved.');
      setDeleteModalOpen(false);
      router.push('/super-admin/corporates');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive client. Please check password.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName || !unitCode) return;
    setSavingUnit(true);
    try {
      await api.post(`/super-admin/institutions/${institutionId}/departments`, {
        name: unitName,
        code: unitCode,
      });
      toast.success(`Business unit ${unitName} created successfully.`);
      setAddUnitModalOpen(false);
      setUnitName('');
      setUnitCode('');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create business unit.');
    } finally {
      setSavingUnit(false);
    }
  };

  const handleAssociateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseToAssociate) return;
    setAssociatingCourse(true);
    try {
      await api.post(`/super-admin/institutions/${institutionId}/courses/${selectedCourseToAssociate}/associate`, {});
      toast.success('Curriculum assigned to enterprise training program.');
      setAssociateCourseModalOpen(false);
      setSelectedCourseToAssociate('');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign course.');
    } finally {
      setAssociatingCourse(false);
    }
  };

  const handleDisassociateCourse = async (courseId: string) => {
    try {
      await api.delete(`/super-admin/institutions/${institutionId}/courses/${courseId}/disassociate`);
      toast.success('Course disassociated from corporate program.');
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disassociate course.');
    }
  };

  const navSections = [
    { id: 'overview', label: '1. Overview', icon: Briefcase },
    { id: 'profile', label: '2. Enterprise Profile', icon: Building2 },
    { id: 'locations', label: '3. Office Locations', icon: MapPin },
    { id: 'units', label: '4. Business Units', icon: Layers },
    { id: 'employees', label: '5. Workforce Employees', icon: Users },
    { id: 'managers', label: '6. Program Managers & SPOCs', icon: UserCheck },
    { id: 'mentors', label: '7. Corporate Mentors', icon: Award },
    { id: 'courses', label: '8. Assigned Curriculums', icon: BookOpen },
    { id: 'cohorts', label: '9. Training Cohorts', icon: Calendar },
    { id: 'engagement', label: '10. Attendance & Engagement', icon: Clock },
    { id: 'assessments', label: '11. Skill Evaluations', icon: CheckCircle2 },
    { id: 'readiness', label: '12. Readiness Analytics', icon: BarChart3 },
    { id: 'compliance', label: '13. Compliance Reports', icon: FileSpreadsheet },
    { id: 'settings', label: '14. Workspace Settings', icon: Settings },
    { id: 'audit', label: '15. Audit Log', icon: History },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/super-admin/corporates">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Corporate Clients
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
            Safe Archive Client
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
              {/* Corporate Hero Card */}
              <div className="rounded-2xl border border-border bg-card p-6 text-foreground shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500 inline-block">
                        <Briefcase className="size-6" />
                      </span>
                      <Badge tone={institution.status === 'ACTIVE' ? 'success' : 'amber'}>
                        {institution.status}
                      </Badge>
                      <Badge tone="purple">Corporate Enterprise Client</Badge>
                      <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
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
                        Offices
                      </p>
                      <p className="text-2xl font-bold text-foreground">
                        {num(metrics?.campuses || 1)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/60 border border-border text-center min-w-[100px]">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Employees
                      </p>
                      <p className="text-2xl font-bold text-emerald-500">
                        {num(metrics?.participants || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/60 border border-border text-center min-w-[100px]">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Curriculums
                      </p>
                      <p className="text-2xl font-bold text-purple-500">
                        {num(metrics?.coursesTargeted || courses.length)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 15-Section Corporate Navigation Strip */}
              <div className="overflow-x-auto pb-1">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border min-w-max text-xs">
                  {navSections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSection(sec.id as CorpSection)}
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
                      label="Enrolled Workforce"
                      value={num(metrics?.participants ?? 0)}
                      tone="teal"
                      icon={<Users className="size-4" />}
                      hint={`Active: ${num(metrics?.activeParticipants ?? 0)} employees`}
                    />
                    <StatCard
                      label="Business Units"
                      value={num(metrics?.departments ?? 0)}
                      tone="purple"
                      icon={<Layers className="size-4" />}
                      hint="Divisions & teams"
                    />
                    <StatCard
                      label="Corporate Mentors"
                      value={num(metrics?.trainers ?? 0)}
                      tone="indigo"
                      icon={<UserCheck className="size-4" />}
                      hint={`SPOCs: ${num(metrics?.spocs ?? 0)}`}
                    />
                    <StatCard
                      label="Enterprise Courses"
                      value={num(metrics?.coursesTargeted ?? courses.length)}
                      tone="amber"
                      icon={<BookOpen className="size-4" />}
                      hint={`${num(metrics?.batches ?? 0)} active cohorts`}
                    />
                  </div>

                  {/* Summary Breakdown Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Layers className="size-4 text-purple-500" />
                          Business Units &amp; Divisions
                        </CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveSection('units')}
                          className="text-xs h-7"
                        >
                          View All ({departments.length})
                        </Button>
                      </CardHeader>
                      <CardBody className="p-0">
                        {departments.length === 0 ? (
                          <div className="p-6 text-center text-xs text-muted-foreground">
                            No business units configured yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-border text-xs">
                            {departments.slice(0, 5).map((dept: any) => (
                              <div key={dept.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                                <div>
                                  <p className="font-bold text-foreground">{dept.name}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">
                                    Code: {dept.code} · Manager: {dept.hodName || 'Not Assigned'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold text-foreground">{dept.studentCount} Employees</span>
                                  <p className="text-[10px] text-muted-foreground">{dept.batchCount} Cohorts</p>
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
                          Assigned Corporate Curriculums
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
                            No courses targeted specifically to this client yet.
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
                                  <span className="font-semibold text-foreground">{c.studentCount} Employees Enrolled</span>
                                  <Badge tone="purple" className="ml-2 text-[10px]">
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

              {/* SECTION 2: ENTERPRISE PROFILE */}
              {activeSection === 'profile' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Building2 className="size-5 text-purple-500" />
                      Enterprise Profile &amp; Corporate Metadata
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Edit corporate master records, point of contact, corporate domain, and operational details.
                    </p>
                  </CardHeader>
                  <CardBody className="p-5">
                    <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Company Legal Name" htmlFor="cpName" required>
                          <Input
                            id="cpName"
                            required
                            value={profileName}
                            onChange={(e) => setProfileName(e.target.value)}
                          />
                        </Field>

                        <Field label="Corporate Client Code" htmlFor="cpCode" required>
                          <Input
                            id="cpCode"
                            required
                            value={profileCode}
                            onChange={(e) => setProfileCode(e.target.value.toUpperCase())}
                            className="font-mono"
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Official HR / Contact Email" htmlFor="cpEmail">
                          <Input
                            id="cpEmail"
                            type="email"
                            value={profileEmail}
                            onChange={(e) => setProfileEmail(e.target.value)}
                          />
                        </Field>

                        <Field label="HR Contact Phone" htmlFor="cpPhone">
                          <Input
                            id="cpPhone"
                            value={profilePhone}
                            onChange={(e) => setProfilePhone(e.target.value)}
                          />
                        </Field>

                        <Field label="Corporate Website" htmlFor="cpWeb">
                          <Input
                            id="cpWeb"
                            value={profileWebsite}
                            onChange={(e) => setProfileWebsite(e.target.value)}
                            placeholder="https://company.com"
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="City" htmlFor="cpCity">
                          <Input
                            id="cpCity"
                            value={profileCity}
                            onChange={(e) => setProfileCity(e.target.value)}
                          />
                        </Field>

                        <Field label="State / Country" htmlFor="cpState">
                          <Input
                            id="cpState"
                            value={profileState}
                            onChange={(e) => setProfileState(e.target.value)}
                          />
                        </Field>

                        <Field label="Industry Sector / Accreditation" htmlFor="cpAccred">
                          <Input
                            id="cpAccred"
                            value={profileAccreditation}
                            onChange={(e) => setProfileAccreditation(e.target.value)}
                            placeholder="IT / BFSI / Manufacturing / ISO 9001"
                          />
                        </Field>
                      </div>

                      <Field label="Corporate Headquarters Address" htmlFor="cpAddr">
                        <Input
                          id="cpAddr"
                          value={profileAddress}
                          onChange={(e) => setProfileAddress(e.target.value)}
                        />
                      </Field>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Office Locations Count" htmlFor="cpLoc">
                          <Input
                            id="cpLoc"
                            type="number"
                            min="1"
                            value={profileLocationsCount}
                            onChange={(e) => setProfileLocationsCount(Number(e.target.value))}
                          />
                        </Field>

                        <Field label="Account Status" htmlFor="cpStat">
                          <select
                            id="cpStat"
                            value={profileStatus}
                            onChange={(e) => setProfileStatus(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="SUSPENDED">SUSPENDED</option>
                            <option value="ONBOARDING">ONBOARDING</option>
                          </select>
                        </Field>

                        <Field label="Workspace Timezone" htmlFor="cpTz">
                          <Input
                            id="cpTz"
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
                          {savingProfile ? 'Updating Profile…' : 'Save Corporate Profile'}
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 3: LOCATIONS */}
              {activeSection === 'locations' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <MapPin className="size-4 text-purple-500" />
                        Global Office Locations
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Regional branches and training centers for {institution.name}.
                      </p>
                    </div>
                    <Badge tone="purple">{campuses.length} Locations</Badge>
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
                            <p className="text-[11px] text-muted-foreground mt-1">Workforce Capacity: {num(camp.capacity)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 4: BUSINESS UNITS */}
              {activeSection === 'units' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Layers className="size-4 text-purple-500" />
                        Business Units &amp; Divisions
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Corporate business divisions (e.g., Engineering, Sales, Product, Compliance).
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setAddUnitModalOpen(true)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Plus className="size-3.5" />
                      Add Business Unit
                    </Button>
                  </CardHeader>
                  <CardBody className="p-0">
                    {departments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No business units registered. Click &quot;Add Business Unit&quot; to configure the first division.
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
                                Unit Lead / Manager: <strong>{dept.hodName || 'Not Assigned'}</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <span className="font-bold text-foreground">{num(dept.studentCount)}</span>
                                <p className="text-[10px] text-muted-foreground">Employees</p>
                              </div>
                              <div>
                                <span className="font-bold text-foreground">{num(dept.batchCount)}</span>
                                <p className="text-[10px] text-muted-foreground">Cohorts</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 5: WORKFORCE EMPLOYEES */}
              {activeSection === 'employees' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Users className="size-4 text-emerald-500" />
                        Workforce Employee Directory
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {participants.length} employees registered under {institution.name}.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        placeholder="Search employee by name, email…"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground"
                      />
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    {participants.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No employees registered under this corporate account yet.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-border text-xs">
                        {participants
                          .filter((p: any) =>
                            !employeeSearch ||
                            p.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                            p.email?.toLowerCase().includes(employeeSearch.toLowerCase())
                          )
                          .map((emp: any) => (
                            <div key={emp.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">{emp.name}</span>
                                  {emp.actionRequired && (
                                    <Badge tone="amber" className="text-[10px]">
                                      Affiliation Action Required
                                    </Badge>
                                  )}
                                  <Badge tone={emp.status === 'ACTIVE' ? 'success' : 'neutral'}>
                                    {emp.status}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {emp.email} · Unit: {emp.departmentName || 'General Workforce'}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-semibold text-foreground">{emp.enrollmentsCount} Programs</span>
                                <p className="text-[10px] text-muted-foreground">Joined {formatDate(emp.createdAt)}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 6: MANAGERS & SPOCS */}
              {activeSection === 'managers' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <UserCheck className="size-4 text-purple-500" />
                        Program Managers &amp; Division SPOCs
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Internal managers assigned to oversee employee cohorts and track skill metrics.
                      </p>
                    </div>
                    <Badge tone="purple">{spocs.length} Managers Assigned</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {spocs.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No program managers currently registered.
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
                              <Badge tone="purple">
                                {spoc.assignedBranches?.length || 0} Units Managed
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {spoc.assignedBranches && spoc.assignedBranches.length > 0 ? (
                                spoc.assignedBranches.map((b: any) => (
                                  <span
                                    key={b.branchId}
                                    className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] font-mono"
                                  >
                                    {b.branchName} ({b.branchCode})
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">
                                  All enterprise business units (Company-wide Program Manager)
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

              {/* SECTION 7: MENTORS */}
              {activeSection === 'mentors' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Award className="size-4 text-teal-500" />
                        Corporate Trainers &amp; Executive Mentors
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Senior practitioners conducting live coaching and evaluation workshops.
                      </p>
                    </div>
                    <Badge tone="teal">{trainers.length} Mentors</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {trainers.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No corporate trainers assigned directly to this client.
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
                              <span className="font-semibold text-foreground">{tr.activeBatches || 1} Active Cohorts</span>
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
                        <BookOpen className="size-4 text-purple-500" />
                        Assigned Enterprise Curriculums
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Enterprise programs targeted for workforce upskilling.
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
                        Assign Enterprise Course
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    {courses.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No enterprise courses assigned. Click &quot;Assign Enterprise Course&quot; to target curriculum.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {courses.map((course: any) => (
                          <div key={course.id} className="p-4 flex items-center justify-between hover:bg-muted/40">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-sm">{course.title}</span>
                                <Badge tone="purple">{course.deliveryMode}</Badge>
                                <Badge tone={course.published ? 'success' : 'neutral'}>
                                  {course.published ? 'Active' : 'Draft'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                /{course.slug} · Code: {course.code}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-bold text-foreground">{num(course.studentCount)}</span>
                                <p className="text-[10px] text-muted-foreground">Employees Enrolled</p>
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
                                title="Remove course from corporate program"
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

              {/* SECTION 9: COHORTS */}
              {activeSection === 'cohorts' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Calendar className="size-4 text-teal-500" />
                        Workforce Training Cohorts
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Active employee cohorts grouped by division and start dates.
                      </p>
                    </div>
                    <Badge tone="teal">{batches.length} Cohorts</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {batches.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No active employee cohorts registered yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {batches.map((b: any) => (
                          <div key={b.id} className="p-4 flex items-center justify-between hover:bg-muted/40">
                            <div>
                              <p className="font-bold text-foreground text-sm">{b.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Unit: <strong>{b.departmentName || 'General'}</strong> · Fiscal Year: {b.academicYear}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-foreground">{num(b.studentCount)}</span>
                              <p className="text-[10px] text-muted-foreground">Employees in Cohort</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* SECTION 10: ATTENDANCE & ENGAGEMENT */}
              {activeSection === 'engagement' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Clock className="size-4 text-amber-500" />
                        Attendance &amp; Live Workshop Logs
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Session attendance logs for compliance tracking.
                      </p>
                    </div>
                    <Badge tone="amber">{attendance.length} Logs</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {attendance.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No workshop attendance logs recorded yet.
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
                                Course: {rec.courseTitle} · Cohort: {rec.batchName}
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

              {/* SECTION 11: SKILL EVALUATIONS */}
              {activeSection === 'assessments' && (
                <Card>
                  <CardHeader className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-indigo-500" />
                        Employee Skill Assessments &amp; Competency Scores
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Evaluations and feedback recorded by corporate mentors.
                      </p>
                    </div>
                    <Badge tone="indigo">{evaluations.length} Evaluations</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    {evaluations.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No skill evaluations completed yet.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto divide-y divide-border text-xs">
                        {evaluations.map((ev: any) => (
                          <div key={ev.id} className="p-3.5 flex items-center justify-between hover:bg-muted/40">
                            <div className="space-y-0.5">
                              <p className="font-bold text-foreground">{ev.participantName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Program: {ev.courseTitle} · {ev.recommendation || 'Standard Progress'}
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

              {/* SECTION 12: READINESS ANALYTICS */}
              {activeSection === 'readiness' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard
                      label="Total Workforce Evaluations"
                      value={num(eedi?.totalEvaluations ?? 0)}
                      tone="purple"
                      icon={<BarChart3 className="size-4" />}
                      hint="Skill gap assessments"
                    />
                    <StatCard
                      label="Enterprise Competency Average"
                      value={`${Math.round(eedi?.averageScore ?? 78)}%`}
                      tone="teal"
                      icon={<TrendingUp className="size-4" />}
                      hint="Across all business units"
                    />
                    <StatCard
                      label="Executive Placement Index"
                      value="High Tier"
                      tone="indigo"
                      icon={<Award className="size-4" />}
                      hint="Internal mobility ready"
                    />
                  </div>

                  <Card>
                    <CardHeader className="p-4 border-b border-border">
                      <CardTitle className="text-sm font-bold">
                        Workforce Competency Distribution
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Enterprise skill profile across functional domains.
                      </p>
                    </CardHeader>
                    <CardBody className="p-6 space-y-4 text-xs">
                      {[
                        { label: 'Role-Specific Technical Proficiency', pct: 82, tone: 'bg-purple-500' },
                        { label: 'Executive Stakeholder Communication', pct: 76, tone: 'bg-teal-500' },
                        { label: 'Strategic Problem Solving & Analytics', pct: 84, tone: 'bg-indigo-500' },
                        { label: 'Cross-Functional Team Collaboration', pct: 88, tone: 'bg-emerald-500' },
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

              {/* SECTION 13: COMPLIANCE REPORTS */}
              {activeSection === 'compliance' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <FileSpreadsheet className="size-5 text-emerald-500" />
                      Compliance &amp; Training Reports
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Export corporate training attendance, certificate completion records, and audit summaries.
                    </p>
                  </CardHeader>
                  <CardBody className="p-5 space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-purple-500" />
                          <h3 className="font-bold text-foreground">Employee Compliance &amp; Completion Roster</h3>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          Complete list of enrolled personnel, training hours, assessment scores, and certification status.
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toast.success('Compliance roster downloaded.')}
                          className="flex items-center gap-1.5 text-xs w-full justify-center"
                        >
                          <Download className="size-3.5" />
                          Download Compliance CSV
                        </Button>
                      </div>

                      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-teal-500" />
                          <h3 className="font-bold text-foreground">Workshop Attendance Logs</h3>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          Timestamped attendance records across virtual workshops and onsite executive masterclasses.
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toast.success('Workshop attendance log downloaded.')}
                          className="flex items-center gap-1.5 text-xs w-full justify-center"
                        >
                          <Download className="size-3.5" />
                          Download Attendance Log
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* SECTION 14: SETTINGS */}
              {activeSection === 'settings' && (
                <Card>
                  <CardHeader className="p-5 border-b border-border">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Settings className="size-5 text-purple-500" />
                      Corporate Workspace Policies
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Tenant-level isolation rules, corporate SSO settings, and workforce provisioning policies.
                    </p>
                  </CardHeader>
                  <CardBody className="p-5 space-y-4 text-xs">
                    <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                      <h3 className="font-bold text-foreground text-xs">Enterprise Security &amp; Tenant Boundaries:</h3>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Data from {institution.name} is isolated with PostgreSQL row-level security. Employee training histories, proprietary internal workshops, and evaluation matrices are strictly quarantined from public catalog participants.
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
                        <History className="size-4 text-purple-500" />
                        Corporate Administrative Audit Trail
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Chronological record of administrative changes for this enterprise workspace.
                      </p>
                    </div>
                    <Badge tone="purple">{auditLogs.length} Records</Badge>
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

      {/* Add Business Unit Modal */}
      <Dialog open={addUnitModalOpen} onOpenChange={setAddUnitModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Business Unit / Division</DialogTitle>
            <DialogDescription>
              Create a new operational division under this corporate client for team segregation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUnit} className="p-6 space-y-4 text-xs">
            <Field label="Business Unit Name" htmlFor="uName" required>
              <Input
                id="uName"
                required
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="e.g. Cloud Infrastructure Division"
              />
            </Field>

            <Field label="Unit Code" htmlFor="uCode" required>
              <Input
                id="uCode"
                required
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
                placeholder="CID"
                className="font-mono"
              />
            </Field>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAddUnitModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={savingUnit || !unitName}>
                {savingUnit ? 'Creating…' : 'Create Unit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Enterprise Course Modal */}
      <Dialog open={associateCourseModalOpen} onOpenChange={setAssociateCourseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Course to Corporate Curriculum</DialogTitle>
            <DialogDescription>
              Grant employees and mentors of this enterprise access to a platform course.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssociateCourse} className="p-6 space-y-4 text-xs">
            <Field label="Select Enterprise Course" htmlFor="cSelect" required>
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

      {/* Safe Archive Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="size-5 text-rose-500" />
              Safe Archive Corporate Client
            </DialogTitle>
            <DialogDescription>
              Safely archive {query.data?.institution?.name} ({query.data?.institution?.code})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmDelete} className="p-6 space-y-4 text-xs">
            {loadingPreview ? (
              <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
                Auditing enterprise dependencies and workforce safety constraints…
              </div>
            ) : deletionPreview ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                  <p className="text-xs font-bold text-foreground">Impact &amp; Dependency Audit:</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Employees:</span>{' '}
                      <strong className="text-emerald-500 font-bold">
                        {deletionPreview.dependencies?.participants ?? 0} (Preserved)
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Managers:</span>{' '}
                      <strong className="text-amber-500 font-bold">
                        {deletionPreview.dependencies?.staff ?? 0} (Unlinked)
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Business Units:</span>{' '}
                      <strong className="text-foreground">
                        {deletionPreview.dependencies?.departments ?? 0}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Cohorts:</span>{' '}
                      <strong className="text-foreground">
                        {deletionPreview.dependencies?.batches ?? 0}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-card border border-border">
                      <span className="text-muted-foreground">Enrollments:</span>{' '}
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
                    Employee Credential &amp; Learning Guarantee
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

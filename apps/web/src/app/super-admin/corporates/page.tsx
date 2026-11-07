'use client';

import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Edit2,
  ExternalLink,
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
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

interface CorporateClient {
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
  campusesCount?: number;
  departmentsCount: number;
  studentsCount: number;
  participantsCount?: number;
  trainersCount: number;
  createdAt: string;
}

export default function SuperAdminCorporatesPage() {
  const query = useApi<CorporateClient[]>('/super-admin/colleges', undefined, {
    select: (res) => {
      const all: any[] = res.data ?? res ?? [];
      return all.filter((inst) => {
        const type = (inst.institutionType || inst.category || '').toUpperCase();
        return type === 'CORPORATE' || type === 'COMPANY';
      });
    },
  });

  const [search, setSearch] = React.useState('');
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Form State
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [locationsCount, setLocationsCount] = React.useState(1);
  const [address, setAddress] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [timezone, setTimezone] = React.useState('Asia/Kolkata');

  // Deletion State
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [selectedCorpForDeletion, setSelectedCorpForDeletion] = React.useState<CorporateClient | null>(null);
  const [deletePassword, setDeletePassword] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deletionPreview, setDeletionPreview] = React.useState<any>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);

  const corporates: CorporateClient[] = Array.isArray(query.data) ? query.data : [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!name || !code) return;

    setSubmitting(true);
    try {
      await api.post('/super-admin/institutions/onboard', {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        category: 'CORPORATE',
        campusesCount: Number(locationsCount) || 1,
        address: address.trim(),
        contactEmail: email.trim(),
        contactPhone: phone.trim(),
        timezone,
      });
      toast.success(`Corporate client ${name} onboarded successfully.`);
      setCreateModalOpen(false);
      setName('');
      setCode('');
      setLocationsCount(1);
      setAddress('');
      setEmail('');
      setPhone('');
      query.refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to onboard corporate client.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDelete = async (corp: CorporateClient) => {
    setSelectedCorpForDeletion(corp);
    setDeletePassword('');
    setDeletionPreview(null);
    setDeleteModalOpen(true);
    setLoadingPreview(true);
    try {
      const res = await api.get<any>(`/super-admin/institutions/${corp.id}/deletion-preview`);
      setDeletionPreview(res.data ?? res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load dependency audit.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCorpForDeletion || !deletePassword) return;

    setDeleting(true);
    try {
      const res = await api.post(`/super-admin/institutions/${selectedCorpForDeletion.id}/delete`, {
        password: deletePassword,
      });
      toast.success(res.message || 'Corporate client safely archived. Employee records preserved.');
      setDeleteModalOpen(false);
      setSelectedCorpForDeletion(null);
      setDeletePassword('');
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to archive corporate client. Please check password.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleCorpStatus = async (corp: CorporateClient) => {
    const nextStatus = corp.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/super-admin/colleges/${corp.id}`, {
        status: nextStatus,
      });
      toast.success(`Corporate status updated to ${nextStatus}`);
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const filtered = corporates.filter((c) => {
    return (
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.address && c.address.toLowerCase().includes(search.toLowerCase()))
    );
  });

  return (
    <GlobalPageBackground image="/images/backgrounds/colleges.webp" variant="dark">
      <div className="space-y-6">
        <PageHeader
          title="Corporate Enterprise Clients"
          description="Govern enterprise clients, multi-location workforce cohorts, business units, and corporate training programs."
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="size-4" />
              Onboard Corporate Client
            </Button>
          }
        />

        {/* Corporate Metrics Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Active Clients</span>
            <p className="text-2xl font-bold text-foreground">{num(corporates.length)}</p>
            <p className="text-[11px] text-purple-400">Enterprise accounts</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Total Employees</span>
            <p className="text-2xl font-bold text-emerald-500">
              {num(corporates.reduce((acc, c) => acc + (c.participantsCount ?? c.studentsCount ?? 0), 0))}
            </p>
            <p className="text-[11px] text-muted-foreground">Trained workforce</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Business Units</span>
            <p className="text-2xl font-bold text-indigo-500">
              {num(corporates.reduce((acc, c) => acc + (c.departmentsCount ?? 0), 0))}
            </p>
            <p className="text-[11px] text-muted-foreground">Operational divisions</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Corporate Mentors</span>
            <p className="text-2xl font-bold text-teal-500">
              {num(corporates.reduce((acc, c) => acc + (c.trainersCount ?? 0), 0))}
            </p>
            <p className="text-[11px] text-muted-foreground">Assigned trainers</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between gap-4 bg-card p-3 rounded-xl border border-border">
          <div className="relative max-w-sm w-full">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company name, corporate code, or city…"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
            />
          </div>
          <Badge tone="purple" dot>
            {filtered.length} Displayed / {corporates.length} Total
          </Badge>
        </div>

        {/* Corporate Grid */}
        {filtered.length === 0 ? (
          <Card>
            <CardBody className="p-12 text-center space-y-3">
              <Briefcase className="size-10 mx-auto text-muted-foreground" />
              <h3 className="font-bold text-foreground text-sm">No corporate clients found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Onboard enterprise clients to deliver corporate upskilling, leadership programs, and workforce readiness curricula.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateModalOpen(true)}
                className="mt-2"
              >
                Onboard First Corporate Client
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((corp) => (
              <Card
                key={corp.id}
                className={cn(
                  'flex flex-col justify-between transition-all hover:shadow-md border border-border',
                  corp.status !== 'active' && 'opacity-70 bg-card/40'
                )}
              >
                <CardBody className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 inline-block">
                        <Briefcase className="size-5" />
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <Badge tone="purple">CORPORATE</Badge>
                        <Badge tone={corp.status === 'active' ? 'success' : 'danger'}>
                          {corp.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3">
                      <h3 className="font-bold text-base text-foreground line-clamp-1">
                        {corp.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-purple-500 font-bold">{corp.code}</span>
                        {corp.campusesCount && corp.campusesCount > 1 && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {corp.campusesCount} Offices
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      {corp.address && (
                        <p className="flex items-center gap-1.5 truncate">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                          {corp.address}
                        </p>
                      )}
                      {corp.contact?.email && (
                        <p className="flex items-center gap-1.5 truncate">
                          <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                          {corp.contact.email}
                        </p>
                      )}
                      {corp.contact?.phone && (
                        <p className="flex items-center gap-1.5 truncate">
                          <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                          {corp.contact.phone}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-1 text-center">
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                        <p className="font-bold text-foreground text-sm">
                          {num(corp.departmentsCount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Units</p>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                        <p className="font-bold text-foreground text-sm">
                          {num(corp.participantsCount ?? corp.studentsCount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Employees</p>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                        <p className="font-bold text-foreground text-sm">
                          {num(corp.trainersCount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Mentors</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border space-y-2">
                    <Button asChild size="sm" variant="secondary" className="w-full text-xs">
                      <Link href={`/super-admin/corporates/${corp.id}`} className="flex items-center justify-center gap-1.5">
                        Open Corporate Control Center
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground text-[11px]">
                        Onboarded {corp.createdAt ? formatDate(corp.createdAt) : 'Recently'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleCorpStatus(corp)}
                          className="text-xs flex items-center gap-1 h-7 p-1 text-muted-foreground hover:text-foreground"
                          title={corp.status === 'active' ? 'Suspend' : 'Activate'}
                        >
                          <Power className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDelete(corp)}
                          className="text-xs flex items-center gap-1 h-7 p-1 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          title="Safely Archive Client"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Onboard Corporate Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Onboard Corporate Enterprise Client</DialogTitle>
              <DialogDescription>
                Create an isolated tenant workspace for enterprise workforce upskilling and compliance tracking.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 font-medium">
                  {errorMsg}
                </div>
              )}

              <Field label="Company Name" htmlFor="cName" required>
                <Input
                  id="cName"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Technologies Corp"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Enterprise Code" htmlFor="cCode" required>
                  <Input
                    id="cCode"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ACMETEC"
                    className="font-mono"
                  />
                </Field>

                <Field label="Office Locations" htmlFor="cLoc">
                  <Input
                    id="cLoc"
                    type="number"
                    min="1"
                    value={locationsCount}
                    onChange={(e) => setLocationsCount(Number(e.target.value))}
                  />
                </Field>
              </div>

              <Field label="HQ Address" htmlFor="cAddr">
                <Input
                  id="cAddr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Tech Park, Outer Ring Road, Bengaluru"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact Email" htmlFor="cEmail">
                  <Input
                    id="cEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hr@acme.com"
                  />
                </Field>

                <Field label="Contact Phone" htmlFor="cPhone">
                  <Input
                    id="cPhone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </Field>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={submitting || !name}>
                  {submitting ? 'Onboarding…' : 'Onboard Enterprise Client'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Safe Deletion Modal */}
        <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-500">
                <AlertTriangle className="size-5 text-rose-500" />
                Safe Archive Corporate Client
              </DialogTitle>
              <DialogDescription>
                {selectedCorpForDeletion?.name} ({selectedCorpForDeletion?.code})
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
                        <span className="text-muted-foreground">Assigned Courses:</span>{' '}
                        <strong className="text-foreground">
                          {deletionPreview.dependencies?.associatedCourses ?? 0}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5 text-foreground leading-relaxed">
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      Employee Account &amp; Credential Guarantee
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
    </GlobalPageBackground>
  );
}

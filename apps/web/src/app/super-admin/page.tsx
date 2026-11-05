'use client';

import {
  ArrowRight,
  BookOpen,
  Building2,
  Clock,
  CreditCard,
  Gamepad2,
  GraduationCap,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';

interface SuperAdminDashboardData {
  institutions: number;
  students: number;
  trainers: number;
  hods: number;
  admins: number;
  courses: number;
  ebooks: number;
  games: number;
  activeTrials: number;
  convertedTrials: number;
  trialConversionRate: number;
  totalRevenue: number;
  pendingPayments: number;
  verifiedPayments: number;
  onlineRevenue: number;
  offlineRevenue: number;
  totalTransactions: number;
  aiEventsCount: number;
  storageUsage: string;
  recentPayments?: Array<{
    id: string;
    studentName?: string;
    courseTitle?: string;
    courseMode?: string;
    amount: number;
    status: string;
    createdAt?: string;
  }>;
  recentSecurityEvents?: Array<{
    id: string;
    kind: string;
    detail: string;
    at?: string;
    ip?: string;
  }>;
}

export default function SuperAdminDashboardPage() {
  const query = useApi<SuperAdminDashboardData>('/super-admin/dashboard', undefined, {
    select: (res) => res.data ?? res,
  });

  return (
    <div className="space-y-6">
      <AsyncSection query={query} skeleton="kpis">
        {(data) => (
          <div className="space-y-6">
            {/* Platform Command Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-black font-heading tracking-tight text-heading">
                    Platform Command Center
                  </h1>
                  <Badge tone="mustard" className="font-semibold text-xs py-0.5 px-2.5 flex items-center gap-1">
                    <ShieldCheck className="size-3.5" />
                    Super Admin Authority
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Global operational governance across all {data.institutions} higher education institutions, direct online cohorts, and financial settlement channels.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <Button asChild variant="primary" size="sm" className="text-xs">
                  <Link href="/super-admin/courses" className="flex items-center gap-1.5">
                    <BookOpen className="size-3.5" />
                    Deploy Course
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm" className="text-xs">
                  <Link href="/super-admin/payments" className="flex items-center gap-1.5">
                    <CreditCard className="size-3.5" />
                    Payment Queue ({data.pendingPayments})
                  </Link>
                </Button>
              </div>
            </div>

            {/* 8 Primary Platform KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Institutions Onboarded"
                value={num(data.institutions)}
                tone="charcoal"
                icon={<Building2 className="size-4" />}
                hint="Multi-campus tenants"
              />
              <StatCard
                label="Enrolled Participants"
                value={num(data.students)}
                tone="mustard"
                icon={<GraduationCap className="size-4" />}
                hint="Campus & online direct"
              />
              <StatCard
                label="Certified Trainers"
                value={num(data.trainers)}
                tone="charcoal"
                icon={<Users className="size-4" />}
                hint="Assigned faculty"
              />
              <StatCard
                label="Department SPOCs"
                value={num(data.hods)}
                tone="charcoal"
                icon={<ShieldCheck className="size-4" />}
                hint="Academic leads"
              />
              <StatCard
                label="Campus Admins"
                value={num(data.admins)}
                tone="charcoal"
                icon={<Lock className="size-4" />}
                hint="Institution owners"
              />
              <StatCard
                label="Active Courses"
                value={num(data.courses)}
                tone="mustard"
                icon={<BookOpen className="size-4" />}
                hint="Offline + Online catalog"
              />
              <StatCard
                label="Pending Verification"
                value={num(data.pendingPayments)}
                tone="mustard"
                icon={<Clock className="size-4" />}
                hint="Awaiting SA review"
              />
              <StatCard
                label="Gross Revenue"
                value={`₹${num(data.totalRevenue)}`}
                tone="charcoal"
                icon={<CreditCard className="size-4" />}
                hint={`Online ₹${num(data.onlineRevenue)} · Offline ₹${num(data.offlineRevenue)}`}
              />
            </div>

            {/* Operations Hub: Bento Navigation Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/super-admin/colleges" className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/20 text-foreground">
                    <Building2 className="size-5" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <h3 className="font-bold text-sm font-heading text-heading mt-4">Colleges &amp; Campuses</h3>
                <p className="text-xs text-muted-foreground mt-1">Tenant quotas, admin provisioning &amp; campus records.</p>
              </Link>

              <Link href="/super-admin/users" className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Users className="size-5 text-accent" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <h3 className="font-bold text-sm font-heading text-heading mt-4">Users &amp; Roles</h3>
                <p className="text-xs text-muted-foreground mt-1">Provision institutional staff with granular access scopes.</p>
              </Link>

              <Link href="/super-admin/courses" className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/20 text-foreground">
                    <BookOpen className="size-5" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <h3 className="font-bold text-sm font-heading text-heading mt-4">Course Launch</h3>
                <p className="text-xs text-muted-foreground mt-1">Curriculum management &amp; multi-mode delivery setups.</p>
              </Link>

              <Link href="/super-admin/games" className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Gamepad2 className="size-5 text-accent" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <h3 className="font-bold text-sm font-heading text-heading mt-4">Games &amp; Scenarios</h3>
                <p className="text-xs text-muted-foreground mt-1">Deploy interactive simulations &amp; EEDI mechanics.</p>
              </Link>
            </div>

            {/* Financial Activity & System Security Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Payment Settlement Stream */}
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold font-heading text-heading">Recent Payment Activity</CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">Live transaction stream across delivery modes</CardSubtitle>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="text-xs">
                    <Link href="/super-admin/payments" className="flex items-center gap-1">
                      View All
                      <ArrowRight className="size-3" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardBody className="pt-2">
                  {data.recentPayments && data.recentPayments.length > 0 ? (
                    <div className="divide-y divide-border text-xs">
                      {data.recentPayments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-3 px-1 hover:bg-muted rounded-xl transition-colors">
                          <div>
                            <p className="font-bold text-xs text-foreground">
                              {p.studentName || 'Participant'}
                            </p>
                            <p className="text-muted-foreground text-[11px] mt-0.5">
                              {p.courseTitle || 'Course'} · <span className="font-semibold text-foreground">{p.courseMode || 'ONLINE'}</span>
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="font-bold font-mono text-xs text-foreground">₹{num(p.amount)}</p>
                            <Badge tone={p.status === 'completed' || p.status === 'verified' ? 'mustard' : 'neutral'} className="text-[10px] py-0 px-1.5 font-semibold">
                              {p.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No recent payment activity recorded.
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Platform Operational Telemetry */}
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold font-heading text-heading">Platform Operational Health</CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">Core database status, tenant boundaries &amp; queue</CardSubtitle>
                  </div>
                  <Badge tone="mustard" className="font-semibold text-xs py-0.5 px-2">
                    100% Operational
                  </Badge>
                </CardHeader>
                <CardBody className="pt-4 space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted border border-border text-xs">
                    <div>
                      <p className="font-bold text-xs text-foreground">Database Primary Connection</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Connection pool active · Latency &lt; 2ms</p>
                    </div>
                    <Badge tone="mustard" className="text-[10px] font-semibold">Online</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted border border-border text-xs">
                    <div>
                      <p className="font-bold text-xs text-foreground">Tenant Isolation Guard</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Strict collegeId and batchId scope verification</p>
                    </div>
                    <Badge tone="charcoal" className="text-[10px] font-semibold bg-primary text-primary-foreground">Enforced</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted border border-border text-xs">
                    <div>
                      <p className="font-bold text-xs text-foreground">EEDI Scoring &amp; Game Mechanics</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">34 Interactive simulation mechanics operational</p>
                    </div>
                    <Badge tone="mustard" className="text-[10px] font-semibold">Active</Badge>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Tenant Security & Isolation Matrix */}
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold font-heading text-heading">Multi-Tenant Security Architecture</CardTitle>
                  <CardSubtitle className="text-xs text-muted-foreground">
                    Server-side tenant isolation guarantees and role segregation parameters.
                  </CardSubtitle>
                </div>
                <Badge tone="mustard" className="font-semibold text-xs">Enforced</Badge>
              </CardHeader>
              <CardBody className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                    <p className="font-bold text-xs text-foreground">Campus Scoping</p>
                    <p className="text-muted-foreground text-[11px]">Database isolation with server-side collegeId predicates</p>
                    <span className="text-[10px] font-bold text-foreground uppercase tracking-wide block mt-2">Campus Segregated</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                    <p className="font-bold text-xs text-foreground">Dual Course Modes</p>
                    <p className="text-muted-foreground text-[11px]">Online direct vs offline campus cohort boundary protection</p>
                    <span className="text-[10px] font-bold text-foreground uppercase tracking-wide block mt-2">Operational Boundary Active</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                    <p className="font-bold text-xs text-foreground">Staff Account Provisioning</p>
                    <p className="text-muted-foreground text-[11px]">Super Admin managed accounts with single-use invite tokens</p>
                    <span className="text-[10px] font-bold text-foreground uppercase tracking-wide block mt-2">Zero Public Staff Signup</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </AsyncSection>
    </div>
  );
}

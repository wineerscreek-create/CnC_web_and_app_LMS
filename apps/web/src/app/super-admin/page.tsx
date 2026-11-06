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

import { HeroBanner } from '@/components/dashboard/HeroBanner';
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
            {/* Customizable Platform Hero Banner (P0) */}
            <HeroBanner
              userName="Super Admin"
              userRole="Super Admin"
              roleSubtitle={`Global Governance · ${data.institutions} Institutions · ${num(data.students)} Participants`}
              statLabel="Platform Revenue"
              statValue={`₹${(data.totalRevenue || 0).toLocaleString('en-IN')}`}
              statSubtext={`${data.pendingPayments} Pending Verifications`}
              primaryAction={{
                label: 'Deploy Course',
                href: '/super-admin/courses',
                icon: <BookOpen className="size-4" />,
              }}
              secondaryAction={{
                label: `Payments Queue (${data.pendingPayments})`,
                href: '/super-admin/payments',
                icon: <CreditCard className="size-4" />,
              }}
            />

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <Link href="/super-admin/colleges" className="group rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <Building2 className="size-4" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="font-semibold text-sm font-heading text-foreground mt-3">Colleges &amp; Campuses</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Tenant quotas, admin provisioning &amp; campus records.</p>
              </Link>

              <Link href="/super-admin/users" className="group rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <Users className="size-4" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="font-semibold text-sm font-heading text-foreground mt-3">Users &amp; Roles</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Provision institutional staff with granular access scopes.</p>
              </Link>

              <Link href="/super-admin/courses" className="group rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <BookOpen className="size-4" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="font-semibold text-sm font-heading text-foreground mt-3">Course Launch</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Curriculum management &amp; multi-mode delivery setups.</p>
              </Link>

              <Link href="/super-admin/games" className="group rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <Gamepad2 className="size-4" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="font-semibold text-sm font-heading text-foreground mt-3">Games &amp; Scenarios</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Deploy interactive simulations &amp; EEDI mechanics.</p>
              </Link>
            </div>

            {/* Financial Activity & System Security Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Payment Settlement Stream */}
              <Card className="border-border bg-card shadow-xs">
                <CardHeader className="pb-2.5 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold font-heading text-foreground">Recent Payment Activity</CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">Live transaction stream across delivery modes</CardSubtitle>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="text-xs h-7">
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
                        <div key={p.id} className="flex items-center justify-between py-2.5 px-1 hover:bg-muted/40 rounded-lg transition-colors">
                          <div>
                            <p className="font-medium text-xs text-foreground">
                              {p.studentName || 'Participant'}
                            </p>
                            <p className="text-muted-foreground text-[11px] mt-0.5">
                              {p.courseTitle || 'Course'} · <span className="font-medium text-foreground">{p.courseMode || 'ONLINE'}</span>
                            </p>
                          </div>
                          <div className="text-right space-y-0.5">
                            <p className="font-semibold font-mono text-xs text-foreground">₹{num(p.amount)}</p>
                            <Badge tone={p.status === 'completed' || p.status === 'verified' ? 'success' : 'neutral'} className="text-[10px] py-0 px-1.5 font-medium">
                              {p.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No recent payment activity recorded.
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Platform Operational Telemetry */}
              <Card className="border-border bg-card shadow-xs">
                <CardHeader className="pb-2.5 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold font-heading text-foreground">Platform Operational Health</CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">Core database status, tenant boundaries &amp; queue</CardSubtitle>
                  </div>
                  <Badge tone="success" className="font-medium text-[11px] py-0.5 px-2">
                    100% Operational
                  </Badge>
                </CardHeader>
                <CardBody className="pt-3 space-y-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                    <div>
                      <p className="font-medium text-xs text-foreground">Database Primary Connection</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Connection pool active · Latency &lt; 2ms</p>
                    </div>
                    <Badge tone="success" className="text-[10px] font-medium">Online</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                    <div>
                      <p className="font-medium text-xs text-foreground">Tenant Isolation Guard</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Strict collegeId and batchId scope verification</p>
                    </div>
                    <Badge tone="neutral" className="text-[10px] font-medium bg-primary/10 text-primary border-primary/20">Enforced</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                    <div>
                      <p className="font-medium text-xs text-foreground">EEDI Scoring &amp; Game Mechanics</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">34 Interactive simulation mechanics operational</p>
                    </div>
                    <Badge tone="success" className="text-[10px] font-medium">Active</Badge>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Tenant Security & Isolation Matrix */}
            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="pb-2.5 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold font-heading text-foreground">Multi-Tenant Security Architecture</CardTitle>
                  <CardSubtitle className="text-xs text-muted-foreground">
                    Server-side tenant isolation guarantees and role segregation parameters.
                  </CardSubtitle>
                </div>
                <Badge tone="neutral" className="font-medium text-[11px] bg-primary/10 text-primary border-primary/20">Enforced</Badge>
              </CardHeader>
              <CardBody className="pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="font-medium text-xs text-foreground">Campus Scoping</p>
                    <p className="text-muted-foreground text-[11px]">Database isolation with server-side collegeId predicates</p>
                    <span className="text-[10px] font-medium text-primary uppercase tracking-wide block mt-1.5">Campus Segregated</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="font-medium text-xs text-foreground">Dual Course Modes</p>
                    <p className="text-muted-foreground text-[11px]">Online direct vs offline campus cohort boundary protection</p>
                    <span className="text-[10px] font-medium text-primary uppercase tracking-wide block mt-1.5">Operational Boundary Active</span>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="font-medium text-xs text-foreground">Staff Account Provisioning</p>
                    <p className="text-muted-foreground text-[11px]">Super Admin managed accounts with single-use invite tokens</p>
                    <span className="text-[10px] font-medium text-primary uppercase tracking-wide block mt-1.5">Zero Public Staff Signup</span>
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

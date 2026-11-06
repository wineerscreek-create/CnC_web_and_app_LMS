'use client';

import { Building2, BookOpen, Users, ShieldCheck, Key, Lock, Globe } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/card';
import { DetailList } from '@/components/shared/misc';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';

export default function SuperAdminProfilePage() {
  const query = useApi<any>('/super-admin/profile');

  return (
    <GlobalPageBackground
      image="/images/backgrounds/superadmin.webp"
      variant="dark"
      orbTone="purple"
      className="min-h-full rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <PageHeader
        title="Super Admin Profile"
        description="Platform root authority account settings, scope boundaries and system telemetry."
        actions={
          <Badge tone="purple" dot>
            Platform Wide Authority
          </Badge>
        }
      />

      <AsyncSection query={query} skeleton="detail">
        {(profile) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Partner Colleges"
                value={num(profile.collegesCount ?? 0)}
                tone="indigo"
                icon={<Building2 className="size-4" />}
                hint="Total onboarded campuses"
              />
              <StatCard
                label="Published Courses"
                value={num(profile.coursesCount ?? 0)}
                tone="purple"
                icon={<BookOpen className="size-4" />}
                hint="Platform-wide curriculum"
              />
              <StatCard
                label="Total Platform Users"
                value={num(profile.totalUsersCount ?? 0)}
                tone="success"
                icon={<Users className="size-4" />}
                hint="Staff and participants"
              />
              <StatCard
                label="Security Tier"
                value="Root SuperAdmin"
                tone="amber"
                icon={<ShieldCheck className="size-4" />}
                hint="Cross-tenant access enabled"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Account Details</CardTitle>
                  <CardSubtitle>Authoritative platform operator credentials</CardSubtitle>
                </CardHeader>
                <CardBody>
                  <DetailList
                    rows={[
                      { label: 'Name', value: profile.name || 'Super Administrator' },
                      { label: 'Email', value: profile.email || 'superadmin@eedilms.app' },
                      { label: 'Role', value: 'SUPER_ADMIN' },
                      { label: 'Status', value: profile.status || 'ACTIVE' },
                      { label: 'Scope', value: 'Platform Wide (Global)' },
                      { label: 'Account Created', value: profile.createdAt ? formatDate(profile.createdAt, true) : 'System Origin' },
                      { label: 'Last Login', value: profile.lastLoginAt ? formatDate(profile.lastLoginAt, true) : 'Current Session' },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Security & Governance</CardTitle>
                  <CardSubtitle>Privilege tier and auditing requirements</CardSubtitle>
                </CardHeader>
                <CardBody className="space-y-4 text-xs text-muted-foreground leading-relaxed">
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                    <Globe className="size-5 text-indigo shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Global Isolation Bypass</p>
                      <p className="mt-0.5">
                        Super Admin accounts operate platform-wide without institution or department filtering. All operations are logged in immutable system audit trails.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                    <Lock className="size-5 text-amber shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Permanent Deletion Re-authentication</p>
                      <p className="mt-0.5">
                        High-risk actions, including irrevocable deletion of courses, require explicit password re-authentication to prevent accidental data destruction.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
                    <Key className="size-5 text-teal shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Centralized Telemetry</p>
                      <p className="mt-0.5">
                        AI cost metrics, Redis queues, and server health telemetry are strictly restricted to the Super Admin console.
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </AsyncSection>
    </GlobalPageBackground>
  );
}


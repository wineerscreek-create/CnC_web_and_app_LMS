'use client';

import {
  CalendarDays,
  FileText,
  Pencil,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { RadialScore } from '@/components/charts';
import { DetailList } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar, ScoreCard } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num, pct } from '@/lib/format';
import { useAppDispatch } from '@/store';
import { userUpdated } from '@/store/authSlice';

export default function StudentProfilePage() {
  const dispatch = useAppDispatch();
  const query = useApi<any>('/student/profile');

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState<Record<string, string>>({});

  // Goal editing
  const [goalForm, setGoalForm] = React.useState<Record<string, string>>({});
  const [savingGoal, setSavingGoal] = React.useState(false);

  React.useEffect(() => {
    const data = query.data;
    if (!data) return;
    setForm({
      name: data.account.name ?? '',
      phone: data.account.phone ?? '',
      section: data.profile.section ?? '',
      program: data.profile.program ?? '',
      guardianName: data.profile.guardianInfo?.name ?? '',
      guardianPhone: data.profile.guardianInfo?.phone ?? '',
      bio: data.profile.bio ?? '',
    });
    if (data.placementGoal) {
      setGoalForm({
        targetRole: data.placementGoal.targetRole ?? '',
        targetScore: String(data.placementGoal.targetScore ?? ''),
        targetDate: String(data.placementGoal.targetDate ?? '').slice(0, 10),
        focusAreas: (data.placementGoal.focusAreas ?? []).join(', '),
      });
    }
  }, [query.data]);

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const response = await api.patch('/student/profile', {
        name: form.name || undefined,
        phone: form.phone || undefined,
        section: form.section || undefined,
        program: form.program || undefined,
        guardianName: form.guardianName || undefined,
        guardianPhone: form.guardianPhone || undefined,
        bio: form.bio || undefined,
      });
      toast.success(response.message ?? 'Profile updated');
      if (form.name) dispatch(userUpdated({ name: form.name }));
      setEditing(false);
      query.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal() {
    setSavingGoal(true);
    try {
      await api.put('/student/placement-goal', {
        targetRole: goalForm.targetRole,
        targetScore: Number(goalForm.targetScore),
        targetDate: goalForm.targetDate,
        focusAreas: goalForm.focusAreas
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      toast.success('Career goal saved');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSavingGoal(false);
    }
  }

  return (
    <div className="space-y-6">
      <AsyncSection query={query} skeleton="detail">
        {(data) => {
          const goal = data.placementGoal;
          return (
            <>
              <PageHeader
                title="My Profile & Career Plan"
                description="Your student record, institutional profile, career objectives and automated competency roadmap."
                actions={
                  <Button
                    variant={editing ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => setEditing((value) => !value)}
                    className="flex items-center gap-1.5"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    {editing ? 'Cancel Editing' : 'Edit Profile'}
                  </Button>
                }
              />

              <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
                {/* ---------------------------------------------------------- summary */}
                <div className="space-y-5">
                  <Card className="border-border bg-card shadow-card">
                    <CardBody className="p-5 text-center">
                      <Avatar
                        name={data.profile.name}
                        color={data.profile.avatarColor}
                        size={68}
                        className="mx-auto shadow-xs"
                      />
                      <p className="mt-3.5 text-base font-bold font-heading text-heading">{data.profile.name}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{data.profile.rollNumber}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.profile.departmentName} · {data.profile.batchName}
                      </p>
                      <div className="mt-5 pt-4 border-t border-border text-left">
                        <ProgressBar
                          label="Profile completeness"
                          value={data.profileCompleteness}
                        />
                      </div>
                    </CardBody>
                  </Card>

                  <Card className="border-border bg-card shadow-card">
                    <CardBody className="p-5 text-center">
                      <RadialScore
                        value={data.readiness.score}
                        label="Readiness"
                        size={104}
                        thickness={9}
                      />
                      <p className="mt-3 text-base font-bold font-heading text-heading">Readiness Score</p>
                      {data.readiness.delta != null && (
                        <p
                          className={cn(
                            'tnum text-xs font-bold font-mono mt-1',
                            data.readiness.delta >= 0 ? 'text-heading' : 'text-muted-foreground',
                          )}
                        >
                          {data.readiness.delta >= 0 ? '+' : ''}
                          {data.readiness.delta} since last evaluation
                        </p>
                      )}
                      <Button asChild variant="ghost" size="sm" className="mt-3 w-full text-xs">
                        <Link href="/student/progress" className="flex items-center justify-center gap-1.5">
                          <TrendingUp className="size-3.5 text-accent" aria-hidden />
                          View Detailed Analytics
                        </Link>
                      </Button>
                    </CardBody>
                  </Card>

                  <Card className="border-border bg-card shadow-card">
                    <CardHeader className="pb-3 border-b border-border">
                      <CardTitle className="text-base font-bold font-heading text-heading">Resume Profile</CardTitle>
                    </CardHeader>
                    <CardBody className="pt-4">
                      <p className="flex items-center gap-2 text-xs font-medium text-heading">
                        <FileText className="size-4 text-accent" aria-hidden />
                        {data.resume.status === 'missing' ? 'No resume uploaded yet' : 'Resume on file'}
                      </p>
                      {data.resume.lastUpdatedAt && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Updated {formatDate(data.resume.lastUpdatedAt)}
                        </p>
                      )}
                      <Button asChild variant="secondary" size="sm" className="mt-4 w-full text-xs">
                        <Link href="/student/resume-analyzer">Launch Resume Analyzer</Link>
                      </Button>
                    </CardBody>
                  </Card>
                </div>

                {/* ----------------------------------------------------------- detail */}
                <div>
                  <Tabs defaultValue="details">
                    <div className="mb-5">
                      <TabsList className="bg-muted p-1 rounded-2xl border border-border">
                        <TabsTrigger
                          value="details"
                          className="rounded-xl px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground"
                        >
                          Personal Details
                        </TabsTrigger>
                        <TabsTrigger
                          value="plan"
                          className="rounded-xl px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground"
                        >
                          Career Roadmap
                        </TabsTrigger>
                        <TabsTrigger
                          value="week"
                          className="rounded-xl px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground"
                        >
                          Week Schedule
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="details" className="space-y-5">
                      <Card className="border-border bg-card shadow-card">
                        <CardHeader className="pb-3 border-b border-border">
                          <div>
                            <CardTitle className="text-base font-bold font-heading text-heading">Student Information</CardTitle>
                            <CardSubtitle className="text-xs text-muted-foreground">
                              Official student record details and institutional cohort mapping
                            </CardSubtitle>
                          </div>
                        </CardHeader>
                        <CardBody className="pt-4">
                          {editing ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
                                <Input
                                  id="name"
                                  value={form.name ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({ ...current, name: event.target.value }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
                                <Input
                                  id="phone"
                                  value={form.phone ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({ ...current, phone: event.target.value }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <Field label="Section" htmlFor="section" error={fieldErrors.section}>
                                <Input
                                  id="section"
                                  value={form.section ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      section: event.target.value,
                                    }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <Field label="Program" htmlFor="program" error={fieldErrors.program}>
                                <Input
                                  id="program"
                                  value={form.program ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      program: event.target.value,
                                    }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <Field
                                label="Guardian name"
                                htmlFor="guardianName"
                                error={fieldErrors.guardianName}
                              >
                                <Input
                                  id="guardianName"
                                  value={form.guardianName ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      guardianName: event.target.value,
                                    }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <Field
                                label="Guardian phone"
                                htmlFor="guardianPhone"
                                error={fieldErrors.guardianPhone}
                              >
                                <Input
                                  id="guardianPhone"
                                  value={form.guardianPhone ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      guardianPhone: event.target.value,
                                    }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <Field
                                label="About me"
                                htmlFor="bio"
                                className="sm:col-span-2"
                                error={fieldErrors.bio}
                              >
                                <Textarea
                                  id="bio"
                                  rows={4}
                                  value={form.bio ?? ''}
                                  onChange={(event) =>
                                    setForm((current) => ({ ...current, bio: event.target.value }))
                                  }
                                  className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                                />
                              </Field>
                              <div className="sm:col-span-2">
                                <Button variant="primary" loading={saving} onClick={save} className="flex items-center gap-1.5">
                                  <Save className="size-3.5" aria-hidden />
                                  Save Changes
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <DetailList
                              rows={[
                                { label: 'Full name', value: data.account.name },
                                { label: 'Email', value: data.account.email },
                                { label: 'Phone', value: data.account.phone ?? '—' },
                                { label: 'Roll number', value: data.profile.rollNumber },
                                { label: 'Department', value: data.profile.departmentName },
                                {
                                  label: 'Batch',
                                  value: data.profile.batchName
                                    ? data.profile.batchCode
                                      ? `${data.profile.batchName} (${data.profile.batchCode})`
                                      : data.profile.batchName
                                    : '—',
                                },
                                {
                                  label: 'Semester',
                                  value: data.profile.semester != null ? `Semester ${data.profile.semester}` : '—',
                                },
                                { label: 'Section', value: data.profile.section ?? '—' },
                                { label: 'Program', value: data.profile.program ?? '—' },
                                {
                                  label: 'Guardian',
                                  value: data.profile.guardianInfo?.name
                                    ? `${data.profile.guardianInfo.name} · ${data.profile.guardianInfo.phone ?? ''}`
                                    : '—',
                                },
                              ]}
                            />
                          )}
                        </CardBody>
                      </Card>

                      <Card className="border-border bg-card shadow-card">
                        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-base font-bold font-heading text-heading">Account & Security</CardTitle>
                            <CardSubtitle className="text-xs text-muted-foreground">Authentication settings and security parameters</CardSubtitle>
                          </div>
                          <ShieldCheck className="size-4 text-accent" aria-hidden />
                        </CardHeader>
                        <CardBody className="pt-4">
                          <DetailList
                            rows={[
                              {
                                label: 'Password changed',
                                value: data.account.lastPasswordChangeAt
                                  ? formatDate(data.account.lastPasswordChangeAt, true)
                                  : 'Never changed',
                              },
                              {
                                label: 'Two-factor auth',
                                value: data.account.twoFactorEnabled ? 'Enabled' : 'Not configured',
                              },
                            ]}
                          />
                          <Button asChild variant="secondary" size="sm" className="mt-4 text-xs">
                            <Link href="/student/settings">Open Account Settings</Link>
                          </Button>
                        </CardBody>
                      </Card>
                    </TabsContent>

                    <TabsContent value="plan" className="space-y-5">
                      <Card className="border-border bg-card shadow-card">
                        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-base font-bold font-heading text-heading">Target Career Goal</CardTitle>
                            <CardSubtitle className="text-xs text-muted-foreground">
                              {goal
                                ? `Target score: ${goal.targetScore} by ${formatDate(goal.targetDate)}`
                                : 'Set your dream role and target timeline'}
                            </CardSubtitle>
                          </div>
                          <Target className="size-4 text-accent" aria-hidden />
                        </CardHeader>
                        <CardBody className="pt-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Target role" htmlFor="targetRole">
                              <Input
                                id="targetRole"
                                value={goalForm.targetRole ?? ''}
                                onChange={(event) =>
                                  setGoalForm((current) => ({
                                    ...current,
                                    targetRole: event.target.value,
                                  }))
                                }
                                placeholder="e.g. Software Engineer / Consultant"
                                className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                              />
                            </Field>
                            <Field label="Target readiness score (0-100)" htmlFor="targetScore">
                              <Input
                                id="targetScore"
                                type="number"
                                min={0}
                                max={100}
                                value={goalForm.targetScore ?? ''}
                                onChange={(event) =>
                                  setGoalForm((current) => ({
                                    ...current,
                                    targetScore: event.target.value,
                                  }))
                                }
                                className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                              />
                            </Field>
                            <Field label="Target achievement date" htmlFor="targetDate">
                              <Input
                                id="targetDate"
                                type="date"
                                value={goalForm.targetDate ?? ''}
                                onChange={(event) =>
                                  setGoalForm((current) => ({
                                    ...current,
                                    targetDate: event.target.value,
                                  }))
                                }
                                className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                              />
                            </Field>
                            <Field
                              label="Focus areas"
                              htmlFor="focusAreas"
                              hint="Comma separated"
                            >
                              <Input
                                id="focusAreas"
                                value={goalForm.focusAreas ?? ''}
                                onChange={(event) =>
                                  setGoalForm((current) => ({
                                    ...current,
                                    focusAreas: event.target.value,
                                  }))
                                }
                                placeholder="e.g. Public Speaking, Aptitude"
                                className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground"
                              />
                            </Field>
                          </div>
                          <Button
                            variant="primary"
                            className="mt-4 flex items-center gap-1.5"
                            loading={savingGoal}
                            onClick={saveGoal}
                            disabled={!goalForm.targetRole || !goalForm.targetDate}
                          >
                            <Save className="size-3.5" aria-hidden />
                            Save Career Goal
                          </Button>
                        </CardBody>
                      </Card>

                      {goal && (
                        <>
                          <Card className="border-border bg-card shadow-card">
                            <CardHeader className="pb-3 border-b border-border">
                              <div>
                                <CardTitle className="text-base font-bold font-heading text-heading">Gap to Target Role</CardTitle>
                                <CardSubtitle className="text-xs text-muted-foreground">
                                  Currently {num(goal.currentScore, 1)} of {num(goal.targetScore, 0)} target threshold
                                </CardSubtitle>
                              </div>
                            </CardHeader>
                            <CardBody className="pt-4">
                              <ProgressBar
                                value={(goal.currentScore / Math.max(1, goal.targetScore)) * 100}
                                label={`${pct((goal.currentScore / Math.max(1, goal.targetScore)) * 100, 0)} reached towards readiness goal`}
                              />
                              <div className="mt-4 space-y-3">
                                {(goal.skillGaps ?? []).map((gap: any) => (
                                  <ScoreCard key={gap.label} label={gap.label} value={gap.score} />
                                ))}
                              </div>
                              {goal.focusAreas?.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-1.5">
                                  {goal.focusAreas.map((area: string) => (
                                    <Badge key={area} tone="mustard" className="font-semibold text-xs">
                                      {area}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </CardBody>
                          </Card>

                          <Card className="border-border bg-card shadow-card">
                            <CardHeader className="pb-3 border-b border-border">
                              <div>
                                <CardTitle className="text-base font-bold font-heading text-heading">Tailored Development Roadmap</CardTitle>
                                <CardSubtitle className="text-xs text-muted-foreground">Action items derived from your lowest evaluated dimensions</CardSubtitle>
                              </div>
                            </CardHeader>
                            <CardBody className="pt-4">
                              <ol className="space-y-4">
                                {(goal.roadmap ?? []).map((step: any) => (
                                  <li key={step.step} className="flex items-start gap-3.5 p-3 rounded-2xl bg-muted/40 border border-border">
                                    <span className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                                      {step.step}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold text-heading">{step.title}</p>
                                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{step.detail}</p>
                                      <ProgressBar
                                        value={step.percent}
                                        className="mt-2.5"
                                        showValue={false}
                                        thin
                                      />
                                    </div>
                                    <Badge tone={step.state === 'completed' ? 'mustard' : 'neutral'} className="text-xs font-semibold">
                                      {step.percent}%
                                    </Badge>
                                  </li>
                                ))}
                              </ol>
                            </CardBody>
                          </Card>
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="week">
                      <Card className="border-border bg-card shadow-card">
                        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-base font-bold font-heading text-heading">Cohort Weekly Schedule</CardTitle>
                            <CardSubtitle className="text-xs text-muted-foreground">Upcoming classes, evaluation tests and submission deadlines</CardSubtitle>
                          </div>
                          <CalendarDays className="size-4 text-accent" aria-hidden />
                        </CardHeader>
                        <CardBody className="pt-4">
                          <ol className="space-y-3">
                            {data.weekSchedule.map((day: any) => (
                              <li
                                key={day.label}
                                className={cn(
                                  'rounded-2xl border p-4 transition-all duration-200',
                                  day.isToday ? 'border-accent bg-accent/20 shadow-xs' : 'border-border bg-muted/40',
                                )}
                              >
                                <p className="text-xs font-bold text-heading flex items-center">
                                  {day.label}
                                  {day.isToday && (
                                    <span className="ml-2 rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-bold">
                                      Today
                                    </span>
                                  )}
                                </p>
                                {day.restDay || day.items.length === 0 ? (
                                  <p className="mt-1 text-xs text-muted-foreground">No academic events scheduled</p>
                                ) : (
                                  <ul className="mt-2 space-y-1.5">
                                    {day.items.map((item: any, index: number) => (
                                      <li key={index} className="text-xs text-muted-foreground">
                                        <span className="font-semibold text-heading">{item.label}:</span>{' '}
                                        {item.title}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ol>
                        </CardBody>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </>
          );
        }}
      </AsyncSection>
    </div>
  );
}

'use client';

import { AlertTriangle, Info } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { PasswordStrength, passwordScore } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';

interface Institution {
  code: string;
  name: string;
  city?: string;
  departments: { code: string; name: string }[];
}

const DEFAULT_INSTITUTIONS: Institution[] = [
  {
    code: 'ABC',
    name: 'ABC Engineering College',
    city: 'Bengaluru',
    departments: [
      { code: 'CSE', name: 'Computer Science & Engineering' },
      { code: 'AIDS', name: 'Artificial Intelligence & Data Science' },
      { code: 'ECE', name: 'Electronics & Communication' },
      { code: 'MECH', name: 'Mechanical Engineering' },
    ],
  },
];

export default function SignupPage() {
  const router = useRouter();
  const institutions = useApi<Institution[]>('/home/institutions');
  const institutionList =
    institutions.data && institutions.data.length > 0
      ? institutions.data
      : DEFAULT_INSTITUTIONS;

  const [form, setForm] = React.useState({
    name: '',
    email: '',
    institutionId: '',
    collegeCode: '',
    departmentCode: '',
    password: '',
    confirmPassword: '',
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const college = institutionList.find((item) => item.code === form.collegeCode);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    setPending(true);
    try {
      await api.post('/auth/signup', {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: 'STUDENT',
        collegeCode: form.collegeCode || undefined,
        departmentCode: form.departmentCode || undefined,
        institutionId: form.institutionId.trim() || undefined,
      });
      router.push(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.message);
      setFieldErrors(apiError.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-auth-wide className="w-full">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-heading">Create Student Account</h1>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Participant enrollment registration. Faculty, HOD, and administrative accounts are provisioned directly by your institution.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <Field label="Full name" htmlFor="name" required error={fieldErrors.name}>
          <Input
            id="name"
            required
            autoComplete="name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            className="rounded-xl text-sm"
          />
        </Field>

        <Field label="College email" htmlFor="email" required error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
            placeholder="you@college.edu"
            className="rounded-xl text-sm"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Institution" htmlFor="collegeCode" required error={fieldErrors.collegeCode} className="min-w-0">
            <Select
              value={form.collegeCode}
              onValueChange={(value) => {
                set('collegeCode', value);
                set('departmentCode', '');
              }}
            >
              <SelectTrigger id="collegeCode" aria-label="Institution" className="rounded-xl text-xs">
                <SelectValue placeholder="Select your college" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {institutionList.map((item) => (
                  <SelectItem key={item.code} value={item.code} className="text-xs">
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Department"
            htmlFor="departmentCode"
            required
            error={fieldErrors.departmentCode}
            className="min-w-0"
          >
            <Select
              value={form.departmentCode}
              onValueChange={(value) => set('departmentCode', value)}
              disabled={!college}
            >
              <SelectTrigger id="departmentCode" aria-label="Department" className="rounded-xl text-xs">
                <SelectValue placeholder={college ? 'Select your department' : 'Pick college first'} />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {(college?.departments ?? []).map((item) => (
                  <SelectItem key={item.code} value={item.code} className="text-xs">
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field
          label="Roll number / Student ID"
          htmlFor="institutionId"
          hint="Allows signing in with your student roll number."
          error={fieldErrors.institutionId}
        >
          <Input
            id="institutionId"
            value={form.institutionId}
            onChange={(event) => set('institutionId', event.target.value)}
            placeholder="e.g. 21EC042"
            className="rounded-xl text-sm"
          />
        </Field>

        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
            <Input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => set('password', event.target.value)}
              className="rounded-xl text-sm"
            />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            required
            error={fieldErrors.confirmPassword}
          >
            <Input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => set('confirmPassword', event.target.value)}
              className="rounded-xl text-sm"
            />
          </Field>
        </div>
        <PasswordStrength value={form.password} />

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-xs font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
            {error}
          </p>
        )}

        {!institutions.loading && institutions.data && institutions.data.length === 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-accent/20 border border-accent/40 p-3 text-xs text-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            No institutions have opened open self-registration. Contact your academic programme office.
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2 font-bold"
          loading={pending}
          disabled={passwordScore(form.password) < 2}
        >
          Create Student Account
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-bold text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

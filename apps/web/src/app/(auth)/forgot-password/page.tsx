'use client';

import { AlertTriangle, KeyRound, MailCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post('/auth/forgot-password', { identifier: identifier.trim() });
      setSent(true);
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <>
        <span className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-[26px] font-semibold tracking-tight">Check your email</h1>
        <p className="mt-1.5 text-base text-ink-2">
          If an account exists for <span className="font-semibold text-ink">{identifier.trim()}</span>,
          we’ve sent a secure password reset link to your registered email address. The link expires in 15 minutes.
        </p>
        <Button asChild variant="primary" className="mt-5 w-full" size="lg">
          <Link href="/login">
            Back to sign in
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
        <KeyRound className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-serif text-[26px] font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-base text-ink-2">
        Enter your registered email address or institution ID (e.g. roll number) to receive a secure password reset link.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Email address or Institution ID" htmlFor="identifier" required>
          <Input
            id="identifier"
            type="text"
            required
            autoComplete="username"
            placeholder="e.g. name@college.edu or 23EARCS142"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[10px] bg-danger-bg px-3.5 py-2.5 text-sm font-semibold text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!identifier.trim()}>
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-base text-ink-2">
        <Link href="/login" className="font-semibold text-indigo hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

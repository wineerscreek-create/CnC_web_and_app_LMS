'use client';

import { AlertTriangle, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { PasswordStrength, passwordScore } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.push('/login'), 2500);
    return () => clearTimeout(timer);
  }, [done, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!token) {
      setError('A valid reset link is required. Please request a new link.');
      return;
    }

    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match' });
      return;
    }

    setPending(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        password,
        confirmPassword: confirm,
      });
      setDone(true);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.message);
      setFieldErrors(apiError.fieldErrors || {});
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-heading">Password updated</h1>
        <p className="mt-1.5 text-base text-muted-foreground">
          Your password has been changed successfully. All active sessions have been signed out. Redirecting to sign in...
        </p>
        <Button asChild variant="primary" className="mt-5 font-bold" size="lg">
          <Link href="/login">Sign in now</Link>
        </Button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-accent/15 text-gold-text">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-heading">Password reset link required</h1>
        <p className="mt-2 text-base text-muted-foreground">
          To reset your password, please use the reset link sent to your registered email address.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild variant="primary" size="lg" className="w-full font-bold">
            <Link href="/forgot-password">Request password reset link</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-primary">
        <ShieldCheck className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-heading">Choose a new password</h1>
      <p className="mt-1.5 text-base text-muted-foreground">
        Pick a secure password you haven’t used here before.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <Field label="New password" htmlFor="password" required error={fieldErrors.password}>
            <Input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl text-sm"
            />
          </Field>
          <PasswordStrength value={password} />
        </div>

        <Field label="Confirm new password" htmlFor="confirm" required error={fieldErrors.confirm}>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="rounded-xl text-sm"
          />
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/30 px-3.5 py-2.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full font-bold"
          loading={pending}
          disabled={passwordScore(password) < 2}
        >
          Update password
        </Button>
      </form>

      <p className="mt-5 text-base text-muted-foreground">
        <Link href="/login" className="font-semibold text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

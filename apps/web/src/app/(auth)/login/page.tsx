'use client';

import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/misc';
import { Field, Input, Label } from '@/components/ui/input';
import { ROLE_LABEL, type Role } from '@/lib/roleRoutes';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearAuthError, signIn } from '@/store/authSlice';

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const { signingIn, error, status, user } = useAppSelector((state) => state.auth);

  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);

  const hintedRole = params.get('role') as Role | null;
  const next = params.get('next');

  // Already signed in (or just signed in): go where this role belongs.
  React.useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(next && next.startsWith('/') ? next : user.home);
    }
  }, [status, user, next, router]);

  React.useEffect(() => () => void dispatch(clearAuthError()), [dispatch]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await dispatch(
      signIn({ identifier: identifier.trim(), password, rememberMe: remember }),
    );
  }

  return (
    <>
      <h1 className="font-heading text-2xl font-bold tracking-tight text-heading">Sign In</h1>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {hintedRole
          ? `${ROLE_LABEL[hintedRole] ?? 'Portal'} access — use your college email or institution ID.`
          : 'Enter your institutional email address or student roll ID.'}
      </p>

      <form onSubmit={submit} className="mt-4 sm:mt-5 space-y-3.5" noValidate>
        <Field label="Email or institution ID" htmlFor="identifier">
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="you@college.edu or Roll ID"
            className="rounded-xl text-sm"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-semibold text-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10 rounded-xl text-sm"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer">
          <Checkbox checked={remember} onCheckedChange={(value) => setRemember(Boolean(value))} />
          Keep me signed in on this device
        </label>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-xs font-medium text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full mt-2 font-bold" loading={signingIn}>
          Sign In
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Don’t have an account?{' '}
        <Link href="/signup" className="font-bold text-foreground hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}

'use client';

import { KeyRound, Lock, Loader2, LogOut } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PasswordStrength } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type ApiError } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { signOut, userUpdated } from '@/store/authSlice';

export function ForcePasswordChangeModal() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  if (!user || !user.mustChangePassword) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    if (!currentPassword) {
      setFieldErrors({ currentPassword: 'Enter your current temporary password' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setFieldErrors({ newPassword: 'Password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setSubmitting('changing');
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword,
        password: newPassword,
        confirmPassword,
      });

      toast.success(res.message ?? 'Password updated successfully');
      dispatch(userUpdated({ mustChangePassword: false }));
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.fieldErrors && Object.keys(apiErr.fieldErrors).length > 0) {
        setFieldErrors(apiErr.fieldErrors);
      } else {
        toast.error(apiErr.message ?? 'Failed to update password');
      }
    } finally {
      setSubmitting('');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-password-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <KeyRound className="size-6" />
          </div>
          <div>
            <h2 id="force-password-title" className="text-lg font-semibold text-foreground">
              Password Reset Required
            </h2>
            <p className="text-xs text-muted-foreground">
              Please set a secure permanent password to continue
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            Hi <span className="font-medium text-foreground">{user.name}</span>, your account was
            issued a temporary reset password. You must set a new password before accessing your
            dashboard.
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Current / Temporary Password</label>
            <div className="relative">
              <Input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                className="pl-9"
              />
              <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            </div>
            {fieldErrors.currentPassword && (
              <p className="text-xs text-rose-500">{fieldErrors.currentPassword}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">New Permanent Password</label>
            <div className="relative">
              <Input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="pl-9"
              />
              <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-rose-500">{fieldErrors.password}</p>
            )}
            {fieldErrors.newPassword && (
              <p className="text-xs text-rose-500">{fieldErrors.newPassword}</p>
            )}
            <PasswordStrength value={newPassword} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Confirm New Password</label>
            <div className="relative">
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                className="pl-9"
              />
              <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-rose-500">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => dispatch(signOut())}
              className="text-xs text-muted-foreground gap-1.5"
            >
              <LogOut className="size-3.5" />
              Sign Out
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={submitting === 'changing'}
              className="gap-2"
            >
              {submitting === 'changing' && <Loader2 className="size-3.5 animate-spin" />}
              Set New Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

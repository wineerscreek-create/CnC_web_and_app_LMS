'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { OtpInput } from '@/components/auth/otp-input';
import { PasswordStrength } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, setAccessToken, type ApiError } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearActivationState, activationCompleted, signOut, userUpdated } from '@/store/authSlice';

type ActivationStep = 'email' | 'otp' | 'password';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  const visiblePrefix = local.slice(0, 2);
  const visibleSuffix = local.slice(-1);
  return `${visiblePrefix}${'*'.repeat(Math.max(local.length - 3, 3))}${visibleSuffix}@${domain}`;
}

export function ForcePasswordChangeModal() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, activationToken } = useAppSelector((state) => state.auth);

  // Workflow states
  const [step, setStep] = React.useState<ActivationStep>('email');
  const [personalEmail, setPersonalEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  // Loading & error tracking
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Resend cooldown timer
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!user) {
    return null;
  }
  const currentUser = user;

  // Safe recovery path when activation session is missing or expired
  if (!activationToken) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activation-missing-title"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade"
      >
        <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 mb-4">
            <AlertTriangle className="size-6" />
          </div>
          <h2 id="activation-missing-title" className="text-lg font-bold text-foreground">
            Activation Session Required
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your activation session is missing or has expired. Please sign in with your student ID and temporary password to begin activation.
          </p>
          <Button
            variant="primary"
            className="mt-6 w-full font-bold"
            onClick={() => {
              dispatch(clearActivationState());
              dispatch(signOut());
              router.replace('/login');
            }}
          >
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  const authHeaders = { Authorization: `Bearer ${activationToken}` };

  // --- Step 1: Send OTP to Personal Email ---
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const emailTrimmed = personalEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setFieldErrors({ personalEmail: 'Please enter your personal email address' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      setFieldErrors({ personalEmail: 'Please enter a valid email address' });
      return;
    }

    if (currentUser && emailTrimmed === currentUser.email.toLowerCase()) {
      setFieldErrors({
        personalEmail:
          'Please enter your personal email (e.g. Gmail), not your institutional college email.',
      });
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        '/auth/first-login/send-otp',
        { personalEmail: emailTrimmed },
        { headers: authHeaders },
      );
      toast.success(res.message || 'Verification code sent to your personal email!');
      setCooldown(res.data?.cooldownSeconds || 60);
      setStep('otp');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.fieldErrors && Object.keys(apiErr.fieldErrors).length > 0) {
        setFieldErrors(apiErr.fieldErrors);
      } else {
        setErrorMessage(apiErr.message || 'Failed to send verification code');
        toast.error(apiErr.message || 'Failed to send verification code');
      }
    } finally {
      setLoading(false);
    }
  }

  // --- Resend OTP handler ---
  async function handleResendOtp() {
    if (cooldown > 0 || loading) return;
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await api.post(
        '/auth/first-login/send-otp',
        { personalEmail: personalEmail.trim().toLowerCase() },
        { headers: authHeaders },
      );
      toast.success('A fresh verification code has been sent!');
      setCooldown(res.data?.cooldownSeconds || 60);
      setOtp('');
    } catch (err) {
      const apiErr = err as ApiError;
      setErrorMessage(apiErr.message || 'Failed to resend verification code');
      toast.error(apiErr.message || 'Failed to resend verification code');
    } finally {
      setLoading(false);
    }
  }

  // --- Step 2: Verify OTP ---
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setFieldErrors({ otp: 'Please enter the complete 6-digit code' });
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        '/auth/first-login/verify-otp',
        {
          otp: cleanOtp,
          personalEmail: personalEmail.trim().toLowerCase(),
        },
        { headers: authHeaders },
      );
      toast.success(res.message || 'Email verified! Now set your new password.');
      setStep('password');
    } catch (err) {
      const apiErr = err as ApiError;
      setErrorMessage(apiErr.message || 'Invalid or expired verification code');
      toast.error(apiErr.message || 'Invalid or expired verification code');
    } finally {
      setLoading(false);
    }
  }

  // --- Step 3: Set Permanent Password & Complete Activation ---
  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (!newPassword || newPassword.length < 8) {
      setFieldErrors({ newPassword: 'Password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        '/auth/first-login/complete',
        {
          password: newPassword,
          confirmPassword,
        },
        { headers: authHeaders },
      );

      if (res.data?.accessToken) {
        setAccessToken(res.data.accessToken);
      }

      dispatch(
        activationCompleted({
          user: res.data?.user || {
            personalEmail: personalEmail.trim().toLowerCase(),
            personalEmailVerified: true,
            mustChangePassword: false,
          },
          accessToken: res.data?.accessToken,
        }),
      );

      toast.success('Account activated successfully! Welcome to your dashboard.');

      const target = res.data?.redirectTo || currentUser.home || '/student/dashboard';
      router.replace(target);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.fieldErrors && Object.keys(apiErr.fieldErrors).length > 0) {
        setFieldErrors(apiErr.fieldErrors);
      } else {
        setErrorMessage(apiErr.message || 'Failed to complete password activation');
        toast.error(apiErr.message || 'Failed to complete password activation');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-password-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>
          <div>
            <h2 id="force-password-title" className="text-lg font-bold text-foreground">
              Account Activation & Security Setup
            </h2>
            <p className="text-xs text-muted-foreground">
              Verify your personal email and set your permanent password
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="mt-4 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 'email'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-emerald-500/20 text-emerald-500'
              }`}
            >
              {step !== 'email' ? '✓' : '1'}
            </span>
            <span className={`text-xs font-medium ${step === 'email' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
              Personal Email
            </span>
          </div>

          <div className="h-px flex-1 bg-border/80" />

          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 'otp'
                  ? 'bg-primary text-primary-foreground'
                  : step === 'password'
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step === 'password' ? '✓' : '2'}
            </span>
            <span className={`text-xs font-medium ${step === 'otp' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
              Verify OTP
            </span>
          </div>

          <div className="h-px flex-1 bg-border/80" />

          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 'password'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              3
            </span>
            <span className={`text-xs font-medium ${step === 'password' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
              New Password
            </span>
          </div>
        </div>

        {/* Alert / General Error Box */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ================= STEP 1: PERSONAL EMAIL ================= */}
        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground/90 space-y-1.5">
              <p className="font-semibold text-primary flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> First-Time Sign In for {currentUser.name}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Your institutional ID (<span className="font-medium text-foreground">{currentUser.email}</span>)
                is registered, but institutional addresses do not function as personal inboxes.
                Please link an accessible personal email (e.g. Gmail) for OTP verification, security notices, and password recovery.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="personal-email-input" className="text-xs font-medium text-foreground">
                Personal Email Address
              </label>
              <div className="relative">
                <Input
                  id="personal-email-input"
                  type="email"
                  required
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  placeholder="your.name@gmail.com"
                  autoComplete="email"
                  className="pl-9 rounded-xl text-sm"
                />
                <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              </div>
              {fieldErrors.personalEmail && (
                <p className="text-xs text-destructive font-medium">{fieldErrors.personalEmail}</p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  dispatch(clearActivationState());
                  dispatch(signOut());
                  router.replace('/login');
                }}
                className="text-xs text-muted-foreground gap-1.5"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={loading}
                className="gap-2 font-semibold"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Send Verification Code
              </Button>
            </div>
          </form>
        )}

        {/* ================= STEP 2: OTP VERIFICATION ================= */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs space-y-1">
              <p className="font-medium text-foreground">
                Verification code sent to{' '}
                <span className="font-bold text-primary">{maskEmail(personalEmail)}</span>
              </p>
              <p className="text-muted-foreground">
                Please check your inbox (and spam folder) for the 6-digit verification code.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground text-center block">
                Enter 6-Digit Code
              </label>
              <div className="flex justify-center">
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  length={6}
                  invalid={Boolean(fieldErrors.otp)}
                />
              </div>
              {fieldErrors.otp && (
                <p className="text-xs text-destructive text-center font-medium">{fieldErrors.otp}</p>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setOtp('');
                  setErrorMessage(null);
                }}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ArrowLeft className="size-3.5" /> Change email
              </button>

              <div>
                {cooldown > 0 ? (
                  <span className="text-muted-foreground">
                    Resend in <span className="font-semibold text-foreground">{cooldown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="font-semibold text-primary hover:underline transition-colors"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  dispatch(clearActivationState());
                  dispatch(signOut());
                  router.replace('/login');
                }}
                className="text-xs text-muted-foreground gap-1.5"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={loading || otp.trim().length < 6}
                className="gap-2 font-semibold"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Verify Code
              </Button>
            </div>
          </form>
        )}

        {/* ================= STEP 3: NEW PERMANENT PASSWORD ================= */}
        {step === 'password' && (
          <form onSubmit={handleSetPassword} className="mt-4 space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Personal email <span className="font-bold underline">{personalEmail}</span> verified successfully.
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-password-input" className="text-xs font-medium text-foreground">
                New Permanent Password
              </label>
              <div className="relative">
                <Input
                  id="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pl-9 pr-9 rounded-xl text-sm"
                />
                <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <p className="text-xs text-destructive font-medium">{fieldErrors.newPassword}</p>
              )}
              <PasswordStrength value={newPassword} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password-input" className="text-xs font-medium text-foreground">
                Confirm Permanent Password
              </label>
              <div className="relative">
                <Input
                  id="confirm-password-input"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new permanent password"
                  autoComplete="new-password"
                  className="pl-9 pr-9 rounded-xl text-sm"
                />
                <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-destructive font-medium">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  dispatch(clearActivationState());
                  dispatch(signOut());
                  router.replace('/login');
                }}
                className="text-xs text-muted-foreground gap-1.5"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={loading || !newPassword || newPassword !== confirmPassword}
                className="gap-2 font-bold"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Set Password & Enter Dashboard
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

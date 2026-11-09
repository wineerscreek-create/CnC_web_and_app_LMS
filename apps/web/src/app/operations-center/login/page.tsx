'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Lock,
  ShieldAlert,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  Terminal,
  QrCode,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

type AuthView = 'login' | 'mfa-setup-auth' | 'mfa-setup-qr';

export default function OperationsCenterLoginPage() {
  const router = useRouter();

  // Mode: standard login vs. MFA enrollment/recovery
  const [view, setView] = React.useState<AuthView>('login');

  // Login form state
  const [username, setUsername] = React.useState('opsadmin');
  const [password, setPassword] = React.useState('');
  const [mfaCode, setMfaCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // MFA Enrollment / Recovery state
  const [setupUsername, setSetupUsername] = React.useState('opsadmin');
  const [setupPassword, setSetupPassword] = React.useState('');
  const [setupToken, setSetupToken] = React.useState('');
  const [qrCodeUrl, setQrCodeUrl] = React.useState('');
  const [otpauthUrl, setOtpauthUrl] = React.useState('');
  const [secretFormatted, setSecretFormatted] = React.useState('');
  const [rawSecret, setRawSecret] = React.useState('');
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [verifyTotpCode, setVerifyTotpCode] = React.useState('');
  const [copiedSecret, setCopiedSecret] = React.useState(false);
  const [copiedCodes, setCopiedCodes] = React.useState(false);

  // Check if already authenticated on initial load
  React.useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('ops_session_token') : null;
    if (token) {
      fetch('/api/v1/operations-center/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) {
            router.push('/operations-center');
          }
        })
        .catch(() => {
          // Stay on login page
        });
    }
  }, [router]);

  // Standard Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/operations-center/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          mfaCode: mfaCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error?.message || data.detail || 'Authentication failed. Access denied.';
        setError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }

      if (data.sessionToken) {
        sessionStorage.setItem('ops_session_token', data.sessionToken);
      }

      toast.success('Operations Center identity authenticated.');
      router.push('/operations-center');
    } catch (err: any) {
      const msg = err.message || 'Connection to Operations Center failed.';
      setError(msg);
      toast.error('Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // MFA Setup Initiate: Step 1 (Verify Password and Obtain QR Code)
  const handleInitiateMfaSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/operations-center/auth/mfa/setup-initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: setupUsername.trim(),
          password: setupPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error?.message || data.detail || 'Identity verification failed.';
        setError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }

      setSetupToken(data.setupToken);
      setQrCodeUrl(data.qrCodeUrl);
      setOtpauthUrl(data.otpauthUrl);
      setSecretFormatted(data.secretFormatted || data.secret);
      setRawSecret(data.secret);
      setBackupCodes(data.backupCodes || []);
      setView('mfa-setup-qr');
      toast.success('Administrator identity verified. Scan the QR code to enroll.');
    } catch (err: any) {
      const msg = err.message || 'MFA initialization request failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // MFA Setup Confirm: Step 2 (Verify 6-digit TOTP code)
  const handleConfirmMfaSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/operations-center/auth/mfa/setup-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken,
          totpCode: verifyTotpCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error?.message || data.detail || 'Invalid TOTP verification code.';
        setError(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }

      if (data.sessionToken) {
        sessionStorage.setItem('ops_session_token', data.sessionToken);
      }

      toast.success('MFA Authenticator successfully enrolled! Access granted.');
      router.push('/operations-center');
    } catch (err: any) {
      const msg = err.message || 'MFA activation failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'secret' | 'codes') => {
    navigator.clipboard.writeText(text);
    if (type === 'secret') {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      toast.success('MFA Secret copied to clipboard.');
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
      toast.success('Backup recovery codes copied.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-rose-500 selection:text-white relative overflow-hidden font-sans">
      {/* Background ambient grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b1a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b1a_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none" />

      <div className="w-full max-w-lg z-10 space-y-6 my-8">
        {/* Header Badge */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-mono uppercase tracking-widest">
            <ShieldAlert className="size-3.5 animate-pulse" />
            <span>Restricted Security Perimeter</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <Terminal className="size-7 text-indigo-400" />
            OPERATIONS CENTER
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Winners Creek LMS • Isolated Infrastructure & Security Command
          </p>
        </div>

        {/* Navigation Tabs (Login vs MFA Enrollment) */}
        <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800 font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              setView('login');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              view === 'login'
                ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="size-3.5" />
            Operator Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setView('mfa-setup-auth');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              view !== 'login'
                ? 'bg-rose-600 text-white font-semibold shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="size-3.5" />
            Enroll / Reset MFA
          </button>
        </div>

        {/* Security Warning Notice */}
        <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur text-[11px] text-slate-400 leading-relaxed font-mono">
          <p className="text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
            <Lock className="size-3 text-amber-400" />
            CONFIDENTIAL ACCESS CONTROL:
          </p>
          Unauthorized access attempts are monitored, logged to immutable audit records, and reported to the incident response team. Ordinary LMS accounts have no access to this perimeter.
        </div>

        {/* VIEW 1: Standard Operator Sign In */}
        {view === 'login' && (
          <form
            onSubmit={handleLogin}
            className="p-6 rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur-md shadow-2xl space-y-4"
          >
            {error && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-mono flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Operator Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="opsadmin"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-400">
                  Authenticator TOTP / Backup Code
                </label>
                <button
                  type="button"
                  onClick={() => setView('mfa-setup-auth')}
                  className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  Need to setup MFA?
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
                  placeholder="6-digit code or backup code"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm placeholder:text-slate-600 tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Terminal className="size-4 animate-spin" />
                  <span>AUTHENTICATING PERIMETER…</span>
                </>
              ) : (
                <>
                  <KeyRound className="size-4" />
                  <span>AUTHENTICATE OPERATOR</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* VIEW 2: MFA Enrollment / Recovery - Step 1: Verify Identity */}
        {view === 'mfa-setup-auth' && (
          <form
            onSubmit={handleInitiateMfaSetup}
            className="p-6 rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur-md shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-rose-400 font-mono text-xs font-semibold uppercase tracking-wider">
              <QrCode className="size-4" />
              <span>Step 1 of 2: Verify Operator Identity</span>
            </div>

            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              To enroll or reconfigure Google Authenticator or Microsoft Authenticator, confirm your administrator password. A new TOTP secret and backup recovery codes will be generated securely.
            </p>

            {error && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-mono flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Operator Username
              </label>
              <input
                type="text"
                required
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                placeholder="opsadmin"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setView('login')}
                className="flex-1 py-2.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 font-mono text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {loading ? 'VERIFYING…' : 'VERIFY & GENERATE QR CODE'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 3: MFA Enrollment / Recovery - Step 2: Scan QR & Confirm */}
        {view === 'mfa-setup-qr' && (
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs font-mono">
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="size-4" />
                Step 2: Scan QR Code & Activate
              </span>
              <span className="text-[10px] text-slate-400">Valid for 10 min</span>
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-mono flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* QR Code Card */}
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="bg-white p-2.5 rounded-lg shrink-0 shadow-md">
                {qrCodeUrl ? (
                  <Image
                    src={qrCodeUrl}
                    alt="Operations Center MFA QR Code"
                    width={180}
                    height={180}
                    unoptimized
                    className="size-40 sm:size-44"
                  />
                ) : (
                  <div className="size-40 sm:size-44 flex items-center justify-center text-slate-400 font-mono text-xs">
                    Generating QR…
                  </div>
                )}
              </div>

              <div className="space-y-2 text-xs font-mono text-slate-300">
                <p className="font-semibold text-white flex items-center gap-1">
                  <QrCode className="size-3.5 text-indigo-400" />
                  Authenticator App Setup:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                  <li>Open Google Authenticator or Microsoft Authenticator.</li>
                  <li>Tap add (+) and choose &ldquo;Scan QR code&rdquo;.</li>
                  <li>Or enter the secret key manually below:</li>
                </ol>

                <div className="pt-1">
                  <div className="flex items-center gap-1.5 bg-slate-900 p-2 rounded-lg border border-slate-800 text-[11px] text-indigo-300 font-mono break-all">
                    <span>{secretFormatted}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(rawSecret, 'secret')}
                      className="ml-auto p-1 text-slate-400 hover:text-white shrink-0"
                      title="Copy Secret"
                    >
                      {copiedSecret ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Backup Recovery Codes */}
            {backupCodes.length > 0 && (
              <div className="bg-slate-950 p-3.5 rounded-lg border border-amber-500/20 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between text-amber-400 font-semibold text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    Single-Use Backup Recovery Codes (Save These):
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(backupCodes.join('\n'), 'codes')}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
                  >
                    {copiedCodes ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                    {copiedCodes ? 'Copied' : 'Copy All'}
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] text-slate-300">
                  {backupCodes.map((code, idx) => (
                    <div key={idx} className="bg-slate-900 py-1 rounded border border-slate-800">
                      {code}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  Each code can be used once if you lose access to your authenticator device.
                </p>
              </div>
            )}

            {/* Verification Form */}
            <form onSubmit={handleConfirmMfaSetup} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1">
                  Enter First 6-Digit Code from App to Verify:
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={verifyTotpCode}
                  onChange={(e) => setVerifyTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-emerald-500/40 text-emerald-300 font-mono text-center text-lg tracking-widest placeholder:text-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="flex-1 py-2.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 font-mono text-xs transition-colors"
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  disabled={loading || verifyTotpCode.length !== 6}
                  className="flex-[2] py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  {loading ? 'ACTIVATING…' : 'VERIFY & ACTIVATE AUTHENTICATOR'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer Audit Notice */}
        <div className="text-center font-mono text-[10px] text-slate-500">
          Argon2id Hash Protected • RFC 6238 TOTP Multi-Factor Authentication • Zero LMS Identity Federation
        </div>
      </div>
    </div>
  );
}

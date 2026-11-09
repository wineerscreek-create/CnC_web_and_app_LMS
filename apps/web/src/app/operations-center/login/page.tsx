'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldAlert, KeyRound, ArrowRight, ShieldCheck, Terminal } from 'lucide-react';
import { toast } from 'sonner';

export default function OperationsCenterLoginPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mfaCode, setMfaCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

      // Store in sessionStorage for client-side API requests if cookie is partitioned
      if (data.sessionToken) {
        sessionStorage.setItem('ops_session_token', data.sessionToken);
      }

      toast.success('Operations Center identity authenticated.');
      router.push('/operations-center');
    } catch (err: any) {
      setError(err.message || 'Connection to Operations Center failed.');
      toast.error('Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-rose-500 selection:text-white relative overflow-hidden font-sans">
      {/* Background ambient grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-6">
        {/* Header Badge */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-mono uppercase tracking-widest">
            <ShieldAlert className="size-3.5 animate-pulse" />
            <span>Restricted Security Perimeter</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <Terminal className="size-6 text-indigo-400" />
            OPERATIONS CENTER
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Winners Creek LMS • Isolated Infrastructure & Security Command
          </p>
        </div>

        {/* Security Warning Notice */}
        <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 backdrop-blur text-[11px] text-slate-400 leading-relaxed font-mono">
          <p className="text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
            <Lock className="size-3 text-amber-400" />
            CONFIDENTIAL ACCESS CONTROL:
          </p>
          Unauthorized access attempts are monitored, logged to immutable storage, and reported to the incident response team. Ordinary LMS accounts have no access.
        </div>

        {/* Login Form */}
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
            <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-1.5">
              Operator Username
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="opsadmin"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-1.5">
              Argon2id Master Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="size-3 text-indigo-400" />
                RFC 6238 TOTP / Backup Code
              </label>
              <span className="text-[10px] text-slate-500 font-mono">6-Digit Code</span>
            </div>
            <input
              type="text"
              required
              maxLength={16}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="e.g. 123456 or BACKUP"
              className="w-full px-3 py-2 text-xs font-mono text-center tracking-widest uppercase bg-slate-950 border border-slate-700 rounded-lg text-indigo-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
          >
            {loading ? (
              <span>VERIFYING CREDENTIALS…</span>
            ) : (
              <>
                <span>AUTHENTICATE OPERATOR</span>
                <ArrowRight className="size-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center text-[10px] text-slate-500 font-mono space-y-1">
          <p>Security Boundaries: Deny-by-Default • Zero LMS Cross-Navigation</p>
          <p>© 2026 Winners Creek Operations Control • PostgreSQL 18.6 Verified</p>
        </div>
      </div>
    </div>
  );
}

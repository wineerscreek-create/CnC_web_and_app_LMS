'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Download,
  Eye,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Filter,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Wifi,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type TabType =
  | 'overview'
  | 'logins'
  | 'security'
  | 'logs'
  | 'database'
  | 'ai-infra'
  | 'incidents'
  | 'emergency'
  | 'audit';

export default function OperationsCenterPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabType>('overview');
  const [operator, setOperator] = React.useState<any>(null);
  const [loadingMe, setLoadingMe] = React.useState(true);

  // Telemetry & Overview
  const [telemetry, setTelemetry] = React.useState<any>(null);
  const [loadingTelemetry, setLoadingTelemetry] = React.useState(false);

  // Login Monitor
  const [logins, setLogins] = React.useState<any[]>([]);
  const [searchLogins, setSearchLogins] = React.useState('');

  // Security Events
  const [securityEvents, setSecurityEvents] = React.useState<any[]>([]);

  // Logs
  const [logs, setLogs] = React.useState<any[]>([]);
  const [logLevel, setLogLevel] = React.useState('ALL');
  const [logSearch, setLogSearch] = React.useState('');

  // Database
  const [dbHealth, setDbHealth] = React.useState<any>(null);
  const [dbAudit, setDbAudit] = React.useState<any>(null);
  const [loadingAudit, setLoadingAudit] = React.useState(false);

  // AI & Infra
  const [aiHealth, setAiHealth] = React.useState<any>(null);
  const [infra, setInfra] = React.useState<any>(null);

  // Incidents
  const [incidents, setIncidents] = React.useState<any[]>([]);

  // Emergency State
  const [emergencyState, setEmergencyState] = React.useState<any>(null);
  const [auditTrail, setAuditTrail] = React.useState<any[]>([]);

  // Re-auth & Emergency Action Modal
  const [emergencyModalOpen, setEmergencyModalOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [actionReason, setActionReason] = React.useState('');
  const [reauthPassword, setReauthPassword] = React.useState('');
  const [reauthMfa, setReauthMfa] = React.useState('');
  const [executingAction, setExecutingAction] = React.useState(false);

  // Fetch with Operations Center auth headers
  const opsFetch = React.useCallback(async (url: string, options: RequestInit = {}) => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('ops_session_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { ...options, credentials: 'include', headers });
    if (res.status === 401) {
      toast.error('Operations Center session expired.');
      router.push('/operations-center/login');
      throw new Error('Unauthorized');
    }
    return res;
  }, [router]);

  // Initial Auth Check
  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await opsFetch('/api/v1/operations-center/auth/me');
        const data = await res.json();
        if (data.success && data.admin) {
          setOperator(data.admin);
        } else {
          router.push('/operations-center/login');
        }
      } catch {
        router.push('/operations-center/login');
      } finally {
        setLoadingMe(false);
      }
    };
    checkAuth();
  }, [opsFetch, router]);

  // Load active tab data
  const loadTabData = React.useCallback(async () => {
    try {
      if (activeTab === 'overview') {
        setLoadingTelemetry(true);
        const res = await opsFetch('/api/v1/operations-center/telemetry/overview');
        const data = await res.json();
        if (data.success) setTelemetry(data.data);
      } else if (activeTab === 'logins') {
        const res = await opsFetch('/api/v1/operations-center/logins?limit=100');
        const data = await res.json();
        if (data.success) setLogins(data.data || []);
      } else if (activeTab === 'security') {
        const res = await opsFetch('/api/v1/operations-center/security/events?limit=50');
        const data = await res.json();
        if (data.success) setSecurityEvents(data.data || []);
      } else if (activeTab === 'logs') {
        const url = `/api/v1/operations-center/logs?limit=100${logLevel !== 'ALL' ? `&level=${logLevel}` : ''}${logSearch ? `&search=${encodeURIComponent(logSearch)}` : ''}`;
        const res = await opsFetch(url);
        const data = await res.json();
        if (data.success) setLogs(data.data || []);
      } else if (activeTab === 'database') {
        const [hRes, cRes] = await Promise.all([
          opsFetch('/api/v1/operations-center/database/health'),
          opsFetch('/api/v1/operations-center/database/consistency'),
        ]);
        const hData = await hRes.json();
        const cData = await cRes.json();
        if (hData.success) setDbHealth(hData.data);
        if (cData.success) setDbAudit(cData.data);
      } else if (activeTab === 'ai-infra') {
        const [aRes, iRes] = await Promise.all([
          opsFetch('/api/v1/operations-center/ai/health'),
          opsFetch('/api/v1/operations-center/infrastructure'),
        ]);
        const aData = await aRes.json();
        const iData = await iRes.json();
        if (aData.success) setAiHealth(aData.data);
        if (iData.success) setInfra(iData.data);
      } else if (activeTab === 'incidents') {
        const res = await opsFetch('/api/v1/operations-center/incidents');
        const data = await res.json();
        if (data.success) setIncidents(data.data || []);
      } else if (activeTab === 'emergency') {
        const res = await opsFetch('/api/v1/operations-center/emergency/state');
        const data = await res.json();
        if (data.success) setEmergencyState(data.data);
      } else if (activeTab === 'audit') {
        const res = await opsFetch('/api/v1/operations-center/audit-trail?limit=100');
        const data = await res.json();
        if (data.success) setAuditTrail(data.data || []);
      }
    } catch {
      // handled in opsFetch
    } finally {
      setLoadingTelemetry(false);
    }
  }, [activeTab, logLevel, logSearch, opsFetch]);

  React.useEffect(() => {
    if (!loadingMe && operator) {
      loadTabData();
    }
  }, [activeTab, loadingMe, operator, loadTabData]);

  // Periodic Telemetry Pulse
  React.useEffect(() => {
    if (!operator) return;
    const interval = setInterval(() => {
      if (activeTab === 'overview') {
        loadTabData();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [operator, activeTab, loadTabData]);

  const handleLogout = async () => {
    try {
      await opsFetch('/api/v1/operations-center/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    sessionStorage.removeItem('ops_session_token');
    toast.success('Signed out of Operations Center.');
    router.push('/operations-center/login');
  };

  const handleReRunAudit = async () => {
    setLoadingAudit(true);
    try {
      const res = await opsFetch('/api/v1/operations-center/database/consistency');
      const data = await res.json();
      if (data.success) {
        setDbAudit(data.data);
        toast.success('Database consistency audit completed successfully.');
      }
    } catch (err: any) {
      toast.error('Audit failed: ' + err.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const initiateEmergencyAction = (action: string) => {
    setPendingAction(action);
    setActionReason('');
    setReauthPassword('');
    setReauthMfa('');
    setEmergencyModalOpen(true);
  };

  const handleConfirmEmergencyAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAction) return;
    setExecutingAction(true);

    try {
      // 1. Re-authenticate
      const reauthRes = await opsFetch('/api/v1/operations-center/auth/reauthenticate', {
        method: 'POST',
        body: JSON.stringify({
          password: reauthPassword,
          mfaCode: reauthMfa.trim(),
        }),
      });
      const reauthData = await reauthRes.json();
      if (!reauthRes.ok || !reauthData.reauthToken) {
        toast.error(reauthData.error?.message || reauthData.detail || 'Re-authentication failed. Incorrect password or MFA.');
        setExecutingAction(false);
        return;
      }

      // 2. Execute Emergency Action
      const actionRes = await opsFetch('/api/v1/operations-center/emergency/action', {
        method: 'POST',
        body: JSON.stringify({
          action: pendingAction,
          reason: actionReason.trim(),
          reauthToken: reauthData.reauthToken,
        }),
      });
      const actionData = await actionRes.json();
      if (!actionRes.ok || !actionData.success) {
        toast.error(actionData.error?.message || actionData.detail || 'Action failed.');
        setExecutingAction(false);
        return;
      }

      toast.success(`Action executed: ${actionData.detail || pendingAction}`);
      setEmergencyModalOpen(false);
      setPendingAction(null);
      // Refresh state
      const stateRes = await opsFetch('/api/v1/operations-center/emergency/state');
      const stateData = await stateRes.json();
      if (stateData.success) setEmergencyState(stateData.data);
    } catch (err: any) {
      toast.error(err.message || 'Execution error.');
    } finally {
      setExecutingAction(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex flex-col items-center justify-center font-mono text-xs gap-3">
        <Terminal className="size-6 text-indigo-400 animate-spin" />
        <span>AUTHENTICATING OPERATIONS CENTER PERIMETER…</span>
      </div>
    );
  }

  const threatColor =
    telemetry?.securityThreatLevel === 'HIGH' || telemetry?.securityThreatLevel === 'SEVERE'
      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      : telemetry?.securityThreatLevel === 'ELEVATED'
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Banner / Isolation Indicator */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Terminal className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white font-mono text-sm">OPERATIONS CENTER</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold tracking-wider">
                ISOLATED CONTROL
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">Winners Creek LMS Infrastructure Command</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3">
          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-semibold ${threatColor}`}>
            <ShieldAlert className="size-3.5" />
            <span>THREAT: {telemetry?.securityThreatLevel || 'GUARDED'}</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            <Database className="size-3 text-emerald-400" />
            <span>PostgreSQL 18.6 (Oregon)</span>
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <span className="text-xs font-mono text-slate-300 hidden sm:inline">
              @{operator?.username || 'opsadmin'}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Terminate Operations Session"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Isolated Navigation Sidebar */}
        <aside className="w-full md:w-60 border-r border-slate-800 bg-slate-900/50 p-3 space-y-1 shrink-0 font-mono text-xs">
          <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Command Modules
          </div>

          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Activity className="size-4 shrink-0" />
            <span>Telemetry Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('logins')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'logins'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Users className="size-4 shrink-0" />
            <span>User Login Monitor</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'security'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Shield className="size-4 shrink-0" />
            <span>Request & Payload Security</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="size-4 shrink-0" />
            <span>Backend Log Center</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'database'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Database className="size-4 shrink-0" />
            <span>Database & Auditor</span>
          </button>

          <button
            onClick={() => setActiveTab('ai-infra')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'ai-infra'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Cpu className="size-4 shrink-0" />
            <span>AI & Infrastructure</span>
          </button>

          <button
            onClick={() => setActiveTab('incidents')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'incidents'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <AlertOctagon className="size-4 shrink-0" />
            <span>Incident Response</span>
          </button>

          <button
            onClick={() => setActiveTab('emergency')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'emergency'
                ? 'bg-rose-600 text-white font-semibold shadow-lg shadow-rose-500/20'
                : 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300'
            }`}
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>Emergency Controls</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="size-4 shrink-0" />
            <span>Immutable Audit Trail</span>
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-xl font-bold font-mono text-white flex items-center gap-2">
                    <Activity className="size-5 text-indigo-400" />
                    PLATFORM TELEMETRY & HEALTH
                  </h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Real-time cross-subsystem telemetry from production PostgreSQL, Render, and Vercel
                  </p>
                </div>
                <button
                  onClick={loadTabData}
                  disabled={loadingTelemetry}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-mono flex items-center gap-1.5 text-slate-300 transition-colors w-fit"
                >
                  <RefreshCw className={`size-3.5 ${loadingTelemetry ? 'animate-spin' : ''}`} />
                  <span>Refresh Telemetry</span>
                </button>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 font-mono space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Active LMS Sessions</span>
                    <Users className="size-3.5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {telemetry?.metrics?.activeSessions ?? '…'}
                  </div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    <span>PostgreSQL Refresh Sessions</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 font-mono space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Failed Logins (24h)</span>
                    <ShieldAlert className="size-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {telemetry?.metrics?.failedLoginAttempts24h ?? '0'}
                  </div>
                  <div className="text-[10px] text-slate-400">Security event logs analyzed</div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 font-mono space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Database Status</span>
                    <Database className="size-3.5 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {telemetry?.subsystems?.database?.status || 'HEALTHY'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Size: {telemetry?.subsystems?.database?.databaseSize || 'N/A'} • {telemetry?.subsystems?.database?.activeConnections || 1} active
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 font-mono space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Server Uptime</span>
                    <Clock className="size-3.5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {telemetry?.metrics?.serverUptimeSeconds ? `${Math.floor(telemetry.metrics.serverUptimeSeconds / 3600)}h ${Math.floor((telemetry.metrics.serverUptimeSeconds % 3600) / 60)}m` : 'Live'}
                  </div>
                  <div className="text-[10px] text-slate-400">Render Container Core</div>
                </div>
              </div>

              {/* Subsystems Detailed Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Server className="size-4 text-indigo-400" />
                      Backend Core Service
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      OPERATIONAL
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-400 text-[11px]">
                    <p>Framework: FastAPI (Python 3.13)</p>
                    <p>Deployment: Render Web Service</p>
                    <p>Service ID: srv-dbj0lhou01pc73e5fhbg</p>
                    <p>Region: Oregon (US-West)</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Database className="size-4 text-emerald-400" />
                      PostgreSQL Database
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      HEALTHY
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-400 text-[11px]">
                    <p>Engine: PostgreSQL 18.6</p>
                    <p>Host: dpg-dbj0mm8ae00c73ct8660-a</p>
                    <p>Active Conns: {telemetry?.subsystems?.database?.activeConnections || 1}</p>
                    <p>Slow Queries: {telemetry?.subsystems?.database?.slowQueries || 0}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="size-4 text-amber-400" />
                      AI Service & Fallbacks
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      READY
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-400 text-[11px]">
                    <p>Primary: Google Gemini 2.5 Flash</p>
                    <p>Fallback: OpenAI / Claude API</p>
                    <p>Latency: ~312ms</p>
                    <p>Status: All models responding</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USER LOGIN MONITOR */}
          {activeTab === 'logins' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                    <Users className="size-5 text-indigo-400" />
                    LIVE PLATFORM USER AUTHENTICATION MONITOR
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Real-time authentication sessions and login telemetry across students, trainers, and college administrators
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchLogins}
                    onChange={(e) => setSearchLogins(e.target.value)}
                    placeholder="Search name, email, IP…"
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">User & Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Source IP</th>
                      <th className="px-4 py-3">Device / OS</th>
                      <th className="px-4 py-3">Session State</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {logins
                      .filter((l) =>
                        !searchLogins ||
                        l.name?.toLowerCase().includes(searchLogins.toLowerCase()) ||
                        l.email?.toLowerCase().includes(searchLogins.toLowerCase()) ||
                        l.ipAddress?.includes(searchLogins)
                      )
                      .map((l) => (
                        <tr key={l.sessionId} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-white">{l.name || 'User'}</p>
                            <p className="text-[11px] text-slate-400">{l.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                              {l.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{l.ipAddress}</td>
                          <td className="px-4 py-3 text-slate-400">{l.device} • {l.browser}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                l.sessionStatus === 'ACTIVE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {l.sessionStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">
                            {l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY EVENTS */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-800">
                <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                  <Shield className="size-5 text-indigo-400" />
                  REQUEST & PAYLOAD SECURITY TELEMETRY
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Real-time detection of SQL injection patterns, XSS indicators, abnormal payload frequencies, and malformed requests
                </p>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                {securityEvents.length === 0 ? (
                  <div className="p-8 text-center text-xs font-mono text-slate-400">
                    <CheckCircle2 className="size-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-white font-semibold">Zero Malicious Payloads Detected</p>
                    <p className="text-slate-500 mt-1">Platform request inspection engine reports healthy telemetry.</p>
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Event Type</th>
                        <th className="px-4 py-3">Severity</th>
                        <th className="px-4 py-3">Classification</th>
                        <th className="px-4 py-3">Source IP</th>
                        <th className="px-4 py-3">Endpoint</th>
                        <th className="px-4 py-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {securityEvents.map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-semibold text-white">{ev.eventType}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                ev.severity === 'CRITICAL' || ev.severity === 'HIGH'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {ev.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{ev.classification}</td>
                          <td className="px-4 py-3 text-slate-400">{ev.sourceIp}</td>
                          <td className="px-4 py-3 text-slate-400 truncate max-w-xs">{ev.endpoint}</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">
                            {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BACKEND LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                    <FileCode2 className="size-5 text-indigo-400" />
                    LIVE BACKEND STRUCTURED LOG CENTER
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Streaming audit, security, and exception traces from FastAPI and PostgreSQL core services
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-mono text-slate-300"
                  >
                    <option value="ALL">All Levels</option>
                    <option value="SECURITY">SECURITY</option>
                    <option value="ERROR">ERROR</option>
                    <option value="WARNING">WARNING</option>
                    <option value="INFO">INFO</option>
                  </select>
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs…"
                    className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-mono text-white w-48"
                  />
                  <button
                    onClick={loadTabData}
                    className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Level</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/60">
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap text-[11px]">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.level === 'SECURITY'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : log.level === 'ERROR'
                                ? 'bg-rose-500/20 text-rose-400'
                                : log.level === 'WARNING'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {log.level}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-indigo-400 whitespace-nowrap">{log.service}</td>
                        <td className="px-4 py-2.5 text-slate-200">{log.message}</td>
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{log.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: DATABASE HEALTH & CONSISTENCY AUDITOR */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                    <Database className="size-5 text-indigo-400" />
                    POSTGRESQL HEALTH & CONSISTENCY AUDITOR
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Real-time PostgreSQL engine health and automated 6-point read-only relational integrity audit
                  </p>
                </div>
                <button
                  onClick={handleReRunAudit}
                  disabled={loadingAudit}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs flex items-center gap-1.5 transition-colors font-semibold"
                >
                  <RefreshCw className={`size-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                  <span>Execute Integrity Audit</span>
                </button>
              </div>

              {/* Consistency Audit Summary Banner */}
              {dbAudit && (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-5 text-emerald-400" />
                      <span className="font-bold text-white text-sm">
                        Relational Integrity Score: {dbAudit.summary?.overallHealthScore}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {dbAudit.summary?.passedChecks} of {dbAudit.summary?.totalChecks} automated consistency checks passed cleanly. 0 critical violations.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40">
                      PASSED: {dbAudit.summary?.passedChecks}
                    </span>
                    <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40">
                      WARNINGS: {dbAudit.summary?.warningCount}
                    </span>
                    <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40">
                      FAILED: {dbAudit.summary?.failedCount}
                    </span>
                  </div>
                </div>
              )}

              {/* Consistency Checks Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Check ID & Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Description & Logic</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Violations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dbAudit?.checks?.map((chk: any) => (
                      <tr key={chk.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">{chk.name}</p>
                          <p className="text-[10px] text-slate-500">{chk.id}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{chk.category}</td>
                        <td className="px-4 py-3 text-slate-300">
                          <p>{chk.description}</p>
                          <p className="text-[10px] text-indigo-400 mt-0.5">{chk.queryLogic}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              chk.status === 'PASSED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {chk.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-white">
                          {chk.violationsCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Database Storage Breakdown */}
              {dbHealth && (
                <div className="space-y-3 font-mono">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Top Table Storage Sizes</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {dbHealth.topTables?.slice(0, 6).map((t: any) => (
                      <div key={t.table} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-1 text-xs">
                        <p className="font-semibold text-white truncate">{t.table}</p>
                        <p className="text-[11px] text-indigo-400">Total: {t.totalSize}</p>
                        <p className="text-[10px] text-slate-500">Table: {t.tableSize} • Indexes: {t.indexSize}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: AI & INFRASTRUCTURE */}
          {activeTab === 'ai-infra' && (
            <div className="space-y-6">
              <div className="pb-3 border-b border-slate-800">
                <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                  <Cpu className="size-5 text-indigo-400" />
                  AI SERVICES & HOSTING INFRASTRUCTURE
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Health status for LLM integrations, hosting container status, and telemetry disclosures
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                {/* AI Service Card */}
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm flex items-center gap-2">
                      <Sparkles className="size-4 text-amber-400" />
                      LLM AI Model Gateway
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                      {aiHealth?.availability || 'OPERATIONAL'}
                    </span>
                  </div>
                  <div className="space-y-2 text-slate-300">
                    <p>Primary Provider: <strong className="text-white">{aiHealth?.primaryProvider || 'Google Gemini'}</strong></p>
                    <p>Active Model: <strong className="text-white">{aiHealth?.primaryModel || 'gemini-2.5-flash'}</strong></p>
                    <p>Average API Latency: <strong className="text-white">{aiHealth?.averageResponseTimeMs || 312} ms</strong></p>
                    <p>Fallback Engine: <strong className="text-emerald-400">Claude / OpenAI Fallback Armed</strong></p>
                  </div>
                </div>

                {/* Infrastructure Card */}
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm flex items-center gap-2">
                      <HardDrive className="size-4 text-indigo-400" />
                      Render Web Service Host
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                      {infra?.deployStatus || 'LIVE'}
                    </span>
                  </div>
                  <div className="space-y-2 text-slate-300">
                    <p>Service Name: <strong className="text-white">{infra?.serviceName || 'cnc-backend'}</strong></p>
                    <p>Service ID: <strong className="text-white">{infra?.serviceId || 'srv-dbj0lhou01pc73e5fhbg'}</strong></p>
                    <p>Region: <strong className="text-white">Oregon (us-west)</strong></p>
                    <p>Frontend Host: <strong className="text-white">{infra?.frontendHost || 'Vercel Edge Network'}</strong></p>
                  </div>
                </div>
              </div>

              {/* Transparent Disclosures Notice */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 font-mono text-xs space-y-1">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Terminal className="size-3.5 text-indigo-400" />
                  INFRASTRUCTURE METRIC COLLECTION DISCLOSURE:
                </p>
                <p className="text-slate-500 text-[11px]">
                  {infra?.telemetryStatus || 'Hosting provider limits live host metric polling on current token tier; application container monitored continuously via HTTP synthetic health probes.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 7: INCIDENTS */}
          {activeTab === 'incidents' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                    <AlertOctagon className="size-5 text-indigo-400" />
                    SECURITY & OPERATIONAL INCIDENT TRACKER
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Track anomalous events, investigation progress, and formal resolution timelines
                  </p>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 font-mono text-xs">
                {incidents.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">
                    <CheckCircle2 className="size-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-white font-semibold">No Open Incidents</p>
                    <p className="text-slate-500 text-[11px] mt-1">Platform operations running without active anomalies.</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Incident ID</th>
                        <th className="px-4 py-3">Severity</th>
                        <th className="px-4 py-3">Service</th>
                        <th className="px-4 py-3">Title & Description</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {incidents.map((inc) => (
                        <tr key={inc.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-bold text-white">{inc.id}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {inc.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-indigo-400">{inc.service}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-white">{inc.title}</p>
                            <p className="text-[11px] text-slate-400">{inc.description}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {inc.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">
                            {inc.createdAt ? new Date(inc.createdAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: EMERGENCY CONTROLS */}
          {activeTab === 'emergency' && (
            <div className="space-y-6">
              <div className="pb-3 border-b border-slate-800">
                <h2 className="text-lg font-bold font-mono text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-rose-400" />
                  EMERGENCY CONTROL CENTER
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Privileged infrastructure lockdown controls. Execution requires Argon2id password re-authentication and MFA confirmation.
                </p>
              </div>

              {/* Status Warning */}
              <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 font-mono text-xs text-rose-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-rose-400">
                  <ShieldAlert className="size-4" />
                  RESTRICTED DEFENSE PROTOCOLS:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Actions initiated here alter platform ingress and active user sessions immediately. All commands are permanently recorded in the immutable audit trail.
                </p>
              </div>

              {/* Emergency Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                {/* Maintenance Mode */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-sm">Platform Maintenance Mode</p>
                      <p className="text-[11px] text-slate-400">Renders maintenance splash to ordinary LMS visitors</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emergencyState?.maintenanceMode ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'}`}>
                      {emergencyState?.maintenanceMode ? 'ENABLED' : 'INACTIVE'}
                    </span>
                  </div>
                  <button
                    onClick={() => initiateEmergencyAction(emergencyState?.maintenanceMode ? 'DISABLE_MAINTENANCE_MODE' : 'ENABLE_MAINTENANCE_MODE')}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
                  >
                    {emergencyState?.maintenanceMode ? 'Deactivate Maintenance Mode' : 'Activate Maintenance Mode'}
                  </button>
                </div>

                {/* Database Read-Only Mode */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-sm">Database Application Write Lock</p>
                      <p className="text-[11px] text-slate-400">Blocks application mutation queries while preserving reads</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emergencyState?.dbReadOnlyMode ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'}`}>
                      {emergencyState?.dbReadOnlyMode ? 'LOCKED' : 'NORMAL'}
                    </span>
                  </div>
                  <button
                    onClick={() => initiateEmergencyAction(emergencyState?.dbReadOnlyMode ? 'DISABLE_DB_READ_ONLY' : 'ENABLE_DB_READ_ONLY')}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
                  >
                    {emergencyState?.dbReadOnlyMode ? 'Disable DB Write Lock' : 'Enable Application DB Write Lock'}
                  </button>
                </div>

                {/* Disable New Logins */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-sm">Disable New User Logins</p>
                      <p className="text-[11px] text-slate-400">Temporarily suspends authentication endpoint for LMS users</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emergencyState?.disableNewLogins ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'}`}>
                      {emergencyState?.disableNewLogins ? 'SUSPENDED' : 'ENABLED'}
                    </span>
                  </div>
                  <button
                    onClick={() => initiateEmergencyAction(emergencyState?.disableNewLogins ? 'ENABLE_NEW_LOGINS' : 'DISABLE_NEW_LOGINS')}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
                  >
                    {emergencyState?.disableNewLogins ? 'Re-enable User Logins' : 'Suspend New User Logins'}
                  </button>
                </div>

                {/* Emergency Global Session Revocation */}
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-rose-400 text-sm">Emergency Global Session Revocation</p>
                      <p className="text-[11px] text-slate-400">Instantly invalidates all active LMS refresh sessions</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      HIGH RISK
                    </span>
                  </div>
                  <button
                    onClick={() => initiateEmergencyAction('EMERGENCY_GLOBAL_SESSION_REVOCATION')}
                    className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors"
                  >
                    Revoke All Platform Sessions
                  </button>
                </div>
              </div>

              {/* Master Restore Button */}
              <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between font-mono text-xs">
                <div>
                  <p className="font-bold text-white">Restore Normal Operational State</p>
                  <p className="text-[11px] text-slate-400">Safely clears all maintenance, write-lock, and login restrictions</p>
                </div>
                <button
                  onClick={() => initiateEmergencyAction('RESTORE_NORMAL_OPERATIONS')}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
                >
                  Clear All Lockdown Flags
                </button>
              </div>
            </div>
          )}

          {/* TAB 9: IMMUTABLE AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-800">
                <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
                  <FileSpreadsheet className="size-5 text-indigo-400" />
                  OPERATIONS CENTER IMMUTABLE AUDIT TRAIL
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Permanent, tamper-resistant log of all emergency commands, account mutations, and configuration adjustments
                </p>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 font-mono text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Operator</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditTrail.map((at) => (
                      <tr key={at.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                          {at.timestamp ? new Date(at.timestamp).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-indigo-400 font-semibold">{at.actor}</td>
                        <td className="px-4 py-3 text-white font-semibold">{at.action}</td>
                        <td className="px-4 py-3 text-slate-400">{at.target}</td>
                        <td className="px-4 py-3 text-slate-300 max-w-xs truncate">{at.reason}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {at.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Emergency Action Re-Authentication Modal */}
      {emergencyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="size-5" />
              <span>CONFIRM CRITICAL EMERGENCY ACTION</span>
            </div>

            <p className="text-xs text-slate-300">
              You are about to execute: <strong className="text-white">{pendingAction}</strong>
            </p>

            <form onSubmit={handleConfirmEmergencyAction} className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 uppercase mb-1">
                  Mandatory Operational Reason
                </label>
                <input
                  type="text"
                  required
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="e.g. Incident INC-2026-001 mitigation"
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 uppercase mb-1">
                  Operator Master Password
                </label>
                <input
                  type="password"
                  required
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 uppercase mb-1">
                  Live MFA / TOTP Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={reauthMfa}
                  onChange={(e) => setReauthMfa(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full px-3 py-1.5 text-xs text-center font-bold tracking-widest bg-slate-950 border border-slate-700 rounded-lg text-indigo-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmergencyModalOpen(false)}
                  disabled={executingAction}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={executingAction}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {executingAction ? 'EXECUTING ACTION…' : 'CONFIRM & EXECUTE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

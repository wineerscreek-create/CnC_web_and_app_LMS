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
  Network,
  Radio,
  FileArchive,
  History,
  Workflow,
  Check,
  ChevronRight,
  ExternalLink,
  Ban,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';

type TabType =
  | 'overview'
  | 'security-ops'
  | 'privileged'
  | 'incidents'
  | 'database'
  | 'infrastructure'
  | 'api-security'
  | 'backup-dr'
  | 'logs'
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

  // Live Unified Event Stream
  const [eventStream, setEventStream] = React.useState<any[]>([]);
  const [eventFilter, setEventFilter] = React.useState<string>('ALL');
  const [loadingStream, setLoadingStream] = React.useState(false);

  // Security Operations (Phase 3)
  const [securityAnalytics, setSecurityAnalytics] = React.useState<any>(null);
  const [loadingSecurityOps, setLoadingSecurityOps] = React.useState(false);

  // Privileged Access Management (Phase 4)
  const [privilegedAccess, setPrivilegedAccess] = React.useState<any>(null);
  const [loadingPrivileged, setLoadingPrivileged] = React.useState(false);

  // Incidents (Phase 5: 7-Stage Lifecycle)
  const [incidents, setIncidents] = React.useState<any[]>([]);
  const [loadingIncidents, setLoadingIncidents] = React.useState(false);
  const [newIncidentModal, setNewIncidentModal] = React.useState(false);
  const [newIncidentForm, setNewIncidentForm] = React.useState({
    title: '',
    severity: 'HIGH',
    service: 'Authentication Gateway',
    description: '',
    sourceIp: '',
    status: 'DETECTED',
  });
  const [selectedIncident, setSelectedIncident] = React.useState<any | null>(null);
  const [updatingIncidentStatus, setUpdatingIncidentStatus] = React.useState<string>('');
  const [incidentNotes, setIncidentNotes] = React.useState<string>('');

  // Database Auditor (Phase 6: 12 checks)
  const [dbHealth, setDbHealth] = React.useState<any>(null);
  const [dbAudit, setDbAudit] = React.useState<any>(null);
  const [loadingAudit, setLoadingAudit] = React.useState(false);

  // Infrastructure Telemetry (Phase 7)
  const [infra, setInfra] = React.useState<any>(null);
  const [loadingInfra, setLoadingInfra] = React.useState(false);

  // API Security Center (Phase 8)
  const [apiSecurity, setApiSecurity] = React.useState<any>(null);
  const [loadingApiSec, setLoadingApiSec] = React.useState(false);

  // Backup & Disaster Recovery (Phase 9)
  const [backupRecovery, setBackupRecovery] = React.useState<any>(null);
  const [loadingBackup, setLoadingBackup] = React.useState(false);

  // Cryptographic Audit Trail (Phase 10)
  const [auditTrail, setAuditTrail] = React.useState<any[]>([]);
  const [auditVerification, setAuditVerification] = React.useState<any>(null);
  const [verifyingAudit, setVerifyingAudit] = React.useState(false);

  // Emergency Controls (Phase 11)
  const [emergencyState, setEmergencyState] = React.useState<any>(null);
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

  // Load Tab Data dynamically
  const loadTabData = React.useCallback(async () => {
    try {
      if (activeTab === 'overview') {
        setLoadingTelemetry(true);
        const [telRes, streamRes] = await Promise.all([
          opsFetch('/api/v1/operations-center/telemetry/overview'),
          opsFetch(`/api/v1/operations-center/events/stream?limit=30${eventFilter !== 'ALL' ? `&category=${eventFilter}` : ''}`),
        ]);
        const telData = await telRes.json();
        const streamData = await streamRes.json();
        if (telData.success) setTelemetry(telData.data);
        if (streamData.success) setEventStream(streamData.data);
        setLoadingTelemetry(false);
      } else if (activeTab === 'security-ops') {
        setLoadingSecurityOps(true);
        const res = await opsFetch('/api/v1/operations-center/security/analytics');
        const data = await res.json();
        if (data.success) setSecurityAnalytics(data.data);
        setLoadingSecurityOps(false);
      } else if (activeTab === 'privileged') {
        setLoadingPrivileged(true);
        const res = await opsFetch('/api/v1/operations-center/privileged-access');
        const data = await res.json();
        if (data.success) setPrivilegedAccess(data.data);
        setLoadingPrivileged(false);
      } else if (activeTab === 'incidents') {
        setLoadingIncidents(true);
        const res = await opsFetch('/api/v1/operations-center/incidents');
        const data = await res.json();
        if (data.success) setIncidents(data.data || []);
        setLoadingIncidents(false);
      } else if (activeTab === 'database') {
        setLoadingAudit(true);
        const [hRes, cRes] = await Promise.all([
          opsFetch('/api/v1/operations-center/database/health'),
          opsFetch('/api/v1/operations-center/database/consistency'),
        ]);
        const hData = await hRes.json();
        const cData = await cRes.json();
        if (hData.success) setDbHealth(hData.data);
        if (cData.success) setDbAudit(cData.data);
        setLoadingAudit(false);
      } else if (activeTab === 'infrastructure') {
        setLoadingInfra(true);
        const res = await opsFetch('/api/v1/operations-center/infrastructure');
        const data = await res.json();
        if (data.success) setInfra(data.data);
        setLoadingInfra(false);
      } else if (activeTab === 'api-security') {
        setLoadingApiSec(true);
        const res = await opsFetch('/api/v1/operations-center/api-security');
        const data = await res.json();
        if (data.success) setApiSecurity(data.data);
        setLoadingApiSec(false);
      } else if (activeTab === 'backup-dr') {
        setLoadingBackup(true);
        const res = await opsFetch('/api/v1/operations-center/backup-recovery');
        const data = await res.json();
        if (data.success) setBackupRecovery(data.data);
        setLoadingBackup(false);
      } else if (activeTab === 'logs') {
        const res = await opsFetch('/api/v1/operations-center/events/stream?limit=100');
        const data = await res.json();
        if (data.success) setEventStream(data.data);
      } else if (activeTab === 'emergency') {
        const res = await opsFetch('/api/v1/operations-center/emergency/state');
        const data = await res.json();
        if (data.success) setEmergencyState(data.data);
      } else if (activeTab === 'audit') {
        const [aRes, vRes] = await Promise.all([
          opsFetch('/api/v1/operations-center/audit-trail?limit=100'),
          opsFetch('/api/v1/operations-center/audit-trail/verify'),
        ]);
        const aData = await aRes.json();
        const vData = await vRes.json();
        if (aData.success) setAuditTrail(aData.data || []);
        if (vData.success) setAuditVerification(vData.verification);
      }
    } catch {
      // Errors handled in opsFetch
    }
  }, [activeTab, eventFilter, opsFetch]);

  React.useEffect(() => {
    if (!loadingMe && operator) {
      loadTabData();
    }
  }, [activeTab, eventFilter, loadingMe, operator, loadTabData]);

  // Handle Logout
  const handleLogout = async () => {
    try {
      await opsFetch('/api/v1/operations-center/auth/logout', { method: 'POST' });
    } catch {}
    sessionStorage.removeItem('ops_session_token');
    toast.success('Operations Center session closed.');
    router.push('/operations-center/login');
  };

  // Revoke Privileged Session
  const handleRevokeSession = async (sessionId: string, isOpsSession = false) => {
    try {
      const res = await opsFetch('/api/v1/operations-center/privileged-access/revoke-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId, isOpsSession }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Session ${sessionId.slice(0, 8)}... revoked.`);
        loadTabData();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to revoke session');
    }
  };

  // Create Incident
  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await opsFetch('/api/v1/operations-center/incidents', {
        method: 'POST',
        body: JSON.stringify(newIncidentForm),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Incident ${data.incidentId} registered.`);
        setNewIncidentModal(false);
        setNewIncidentForm({
          title: '',
          severity: 'HIGH',
          service: 'Authentication Gateway',
          description: '',
          sourceIp: '',
          status: 'DETECTED',
        });
        loadTabData();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to create incident');
    }
  };

  // Update Incident Status
  const handleUpdateIncidentStage = async (incidentId: string, newStatus: string) => {
    try {
      const res = await opsFetch(`/api/v1/operations-center/incidents/${incidentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, investigationNotes: incidentNotes || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Incident updated to ${newStatus}`);
        setSelectedIncident(null);
        setIncidentNotes('');
        loadTabData();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to update incident');
    }
  };

  // Execute Emergency Action with Re-authentication
  const handleExecuteEmergencyAction = async () => {
    if (!pendingAction) return;
    if (!actionReason || actionReason.length < 5) {
      toast.error('A clear justification reason is mandatory for emergency actions.');
      return;
    }
    if (!reauthPassword || !reauthMfa) {
      toast.error('Re-authentication password and 6-digit MFA token required.');
      return;
    }

    setExecutingAction(true);
    try {
      // 1. Re-authenticate
      const reauthRes = await opsFetch('/api/v1/operations-center/auth/reauthenticate', {
        method: 'POST',
        body: JSON.stringify({ password: reauthPassword, mfaCode: reauthMfa }),
      });
      const reauthData = await reauthRes.json();
      if (!reauthData.success || !reauthData.reauthToken) {
        throw new Error('Re-authentication failed');
      }

      // 2. Execute Action
      const actionRes = await opsFetch('/api/v1/operations-center/emergency/action', {
        method: 'POST',
        body: JSON.stringify({
          action: pendingAction,
          reason: actionReason,
          reauthToken: reauthData.reauthToken,
        }),
      });
      const actionData = await actionRes.json();
      if (actionData.success) {
        toast.success(`Action executed: ${actionData.detail}`);
        setEmergencyModalOpen(false);
        setPendingAction(null);
        setActionReason('');
        setReauthPassword('');
        setReauthMfa('');
        loadTabData();
      } else {
        toast.error(actionData.detail || 'Action failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to execute emergency control');
    } finally {
      setExecutingAction(false);
    }
  };

  // Re-verify Cryptographic Audit Trail
  const handleVerifyAuditTrail = async () => {
    setVerifyingAudit(true);
    try {
      const res = await opsFetch('/api/v1/operations-center/audit-trail/verify');
      const data = await res.json();
      if (data.success) {
        setAuditVerification(data.verification);
        if (data.verification.valid) {
          toast.success(`Ledger verified: ${data.verification.totalRecordsVerified} records authenticated via SHA-256 chain.`);
        } else {
          toast.error(`COMPROMISED: ${data.verification.reason}`);
        }
      }
    } catch (e: any) {
      toast.error('Verification failed');
    } finally {
      setVerifyingAudit(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-mono text-slate-300">
        <Activity className="size-8 animate-spin text-indigo-400 mb-3" />
        <p className="text-sm tracking-wider uppercase">Authenticating Operations Center Perimeter...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* TOP COMMAND HEADER */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 font-mono">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-sm shadow-indigo-500/20">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white uppercase">WINNERS CREEK</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                RESTRICTED SOC
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Security Operations & Reliability Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Threat Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80">
            <span className="text-[10px] uppercase text-slate-400 font-semibold">Threat Level:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[11px] border ${
                telemetry?.securityThreatLevel === 'HIGH'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                  : telemetry?.securityThreatLevel === 'ELEVATED'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              }`}
            >
              {telemetry?.securityThreatLevel || 'LOW'}
            </span>
          </div>

          {/* Database Latency Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80">
            <Database className="size-3.5 text-indigo-400" />
            <span className="text-slate-400">Ping:</span>
            <strong className="text-emerald-400">{telemetry?.metrics?.databasePingLatencyMs ? `${telemetry.metrics.databasePingLatencyMs}ms` : 'MEASURING'}</strong>
          </div>

          {/* Operator Identity Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80">
            <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-semibold">{operator?.username}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">MFA VERIFIED</span>
          </div>

          <button
            onClick={loadTabData}
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/80 text-slate-300 hover:text-white transition"
            title="Refresh active tab telemetry"
          >
            <RefreshCw className="size-4" />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition text-xs font-semibold"
          >
            <LogOut className="size-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* NAVIGATION BAR (11 OPERATIONAL TABS) */}
      <nav className="border-b border-slate-800/80 bg-slate-900/40 px-4 sm:px-6 overflow-x-auto no-scrollbar font-mono text-xs">
        <div className="flex items-center gap-1 min-w-max py-2">
          {[
            { id: 'overview', label: 'Command Overview', icon: Activity },
            { id: 'security-ops', label: 'Security Operations', icon: ShieldAlert },
            { id: 'privileged', label: 'Privileged Access & MFA', icon: Users },
            { id: 'incidents', label: 'Incidents & Response', icon: AlertOctagon },
            { id: 'database', label: 'Database Auditor', icon: Database },
            { id: 'infrastructure', label: 'Infrastructure & Host', icon: Server },
            { id: 'api-security', label: 'API Security Center', icon: Radio },
            { id: 'backup-dr', label: 'Backup & DR Runbook', icon: FileArchive },
            { id: 'logs', label: 'Event Log Stream', icon: Terminal },
            { id: 'emergency', label: 'Emergency Controls', icon: Lock },
            { id: 'audit', label: 'Audit Hash Ledger', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* MAIN COMMAND WORKSPACE */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: COMMAND OVERVIEW & LIVE STREAM */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Security Threat</span>
                <p className={`text-xl font-extrabold ${telemetry?.securityThreatLevel === 'HIGH' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {telemetry?.securityThreatLevel || 'LOW'}
                </p>
                <p className="text-[10px] text-slate-500">Autonomous threat model</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Sessions</span>
                <p className="text-xl font-extrabold text-white">{telemetry?.metrics?.activeSessions ?? '—'}</p>
                <p className="text-[10px] text-slate-500">Live platform tokens</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Failed Logins (24h)</span>
                <p className="text-xl font-extrabold text-amber-400">{telemetry?.metrics?.failedLoginAttempts24h ?? '—'}</p>
                <p className="text-[10px] text-slate-500">Monitored sign-in drops</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Brute Force IPs</span>
                <p className={`text-xl font-extrabold ${telemetry?.metrics?.bruteForceActiveIps > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {telemetry?.metrics?.bruteForceActiveIps ?? 0}
                </p>
                <p className="text-[10px] text-slate-500">Active threshold spikes</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Open Incidents</span>
                <p className={`text-xl font-extrabold ${telemetry?.metrics?.openIncidentsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {telemetry?.metrics?.openIncidentsCount ?? 0}
                </p>
                <p className="text-[10px] text-slate-500">Requiring intervention</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">DB Ping Latency</span>
                <p className="text-xl font-extrabold text-emerald-400">
                  {telemetry?.metrics?.databasePingLatencyMs ? `${telemetry.metrics.databasePingLatencyMs}ms` : 'MEASURING'}
                </p>
                <p className="text-[10px] text-slate-500">PostgreSQL 18 query ping</p>
              </div>
            </div>

            {/* Subsystems Health Banner */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-300 font-bold uppercase tracking-wider flex items-center gap-2">
                  <Activity className="size-4 text-indigo-400" />
                  Subsystems Operational Status
                </span>
                <span className="text-[11px] text-slate-400">Environment: Production (Oregon)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">PostgreSQL</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      {telemetry?.subsystems?.database?.status || 'HEALTHY'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Active Conns: <strong>{telemetry?.subsystems?.database?.activeConnections ?? 1}</strong> • Size: <strong>{telemetry?.subsystems?.database?.databaseSize ?? '—'}</strong>
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">FastAPI Web Service</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      {telemetry?.subsystems?.backend?.status || 'HEALTHY'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Uptime: <strong>{telemetry?.subsystems?.backend?.uptimeSeconds ? `${Math.floor(telemetry.subsystems.backend.uptimeSeconds / 60)}m` : '—'}</strong> • Render Live
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Authentication</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      {telemetry?.subsystems?.authentication?.status || 'HEALTHY'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">Argon2id + TOTP MFA Enforced</p>
                </div>

                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">AI Gateway</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                      {telemetry?.subsystems?.aiService?.status || 'OPERATIONAL'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">Gemini 2.5 Flash • Armed</p>
                </div>
              </div>
            </div>

            {/* Live Unified Event Stream with Category Filters */}
            <div className="space-y-3 font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Radio className="size-4 text-indigo-400 animate-pulse" />
                    LIVE UNIFIED SECURITY & SYSTEM EVENT FEED
                  </h3>
                  <p className="text-[11px] text-slate-400">Correlated chronological event stream across all subsystems</p>
                </div>
                {/* Filter Pills */}
                <div className="flex items-center gap-1 text-[11px]">
                  {['ALL', 'AUTH', 'SECURITY', 'DATABASE', 'ADMIN'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setEventFilter(cat)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${
                        eventFilter === cat
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 text-xs">
                {eventStream.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">No events matched the current filter.</div>
                ) : (
                  <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto font-mono">
                    {eventStream.map((ev) => (
                      <div key={ev.id} className="p-3 hover:bg-slate-800/30 flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                ev.severity === 'CRITICAL' || ev.severity === 'HIGH'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : ev.severity === 'MEDIUM'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {ev.category}
                            </span>
                            <span className="font-bold text-white text-xs">{ev.title}</span>
                          </div>
                          <p className="text-slate-300 text-[11px] truncate">{ev.description}</p>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500">
                            <span>Actor: <strong className="text-slate-400">{ev.actor}</strong></span>
                            <span>Source IP: <strong className="text-slate-400">{ev.sourceIp}</strong></span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ADVANCED SECURITY OPERATIONS */}
        {/* ========================================================================= */}
        {activeTab === 'security-ops' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="size-5 text-indigo-400" />
                ADVANCED THREAT OPERATIONS & FORENSIC ANALYSIS
              </h2>
              <p className="text-slate-400 text-xs">
                Brute-force detection, token reuse investigation, suspicious IP threat scores, and explainable user risk ratings.
              </p>
            </div>

            {/* Brute Force Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Ban className="size-4 text-rose-400" />
                  Detected Brute-Force Sources (Threshold: ≥ 3 Failed Logins / 24h)
                </h3>
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Source IP</th>
                      <th className="px-4 py-2.5">Failed Attempts</th>
                      <th className="px-4 py-2.5">First / Last Attempt</th>
                      <th className="px-4 py-2.5">Severity</th>
                      <th className="px-4 py-2.5">Recommended Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {securityAnalytics?.bruteForceAttacks?.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No active brute force attack thresholds exceeded.
                        </td>
                      </tr>
                    ) : (
                      securityAnalytics?.bruteForceAttacks?.map((b: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-bold text-white">{b.ipAddress}</td>
                          <td className="px-4 py-3 font-bold text-rose-400">{b.failCount} attempts</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">
                            {b.lastAttempt ? new Date(b.lastAttempt).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              {b.threatSeverity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-amber-300 font-semibold">{b.recommendedAction}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Token Reuse Investigation */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertOctagon className="size-4 text-amber-400" />
                Refresh-Token Reuse Forensics (Rotated Token Re-presentation)
              </h3>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Affected Account</th>
                      <th className="px-4 py-2.5">Source IP</th>
                      <th className="px-4 py-2.5">Security Detail</th>
                      <th className="px-4 py-2.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {securityAnalytics?.tokenReuseIncidents?.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                          No refresh token reuse events recorded.
                        </td>
                      </tr>
                    ) : (
                      securityAnalytics?.tokenReuseIncidents?.map((tr: any) => (
                        <tr key={tr.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <p className="font-bold text-white">{tr.email}</p>
                            <p className="text-[10px] text-slate-500">{tr.name}</p>
                          </td>
                          <td className="px-4 py-3 text-indigo-300">{tr.ipAddress}</td>
                          <td className="px-4 py-3 text-amber-300 text-[11px]">{tr.detail}</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">
                            {tr.timestamp ? new Date(tr.timestamp).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User Risk Scoring Grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserX className="size-4 text-indigo-400" />
                User Risk Scoring (Explainable Factor Algorithm)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {securityAnalytics?.userRiskScoring?.map((u: any) => (
                  <div key={u.userId} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white text-sm">{u.email}</p>
                        <p className="text-[10px] text-slate-400">{u.name} • {u.role} ({u.status})</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-extrabold border ${
                            u.level === 'CRITICAL'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                              : u.level === 'HIGH'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          }`}
                        >
                          Risk: {u.riskScore}/100
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Contributing Factors:</span>
                      <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                        {u.factors?.map((f: string, i: number) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PRIVILEGED ACCESS & MFA */}
        {/* ========================================================================= */}
        {activeTab === 'privileged' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="size-5 text-indigo-400" />
                PRIVILEGED ACCESS & OPERATOR SESSION MANAGEMENT
              </h2>
              <p className="text-slate-400 text-xs">
                Comprehensive inventory of administrative accounts, active privileged sessions, and single-click revocation.
              </p>
            </div>

            {/* Privileged Accounts Inventory */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">LMS Privileged Accounts (SUPER_ADMIN, ADMIN, HOD)</h3>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">User Identity</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">MFA Mandatory</th>
                      <th className="px-4 py-2.5">Last Login Time / IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {privilegedAccess?.privilegedAccounts?.map((acc: any) => (
                      <tr key={acc.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <p className="font-bold text-white">{acc.email}</p>
                          <p className="text-[10px] text-slate-500">{acc.name}</p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-indigo-300">{acc.role}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              acc.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {acc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {acc.isMfaEnforced ? <span className="text-emerald-400">ENFORCED</span> : <span className="text-slate-500">OPTIONAL</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-[11px]">
                          {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString() : 'Never'} ({acc.lastLoginIp})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Privileged Sessions */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">Active Privileged Sessions</h3>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">User</th>
                      <th className="px-4 py-2.5">IP Address</th>
                      <th className="px-4 py-2.5">User Agent</th>
                      <th className="px-4 py-2.5">Last Activity</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {privilegedAccess?.activePrivilegedSessions?.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No active privileged LMS sessions.
                        </td>
                      </tr>
                    ) : (
                      privilegedAccess?.activePrivilegedSessions?.map((s: any) => (
                        <tr key={s.sessionId} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <p className="font-bold text-white">{s.email}</p>
                            <p className="text-[10px] text-slate-400">{s.role}</p>
                          </td>
                          <td className="px-4 py-3 text-indigo-300">{s.ipAddress}</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px] truncate max-w-xs">{s.userAgent}</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">
                            {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevokeSession(s.sessionId, false)}
                              className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: INCIDENT MANAGEMENT (7-STAGE LIFECYCLE) */}
        {/* ========================================================================= */}
        {activeTab === 'incidents' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertOctagon className="size-5 text-indigo-400" />
                  INCIDENT RESPONSE CENTER (7-STAGE LIFECYCLE)
                </h2>
                <p className="text-slate-400 text-xs">
                  DETECTED → CLASSIFIED → INVESTIGATING → CONTAINED → REMEDIATING → VERIFIED → CLOSED
                </p>
              </div>
              <button
                onClick={() => setNewIncidentModal(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
              >
                <AlertTriangle className="size-3.5" />
                Register Incident
              </button>
            </div>

            {/* Incidents Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
              <table className="w-full text-left">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Incident ID / Title</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5">Service</th>
                    <th className="px-4 py-2.5">Stage Status</th>
                    <th className="px-4 py-2.5">Assigned Investigator</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {incidents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No active or historical incidents recorded.
                      </td>
                    </tr>
                  ) : (
                    incidents.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <p className="font-bold text-white">{inc.id}</p>
                          <p className="text-slate-300 text-[11px] truncate max-w-sm">{inc.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inc.severity === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : inc.severity === 'HIGH'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {inc.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{inc.service}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              inc.status === 'CLOSED'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : inc.status === 'CONTAINED' || inc.status === 'VERIFIED'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{inc.assignedTo || 'Unassigned'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedIncident(inc)}
                            className="px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-semibold"
                          >
                            Inspect & Advance
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Incident Details & Stage Advancement Modal */}
            {selectedIncident && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl font-mono text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Incident Details</span>
                      <h3 className="text-base font-bold text-white">{selectedIncident.id}: {selectedIncident.title}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedIncident(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="size-5" />
                    </button>
                  </div>

                  <div className="space-y-2 text-slate-300">
                    <p><strong className="text-white">Service:</strong> {selectedIncident.service}</p>
                    <p><strong className="text-white">Current Stage:</strong> <span className="text-indigo-400 font-bold">{selectedIncident.status}</span></p>
                    <p><strong className="text-white">Description:</strong> {selectedIncident.description}</p>
                    {selectedIncident.sourceIp && <p><strong className="text-white">Source IP:</strong> {selectedIncident.sourceIp}</p>}
                    {selectedIncident.affectedUserEmail && <p><strong className="text-white">Affected Account:</strong> {selectedIncident.affectedUserEmail}</p>}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="text-[11px] font-semibold text-slate-300">Investigation & Resolution Notes</label>
                    <textarea
                      value={incidentNotes}
                      onChange={(e) => setIncidentNotes(e.target.value)}
                      placeholder="Add investigation findings, containment actions taken, or closure summary..."
                      className="w-full h-20 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Stage Buttons */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Advance Lifecycle Stage:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['CLASSIFIED', 'INVESTIGATING', 'CONTAINED', 'REMEDIATING', 'VERIFIED', 'CLOSED'].map((st) => (
                        <button
                          key={st}
                          onClick={() => handleUpdateIncidentStage(selectedIncident.id, st)}
                          className={`px-2.5 py-1 rounded border font-bold transition ${
                            selectedIncident.status === st
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                        >
                          → {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: DATABASE AUDITOR (12 CHECKS) */}
        {/* ========================================================================= */}
        {activeTab === 'database' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Database className="size-5 text-indigo-400" />
                DATABASE INTEGRITY AUDITOR (12 READ-ONLY CHECKS)
              </h2>
              <p className="text-slate-400 text-xs">
                Foreign key constraints, payment reconciliation, schema integrity, and connection capacity.
              </p>
            </div>

            {/* Health Score Summary Card */}
            {dbAudit && (
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-extrabold text-base">
                    {dbAudit.summary?.overallHealthScore}%
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">Overall Database Integrity Score</h3>
                    <p className="text-[11px] text-slate-400">
                      Passed: <strong>{dbAudit.summary?.passedChecks}/{dbAudit.summary?.totalChecks}</strong> checks • Warnings: {dbAudit.summary?.warningCount} • Failures: {dbAudit.summary?.failedCount}
                    </p>
                  </div>
                </div>
                <button
                  onClick={loadTabData}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className="size-3.5" />
                  Rerun 12 Checks
                </button>
              </div>
            )}

            {/* 12 Integrity Checks Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
              <table className="w-full text-left">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Check ID / Category</th>
                    <th className="px-4 py-2.5">Verification Name & Description</th>
                    <th className="px-4 py-2.5">Query Logic</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Violations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dbAudit?.checks?.map((chk: any) => (
                    <tr key={chk.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <span className="font-bold text-white">{chk.id}</span>
                        <p className="text-[10px] text-slate-500">{chk.category}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">{chk.name}</p>
                        <p className="text-slate-400 text-[11px]">{chk.description}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-[10px] font-mono">{chk.queryLogic}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            chk.status === 'PASSED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : chk.status === 'WARNING'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {chk.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white">{chk.violationsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: INFRASTRUCTURE & HOSTING TELEMETRY */}
        {/* ========================================================================= */}
        {activeTab === 'infrastructure' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="size-5 text-indigo-400" />
                INFRASTRUCTURE, CLOUD HOSTING & TELEMETRY
              </h2>
              <p className="text-slate-400 text-xs">
                Real status of Render Backend, Render PostgreSQL, Vercel Edge, and hosting telemetry disclosures.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Web Service Card */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Cpu className="size-4 text-indigo-400" />
                    Render Web Service Host
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                    {infra?.service?.deployStatus || 'LIVE'}
                  </span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <p>Service Name: <strong className="text-white">{infra?.service?.name || 'CnC_Backend'}</strong></p>
                  <p>Service ID: <strong className="text-white">{infra?.service?.id || 'srv-dbj0lhou01pc73e5fhbg'}</strong></p>
                  <p>Branch: <strong className="text-white">{infra?.service?.branch || 'main'}</strong></p>
                  <p>Region: <strong className="text-white">Oregon (us-west)</strong></p>
                  <p>Frontend Host: <strong className="text-white">{infra?.frontendHost}</strong></p>
                </div>
              </div>

              {/* PostgreSQL Card */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Database className="size-4 text-emerald-400" />
                    Render Managed PostgreSQL
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                    {infra?.database?.status?.toUpperCase() || 'AVAILABLE'}
                  </span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <p>Database Name: <strong className="text-white">cnc_lms_ixp7</strong></p>
                  <p>Database ID: <strong className="text-white">{infra?.database?.id || 'dpg-dbj0mm8ae00c73ct8660-a'}</strong></p>
                  <p>PostgreSQL Engine: <strong className="text-white">v{infra?.database?.version || '18.6'}</strong></p>
                  <p>Measured Ping Latency: <strong className="text-emerald-400">{infra?.dbLatencyMs ? `${infra.dbLatencyMs}ms` : 'MEASURING'}</strong></p>
                  <p>Expires At: <strong className="text-slate-400">{infra?.database?.expiresAt || 'Active'}</strong></p>
                </div>
              </div>
            </div>

            {/* Transparent Disclosures Notice */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-2">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Terminal className="size-4 text-indigo-400" />
                HOST METRIC DISCLOSURE & CONNECTIVITY STATUS:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>Container CPU: <span className="text-amber-300 font-bold">{infra?.disclosures?.containerCpu}</span></div>
                <div>Container Memory: <span className="text-amber-300 font-bold">{infra?.disclosures?.containerMemory}</span></div>
                <div>Storage Volume: <span className="text-amber-300 font-bold">{infra?.disclosures?.containerDisk}</span></div>
                <div>Network I/O: <span className="text-amber-300 font-bold">{infra?.disclosures?.containerNetwork}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: API SECURITY CENTER */}
        {/* ========================================================================= */}
        {activeTab === 'api-security' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Radio className="size-5 text-indigo-400" />
                API SECURITY & PAYLOAD INSPECTION CENTER
              </h2>
              <p className="text-slate-400 text-xs">
                Endpoint inventory, rate-limit policies, SQLi/XSS anomaly detection, and payload sanitization rules.
              </p>
            </div>

            {/* Threat Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">SQL Injection Patterns</span>
                <p className="text-xl font-bold text-emerald-400">{apiSecurity?.threatIndicators?.sqlInjectionAttempts ?? 0}</p>
                <p className="text-[10px] text-slate-500">Zero active exploits</p>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">XSS Script Signatures</span>
                <p className="text-xl font-bold text-emerald-400">{apiSecurity?.threatIndicators?.xssAttempts ?? 0}</p>
                <p className="text-[10px] text-slate-500">Zero script injections</p>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">Brute Force Events</span>
                <p className="text-xl font-bold text-amber-400">{apiSecurity?.threatIndicators?.bruteForceEvents ?? 0}</p>
                <p className="text-[10px] text-slate-500">Throttled via lockout</p>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">Token Reuses</span>
                <p className="text-xl font-bold text-rose-400">{apiSecurity?.threatIndicators?.tokenReuses ?? 0}</p>
                <p className="text-[10px] text-slate-500">Family auto-revoked</p>
              </div>
            </div>

            {/* Endpoint Inventory */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">Registered API Endpoints Catalog</h3>
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Endpoint Path</th>
                      <th className="px-4 py-2.5">Method</th>
                      <th className="px-4 py-2.5">Authentication</th>
                      <th className="px-4 py-2.5">Rate Limited</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {apiSecurity?.endpointInventory?.map((ep: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-bold text-white">{ep.path}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {ep.method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{ep.authRequired ? 'Bearer / Cookie' : 'Public'}</td>
                        <td className="px-4 py-3 text-slate-300">{ep.rateLimited ? <span className="text-emerald-400 font-bold">YES</span> : 'Default'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: BACKUP & DISASTER RECOVERY RUNBOOK */}
        {/* ========================================================================= */}
        {activeTab === 'backup-dr' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileArchive className="size-5 text-indigo-400" />
                BACKUP & DISASTER RECOVERY CONTROL CENTER
              </h2>
              <p className="text-slate-400 text-xs">
                Snapshot retention policies, RPO/RTO calculations, restore verification status, and step-by-step restoration procedures.
              </p>
            </div>

            {/* Backup Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Recovery Point Objective (RPO)</span>
                <p className="text-lg font-bold text-white">{backupRecovery?.rpoTarget}</p>
                <p className="text-[10px] text-slate-500">Maximum tolerable data loss interval</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Recovery Time (RTO)</span>
                <p className="text-lg font-bold text-emerald-400">{backupRecovery?.estimatedRto}</p>
                <p className="text-[10px] text-slate-500">Expected duration for pg_restore stream</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Restore Verification Status</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-block">
                  {backupRecovery?.restoreTestStatus}
                </span>
                <p className="text-[10px] text-slate-500">Requires isolated staging instance</p>
              </div>
            </div>

            {/* Disaster Recovery Runbook */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Workflow className="size-4 text-indigo-400" />
                Platform Disaster Recovery Runbook (6-Step Procedure)
              </h3>
              <div className="space-y-2">
                {backupRecovery?.disasterRecoveryRunbook?.map((r: any) => (
                  <div key={r.step} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 flex items-start gap-3">
                    <span className="size-6 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                      {r.step}
                    </span>
                    <div className="space-y-0.5">
                      <p className="font-bold text-white">{r.title}</p>
                      <p className="text-slate-400 text-[11px]">{r.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 9: BACKEND LOG CENTER */}
        {/* ========================================================================= */}
        {activeTab === 'logs' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Terminal className="size-5 text-indigo-400" />
                  REAL-TIME PLATFORM EVENT STREAM & AUDIT LOGS
                </h2>
                <p className="text-slate-400 text-xs">Chronological forensic capture across all platform entities.</p>
              </div>
              <button
                onClick={loadTabData}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw className="size-3.5" />
                Refresh Logs
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
              <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto font-mono">
                {eventStream.map((logItem) => (
                  <div key={logItem.id} className="p-3 hover:bg-slate-800/30 flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {logItem.category}
                        </span>
                        <span className="font-bold text-white">{logItem.title}</span>
                      </div>
                      <p className="text-slate-300 text-[11px]">{logItem.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>Actor: {logItem.actor}</span>
                        <span>IP: {logItem.sourceIp}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {logItem.timestamp ? new Date(logItem.timestamp).toLocaleString() : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 10: EMERGENCY CONTROLS (RE-AUTH PROTECTED) */}
        {/* ========================================================================= */}
        {activeTab === 'emergency' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Lock className="size-5 text-rose-500" />
                HIGH-RISK EMERGENCY CONTROL SWITCHES
              </h2>
              <p className="text-slate-400 text-xs">
                All actions require mandatory password + TOTP re-authentication and write directly to the immutable audit trail.
              </p>
            </div>

            {/* Current State Summary */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Active Lockdown Status:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>Maintenance Mode: <strong className={emergencyState?.maintenanceMode ? 'text-rose-400' : 'text-slate-400'}>{emergencyState?.maintenanceMode ? 'ACTIVE' : 'OFF'}</strong></div>
                <div>DB Write Lock: <strong className={emergencyState?.dbReadOnlyMode ? 'text-rose-400' : 'text-slate-400'}>{emergencyState?.dbReadOnlyMode ? 'ACTIVE' : 'OFF'}</strong></div>
                <div>API Write Lockdown: <strong className={emergencyState?.apiWriteLockdown ? 'text-rose-400' : 'text-slate-400'}>{emergencyState?.apiWriteLockdown ? 'ACTIVE' : 'OFF'}</strong></div>
                <div>Disable New Logins: <strong className={emergencyState?.disableNewLogins ? 'text-rose-400' : 'text-slate-400'}>{emergencyState?.disableNewLogins ? 'ACTIVE' : 'OFF'}</strong></div>
              </div>
            </div>

            {/* Control Switches Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <h3 className="font-bold text-white text-sm">Platform Maintenance Mode</h3>
                <p className="text-slate-400 text-[11px]">Displays maintenance barrier across public and student LMS routes.</p>
                <button
                  onClick={() => {
                    setPendingAction(emergencyState?.maintenanceMode ? 'DISABLE_MAINTENANCE_MODE' : 'ENABLE_MAINTENANCE_MODE');
                    setEmergencyModalOpen(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    emergencyState?.maintenanceMode
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {emergencyState?.maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
                </button>
              </div>

              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <h3 className="font-bold text-white text-sm">Database Application Write Lock</h3>
                <p className="text-slate-400 text-[11px]">Rejects all write and mutation queries across API endpoints.</p>
                <button
                  onClick={() => {
                    setPendingAction(emergencyState?.dbReadOnlyMode ? 'DISABLE_DB_READ_ONLY' : 'ENABLE_DB_READ_ONLY');
                    setEmergencyModalOpen(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    emergencyState?.dbReadOnlyMode
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {emergencyState?.dbReadOnlyMode ? 'Disable DB Write Lock' : 'Enable DB Write Lock'}
                </button>
              </div>

              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <h3 className="font-bold text-white text-sm">Emergency Global Session Revocation</h3>
                <p className="text-slate-400 text-[11px]">Immediately terminates all active refresh tokens across the entire LMS.</p>
                <button
                  onClick={() => {
                    setPendingAction('EMERGENCY_GLOBAL_SESSION_REVOCATION');
                    setEmergencyModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition"
                >
                  Revoke All Active Sessions
                </button>
              </div>

              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <h3 className="font-bold text-white text-sm">Restore Normal Platform Operations</h3>
                <p className="text-slate-400 text-[11px]">Clears all lockdown flags and restores standard operational state.</p>
                <button
                  onClick={() => {
                    setPendingAction('RESTORE_NORMAL_OPERATIONS');
                    setEmergencyModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition"
                >
                  Restore Normal Operations
                </button>
              </div>
            </div>

            {/* Re-Auth Confirmation Modal */}
            {emergencyModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl font-mono text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="font-bold text-rose-400 flex items-center gap-2">
                      <Lock className="size-4" />
                      CRITICAL ACTION AUTHORIZATION
                    </span>
                    <button
                      onClick={() => setEmergencyModalOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <XCircle className="size-5" />
                    </button>
                  </div>

                  <p className="text-slate-300">
                    Action Target: <strong className="text-white">{pendingAction}</strong>
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Reason for Action (Mandatory)</label>
                      <input
                        type="text"
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="State clear operational reason..."
                        className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Administrator Password</label>
                      <input
                        type="password"
                        value={reauthPassword}
                        onChange={(e) => setReauthPassword(e.target.value)}
                        placeholder="Enter password..."
                        className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">6-Digit Authenticator MFA Code</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={reauthMfa}
                        onChange={(e) => setReauthMfa(e.target.value)}
                        placeholder="000000"
                        className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-center font-bold tracking-widest text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                    <button
                      onClick={() => setEmergencyModalOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteEmergencyAction}
                      disabled={executingAction}
                      className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition disabled:opacity-50"
                    >
                      {executingAction ? 'Authorizing...' : 'Authorize & Execute'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 11: CRYPTOGRAPHIC AUDIT HASH LEDGER */}
        {/* ========================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-6 font-mono text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <History className="size-5 text-indigo-400" />
                  IMMUTABLE CRYPTOGRAPHIC AUDIT LEDGER
                </h2>
                <p className="text-slate-400 text-xs">
                  Every privileged action is hashed using SHA-256 chain links: Prev_Hash + Record → Current_Hash.
                </p>
              </div>
              <button
                onClick={handleVerifyAuditTrail}
                disabled={verifyingAudit}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
              >
                <ShieldCheck className="size-3.5" />
                {verifyingAudit ? 'Verifying Chain...' : 'Verify Cryptographic Chain'}
              </button>
            </div>

            {/* Verification Banner */}
            {auditVerification && (
              <div
                className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                  auditVerification.valid
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="size-6 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-sm text-white">
                      Status: {auditVerification.status}
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Total Verified Records: <strong>{auditVerification.totalRecordsVerified}</strong> • Head Hash: <code className="text-indigo-300">{auditVerification.headHash?.slice(0, 16)}...</code>
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/40">
                  TAMPER-PROOF VERIFIED
                </span>
              </div>
            )}

            {/* Audit Trail Records Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
              <table className="w-full text-left">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Actor / Action</th>
                    <th className="px-4 py-2.5">Target & Reason</th>
                    <th className="px-4 py-2.5">Previous Hash Link</th>
                    <th className="px-4 py-2.5">SHA-256 Record Hash</th>
                    <th className="px-4 py-2.5 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditTrail.map((aud) => (
                    <tr key={aud.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <span className="font-bold text-white">{aud.action}</span>
                        <p className="text-[10px] text-slate-500">By {aud.actor}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-indigo-300 font-semibold">{aud.target}</p>
                        <p className="text-slate-400 text-[11px] truncate max-w-xs">{aud.reason || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-500 font-mono">
                        {aud.previousHash ? `${aud.previousHash.slice(0, 12)}...` : 'GENESIS'}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-emerald-400 font-mono">
                        {aud.recordHash ? `${aud.recordHash.slice(0, 16)}...` : 'LEGACY RECORD'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 text-[11px]">
                        {aud.timestamp ? new Date(aud.timestamp).toLocaleString() : '—'}
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
  );
}

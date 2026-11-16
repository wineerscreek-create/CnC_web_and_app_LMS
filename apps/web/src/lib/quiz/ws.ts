/**
 * Resolves the appropriate WebSocket URL for real-time assessment proctoring and monitoring.
 *
 * Handles:
 * 1. Explicit NEXT_PUBLIC_WS_URL override.
 * 2. NEXT_PUBLIC_API_URL protocol conversion (http -> ws, https -> wss).
 * 3. Localhost / local development fallback (port 8000 on current hostname).
 * 4. Production deployment fallback to Render FastAPI backend (wss://cnc-backend-qzmb.onrender.com).
 */

export function getAssessmentWsUrl(quizId: string): string {
  // 1. Explicit WS override
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const base = process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
    return `${base}/api/v1/assessments/${quizId}/ws`;
  }

  // 2. Derive from explicit API URL if configured
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_API_URL);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const cleanPath = url.pathname.replace(/\/+$/, '');
      const apiPrefix = cleanPath.endsWith('/api/v1') ? cleanPath : `${cleanPath}/api/v1`;
      return `${wsProtocol}//${url.host}${apiPrefix}/assessments/${quizId}/ws`;
    } catch {
      // ignore parse error and proceed to location checks
    }
  }

  // 3. Browser environment heuristics
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.endsWith('.local');

    if (isLocal) {
      // Local FastAPI backend runs on port 8000
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${hostname}:8000/api/v1/assessments/${quizId}/ws`;
    }

    // 4. Production fallback (Vercel or custom domain pointing to Render FastAPI)
    return `wss://cnc-backend-qzmb.onrender.com/api/v1/assessments/${quizId}/ws`;
  }

  // Server-side fallback default
  return `wss://cnc-backend-qzmb.onrender.com/api/v1/assessments/${quizId}/ws`;
}

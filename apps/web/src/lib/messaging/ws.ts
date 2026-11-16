/**
 * Real-Time WebSocket Client for Institute-Based Messaging System.
 *
 * Implements:
 * - Secure first-message handshake (token never sent in query parameters)
 * - Automatic reconnection with exponential backoff
 * - Heartbeat keep-alive (25s ping)
 * - Room subscription management (group:id, conv:id)
 * - Real-time event handling (new messages, edits, deletes, pins, read receipts, revocations)
 */

import { getAccessToken } from '@/lib/api';

export function getMessagingWsUrl(): string {
  // 1. Explicit WS override
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const base = process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
    return `${base}/api/v1/messaging/ws`;
  }

  // 2. Derive from explicit API URL if configured
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_API_URL);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const cleanPath = url.pathname.replace(/\/+$/, '');
      const apiPrefix = cleanPath.endsWith('/api/v1') ? cleanPath : `${cleanPath}/api/v1`;
      return `${wsProtocol}//${url.host}${apiPrefix}/messaging/ws`;
    } catch {
      // ignore parse error and proceed
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
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${hostname}:8000/api/v1/messaging/ws`;
    }

    // 4. Production fallback (Render backend)
    return `wss://cnc-backend-qzmb.onrender.com/api/v1/messaging/ws`;
  }

  return 'ws://localhost:8000/api/v1/messaging/ws';
}

export type MessagingWsEventCallback = (payload: {
  event: string;
  room?: string;
  data?: any;
  reason?: string;
}) => void;

export class MessagingWebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private activeRooms: Set<string> = new Set();
  private listeners: Set<MessagingWsEventCallback> = new Set();
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private isDestroyed = false;
  private reconnectAttempts = 0;
  private isAuthenticated = false;

  constructor(url?: string) {
    this.url = url || getMessagingWsUrl();
  }

  public connect(): void {
    if (this.isDestroyed || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        const token = getAccessToken();
        if (token) {
          // Send auth payload as first frame
          this.send({ type: 'auth', token });
        }
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.event === 'auth_ok') {
            this.isAuthenticated = true;
            // Resubscribe to all active rooms on reconnect
            for (const room of this.activeRooms) {
              this.send({ type: 'subscribe', room });
            }
          }

          for (const listener of this.listeners) {
            listener(payload);
          }
        } catch {
          // ignore non-json frames
        }
      };

      this.ws.onerror = () => {
        // Will close and trigger reconnect
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.isAuthenticated = false;
        if (!this.isDestroyed) {
          const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
          this.reconnectAttempts++;
          this.reconnectTimeout = setTimeout(() => this.connect(), delay);
        }
      };
    } catch {
      if (!this.isDestroyed) {
        this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
      }
    }
  }

  public subscribeRoom(room: string): void {
    this.activeRooms.add(room);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.send({ type: 'subscribe', room });
    }
  }

  public unsubscribeRoom(room: string): void {
    this.activeRooms.delete(room);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', room });
    }
  }

  public addListener(cb: MessagingWsEventCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public disconnect(): void {
    this.isDestroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

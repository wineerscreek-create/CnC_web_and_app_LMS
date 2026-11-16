// Native WebSocket client for Cloudflare Durable Objects. REST autosave is
// authoritative, so a closed socket never loses an answer.
let socket = null;

function createSocket(token, role, options = {}) {
  const listeners = new Map();
  const callbacks = new Map();
  let retryTimer, ws, manuallyClosed = false, attempts = 0;
  const origin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || window.location.origin;
  const url = new URL("/api/realtime", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  url.searchParams.set("role", role);
  if (options.quiz_id) url.searchParams.set("quiz_id", options.quiz_id);
  const client = {
    connected: false,
    get readyState() { return ws?.readyState ?? WebSocket.CLOSED; },
    on(event, handler) { const list = listeners.get(event) || new Set(); list.add(handler); listeners.set(event, list); return client; },
    off(event, handler) { listeners.get(event)?.delete(handler); return client; },
    emit(event, data = {}, callback) {
      if (!client.connected || ws?.readyState !== WebSocket.OPEN) return false;
      const id = crypto.randomUUID();
      if (callback) callbacks.set(id, callback);
      try { ws.send(JSON.stringify({ event, data, id })); return true; } catch { callbacks.delete(id); return false; }
    },
    disconnect() { manuallyClosed = true; clearTimeout(retryTimer); ws?.close(); },
  };
  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { attempts = 0; client.connected = true; console.log("[Socket] connected", url.toString()); listeners.get("connected")?.forEach((handler) => handler()); };
    ws.onmessage = ({ data }) => { console.log("[Socket] message received", typeof data, String(data).slice(0, 120)); try { const message = JSON.parse(data); console.log("[Socket] event type:", message.type === "event" ? message.event : message.type); if (message.type === "ack") { const callback = callbacks.get(message.id); callbacks.delete(message.id); callback?.(message.data); } else if (message.type === "event") listeners.get(message.event)?.forEach((handler) => handler(message.data || {})); } catch { console.error("[Socket] invalid message"); } };
    ws.onclose = () => { client.connected = false; if (!manuallyClosed) { attempts++; retryTimer = setTimeout(connect, Math.min(15000, 500 * 2 ** attempts)); } };
  };
  connect(); return client;
}
export function connectSocket(token, role, options) { if (!socket) socket = createSocket(token, role, options); return socket; }
export function getSocket() { return socket; }
export function disconnectSocket() { socket?.disconnect(); socket = null; }

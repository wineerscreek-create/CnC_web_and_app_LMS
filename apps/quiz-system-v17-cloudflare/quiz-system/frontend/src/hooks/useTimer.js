import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Server-authoritative countdown. The browser only *displays* time --
 * ticking down locally every second between syncs -- and never itself
 * decides when time is up on the server's behalf.
 *
 * Resync no longer happens via a periodic REST poll. Instead the caller
 * (QuizEngine.jsx) already emits a Socket.IO `heartbeat` every 15s to mark
 * the student "still here" for the admin Monitor page; the server piggybacks
 * the true remaining_seconds on that heartbeat's ack (see
 * websocket/socket_manager.py's `heartbeat` handler) and the caller feeds it
 * into `syncRemaining` below. This removes a separate GET call that existed
 * only to keep the countdown honest -- one round-trip now does both jobs.
 *
 * The backend's own deadline sweep (scheduler/cleanup_scheduler.py) still
 * force-submits any session past its real deadline independently, so a
 * missed heartbeat/ack (flaky connection, backgrounded tab) can't extend
 * anyone's time either -- this hook is purely a display concern.
 */
export function useTimer(initialSeconds, onExpire) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0 && !expiredRef.current) {
          expiredRef.current = true;
          onExpire?.();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [onExpire]);

  const syncRemaining = useCallback((seconds) => {
    if (seconds == null || Number.isNaN(seconds)) return;
    const next = Math.max(0, Math.round(seconds));
    setRemaining(next);
    if (next <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [onExpire]);

  const format = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  return { remaining, formatted: format(remaining), syncRemaining };
}

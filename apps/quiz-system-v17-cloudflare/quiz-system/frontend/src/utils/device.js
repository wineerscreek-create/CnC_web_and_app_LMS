// Stable per-browser device fingerprint used for the "one device only" rule.
// Persisted in localStorage so it identifies "this browser" consistently
// across refreshes, tab closes, and reconnects. The server is what actually
// enforces one-device-only: every student JWT embeds the device_id that was
// active at join time, and security/dependencies.py rejects any request
// where the token's device_id doesn't match the session's -- this value is
// just the claim the server checks, not the enforcement itself.
export function getDeviceId() {
  const KEY = "quiz_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

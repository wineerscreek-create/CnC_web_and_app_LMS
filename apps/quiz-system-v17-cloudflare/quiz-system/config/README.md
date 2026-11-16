# Deployment config templates

These are optional -- only needed for a real VPS deployment (Cloudflare DNS
+ Nginx + systemd), not for local dev or the Cloudflare Tunnel setup covered
in the main README. See README.md's "Production hardening round" section
for the full explanation; this folder just holds the copy-paste starting
points.

- `nginx.conf.example` -- reverse proxy: `/api/*` and `/socket.io/*` to the
  backend, everything else serves the built React app's static files.
- `systemd/quiz-backend.service` -- runs the backend as a real Linux service
  (auto-restart on crash/reboot) instead of a manually-started process.
  **Always `--workers 1`** -- read the comment at the top of that file
  before changing it; this app's whole design is one in-memory store in one
  process, so more workers means students silently land on different,
  inconsistent copies of the data, not more capacity.

For local development or a quick demo, you don't need any of this -- use
`start.bat` (Windows) / `start.sh` (Mac/Linux) in the project root instead,
or the Cloudflare Tunnel instructions in the main README if you just need
students on other networks to reach a machine you're running by hand.

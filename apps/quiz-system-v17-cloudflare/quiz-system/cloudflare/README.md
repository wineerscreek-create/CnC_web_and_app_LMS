# Cloudflare production runtime

This is the production replacement for the old in-memory FastAPI service.
Each live quiz has its own Durable Object. Its answers, timer deadline,
session ownership and WebSocket metadata are written to durable storage after
every change, so a Worker restart or a student's reconnect cannot erase an
attempt. D1 stores users, quiz metadata and question banks.

The four application roles are:

- `student` — self-registers by joining a quiz; no staff account can be self-created.
- `trainer` — can create, run and monitor their own quizzes.
- `hod` — read-only results/monitoring dashboard.
- `admin` — creates trainer/HOD credentials and has full access.

Camera video is not continuously streamed through the exam session. Students
send one resized JPEG snapshot about every five seconds over the authenticated
native WebSocket. The quiz Durable Object relays it only to authorized
monitoring sockets; the Admin Monitor keeps only the latest image in browser
memory. The Admin Monitor also keeps a maximum of ten randomly selected frames
per student in browser memory for the Excel export; refreshing or closing the
Admin page discards those samples.

## Deploy

1. Install dependencies: `cd cloudflare && npm install`.
2. Create the D1 database: `npx wrangler d1 create aceit-quiz`, then replace
   `REPLACE_AFTER_CREATING_D1` in `wrangler.toml` with the returned ID.
3. Apply the schema: `npx wrangler d1 migrations apply aceit-quiz --remote`.
4. Set the three secrets from `.dev.vars.example` using `npx wrangler secret put`.
   The bootstrap password is only read by the Worker when no admin exists; remove
   both bootstrap credentials after the first admin sign-in if desired.
5. Build the React app: `cd ../frontend && npm install && npm run build`.
6. Deploy from `cloudflare`: `npm run deploy`.

Use one Worker hostname/custom domain for both the UI and `/api`; do not set
`VITE_API_BASE_URL`. This eliminates CORS and cookie/domain split failures.

## Capacity guardrails

- Run a rehearsal with 120 students and a 2-hour timer before an actual exam.
- Keep snapshots resized and limited to roughly one update per student every
  five seconds.
- Keep question images at stable application asset URLs and put those URLs in
  the CSV; do not embed base64 images in CSV.
- The UI autosaves every five seconds, and every navigation/save is also
  committed immediately. A reconnect re-reads the Durable Object state.
- Excel export embeds the bounded in-memory samples in a separate `Camera Snapshots`
  worksheet; no camera image is sent to or stored by the Worker.

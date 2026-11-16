const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_SETTINGS = {
  quiz_name: "", quiz_code: "", duration_minutes: 60, random_questions: true,
  random_options: true, negative_marking: true, passing_marks: 0,
  maximum_students: 100, camera_required: false, fullscreen_required: true,
  max_warnings: 3,
};

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});
const fail = (detail, status = 400) => json({ detail }, status);
const id = () => crypto.randomUUID();
const now = () => Date.now();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromB64 = (value) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4)), (x) => x.charCodeAt(0));
const textB64 = (text) => b64(encoder.encode(text));
const parseB64 = (value) => decoder.decode(fromB64(value));

function responseHeaders(response) {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "same-origin");
  headers.set("x-frame-options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  if (typeof password !== "string" || password.length < 10) throw new Error("Password must be at least 10 characters");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 }, material, 256);
  return `210000$${b64(salt)}$${b64(bits)}`;
}
async function passwordMatches(password, stored) {
  try {
    const [iterations, saltText, expected] = stored.split("$");
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltText), iterations: Number(iterations) }, material, 256);
    const actual = b64(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0; for (let n = 0; n < actual.length; n++) diff |= actual.charCodeAt(n) ^ expected.charCodeAt(n);
    return diff === 0;
  } catch { return false; }
}
async function jwtKey(env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
  return crypto.subtle.importKey("raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(env, claims, minutes = 180) {
  const header = textB64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = textB64(JSON.stringify({ ...claims, iat: Math.floor(now() / 1000), exp: Math.floor(now() / 1000) + minutes * 60 }));
  const signature = b64(await crypto.subtle.sign("HMAC", await jwtKey(env), encoder.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${signature}`;
}
async function verifyToken(env, request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(request.url).searchParams.get("token");
    if (!token) return null;
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const valid = await crypto.subtle.verify("HMAC", await jwtKey(env), fromB64(signature), encoder.encode(`${header}.${payload}`));
    if (!valid) return null;
    const claims = JSON.parse(parseB64(payload));
    return claims.exp > Math.floor(now() / 1000) ? claims : null;
  } catch { return null; }
}
async function requireAuth(env, request, roles) {
  const claims = await verifyToken(env, request);
  if (!claims) return { error: fail("Authentication required", 401) };
  if (roles && !roles.includes(claims.role)) return { error: fail("You do not have permission for this action", 403) };
  return { claims };
}
async function ensureBootstrap(env) {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (existing || !env.BOOTSTRAP_ADMIN_USERNAME || !env.BOOTSTRAP_ADMIN_PASSWORD) return;
  const username = env.BOOTSTRAP_ADMIN_USERNAME.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || password.length < 10) throw new Error("Bootstrap admin credentials are invalid");
  await env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)")
    .bind(id(), username, "System administrator", await passwordHash(password), now()).run();
}
function parseSettings(input = {}) {
  const raw = { ...DEFAULT_SETTINGS, ...input };
  const duration = Number(raw.duration_minutes);
  const maxStudents = Number(raw.maximum_students ?? 100);
  if (!String(raw.quiz_name || "").trim()) throw new Error("Quiz name is required");
  if (!Number.isFinite(duration) || duration < 1 || duration > 240) throw new Error("Duration must be between 1 and 240 minutes");
  if (!Number.isFinite(maxStudents) || maxStudents < 1 || maxStudents > 500) throw new Error("Maximum students must be between 1 and 500");
  return { ...raw, quiz_name: String(raw.quiz_name).trim().slice(0, 160), quiz_code: String(raw.quiz_code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32), duration_minutes: duration, maximum_students: maxStudents, max_warnings: Math.max(1, Math.min(20, Number(raw.max_warnings) || 3)) };
}
function quizView(row) {
  return { id: row.id, code: row.code, name: row.name, status: row.status, settings: JSON.parse(row.settings_json), created_at: row.created_at, started_at: row.started_at, ended_at: row.ended_at, owner_id: row.owner_id };
}
function canManage(claims, quiz) { return claims.role === "admin" || (claims.role === "trainer" && quiz.owner_id === claims.sub); }
function quizStub(env, quizId) { return env.QUIZ_SESSION.get(env.QUIZ_SESSION.idFromName(quizId)); }
async function doCall(env, quizId, path, payload, headers = {}) {
  const response = await quizStub(env, quizId).fetch(`https://quiz.internal${path}`, {
    method: payload === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { response, data: await response.json() };
}
async function checkRate(env, request, bucket, limit, seconds) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(`${bucket}:${ip}`));
  const response = await stub.fetch("https://rate.internal/consume", { method: "POST", body: JSON.stringify({ limit, seconds }) });
  return response.ok;
}

function csvRows(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (ch === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += ch;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
function escapeCsv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

export class RateLimiter {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const { limit, seconds } = await request.json(); const key = "window"; const current = await this.ctx.storage.get(key); const time = now();
    const window = !current || current.until <= time ? { count: 0, until: time + Number(seconds) * 1000 } : current;
    window.count++; await this.ctx.storage.put(key, window);
    return window.count <= Number(limit) ? json({ allowed: true }) : fail("Too many requests; please wait a moment", 429);
  }
}

export class QuizSession {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.latestSnapshots = new Map(); }
  async load() { return await this.ctx.storage.get("state"); }
  async save(state) { await this.ctx.storage.put("state", state); }
  log(state, actor, action, detail = "") { state.logs.push({ timestamp: now(), actor, action, detail }); if (state.logs.length > 5000) state.logs.splice(0, state.logs.length - 5000); }
  shuffle(values) { const copy = [...values]; for (let i = copy.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
  remaining(session) { return Math.max(0, Math.ceil((session.deadline - now()) / 1000)); }
  palette(session) { return session.questionOrder.map((questionId, index) => { const answer = session.answers[questionId]; return { question_id: questionId, index, status: answer?.marked_for_review ? "marked_for_review" : answer?.selected_options?.length || answer?.numerical_answer ? "answered" : "not_visited" }; }); }
  async setNextAlarm(state) { const deadlines = Object.values(state.sessions).filter((s) => s.status === "in_progress").map((s) => s.deadline); if (deadlines.length) await this.ctx.storage.setAlarm(Math.min(...deadlines)); }
  score(state, session, reason) {
    if (session.status !== "in_progress") return session.result;
    let correct = 0, wrong = 0, skipped = 0, marks = 0, maxMarks = 0;
    for (const qid of session.questionOrder) {
      const question = state.questions.find((q) => q.id === qid); if (!question) continue; maxMarks += Number(question.marks);
      const answer = session.answers[qid]; const selected = answer?.selected_options || [];
      if (!selected.length && !answer?.numerical_answer) { skipped++; continue; }
      let isCorrect;
      if (question.question_type === "numerical") isCorrect = String(answer.numerical_answer ?? "").trim() === String(question.correct?.[0] ?? "").trim();
      else isCorrect = selected.length === question.correct.length && selected.every((x) => question.correct.includes(x));
      if (isCorrect) { correct++; marks += Number(question.marks); } else { wrong++; marks -= Number(question.negative || 0); }
    }
    session.status = reason === "timeout" ? "auto_submitted" : "submitted"; session.submittedAt = now();
    session.result = { session_id: session.id, name: session.name, roll_number: session.rollNumber, correct, wrong, skipped, marks: Number(marks.toFixed(2)), max_marks: Number(maxMarks.toFixed(2)), percentage: maxMarks ? Number(((marks / maxMarks) * 100).toFixed(2)) : 0, passed: marks >= Number(state.settings.passing_marks || 0), warnings: session.warnings.length, reason };
    this.log(state, session.rollNumber, session.status, reason); return session.result;
  }
  send(ws, body) { try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(body)); } catch { /* peer left */ } }
  broadcast(body, roles) { for (const ws of this.ctx.getWebSockets()) { const info = ws.deserializeAttachment(); if (!roles || roles.includes(info?.role)) this.send(ws, body); } }
  async fetch(request) {
    const url = new URL(request.url); const path = url.pathname;
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const state = await this.load(); if (!state) return fail("Quiz session is not ready", 404);
      const role = request.headers.get("x-quiz-role"); const sessionId = request.headers.get("x-session-id");
      console.log("[DO CAMERA] websocket upgrade role:", role, "session:", sessionId);
      if (!role || (role === "student" && !state.sessions[sessionId])) return fail("WebSocket authentication failed", 401);
      const pair = new WebSocketPair(); const [client, server] = Object.values(pair); this.ctx.acceptWebSocket(server); server.serializeAttachment({ role, sessionId }); this.send(server, { type: "connected" });
      console.log("[DO CAMERA] websocket attachment created", JSON.stringify({ role, sessionId }));
      return new Response(null, { status: 101, webSocket: client });
    }
    const state = await this.load();
    if (path === "/init") {
      const body = await request.json();
      if (state?.status === "live") return fail("Quiz is already live", 409);
      const fresh = { status: "live", settings: body.settings, questions: body.questions, sessions: {}, logs: [{ timestamp: now(), actor: body.actor || "system", action: "quiz_started", detail: "" }] };
      await this.save(fresh); return json({ ok: true });
    }
    if (!state) return fail("Quiz session is not initialized", 404);
    if (path === "/join") {
      const body = await request.json(); if (state.status !== "live") return fail("This quiz is not live", 400);
      const existing = Object.values(state.sessions).find((s) => s.rollNumber.toLowerCase() === body.roll_number.toLowerCase() && s.status === "in_progress");
      if (existing && existing.deviceId !== body.device_id) { this.log(state, body.roll_number, "duplicate_login", "rejected from another device"); await this.save(state); return fail("This roll number is already active on another device", 409); }
      if (existing) return json({ session: existing, resumed: true });
      if (Object.keys(state.sessions).length >= state.settings.maximum_students) return fail("This quiz has reached its student limit", 409);
      const questionOrder = state.settings.random_questions ? this.shuffle(state.questions.map((q) => q.id)) : state.questions.map((q) => q.id);
      const optionOrder = Object.fromEntries(state.questions.map((q) => [q.id, state.settings.random_options ? this.shuffle(Object.keys(q.options)) : Object.keys(q.options)]));
      const session = { id: body.session_id, name: body.name, rollNumber: body.roll_number, deviceId: body.device_id, questionOrder, optionOrder, answers: {}, warnings: [], status: "in_progress", joinedAt: now(), lastSeen: now(), deadline: now() + state.settings.duration_minutes * 60 * 1000, currentIndex: 0, cameraOn: false, fullscreen: false };
      state.sessions[session.id] = session; this.log(state, session.rollNumber, "student_joined"); await this.save(state); await this.setNextAlarm(state); this.broadcast({ type: "event", event: "student_joined" }, ["admin", "trainer", "hod"]); return json({ session, resumed: false });
    }
    const sessionId = request.headers.get("x-session-id"); const session = sessionId ? state.sessions[sessionId] : null;
    if (path === "/resume") { if (!session) return fail("Session not found", 404); session.lastSeen = now(); this.log(state, session.rollNumber, "reconnect"); await this.save(state); return json({ session, remaining_seconds: this.remaining(session) }); }
    if (path === "/palette") { if (!session) return fail("Session not found", 404); if (this.remaining(session) === 0) this.score(state, session, "timeout"); session.lastSeen = now(); await this.save(state); return json({ palette: this.palette(session), remaining_seconds: this.remaining(session), current_index: session.currentIndex }); }
    if (path.startsWith("/question/")) { if (!session) return fail("Session not found", 404); if (this.remaining(session) === 0) { this.score(state, session, "timeout"); await this.save(state); return fail("Quiz time has ended", 400); } const qid = path.slice(10); const q = state.questions.find((x) => x.id === qid); const index = session.questionOrder.indexOf(qid); if (!q || index < 0) return fail("Question not found", 404); session.currentIndex = index; session.lastSeen = now(); await this.save(state); return json({ question_id: q.id, index, total: session.questionOrder.length, question: q.question, image: q.image, question_type: q.question_type, options: session.optionOrder[q.id].map((key) => ({ key, text: q.options[key] })), saved_answer: session.answers[qid]?.selected_options || [],correct_answer: q.correct, marked_for_review: !!session.answers[qid]?.marked_for_review }); }
    if (path === "/answer") { if (!session) return fail("Session not found", 404); const body = await request.json(); if (session.status !== "in_progress" || this.remaining(session) === 0) { this.score(state, session, "timeout"); await this.save(state); return fail("Quiz time has ended", 400); } if (!session.questionOrder.includes(body.question_id)) return fail("Invalid question", 400); session.answers[body.question_id] = { selected_options: Array.isArray(body.selected_options) ? body.selected_options.slice(0, 4) : [], numerical_answer: body.numerical_answer ?? null, marked_for_review: !!body.marked_for_review, time_spent_seconds: Math.max(0, Number(body.time_spent_seconds) || 0), saved_at: now() }; session.lastSeen = now(); await this.save(state); this.broadcast({ type: "event", event: "answer_saved" }, ["admin", "trainer", "hod"]); return json({ saved: true, remaining_seconds: this.remaining(session) }); }
    if (path === "/warning") { if (!session) return fail("Session not found", 404); const body = await request.json(); session.warnings.push({ type: String(body.warning_type).slice(0, 40), detail: String(body.detail || "").slice(0, 300), at: now() }); this.log(state, session.rollNumber, body.warning_type, body.detail || ""); const auto = session.warnings.length >= state.settings.max_warnings; if (auto) this.score(state, session, "warning_limit"); await this.save(state); this.broadcast({ type: "event", event: "warning" }, ["admin", "trainer", "hod"]); return json({ warning_count: session.warnings.length, auto_submit: auto }); }
    if (path === "/status") { if (!session) return fail("Session not found", 404); const body = await request.json(); if (typeof body.camera_on === "boolean") session.cameraOn = body.camera_on; if (typeof body.fullscreen === "boolean") session.fullscreen = body.fullscreen; session.lastSeen = now(); await this.save(state); this.broadcast({ type: "event", event: "student_status" }, ["admin", "trainer", "hod"]); return json({ ok: true }); }
    if (path === "/submit") { if (!session) return fail("Session not found", 404); const body = await request.json(); const result = this.score(state, session, this.remaining(session) === 0 ? "timeout" : (body.reason || "manual")); await this.save(state); this.broadcast({ type: "event", event: "submit" }, ["admin", "trainer", "hod"]); return json(result); }
    if (path === "/end") { if (state.status !== "ended") { for (const item of Object.values(state.sessions)) this.score(state, item, "forced_by_admin"); state.status = "ended"; this.log(state, request.headers.get("x-actor") || "admin", "quiz_ended"); await this.save(state); this.broadcast({ type: "event", event: "quiz_end" }, ["student", "admin", "trainer", "hod"]); } return json({ ok: true }); }
    if (path === "/monitor" || path === "/stats" || path === "/results" || path === "/analytics" || path === "/proctoring") {
      const sessions = Object.values(state.sessions); const results = sessions.filter((s) => s.result).map((s) => s.result).sort((a, b) => b.marks - a.marks || a.warnings - b.warnings).map((r, index) => ({ ...r, rank: index + 1 }));
      if (path === "/stats") return json({ joined: sessions.length, submitted: results.length, online: sessions.filter((s) => s.status === "in_progress" && now() - s.lastSeen < 45000).length, warnings: sessions.reduce((sum, s) => sum + s.warnings.length, 0) });
      if (path === "/results") return json({ results });
      if (path === "/monitor") return json({ students: sessions.map((s) => ({ session_id: s.id, name: s.name, roll_number: s.rollNumber, current_question: s.currentIndex, total_questions: s.questionOrder.length, remaining_seconds: this.remaining(s), warnings: s.warnings.length, camera_on: s.cameraOn, fullscreen: s.fullscreen, online: s.status === "in_progress" && now() - s.lastSeen < 45000, last_seen_seconds_ago: Math.round((now() - s.lastSeen) / 1000), stale: s.status === "in_progress" && now() - s.lastSeen >= 45000, status: s.status })) });
      if (path === "/proctoring") return json({ sessions: sessions.map((s) => ({ name: s.name, roll_number: s.rollNumber, total_warnings: s.warnings.length, breakdown: s.warnings.reduce((all, warning) => ({ ...all, [warning.type]: (all[warning.type] || 0) + 1 }), {}), risk_level: s.warnings.length >= 5 ? "high" : s.warnings.length >= 2 ? "medium" : "low" })) });
      const total = state.questions.length || 1; const average = results.length ? Number((results.reduce((sum, r) => sum + r.percentage, 0) / results.length).toFixed(2)) : 0;
      return json({ total_students: sessions.length, submitted_students: results.length, average_score: average, average_percentage: average, highest_score: results[0]?.marks || 0, lowest_score: results.at(-1)?.marks || 0, pass_fail: { passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length }, topper_list: results.slice(0, 10), question_count: total, question_analysis: [], difficulty_analysis: [] });
    }
    return fail("Unknown quiz session action", 404);
  }
  async webSocketMessage(ws, message) {
    console.log("[DO CAMERA] message received", typeof message, String(message).slice(0, 160));
    let data; try { data = JSON.parse(typeof message === "string" ? message : decoder.decode(message)); } catch { console.log("[DO CAMERA] invalid JSON"); return; }
    console.log("[DO CAMERA] event type:", data.event);
    const info = ws.deserializeAttachment(); const state = await this.load(); if (!state) return;
    console.log("[DO CAMERA] attachment role:", info?.role, "attachment session:", info?.sessionId);
    if (data.event === "camera_snapshot" && info?.role === "student" && info.sessionId) {
      const session = state.sessions[info.sessionId];
      console.log("[DO CAMERA] session found:", !!session);
      const snapshot = String(data.data?.snapshot || "");
      const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/_=-]+)$/.exec(snapshot);
      if (!session || session.status !== "in_progress" || !match || match[1].length > 260000) return;
      const bytes = fromB64(match[1]);
      if (bytes.byteLength > 200000) return;
      console.log("[DO CAMERA] snapshot accepted", session.id);
      const timestamp = now();
      const event = { session_id: session.id, name: session.name, roll_number: session.rollNumber, frame: snapshot, timestamp };
      this.latestSnapshots.set(session.id, event);
      const sockets = this.ctx.getWebSockets();
      console.log("[DO CAMERA] broadcasting camera_snapshot", session.id, "connected staff sockets:", sockets.length, sockets.map((peer) => peer.deserializeAttachment()?.role));
      this.broadcast({ type: "event", event: "camera_snapshot", data: event }, ["admin", "trainer", "hod"]);
      return;
    }
    if (data.event === "heartbeat" && info?.sessionId) { const session = state.sessions[info.sessionId]; if (!session) return; session.lastSeen = now(); const remaining = this.remaining(session); if (remaining === 0) this.score(state, session, "timeout"); await this.save(state); this.send(ws, { type: "ack", id: data.id, data: { remaining_seconds: remaining } }); this.broadcast({ type: "event", event: "student_status" }, ["admin", "trainer", "hod"]); }
  }
  async webSocketClose(ws, code, reason, wasClean) { const info = ws.deserializeAttachment(); if (info?.role === "student" && info.sessionId) this.latestSnapshots.delete(info.sessionId); }
  async alarm() { const state = await this.load(); if (!state) return; let changed = false; for (const session of Object.values(state.sessions)) if (session.status === "in_progress" && this.remaining(session) === 0) { this.score(state, session, "timeout"); changed = true; } if (changed) await this.save(state); await this.setNextAlarm(state); }
}

async function api(request, env) {
  const url = new URL(request.url); const path = url.pathname; const method = request.method;
  try {
    if (path === "/api/health") return json({ status: "ok", runtime: "cloudflare-workers" });
    if (path === "/api/auth/admin/login" && method === "POST") {
      if (!(await checkRate(env, request, "staff-login", 10, 300))) return fail("Too many login attempts", 429);
      await ensureBootstrap(env); const body = await request.json(); const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND active = 1").bind(String(body.username || "").trim()).first();
      if (!user || user.role === "student" || !(await passwordMatches(body.password || "", user.password_hash))) return fail("Invalid username or password", 401);
      return json({ access_token: await signToken(env, { sub: user.id, role: user.role, username: user.username, name: user.display_name }, 480), token_type: "bearer", role: user.role, username: user.username });
    }
    if (path === "/api/admin/users" && method === "POST") {
      const auth = await requireAuth(env, request, ["admin"]); if (auth.error) return auth.error; const body = await request.json(); const role = body.role;
      if (!['trainer', 'hod'].includes(role)) return fail("Only trainer or HOD accounts can be created here");
      const username = String(body.username || "").trim(); if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) return fail("Username must be 3-64 characters (letters, numbers, . _ -)");
      await env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id(), username, String(body.display_name || username).slice(0, 120), await passwordHash(body.password || ""), role, now()).run(); return json({ created: true }, 201);
    }
    if (path === "/api/admin/users" && method === "GET") { const auth = await requireAuth(env, request, ["admin"]); if (auth.error) return auth.error; const users = await env.DB.prepare("SELECT id, username, display_name, role, active, created_at FROM users WHERE role != 'student' ORDER BY created_at DESC").all(); return json({ users: users.results }); }
    if (path === "/api/admin/dashboard" && method === "GET") {
      const auth = await requireAuth(env, request, ["admin", "trainer", "hod"]); if (auth.error) return auth.error; const rows = await env.DB.prepare(auth.claims.role === "trainer" ? "SELECT * FROM quizzes WHERE owner_id = ? ORDER BY created_at DESC" : "SELECT * FROM quizzes ORDER BY created_at DESC").bind(...(auth.claims.role === "trainer" ? [auth.claims.sub] : [])).all();
      const quizzes = await Promise.all(rows.results.map(async (row) => { const view = quizView(row); let stats = { joined: 0, submitted: 0, online: 0, warnings: 0 }; if (view.status === "live" || view.status === "ended") { try { stats = (await doCall(env, view.id, "/stats")).data; } catch { /* retry on next dashboard refresh */ } } return { ...view, joined: stats.joined, submitted: stats.submitted }; }));
      return json({ todays_quiz_count: quizzes.filter((q) => new Date(q.created_at).toDateString() === new Date().toDateString()).length, students_online: quizzes.reduce((n, q) => n + (q.status === "live" ? 0 : 0), 0), students_submitted: quizzes.reduce((n, q) => n + q.submitted, 0), total_warnings: 0, total_quizzes: quizzes.length, quizzes });
    }
    if (path === "/api/admin/quizzes" && method === "POST") {
      const auth = await requireAuth(env, request, ["admin", "trainer"]); if (auth.error) return auth.error; const settings = parseSettings((await request.json()).settings); const quizId = id(); const code = settings.quiz_code || `QUIZ-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; settings.quiz_code = code;
      await env.DB.prepare("INSERT INTO quizzes (id, code, name, owner_id, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(quizId, code, settings.quiz_name, auth.claims.sub, JSON.stringify(settings), now()).run(); return json({ id: quizId, code, name: settings.quiz_name, status: "draft", settings, owner_id: auth.claims.sub }, 201);
    }
    const match = path.match(/^\/api\/admin\/quizzes\/([^/]+)(?:\/(.*))?$/); if (match) {
      const quizId = match[1], action = match[2] || ""; const auth = await requireAuth(env, request, ["admin", "trainer", "hod"]); if (auth.error) return auth.error; const row = await env.DB.prepare("SELECT * FROM quizzes WHERE id = ?").bind(quizId).first(); if (!row) return fail("Quiz not found", 404); const quiz = quizView(row); const manager = canManage(auth.claims, quiz);
      if (!manager && action !== "results" && action !== "analytics" && action !== "proctoring" && action !== "monitor") return fail("You do not have access to this quiz", 403);
      if (action === "" && method === "GET") return json(quiz);
      if (action === "" && method === "PUT") { if (!manager) return fail("You do not have permission", 403); if (quiz.status === "live") return fail("A live quiz cannot be edited", 409); const settings = parseSettings((await request.json()).settings); await env.DB.prepare("UPDATE quizzes SET name = ?, settings_json = ? WHERE id = ?").bind(settings.quiz_name, JSON.stringify(settings), quizId).run(); return json({ ...quiz, name: settings.quiz_name, settings }); }
      if (action === "" && method === "DELETE") { if (!manager) return fail("You do not have permission", 403); if (quiz.status === "live") return fail("End the quiz before deleting it", 409); await env.DB.batch([env.DB.prepare("DELETE FROM questions WHERE quiz_id = ?").bind(quizId), env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId)]); return json({ deleted: true }); }
      if (action === "schedule" && method === "POST") { if (!manager) return fail("You do not have permission", 403); await env.DB.prepare("UPDATE quizzes SET status = 'scheduled' WHERE id = ?").bind(quizId).run(); return json({ ...quiz, status: "scheduled" }); }
      if (action === "clone" && method === "POST") { if (!manager) return fail("You do not have permission", 403); const newId = id(), settings = { ...quiz.settings, quiz_name: `${quiz.name} (Copy)`, quiz_code: "" }, newCode = `QUIZ-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; settings.quiz_code = newCode; const qs = await env.DB.prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY position").bind(quizId).all(); await env.DB.batch([env.DB.prepare("INSERT INTO quizzes (id, code, name, owner_id, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(newId, newCode, settings.quiz_name, auth.claims.sub, JSON.stringify(settings), now()), ...qs.results.map((q) => env.DB.prepare("INSERT INTO questions (id, quiz_id, position, question, image, options_json, correct_json, marks, negative, question_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id(), newId, q.position, q.question, q.image, q.options_json, q.correct_json, q.marks, q.negative, q.question_type))]); return json({ id: newId, code: newCode, name: settings.quiz_name, status: "draft", settings }, 201); }
      if (action === "upload-csv" && method === "POST") { if (!manager) return fail("You do not have permission", 403); if (quiz.status === "live") return fail("A live quiz cannot be changed", 409); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return fail("CSV file is required"); const rows = csvRows(await file.text()); if (rows.length < 2) return fail("CSV has no question rows"); const headings = rows[0].map((x) => x.toLowerCase().replaceAll(" ", "")); const field = (row, name) => row[headings.indexOf(name)] || ""; const questions = [], errors = [];
        rows.slice(1).forEach((row, index) => {
          const question = field(row, "question");
          const eediIdxRaw = field(row, "eedi_index") || field(row, "index");
          const eediIndex = eediIdxRaw ? parseInt(eediIdxRaw, 10) : null;
          const eediTerm = field(row, "eedi_term") || field(row, "term") || null;
          const options = { A: field(row, "optiona"), B: field(row, "optionb"), C: field(row, "optionc"), D: field(row, "optiond") };
          if (eediIndex !== null && !isNaN(eediIndex)) options._eedi_index = eediIndex;
          if (eediTerm) options._eedi_term = eediTerm;
          const correct = field(row, "correct").toUpperCase().split(/[|,]/).map((x) => x.trim()).filter(Boolean);
          if (!question || !options.A || !options.B || !correct.length || correct.some((x) => !options[x])) {
            errors.push({ row: index + 2, reason: "Question, options A/B and valid Correct answer are required" });
          } else {
            questions.push({ id: id(), position: index, question, image: field(row, "image") || null, options, correct, marks: Number(field(row, "marks")) || 1, negative: Number(field(row, "negative")) || 0, question_type: correct.length > 1 ? "mcq_multiple" : "mcq_single" });
          }
        });
        if (errors.length) return json({ accepted: false, valid_rows: questions.length, invalid_rows: errors.length, errors }); const statements = [env.DB.prepare("DELETE FROM questions WHERE quiz_id = ?").bind(quizId), ...questions.map((q) => env.DB.prepare("INSERT INTO questions (id, quiz_id, position, question, image, options_json, correct_json, marks, negative, question_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(q.id, quizId, q.position, q.question, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.marks, q.negative, q.question_type))]; await env.DB.batch(statements); return json({ accepted: true, valid_rows: questions.length, invalid_rows: 0, errors: [] }); }
      if (action === "preview" && method === "GET") { const rows = await env.DB.prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY position").bind(quizId).all(); return json({ quiz, questions: rows.results.map((q) => ({ id: q.id, question: q.question, image: q.image, options: JSON.parse(q.options_json), correct: JSON.parse(q.correct_json), marks: q.marks, negative: q.negative, question_type: q.question_type })) }); }
      if (action === "start" && method === "POST") { if (!manager) return fail("You do not have permission", 403); const rows = await env.DB.prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY position").bind(quizId).all(); if (!rows.results.length) return fail("Upload at least one valid question before starting", 400); const questions = rows.results.map((q) => ({ id: q.id, question: q.question, image: q.image, options: JSON.parse(q.options_json), correct: JSON.parse(q.correct_json), marks: q.marks, negative: q.negative, question_type: q.question_type })); const run = await doCall(env, quizId, "/init", { settings: quiz.settings, questions, actor: auth.claims.username }); if (!run.response.ok) return json(run.data, run.response.status); await env.DB.prepare("UPDATE quizzes SET status = 'live', started_at = ? WHERE id = ?").bind(now(), quizId).run(); return json({ ...quiz, status: "live" }); }
      if (action === "end" && method === "POST") { if (!manager) return fail("You do not have permission", 403); const run = await doCall(env, quizId, "/end", {}, { "x-actor": auth.claims.username }); if (!run.response.ok) return json(run.data, run.response.status); await env.DB.prepare("UPDATE quizzes SET status = 'ended', ended_at = ? WHERE id = ?").bind(now(), quizId).run(); return json({ ...quiz, status: "ended" }); }
      if (action === "monitor" && method === "GET") { const run = await doCall(env, quizId, "/monitor"); return json({ quiz, ...run.data }, run.response.status); }
      if (action === "results" && method === "GET") { const run = await doCall(env, quizId, "/results"); return json({ quiz_name: quiz.name, ...run.data }, run.response.status); }
      if (action === "analytics" && method === "GET") { const run = await doCall(env, quizId, "/analytics"); return json(run.data, run.response.status); }
      if (action === "proctoring" && method === "GET") { const run = await doCall(env, quizId, "/proctoring"); return json(run.data, run.response.status); }
      if (action === "export/csv" && method === "GET") { const run = await doCall(env, quizId, "/results"); if (!run.response.ok) return json(run.data, run.response.status); const lines = [["Rank", "Roll number", "Name", "Correct", "Wrong", "Skipped", "Marks", "Max marks", "Percentage", "Result", "Warnings"], ...run.data.results.map((r) => [r.rank, r.roll_number, r.name, r.correct, r.wrong, r.skipped, r.marks, r.max_marks, r.percentage, r.passed ? "Pass" : "Fail", r.warnings])].map((row) => row.map(escapeCsv).join(",")).join("\r\n"); return new Response(lines, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${quiz.code}-results.csv"` } }); }
      if (action === "session" && method === "DELETE") { if (!manager || quiz.status !== "ended") return fail("Only a manager can remove an ended quiz session", 403); await env.DB.batch([env.DB.prepare("DELETE FROM questions WHERE quiz_id = ?").bind(quizId), env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quizId)]); return json({ deleted: true }); }
    }
    if (path === "/api/student/join" && method === "POST") {
      if (!(await checkRate(env, request, "student-join", 12, 300))) return fail("Too many join attempts; please wait a few minutes", 429); const body = await request.json(); const code = String(body.quiz_code || "").trim().toUpperCase(); const row = await env.DB.prepare("SELECT * FROM quizzes WHERE code = ?").bind(code).first(); if (!row) return fail("Invalid quiz code", 404); const quiz = quizView(row); if (quiz.status !== "live") return fail("This quiz is not live yet", 400); const name = String(body.name || "").trim().slice(0, 120), roll = String(body.roll_number || "").trim().slice(0, 64), device = String(body.device_id || "").trim().slice(0, 200); if (!name || !roll || device.length < 8) return fail("Name, roll number and a valid device are required");
      // Joining is the student self-registration flow. It records an account
      // identifier for audit/retention without creating a staff-login account.
      await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, '!session-only!', 'student', ?)").bind(id(), `student:${quiz.id}:${roll}`.toLowerCase(), name, now()).run();
      const sessionId = id(); const run = await doCall(env, quiz.id, "/join", { session_id: sessionId, name, roll_number: roll, device_id: device }); if (!run.response.ok) return json(run.data, run.response.status); const s = run.data.session; const token = await signToken(env, { sub: s.id, role: "student", quiz_id: quiz.id, roll_number: roll, device_id: device }, Math.max(quiz.settings.duration_minutes + 30, 180)); return json({ access_token: token, session_id: s.id, name: s.name, roll_number: s.rollNumber, quiz_name: quiz.name, duration_seconds: quiz.settings.duration_minutes * 60, remaining_seconds: Math.max(0, Math.ceil((s.deadline - now()) / 1000)), total_questions: s.questionOrder.length, camera_required: !!quiz.settings.camera_required, fullscreen_required: !!quiz.settings.fullscreen_required });
    }
    const student = await requireAuth(env, request, ["student"]);
    if (!student.error) {
      const claims = student.claims; const sessionHeaders = { "x-session-id": claims.sub };
      if (path === "/api/student/resume" && method === "GET") { const run = await doCall(env, claims.quiz_id, "/resume", undefined, sessionHeaders); if (!run.response.ok) return json(run.data, run.response.status); const s = run.data.session; return json({ quiz_name: (await env.DB.prepare("SELECT name FROM quizzes WHERE id = ?").bind(claims.quiz_id).first()).name, session_status: s.status, remaining_seconds: run.data.remaining_seconds, duration_seconds: s.deadline - s.joinedAt, total_questions: s.questionOrder.length, camera_required: false, fullscreen_required: true, name: s.name, roll_number: s.rollNumber }); }
      if (path === "/api/student/palette" && method === "GET") { const run = await doCall(env, claims.quiz_id, "/palette", undefined, sessionHeaders); return json(run.data, run.response.status); }
      if (path.startsWith("/api/student/question/") && method === "GET") { const run = await doCall(env, claims.quiz_id, `/question/${path.slice(22)}`, undefined, sessionHeaders); return json(run.data, run.response.status); }
      if (path === "/api/student/answer" && method === "POST") { if (!(await checkRate(env, request, "student-answer", 60, 60))) return fail("Saving too quickly; please retry", 429); const run = await doCall(env, claims.quiz_id, "/answer", await request.json(), sessionHeaders); return json(run.data, run.response.status); }
      if (path === "/api/student/warning" && method === "POST") { const run = await doCall(env, claims.quiz_id, "/warning", await request.json(), sessionHeaders); return json(run.data, run.response.status); }
      if (path === "/api/student/camera-status" && method === "POST") { const run = await doCall(env, claims.quiz_id, "/status", { camera_on: url.searchParams.get("on") === "true" }, sessionHeaders); return json(run.data, run.response.status); }
      if (path === "/api/student/fullscreen-status" && method === "POST") { const run = await doCall(env, claims.quiz_id, "/status", { fullscreen: url.searchParams.get("on") === "true" }, sessionHeaders); return json(run.data, run.response.status); }
      if (path === "/api/student/submit" && method === "POST") { const run = await doCall(env, claims.quiz_id, "/submit", await request.json(), sessionHeaders); return json(run.data, run.response.status); }
      if (path === "/api/student/result" && method === "GET") { const run = await doCall(env, claims.quiz_id, "/resume", undefined, sessionHeaders); return json(run.data.session.result || { detail: "Quiz not yet submitted" }, run.data.session.result ? 200 : 400); }
    }
    if (path === "/api/realtime" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const claims = await verifyToken(env, request); if (!claims) return fail("Authentication required", 401);
      const quizId = claims.role === "student" ? claims.quiz_id : url.searchParams.get("quiz_id");
      console.log("[DO CAMERA] realtime ingress role:", claims.role, "quiz:", quizId, "session:", claims.sub);
      if (!quizId) return fail("Quiz ID is required", 400);
      if (claims.role !== "student" && !["admin", "trainer", "hod"].includes(claims.role)) return fail("Not permitted", 403);
      if (claims.role !== "student" && claims.role !== "admin" && claims.role !== "hod") {
        const quiz = await env.DB.prepare("SELECT owner_id FROM quizzes WHERE id = ?").bind(quizId).first();
        if (!quiz || quiz.owner_id !== claims.sub) return fail("You do not have access to this quiz", 403);
      }
      const headers = new Headers(request.headers); headers.set("x-quiz-role", claims.role); headers.set("x-session-id", claims.role === "student" ? claims.sub : ""); headers.set("x-user-id", claims.sub); return quizStub(env, quizId).fetch(new Request(request, { headers }));
    }
    return fail("Not found", 404);
  } catch (error) {
    console.error(error); return fail("The service could not complete that request", 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url); const response = url.pathname.startsWith("/api/") ? await api(request, env) : await env.ASSETS.fetch(request);
    return responseHeaders(response);
  },
};

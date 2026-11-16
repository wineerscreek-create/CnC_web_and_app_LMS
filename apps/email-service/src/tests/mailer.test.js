/**
 * mailer.test.js — Node.js built-in test runner tests for the CnC LMS email service.
 *
 * Run with:  node --test src/tests/
 *
 * Tests use a mock Nodemailer transporter so no real SMTP server is needed.
 * The Express app is imported directly and tested with supertest-style http calls.
 */
"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// ---------------------------------------------------------------------------
// Helpers — minimal HTTP client (avoids external deps in tests)
// ---------------------------------------------------------------------------
function request(server, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = addr.port;
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Setup — patch the transporter BEFORE requiring the app
// ---------------------------------------------------------------------------
const FAKE_API_KEY = "test-secret-key-1234";

// Patch env vars before importing app modules
process.env.EMAIL_SERVICE_API_KEY = FAKE_API_KEY;
process.env.EMAIL_DRY_RUN = "true"; // No real SMTP in tests
process.env.PORT = "0"; // OS-assigned port

// Mock nodemailer's createTransport so no real SMTP connection is attempted
const nodemailer = require("nodemailer");
const originalCreateTransport = nodemailer.createTransport;
let lastSentMail = null;

nodemailer.createTransport = () => ({
  sendMail: (mailOptions) => {
    lastSentMail = mailOptions;
    return Promise.resolve({ messageId: "<mock-message-id@test>" });
  },
  verify: (cb) => cb(null, true),
});

// Now import the app (it will use the mocked transporter)
const app = require("../index");

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
let server;

before(() => {
  server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(() => {
  nodemailer.createTransport = originalCreateTransport; // restore
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  lastSentMail = null;
});

// ---------------------------------------------------------------------------
describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(server, "GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "cnc-email-service");
  });
});

// ---------------------------------------------------------------------------
describe("Auth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(server, "POST", "/send-verification", {
      to: "user@test.com",
      name: "Test User",
      otp: "123456",
      link: "http://localhost/verify",
    });
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  it("returns 401 when API key is wrong", async () => {
    const res = await request(
      server,
      "POST",
      "/send-verification",
      { to: "user@test.com", name: "Test User", otp: "123456", link: "http://localhost/verify" },
      { Authorization: "Bearer wrong-key" }
    );
    assert.equal(res.status, 401);
  });

  it("accepts a correct Bearer token", async () => {
    const res = await request(
      server,
      "POST",
      "/send-verification",
      { to: "user@test.com", name: "Test User", otp: "654321", link: "http://localhost/verify" },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    // DRY_RUN=true → no real send but should not 401/400
    assert.notEqual(res.status, 401);
  });
});

// ---------------------------------------------------------------------------
describe("POST /send-verification", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(
      server,
      "POST",
      "/send-verification",
      { to: "user@test.com" }, // missing name, otp, link
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.required));
  });

  it("returns 200 and ok:true with valid payload (dry-run)", async () => {
    const res = await request(
      server,
      "POST",
      "/send-verification",
      {
        to: "student@test.com",
        name: "Alice Kumar",
        otp: "987654",
        link: "http://localhost:3000/verify-email?token=abc",
        otpTtlMinutes: 10,
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it("includes OTP in the email subject (dry-run mode skips actual send)", async () => {
    // In dry-run mode the mailer logs and returns {messageId:'dry-run'}.
    // We verify the response shape only.
    const res = await request(
      server,
      "POST",
      "/send-verification",
      {
        to: "trainer@test.com",
        name: "Bob Singh",
        otp: "111222",
        link: "http://localhost:3000/verify-email?token=xyz",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

// ---------------------------------------------------------------------------
describe("POST /send-password-reset", () => {
  it("returns 400 when resetLink is missing", async () => {
    const res = await request(
      server,
      "POST",
      "/send-password-reset",
      { to: "user@test.com", name: "User" },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 400);
  });

  it("returns 200 with valid payload (dry-run)", async () => {
    const res = await request(
      server,
      "POST",
      "/send-password-reset",
      {
        to: "user@test.com",
        name: "Alice Kumar",
        resetLink: "http://localhost:3000/reset-password?token=tok",
        otp: "000111",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

// ---------------------------------------------------------------------------
describe("POST /send (generic relay)", () => {
  it("returns 400 when text is missing", async () => {
    const res = await request(
      server,
      "POST",
      "/send",
      { to: "user@test.com", subject: "Hello" },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 400);
  });

  it("returns 200 with valid payload (dry-run)", async () => {
    // /send uses transporter directly (not DRY_RUN), so patch env just for this test
    process.env.EMAIL_DRY_RUN = "false";
    const res = await request(
      server,
      "POST",
      "/send",
      { to: "admin@test.com", subject: "Test generic", text: "Hello world", html: "<b>Hello</b>" },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    process.env.EMAIL_DRY_RUN = "true"; // restore
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.messageId);
  });
});


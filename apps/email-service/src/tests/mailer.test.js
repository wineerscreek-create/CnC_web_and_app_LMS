/**
 * mailer.test.js — Node.js built-in test runner tests for the CnC LMS email service.
 *
 * Run with:  node --test src/tests/mailer.test.js
 *
 * Strategy:
 *   - Global `fetch` is replaced with a mock before any app module is loaded.
 *   - Tests cover: auth middleware, field validation, Mailjet success,
 *     Mailjet API failure, Mailjet HTTP-200-but-status-error, missing credentials,
 *     and all existing endpoint shapes.
 *   - No real HTTP requests are made to Mailjet.
 *   - Log output must never contain subjects, OTP values, full email addresses,
 *     or credentials.
 */
"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// ---------------------------------------------------------------------------
// Helpers — minimal HTTP client (unchanged from original tests)
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
// Log capture helper — intercepts console.log/error output for assertion
// ---------------------------------------------------------------------------
function captureLog(fn) {
  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => lines.push(args.join(" "));
  console.error = (...args) => lines.push(args.join(" "));
  return fn().finally(() => {
    console.log = origLog;
    console.error = origErr;
  }).then((result) => ({ result, lines }));
}

// ---------------------------------------------------------------------------
// Global fetch mock — installed BEFORE importing any app modules
// ---------------------------------------------------------------------------
const FAKE_API_KEY = "test-secret-key-1234";

// Default mock: Mailjet returns HTTP 200 with Status "success"
let mockFetchResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    Messages: [{ Status: "success", To: [{ MessageID: 12345678, MessageUUID: "test-uuid" }] }],
  }),
};

global.fetch = async (_url, _options) => {
  // Return a fresh object each time (simulate network response)
  return {
    ok: mockFetchResponse.ok,
    status: mockFetchResponse.status,
    json: mockFetchResponse.json,
  };
};

// Patch env vars before importing app modules
process.env.EMAIL_SERVICE_API_KEY = FAKE_API_KEY;
process.env.EMAIL_DRY_RUN = "true"; // dry-run by default; individual tests override
process.env.PORT = "0"; // OS-assigned port
process.env.MAILJET_API_KEY = "fake-mailjet-api-key";
process.env.MAILJET_SECRET_KEY = "fake-mailjet-secret-key";
process.env.EMAIL_FROM = "test@example.com";
process.env.EMAIL_FROM_NAME = "Test Service";

// Now import the app (uses our mocked fetch)
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
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  // Reset to successful Mailjet response (with Status: "success")
  mockFetchResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      Messages: [{ Status: "success", To: [{ MessageID: 12345678, MessageUUID: "test-uuid" }] }],
    }),
  };
  // Reset to dry-run mode (safe default)
  process.env.EMAIL_DRY_RUN = "true";
});

// ---------------------------------------------------------------------------
describe("GET /health", () => {
  it("returns 200 with status ok and provider mailjet", async () => {
    const res = await request(server, "GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "cnc-email-service");
    assert.equal(res.body.provider, "mailjet");
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
    // dry-run=true → succeeds without real send
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 400);
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
    assert.ok(res.body.messageId !== undefined);
  });

  it("returns 200 and ok:true (Mailjet mock success)", async () => {
    // Switch to live mode so the Mailjet mock is exercised
    process.env.EMAIL_DRY_RUN = "false";

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
    // messageId comes from mocked Mailjet response
    assert.ok(res.body.messageId);
  });

  it("returns 502 when Mailjet API returns a non-2xx error", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    // Override mock to simulate Mailjet API failure
    mockFetchResponse = {
      ok: false,
      status: 400,
      json: async () => ({ ErrorMessage: "Invalid sender" }),
    };

    const res = await request(
      server,
      "POST",
      "/send-verification",
      {
        to: "fail@test.com",
        name: "Error User",
        otp: "000000",
        link: "http://localhost:3000/verify-email?token=fail",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
  });

  it("returns 502 when Mailjet returns HTTP 200 but message Status is 'error'", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    // HTTP 200 but per-message Status is "error" — must NOT be treated as success
    mockFetchResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        Messages: [{
          Status: "error",
          Errors: [{ ErrorCode: "mj-0004", ErrorMessage: "Sender address is not valid" }],
        }],
      }),
    };

    const res = await request(
      server,
      "POST",
      "/send-verification",
      {
        to: "badsender@test.com",
        name: "Bad Sender",
        otp: "555555",
        link: "http://localhost:3000/verify-email?token=bad",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
  });

  it("returns 502 when Mailjet credentials are missing", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    const savedKey = process.env.MAILJET_API_KEY;
    const savedSecret = process.env.MAILJET_SECRET_KEY;
    delete process.env.MAILJET_API_KEY;
    delete process.env.MAILJET_SECRET_KEY;

    const res = await request(
      server,
      "POST",
      "/send-verification",
      {
        to: "nocreds@test.com",
        name: "No Creds",
        otp: "999999",
        link: "http://localhost:3000/verify-email?token=nocreds",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );

    // Restore credentials for subsequent tests
    process.env.MAILJET_API_KEY = savedKey;
    process.env.MAILJET_SECRET_KEY = savedSecret;

    assert.equal(res.status, 502);
    assert.ok(res.body.error);
  });

  it("does not log OTP, subject, or body in live-send mode", async () => {
    process.env.EMAIL_DRY_RUN = "false";

    const TEST_OTP = "847291";
    const { lines } = await captureLog(() =>
      request(
        server,
        "POST",
        "/send-verification",
        {
          to: "logcheck@test.com",
          name: "Log Test",
          otp: TEST_OTP,
          link: "http://localhost:3000/verify-email?token=logcheck",
        },
        { Authorization: `Bearer ${FAKE_API_KEY}` }
      )
    );

    const combined = lines.join("\n");
    // OTP must not appear in any log line
    assert.ok(!combined.includes(TEST_OTP), "OTP must not appear in logs");
    // Full email address must not appear — only masked form permitted
    assert.ok(!combined.includes("logcheck@test.com"), "Full recipient email must not appear in logs");
    // Subject must not appear (it contains the OTP)
    assert.ok(!combined.includes("Verify your"), "Email subject must not appear in logs");
  });

  it("does not log OTP in dry-run mode", async () => {
    // dry-run=true (default from beforeEach)
    const TEST_OTP = "112233";
    const { lines } = await captureLog(() =>
      request(
        server,
        "POST",
        "/send-verification",
        {
          to: "drylogcheck@test.com",
          name: "Dry Log Test",
          otp: TEST_OTP,
          link: "http://localhost:3000/verify-email?token=drylogcheck",
        },
        { Authorization: `Bearer ${FAKE_API_KEY}` }
      )
    );

    const combined = lines.join("\n");
    assert.ok(!combined.includes(TEST_OTP), "OTP must not appear in dry-run logs");
    assert.ok(!combined.includes("drylogcheck@test.com"), "Full recipient email must not appear in dry-run logs");
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

  it("returns 200 with valid payload (Mailjet mock success)", async () => {
    process.env.EMAIL_DRY_RUN = "false";

    const res = await request(
      server,
      "POST",
      "/send-password-reset",
      {
        to: "user@test.com",
        name: "Alice Kumar",
        resetLink: "http://localhost:3000/reset-password?token=tok2",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.messageId);
  });

  it("returns 502 when Mailjet API returns a non-2xx error", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    mockFetchResponse = {
      ok: false,
      status: 500,
      json: async () => ({ ErrorMessage: "Internal server error" }),
    };

    const res = await request(
      server,
      "POST",
      "/send-password-reset",
      {
        to: "err@test.com",
        name: "Err User",
        resetLink: "http://localhost:3000/reset-password?token=err",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
  });

  it("returns 502 when Mailjet returns HTTP 200 but message Status is 'error'", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    mockFetchResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        Messages: [{
          Status: "error",
          Errors: [{ ErrorCode: "mj-0013", ErrorMessage: "Recipient address is not valid" }],
        }],
      }),
    };

    const res = await request(
      server,
      "POST",
      "/send-password-reset",
      {
        to: "badrecip@test.com",
        name: "Bad Recip",
        resetLink: "http://localhost:3000/reset-password?token=badrecip",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
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

  it("returns 200 with valid payload (Mailjet mock success)", async () => {
    process.env.EMAIL_DRY_RUN = "false";

    const res = await request(
      server,
      "POST",
      "/send",
      {
        to: "admin@test.com",
        subject: "Test generic",
        text: "Hello world",
        html: "<b>Hello</b>",
      },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.messageId);
  });

  it("returns 502 when Mailjet API returns a non-2xx error", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    mockFetchResponse = {
      ok: false,
      status: 403,
      json: async () => ({ ErrorMessage: "Forbidden" }),
    };

    const res = await request(
      server,
      "POST",
      "/send",
      { to: "admin@test.com", subject: "Fail", text: "Should fail" },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
  });

  it("returns 502 when Mailjet returns HTTP 200 but message Status is 'error'", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    mockFetchResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        Messages: [{
          Status: "error",
          Errors: [{ ErrorCode: "mj-0002", ErrorMessage: "Quota exceeded" }],
        }],
      }),
    };

    const res = await request(
      server,
      "POST",
      "/send",
      { to: "quota@test.com", subject: "Quota test", text: "Should fail" },
      { Authorization: `Bearer ${FAKE_API_KEY}` }
    );
    assert.equal(res.status, 502);
    assert.ok(res.body.error);
  });

  it("does not log subject in generic send success", async () => {
    process.env.EMAIL_DRY_RUN = "false";
    const SECRET_SUBJECT = "Super-secret-subject-XYZ";

    const { lines } = await captureLog(() =>
      request(
        server,
        "POST",
        "/send",
        { to: "generic@test.com", subject: SECRET_SUBJECT, text: "body text" },
        { Authorization: `Bearer ${FAKE_API_KEY}` }
      )
    );

    const combined = lines.join("\n");
    assert.ok(!combined.includes(SECRET_SUBJECT), "Subject must not appear in generic send logs");
    assert.ok(!combined.includes("generic@test.com"), "Full recipient email must not appear in generic send logs");
  });
});

/**
 * index.js — Express HTTP server for the CnC LMS email microservice.
 *
 * Endpoints:
 *   GET  /health                → 200 { status: "ok" }
 *   POST /send-verification     → send OTP verification email
 *   POST /send-password-reset   → send password-reset email
 *   POST /send                  → generic relay (subject + html + text)
 *
 * Authentication: every POST must carry  Authorization: Bearer <EMAIL_SERVICE_API_KEY>
 *
 * FastAPI calls this service from apps/api/app/services/email_service.py
 * when EMAIL_PROVIDER=nodemailer.
 */
"use strict";

// Load .env before anything else (no-op in production where env is injected)
require("dotenv").config();

const express = require("express");
const { sendVerificationEmail, sendPasswordResetEmail } = require("./mailer");
const { transporter } = require("./transporter");

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.EMAIL_SERVICE_API_KEY || "";

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function requireApiKey(req, res, next) {
  if (!API_KEY) {
    // No key configured → reject everything for safety
    console.error(
      JSON.stringify({
        level: "error",
        event: "api_key_not_configured",
        hint: "Set EMAIL_SERVICE_API_KEY environment variable",
      })
    );
    return res.status(503).json({ error: "Email service is not configured" });
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || token !== API_KEY) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "unauthorized_request",
        ip: req.ip,
        path: req.path,
      })
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Health check — no auth required (Render uses this for uptime checks) */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "cnc-email-service" });
});

/**
 * POST /send-verification
 * Body: { to, name, otp, link, otpTtlMinutes? }
 */
app.post("/send-verification", requireApiKey, async (req, res) => {
  const { to, name, otp, link, otpTtlMinutes } = req.body || {};

  if (!to || !name || !otp || !link) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["to", "name", "otp", "link"],
    });
  }

  try {
    const info = await sendVerificationEmail({ to, name, otp, link, otpTtlMinutes });
    return res.json({ ok: true, messageId: info?.messageId });
  } catch (err) {
    // Never expose SMTP credentials in the error response
    console.error(
      JSON.stringify({
        level: "error",
        event: "send_verification_failed",
        to,
        message: err.message,
      })
    );
    return res.status(502).json({ error: "Failed to send verification email" });
  }
});

/**
 * POST /send-password-reset
 * Body: { to, name, resetLink, otp? }
 */
app.post("/send-password-reset", requireApiKey, async (req, res) => {
  const { to, name, resetLink, otp } = req.body || {};

  if (!to || !name || !resetLink) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["to", "name", "resetLink"],
    });
  }

  try {
    const info = await sendPasswordResetEmail({ to, name, resetLink, otp });
    return res.json({ ok: true, messageId: info?.messageId });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "send_password_reset_failed",
        to,
        message: err.message,
      })
    );
    return res.status(502).json({ error: "Failed to send password-reset email" });
  }
});

/**
 * POST /send  (generic relay)
 * Body: { to, subject, text, html? }
 * Used as a fallback when FastAPI builds its own template and just needs SMTP relay.
 */
app.post("/send", requireApiKey, async (req, res) => {
  const { to, subject, text, html } = req.body || {};

  if (!to || !subject || !text) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["to", "subject", "text"],
    });
  }

  try {
    const { transporter: tp } = require("./transporter");
    const FROM = process.env.EMAIL_FROM || "CnC LMS <no-reply@example.com>";
    const info = await tp.sendMail({ from: FROM, to, subject, text, html });
    console.log(
      JSON.stringify({ level: "info", event: "email_sent_generic", to, subject, messageId: info.messageId })
    );
    return res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", event: "send_generic_failed", to, message: err.message })
    );
    return res.status(502).json({ error: "Failed to send email" });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "email_service_started",
      port: PORT,
      dryRun: process.env.EMAIL_DRY_RUN === "true",
    })
  );

  // Warm up: verify SMTP connectivity at startup (non-fatal if it fails)
  if (process.env.EMAIL_DRY_RUN !== "true") {
    transporter.verify((err) => {
      if (err) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "smtp_verify_failed",
            hint: "Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD env vars",
          })
        );
      } else {
        console.log(JSON.stringify({ level: "info", event: "smtp_ready" }));
      }
    });
  }
});

module.exports = app; // exported for tests


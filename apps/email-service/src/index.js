/**
 * index.js — Express HTTP server for the CnC LMS email microservice.
 *
 * Delivery backend: Mailjet Send API v3.1 (replaces Nodemailer/SMTP).
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
 * when EMAIL_PROVIDER=nodemailer (kept for backward compatibility with existing config).
 */
"use strict";

// Load .env before anything else (no-op in production where env is injected)
require("dotenv").config();

const express = require("express");
const { sendVerificationEmail, sendPasswordResetEmail, maskEmail } = require("./mailer");
const { sendViaMailjet } = require("./mailjet");

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.EMAIL_SERVICE_API_KEY || "";

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function requireApiKey(req, res, next) {
  if (!API_KEY) {
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
  res.json({ status: "ok", service: "cnc-email-service", provider: "mailjet" });
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
    // Never expose credentials or OTP values in the error response
    console.error(
      JSON.stringify({
        level: "error",
        event: "send_verification_failed",
        to: maskEmail(to),
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
        to: maskEmail(to),
        message: err.message,
      })
    );
    return res.status(502).json({ error: "Failed to send password-reset email" });
  }
});

/**
 * POST /send  (generic relay)
 * Body: { to, subject, text, html? }
 * Used as a fallback when FastAPI builds its own template and just needs delivery.
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
    const info = await sendViaMailjet({ to, subject, text, html });
    console.log(
      JSON.stringify({
        level: "info",
        event: "email_sent_generic",
        to: maskEmail(to),
        messageId: info.messageId,
      })
    );
    return res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "send_generic_failed",
        to: maskEmail(to),
        message: err.message,
      })
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
      provider: "mailjet",
      dryRun: process.env.EMAIL_DRY_RUN === "true",
    })
  );

  // Validate Mailjet credentials at startup (non-fatal warning only)
  if (process.env.EMAIL_DRY_RUN !== "true") {
    if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "mailjet_credentials_missing",
          hint: "Set MAILJET_API_KEY and MAILJET_SECRET_KEY environment variables",
        })
      );
    } else {
      console.log(
        JSON.stringify({
          level: "info",
          event: "mailjet_credentials_present",
          from: maskEmail(process.env.EMAIL_FROM || ""),
        })
      );
    }
  }
});

module.exports = app; // exported for tests

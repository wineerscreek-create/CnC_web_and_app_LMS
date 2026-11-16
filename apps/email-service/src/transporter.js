/**
 * transporter.js — Nodemailer SMTP transporter for CnC LMS email service.
 *
 * Reads configuration from environment variables only.
 * Credentials are NEVER logged or included in error responses.
 */
"use strict";

const nodemailer = require("nodemailer");

/** Create a fresh transporter from current env. Called once at startup. */
function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true"; // false → STARTTLS on port 587

  const auth =
    process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    // Reasonable timeouts so a blocked SMTP server doesn't stall the HTTP response
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

const transporter = createTransporter();

/** Verify SMTP connectivity. Resolves on success, rejects on failure. */
async function verifyConnection() {
  return transporter.verify();
}

module.exports = { transporter, verifyConnection };


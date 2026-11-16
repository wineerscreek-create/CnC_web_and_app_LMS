/**
 * mailer.js — High-level email send functions for CnC LMS.
 *
 * Delivery backend: Mailjet Send API v3.1 (native fetch, no SMTP).
 * Falls back to dry-run (console log) when EMAIL_DRY_RUN=true.
 *
 * Public API is unchanged — same function signatures as the previous
 * Nodemailer implementation so FastAPI callers require no changes.
 *
 * Log safety policy:
 *   - Recipient addresses are masked (first 2 chars + domain only).
 *   - Subjects, OTP values, email bodies, and credentials are NEVER logged.
 */
"use strict";

const { sendViaMailjet } = require("./mailjet");
const { verificationTemplate, passwordResetTemplate } = require("./templates");

const isDryRun = () => process.env.EMAIL_DRY_RUN === "true";

/**
 * Mask an email address for safe logging: "alice@example.com" → "al***@example.com".
 * Returns "(masked)" if the input is falsy or malformed.
 */
function maskEmail(email) {
  if (!email || typeof email !== "string") return "(masked)";
  const at = email.indexOf("@");
  if (at < 0) return "(masked)";
  const local = email.slice(0, at);
  const domain = email.slice(at); // includes "@"
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***${domain}`;
}

// ---------------------------------------------------------------------------
// Internal send helper
// ---------------------------------------------------------------------------

/**
 * Core send function. Routes to dry-run or Mailjet depending on env.
 * @param {{ to: string, subject: string, text: string, html?: string }} params
 * @returns {Promise<{ messageId: string }>}
 */
async function _send({ to, subject, text, html }) {
  if (isDryRun()) {
    // Log only masked recipient — never log subject, body, OTP, or credentials
    console.log(
      JSON.stringify({
        level: "info",
        event: "email_dry_run",
        to: maskEmail(to),
      })
    );
    return { messageId: "dry-run" };
  }

  const result = await sendViaMailjet({ to, subject, text, html });

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_sent_via_mailjet",
      to: maskEmail(to),
      messageId: result.messageId,
    })
  );

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send OTP verification email.
 * @param {{ to: string, name: string, otp: string, link: string, otpTtlMinutes?: number }} params
 * @returns {Promise<{ messageId: string }>}
 */
async function sendVerificationEmail({ to, name, otp, link, otpTtlMinutes }) {
  const tpl = verificationTemplate({ name, otp, link, otpTtlMinutes });
  return _send({ to, ...tpl });
}

/**
 * Send password-reset email.
 * @param {{ to: string, name: string, resetLink: string, otp?: string }} params
 * @returns {Promise<{ messageId: string }>}
 */
async function sendPasswordResetEmail({ to, name, resetLink, otp }) {
  const tpl = passwordResetTemplate({ name, resetLink, otp });
  return _send({ to, ...tpl });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, maskEmail };

/**
 * mailer.js — High-level email send functions for CnC LMS.
 *
 * Uses the shared Nodemailer transporter and HTML templates.
 * Falls back to dry-run (console log) when EMAIL_DRY_RUN=true.
 */
"use strict";

const { transporter } = require("./transporter");
const { verificationTemplate, passwordResetTemplate } = require("./templates");

const FROM = process.env.EMAIL_FROM || "CnC LMS <no-reply@example.com>";
const DRY_RUN = process.env.EMAIL_DRY_RUN === "true";

// ---------------------------------------------------------------------------
// Internal send helper
// ---------------------------------------------------------------------------
async function _send({ to, subject, text, html }) {
  if (DRY_RUN) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "email_dry_run",
        to,
        subject,
        textPreview: text.slice(0, 120),
      })
    );
    return { messageId: "dry-run" };
  }

  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject,
    text,
    html,
  });

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_sent",
      to,
      subject,
      messageId: info.messageId,
    })
  );
  return info;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send OTP verification email.
 * @param {{ to: string, name: string, otp: string, link: string, otpTtlMinutes?: number }} params
 */
async function sendVerificationEmail({ to, name, otp, link, otpTtlMinutes }) {
  const tpl = verificationTemplate({ name, otp, link, otpTtlMinutes });
  return _send({ to, ...tpl });
}

/**
 * Send password-reset email.
 * @param {{ to: string, name: string, resetLink: string, otp?: string }} params
 */
async function sendPasswordResetEmail({ to, name, resetLink, otp }) {
  const tpl = passwordResetTemplate({ name, resetLink, otp });
  return _send({ to, ...tpl });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };


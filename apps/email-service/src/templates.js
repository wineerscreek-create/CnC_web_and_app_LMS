/**
 * templates.js — HTML email templates for CnC LMS.
 *
 * Brand palette: purple gradient #4f46e5 → #7c3aed (matches the web UI).
 * Every function returns { subject, text, html }.
 */
"use strict";

const BRAND = "CnC LMS";

// ---------------------------------------------------------------------------
// Shared HTML wrapper
// ---------------------------------------------------------------------------
function htmlBase(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
                     padding:28px 32px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#ffffff;
                         letter-spacing:-0.5px;">${BRAND}</span>
          </td>
        </tr>
        <!-- body -->
        <tr>
          <td style="padding:32px 40px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="padding:16px 40px 24px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              &copy; ${new Date().getFullYear()} ${BRAND}. All rights reserved.<br/>
              You received this email because an action was performed on your account.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Verification email (OTP)
// ---------------------------------------------------------------------------
/**
 * @param {{ name: string, otp: string, link: string, otpTtlMinutes?: number }} params
 * @returns {{ subject: string, text: string, html: string }}
 */
function verificationTemplate({ name, otp, link, otpTtlMinutes = 10 }) {
  const firstName = name ? name.split(" ")[0] : name;
  const subject = `Verify your ${BRAND} account – ${otp}`;

  const text = [
    `Hi ${name},`,
    "",
    `Welcome to ${BRAND}!`,
    "",
    `Your email verification code is: ${otp}`,
    `It expires in ${otpTtlMinutes} minutes.`,
    "",
    "Or verify in one click:",
    link,
    "",
    "If you did not create this account, you can safely ignore this email.",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      Welcome to <strong>${BRAND}</strong>! Please verify your email to activate your account.
    </p>

    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-align:center;">
      Your verification code
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <span style="display:inline-block;padding:16px 32px;background:#f5f3ff;
                   border:2px dashed #7c3aed;border-radius:10px;
                   font-size:36px;font-weight:800;letter-spacing:8px;color:#4f46e5;">
        ${otp}
      </span>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#9ca3af;text-align:center;">
      &#9201; This code expires in <strong>${otpTtlMinutes} minutes</strong>.
    </p>

    <div style="text-align:center;margin:0 0 24px;">
      <a href="${link}"
         style="display:inline-block;padding:12px 28px;background:#4f46e5;
                color:#ffffff;border-radius:8px;font-size:14px;font-weight:700;
                text-decoration:none;">
        Verify my email &rarr;
      </a>
    </div>

    <p style="margin:0;font-size:12px;color:#d1d5db;text-align:center;">
      &#128274; Never share this code with anyone. ${BRAND} will never ask for it.
    </p>
  `;

  return { subject, text, html: htmlBase(subject, bodyHtml) };
}

// ---------------------------------------------------------------------------
// Password-reset email
// ---------------------------------------------------------------------------
/**
 * @param {{ name: string, resetLink: string, otp?: string }} params
 * @returns {{ subject: string, text: string, html: string }}
 */
function passwordResetTemplate({ name, resetLink, otp = "" }) {
  const firstName = name ? name.split(" ")[0] : name;
  const subject = otp
    ? `Reset your ${BRAND} password – ${otp}`
    : `Reset your ${BRAND} password`;

  const text = [
    `Hi ${name},`,
    "",
    `We received a request to reset your ${BRAND} password.`,
    "",
    ...(otp ? [`Your password reset code is: ${otp}`, ""] : []),
    "Reset your password:",
    resetLink,
    "",
    "This link expires in 15 minutes. All active sessions will be signed out after reset.",
    "",
    "If you did not request a password reset, you can safely ignore this email.",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      We received a request to reset the password for your <strong>${BRAND}</strong> account.
      Click the button below to set a new password.
    </p>

    ${
      otp
        ? `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-align:center;">
        Your reset code
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <span style="display:inline-block;padding:16px 32px;background:#f5f3ff;
                     border:2px dashed #7c3aed;border-radius:10px;
                     font-size:36px;font-weight:800;letter-spacing:8px;color:#4f46e5;">
          ${otp}
        </span>
      </div>`
        : ""
    }

    <div style="text-align:center;margin:0 0 24px;">
      <a href="${resetLink}"
         style="display:inline-block;padding:12px 28px;background:#4f46e5;
                color:#ffffff;border-radius:8px;font-size:14px;font-weight:700;
                text-decoration:none;">
        Reset my password &rarr;
      </a>
    </div>

    <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-align:center;">
      &#9201; This link expires in <strong>15 minutes</strong>.
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
      &#128274; All active sessions will be invalidated after the reset for your security.
    </p>
  `;

  return { subject, text, html: htmlBase(subject, bodyHtml) };
}

module.exports = { verificationTemplate, passwordResetTemplate };


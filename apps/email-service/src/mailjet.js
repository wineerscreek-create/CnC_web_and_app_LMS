/**
 * mailjet.js — Mailjet Send API v3.1 client for CnC LMS email service.
 *
 * Uses Node.js native fetch (Node >= 20). No external HTTP libraries.
 * Credentials are read from environment variables only — NEVER logged.
 *
 * Required env vars:
 *   MAILJET_API_KEY     — Public API key from Mailjet API Key Management
 *   MAILJET_SECRET_KEY  — Secret key from Mailjet API Key Management
 *   EMAIL_FROM          — Verified sender address (must be verified in Mailjet)
 *   EMAIL_FROM_NAME     — Display name for the sender (default: "CnC LMS")
 */
"use strict";

const MAILJET_SEND_URL = "https://api.mailjet.com/v3.1/send";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Validate that Mailjet credentials are present.
 * Throws a descriptive error (without revealing credential values).
 */
function assertCredentials() {
  if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
    throw new Error(
      "Mailjet credentials not configured. " +
        "Set MAILJET_API_KEY and MAILJET_SECRET_KEY environment variables."
    );
  }
}

/**
 * Build the Basic Auth header value from env credentials.
 * Uses base64(apiKey:secretKey) — never stored or logged.
 */
function buildAuthHeader() {
  const credentials = `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`;
  return "Basic " + Buffer.from(credentials).toString("base64");
}

/**
 * Send an email via the Mailjet v3.1 Send API.
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} params
 * @returns {Promise<{ messageId: string }>}
 * @throws if Mailjet API returns a non-2xx status, a failed message status, or times out
 */
async function sendViaMailjet({ to, subject, text, html }) {
  assertCredentials();

  const fromEmail = process.env.EMAIL_FROM || "no-reply@example.com";
  const fromName = process.env.EMAIL_FROM_NAME || "CnC LMS";

  const payload = {
    Messages: [
      {
        From: { Email: fromEmail, Name: fromName },
        To: [{ Email: to }],
        Subject: subject,
        TextPart: text,
        ...(html ? { HTMLPart: html } : {}),
      },
    ],
  };

  // AbortController provides the request timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(MAILJET_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Mailjet API request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new Error(`Mailjet API network error: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  // Parse response body regardless of status (Mailjet returns JSON on errors too)
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = {};
  }

  if (!response.ok) {
    // Log status code and Mailjet's error description — no credentials in log
    const mjError =
      responseBody?.ErrorMessage ||
      responseBody?.Messages?.[0]?.Errors?.[0]?.ErrorMessage ||
      `HTTP ${response.status}`;
    throw new Error(`Mailjet API error (${response.status}): ${mjError}`);
  }

  // Mailjet may return HTTP 200 with a per-message Status of "error".
  // Validate the message-level status so we never report a failed send as success.
  const msg = responseBody?.Messages?.[0];
  if (!msg) {
    throw new Error("Mailjet API error: unexpected response shape (no Messages)");
  }
  if (msg.Status !== "success") {
    const mjError =
      msg.Errors?.[0]?.ErrorMessage ||
      msg.Status ||
      "unknown message status";
    throw new Error(`Mailjet message rejected: ${mjError}`);
  }

  // Extract the Mailjet MessageID from the response
  const messageId =
    msg.To?.[0]?.MessageID?.toString() ||
    msg.To?.[0]?.MessageUUID ||
    "unknown";

  return { messageId };
}

module.exports = { sendViaMailjet };


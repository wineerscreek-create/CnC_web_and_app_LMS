"""Transactional email behind a provider interface.

Providers
---------
``console``    — writes to log; keeps last 200 deliveries in memory for tests.
``smtp``       — production Python SMTP/STARTTLS via smtplib (Gmail-compatible).
``nodemailer`` — delegates delivery to the Node.js email microservice
                 (apps/email-service) via authenticated HTTP POST. This is the
                 recommended production provider — it uses Nodemailer with the
                 latest security patches and is decoupled from the Python process.

Configuration
-------------
All credentials come from environment variables only.
"""
from __future__ import annotations

import asyncio
import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.email")


@dataclass
class SentMessage:
    to: str
    subject: str
    body: str
    at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class EmailProvider(ABC):
    @abstractmethod
    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


class ConsoleEmailProvider(EmailProvider):
    """Development driver — prints to log; never used in production."""

    outbox: list[SentMessage] = []

    @property
    def name(self) -> str:
        return "console"

    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None:
        self.outbox.append(SentMessage(to=to, subject=subject, body=body))
        del self.outbox[:-200]
        log.info("email_console_delivery", extra={"to": to, "subject": subject, "body": body})


class SmtpEmailProvider(EmailProvider):
    """Production SMTP driver. Uses STARTTLS.

    Required environment variables:
        SMTP_HOST        — e.g. smtp.gmail.com
        SMTP_PORT        — e.g. 587
        SMTP_USER        — sender login (Gmail: full address)
        SMTP_PASSWORD    — app password (Gmail: 16-char app password)
        EMAIL_FROM       — From header (e.g. CnC LMS <you@gmail.com>)
    """

    @property
    def name(self) -> str:
        return "smtp"

    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None:
        message = EmailMessage()
        message["From"] = settings.EMAIL_FROM
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        if html:
            message.add_alternative(html, subtype="html")

        smtp_host = settings.SMTP_HOST or ""
        smtp_port = settings.SMTP_PORT
        smtp_user = settings.SMTP_USER
        smtp_pass = settings.SMTP_PASSWORD or ""

        def _send() -> None:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                if smtp_user:
                    server.login(smtp_user, smtp_pass)
                server.send_message(message)

        await asyncio.to_thread(_send)
        log.info("email_sent", extra={"to": to, "subject": subject})


_provider: EmailProvider | None = None


class NodemailerEmailProvider(EmailProvider):
    """Production email provider that delegates to the Node.js Nodemailer microservice.

    FastAPI builds the template, then POSTs to the email service's generic /send endpoint
    so that SMTP credentials live only in the Node.js service's environment.

    Required environment variables (FastAPI side):
        EMAIL_SERVICE_URL       — base URL of the Node.js service
                                  e.g. https://cnc-email-service.onrender.com
        EMAIL_SERVICE_API_KEY   — shared secret; Node.js service validates this as Bearer token
        EMAIL_SERVICE_TIMEOUT_SECONDS — HTTP request timeout (default 10)
    """

    @property
    def name(self) -> str:
        return "nodemailer"

    async def send(self, *, to: str, subject: str, body: str, html: str | None = None) -> None:
        import httpx  # already in requirements.txt (httpx>=0.28.1)

        url = (settings.EMAIL_SERVICE_URL or "").rstrip("/")
        api_key = settings.EMAIL_SERVICE_API_KEY or ""
        timeout = settings.EMAIL_SERVICE_TIMEOUT_SECONDS

        if not url:
            raise RuntimeError(
                "EMAIL_SERVICE_URL is not configured. "
                "Set it to the base URL of the Node.js email service."
            )
        if not api_key:
            raise RuntimeError(
                "EMAIL_SERVICE_API_KEY is not configured. "
                "Set it to the shared secret for the Node.js email service."
            )

        payload = {"to": to, "subject": subject, "text": body, "html": html}
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{url}/send", json=payload, headers=headers)
            response.raise_for_status()

        log.info("email_sent_via_nodemailer", extra={"to": to, "subject": subject})


def get_email_provider() -> EmailProvider:
    global _provider
    if _provider is None:
        if settings.EMAIL_PROVIDER == "smtp":
            _provider = SmtpEmailProvider()
        elif settings.EMAIL_PROVIDER == "nodemailer":
            _provider = NodemailerEmailProvider()
        else:
            _provider = ConsoleEmailProvider()
    return _provider


def reset_email_for_tests() -> None:
    global _provider
    _provider = None
    ConsoleEmailProvider.outbox.clear()


# --------------------------------------------------------------------------- templates
BRAND = "CnC LMS"


def _html_base(title: str, body_html: str) -> str:
    """Minimal responsive HTML wrapper matching the CnC brand palette."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{title}</title>
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
                         letter-spacing:-0.5px;">{BRAND}</span>
          </td>
        </tr>
        <!-- body -->
        <tr>
          <td style="padding:32px 32px 24px;">
            {body_html}
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="padding:16px 32px 28px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              You received this email because an action was performed on your {BRAND} account.<br>
              If you did not initiate this, please ignore this email or
              <a href="{settings.PUBLIC_WEB_URL}/contact"
                 style="color:#4f46e5;text-decoration:none;">contact support</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_verification_email(*, to: str, name: str, otp: str, link_token: str) -> None:
    link = f"{settings.PUBLIC_WEB_URL}/verify-email?token={link_token}&email={to}"
    subject = f"Verify your {BRAND} account — {otp}"

    # Plain-text fallback
    body = (
        f"Hi {name},\n\n"
        f"Welcome to {BRAND}!\n\n"
        f"Your email verification code is: {otp}\n"
        f"It expires in {settings.OTP_TTL_MINUTES} minutes.\n\n"
        f"Or verify in one click:\n{link}\n\n"
        f"If you did not create this account, you can safely ignore this email.\n"
    )

    # HTML version
    first_name = name.split()[0] if name else name
    body_html = f"""
    <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>{first_name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      Welcome to <strong>{BRAND}</strong>! Please verify your email to activate your account.
    </p>

    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-align:center;">
      Your verification code
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <span style="display:inline-block;padding:16px 32px;background:#f5f3ff;
                   border:2px dashed #7c3aed;border-radius:10px;
                   font-size:36px;font-weight:800;letter-spacing:8px;color:#4f46e5;">
        {otp}
      </span>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#9ca3af;text-align:center;">
      ⏱ This code expires in <strong>{settings.OTP_TTL_MINUTES} minutes</strong>.
    </p>

    <div style="text-align:center;margin:0 0 24px;">
      <a href="{link}"
         style="display:inline-block;padding:12px 28px;background:#4f46e5;
                color:#ffffff;border-radius:8px;font-size:14px;font-weight:700;
                text-decoration:none;">
        Verify my email →
      </a>
    </div>

    <p style="margin:0;font-size:12px;color:#d1d5db;text-align:center;">
      🔒 Never share this code with anyone. {BRAND} will never ask for it.
    </p>
    """
    html = _html_base(subject, body_html)
    await get_email_provider().send(to=to, subject=subject, body=body, html=html)


async def send_password_reset_email(
    *, to: str, name: str, reset_link: str | None = None, otp: str = "", link_token: str = ""
) -> None:
    link = reset_link or f"{settings.PUBLIC_WEB_URL}/reset-password?token={link_token}"
    subject = f"Reset your {BRAND} password"
    if otp:
        subject += f" — {otp}"

    # Plain-text fallback
    body = (
        f"Hi {name},\n\n"
        f"We received a request to reset your {BRAND} password.\n\n"
    )
    if otp:
        body += f"Your password reset code is: {otp}\n\n"
    body += (
        f"Reset your password:\n{link}\n\n"
        f"This link expires in 15 minutes. All active sessions will be signed out after reset.\n\n"
        f"If you did not request a password reset, you can safely ignore this email.\n"
    )

    # HTML version
    first_name = name.split()[0] if name else name
    body_html = f"""
    <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>{first_name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      We received a request to reset the password for your <strong>{BRAND}</strong> account.
      Click the button below to set a new password.
    </p>

    <div style="text-align:center;margin:0 0 24px;">
      <a href="{link}"
         style="display:inline-block;padding:12px 28px;background:#4f46e5;
                color:#ffffff;border-radius:8px;font-size:14px;font-weight:700;
                text-decoration:none;">
        Reset my password →
      </a>
    </div>

    <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-align:center;">
      ⏱ This link expires in <strong>15 minutes</strong>.
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
      🔒 All active sessions will be invalidated after the reset for your security.
    </p>
    """
    html = _html_base(subject, body_html)
    await get_email_provider().send(to=to, subject=subject, body=body, html=html)


async def send_security_alert(*, to: str, name: str, detail: str) -> None:
    subject = f"{BRAND} security alert"
    body = f"Hi {name},\n\n{detail}\n\nIf this wasn't you, please reset your password.\n"
    first_name = name.split()[0] if name else name
    body_html = f"""
    <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>{first_name}</strong>,</p>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">{detail}</p>
    <p style="margin:0;font-size:14px;color:#ef4444;">
      If this wasn't you, please
      <a href="{settings.PUBLIC_WEB_URL}/forgot-password"
         style="color:#ef4444;font-weight:700;">reset your password immediately</a>.
    </p>
    """
    html = _html_base(subject, body_html)
    await get_email_provider().send(to=to, subject=subject, body=body, html=html)

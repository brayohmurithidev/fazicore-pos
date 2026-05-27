"""
Async email sender using stdlib smtplib (no extra dependency).
If SMTP_HOST is not configured the call is a no-op so local dev never breaks.
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

log = logging.getLogger(__name__)


def _send_sync(to: str, subject: str, html: str, text: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    msg["To"]      = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as s:
        s.ehlo()
        if settings.SMTP_TLS:
            s.starttls()
            s.ehlo()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.sendmail(settings.SMTP_FROM, [to], msg.as_string())


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    if not settings.SMTP_HOST:
        log.debug("SMTP not configured — skipping email to %s", to)
        return
    try:
        await asyncio.to_thread(_send_sync, to, subject, html, text)
        log.info("Email sent to %s — %s", to, subject)
    except Exception as exc:
        log.error("Failed to send email to %s: %s", to, exc)


# ── Templates ──────────────────────────────────────────────────────────────────

async def send_welcome_email(
    to: str,
    org_name: str,
    slug: str,
    plan: str = "starter",
) -> None:
    webapp_url  = settings.WEBAPP_URL.rstrip("/")
    login_url   = f"{webapp_url}?org={slug}"
    plan_label  = plan.capitalize()

    subject = "Welcome to Fazi POS — your account is ready"

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:32px 40px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Fazi POS</p>
            <p style="margin:6px 0 0;font-size:13px;color:#9ca3af;">Point of Sale &amp; Business Management</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Welcome, {org_name}! 🎉</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              Your Fazi POS account has been set up and is ready to use.
              Here are the details you'll need to get started.
            </p>

            <!-- Details box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Your Account Details</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;">Business name</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">{org_name}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Your slug</td>
                      <td style="padding:6px 0;font-size:15px;font-weight:700;color:#111827;letter-spacing:0.5px;font-family:monospace;">{slug}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Plan</td>
                      <td style="padding:6px 0;">
                        <span style="display:inline-block;background:#111827;color:#ffffff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;letter-spacing:0.3px;">{plan_label}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Web app</td>
                      <td style="padding:6px 0;font-size:13px;"><a href="{webapp_url}" style="color:#2563eb;text-decoration:none;">{webapp_url}</a></td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#111827;border-radius:8px;">
                  <a href="{login_url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                    Open Fazi POS →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.6;">
              <strong style="color:#374151;">Your slug is your key.</strong>
              When you log in, enter <code style="background:#f3f4f6;padding:2px 5px;border-radius:4px;font-size:12px;">{slug}</code> as your organisation identifier.
            </p>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              Desktop and mobile apps are coming soon — we'll send another email when they're available.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Fazi POS &nbsp;·&nbsp; Powered by Fazi Labs<br>
              If you didn't expect this email, please ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    text = f"""Welcome to Fazi POS, {org_name}!

Your account is ready.

Business name : {org_name}
Your slug     : {slug}
Plan          : {plan_label}
Web app       : {webapp_url}

Open the app: {login_url}

Your slug is your key — enter "{slug}" as your organisation identifier when logging in.

Desktop and mobile apps are coming soon.

— Fazi POS Team
"""

    await send_email(to, subject, html, text)

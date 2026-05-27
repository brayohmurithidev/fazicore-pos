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
    recipients: list[str],
    org_name: str,
    slug: str,
    plan: str = "starter",
) -> None:
    # Deduplicate, normalise, drop blanks — send each unique address once
    seen: set[str] = set()
    unique = [r.strip().lower() for r in recipients if r and r.strip()]
    unique = [r for r in unique if not (r in seen or seen.add(r))]  # type: ignore[func-returns-value]
    webapp_url  = settings.WEBAPP_URL.rstrip("/")
    login_url   = f"{webapp_url}?org={slug}"
    plan_label  = plan.capitalize()

    subject = "Welcome to Fazi POS — your account is ready"

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px 24px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- Logo / wordmark -->
        <tr>
          <td style="padding-bottom:36px;">
            <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Fazi <span style="color:#D97706;">POS</span></span>
          </td>
        </tr>

        <!-- Heading -->
        <tr>
          <td style="padding-bottom:16px;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">Welcome, {org_name}</p>
          </td>
        </tr>

        <!-- Body text -->
        <tr>
          <td style="padding-bottom:32px;">
            <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.7;">
              Your account is ready. Here are the details you need to get started.
            </p>
          </td>
        </tr>

        <!-- Details -->
        <tr>
          <td style="padding-bottom:32px;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:14px 0 0;font-size:12px;color:#9ca3af;width:130px;vertical-align:top;">Business</td>
                <td style="padding:14px 0 0;font-size:14px;font-weight:600;color:#111827;">{org_name}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 0;font-size:12px;color:#9ca3af;vertical-align:top;">Slug</td>
                <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#111827;font-family:monospace;letter-spacing:0.5px;">{slug}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 0;font-size:12px;color:#9ca3af;vertical-align:top;">Plan</td>
                <td style="padding:10px 0 0;font-size:13px;font-weight:600;color:#D97706;">{plan_label}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 14px;font-size:12px;color:#9ca3af;vertical-align:top;">Web app</td>
                <td style="padding:10px 0 14px;font-size:13px;"><a href="{webapp_url}" style="color:#D97706;text-decoration:none;">{webapp_url}</a></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding-top:32px;padding-bottom:32px;">
            <a href="{login_url}" style="display:inline-block;background:#D97706;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;letter-spacing:0.1px;">
              Open Fazi POS
            </a>
          </td>
        </tr>

        <!-- Note -->
        <tr>
          <td style="padding-bottom:48px;">
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.7;">
              Use <strong style="color:#6b7280;">{slug}</strong> as your organisation identifier when signing in.<br>
              Desktop and mobile apps are coming soon.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #f3f4f6;padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#d1d5db;line-height:1.6;">
              Fazi POS &nbsp;&middot;&nbsp; Fazi Labs &nbsp;&middot;&nbsp;
              If you didn't expect this, you can ignore it.
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

    for addr in unique:
        await send_email(addr, subject, html, text)


async def send_user_welcome_email(
    email: str,
    full_name: str,
    org_name: str,
    slug: str,
) -> None:
    addr = email.strip().lower()
    if not addr:
        return
    webapp_url = settings.WEBAPP_URL.rstrip("/")
    login_url  = f"{webapp_url}?org={slug}"
    first_name = full_name.split()[0] if full_name else full_name

    subject = f"Your {org_name} account is ready — Fazi POS"

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px 24px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <tr>
          <td style="padding-bottom:36px;">
            <span style="font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.3px;">Fazi <span style="color:#D97706;">POS</span></span>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:16px;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">Hi {first_name},</p>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:32px;">
            <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.7;">
              An account has been created for you on <strong style="color:#111827;">{org_name}</strong>'s Fazi POS workspace. Use the details below to sign in.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:32px;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:14px 0 0;font-size:12px;color:#9ca3af;width:130px;vertical-align:top;">Business</td>
                <td style="padding:14px 0 0;font-size:14px;font-weight:600;color:#111827;">{org_name}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 0;font-size:12px;color:#9ca3af;vertical-align:top;">Your identifier</td>
                <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#111827;font-family:monospace;letter-spacing:0.5px;">{slug}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 14px;font-size:12px;color:#9ca3af;vertical-align:top;">Web app</td>
                <td style="padding:10px 0 14px;font-size:13px;"><a href="{webapp_url}" style="color:#D97706;text-decoration:none;">{webapp_url}</a></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding-top:32px;padding-bottom:32px;">
            <a href="{login_url}" style="display:inline-block;background:#D97706;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;letter-spacing:0.1px;">
              Open Fazi POS
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:48px;">
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.7;">
              Use <strong style="color:#6b7280;">{slug}</strong> as your organisation identifier when signing in.<br>
              Your manager will share your PIN with you separately.
            </p>
          </td>
        </tr>

        <tr>
          <td style="border-top:1px solid #f3f4f6;padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#d1d5db;line-height:1.6;">
              Fazi POS &nbsp;&middot;&nbsp; Fazi Labs &nbsp;&middot;&nbsp;
              If you didn't expect this, you can ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    text = f"""Hi {first_name},

An account has been created for you on {org_name}'s Fazi POS workspace.

Business     : {org_name}
Identifier   : {slug}
Web app      : {webapp_url}

Open the app: {login_url}

Use "{slug}" as your organisation identifier when signing in.
Your manager will share your PIN with you separately.

— Fazi POS Team
"""

    await send_email(addr, subject, html, text)

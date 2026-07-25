"""Branded HTML email rendering for TestBoard notifications.

Table-based layout with inline styles throughout (Outlook/Gmail strip
<style> blocks and ignore most CSS shorthand, so every rule that matters
is written directly on the element). Palette mirrors the app's light-theme
tokens in frontend/src/index.css, since email clients default to a light
background regardless of the recipient's in-app theme.
"""

from typing import Optional

BRAND_NAME = "TestBoard"

COLORS = {
    "page_bg": "#ede6d3",
    "card_bg": "#ffffff",
    "ink": "#12100d",
    "text_muted": "#5b5647",
    "text_subtle": "#8a8578",
    "green": "#0b3d2e",
    "green_bright": "#2f8f66",
    "gold": "#d9a62e",
    "rust": "#c1440e",
}

FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif"
FONT_BODY = "'Archivo', 'Segoe UI', Helvetica, Arial, sans-serif"

# Per notif_type presentation. Anything not listed falls back to DEFAULT_META,
# so new notification types automatically render a reasonable branded email
# without needing a template change.
TYPE_META = {
    "access_requested": {"eyebrow": "Access Request", "accent": "rust", "cta_label": "Review Request"},
    "password_reset_requested": {"eyebrow": "Password Reset", "accent": "rust", "cta_label": "Review Request"},
    "account_approved": {"eyebrow": "Welcome to TestBoard", "accent": "green", "cta_label": "Sign In"},
    "role_changed": {"eyebrow": "Account Update", "accent": "green", "cta_label": "Open TestBoard"},
    "bug_assigned": {"eyebrow": "Bug Assigned", "accent": "green", "cta_label": "View Bug"},
    "bug_blocker": {"eyebrow": "Blocker Flagged", "accent": "rust", "cta_label": "View Bug"},
    "comment_mention": {"eyebrow": "You Were Mentioned", "accent": "gold", "cta_label": "View Comment"},
    "document_uploaded": {"eyebrow": "Document Uploaded", "accent": "gold", "cta_label": "View Documents"},
}
DEFAULT_META = {"eyebrow": "Notification", "accent": "green", "cta_label": "Open TestBoard"}


def _accent_color(accent: str) -> str:
    return {
        "green": COLORS["green"],
        "rust": COLORS["rust"],
        "gold": COLORS["gold"],
    }.get(accent, COLORS["green"])


def _logo_mark() -> str:
    """Small terminal-bracket glyph standing in for the app's ">_" logo mark."""
    return (
        '<td width="32" style="width:32px;height:32px;background:{green};'
        'text-align:center;vertical-align:middle;">'
        '<span style="font-family:{font};font-size:14px;font-weight:700;'
        'color:#f2eee2;line-height:32px;">&gt;_</span></td>'
    ).format(green=COLORS["green"], font=FONT_DISPLAY)


def render_email(
    notif_type: str,
    title: str,
    body: Optional[str],
    app_link: str = "",
    recipient_name: Optional[str] = None,
) -> tuple:
    """Return (subject, html_body, text_body) for a notification.

    subject is just `title` — call sites already write it as a complete,
    specific sentence, so no extra wrapping is needed there.
    """
    meta = TYPE_META.get(notif_type, DEFAULT_META)
    accent = _accent_color(meta["accent"])
    eyebrow = meta["eyebrow"]
    cta_label = meta["cta_label"]
    greeting = f"Hi {recipient_name.split()[0]}," if recipient_name else "Hi,"
    body_text = body or title

    cta_html = ""
    if app_link:
        cta_html = f"""
        <tr>
          <td style="padding:28px 32px 4px 32px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:{accent};border:2px solid {COLORS['ink']};">
                  <a href="{app_link}" style="display:inline-block;padding:12px 24px;
                     font-family:{FONT_BODY};font-size:13px;font-weight:700;
                     letter-spacing:0.06em;text-transform:uppercase;color:#f2eee2;
                     text-decoration:none;">{cta_label} &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        """

    html = f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:{COLORS['page_bg']};">
    <span style="display:none;font-size:1px;color:{COLORS['page_bg']};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      {body_text[:120]}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{COLORS['page_bg']};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:{COLORS['card_bg']};border:2px solid {COLORS['ink']};">
            <tr>
              <td style="background:{COLORS['green']};padding:16px 32px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    {_logo_mark()}
                    <td style="padding-left:10px;font-family:{FONT_DISPLAY};font-size:16px;
                        font-weight:700;letter-spacing:0.02em;color:#f2eee2;">
                      {BRAND_NAME}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <div style="font-family:{FONT_BODY};font-size:11px;font-weight:700;
                     letter-spacing:0.1em;text-transform:uppercase;color:{accent};">
                  {eyebrow}
                </div>
                <div style="font-family:{FONT_DISPLAY};font-size:21px;font-weight:700;
                     color:{COLORS['ink']};margin-top:8px;line-height:1.3;">
                  {title}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0 32px;">
                <p style="margin:0;font-family:{FONT_BODY};font-size:14px;line-height:1.6;
                   color:{COLORS['text_muted']};">
                  {greeting}<br />{body_text}
                </p>
              </td>
            </tr>
            {cta_html}
            <tr>
              <td style="padding:32px;">
                <div style="border-top:1px solid #e4ddc8;padding-top:16px;
                     font-family:{FONT_BODY};font-size:11px;color:{COLORS['text_subtle']};">
                  Automated notification from {BRAND_NAME} &mdash; QA Project Tracker &amp; Status Reporting.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    text_lines = [greeting, "", body_text]
    if app_link:
        text_lines += ["", f"{cta_label}: {app_link}"]
    text_lines += ["", f"— {BRAND_NAME}"]
    text = "\n".join(text_lines)

    return title, html, text

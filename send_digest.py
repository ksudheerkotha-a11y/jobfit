#!/usr/bin/env python3
"""Weekly digest: email every user their current shortlist via Resend.

Optional, like the other external integrations in this project — if
RESEND_API_KEY isn't set, this prints a message and exits cleanly rather
than failing the workflow.

    python send_digest.py --min-fit 0.35 --top 10
"""

from __future__ import annotations

import argparse
import logging
import os

import requests

from jobfit.storage import fetch_matches_for_digest, fetch_user_emails

RESEND_API_URL = "https://api.resend.com/emails"


def _render_html(matches: list[dict]) -> str:
    if not matches:
        return "<p>No new matches this week — check back soon.</p>"

    rows = "".join(
        f"""<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">{round(m['fit_score'] * 100)}%</td>
  <td style="padding:8px 12px;border-bottom:1px solid #eee;">
    <strong>{m['jobs']['title']}</strong><br>
    <span style="color:#666;">{m['jobs']['company']} &middot; {m['jobs']['location']}</span>
  </td>
  <td style="padding:8px 12px;border-bottom:1px solid #eee;">
    <a href="{m['jobs']['apply_url']}" style="color:#2a78d6;text-decoration:none;">Apply &rarr;</a>
  </td>
</tr>"""
        for m in matches
    )

    return f"""<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;">
  <h2 style="margin-bottom:4px;">Your jobfit shortlist</h2>
  <p style="color:#666;margin-top:0;">Top {len(matches)} match{'es' if len(matches) != 1 else ''} this week.</p>
  <table style="width:100%;border-collapse:collapse;">{rows}</table>
</div>"""


def send_digest(min_fit: float, top: int, from_address: str) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logging.info("RESEND_API_KEY not set — skipping digest emails (optional feature).")
        return

    users = fetch_user_emails()
    logging.info("Found %d users with an email on file", len(users))

    sent = 0
    for user_id, email in users.items():
        matches = fetch_matches_for_digest(user_id, min_fit, top)
        if not matches:
            continue

        resp = requests.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": from_address,
                "to": email,
                "subject": f"jobfit: {len(matches)} match{'es' if len(matches) != 1 else ''} this week",
                "html": _render_html(matches),
            },
            timeout=15,
        )
        if resp.status_code >= 300:
            logging.warning("Failed to email %s: %s", email, resp.text)
        else:
            sent += 1
            logging.info("Sent digest to %s (%d matches)", email, len(matches))

    logging.info("Sent %d digest email(s)", sent)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-fit", type=float, default=0.35)
    parser.add_argument("--top", type=int, default=10, help="Max matches to include per email")
    parser.add_argument(
        "--from-address",
        default="jobfit <onboarding@resend.dev>",
        help="Resend sender. onboarding@resend.dev works without a verified domain, for testing.",
    )
    args = parser.parse_args()
    send_digest(args.min_fit, args.top, args.from_address)


if __name__ == "__main__":
    main()

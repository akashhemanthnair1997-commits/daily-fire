# Daily Fire 🔥

A twice-daily essay agent. Researches a topic from your queue with live web search,
writes a 2,000-word philosophical essay in the house voice, and delivers it to your
inbox at **10:00 AM** (The Fire) and **7:30 PM IST** (The Ember).

## Setup (one time, ~15 minutes)

### 1. Topic queue — Google Sheets
1. Create a Google Sheet. Column A = topic, column B = optional note. Paste `topics.sample.csv` to start.
2. File → Share → **Publish to web** → select the sheet → format **CSV** → Publish. Copy the URL.
3. Append new topics to the bottom anytime (never insert above existing rows — order = schedule).

### 2. Email — Resend
1. Sign up free at resend.com → API Keys → create key.
2. No domain setup needed to start: mail sends from `onboarding@resend.dev` to your own address.

### 3. Images — TMDB (optional but recommended)
1. Free account at themoviedb.org → Settings → API → request a key (instant).
2. Film/TV topics get backdrop stills in the email, attributed to TMDB. Non-film topics get the typographic header.

### 4. Deploy
Push this repo to GitHub → import in Vercel → add Environment Variables:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key |
| `RESEND_API_KEY` | from step 2 |
| `TO_EMAIL` | your inbox |
| `TOPICS_CSV_URL` | from step 1 |
| `TMDB_API_KEY` | from step 3 (optional) |
| `LAUNCH_DATE` | today, e.g. `2026-06-12` |
| `CRON_SECRET` | any long random string |
| `FROM_EMAIL` | optional, after you verify a domain in Resend |

### 5. Test right now
```
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<your-app>.vercel.app/api/generate?slot=evening"
```
An essay lands in your inbox in ~2–3 minutes. Failures send you a ⚠️ email instead of dying silently.

## How scheduling works
No database. Essay number = days since `LAUNCH_DATE` × 2 (+1 for evening), mapped to the
sheet row. Two essays a day, in your sheet's order, wrapping around if it ever runs out.

## Phase 2 ideas (not built yet)
- Web archive of every essay on a /archive page (interactive: highlights, search)
- Reply-to-the-email to ask follow-up questions about an essay
- Weekly digest of the best passages

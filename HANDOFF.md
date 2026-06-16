# Daily Fire — Handoff / Working Notes

A twice-daily philosophical-essay agent. It researches a topic, writes a ~2,000-word
essay in a specific house voice, emails it, saves it to an installable PWA archive,
sends a push notification, and pulls a real public-domain image for each essay.

This document is for picking up active development. The product **works end to end**
(verified by live runs) but has **four open bugs** listed at the bottom, in priority order.

---

## Architecture

**Runtime:** Vercel serverless functions (Node 20, ESM). Project name on Vercel: `daily-fire`,
production URL `https://daily-fire-gold.vercel.app`.

**Flow per run** (`api/generate.js`):
1. Read topic queue: Google Sheet (published CSV) + app-added topics in Blob (`queue/topics.json`), concatenated.
2. Pick a topic by date/slot index (SEE BUG #2 — this logic is wrong).
3. Research pass — Claude (`claude-sonnet-4-6`) with `web_search` tool, returns a `===META===` JSON block.
4. Image-subject pass — if no `image_subject` from research, a dedicated short Claude call names one; final fallback derives it from the title.
5. Resolve images (`lib/images.js`): TMDB for film/TV, else Wikimedia Commons, else Met Museum. Hard timeouts; returns `[]` -> abstract header.
6. Writing pass — Claude writes the essay in the house voice (`lib/prompt.js`).
7. Render email (`lib/template.js`, pink-on-black) and send via Resend.
8. Save essay JSON to Blob at `essays/<date>-<slot>.json` (or `-test-<ts>.json` if `?test=1`).
9. Push notifications to all subscriptions in Blob `push/`; prune dead (404/410) ones.

**The app (PWA)** in `public/`:
- `index.html` — feed (cards: image, title, deck, read time), settings drawer (dark/light, notifications), add-topic (＋, PIN-gated).
- `read.html` — reader (progress bar, font size, tap-to-highlight).
- `sw.js` — service worker, offline cache (currently `df-*-v3`), push display.
- Reads essays from `GET /api/essays` (lists Blob `essays/`).

**Endpoints** (`api/`):
- `generate.js` — main agent. Auth: `Authorization: Bearer <CRON_SECRET>`. Query: `slot=morning|evening`, optional `test=1`.
- `essays.js` — lists saved essays for the feed (no-store).
- `subscribe.js` — GET returns VAPID public key; POST stores a push subscription.
- `topics.js` — GET merged queue; POST adds a topic (PIN-gated via `APP_PIN`).
- `reset-push.js` — GET `?pin=<APP_PIN>` wipes all push subscriptions.

**Scheduling:** `.github/workflows/scheduler.yml` (GitHub Actions cron) hits `generate`.
Vercel cron was removed from `vercel.json`. SEE BUG #3 — GitHub timing is unreliable.

## Environment variables (Vercel)
- `ANTHROPIC_API_KEY` — Claude API
- `RESEND_API_KEY` — email
- `TO_EMAIL` — recipient
- `TOPICS_CSV_URL` — published Google Sheet CSV
- `TMDB_API_KEY` — film/TV images
- `LAUNCH_DATE` — e.g. `2026-06-12`, anchors the date math
- `CRON_SECRET` — auth for generate; also a GitHub Actions repo **secret**
- `APP_PIN` — gates add-topic and reset-push
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — web push
- `BLOB_READ_WRITE_TOKEN` — auto-injected by the connected Blob store

## Local / deploy notes
- No build step. `npm i` for `@vercel/blob` and `web-push`.
- Deploy = push to `main`; Vercel auto-builds.
- Test a run: `https://daily-fire-gold.vercel.app/api/generate?slot=morning&test=1`
  returns diagnostics: `image_subject`, `image_count`, `is_film_or_tv`, `subjectError`.

---

## OPEN BUGS (priority order)

### BUG #1 — The app feed is down
Symptom: the PWA feed is not showing essays (was working earlier). Emails still arrive,
Blob still saves (notification deep-links work), so data exists — this is a front-end/
endpoint/service-worker issue, not a data-loss issue.
Likely suspects: `GET /api/essays` erroring (check `dynamic`/Blob list), or the `df-*-v3`
service worker serving a stale/broken shell. Note history: this endpoint was rewritten
several times; confirm the deployed version actually lists Blob and isn't a stub returning `[]`.
First step: hit `/api/essays` directly in a browser and inspect the JSON, then check SW caches.

### BUG #2 — Topic order is wrong / doesn't follow the sheet
Current logic (`api/generate.js`): `index = ((daySerial - launchSerial)*2 + (slot==='evening'?1:0)) % topics.length`.
Problems: it's confusing with manual/test runs, sheet edits shift everything, and the
app-queue appends after the sheet so ordering is opaque. Desired behavior (confirm with
the user): consume topics **in order, each once** — i.e. track a cursor / mark topics used,
rather than computing an index from the date. Consider storing a `cursor` in Blob and
incrementing it per non-test run; skip already-used topics.

### BUG #3 — Scheduled runs fire hours late or not at all
GitHub Actions `schedule:` cron is unreliable (observed: 10:00 IST run landed ~10:57; an
evening run didn't fire at all). Recommend moving to a dedicated cron (e.g. cron-job.org)
hitting the `generate` endpoint with the `Authorization: Bearer <CRON_SECRET>` header at
exact times, and removing the GitHub schedule to avoid double-fires. Keep `workflow_dispatch`
for manual runs. (First, verify the GitHub run failures aren't actually a 401 from a missing
`CRON_SECRET` repo secret — check the Actions run logs.)

### BUG #4 — Multiple images per essay (minor / preference)
Up to 3 images are attached. User may want exactly 1 hero image. Cap in `lib/images.js`
(`out.length >= 1`) or in the template/feed, per preference.

## Notes / nice-to-haves discussed
- House voice must be preserved exactly — see `lib/prompt.js`. Essays are long, prose-only,
  with `⸻` section breaks, opening in-scene, ending on a hard quotable line.
- Copyright: never reproduce song lyrics/poems; the Beatles topic must be handled by theme, not lyrics.
- Possible future: a "consume in order + mark used" queue UI in the app; weekly digest; reply-to-ask.

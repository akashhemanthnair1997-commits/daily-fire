# CLAUDE.md

Read `HANDOFF.md` first — it has the full architecture, env vars, and the prioritized
open bugs. Quick orientation below.

## What this is
A twice-daily philosophical-essay agent on Vercel (serverless, Node 20 ESM, no build step).
Researches a topic via Claude + web search, writes a ~2,000-word essay in a fixed house
voice, emails it (Resend), saves it to a PWA archive (Vercel Blob), pushes a notification,
and attaches a real public-domain image (TMDB / Wikimedia / Met).

Production: https://daily-fire-gold.vercel.app — deploy by pushing to `main`.

## Map
- `api/generate.js` — the agent (research → image → write → email → save → notify)
- `api/essays.js` — lists saved essays for the app feed
- `api/topics.js` / `api/subscribe.js` / `api/reset-push.js` — queue, push subs, push reset
- `lib/prompt.js` — the house voice (PRESERVE EXACTLY) + research/image-subject prompts
- `lib/images.js` — image resolver with timeouts and graceful fallback
- `lib/template.js` — pink-on-black email
- `public/` — the installable PWA (index/read/sw/manifest/icons)
- `.github/workflows/scheduler.yml` — cron (currently unreliable, see BUG #3)

## Test a run
`https://daily-fire-gold.vercel.app/api/generate?slot=morning&test=1`
(`test=1` writes a separate file so it won't overwrite a real slot). The JSON response
returns diagnostics: `image_subject`, `image_count`, `is_film_or_tv`, `subjectError`.

## Current priorities
1. App feed is down — fix `/api/essays` + service worker (data is intact in Blob).
2. Topic ordering is wrong — move to a consume-in-order/mark-used cursor, not date math.
3. Scheduler timing unreliable — likely move off GitHub Actions to a dedicated cron.
4. (minor) Cap images per essay to 1 if desired.

## Conventions
- Keep the house voice in `lib/prompt.js` intact.
- Never reproduce copyrighted lyrics/poems (e.g. the Beatles topic → themes only).
- Image lookups must never be able to break essay delivery — keep the timeouts/fallbacks.
- Silent `catch {}` blocks hid bugs before; prefer surfacing errors in responses/logs.

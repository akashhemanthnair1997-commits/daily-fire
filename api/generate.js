import { ESSAY_SYSTEM, SLOT_TONES, RESEARCH_SYSTEM } from "../lib/prompt.js";
import { renderEmail } from "../lib/template.js";
import { put } from "@vercel/blob";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// ---------- helpers ----------

function istDateParts(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return {
    dateStr: ist.toUTCString().slice(0, 16), // "Fri, 12 Jun 2026"
    daySerial: Math.floor(ist.getTime() / 86400000),
  };
}

function parseCsv(text) {
  // One topic per row; first column = topic, second (optional) = notes. Header row allowed.
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const out = [];
  for (const row of rows) {
    const cols = row.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (!cols[0]) continue;
    if (/^topic$/i.test(cols[0])) continue; // skip header
    out.push({ topic: cols[0], notes: cols[1] || "" });
  }
  return out;
}

async function anthropic(body) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

function textOf(msg) {
  return (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function tmdbImages(title, year) {
  const key = process.env.TMDB_API_KEY;
  if (!key || !title) return [];
  try {
    const q = new URLSearchParams({ api_key: key, query: title });
    if (year) q.set("year", year);
    let r = await fetch(`https://api.themoviedb.org/3/search/movie?${q}`);
    let data = await r.json();
    let hit = data.results?.[0];
    let kind = "movie";
    if (!hit) {
      const q2 = new URLSearchParams({ api_key: key, query: title });
      r = await fetch(`https://api.themoviedb.org/3/search/tv?${q2}`);
      data = await r.json();
      hit = data.results?.[0];
      kind = "tv";
    }
    if (!hit) return [];
    const imgRes = await fetch(
      `https://api.themoviedb.org/3/${kind}/${hit.id}/images?api_key=${key}`
    );
    const imgs = await imgRes.json();
    const backdrops = (imgs.backdrops || []).slice(0, 3);
    const name = hit.title || hit.name || title;
    return backdrops.map((b, i) => ({
      url: `https://image.tmdb.org/t/p/w780${b.file_path}`,
      alt: name,
      caption: i === 0 ? `${name} — images via TMDB` : name,
    }));
  } catch {
    return [];
  }
}

async function sendEmail({ subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || "Daily Fire <onboarding@resend.dev>",
      to: [process.env.TO_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------- handler ----------

export default async function handler(req, res) {
  try {
    // Auth: Vercel cron sends Authorization: Bearer CRON_SECRET automatically when set.
    const auth = req.headers["authorization"] || "";
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const slot = req.query.slot === "evening" ? "evening" : "morning";
    const { dateStr, daySerial } = istDateParts();

    // 1. Topic selection — deterministic by date, no database.
    //    Queue = Google Sheet rows followed by app-added topics (Blob).
    let topics = [];
    if (process.env.TOPICS_CSV_URL) {
      try {
        const csvRes = await fetch(process.env.TOPICS_CSV_URL, { cache: "no-store" });
        if (csvRes.ok) topics = parseCsv(await csvRes.text());
      } catch {}
    }
    try {
      const { list: listBlobs } = await import("@vercel/blob");
      const { blobs } = await listBlobs({ prefix: "queue/topics.json", limit: 1 });
      if (blobs.length) {
        const appTopics = await (await fetch(blobs[0].url)).json();
        if (Array.isArray(appTopics)) {
          topics = topics.concat(
            appTopics.map((t) => ({ topic: t.topic, notes: t.notes || "" }))
          );
        }
      }
    } catch {}
    if (!topics.length) throw new Error("Topic queue is empty — add topics in the app or the sheet.");

    const launchSerial = Math.floor(
      new Date(process.env.LAUNCH_DATE || "2026-06-12").getTime() / 86400000
    );
    const index =
      ((daySerial - launchSerial) * 2 + (slot === "evening" ? 1 : 0)) % topics.length;
    const { topic, notes } = topics[Math.max(0, index)];

    // 2. Research pass — Claude with live web search.
    const research = await anthropic({
      model: MODEL,
      max_tokens: 4000,
      system: RESEARCH_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: `Research this topic for a long-form philosophical essay: "${topic}"${
            notes ? `\nReader's note on it: ${notes}` : ""
          }`,
        },
      ],
    });
    const researchText = textOf(research);

    // Parse metadata block.
    let meta = { is_film_or_tv: false, search_title: "", year: "", essay_title: topic, deck: "" };
    const m = researchText.match(/===META===\s*([\s\S]*?)\s*===END===/);
    if (m) {
      try {
        meta = { ...meta, ...JSON.parse(m[1]) };
      } catch {}
    }
    const notesOnly = researchText.replace(/===META===[\s\S]*$/, "").trim();

    // 3. Writing pass.
    const essayMsg = await anthropic({
      model: MODEL,
      max_tokens: 8000,
      system: `${ESSAY_SYSTEM}\n\n${SLOT_TONES[slot]}`,
      messages: [
        {
          role: "user",
          content: `Topic: ${topic}\n${notes ? `Reader's note: ${notes}\n` : ""}\nResearch notes:\n${notesOnly}\n\nWrite the essay now. Output ONLY the essay prose (no title, no preamble).`,
        },
      ],
    });
    const essay = textOf(essayMsg).trim();

    // 4. Images (films/TV only, via TMDB).
    const images = meta.is_film_or_tv ? await tmdbImages(meta.search_title, meta.year) : [];

    // 5. Render + send.
    const words = essay.split(/\s+/).length;
    const readMins = Math.max(5, Math.round(words / 220));
    const html = renderEmail({
      slot,
      title: meta.essay_title || topic,
      deck: meta.deck || "",
      essay,
      images,
      dateStr,
      readMins,
    });
    const prefix = slot === "morning" ? "🔥" : "🕯️";
    const sent = await sendEmail({
      subject: `${prefix} ${meta.essay_title || topic}`,
      html,
    });

    // 6. Persist to Blob storage for the app archive.
    let blobUrl = null;
    try {
      const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
      const dateKey = istNow.toISOString().slice(0, 10);
      const record = {
        key: `${dateKey}-${slot}`,
        title: meta.essay_title || topic,
        deck: meta.deck || "",
        topic,
        slot,
        dateStr,
        date: dateKey,
        readMins,
        words,
        images,
        essay,
        savedAt: new Date().toISOString(),
      };
      const blob = await put(`essays/${dateKey}-${slot}.json`, JSON.stringify(record), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      blobUrl = blob.url;

      // 7. Push notifications to subscribed devices.
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        try {
          const webpush = (await import("web-push")).default;
          const { list } = await import("@vercel/blob");
          webpush.setVapidDetails(
            "mailto:" + (process.env.TO_EMAIL || "reader@example.com"),
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
          );
          const subs = await list({ prefix: "push/", limit: 100 });
          const payload = JSON.stringify({
            title: `${prefix} ${record.title}`,
            body: record.deck || topic,
            url: `/read.html?u=${encodeURIComponent(blobUrl)}`,
          });
          await Promise.allSettled(
            subs.blobs.map(async (b) => {
              const sub = await (await fetch(b.url)).json();
              return webpush.sendNotification(sub, payload);
            })
          );
        } catch (e) {
          console.error("Push failed:", e.message);
        }
      }
    } catch (e) {
      console.error("Blob save failed:", e.message);
    }

    return res.status(200).json({ ok: true, slot, topic, words, emailId: sent.id, blobUrl });
  } catch (err) {
    // Failure notice to your inbox so a silent miss never happens.
    try {
      await sendEmail({
        subject: "⚠️ Daily Fire failed",
        html: `<pre style="font-family:monospace">${String(err.message || err)}</pre>`,
      });
    } catch {}
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

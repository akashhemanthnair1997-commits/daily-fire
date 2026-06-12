import { put, list } from "@vercel/blob";

async function readBlobTopics() {
  try {
    const { blobs } = await list({ prefix: "queue/topics.json", limit: 1 });
    if (!blobs.length) return [];
    const data = await (await fetch(blobs[0].url)).json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const out = [];
  for (const row of rows) {
    const cols = row.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (!cols[0] || /^topic$/i.test(cols[0])) continue;
    out.push({ topic: cols[0], notes: cols[1] || "", source: "sheet" });
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      let sheet = [];
      if (process.env.TOPICS_CSV_URL) {
        try {
          const r = await fetch(process.env.TOPICS_CSV_URL, { cache: "no-store" });
          if (r.ok) sheet = parseCsv(await r.text());
        } catch {}
      }
      const app = (await readBlobTopics()).map((t) => ({ ...t, source: "app" }));
      return res.status(200).json({ ok: true, topics: [...sheet, ...app] });
    }

    if (req.method === "POST") {
      const { pin, topic, notes } = req.body || {};
      if (!process.env.APP_PIN || pin !== process.env.APP_PIN) {
        return res.status(401).json({ ok: false, error: "wrong PIN" });
      }
      if (!topic || !topic.trim()) {
        return res.status(400).json({ ok: false, error: "empty topic" });
      }
      const queue = await readBlobTopics();
      queue.push({ topic: topic.trim(), notes: (notes || "").trim(), addedAt: new Date().toISOString() });
      await put("queue/topics.json", JSON.stringify(queue), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true, count: queue.length });
    }

    return res.status(405).json({ error: "method" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

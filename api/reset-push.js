import { list, del } from "@vercel/blob";

// PIN-protected: wipes all stored push subscriptions so devices can re-register cleanly.
// Call once after the stale-subscription buildup, then re-toggle notifications on your phone.
export default async function handler(req, res) {
  const pin = req.query.pin || (req.body && req.body.pin);
  if (!process.env.APP_PIN || pin !== process.env.APP_PIN) {
    return res.status(401).json({ ok: false, error: "wrong PIN" });
  }
  try {
    const { blobs } = await list({ prefix: "push/", limit: 1000 });
    await Promise.allSettled(blobs.map((b) => del(b.url)));
    return res.status(200).json({ ok: true, cleared: blobs.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

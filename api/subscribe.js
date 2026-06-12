import { put, list } from "@vercel/blob";

// POST: save this device's push subscription. GET: VAPID public key for the client.
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || null });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: "bad subscription" });
    // One blob per device, keyed by a hash of the endpoint.
    let h = 0;
    for (const c of sub.endpoint) h = ((h * 31 + c.charCodeAt(0)) >>> 0);
    await put(`push/${h}.json`, JSON.stringify(sub), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

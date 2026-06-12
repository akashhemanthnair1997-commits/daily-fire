export default async function handler(req, res) {
  try {
    const { list } = await import("@vercel/blob");
    const result = await list({ prefix: "essays/" });
    const items = (result.blobs || [])
      .map((b) => ({ url: b.url, pathname: b.pathname }))
      .sort((a, b) => (a.pathname < b.pathname ? 1 : -1)); // newest first
    res.setHeader("cache-control", "no-store, max-age=0");
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    console.error("Essays list error:", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

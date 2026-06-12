import { list } from "@vercel/blob";

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: "essays/", limit: 1000 });
    const items = blobs
      .map((b) => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt }))
      .sort((a, b) => (a.pathname < b.pathname ? 1 : -1)); // filename = date-slot → desc
    res.setHeader("cache-control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

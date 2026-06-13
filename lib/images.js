// Resolves images for an essay from real, openly-licensed sources only.
// Film/TV -> TMDB stills. Everything else -> Wikimedia Commons, then Met Museum open-access.
// Returns [] when nothing good is found (the app/email then uses the abstract header).

// fetch with a hard timeout — image lookups must NEVER hang essay delivery.
async function tfetch(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function tmdbImages(title, year) {
  const key = process.env.TMDB_API_KEY;
  if (!key || !title) return [];
  try {
    const q = new URLSearchParams({ api_key: key, query: title });
    if (year) q.set("year", year);
    let r = await tfetch(`https://api.themoviedb.org/3/search/movie?${q}`);
    let data = await r.json();
    let hit = data.results?.[0];
    let kind = "movie";
    if (!hit) {
      const q2 = new URLSearchParams({ api_key: key, query: title });
      r = await tfetch(`https://api.themoviedb.org/3/search/tv?${q2}`);
      data = await r.json();
      hit = data.results?.[0];
      kind = "tv";
    }
    if (!hit) return [];
    const imgRes = await tfetch(`https://api.themoviedb.org/3/${kind}/${hit.id}/images?api_key=${key}`);
    const imgs = await imgRes.json();
    const backdrops = (imgs.backdrops || []).slice(0, 3);
    const name = hit.title || hit.name || title;
    return backdrops.map((b, i) => ({
      url: `https://image.tmdb.org/t/p/w780${b.file_path}`,
      alt: name,
      caption: i === 0 ? `${name} — via TMDB` : name,
    }));
  } catch {
    return [];
  }
}

// Wikimedia Commons. Step 1: search for file titles (relevance-ordered).
// Step 2: fetch imageinfo per-title for the top hits — avoids batch ordering,
// title-normalization, and the iiurlwidth+generator bug (T109125) all at once.
async function wikimediaImages(subject) {
  if (!subject) return [];
  try {
    const api = "https://commons.wikimedia.org/w/api.php";
    const sq = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      list: "search", srnamespace: "6", srsearch: subject, srlimit: "10",
    });
    const sr = await tfetch(`${api}?${sq}`);
    const sd = await sr.json();
    const titles = (sd?.query?.search || []).map((x) => x.title).filter(Boolean);
    if (!titles.length) return [];

    const out = [];
    for (const title of titles) {
      if (out.length >= 3) break;
      try {
        const iq = new URLSearchParams({
          action: "query", format: "json", origin: "*",
          titles: title, // single title — clean response, correct thumburl
          prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: "1000",
        });
        const ir = await tfetch(`${api}?${iq}`);
        const idata = await ir.json();
        const pageObj = idata?.query?.pages;
        const page = pageObj ? Object.values(pageObj)[0] : null;
        const info = page?.imageinfo?.[0];
        if (!info) continue;
        const src = info.thumburl || info.url;
        if (!src) continue;
        if (!/^image\/(jpeg|png)$/.test(info.mime || "")) continue;
        if ((info.width || 0) < 400) continue;
        const meta = info.extmetadata || {};
        const artist = (meta.Artist?.value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const credit = artist
          ? `${subject} — ${artist.slice(0, 60)}, via Wikimedia Commons`
          : `${subject} — via Wikimedia Commons`;
        out.push({ url: src, alt: subject, caption: credit });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

// Met Museum open-access: great for busts, paintings, historical artifacts.
async function metImages(subject) {
  if (!subject) return [];
  try {
    const s = await tfetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(subject)}`
    );
    const sd = await s.json();
    const ids = (sd.objectIDs || []).slice(0, 6);
    const out = [];
    for (const id of ids) {
      try {
        const o = await tfetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        const od = await o.json();
        if (od.isPublicDomain && od.primaryImage) {
          const who = od.artistDisplayName ? `${od.artistDisplayName}, ` : "";
          out.push({
            url: od.primaryImageSmall || od.primaryImage,
            alt: od.title || subject,
            caption: `${od.title || subject} — ${who}The Met`,
          });
        }
      } catch {}
      if (out.length >= 2) break;
    }
    return out;
  } catch {
    return [];
  }
}

// Main entry. meta comes from the research pass. Hard overall cap so images never delay delivery.
export async function resolveImages(meta) {
  try {
    return await Promise.race([
      _resolve(meta),
      new Promise((res) => setTimeout(() => res([]), 25000)), // 25s overall ceiling
    ]);
  } catch {
    return [];
  }
}

async function _resolve(meta) {
  if (meta.is_film_or_tv && meta.search_title) {
    const t = await tmdbImages(meta.search_title, meta.year);
    if (t.length) return t;
  }
  const subject = meta.image_subject || meta.search_title || "";
  if (subject) {
    const w = await wikimediaImages(subject);
    if (w.length) return w;
    const m = await metImages(subject);
    if (m.length) return m;
  }
  return []; // fall back to the abstract generative header
}

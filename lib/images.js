// Resolves images for an essay from real, openly-licensed sources only.
// Film/TV -> TMDB stills. Everything else -> Wikimedia Commons, then Met Museum open-access.
// Returns [] when nothing good is found (the app/email then uses the abstract header).

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
    const imgRes = await fetch(`https://api.themoviedb.org/3/${kind}/${hit.id}/images?api_key=${key}`);
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

// Wikimedia Commons: search files, return real, freely-licensed images of the subject.
async function wikimediaImages(subject) {
  if (!subject) return [];
  try {
    const api = "https://commons.wikimedia.org/w/api.php";
    const q = new URLSearchParams({
      action: "query", format: "json", origin: "*",
      generator: "search", gsrnamespace: "6", // File namespace
      gsrsearch: subject, gsrlimit: "8",
      prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: "1000",
    });
    const r = await fetch(`${api}?${q}`);
    const data = await r.json();
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    const out = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      if (!/^image\/(jpeg|png)$/.test(info.mime || "")) continue; // skip svg/gif/pdf
      if ((info.width || 0) < 500) continue; // skip tiny icons
      const meta = info.extmetadata || {};
      const artist = (meta.Artist?.value || "").replace(/<[^>]+>/g, "").trim();
      const credit = artist ? `${subject} — ${artist}, via Wikimedia Commons` : `${subject} — via Wikimedia Commons`;
      out.push({ url: info.thumburl || info.url, alt: subject, caption: credit });
      if (out.length >= 3) break;
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
    const s = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(subject)}`
    );
    const sd = await s.json();
    const ids = (sd.objectIDs || []).slice(0, 6);
    const out = [];
    for (const id of ids) {
      try {
        const o = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
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

// Main entry. meta comes from the research pass.
export async function resolveImages(meta) {
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

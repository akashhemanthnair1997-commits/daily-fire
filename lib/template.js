// Pink-on-black editorial email. Email-safe: tables, inline styles, no JS.
// Signature element: the pink em-rule divider (the "⸻" of the essays) and a hot-pink drop cap.

const PALETTE = {
  ink: "#0A0A0B",
  panel: "#141014",
  hot: "#FF2E88",
  deep: "#C2185B",
  soft: "#FF8FC2",
  body: "#F5E9EF",
  faint: "#8A7580",
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Convert the essay's markdown-ish prose to email HTML.
function essayToHtml(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let first = true;
  return blocks
    .map((b) => {
      if (/^⸻$/.test(b) || /^[-—⸻]{1,3}$/.test(b)) {
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 0;"><div style="width:64px;height:3px;background:${PALETTE.hot};font-size:0;line-height:0;">&nbsp;</div></td></tr></table>`;
      }
      let html = esc(b)
        .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${PALETTE.soft};">$1</strong>`)
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br/>");
      if (first) {
        first = false;
        const m = html.match(/^(<em>|<strong[^>]*>)*([A-Za-z“"])/);
        if (m) {
          const lead = m[2];
          html = html.replace(lead, `<span style="float:left;font-size:64px;line-height:0.85;padding:6px 10px 0 0;color:${PALETTE.hot};font-family:Georgia,'Times New Roman',serif;font-weight:700;">${lead}</span>`);
        }
      }
      return `<p style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.75;color:${PALETTE.body};">${html}</p>`;
    })
    .join("\n");
}

function imageBlock(images) {
  if (!images || images.length === 0) return "";
  return images
    .slice(0, 3)
    .map(
      (img, i) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:${i === 0 ? "0" : "10px"} 0 26px 0;">
  <img src="${esc(img.url)}" width="600" alt="${esc(img.alt || "")}" style="display:block;width:100%;max-width:600px;height:auto;border:1px solid ${PALETTE.deep};border-radius:4px;"/>
  ${img.caption ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1px;color:${PALETTE.faint};padding-top:8px;text-transform:uppercase;">${esc(img.caption)}</div>` : ""}
</td></tr></table>`
    )
    .join("\n");
}

export function renderEmail({ slot, title, deck, essay, images, dateStr, readMins }) {
  const edition = slot === "morning" ? "THE FIRE · MORNING EDITION" : "THE EMBER · EVENING EDITION";
  const accent = slot === "morning" ? PALETTE.hot : PALETTE.deep;
  const heroImages = images && images.length ? images : [];
  const [hero, ...rest] = heroImages;

  // Interleave remaining images roughly mid-essay.
  const essayHtml = essayToHtml(essay);
  let bodyHtml = essayHtml;
  if (rest.length) {
    const parts = essayHtml.split(/(<table[^>]*>[\s\S]*?<\/table>)/); // split on dividers
    const mid = Math.floor(parts.length / 2);
    parts.splice(mid, 0, imageBlock(rest));
    bodyHtml = parts.join("");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${PALETTE.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.ink};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="padding-bottom:18px;border-bottom:3px solid ${accent};">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;color:${accent};font-weight:700;">${edition}</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1px;color:${PALETTE.faint};padding-top:6px;">${esc(dateStr)} &nbsp;·&nbsp; ${readMins} MIN READ</div>
  </td></tr>

  <tr><td style="padding:34px 0 8px 0;">
    <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.15;color:${PALETTE.body};font-weight:700;">${esc(title)}</h1>
  </td></tr>
  <tr><td style="padding:0 0 30px 0;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;color:${PALETTE.soft};line-height:1.5;">${esc(deck)}</div>
  </td></tr>

  ${hero ? `<tr><td>${imageBlock([hero])}</td></tr>` : ""}

  <tr><td style="padding-top:6px;">${bodyHtml}</td></tr>

  <tr><td align="center" style="padding:18px 0 8px 0;">
    <div style="width:64px;height:3px;background:${accent};font-size:0;">&nbsp;</div>
  </td></tr>
  <tr><td align="center" style="padding:10px 0 40px 0;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:${PALETTE.faint};">DAILY FIRE — WRITTEN FOR ONE READER</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

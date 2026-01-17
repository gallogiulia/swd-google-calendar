// pages/api/tournaments.js
let CACHE = { t: 0, d: null, key: "" };
const TTL = (Number(process.env.GCAL_CACHE_MINUTES || 10)) * 60 * 1000;

// Put your published CSV URL in Vercel env as TOURNAMENTS_INDEX_CSV_URL
// Example: https://docs.google.com/spreadsheets/d/e/.../pub?output=csv
const INDEX_CSV_URL = process.env.TOURNAMENTS_INDEX_CSV_URL;

function parseCsv(csvText) {
  // Minimal CSV parser that supports quoted fields and commas inside quotes.
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }

  // last cell
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  // trim whitespace
  return rows.map(r => r.map(c => String(c ?? "").trim()));
}

function normalizeGender(g) {
  const s = String(g || "").trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("w")) return "Women";
  if (s.startsWith("m") && !s.startsWith("mi")) return "Men";
  if (s.startsWith("mix")) return "Mixed";
  if (s.startsWith("club")) return "Club";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function handler(req, res) {
  try {
    if (!INDEX_CSV_URL) {
      return res.status(500).json({
        error: "Missing TOURNAMENTS_INDEX_CSV_URL",
        details: "Set TOURNAMENTS_INDEX_CSV_URL to your published Google Sheet CSV URL."
      });
    }

    const now = Date.now();
    const cacheKey = "index_csv";

    if (CACHE.d && CACHE.key === cacheKey && now - CACHE.t < TTL) {
      return res.status(200).json(CACHE.d);
    }

    const r = await fetch(INDEX_CSV_URL);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(500).json({
        error: "Failed to fetch index CSV",
        details: `HTTP ${r.status} ${r.statusText}\n${txt.slice(0, 500)}`
      });
    }

    const csv = await r.text();
    const rows = parseCsv(csv).filter(r => r.some(c => c && c.trim()));

    if (!rows.length) {
      return res.status(200).json({ tournaments: [] });
    }

    // Expect header: Name, URL, Gender, Year (case-insensitive)
    const header = rows[0].map(h => h.toLowerCase());
    const idxName = header.indexOf("name");
    const idxUrl = header.indexOf("url");
    const idxGender = header.indexOf("gender");
    const idxYear = header.indexOf("year");

    if (idxName < 0 || idxUrl < 0) {
      return res.status(500).json({
        error: "Index sheet header mismatch",
        details: `First row must include at least: Name, URL (and optionally Gender, Year). Got: ${rows[0].join(" | ")}`
      });
    }

    const tournaments = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = (r[idxName] || "").trim();
      const url = (r[idxUrl] || "").trim();
      if (!name || !url) continue;

      const gender = idxGender >= 0 ? normalizeGender(r[idxGender]) : "";
      const yearRaw = idxYear >= 0 ? (r[idxYear] || "").trim() : "";
      const year = yearRaw ? Number(yearRaw) : null;

      tournaments.push({
        name,
        url,
        gender: gender || "Other",
        year: Number.isFinite(year) ? year : null
      });
    }

    const payload = { tournaments };

    CACHE = { t: now, d: payload, key: cacheKey };
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({
      error: "Tournaments API failed",
      details: String(err?.message || err)
    });
  }
}

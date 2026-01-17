// pages/api/tournaments.js
let CACHE = { t: 0, d: null };
const TTL = (Number(process.env.GCAL_CACHE_MINUTES || 10)) * 60000;

/**
 * Required env vars:
 * - TOURNAMENTS_SHEET_ID   (the Google Sheet ID that contains the index table)
 * - TOURNAMENTS_SHEET_NAME (tab name, e.g. "Index")
 * - GCAL_API_KEY           (reused here as a simple public Sheets API key)
 *
 * Your index sheet should have a header row with columns like:
 * Name | Year | Type | Category | Gender | Location | URL
 *
 * This API reads columns A..G by default.
 */

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (CACHE.d && now - CACHE.t < TTL) return res.status(200).json(CACHE.d);

    const key = process.env.GCAL_API_KEY; // reuse
    const sheetId = process.env.TOURNAMENTS_SHEET_ID;
    const sheetName = process.env.TOURNAMENTS_SHEET_NAME || "Index";

    if (!key) return res.status(500).json({ error: "Missing GCAL_API_KEY" });
    if (!sheetId) return res.status(500).json({ error: "Missing TOURNAMENTS_SHEET_ID" });

    // Read A:G (adjust if you want more columns)
    const range = encodeURIComponent(`${sheetName}!A:G`);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}` +
      `?key=${encodeURIComponent(key)}&majorDimension=ROWS`;

    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(500).json({ error: "Sheets API failed", details: txt || r.statusText });
    }

    const j = await r.json();
    const rows = j.values || [];
    if (rows.length < 2) {
      const out = { tournaments: [] };
      CACHE = { t: now, d: out };
      return res.status(200).json(out);
    }

    const header = rows[0].map(h => String(h || "").trim().toLowerCase());
    const idx = (name, fallback) => {
      const i = header.indexOf(name);
      return i >= 0 ? i : fallback;
    };

    const iName = idx("name", 0);
    const iYear = idx("year", 1);
    const iType = idx("type", 2);
    const iCategory = idx("category", 3);
    const iGender = idx("gender", 4);
    const iLoc = idx("location", 5);
    const iUrl = idx("url", 6);

    const tournaments = rows.slice(1)
      .map((r) => {
        const get = (i) => String((r && r[i]) ? r[i] : "").trim();
        return {
          name: get(iName),
          year: get(iYear),
          type: get(iType),
          category: get(iCategory),
          gender: get(iGender),
          location: get(iLoc),
          url: get(iUrl)
        };
      })
      .filter(t => t.name && t.url);

    // Sort: year desc (if numeric), then name
    tournaments.sort((a, b) => {
      const ay = Number(a.year);
      const by = Number(b.year);
      const aNum = Number.isFinite(ay);
      const bNum = Number.isFinite(by);
      if (aNum && bNum && ay !== by) return by - ay;
      if (aNum !== bNum) return bNum - aNum;
      return a.name.localeCompare(b.name);
    });

    const out = { tournaments };
    CACHE = { t: now, d: out };
    return res.status(200).json(out);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed", details: String(err?.message || err) });
  }
}

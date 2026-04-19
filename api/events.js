let CACHE = { t: 0, d: null, key: "" };
const TTL = (Number(process.env.GCAL_CACHE_MINUTES || 2)) * 60000;
const IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"
];

const CALENDAR_META = {
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com": { color: "#2563eb", source: "Club Sponsored" },
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": { color: "#7c3aed", source: "Other" },
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": { color: "#dc2626", source: "Men's" },
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": { color: "#059669", source: "Women's" },
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": { color: "#f59e0b", source: "PBA USA" }
};

// IMPROVED: Strips out Google's hidden HTML tags so the link stays clean
function extractUrl(text) {
  if (!text) return null;
  // This regex finds the URL even if it's trapped inside an <a> tag
  const urlRegex = /(https?:\/\/[^\s"<]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

// Fetch events-data.json from the deployed site so each GCal event can be
// enriched with a matching tournament's deadline + fee. Cache across calls.
let DATA_CACHE = { t: 0, data: null };
async function loadDataEntries() {
  const now = Date.now();
  if (DATA_CACHE.data && now - DATA_CACHE.t < TTL) return DATA_CACHE.data;
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://swd-google-calendar.vercel.app";
  try {
    const r = await fetch(`${base}/events-data.json`, { cache: "no-store" });
    if (!r.ok) return DATA_CACHE.data || [];
    const j = await r.json();
    const list = (j.events || []).filter((e) => e && e.title);
    DATA_CACHE = { t: now, data: list };
    return list;
  } catch {
    return DATA_CACHE.data || [];
  }
}

function normTitle(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Return the events-data.json entry that best matches this GCal event title.
// Uses >=4-char word overlap + bonus for shared "sw open" phrase (so SW Open
// events, whose titles are otherwise all generic words, still line up).
function matchDataEntry(eventTitle, dataEntries) {
  const ev = normTitle(eventTitle);
  if (!ev) return null;
  const evWords = new Set(ev.split(" ").filter((w) => w.length >= 4));
  const evHasSwOpen = /\bsw\s+open\b/.test(ev);

  let best = null;
  let bestScore = 0;
  for (const entry of dataEntries) {
    const en = normTitle(entry.title);
    let score = 0;
    for (const w of en.split(" ")) if (w.length >= 4 && evWords.has(w)) score++;
    if (evHasSwOpen && /\bsw\s+open\b/.test(en)) score += 2;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore >= 2 ? best : null;
}

function yearWindow(year) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { start, end };
}

function addDaysISO(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function (req, res) {
  const now = Date.now();
  const year = Number(req.query.year || "");
  const days = Number(req.query.days || 180);
  const cacheKey = year ? `year:${year}` : `days:${days}`;

  const bypass = req.query.refresh === "1" || req.query.refresh === "true";
  if (!bypass && CACHE.d && CACHE.key === cacheKey && now - CACHE.t < TTL) return res.json(CACHE.d);
  if (!process.env.GCAL_API_KEY) return res.status(500).json({ error: "Missing key" });

  let min, max;
  if (year && Number.isFinite(year)) {
    const w = yearWindow(year);
    min = w.start.toISOString();
    max = w.end.toISOString();
  } else {
    min = new Date().toISOString();
    max = new Date(Date.now() + days * 86400000).toISOString();
  }

  const dataEntries = await loadDataEntries();

  let ev = [];
  for (const id of IDS) {
    const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?key=${process.env.GCAL_API_KEY}&timeMin=${min}&timeMax=${max}&singleEvents=true&orderBy=startTime`;
    const r = await fetch(u);
    if (!r.ok) continue;
    const j = await r.json();

    (j.items || []).forEach(e => {
      const isAllDay = !!e.start?.date;
      const startDate = isAllDay ? e.start.date : (e.start?.dateTime ? e.start.dateTime.split("T")[0] : "");
      if (!startDate) return;

      let endDate = "";
      if (isAllDay) {
        endDate = e.end?.date || "";
        if (!endDate || endDate <= startDate) endDate = addDaysISO(startDate, 1);
      } else {
        endDate = addDaysISO(startDate, 1);
      }

      // Check Description first, then Location field for links
      const finalEventUrl = extractUrl(e.description) || extractUrl(e.location) || null;

      const meta = CALENDAR_META[id] || { color: "#2563eb", source: "Other" };
      const dataMatch = matchDataEntry(e.summary || "", dataEntries);
      ev.push({
        id: e.id,
        title: e.summary || "",
        start: startDate,
        end: endDate,
        allDay: true,
        location: e.location || "",
        description: e.description || "",
        eventUrl: finalEventUrl,
        color: meta.color,
        source: meta.source,
        deadline: dataMatch ? (dataMatch.deadline || null) : null,
        fee: dataMatch ? (dataMatch.fee || null) : null,
      });
    });
  }
  ev.sort((a, b) => new Date(a.start) - new Date(b.start));
  CACHE = { t: now, d: { events: ev }, key: cacheKey };
  res.json(CACHE.d);
}
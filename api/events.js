/**
 * Vercel Serverless Function
 * GET /api/events?days=180
 */

const DEFAULT_CAL_IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"
];


const calendarIds = (process.env.GCAL_CALENDAR_IDS ? process.env.GCAL_CALENDAR_IDS.split(',') : DEFAULT_CAL_IDS)
  .map(s => (s || '').trim())
  .filter(Boolean);

function getEnv(name, fallback) {
  const v = process.env[name];
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function parseCalendarIds(raw) {
  return String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function isoNow() { return new Date().toISOString(); }

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function fetchCalendarEvents({ apiKey, calendarId, timeMin, timeMax, maxResults, tz }) {
  const base = "https://www.googleapis.com/calendar/v3/calendars/";
  const url = new URL(base + encodeURIComponent(calendarId) + "/events");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", String(maxResults));
  // timeZone influences some fields; safe to set
  url.searchParams.set("timeZone", tz);

  const resp = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Google Calendar API error for ${calendarId}: ${resp.status} ${txt}`);
  }
  const data = await resp.json();

  const items = Array.isArray(data.items) ? data.items : [];
  return items.map(it => {
    const isAllDay = !!it.start?.date && !it.start?.dateTime;
    const start = isAllDay ? it.start.date : it.start.dateTime;
    const end = isAllDay ? it.end?.date : it.end?.dateTime;

    return {
      id: `${calendarId}:${it.id}`,
      title: it.summary || "",
      start,
      end,
      allDay: isAllDay,
      location: it.location || "",
      description: it.description || "",
      htmlLink: it.htmlLink || "",
      source: calendarId
    };
  });
}

function dedupeAndSort(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const key = e.id || `${e.title}|${e.start}|${e.end}|${e.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a,b) => {
    const as = a.start || "";
    const bs = b.start || "";
    return as.localeCompare(bs);
  });
  return out;
}


export default async function handler(req, res) {
  try {
    const apiKey = getEnv("GCAL_API_KEY", null);
    const ids = parseCalendarIds(getEnv("GCAL_CALENDAR_IDS", ""));
    const idsFinal = ids.length ? ids : DEFAULT_CAL_IDS;
    const tz = getEnv("GCAL_TZ", "America/Los_Angeles");
    const daysDefault = Number(getEnv("GCAL_DAYS_DEFAULT", "180"));
    const maxResults = Number(getEnv("GCAL_MAX_RESULTS", "250"));

    if (!apiKey) {
      return res.status(500).json({ error: "Missing env var GCAL_API_KEY" });
    }
    if (!idsFinal.length) {
      return res.status(500).json({ error: "No calendar IDs available" });
    }

    const days = Math.max(1, Math.min(3650, Number(req.query.days || daysDefault)));
    const timeMin = isoNow();
    const timeMax = addDays(new Date(), days).toISOString();

    const all = [];
    for (const calendarId of idsFinal) {
      const evs = await fetchCalendarEvents({
        apiKey, calendarId, timeMin, timeMax, maxResults, tz
      });
      all.push(...evs);
    }

    const events = dedupeAndSort(all);

    // Cache at edge/CDN for 5 minutes (tune as needed)
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      calendars: ids.length,
      rangeDays: days,
      events
    });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}

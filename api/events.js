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

// Fetch events-data.json over HTTP so each GCal event can be enriched with a
// matching tournament's deadline + fee. Cached per TTL.
let DATA_CACHE = { t: 0, data: null, diag: "" };
async function loadDataEntries() {
  const now = Date.now();
  if (DATA_CACHE.data && now - DATA_CACHE.t < TTL) return DATA_CACHE;
  const url = "https://swd-google-calendar.vercel.app/events-data.json";
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      DATA_CACHE = { t: now, data: [], diag: `status=${r.status}` };
      return DATA_CACHE;
    }
    const j = await r.json();
    const list = (j.events || []).filter((e) => e && e.title);
    DATA_CACHE = { t: now, data: list, diag: `loaded=${list.length}` };
    return DATA_CACHE;
  } catch (err) {
    DATA_CACHE = { t: now, data: [], diag: `error=${err.message || "unknown"}` };
    return DATA_CACHE;
  }
}

function normTitle(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Map a Google Calendar event title to its events-data.json entry.
//
// This used to guess by counting shared words, but bowls titles are built from the
// same small vocabulary ("Mixed", "Pairs", "Triples", "Women's"), so it mismatched
// badly — Men's SW Open events resolved to the Women's SW Open entry, Bill Hiscock
// to John Clark, and Sun City inherited an April deadline from Vet/Novice Triples.
// The mapping is explicit instead: a calendar title either has a known entry or it
// has none. Events with no entry (external and non-SWD events, and tournaments that
// have no detail page yet) are intentionally absent — no entry beats a wrong one.
//
// Keys are normalised titles: lowercased, punctuation stripped, and any trailing
// "(venue)" or date range removed. Add a line here when a tournament gets a page.
const TITLE_TO_ID = {
  "swd mumma mixed pairs": "mumma-mixed-pairs-2026",
  "swlba so cal rinks": "mens-southern-california-rinks-championship-2026",
  "swd california 5s": "womens-cal-5s-2026",
  "swlba mixed pairs": "mixed-pairs-2026",
  "swlba mens murray allison singles": "mens-murray-allison-singles-2026",
  "swd heidi rittner womens australian pairs": "womens-heidi-rittner-australian-pairs-2026",
  "swd heidi rittner womens australian pairs rescheduled": "womens-heidi-rittner-australian-pairs-2026",
  "swd womens vet novice mix match triples": "vet-novice-mix-match-triples-2026",
  "swlba mens novice singles": "mens-novice-singles-2026",
  "swd womens novice singles": "womens-novice-singles-2026",
  "2026 sw open mens fours": "mens-southwest-division-open-2026",
  "2026 sw open mens pairs": "mens-southwest-division-open-2026",
  "2026 sw open mens singles": "mens-southwest-division-open-2026",
  "2026 sw open womens rinks": "womens-sw-open-2026",
  "2026 sw open womens pairs": "womens-sw-open-2026",
  "2026 sw open womens singles": "womens-sw-open-2026",
  "2026 sw open 2 2 getaway rinks": "open-2-2-getaway-rinks-2026",
  "joe siegman pairs": "joe-siegman-pairs-2026",
  "friendly valley mix match triples": "friendly-valley-mix-match-triples-2026",
  "24th jack beckley friendship tournament": "jack-beckley-friendship-tournament-2026",
  "bhlbc disney pairs tournament": "bhlbc-disney-pairs-2026",
  "john clark triples": "john-clark-2-bowls-triples-2026",
  "coronado crown city classic": "coronado-crown-city-cup-2026",
  "pat gonzales mixed australian pairs": "pat-gonzales-mixed-aussie-pairs-2026",
  "amador martinez triples": "martinez-triples-2026",
  "senior pairs": "truvic-seniors-3-bowls-pairs-2026",
  "us nationals mens singles playdowns": "mens-us-nationals-singles-playdowns-2026",
  "us nationals womens singles playdowns": "womens-us-nationals-singles-playdowns-2026",
  "us nationals pairs playdowns men": "mens-us-nationals-pairs-playdowns-2026",
  "us nationals pairs playdowns women": "womens-us-nationals-pairs-playdowns-2026",
  "swlba mens novice pairs": "mens-novice-pairs-2026",
  "cambria pairs": "cambria-open-pairs-2026",
  "swlba cary macdonald mens pairs": "cary-macdonald-mens-pairs-2026",
  "swd womens division rinks": "womens-division-rinks-2026",
  "fossati friends womens triples": "fossati-friends-womens-triples-2026",
  "laguna beach open pairs": "laguna-open-pairs-2026",
  "san diego mixed triples": "san-diego-mixed-triples-2026",
  "eileen morton triples": "eileen-morton-powerplay-triples-2026",
  "hermosa beach all comers pairs": "all-comers-open-pairs-2026",
  "newport 9 11 mixed rinks": "newport-911-mixed-rinks-2026",
  "maccabee pairs": "maccabee-pairs-2026",
  "swd izzie forbes vet novice mix match triples": "izzie-forbes-vet-novice-triples-2026",
  "ralph ecton triples": "ralph-ecton-triples-2026",
  "oaks north mixed triples": "oaks-north-mixed-triples-2026",
  "swlba men so california triples": "mens-so-california-triples-2026",
  "swd womens vet novice pairs": "womens-vet-novice-pairs-2026",
  "swd womens vet novice triples": "womens-vet-novice-triples-2026",
  "swd womens vet novice triples rescheduled": "womens-vet-novice-triples-2026",
  "swd womens ca bears": "womens-ca-bears-2026",
  "the groves mixed triples": "groves-mixed-triples-2026",
  "bill hiscock 2 bowl triples": "bill-hiscock-mixed-triples-2026",
  "waterbury": "waterbury-2026",
  "swlba men 5 man all star": "mens-5-man-all-star-2026",
  "swlba men vet novice mix match pairs sun city": "mens-vet-novice-mix-match-pairs-2026",
  "swlba men vet novice mix match pairs laguna beach": "mens-vet-novice-mix-match-pairs-2026",
  "men vet novice mix match pairs mackenzie park": "mens-vet-novice-mix-match-pairs-2026",
  "swd womens singles katy stone": "swd-womens-singles-katy-stone-2026",
  "us national mens singles playdowns continue": "mens-us-nationals-singles-playdowns-2026",
};

// Strip any trailing date range, then normalise. Parentheticals are KEPT:
// "(Men)" vs "(Women)" is all that separates the two Pairs Playdowns titles.
function aliasKey(title) {
  return normTitle(
    String(title || "")
      .replace(/\b\d{1,2}\/\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}\b/g, "")
  );
}

function matchDataEntry(eventTitle, dataEntries) {
  const id = TITLE_TO_ID[aliasKey(eventTitle)];
  if (!id) return null;
  return dataEntries.find((e) => e.id === id) || null;
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

  const dataBundle = await loadDataEntries();
  const dataEntries = dataBundle.data || [];

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

      const meta = CALENDAR_META[id] || { color: "#2563eb", source: "Other" };
      const dataMatch = matchDataEntry(e.summary || "", dataEntries);

      // Check Description first, then Location field for links. Never invent one:
      // on the season agenda a link means "entries are open", and GG curates that by
      // adding or removing the link on the calendar entry. No link means not open.
      const finalEventUrl = extractUrl(e.description) || extractUrl(e.location) || null;
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
  const payload = { events: ev, _dataDiag: dataBundle.diag || "" };
  CACHE = { t: now, d: payload, key: cacheKey };
  res.json(payload);
}
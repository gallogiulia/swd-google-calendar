import { google } from "googleapis";

const CALENDAR_IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com",
];

// Implicit gender signal from the source calendar — GCal event titles often
// omit "Men's"/"Women's" because the calendar itself conveys it.
const CALENDAR_GENDER = {
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com": null,    // Club Sponsored
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": null,    // Other
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": "men",   // Men's
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": "women", // Women's
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": null,    // PBA
};

const BASE_SITE = "https://www.swlawnbowls.org";
const LISTING_URL = `${BASE_SITE}/2026-tournaments-events`;
const CURRENT_YEAR = "2026";

// Hard block these known-bad URLs (belt + suspenders)
const HARD_BLOCK = new Set([
  `${BASE_SITE}/2026-tournaments-events/2025-cambria-pairs`,
  `${BASE_SITE}/2026-tournaments-events/2025newport911`,
  `${BASE_SITE}/2026-tournaments-events/2025-oaks-north-mixed-triples`,
  `${BASE_SITE}/2026-tournaments-events/2025-bill-hiscock-2-bowl-triples`,
  `${BASE_SITE}/2026-tournaments-events/2025-ralph-ecton-triples`,
]);

// ------------------------
// Helpers
// ------------------------
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\b(20\d{2})\b/g, "")        // strip 4-digit years like "2026"
    .replace(/\b\d+(st|nd|rd|th)\b/g, "") // strip ordinals like "22nd", "24th"
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Slugs that clearly point at a past-year tournament page
function isStaleSlug(slug) {
  return /^(2024|2025|24|25)(-|[a-z0-9])/.test(slug || "");
}

// Titles whose text mentions an older year and not the current one
function isStaleTitle(title) {
  const t = (title || "").toLowerCase();
  return /\b202[0-5]\b/.test(t) && !new RegExp(`\\b${CURRENT_YEAR}\\b`).test(t);
}

// Decode a small set of common HTML entities
function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ");
}

function slugFromUrl(url) {
  const parts = (url || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function normalizeSquarespaceUrl(href) {
  if (!href) return null;

  let url = href.startsWith("http")
    ? href
    : `${BASE_SITE}${href.startsWith("/") ? "" : "/"}${href}`;

  url = url.split("#")[0].split("?")[0];

  if (!url.includes("/2026-tournaments-events/")) return null;

  if (url.endsWith("/2026-tournaments-events") || url.endsWith("/2026-tournaments-events/")) return null;

  return url;
}

async function isLiveUrl(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

// Parse the Squarespace event-list HTML for (url, title) pairs.
// The listing renders each tournament as
//   <a class="eventlist-title-link" href="/2026-tournaments-events/...">TITLE</a>
// which is a much more reliable match name than the URL slug (many slugs are
// opaque auto-generated ids or missing the "2026-" prefix entirely).
function parseEventListEntries(html) {
  const entries = [];
  const re = /<a\s+[^>]*class="eventlist-title-link"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const hrefMatch = m[0].match(/href="([^"]+)"/);
    if (!hrefMatch) continue;
    const url = normalizeSquarespaceUrl(hrefMatch[1]);
    if (!url) continue;
    const text = decodeEntities(m[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length < 4) continue;
    entries.push({ url, title: text });
  }
  return entries;
}

// Extract ONLY SWLawnBowls collection URLs from text.
function extractTournamentUrls(text) {
  const s = text || "";
  const re =
    /https?:\/\/www\.swlawnbowls\.org\/2026-tournaments-events\/[^\s<>"')\]]+/g;
  return [...new Set(s.match(re) || [])].map((u) => u.split("#")[0].split("?")[0]);
}

// Is there a URL in the description that is NOT part of the
// /2026-tournaments-events/ collection? (e.g. a mini-site like /2026swo.)
// If so, the user has manually linked somewhere else and we should leave
// the description alone rather than overwrite their intent.
function hasManualNonCollectionUrl(text) {
  const all = (text || "").match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  return all.some((u) => !u.includes("/2026-tournaments-events/"));
}

// Load events-data.json from the deployed site so the cron can inject
// per-tournament deadlines into GCal event descriptions. GG maintains
// this file via the Event Publisher; every published entry has a
// `deadline` field (e.g. "Entry deadline: Friday, April 11, 2026").
async function fetchEventsData() {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://swd-google-calendar.vercel.app";
  try {
    const r = await fetch(`${base}/events-data.json`, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || [])
      .filter((e) => e && e.title && e.deadline)
      .map((e) => ({ name: e.title, deadline: e.deadline }));
  } catch {
    return [];
  }
}

// Strip cron-managed "Deadline: ..." and "Registration: ..." lines so a
// fresh pair can be re-emitted. User-authored description content is
// otherwise left alone.
function stripManagedLines(desc) {
  if (!desc) return "";
  return desc
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:entry\s*)?deadline\s*[:\-]/i.test(line))
    .filter((line) => !/^\s*registration\s*[:\-]\s*https?:\/\//i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Remove ALL /2026-tournaments-events/ URLs so a fresh, correct URL can
// be attached. Used when the matcher has a confident replacement.
function stripAllTournamentUrls(description) {
  const urls = extractTournamentUrls(description);
  if (!urls.length) return { cleaned: description || "", removed: [] };

  let cleaned = description || "";
  for (const url of urls) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\s*${escaped}\\s*\\n?`, "g"), "\n");
  }
  cleaned = cleaned.replace(/^\s*Registration:\s*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, removed: urls };
}

// Remove ONLY URLs that are disallowed (HARD_BLOCK or stale-year slug).
// Used when the matcher has nothing to replace with — we still want to
// clean out known-bad URLs but preserve anything legitimate.
function stripDisallowedTournamentUrls(description) {
  const urls = extractTournamentUrls(description);
  if (!urls.length) return { cleaned: description || "", removed: [] };

  const removed = [];
  let cleaned = description || "";

  for (const url of urls) {
    const slug = slugFromUrl(url);
    const disallowed = HARD_BLOCK.has(url) || isStaleSlug(slug);

    if (disallowed) {
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleaned = cleaned.replace(new RegExp(`\\s*${escaped}\\s*\\n?`, "g"), "\n");
      removed.push(url);
    }
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, removed };
}

// Scrape Squarespace listing -> return live 2026 tournament entries.
// Uses the listing's own <a class="eventlist-title-link"> anchors so the match
// name is the human-readable title ("2026 Joe Siegman Pairs") rather than an
// opaque slug ("fpplunwh37kg2txohzdqaljob3f8yw-68nys").
async function scrapeSquarespaceLinksAllowedOnly() {
  const response = await fetch(LISTING_URL, { redirect: "follow", cache: "no-store" });
  const html = await response.text();

  const rawEntries = parseEventListEntries(html);

  // De-dupe by URL (keep first occurrence)
  const byUrl = new Map();
  for (const e of rawEntries) if (!byUrl.has(e.url)) byUrl.set(e.url, e);

  const candidates = [...byUrl.values()].filter((e) => {
    if (HARD_BLOCK.has(e.url)) return false;
    if (isStaleSlug(slugFromUrl(e.url))) return false;
    if (isStaleTitle(e.title)) return false;
    return true;
  });

  const allowedLinks = [];
  const LIVENESS_CONCURRENCY = 10;
  for (let i = 0; i < candidates.length; i += LIVENESS_CONCURRENCY) {
    const chunk = candidates.slice(i, i + LIVENESS_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (e) => ({ ...e, live: await isLiveUrl(e.url) }))
    );
    for (const r of results) {
      if (r.live) allowedLinks.push({ name: r.title, url: r.url, slug: slugFromUrl(r.url) });
    }
  }
  return allowedLinks;
}

// Generic tournament vocabulary that is NOT on its own a useful signal for matching.
// A link whose name contains *only* these words will never be attached — it is too
// ambiguous. A valid match must share at least one distinctive word (length >= 4)
// with the event summary.
// Words that are tournament vocabulary but not distinguishing on their own.
// "Required" word matching excludes these — otherwise the matcher would
// demand the event title repeat words like "mens" or "triples" that GCal
// titles typically omit.
const GENERIC_WORDS = new Set([
  "tournament","tournaments","classic","cup","trophy","challenge","memorial","annual",
  "open","invitational","championship","championships","event","events",
  "swd","pba","usa","bowls","lawn","club","clubs",
  "men","mens","women","womens","ladies","mixed","coed",
  "singles","pairs","triples","fours","five","all","star",
  "draw","draws","master","masters",
  "day","days","season","the","and","for"
]);

// word-boundary test: "pairs" should not match "pairings"
function hasWord(haystack, word) {
  return new RegExp(`(^|\\s)${word}(?=$|\\s)`).test(haystack);
}

function requiredWordsOf(name) {
  return normalizeText(name)
    .split(" ")
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
}

function detectGender(text) {
  const t = normalizeText(text);
  // Strongest signals first: explicit gender words beat organisation abbreviations.
  if (hasWord(t, "men") || hasWord(t, "mens")) return "men";
  if (hasWord(t, "women") || hasWord(t, "womens") || hasWord(t, "ladies")) return "women";
  // GG's old naming convention for GCal events:
  //   SWLBA = Southwest Lawn Bowls Association (men's)
  //   SWD   = Southwest Division (women's)
  // Applied last so pages like "SWD Men's So Cal Rinks" still resolve to "men"
  // via the explicit "Men's" token above.
  if (hasWord(t, "swlba")) return "men";
  if (hasWord(t, "swd")) return "women";
  return null;
}

// Strict matching:
// - All "required" words in the link title (length>=3, non-generic) must appear
//   as substrings in the event summary. Substring rather than word-boundary
//   handles abbreviations like "Cal" ↔ "California".
// - If the link title specifies a gender, the event's gender (from its title
//   or its source calendar) must match — otherwise reject.
// - Tiebreaker when multiple links qualify: pick the most specific (longest
//   required-word list). If still tied, skip as ambiguous.
function pickStrictMatch(eventSummary, allowedLinks, logs, calendarId) {
  const eventName = normalizeText(eventSummary);
  if (!eventName) return null;

  const eventGender = detectGender(eventSummary) || CALENDAR_GENDER[calendarId] || null;

  const scored = [];
  for (const link of allowedLinks) {
    const linkName = normalizeText(link.name);
    if (linkName.length < 6) continue;

    const required = requiredWordsOf(link.name);
    if (!required.length) continue;
    if (!required.every((w) => eventName.includes(w))) continue;

    const linkGender = detectGender(link.name);
    if (linkGender) {
      if (!eventGender) continue;
      if (linkGender !== eventGender) continue;
    }

    scored.push({ link, specificity: required.length });
  }

  if (scored.length === 0) return null;
  if (scored.length === 1) return scored[0].link;

  // Prefer the most specific candidate; break further ties by gender match.
  scored.sort((a, b) => b.specificity - a.specificity);
  const topSpec = scored[0].specificity;
  const top = scored.filter((s) => s.specificity === topSpec);
  if (top.length === 1) return top[0].link;

  const genderExact = top.filter((s) => detectGender(s.link.name) === eventGender && eventGender);
  if (genderExact.length === 1) return genderExact[0].link;

  logs.push(
    `SKIP ambiguous: "${eventSummary}" -> ${top
      .slice(0, 5)
      .map((s) => s.link.url)
      .join(" | ")}${top.length > 5 ? " | ..." : ""}`
  );
  return null;
}

// ------------------------
// Vercel handler
// ------------------------
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const providedSecret = req.query.key || req.headers.authorization?.split(" ")[1];
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = req.query.dryRun === "1";
  const logs = [];
  const changes = []; // short, copyable summary

  try {
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      return res.status(500).json({
        error: "JSON Parse Error: Check GOOGLE_SERVICE_ACCOUNT_JSON formatting in Vercel env vars.",
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    // 1) Fetch Squarespace tournament list + events-data.json (for deadlines)
    //    in parallel.
    const [allowedLinks, dataEntries] = await Promise.all([
      scrapeSquarespaceLinksAllowedOnly(),
      fetchEventsData(),
    ]);
    logs.push(`Allowed 2026 links found: ${allowedLinks.length}`);
    logs.push(`events-data.json entries with deadlines: ${dataEntries.length}`);

    let eventsPatched = 0;
    let removedUrlCount = 0;
    let addedUrlCount = 0;
    let deadlinesApplied = 0;
    const calendarErrors = [];

    await Promise.all(CALENDAR_IDS.map(async (calendarId) => {
      try {
        const events = await calendar.events.list({
          calendarId,
          timeMin: "2026-01-01T00:00:00Z",
          timeMax: "2027-01-01T00:00:00Z",
          singleEvents: true,
          maxResults: 2500,
          orderBy: "startTime",
        });

        const items = events.data.items || [];
        const updates = [];
        for (const event of items) {
          const originalDesc = event.description || "";
          const hasManual = hasManualNonCollectionUrl(originalDesc);

          const match = hasManual
            ? null
            : pickStrictMatch(event.summary, allowedLinks, logs, calendarId);

          // Deadline is matched independently from events-data.json, even for
          // events whose URL lives on a manual mini-site.
          const deadlineEntry = pickStrictMatch(event.summary, dataEntries, logs, calendarId);

          // Strip existing tournament URLs (aggressively if we have a new
          // match, otherwise only known-bad ones).
          let cleaned;
          let removedUrls;
          if (match) {
            const s = stripAllTournamentUrls(originalDesc);
            cleaned = s.cleaned;
            removedUrls = s.removed.filter((u) => u !== match.url);
          } else {
            const s = stripDisallowedTournamentUrls(originalDesc);
            cleaned = s.cleaned;
            removedUrls = s.removed;
          }

          // Strip cron-managed lines (Deadline: / Registration:) so we can
          // re-emit them cleanly.
          cleaned = stripManagedLines(cleaned);

          const managed = [];
          if (deadlineEntry) {
            const txt = String(deadlineEntry.deadline)
              .replace(/^\s*(?:entry\s*)?deadline\s*[:\-]\s*/i, "")
              .trim();
            if (txt) managed.push(`Deadline: ${txt}`);
          }
          if (match) managed.push(`Registration: ${match.url}`);

          let newDesc = cleaned;
          if (managed.length) {
            newDesc = (cleaned ? `${cleaned}\n\n` : "") + managed.join("\n");
          }
          newDesc = newDesc.trim();

          if (newDesc.trim() === originalDesc.trim()) continue;
          updates.push({ event, newDesc, removed: removedUrls, match, deadlineEntry, originalDesc });
        }

        const PATCH_CONCURRENCY = 5;
        for (let i = 0; i < updates.length; i += PATCH_CONCURRENCY) {
          const chunk = updates.slice(i, i + PATCH_CONCURRENCY);
          await Promise.all(chunk.map(async ({ event, newDesc, removed, match, deadlineEntry, originalDesc }) => {
            changes.push({
              calendarId,
              summary: event.summary,
              removed,
              added: match ? match.url : null,
              deadline: deadlineEntry ? deadlineEntry.deadline : null,
            });
            if (!dryRun) {
              await calendar.events.patch({
                calendarId,
                eventId: event.id,
                requestBody: { description: newDesc },
              });
            }
            eventsPatched++;
            removedUrlCount += removed.length;
            if (match && !originalDesc.includes(match.url)) addedUrlCount++;
            if (deadlineEntry) deadlinesApplied++;
          }));
        }

        logs.push(`${calendarId}: OK (events=${items.length}, patched=${updates.length})`);
      } catch (calendarError) {
        calendarErrors.push({ calendarId, message: calendarError.message });
        logs.push(`${calendarId}: FAILED - ${calendarError.message}`);
      }
    }));

    const status = calendarErrors.length ? 500 : 200;
    return res.status(status).json({
      success: calendarErrors.length === 0,
      dryRun,
      hardBlock: Array.from(HARD_BLOCK),
      allowedLinksUsed: allowedLinks.length,
      eventsPatched,
      removedUrlCount,
      addedUrlCount,
      deadlinesApplied,
      calendarErrors,
      // keep this short; if it’s big, use dryRun and filter by event on client
      changes,
      diagnostics: logs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, logs });
  }
}
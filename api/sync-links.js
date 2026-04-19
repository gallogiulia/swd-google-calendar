import { google } from "googleapis";

const CALENDAR_IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com",
];

const BASE_SITE = "https://www.swlawnbowls.org";
const LISTING_URL = `${BASE_SITE}/2026-tournaments-events`;

// Only allow item pages whose slug starts with "2026-"
const REQUIRED_SLUG_PREFIX = "2026-";

// Hard block these known-bad URLs too (belt + suspenders)
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
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function nameFromSlug(slug) {
  if (!slug) return null;

  // Strip ONLY the required prefix from the display name
  const cleaned = slug.startsWith(REQUIRED_SLUG_PREFIX) ? slug.slice(REQUIRED_SLUG_PREFIX.length) : slug;

  const name = cleaned.replace(/-/g, " ").trim();
  if (!name || name.length < 4) return null;
  return name;
}

// Extract ONLY SWLawnBowls collection URLs from text.
function extractTournamentUrls(text) {
  const s = text || "";
  const re =
    /https?:\/\/www\.swlawnbowls\.org\/2026-tournaments-events\/[^\s<>"')\]]+/g;
  return [...new Set(s.match(re) || [])].map((u) => u.split("#")[0].split("?")[0]);
}

// Remove any disallowed URLs from description.
// Disallowed = HARD_BLOCK OR slug does not start with "2026-"
function removeDisallowedTournamentUrls(description) {
  const urls = extractTournamentUrls(description);
  if (!urls.length) return { cleaned: description || "", removed: [] };

  const removed = [];
  let cleaned = description || "";

  for (const url of urls) {
    const slug = slugFromUrl(url);
    const disallowed =
      HARD_BLOCK.has(url) || !slug.startsWith(REQUIRED_SLUG_PREFIX);

    if (disallowed) {
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleaned = cleaned.replace(new RegExp(`\\s*${escaped}\\s*\\n?`, "g"), "\n");
      removed.push(url);
    }
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, removed };
}

// Scrape Squarespace listing -> ONLY return live links whose slug starts with "2026-"
async function scrapeSquarespaceLinksAllowedOnly() {
  const response = await fetch(LISTING_URL, { redirect: "follow", cache: "no-store" });
  const html = await response.text();

  const hrefRegex = /href="([^"]+)"/g;
  const hrefs = [];
  let m;
  while ((m = hrefRegex.exec(html)) !== null) hrefs.push(m[1]);

  const candidateUrls = [...new Set(hrefs.map(normalizeSquarespaceUrl).filter(Boolean))];

  const filtered = candidateUrls.filter((url) => {
    if (HARD_BLOCK.has(url)) return false;
    return slugFromUrl(url).startsWith(REQUIRED_SLUG_PREFIX);
  });

  const allowedLiveUrls = [];
  const LIVENESS_CONCURRENCY = 10;
  for (let i = 0; i < filtered.length; i += LIVENESS_CONCURRENCY) {
    const chunk = filtered.slice(i, i + LIVENESS_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (url) => ({ url, live: await isLiveUrl(url) }))
    );
    for (const { url, live } of results) if (live) allowedLiveUrls.push(url);
  }

  return allowedLiveUrls
    .map((url) => {
      const slug = slugFromUrl(url);
      const name = nameFromSlug(slug);
      if (!name) return null;
      return { name, url, slug };
    })
    .filter(Boolean);
}

// Strict matching:
// - find all candidates where ALL meaningful words from linkName appear in event summary
// - if 0 candidates => no match
// - if 2+ candidates => ambiguous => no match (do NOT add any URL)
function pickStrictMatch(eventSummary, allowedLinks, logs) {
  const eventName = normalizeText(eventSummary);
  if (!eventName) return null;

  const candidates = allowedLinks.filter(({ name }) => {
    const linkName = normalizeText(name);
    if (linkName.length < 6) return false;

    const words = linkName.split(" ").filter((w) => w.length >= 3);
    if (!words.length) return false;

    return words.every((w) => eventName.includes(w));
  });

  if (candidates.length === 1) return candidates[0];

  if (candidates.length > 1) {
    logs.push(
      `SKIP ambiguous: "${eventSummary}" -> ${candidates
        .slice(0, 5)
        .map((c) => c.url)
        .join(" | ")}${candidates.length > 5 ? " | ..." : ""}`
    );
  }

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

    // 1) Only allowed 2026 links
    const allowedLinks = await scrapeSquarespaceLinksAllowedOnly();
    logs.push(`Allowed 2026 links found: ${allowedLinks.length}`);

    let eventsPatched = 0;
    let removedUrlCount = 0;
    let addedUrlCount = 0;
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
          const { cleaned, removed } = removeDisallowedTournamentUrls(originalDesc);
          const match = pickStrictMatch(event.summary, allowedLinks, logs);

          let newDesc = cleaned;
          if (match && !newDesc.includes(match.url)) {
            newDesc = `${newDesc}\n\nRegistration: ${match.url}`.trim();
          }
          if (newDesc.trim() === originalDesc.trim()) continue;
          updates.push({ event, newDesc, removed, match, originalDesc });
        }

        const PATCH_CONCURRENCY = 5;
        for (let i = 0; i < updates.length; i += PATCH_CONCURRENCY) {
          const chunk = updates.slice(i, i + PATCH_CONCURRENCY);
          await Promise.all(chunk.map(async ({ event, newDesc, removed, match, originalDesc }) => {
            changes.push({
              calendarId,
              summary: event.summary,
              removed,
              added: match ? match.url : null,
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
      requiredSlugPrefix: REQUIRED_SLUG_PREFIX,
      hardBlock: Array.from(HARD_BLOCK),
      allowedLinksUsed: allowedLinks.length,
      eventsPatched,
      removedUrlCount,
      addedUrlCount,
      calendarErrors,
      // keep this short; if it’s big, use dryRun and filter by event on client
      changes,
      diagnostics: logs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, logs });
  }
}
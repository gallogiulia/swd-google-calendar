import { google } from "googleapis";

const CALENDAR_IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com",
];

// ------------------------
// Helpers
// ------------------------
const BASE_SITE = "https://www.swlawnbowls.org";
const LISTING_URL = `${BASE_SITE}/2026-tournaments-events`;

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSquarespaceUrl(href) {
  if (!href) return null;

  // absolute vs relative
  let url = href.startsWith("http")
    ? href
    : `${BASE_SITE}${href.startsWith("/") ? "" : "/"}${href}`;

  // strip query/hash
  url = url.split("#")[0].split("?")[0];

  // must be in this collection
  if (!url.includes("/2026-tournaments-events/")) return null;

  // ignore the collection root page
  if (url.endsWith("/2026-tournaments-events") || url.endsWith("/2026-tournaments-events/")) return null;

  return url;
}

async function isLiveUrl(url) {
  try {
    // Squarespace drafts/unpublished typically return 404; GET is most reliable
    const r = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

function slugFromUrl(url) {
  const parts = (url || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function nameFromSlug(slug) {
  if (!slug) return null;

  // Remove only a leading year prefix like "2026-" (do not strip all digits)
  const cleaned = slug.replace(/^20\d{2}-/, "");
  const name = cleaned.replace(/-/g, " ").trim();

  if (!name || name.length < 4) return null;
  return name;
}

// ------------------------
// Scrape listing page -> find ONLY live item URLs
// ------------------------
async function scrapeSquarespaceLinks() {
  const response = await fetch(LISTING_URL, { redirect: "follow", cache: "no-store" });
  const html = await response.text();

  // grab every href to be robust (Squarespace markup can change)
  const hrefRegex = /href="([^"]+)"/g;
  const hrefs = [];
  let m;
  while ((m = hrefRegex.exec(html)) !== null) hrefs.push(m[1]);

  // normalize/filter/dedupe
  const candidateUrls = [...new Set(hrefs.map(normalizeSquarespaceUrl).filter(Boolean))];

  // keep only URLs that are live (published)
  const liveUrls = [];
  for (const url of candidateUrls) {
    if (await isLiveUrl(url)) liveUrls.push(url);
  }

  // map to {name,url} for matching
  const links = liveUrls
    .map((url) => {
      const slug = slugFromUrl(url);
      const name = nameFromSlug(slug);
      if (!name) return null;
      return { name, url };
    })
    .filter(Boolean);

  return links;
}

// ------------------------
// Vercel handler
// ------------------------
export default async function handler(req, res) {
  const providedSecret = req.query.key || req.headers.authorization?.split(" ")[1];
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = req.query.dryRun === "1";
  const logs = [];

  try {
    // Validate service account JSON early with a useful error
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      return res.status(500).json({
        error: "JSON Parse Error: Check GOOGLE_SERVICE_ACCOUNT_JSON formatting in Vercel env vars.",
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    // 1) Scrape ONLY live Squarespace URLs
    const siteLinks = await scrapeSquarespaceLinks();
    logs.push(`Squarespace live links found: ${siteLinks.length}`);

    // Optional: log them (can be long)
    // siteLinks.forEach(l => logs.push(`LIVE: ${l.name} -> ${l.url}`));

    let updatedCount = 0;
    let candidateMatches = 0;

    for (const calendarId of CALENDAR_IDS) {
      try {
        const events = await calendar.events.list({
          calendarId,
          timeMin: "2026-01-01T00:00:00Z",
          timeMax: "2027-01-01T00:00:00Z",
          singleEvents: true,
          maxResults: 2500,
          orderBy: "startTime",
        });

        for (const event of events.data.items || []) {
          const eventName = normalizeText(event.summary);
          if (!eventName) continue;

          // 2) Tight matching (avoid short/garbage names)
          const match = siteLinks.find(({ name }) => {
            const linkName = normalizeText(name);
            if (linkName.length < 6) return false;
            return eventName.includes(linkName) || linkName.includes(eventName);
          });

          if (!match) continue;

          candidateMatches++;

          const alreadyHasUrl = (event.description || "").includes(match.url);
          if (alreadyHasUrl) continue;

          const newDescription = `${(event.description || "").trim()}\n\nRegistration: ${match.url}`.trim();

          if (dryRun) {
            logs.push(`DRYRUN [${calendarId}] "${event.summary}" -> ${match.url}`);
          } else {
            await calendar.events.patch({
              calendarId,
              eventId: event.id,
              requestBody: { description: newDescription },
            });
            updatedCount++;
            logs.push(`PATCHED [${calendarId}] "${event.summary}" -> ${match.url}`);
          }
        }

        logs.push(`${calendarId}: OK (events=${(events.data.items || []).length})`);
      } catch (calendarError) {
        logs.push(`${calendarId}: FAILED - ${calendarError.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      squarespaceLiveLinks: siteLinks.length,
      candidateMatches,
      updated: updatedCount,
      diagnostics: logs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, logs });
  }
}
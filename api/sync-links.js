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

// IMPORTANT: only allow item pages whose slug starts with "2026-"
const REQUIRED_SLUG_PREFIX = "2026-";

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

  // Strip ONLY the required prefix from the display name (keeps digits elsewhere intact)
  const cleaned = slug.startsWith(REQUIRED_SLUG_PREFIX)
    ? slug.slice(REQUIRED_SLUG_PREFIX.length)
    : slug;

  const name = cleaned.replace(/-/g, " ").trim();
  if (!name || name.length < 4) return null;
  return name;
}

async function scrapeSquarespaceLinks() {
  const response = await fetch(LISTING_URL, { redirect: "follow", cache: "no-store" });
  const html = await response.text();

  const hrefRegex = /href="([^"]+)"/g;
  const hrefs = [];
  let m;
  while ((m = hrefRegex.exec(html)) !== null) hrefs.push(m[1]);

  const candidateUrls = [...new Set(hrefs.map(normalizeSquarespaceUrl).filter(Boolean))];

  const liveUrls = [];
  for (const url of candidateUrls) {
    // Enforce: must be an item slug that starts with "2026-"
    const slug = slugFromUrl(url);
    if (!slug.startsWith(REQUIRED_SLUG_PREFIX)) continue;

    // Optional: also ensure the page is actually live
    if (await isLiveUrl(url)) liveUrls.push(url);
  }

  const links = liveUrls
    .map((url) => {
      const slug = slugFromUrl(url);
      const name = nameFromSlug(slug);
      if (!name) return null;
      return { name, url, slug };
    })
    .filter(Boolean);

  return links;
}

export default async function handler(req, res) {
  const providedSecret = req.query.key || req.headers.authorization?.split(" ")[1];
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = req.query.dryRun === "1";
  const logs = [];

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

    const siteLinks = await scrapeSquarespaceLinks();
    logs.push(`Squarespace live links (slug starts with "${REQUIRED_SLUG_PREFIX}"): ${siteLinks.length}`);

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
      requiredSlugPrefix: REQUIRED_SLUG_PREFIX,
      squarespaceLinksUsed: siteLinks.length,
      candidateMatches,
      updated: updatedCount,
      diagnostics: logs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, logs });
  }
}
import { google } from 'googleapis';

const CALENDAR_IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"
];

async function scrapeSquarespaceLinks() {
  const response = await fetch('https://www.swlawnbowls.org/2026-tournaments-events');
  const html = await response.text();
  const linkRegex = /href="([^"]*\/2026-tournaments-events\/[^"]*)"/g;
  let links = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1].startsWith('http') ? match[1] : `https://www.swlawnbowls.org${match[1]}`;
    const name = url.split('/').pop().replace(/-/g, ' ').replace(/\d+/g, '').trim();
    links.push({ name, url });
  }
  return links;
}

export default async function handler(req, res) {
  const providedSecret = req.query.key || req.headers.authorization?.split(' ')[1];
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let logs = [];

  try {
    // DIAGNOSTIC: Check if JSON is valid
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      return res.status(500).json({ error: "JSON Parse Error: Check your Vercel Environment Variable formatting." });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    
    const calendar = google.calendar({ version: 'v3', auth });
    const siteLinks = await scrapeSquarespaceLinks();
    let updatedCount = 0;

    for (const calendarId of CALENDAR_IDS) {
      try {
        const events = await calendar.events.list({
          calendarId,
          timeMin: new Date().toISOString(),
          singleEvents: true,
        });

        for (const event of (events.data.items || [])) {
          const match = siteLinks.find(link => 
            event.summary.toLowerCase().includes(link.name.toLowerCase()) ||
            link.name.toLowerCase().includes(event.summary.toLowerCase())
          );

          if (match && !event.description?.includes(match.url)) {
            await calendar.events.patch({
              calendarId,
              eventId: event.id,
              requestBody: {
                description: `${event.description || ''}\n\n${match.url}`.trim()
              }
            });
            updatedCount++;
          }
        }
        logs.push(`${calendarId}: OK`);
      } catch (calendarError) {
        // This will tell us EXACTLY which calendar is Forbidden
        logs.push(`${calendarId}: FAILED - ${calendarError.message}`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      updated: updatedCount,
      diagnostics: logs 
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, logs });
  }
}
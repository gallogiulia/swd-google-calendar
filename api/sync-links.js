import { google } from 'googleapis';

const CALENDAR_IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"
];

// 1. Scraper: Fetches links from your own Tournaments API/Page
async function getTournamentLinks() {
  const res = await fetch(`${process.env.VERCEL_URL}/api/tournaments`);
  const data = await res.json();
  return data.tournaments || []; // Array of { name, url }
}

export default async function handler(req, res) {
  // Security check for Cron job
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    
    const tournamentLinks = await getTournamentLinks();

    for (const calendarId of CALENDAR_IDS) {
      const events = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        singleEvents: true,
      });

      for (const event of (events.data.items || [])) {
        // Find a matching tournament link in your CSV/Website data
        const match = tournamentLinks.find(t => 
          event.summary.toLowerCase().includes(t.name.toLowerCase()) ||
          t.name.toLowerCase().includes(event.summary.toLowerCase())
        );

        if (match && !event.description?.includes(match.url)) {
          // Update the Google Calendar event description with the new URL
          await calendar.events.patch({
            calendarId,
            eventId: event.id,
            requestBody: {
              description: `${event.description || ''}\n\n${match.url}`.trim()
            }
          });
          console.log(`Updated link for: ${event.summary}`);
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
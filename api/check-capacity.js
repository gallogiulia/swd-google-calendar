import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const config = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    config.private_key = config.private_key.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: config,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:H", 
    });

    const rows = response.data.values || [];
    
    const formattedData = rows.map(row => ({
      name: row[0] || "Unknown",
      leftA: row[4] || 0,
      leftB: row[5] || 0,
      status: row[6] || "PENDING",
      releaseDate: row[7] || "" 
    }));

    // CRITICAL: We return { data: [...] } so agenda.html can find it
    return res.status(200).json({ data: formattedData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
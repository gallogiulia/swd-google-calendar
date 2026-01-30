import { google } from 'googleapis';

export default async function handler(req, res) {
    // ADD THESE TWO LINES AT THE VERY TOP
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  try {
    const config = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    // CRITICAL VERCEL FIX: Forces the private key into the correct format
    config.private_key = config.private_key.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: config,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const data = (response.data.values || []).map(row => ({
      name: row[0] || "Unknown",
      leftA: row[4] || 0,
      leftB: row[5] || 0,
      status: row[6] || "OPEN"
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    // If it fails, send the error as a message instead of crashing the server
    return res.status(200).json({ success: false, error: err.message });
  }
}
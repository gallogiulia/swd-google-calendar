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

    // We expand the range to A:G to get Capacities (B, C) and Current (E, F)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];
    
// Corrected API Handler to calculate true "Spots Left"
const formattedData = rows.map(row => {
  const name = row[0] || "Unknown";
  const maxA = parseInt(row[1]) || 0; // Column B: Max A
  const maxB = parseInt(row[2]) || 0; // Column C: Max B
  const curA = parseInt(row[4]) || 0; // Column E: Current A
  const curB = parseInt(row[5]) || 0; // Column F: Current B
  const status = (row[6] || "PENDING").toUpperCase();

  return {
    name: name,
    leftA: Math.max(0, maxA - curA), // Correct: Max minus Current
    leftB: Math.max(0, maxB - curB), // Correct: Max minus Current
    status: status
  };
});

    return res.status(200).json({ data: formattedData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
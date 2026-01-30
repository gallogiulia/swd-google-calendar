import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.MASTER_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    const data = rows.map(row => ({
      // Normalize name for matching (removes SWD, 2026, etc)
      name: row[0].replace(/SWD|2026/g, '').trim(), 
      fullName: row[0],
      capA: row[1],
      capB: row[2],
      logicType: row[3],
      // Pointing to your NEW columns E, F, and G
      leftA: parseInt(row[4]) || 0, // Column E
      leftB: parseInt(row[5]) || 0, // Column F
      status: row[6] || 'OPEN'      // Column G
    }));

    res.status(200).json({ success: true, data });
  } catch (err) {
    // This will send the EXACT error to your browser so we can see it
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
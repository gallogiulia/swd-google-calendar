import { google } from 'googleapis';

export default async function handler(req, res) {
  // 1. Manually set the ID to remove any Vercel variable doubt
  const SPREADSHEET_ID = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.status(200).json({ success: false, error: "Credentials missing in Vercel." });
    }

    // 2. Parse and fix the common Private Key formatting issue
    const config = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: config,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 3. Fetch data from your specific tab
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    // 4. Map the columns strictly by position (E=4, F=5, G=6)
    const data = rows.map(row => ({
      name: row[0] || "Unknown",
      leftA: parseInt(row[4]) || 0,
      leftB: parseInt(row[5]) || 0,
      status: (row[6] || "OPEN").toUpperCase().trim()
    }));

    return res.status(200).json({ success: true, data });

  } catch (err) {
    // This stops the 500 error screen and shows us the actual problem
    return res.status(200).json({ 
      success: false, 
      error: err.message,
      check: "Is the robot email added as an EDITOR to the sheet?"
    });
  }
}
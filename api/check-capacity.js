import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    // 1. Safety check for the JSON variable
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable.");
    }

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Using the ID from your provided spreadsheet link
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    // 2. Map data safely. We use index numbers [0], [4], [5], [6]
    // This means the names of your headers (Row 1) DO NOT matter.
    const data = rows.map(row => {
      const parseNum = (val) => {
        const n = parseInt(val);
        return isNaN(n) ? 0 : n;
      };

      return {
        name: row[0] || "Unnamed",    // Column A
        leftA: parseNum(row[4]),      // Column E (Index 4)
        leftB: parseNum(row[5]),      // Column F (Index 5)
        status: row[6] || "OPEN"      // Column G (Index 6)
      };
    });

    return res.status(200).json({ success: true, data });

  } catch (err) {
    // This will now tell you EXACTLY what happened (e.g., "Unexpected token")
    return res.status(500).json({ 
      success: false, 
      error: err.message,
      check: "Ensure your Service Account Email is added as a VIEWER to the sheet."
    });
  }
}
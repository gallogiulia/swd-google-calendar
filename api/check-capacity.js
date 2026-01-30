import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.status(200).json({ success: false, error: "Environment variable missing." });
    }

    // This block fixes the potential Vercel formatting issue
    const config = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: config,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Direct ID from your spreadsheet URL
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    const data = rows.map(row => {
      const parseNum = (val) => {
        const n = parseInt(val);
        return isNaN(n) ? 0 : n;
      };

      return {
        name: row[0] || "Unknown",
        leftA: parseNum(row[4]), // Column E
        leftB: parseNum(row[5]), // Column F
        status: row[6] || "OPEN"   // Column G
      };
    });

    return res.status(200).json({ success: true, data });

  } catch (err) {
    // Return the actual error message so we can see it in the browser
    return res.status(200).json({ 
      success: false, 
      error: err.message 
    });
  }
}
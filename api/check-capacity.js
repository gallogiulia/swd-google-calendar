import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonStr) throw new Error("Missing JSON Env Var");

    // This handles the \n issue once and for all
    const credentials = JSON.parse(jsonStr);
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Hardcoded ID from your screenshot to ensure no variable errors
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    const data = rows.map(row => ({
      name: row[0] || "Unknown",
      leftA: parseInt(row[4]) || 0, // Column E
      leftB: parseInt(row[5]) || 0, // Column F
      status: row[6] || "OPEN"      // Column G
    }));

    return res.status(200).json({ success: true, data });

  } catch (err) {
    // If we reach here, we return a 200 with the error so Vercel doesn't show the 500 screen
    return res.status(200).json({ success: false, error: err.message });
  }
}

export default async function handler(req, res) {
  try {
    const testJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!testJson) return res.status(200).json({ success: false, error: "JSON variable is MISSING" });
    
    // If it gets here, it will try to show you what it found
    return res.status(200).json({ 
      success: true, 
      message: "The API is awake, but we need to verify the Google connection next." 
    });
  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
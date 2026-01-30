import { google } from 'googleapis';

export default async function handler(req, res) {
  // 1. Set the headers so the browser knows to expect JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    
    if (!rawJson) {
      return res.status(200).json({ success: false, error: "ENV Variable GOOGLE_SERVICE_ACCOUNT_JSON is missing in Vercel settings." });
    }

    // 2. The "Vercel Fix": Manually repair common formatting errors in the private key
    let config;
    try {
      config = JSON.parse(rawJson);
      if (config.private_key) {
        config.private_key = config.private_key.replace(/\\n/g, '\n');
      }
    } catch (parseError) {
      return res.status(200).json({ success: false, error: "JSON Parse Error. Your Vercel variable is not a valid JSON string." });
    }

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

    const rows = response.data.values || [];

    const data = rows.map(row => ({
      name: row[0] || "Unknown",
      leftA: parseInt(row[4]) || 0,
      leftB: parseInt(row[5]) || 0,
      status: (row[6] || "OPEN").toUpperCase()
    }));

    // SUCCESS: This is the JSON you should see
    return res.status(200).json({ success: true, data });

  } catch (err) {
    // CATCH: If it fails, we send the error as JSON instead of a 500 page
    return res.status(200).json({ 
      success: false, 
      error: err.message,
      tip: "Check if the Service Account Email is an Editor on the Google Sheet." 
    });
  }
}
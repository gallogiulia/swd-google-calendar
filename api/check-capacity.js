import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    // 1. Check if the environment variable even exists
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.status(200).json({ success: false, error: "Vercel Environment Variable is missing entirely." });
    }

    // 2. Try to parse the JSON with a safety fix for the private key
    let config;
    try {
      config = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      if (config.private_key) {
        config.private_key = config.private_key.replace(/\\n/g, '\n');
      }
    } catch (e) {
      return res.status(200).json({ success: false, error: "JSON is malformed. Check for extra quotes or missing braces in Vercel." });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: config,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Using your exact ID from the screenshot
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    // 3. Map the data based on your specific columns E, F, and G
    const data = rows.map(row => ({
      name: row[0] || "Unknown",
      leftA: parseInt(row[4]) || 0, // Column E
      leftB: parseInt(row[5]) || 0, // Column F
      status: row[6] || "OPEN"      // Column G
    }));

    // IF EVERYTHING WORKS, YOU WILL SEE THIS JSON
    return res.status(200).json({ success: true, data });

  } catch (err) {
    // THIS PREVENTS THE 500 ERROR AND SHOWS YOU THE PROBLEM
    return res.status(200).json({ 
      success: false, 
      error: err.message,
      stack: "Ensure the Service Account is an EDITOR on the sheet." 
    });
  }
}
import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    
    // The ID from your URL
    const spreadsheetId = '1VRp6kZTzGcDNYgVTw5KSq-kT2HGjruYXiQcpCQdZU9I';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:G", 
    });

    const rows = response.data.values || [];

    // Safety Check: If rows is empty, return an empty array instead of crashing
    if (rows.length === 0) {
      return res.status(200).json({ success: true, data: [], note: "No rows found" });
    }

    const data = rows.map(row => {
      // Helper function to safely turn cells into numbers
      const safeNum = (val) => {
        const n = parseInt(val);
        return isNaN(n) ? 0 : n;
      };

      return {
        name: row[0] || "Unnamed Tournament", // Column A
        capA: safeNum(row[1]),                // Column B
        capB: safeNum(row[2]),                // Column C
        logicType: row[3] || "CAP",           // Column D
        leftA: safeNum(row[4]),               // Column E
        leftB: safeNum(row[5]),               // Column F
        status: row[6] || "OPEN"              // Column G
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    // This sends the actual error message (e.g., "Sheet not found") to the screen
    return res.status(500).json({ 
      success: false, 
      error: err.message,
      tip: "Ensure MASTER_SHEET_ID is correct and the Sheet is shared with the robot email."
    });
  }
}
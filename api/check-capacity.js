import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.MASTER_SHEET_ID;

    // 1. Get Tournament Settings (Caps and Logic Type)
    const settingsRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Tournament Settings'!A2:D", 
    });
    const settings = settingsRes.data.values || [];

    // 2. Get Live Orders (To count entries)
    const ordersRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Orders'!B2:H", // Column B is Tournament, H is Green
    });
    const orders = ordersRes.data.values || [];

    const results = settings.map(row => {
      const name = row[0];
      const capA = parseInt(row[1]) || 0;
      const capB = parseInt(row[2]) || 0;
      const logicType = row[3];

      // Count entries for this specific tournament
      const tournamentOrders = orders.filter(o => o[0] === name);
      const countA = tournamentOrders.filter(o => o[6] === 'Green A').length;
      const countB = tournamentOrders.filter(o => o[6] === 'Green B').length;
      const totalCount = tournamentOrders.length;

      return {
        name,
        logicType,
        greenA: { current: countA, max: capA, isFull: countA >= capA },
        greenB: { current: countB, max: capB, isFull: countB >= capB },
        totalCount,
        // Even Logic: needs 1 more if total is odd and it's an EVEN type tournament
        needsOneMore: logicType === 'EVEN' && totalCount % 2 !== 0
      };
    });

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
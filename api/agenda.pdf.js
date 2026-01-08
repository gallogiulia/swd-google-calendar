import PDFDocument from "pdfkit";

function formatDate(d) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(d);
}

function formatTime(d) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function safeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export default async function handler(req, res) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const days = Number(req.query.days || 365);

    // Pull from your cached API endpoint
    const r = await fetch(`${baseUrl}/api/events?days=${encodeURIComponent(days)}`, {
      headers: { "accept": "application/json" }
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(500).json({ error: `Failed to load events for PDF: ${r.status} ${txt}` });
    }

    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];

    // Build PDF in memory (safe for serverless)
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", (e) => { throw e; });

    // Header
    doc.fontSize(18).text("Southwest Division Bowls — Events Agenda", { align: "left" });
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor("#555").text(`Generated: ${new Date().toLocaleString()} | Range: next ${days} days`);
    doc.moveDown(1);
    doc.fillColor("#000");

    if (!events.length) {
      doc.fontSize(12).text("No events found in the selected range.");
      doc.end();

      const pdf = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
      return res.status(200).send(pdf);
    }

    // Sort (defensive)
    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Group by date
    let currentDateKey = "";
    doc.fontSize(11);

    for (const e of events) {
      const start = new Date(e.start);
      const dateKey = start.toISOString().slice(0, 10);

      if (dateKey !== currentDateKey) {
        currentDateKey = dateKey;
        doc.moveDown(0.7);
        doc.fontSize(12).fillColor("#111").text(formatDate(start));
        doc.moveDown(0.3);
        doc.moveTo(doc.x, doc.y).lineTo(560, doc.y).strokeColor("#ddd").stroke();
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor("#000");
      }

      const title = safeText(e.title);
      const location = safeText(e.location);
      const allDay = !!e.allDay;

      // color (you already add e.color in api/events.js; fallback if missing)
      const color = e.color || "#2563eb";

      // left color marker
      const x = doc.x;
      const y = doc.y + 2;
      doc.save();
      doc.fillColor(color).rect(x, y, 6, 12).fill();
      doc.restore();

      // text block
      const timeStr = allDay ? "All day" : formatTime(start);
      const line1 = `${timeStr} — ${title}`;
      doc.text(line1, x + 12, doc.y, { width: 520 });

      if (location) {
        doc.fillColor("#555").fontSize(10).text(location, x + 12, doc.y + 2, { width: 520 });
        doc.fillColor("#000").fontSize(11);
      }

      doc.moveDown(location ? 0.9 : 0.6);

      // page break protection
      if (doc.y > 720) doc.addPage();
    }

    doc.end();

    const pdf = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pdf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "PDF generation failed", details: String(err?.message || err) });
  }
}

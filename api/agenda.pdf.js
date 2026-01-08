import PDFDocument from "pdfkit";

let PDF_CACHE = { t: 0, buf: null, key: "" };
const PDF_TTL_MS = (Number(process.env.GCAL_CACHE_MINUTES || 10)) * 60 * 1000;

const IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com", // Club Sponsored
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com", // Other
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com", // Men's
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com", // Women's
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"  // PBA
];

const CALENDAR_COLORS = {
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com": "#2563eb",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": "#7c3aed",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": "#dc2626",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": "#059669",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": "#f59e0b"
};

function safeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function fmtDate(d) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(d);
}

function fmtTime(d) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

async function fetchEventsDirect(days) {
  const key = process.env.GCAL_API_KEY;
  if (!key) throw new Error("Missing GCAL_API_KEY");

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();

  let events = [];

  for (const id of IDS) {
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events` +
      `?key=${encodeURIComponent(key)}` +
      `&timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true&orderBy=startTime`;

    const r = await fetch(url);
    if (!r.ok) continue;

    const j = await r.json();
    for (const e of (j.items || [])) {
      events.push({
        id: e.id,
        title: e.summary || "",
        start: e.start?.dateTime || e.start?.date,
        allDay: !!e.start?.date,
        location: e.location || "",
        color: CALENDAR_COLORS[id] || "#2563eb"
      });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

async function buildPdfBuffer(events, days) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Southwest Division Bowls — Events Agenda");
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor("#555").text(
      `Generated: ${new Date().toLocaleString()} | Range: next ${days} days`
    );
    doc.moveDown(1);
    doc.fillColor("#000");

    if (!events.length) {
      doc.fontSize(12).text("No events found in the selected range.");
      doc.end();
      return;
    }

    let currentKey = "";

    for (const e of events) {
      const start = new Date(e.start);
      const key = start.toISOString().slice(0, 10);

      if (key !== currentKey) {
        currentKey = key;
        doc.moveDown(0.7);
        doc.fontSize(12).fillColor("#111").text(fmtDate(start));
        doc.moveDown(0.3);
        doc.moveTo(doc.x, doc.y).lineTo(560, doc.y).strokeColor("#ddd").stroke();
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor("#000");
      }

      const x = doc.x;
      const y = doc.y + 2;

      doc.save();
      doc.fillColor(e.color || "#2563eb").rect(x, y, 6, 12).fill();
      doc.restore();

      const timeStr = e.allDay ? "All day" : fmtTime(start);
      const title = safeText(e.title);
      const loc = safeText(e.location);

      doc.text(`${timeStr} — ${title}`, x + 12, doc.y, { width: 520 });

      if (loc) {
        doc.fillColor("#555").fontSize(10).text(loc, x + 12, doc.y + 2, { width: 520 });
        doc.fillColor("#000").fontSize(11);
        doc.moveDown(0.9);
      } else {
        doc.moveDown(0.6);
      }

      if (doc.y > 720) doc.addPage();
    }

    doc.end();
  });
}


export default async function handler(req, res) {
  try {
    const days = Number(req.query.days || 365);
    const cacheKey = `days=${days}`;

    const now = Date.now();
    if (PDF_CACHE.buf && PDF_CACHE.key === cacheKey && now - PDF_CACHE.t < PDF_TTL_MS) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
      return res.status(200).send(PDF_CACHE.buf);
    }

    const events = await fetchEventsDirect(days);
    const pdfBuf = await buildPdfBuffer(events, days);


    PDF_CACHE = { t: now, buf: pdfBuf, key: cacheKey };

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(PDF_CACHE.buf.length));
  return res.status(200).send(PDF_CACHE.buf);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "PDF generation failed", details: String(err?.message || err) });
  }
}

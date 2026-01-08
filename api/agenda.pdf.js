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

// ===== Layout (Letter) =====
const PAGE = {
  left: 48,
  right: 48,
  top: 48,
  bottom: 48,
  width: 612,
  height: 792
};

const COL = {
  time: 90,
  event: 260,
  loc: (PAGE.width - PAGE.left - PAGE.right) - 90 - 260
};

function hr(doc, y) {
  doc.save();
  doc.strokeColor("#e5e7eb").lineWidth(1);
  doc.moveTo(PAGE.left, y).lineTo(PAGE.width - PAGE.right, y).stroke();
  doc.restore();
}

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

// Wrap to N lines + ellipsis
function clampLines(doc, text, width, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let lines = [];
  let cur = "";

  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (doc.widthOfString(next) <= width) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);

  // ellipsis if truncated
  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\.*$/, "") + "…";
  }
  return lines.join("\n");
}

async function fetchEventsDirect(days) {
  const key = process.env.GCAL_API_KEY;
  if (!key) throw new Error("Missing GCAL_API_KEY");

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();

  const events = [];

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
      const start = e.start?.dateTime || e.start?.date;
      if (!start) continue;

      events.push({
        id: `${id}:${e.id}`, // reduce collisions across calendars
        title: e.summary || "",
        start,
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
    const doc = new PDFDocument({ size: "LETTER", margin: PAGE.left });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ===== Header =====
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827")
      .text("SWD Bowls — Events Agenda", PAGE.left, doc.y);

    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(10).fillColor("#6b7280")
      .text(`Generated ${new Date().toLocaleString()} • Next ${days} days`, PAGE.left);

    doc.moveDown(0.8);
    hr(doc, doc.y);
    doc.moveDown(0.8);

    if (!events.length) {
      doc.font("Helvetica").fontSize(12).fillColor("#111827")
        .text("No events found in the selected range.");
      doc.end();
      return;
    }

    // ===== Column header row =====
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280");
    doc.text("TIME", PAGE.left, doc.y, { width: COL.time });
    doc.text("EVENT", PAGE.left + COL.time, doc.y, { width: COL.event });
    doc.text("LOCATION", PAGE.left + COL.time + COL.event, doc.y, { width: COL.loc });
    doc.moveDown(0.4);
    hr(doc, doc.y);
    doc.moveDown(0.6);

    doc.font("Helvetica").fontSize(11).fillColor("#111827");

    let currentDayKey = "";
    const maxY = PAGE.height - PAGE.bottom;

    for (const e of events) {
      const start = new Date(e.start);
      const dayKey = start.toISOString().slice(0, 10);

      if (doc.y > maxY - 70) {
        doc.addPage();
        doc.y = PAGE.top;
      }

      // Day section header
      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey;

        if (doc.y > PAGE.top + 20) doc.moveDown(0.7);

        doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827")
          .text(fmtDate(start), PAGE.left, doc.y);

        doc.moveDown(0.2);
        hr(doc, doc.y);
        doc.moveDown(0.6);

        doc.font("Helvetica").fontSize(11).fillColor("#111827");
      }

      const color = e.color || "#2563eb";
      const timeStr = e.allDay ? "All day" : fmtTime(start);
      const title = safeText(e.title) || "(Untitled)";
      const locRaw = safeText(e.location);

      const locText = locRaw
        ? clampLines(doc, locRaw, COL.loc, 2)
        : "";

      const rowTop = doc.y;

      // Accent bar (left)
      doc.save();
      doc.fillColor(color).rect(PAGE.left - 10, rowTop + 2, 3, 30).fill();
      doc.restore();

      // Time
      doc.font("Helvetica").fontSize(10).fillColor("#374151")
        .text(timeStr, PAGE.left, rowTop, { width: COL.time });

      // Event title (bold)
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827")
        .text(title, PAGE.left + COL.time, rowTop, { width: COL.event });

      // Location (secondary)
      if (locText) {
        doc.font("Helvetica").fontSize(10).fillColor("#6b7280")
          .text(locText, PAGE.left + COL.time + COL.event, rowTop, { width: COL.loc });
      }

      // Calculate row height based on tallest column text
      const eventH = doc.heightOfString(title, { width: COL.event });
      const locH = locText ? doc.heightOfString(locText, { width: COL.loc }) : 0;
      const rowHeight = Math.max(22, eventH, locH) + 10;

      doc.y = rowTop + rowHeight;

      // Divider
      hr(doc, doc.y);
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

export default async function handler(req, res) {
  try {
    const days = Number(req.query.days || 365);
    const cacheKey = `days=${days}`;

    const now = Date.now();

    // Serve cached
    if (PDF_CACHE.buf && PDF_CACHE.key === cacheKey && (now - PDF_CACHE.t) < PDF_TTL_MS) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(PDF_CACHE.buf.length));
      return res.status(200).send(PDF_CACHE.buf);
    }

    const events = await fetchEventsDirect(days);
    const pdfBuf = await buildPdfBuffer(events, days);

    PDF_CACHE = { t: now, buf: pdfBuf, key: cacheKey };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(pdfBuf.length));
    return res.status(200).send(pdfBuf);

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "PDF generation failed",
      details: String(err?.message || err)
    });
  }
}

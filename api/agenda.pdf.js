// pages/api/agenda.pdf.js
import PDFDocument from "pdfkit";

let PDF_CACHE = { t: 0, buf: null, key: "" };
const PDF_TTL_MS = (Number(process.env.GCAL_CACHE_MINUTES || 10)) * 60 * 1000;

const IDS = [
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com"
];

const CALENDAR_COLORS = {
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com": "#2563eb", // Club Sponsored
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": "#7c3aed", // Other
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": "#dc2626", // Men
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": "#059669", // Women
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": "#f59e0b"  // PBA
};

function safeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Keep ONLY the club name (everything before first comma).
function shortLocation(loc) {
  if (!loc) return "";
  const s = safeText(loc);
  if (!s) return "";
  if (s.includes(",")) return s.split(",")[0].trim();
  return s;
}

// Convert either "YYYY-MM-DD" or ISO dateTime into "YYYY-MM-DD" (UTC date).
function isoDateFromAny(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  // Use UTC date to avoid timezone drift
  return d.toISOString().slice(0, 10);
}

function addDaysISO(isoYYYYMMDD, n) {
  const [Y, M, D] = isoYYYYMMDD.split("-").map(Number);
  const dt = new Date(Date.UTC(Y, M - 1, D, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function fmtDate(d) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(d);
}

function hr(doc, x1, x2, y) {
  doc.save();
  doc.strokeColor("#e5e7eb").lineWidth(1);
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.restore();
}

// Wrap to N lines + ellipsis (fast + predictable)
function clampLines(doc, text, width, maxLines = 1) {
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

  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\.*$/, "") + "…";
  }
  return lines.join("\n");
}

/**
 * IMPORTANT NORMALIZATION RULES (per your requirements)
 * 1) PDF shows NO times/durations. Every event is printed as "all-day" (blank time column).
 * 2) Prevent bogus “two-day” rows that come from dateTime end values or timezone drift:
 *    - If the source event is timed (start.dateTime), force it to a single all-day day: end = start + 1 (exclusive).
 *    - If the source event is already all-day (start.date), keep its end *as provided* (it’s already exclusive),
 *      BUT if end is missing or equals start, force end = start + 1.
 * 3) Location in the PDF is club name only (no street address).
 */
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
      const isTimed = !!e.start?.dateTime;
      const startRaw = e.start?.dateTime || e.start?.date;
      if (!startRaw) continue;

      const endRaw = e.end?.dateTime || e.end?.date || "";

      const start = isoDateFromAny(startRaw);
      if (!start) continue;

      let end = endRaw ? isoDateFromAny(endRaw) : "";

      // Timed -> always single-day all-day in PDF
      if (isTimed) {
        end = addDaysISO(start, 1);
      } else {
        // All-day source -> ensure at least 1-day (exclusive end)
        if (!end || end === start) end = addDaysISO(start, 1);
      }

      events.push({
        id: `${id}:${e.id}`,
        title: e.summary || "",
        start,   // YYYY-MM-DD
        end,     // YYYY-MM-DD (exclusive)
        allDay: true,
        location: shortLocation(e.location || ""),
        color: CALENDAR_COLORS[id] || "#2563eb"
      });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

// ===== Compact PDF renderer (single or 2-column) =====
async function buildPdfBuffer(events, days, compactTwoColumn) {
  return await new Promise((resolve, reject) => {
    const M = 32;
    const doc = new PDFDocument({ size: "LETTER", margin: M });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 612;
    const pageH = 792;
    const left = M;
    const right = M;
    const top = M;
    const bottom = M;

    // Two-column geometry
    const gutter = compactTwoColumn ? 18 : 0;
    const colW = compactTwoColumn
      ? Math.floor((pageW - left - right - gutter) / 2)
      : (pageW - left - right);

    const colX = (colIndex) => (compactTwoColumn ? (left + colIndex * (colW + gutter)) : left);

    let colIndex = 0;
    let xBase = colX(colIndex);
    let y = top;

    function newPage() {
      doc.addPage();
      colIndex = 0;
      xBase = colX(colIndex);
      y = top;
      renderHeader(true);
    }

    function nextColumnOrPage() {
      if (!compactTwoColumn) {
        newPage();
        return;
      }
      if (colIndex === 0) {
        colIndex = 1;
        xBase = colX(colIndex);
        y = top;
        renderHeader(true);
      } else {
        newPage();
      }
    }

    function renderHeader(isContinued) {
      doc.save();

      doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827")
        .text("SWD Bowls — Events Agenda", xBase, y);

      y += 16;

      doc.font("Helvetica").fontSize(9).fillColor("#6b7280")
        .text(`Next ${days} days • Generated ${new Date().toLocaleDateString()}`, xBase, y);

      if (isContinued) {
        doc.font("Helvetica").fontSize(8).fillColor("#9ca3af")
          .text("(continued)", xBase + colW - 70, y, { width: 70, align: "right" });
      }

      y += 10;
      hr(doc, xBase, xBase + colW, y);
      y += 10;

      // Headings: NO time column (per requirement)
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#9ca3af");
      const EVENT_W_H = Math.floor(colW * 0.68);
      const LOC_W_H = colW - EVENT_W_H;
      doc.text("EVENT", xBase, y, { width: EVENT_W_H });
      doc.text("LOCATION", xBase + EVENT_W_H, y, { width: LOC_W_H });
      y += 8;
      hr(doc, xBase, xBase + colW, y);
      y += 10;

      doc.restore();
    }

    renderHeader(false);

    if (!events.length) {
      doc.font("Helvetica").fontSize(11).fillColor("#111827")
        .text("No events found in the selected range.", xBase, y, { width: colW });
      doc.end();
      return;
    }

    // Column sizing (tight + predictable)
    const EVENT_W = Math.floor(colW * 0.68);
    const LOC_W = colW - EVENT_W;

    let currentDayKey = "";

    function ensureSpace(needed) {
      const maxY = pageH - bottom;
      if (y + needed <= maxY) return;
      nextColumnOrPage();
    }

    for (const e of events) {
      const start = new Date(`${e.start}T00:00:00Z`);
      const dayKey = e.start;

      // Day header
      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey;

        ensureSpace(26);

        doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827")
          .text(fmtDate(start), xBase, y, { width: colW });

        y += 12;
        hr(doc, xBase, xBase + colW, y);
        y += 8;
      }

      // Row
      const title = safeText(e.title) || "(Untitled)";
      const loc = safeText(e.location);

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
      const titleTxt = clampLines(doc, title, EVENT_W - 16, 1);

      doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
      const locTxt = loc ? clampLines(doc, loc, LOC_W - 6, 1) : "";

      const rowH = 18;
      ensureSpace(rowH + 6);

      const rowTop = y;

      // Color accent
      doc.save();
      doc.fillColor(e.color || "#2563eb").rect(xBase, rowTop + 2, 3, rowH - 4).fill();
      doc.restore();

      // Text columns
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827")
        .text(titleTxt, xBase + 10, rowTop + 3, { width: EVENT_W - 10 });

      if (locTxt) {
        doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
          .text(locTxt, xBase + EVENT_W, rowTop + 4, { width: LOC_W });
      }

      y += rowH;
      hr(doc, xBase, xBase + colW, y);
      y += 6;
    }

    doc.end();
  });
}

export default async function handler(req, res) {
  try {
    const days = Math.max(1, Math.min(3650, Number(req.query.days || 365)));
    const compact = String(req.query.compact || "").toLowerCase();
    const compactTwoColumn = compact === "1" || compact === "true" || compact === "2col";

    const cacheKey = `days=${days}&compact=${compactTwoColumn ? "2col" : "1col"}`;
    const now = Date.now();

    if (PDF_CACHE.buf && PDF_CACHE.key === cacheKey && now - PDF_CACHE.t < PDF_TTL_MS) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(PDF_CACHE.buf.length));
      return res.status(200).send(PDF_CACHE.buf);
    }

    const events = await fetchEventsDirect(days);
    const pdfBuf = await buildPdfBuffer(events, days, compactTwoColumn);

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

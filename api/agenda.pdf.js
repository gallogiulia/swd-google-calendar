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
  "a5a0d0467e9d3b32e9047a8101536f36657592785ecff078549b00979d84a590@group.calendar.google.com": "#2563eb",
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": "#7c3aed",
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": "#dc2626",
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": "#059669",
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": "#f59e0b"
};

// PDF legend (label -> calendar color)
const LEGEND_ITEMS = [
  { label: "Club Sponsored", color: CALENDAR_COLORS[IDS[0]] || "#2563eb" },
  { label: "PBA", color: CALENDAR_COLORS[IDS[1]] || "#7c3aed" },
  { label: "Men's", color: CALENDAR_COLORS[IDS[2]] || "#dc2626" },
  { label: "Women's", color: CALENDAR_COLORS[IDS[3]] || "#059669" },
  { label: "Other", color: CALENDAR_COLORS[IDS[4]] || "#f59e0b" }
];

function renderLegend(doc, x, y, items) {
  const box = 8;
  const gap = 10;
  let cx = x;

  doc.fontSize(9).fillColor("#111827").font("Helvetica-Bold").text("Legend:", cx, y);
  cx += 52;

  doc.font("Helvetica").fontSize(9);

  for (const it of items) {
    doc.save();
    doc.rect(cx, y + 2, box, box).fill(it.color);
    doc.restore();

    doc.fillColor("#111827").text(it.label, cx + box + 6, y);
    cx += box + 6 + doc.widthOfString(it.label) + gap;
  }
}

function fmtDateRangeShort(startISO, endISO, allDay) {
  const s = new Date(startISO);
  if (!endISO) {
    const sm = s.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const sd = String(s.getUTCDate()).padStart(2, "0");
    return `${sm} ${sd}`;
  }

  // Google all-day events use an exclusive end date (next day).
  let e = new Date(endISO);
  if (allDay) e = new Date(e.getTime() - 86400000);

  const sm = s.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const em = e.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const sd = String(s.getUTCDate()).padStart(2, "0");
  const ed = String(e.getUTCDate()).padStart(2, "0");

  // Same day
  if (s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10)) return `${sm} ${sd}`;

  // Same month → "Feb 07–12"
  if (sm === em) return `${sm} ${sd}–${ed}`;

  // Different month → "Feb 28–Mar 01"
  return `${sm} ${sd}–${em} ${ed}`;
}

function shortLocation(loc) {
  if (!loc) return "";
  const s = String(loc).replace(/\s+/g, " ").trim();

  // If it's already a short non-address location (e.g., "Arizona, USA"), keep it
  const looksLikeAddress =
    /\b\d{1,6}\b/.test(s) || /\b(ave|st|street|road|rd|blvd|drive|dr|lane|ln|pkwy|park)\b/i.test(s);

  // If it's "Club, 123 Main St, City, CA ..." -> keep "Club"
  if (s.includes(",")) {
    const first = s.split(",")[0].trim();
    if (first) return first;
  }

  // If it's address-y but no comma separation, keep the first ~40 chars
  if (looksLikeAddress) return s.slice(0, 40);

  return s;
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

function fmtDateShort(d) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit"
  }).format(d);
}

function fmtDateRange(startISO, endISO, allDay) {
  const s = new Date(startISO);
  if (!endISO) return fmtDateShort(s);

  // Google all-day events use an exclusive end date (next day).
  // For printing, show inclusive end date.
  let e = new Date(endISO);
  if (allDay) e = new Date(e.getTime() - 86400000);

  const sKey = s.toISOString().slice(0, 10);
  const eKey = e.toISOString().slice(0, 10);
  if (sKey === eKey) return fmtDateShort(s);
  return `${fmtDateShort(s)}–${fmtDateShort(e)}`;
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

async function fetchEventsDirect(days) {
  const key = process.env.GCAL_API_KEY;
  if (!key) throw new Error("Missing GCAL_API_KEY");

  const year = Number(globalThis.__SWD_YEAR__ || "");
  const useYear = year && Number.isFinite(year);
  const timeMin = useYear
    ? new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString()
    : new Date().toISOString();
  const timeMax = useYear
    ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)).toISOString()
    : new Date(Date.now() + days * 86400000).toISOString();

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

      const end = e.end?.dateTime || e.end?.date || "";

      events.push({
        id: `${id}:${e.id}`,
        title: e.summary || "",
        start,
        end,
        allDay: !!e.start?.date,
        location: e.location || "",
        color: CALENDAR_COLORS[id] || "#2563eb"
      });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

// ===== Compact PDF renderer =====
// mode: "agenda" (day headers) or "year" (one-line rows, ultra-compact)
async function buildPdfBuffer(events, days, compactTwoColumn, mode = "agenda", metaYear = null) {
  return await new Promise((resolve, reject) => {
    const isYear = mode === "year";

    // For year printouts: landscape + tighter margins + smaller type
    // Reduce margins slightly to give more horizontal room for locations.
    const M = isYear ? 16 : 32;
    const doc = new PDFDocument({
      size: "LETTER",
      layout: isYear ? "landscape" : "portrait",
      margin: M
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = isYear ? 792 : 612;
    const pageH = isYear ? 612 : 792;
    const left = M;
    const right = M;
    const top = M;
    const bottom = M;

    // Columns
    const cols = isYear ? 3 : (compactTwoColumn ? 2 : 1);
    // Tighter gutters in year mode to reclaim width for text.
    const gutter = cols > 1 ? (isYear ? 8 : 18) : 0;
    const colW = cols > 1
      ? Math.floor((pageW - left - right - gutter * (cols - 1)) / cols)
      : (pageW - left - right);

    const colX = (colIndex) => (left + colIndex * (colW + gutter));

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
      if (cols === 1) {
        newPage();
        return;
      }
      if (colIndex < cols - 1) {
        colIndex += 1;
        xBase = colX(colIndex);
        y = top;
        renderHeader(true);
      } else {
        newPage();
      }
    }

    function renderHeader(isContinued) {
      doc.save();

      // Header block
      if (isYear) {
        const yLabel = (metaYear && Number.isFinite(metaYear)) ? String(metaYear) : "";
        if (isContinued) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827")
            .text(`SWD Bowls — ${yLabel} Schedule`, xBase, y);
          y += 10;
        } else {
          doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827")
            .text(`SWD Bowls — ${yLabel} Full Year Schedule`, xBase, y);
          y += 12;
          doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
            .text(`Generated ${new Date().toLocaleDateString()}`, xBase, y);
        }
      } else {
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827")
          .text("SWD Bowls — Events Agenda", xBase, y);
        y += 16;
        doc.font("Helvetica").fontSize(9).fillColor("#6b7280")
          .text(`Next ${days} days • Generated ${new Date().toLocaleDateString()}`, xBase, y);
      }

      if (isContinued && !isYear) {
        doc.font("Helvetica").fontSize(8).fillColor("#9ca3af")
          .text("(continued)", xBase + colW - 70, y, { width: 70, align: "right" });
      }

      // Legend (only on the very first header block of the first column)
      if (isYear && !isContinued && xBase === left) {
        y += 10;
        renderLegend(doc, xBase, y, LEGEND_ITEMS);
        y += 12;
      }

      y += isYear ? 8 : 10;
      hr(doc, xBase, xBase + colW, y);
      y += isYear ? 8 : 10;

      // Column headings (optional, very small)
      doc.font("Helvetica-Bold").fillColor("#9ca3af");
      if (isYear) {
        // Allocate more width to LOCATION in year mode.
        const DATE_W_H = Math.max(58, Math.floor(colW * 0.18));
        const EVENT_W_H = Math.max(120, Math.floor(colW * 0.34));
        const LOC_W_H = colW - (DATE_W_H + EVENT_W_H);

        doc.fontSize(7);
        doc.text("DATE", xBase, y, { width: DATE_W_H });
        doc.text("EVENT", xBase + DATE_W_H, y, { width: EVENT_W_H });
        doc.text("LOCATION", xBase + DATE_W_H + EVENT_W_H, y, { width: LOC_W_H });
        y += 7;
      } else {
        doc.fontSize(8);
        doc.text("TIME", xBase, y, { width: 62 });
        doc.text("EVENT", xBase + 62, y, { width: Math.floor(colW * 0.55) - 62 });
        doc.text("LOCATION", xBase + Math.floor(colW * 0.55), y, { width: colW - Math.floor(colW * 0.55) });
        y += 8;
      }
      hr(doc, xBase, xBase + colW, y);
      y += isYear ? 7 : 10;

      doc.restore();
    }

    // First header
    renderHeader(false);

    if (!events.length) {
      doc.font("Helvetica").fontSize(11).fillColor("#111827")
        .text("No events found in the selected range.", xBase, y, { width: colW });
      doc.end();
      return;
    }

    // Column sizing
    // Column sizing
    // Year mode is extremely space-constrained; we keep DATE on one line by
    // (a) using a short date-range formatter and (b) giving DATE a bit more width.
    const DATE_W = isYear ? Math.max(62, Math.floor(colW * 0.20)) : 62;
    const EVENT_W = isYear
      ? Math.max(120, Math.floor(colW * 0.34))
      : (Math.floor(colW * 0.55) - DATE_W);
    const LOC_W = colW - (DATE_W + EVENT_W);

    let currentDayKey = "";

    function ensureSpace(needed) {
      const maxY = pageH - bottom;
      if (y + needed <= maxY) return;

      // go next column, then page
      nextColumnOrPage();
    }

    for (const e of events) {
      const start = new Date(e.start);
      const dayKey = start.toISOString().slice(0, 10);

      if (!isYear) {
        // Day header (tight)
        if (dayKey !== currentDayKey) {
          currentDayKey = dayKey;

          ensureSpace(26);

          doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827")
            .text(fmtDate(start), xBase, y, { width: colW });

          y += 12;
          hr(doc, xBase, xBase + colW, y);
          y += 8;
        }
      }

      // Row
      const dateStr = isYear
        ? fmtDateRangeShort(e.start, e.end, e.allDay)
        : (e.allDay ? "All day" : fmtTime(start));
      const title = safeText(e.title) || "(Untitled)";
      const loc = safeText(e.location);

      // Make rows compact but readable.
      doc.font("Helvetica").fontSize(isYear ? 7 : 9).fillColor("#374151");
      const dateTxt = safeText(dateStr);

      doc.font("Helvetica-Bold").fontSize(isYear ? 7 : 9).fillColor("#111827");
      const titleTxt = clampLines(doc, title, EVENT_W - 12, 1);

      doc.font("Helvetica").fontSize(isYear ? 6.5 : 8).fillColor("#6b7280");
      // In year view we intentionally print *club name only* (no street address)
      // so we can fit the full year in <= 2 pages.
      const locShort = isYear ? shortLocation(loc) : loc;
      const locTxt = locShort ? clampLines(doc, locShort, LOC_W - 4, 1) : "";

      const rowH = isYear ? 12 : 18;
      ensureSpace(rowH + (isYear ? 2 : 6));

      const rowTop = y;

      // Color accent
      doc.save();
      doc.fillColor(e.color || "#2563eb").rect(xBase, rowTop + 2, 3, rowH - 4).fill();
      doc.restore();

      // Text columns
      doc.font("Helvetica").fontSize(isYear ? 7 : 9).fillColor("#374151")
        .text(dateTxt, xBase + 8, rowTop + (isYear ? 2 : 3), { width: DATE_W - 8, lineBreak: false, ellipsis: true });

      doc.font("Helvetica-Bold").fontSize(isYear ? 7 : 9).fillColor("#111827")
        .text(titleTxt, xBase + DATE_W, rowTop + (isYear ? 2 : 3), { width: EVENT_W });

      if (locTxt) {
        doc.font("Helvetica").fontSize(isYear ? 6.5 : 8).fillColor("#6b7280")
          .text(locTxt, xBase + DATE_W + EVENT_W, rowTop + (isYear ? 2 : 4), { width: LOC_W, lineGap: isYear ? -1 : 0 });
      }

      y += rowH;
      if (!isYear) {
        hr(doc, xBase, xBase + colW, y);
        y += 6;
      } else {
        // Ultra-compact spacing for year view
        y += 2;
      }
    }

    doc.end();
  });
}

export default async function handler(req, res) {
  try {
    const year = Number(req.query.year || "");
    const days = Math.max(1, Math.min(3650, Number(req.query.days || 365)));
    const modeParam = String(req.query.mode || "").toLowerCase();
    const compact = String(req.query.compact || "").toLowerCase();
    const compactTwoColumn = compact === "1" || compact === "true" || compact === "2col";

    const hasYear = (year && Number.isFinite(year));
    const mode = (modeParam === "year" || modeParam === "agenda")
      ? modeParam
      : (hasYear ? "year" : "agenda");

    // Allow fixed year window exports: /api/agenda.pdf?year=2026
    globalThis.__SWD_YEAR__ = hasYear ? year : "";

    const cacheKey = hasYear
      ? `year=${year}&mode=${mode}&compact=${compactTwoColumn ? "2col" : "1col"}`
      : `days=${days}&mode=${mode}&compact=${compactTwoColumn ? "2col" : "1col"}`;
    const now = Date.now();

    if (PDF_CACHE.buf && PDF_CACHE.key === cacheKey && now - PDF_CACHE.t < PDF_TTL_MS) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=SWD-events-agenda.pdf");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(PDF_CACHE.buf.length));
      return res.status(200).send(PDF_CACHE.buf);
    }

    const events = await fetchEventsDirect(days);
    const pdfBuf = await buildPdfBuffer(events, days, compactTwoColumn, mode, hasYear ? year : null);

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

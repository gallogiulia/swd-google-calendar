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
  "1a6d4aa92fc88d6f6ef0692f3b45900cce0297b61e76a46b9c61401b20398d65@group.calendar.google.com": "#7c3aed", // Other Tournaments
  "2ba828746bb0f6ca0047de3bc085a2ae29632212ac9c4f48fe8deb1d46a732df@group.calendar.google.com": "#dc2626", // Men's
  "08e2468010fab3540a7b7c53f50a176ee3824cb700b3afbee8f706949e043783@group.calendar.google.com": "#059669", // Women's
  "0c84e06c3ecc1555848911155ee9d05e9234b47baf4aa87779c015934deb6c94@group.calendar.google.com": "#f59e0b"  // PBA
};

const LEGEND_ITEMS = [
  { label: "Women’s", color: "#059669" },
  { label: "Men’s", color: "#dc2626" },
  { label: "Club Sponsored", color: "#2563eb" },
  { label: "Other Tournaments", color: "#7c3aed" },
  { label: "PBA", color: "#f59e0b" },
];

function shortLocation(loc) {
  if (!loc) return "";
  const s = String(loc).replace(/\s+/g, " ").trim();

  const looksLikeAddress =
    /\b\d{1,6}\b/.test(s) || /\b(ave|st|street|road|rd|blvd|drive|dr|lane|ln|pkwy|park)\b/i.test(s);

  if (s.includes(",")) {
    const first = s.split(",")[0].trim();
    if (first) return first;
  }

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

function fmtDateShort(d) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit"
  }).format(d);
}

function hr(doc, x1, x2, y) {
  doc.save();
  doc.strokeColor("#e5e7eb").lineWidth(1);
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.restore();
}

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

function renderLegend(doc, x, y, items) {
  doc.save();
  const padX = 10;
  const padY = 7;
  const rowH = 14;
  const sw = 10;
  const gap = 8;

  let curX = x + padX;
  let curY = y + padY;

  doc.roundedRect(x, y, doc.page.width - x * 2, padY * 2 + rowH, 8)
    .fillAndStroke("#fafafa", "#e5e7eb");

  for (const it of items) {
    const label = String(it.label || "");
    doc.font("Helvetica").fontSize(9);
    const labelW = doc.widthOfString(label);
    const itemW = sw + gap + labelW + 14;

    if (curX + itemW > doc.page.width - x - padX) {
      curX = x + padX;
      curY += rowH;
    }

    doc.fillColor(it.color || "#2563eb")
      .roundedRect(curX, curY + 2, sw, sw, 2)
      .fill();

    doc.fillColor("#111827")
      .text(label, curX + sw + gap, curY, { lineBreak: false });

    curX += itemW;
  }

  doc.restore();
}

// --- Date helpers (UTC, date-only) ---
function isoDateUTC(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function addDaysISO(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDateRangeShort(startISO, endISO, allDay) {
  const s = new Date(startISO);
  if (!endISO) return fmtDateShort(s);

  let e = new Date(endISO);
  if (allDay) e = new Date(e.getTime() - 86400000);

  const sKey = s.toISOString().slice(0, 10);
  const eKey = e.toISOString().slice(0, 10);
  if (sKey === eKey) return fmtDateShort(s);
  return `${fmtDateShort(s)}–${fmtDateShort(e)}`;
}

function yearWindow(year) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { start, end };
}

async function fetchEventsDirect(days) {
  const key = process.env.GCAL_API_KEY;
  if (!key) throw new Error("Missing GCAL_API_KEY");

  const year = Number(globalThis.__SWD_YEAR__ || "");
  const useYear = year && Number.isFinite(year);

  const timeMin = useYear
    ? yearWindow(year).start.toISOString()
    : new Date().toISOString();

  const timeMax = useYear
    ? yearWindow(year).end.toISOString()
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
      const startRaw = e.start?.dateTime || e.start?.date;
      if (!startRaw) continue;

      const endRaw = e.end?.dateTime || e.end?.date || "";
      const wasAllDay = !!e.start?.date;

      const start = isoDateUTC(startRaw);
      if (!start) continue;

      let end = endRaw ? isoDateUTC(endRaw) : "";
      if (!end || end === start) end = addDaysISO(start, 1);

      if (!wasAllDay) {
        end = addDaysISO(start, 1);
      }

      events.push({
        id: `${id}:${e.id}`,
        title: e.summary || "",
        start,
        end,
        allDay: true,
        location: shortLocation(e.location || ""),
        color: CALENDAR_COLORS[id] || "#2563eb"
      });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

// mode: "agenda" or "year"
// showPartnerLines: when true, replace location column with blank writable line
async function buildPdfBuffer(
  events,
  days,
  compactTwoColumn,
  mode = "agenda",
  metaYear = null,
  showPartnerLines = false
) {
  return await new Promise((resolve, reject) => {
    const isYear = mode === "year";
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

    const cols = isYear ? 2 : (compactTwoColumn ? 2 : 1);
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

      if (isYear) {
        const yLabel = (metaYear && Number.isFinite(metaYear)) ? String(metaYear) : "";
        if (isContinued) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827")
            .text(
              showPartnerLines
                ? `SWD Bowls — ${yLabel} Schedule (Partner Lines)`
                : `SWD Bowls — ${yLabel} Schedule`,
              xBase,
              y
            );
          y += 10;
        } else {
          doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827")
            .text(
              showPartnerLines
                ? `SWD Bowls — ${yLabel} Full Year Schedule with Partner Lines`
                : `SWD Bowls — ${yLabel} Full Year Schedule`,
              xBase,
              y
            );
          y += 12;
          doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
            .text(`Generated ${new Date().toLocaleDateString()}`, xBase, y);
        }
      } else {
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827")
          .text(
            showPartnerLines
              ? "SWD Bowls — Events Agenda with Partner Lines"
              : "SWD Bowls — Events Agenda",
            xBase,
            y
          );
        y += 16;
        doc.font("Helvetica").fontSize(9).fillColor("#6b7280")
          .text(`Next ${days} days • Generated ${new Date().toLocaleDateString()}`, xBase, y);
      }

      if (isContinued && !isYear) {
        doc.font("Helvetica").fontSize(8).fillColor("#9ca3af")
          .text("(continued)", xBase + colW - 70, y, { width: 70, align: "right" });
      }

      y += isYear ? 8 : 10;

      if (!isYear && !isContinued) {
        y += 6;
        renderLegend(doc, xBase, y, LEGEND_ITEMS);
        y += 14 + 14;
      }

      hr(doc, xBase, xBase + colW, y);
      y += isYear ? 8 : 10;

      doc.font("Helvetica-Bold").fillColor("#9ca3af");

      if (isYear) {
        const DATE_W_H = Math.max(64, Math.floor(colW * 0.16));
        const EVENT_W_H = showPartnerLines
          ? Math.max(170, Math.floor(colW * 0.44))
          : Math.max(170, Math.floor(colW * 0.40));
        const THIRD_W_H = colW - (DATE_W_H + EVENT_W_H);

        doc.fontSize(7);
        doc.text("DATE", xBase, y, { width: DATE_W_H });
        doc.text("EVENT", xBase + DATE_W_H, y, { width: EVENT_W_H });
        doc.text(
          showPartnerLines ? "PARTNER(S)" : "LOCATION",
          xBase + DATE_W_H + EVENT_W_H,
          y,
          { width: THIRD_W_H }
        );
        y += 7;
      } else {
        doc.fontSize(8);
        const DATE_W_H = 78;
        const EVENT_W_H = showPartnerLines ? 220 : 180;
        const THIRD_W_H = colW - (DATE_W_H + EVENT_W_H);

        doc.text("DATE", xBase, y, { width: DATE_W_H });
        doc.text("EVENT", xBase + DATE_W_H, y, { width: EVENT_W_H });
        doc.text(
          showPartnerLines ? "PARTNER(S)" : "LOCATION",
          xBase + DATE_W_H + EVENT_W_H,
          y,
          { width: THIRD_W_H }
        );
        y += 8;
      }

      hr(doc, xBase, xBase + colW, y);
      y += isYear ? 7 : 10;

      doc.restore();
    }

    renderHeader(false);

    if (!events.length) {
      doc.font("Helvetica").fontSize(11).fillColor("#111827")
        .text("No events found in the selected range.", xBase, y, { width: colW });
      doc.end();
      return;
    }

    const DATE_W = isYear ? Math.max(64, Math.floor(colW * 0.16)) : 78;
    const EVENT_W = isYear
      ? (showPartnerLines ? Math.max(170, Math.floor(colW * 0.44)) : Math.max(170, Math.floor(colW * 0.40)))
      : (showPartnerLines ? 220 : 180);
    const THIRD_W = colW - (DATE_W + EVENT_W);

    let currentDayKey = "";

    function ensureSpace(needed) {
      const maxY = pageH - bottom;
      if (y + needed <= maxY) return;
      nextColumnOrPage();
    }

    for (const e of events) {
      const start = new Date(e.start);
      const dayKey = start.toISOString().slice(0, 10);

      if (!isYear) {
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

      const dateStr = fmtDateRangeShort(e.start, e.end, e.allDay);
      const title = safeText(e.title) || "(Untitled)";
      const loc = safeText(e.location);
      const thirdText = showPartnerLines ? "" : loc;

      doc.font("Helvetica").fontSize(isYear ? 7 : 9).fillColor("#374151");
      const dateTxt = clampLines(doc, dateStr, DATE_W, 1);

      doc.font("Helvetica-Bold").fontSize(isYear ? 7 : 9).fillColor("#111827");
      const titleTxt = clampLines(doc, title, EVENT_W - 12, 1);

      doc.font("Helvetica").fontSize(isYear ? 6.5 : 8).fillColor("#6b7280");
      const thirdTxt = thirdText ? clampLines(doc, thirdText, THIRD_W - 4, 1) : "";

      const wrapLines = isYear ? (thirdTxt ? thirdTxt.split("\n").length : 1) : 1;
      const rowH = isYear ? (wrapLines >= 3 ? 22 : wrapLines === 2 ? 16 : 12) : 18;

      ensureSpace(rowH + (isYear ? 2 : 6));

      const rowTop = y;

      doc.save();
      doc.fillColor(e.color || "#2563eb").rect(xBase, rowTop + 2, 3, rowH - 4).fill();
      doc.restore();

      doc.font("Helvetica").fontSize(isYear ? 7 : 9).fillColor("#374151")
        .text(dateTxt, xBase + 8, rowTop + (isYear ? 2 : 3), { width: DATE_W - 8 });

      doc.font("Helvetica-Bold").fontSize(isYear ? 7 : 9).fillColor("#111827")
        .text(titleTxt, xBase + DATE_W, rowTop + (isYear ? 2 : 3), { width: EVENT_W });

      if (showPartnerLines) {
        const lineY = rowTop + (isYear ? 8 : 11);
        const lineX1 = xBase + DATE_W + EVENT_W + 4;
        const lineX2 = xBase + DATE_W + EVENT_W + THIRD_W - 6;

        doc.save();
        doc.strokeColor("#9ca3af").lineWidth(0.8);
        doc.moveTo(lineX1, lineY).lineTo(lineX2, lineY).stroke();
        doc.restore();
      } else if (thirdTxt) {
        doc.font("Helvetica").fontSize(isYear ? 6.5 : 8).fillColor("#6b7280")
          .text(
            thirdTxt,
            xBase + DATE_W + EVENT_W,
            rowTop + (isYear ? 2 : 4),
            { width: THIRD_W, lineGap: isYear ? -1 : 0 }
          );
      }

      y += rowH;
      if (!isYear) {
        hr(doc, xBase, xBase + colW, y);
        y += 6;
      } else {
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

    const teamSheet = String(req.query.teamSheet || "").toLowerCase();
    const showPartnerLines = teamSheet === "1" || teamSheet === "true";

    const hasYear = (year && Number.isFinite(year));
    const mode = (modeParam === "year" || modeParam === "agenda")
      ? modeParam
      : (hasYear ? "year" : "agenda");

    globalThis.__SWD_YEAR__ = hasYear ? year : "";

    const cacheKey = hasYear
      ? `year=${year}&mode=${mode}&compact=${compactTwoColumn ? "2col" : "1col"}&team=${showPartnerLines ? "1" : "0"}`
      : `days=${days}&mode=${mode}&compact=${compactTwoColumn ? "2col" : "1col"}&team=${showPartnerLines ? "1" : "0"}`;
    const now = Date.now();

    if (PDF_CACHE.buf && PDF_CACHE.key === cacheKey && now - PDF_CACHE.t < PDF_TTL_MS) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${showPartnerLines ? "2026-SWBowls-Event-Calendar-with-Partner-Lines.pdf" : "2026-SWBowls-Event-Calendar.pdf"}`
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(PDF_CACHE.buf.length));
      return res.status(200).send(PDF_CACHE.buf);
    }

    const events = await fetchEventsDirect(days);
    const pdfBuf = await buildPdfBuffer(
      events,
      days,
      compactTwoColumn,
      mode,
      hasYear ? year : null,
      showPartnerLines
    );

    PDF_CACHE = { t: now, buf: pdfBuf, key: cacheKey };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${showPartnerLines ? "2026-SWBowls-Event-Calendar-with-Partner-Lines.pdf" : "2026-SWBowls-Event-Calendar.pdf"}`
    );
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
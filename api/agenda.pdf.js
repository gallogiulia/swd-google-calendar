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
  [IDS[0]]: "#2563eb",
  [IDS[1]]: "#7c3aed",
  [IDS[2]]: "#dc2626",
  [IDS[3]]: "#059669",
  [IDS[4]]: "#f59e0b"
};

function shortLocation(loc) {
  if (!loc) return "";
  const s = String(loc).replace(/\s+/g, " ").trim();
  return s.includes(",") ? s.split(",")[0] : s;
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

  let e = new Date(endISO);
  if (allDay) e = new Date(e.getTime() - 86400000);

  if (s.toDateString() === e.toDateString()) return fmtDateShort(s);
  return `${fmtDateShort(s)}–${fmtDateShort(e)}`;
}

function hr(doc, x1, x2, y) {
  doc.save();
  doc.strokeColor("#e5e7eb").lineWidth(1);
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.restore();
}

function renderLegend(doc, x, y) {
  const items = [
    { label: "Women", color: "#059669" },
    { label: "Men", color: "#dc2626" },
    { label: "Club", color: "#2563eb" },
    { label: "Other", color: "#7c3aed" },
    { label: "PBA", color: "#f59e0b" }
  ];

  let cx = x;
  const box = 7;
  const gap = 10;

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#111827").text("Legend:", cx, y);
  cx += 40;

  doc.font("Helvetica").fontSize(7);
  for (const it of items) {
    doc.save();
    doc.rect(cx, y + 2, box, box).fill(it.color);
    doc.restore();
    doc.fillColor("#111827").text(it.label, cx + box + 4, y);
    cx += box + 4 + doc.widthOfString(it.label) + gap;
  }
}

async function fetchEventsDirect(days) {
  const key = process.env.GCAL_API_KEY;
  if (!key) throw new Error("Missing GCAL_API_KEY");

  const year = Number(globalThis.__SWD_YEAR__ || "");
  const useYear = Number.isFinite(year) && year > 0;

  const timeMin = useYear
    ? new Date(Date.UTC(year, 0, 1)).toISOString()
    : new Date().toISOString();

  const timeMax = useYear
    ? new Date(Date.UTC(year + 1, 0, 1)).toISOString()
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
    for (const e of j.items || []) {
      const start = e.start?.dateTime || e.start?.date;
      if (!start) continue;

      events.push({
        title: e.summary || "",
        start,
        end: e.end?.dateTime || e.end?.date || "",
        allDay: !!e.start?.date,
        location: e.location || "",
        color: CALENDAR_COLORS[id] || "#2563eb"
      });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

async function buildPdfBuffer(events, days, mode, year) {
  return new Promise((resolve, reject) => {
    const isYear = mode === "year";
    const M = 16;

    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: M
    });

    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 792;
    const pageH = 612;
    const colW = Math.floor((pageW - M * 2 - 8) / 2);
    const gutter = 8;

    let col = 0;
    let x = M;
    let y = M;

    function header(first) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827")
        .text(`SWD Bowls — ${year} Full Year Schedule`, x, y);
      y += 12;

      if (first) {
        doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
          .text(`Generated ${new Date().toLocaleDateString()}`, x, y);
        y += 10;
        renderLegend(doc, x, y);
        y += 12;
      }

      hr(doc, x, x + colW, y);
      y += 8;
    }

    header(true);

    const DATE_W = Math.floor(colW * 0.18);
    const EVENT_W = Math.floor(colW * 0.50);
    const LOC_W = colW - DATE_W - EVENT_W;

    for (const e of events) {
      if (y > pageH - 30) {
        if (col === 0) {
          col = 1;
          x = M + colW + gutter;
          y = M;
          header(false);
        } else {
          doc.addPage();
          col = 0;
          x = M;
          y = M;
          header(false);
        }
      }

      const dateTxt = fmtDateRange(e.start, e.end, e.allDay);
      const title = safeText(e.title);
      const loc = shortLocation(e.location);

      doc.fillColor(e.color).rect(x, y + 2, 3, 10).fill();

      doc.font("Helvetica").fontSize(7).fillColor("#374151")
        .text(dateTxt, x + 8, y, { width: DATE_W - 8, lineBreak: false });

      doc.font("Helvetica-Bold").fontSize(7).fillColor("#111827")
        .text(title, x + DATE_W, y, { width: EVENT_W });

      doc.font("Helvetica").fontSize(6.5).fillColor("#6b7280")
        .text(loc, x + DATE_W + EVENT_W, y, { width: LOC_W });

      y += 12;
    }

    doc.end();
  });
}

export default async function handler(req, res) {
  try {
    const year = Number(req.query.year || 2026);
    globalThis.__SWD_YEAR__ = year;

    const events = await fetchEventsDirect(365);
    const pdf = await buildPdfBuffer(events, 365, "year", year);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=2026 SW Bowls Agenda.pdf");
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "PDF generation failed" });
  }
}

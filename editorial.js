/* ============================================================
   editorial.js — shared helpers for the editorial pages.

   Small, dependency-free, and deliberately boring: date parsing,
   discipline classification, and escaping. The pages themselves do
   the layout.
   ============================================================ */
window.SWD = (function () {
  'use strict';

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  /* Event dates are written for people, and often span days:
       "Saturday, April 18, 2026"
       "Saturday, August 8 - Sunday, August 9, 2026"
       "Saturday-Sunday, July 18-19, 2026"
       "Saturday, August 15 (Women) & Sunday, August 16, 2026 (Men)"
     Date() fails on every range, so find the first month-and-day and the
     year instead. Anything without a month returns null and is left out
     rather than shown with an invented date. */
  function startDate(text) {
    var s = String(text || ''), month = -1, day = null;
    for (var i = 0; i < MONTHS.length; i++) {
      var m = s.match(new RegExp(MONTHS[i] + '\\s+(\\d{1,2})'));
      if (m && (month === -1 || s.indexOf(MONTHS[i]) < s.indexOf(MONTHS[month]))) {
        month = i; day = parseInt(m[1], 10);
      }
    }
    if (month === -1 || !day) return null;
    var y = s.match(/\b(20\d{2})\b/);
    if (!y) return null;
    var d = new Date(parseInt(y[1], 10), month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  /* The discipline drives the colour. events-data.json has a `format`
     field for most events; fall back to reading the title. */
  var DISCIPLINES = ['singles', 'pairs', 'triples', 'fours', 'rinks'];
  function discipline(ev) {
    var f = String(ev.format || '').toLowerCase().trim();
    if (DISCIPLINES.indexOf(f) !== -1) return f;
    var t = String(ev.title || '').toLowerCase();
    for (var i = 0; i < DISCIPLINES.length; i++) {
      if (t.indexOf(DISCIPLINES[i]) !== -1) return DISCIPLINES[i];
    }
    return 'other';
  }

  /* Who the event is for. Read from the title, which is where the
     division actually states it. */
  function whoFor(ev) {
    var s = String(ev.title || '').toLowerCase();
    if (/mixed|mix\/match|mix and match|mixmatch/.test(s)) return 'Mixed';
    if (/women|ladies/.test(s)) return "Women's";
    if (/\bmen'?s?\b/.test(s)) return "Men's";
    return 'Open';
  }

  function label(ev) {
    var d = discipline(ev);
    var disc = d === 'other'
      ? (String(ev.format || '').trim() || 'Tournament')
      : d.charAt(0).toUpperCase() + d.slice(1);
    return whoFor(ev) + ' · ' + disc;
  }

  function fmtDate(d) {
    return SHORT[d.getMonth()] + ' ' + d.getDate();
  }
  function fmtLong(d) {
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function getJSON(path) {
    return fetch(path + (path.indexOf('?') === -1 ? '?' : '&') + 'v=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  /* Divisions run in flights keep their podium in the top flight. */
  function podium(div) {
    if (div.flights) return (div.flights[0] || {}).places || [];
    return div.places || [];
  }

  return {
    MONTHS: MONTHS, SHORT: SHORT,
    esc: esc, startDate: startDate, discipline: discipline,
    whoFor: whoFor, label: label, fmtDate: fmtDate, fmtLong: fmtLong,
    getJSON: getJSON, podium: podium
  };
})();

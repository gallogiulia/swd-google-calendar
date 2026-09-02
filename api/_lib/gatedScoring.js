// Live-scoring sheets that must not be visible before the tournament starts.
//
// The URLs live here, inside api/, because everything at the repo root is
// served publicly by Vercel - a JSON file of sheet links would just be a
// slower way of publishing them. api/ is not served, so these strings never
// reach a browser until opensAt has passed.
//
// Why this exists: the All Comers scoring sheets carry the rink assignment for
// every game, and players who can read them the night before can practise on
// the rink they will be playing. The event's own conditions of play promise a
// blind draw at check-in, so the draw stays dark until the morning of.
//
// To gate a new event: add an entry here, and in events-data.json give the
// event `"liveScoring": { "gated": true }` instead of a pubUrl. To retire the
// gate after an event is over, move the URL back into events-data.json as an
// ordinary pubUrl and delete the entry here.

const ALL_COMERS_2026 =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9M-jvDemQjTFHtgzXYuwpVTCHyGpA08FnZLSQc4PvVBdeh6QgP19oGM6OLEPqu4ZOimjhXAynBMA_/pubhtml';

// gid=<tab>&single=true drops the spreadsheet's tab strip, so each tab is
// embedded on its own rather than letting people browse the whole document.
function tab(gid) {
  return `${ALL_COMERS_2026}?gid=${gid}&single=true&widget=true&headers=false`;
}

export const GATED_SCORING = {
  'all-comers-open-pairs-2026': {
    // 7:00 AM Pacific on Saturday, the morning of the first qualifying day -
    // before the 8:15 check-in, after any useful practice window.
    opensAt: '2026-09-05T07:00:00-07:00',
    opensAtLabel: 'Saturday, September 5 at 7:00 AM',
    sheets: [
      { label: 'Game Play', url: tab('2104048266'), height: 900 },
      { label: 'Scoring — Day 1, Saturday', url: tab('1216577081'), height: 1800 },
      { label: 'Scoring — Day 2, Sunday', url: tab('10529951'), height: 1800 }
    ]
  }
};

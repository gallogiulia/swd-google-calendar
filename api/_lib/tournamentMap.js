export const TOURNAMENTS = [
  // add all 27 later; start with 3 sandbox
  { id: "swd_mumma_mixed_pairs", name: "SWD Mumma Mixed Pairs", format: "PAIRS_LOC", price_cents: 6000, greens: ["Green A", "Green B"] },
  { id: "us_playdowns_womens_singles", name: "US Playdowns - Women’s Singles", format: "SINGLES", price_cents: 3000, greens: [] },
  { id: "swd_5_men_all_star", name: "SWD 5-Men All Star", format: "FIVE_MAN", price_cents: 15000, greens: [] },
];

export function getTournamentByName(name) {
  const n = String(name || "").trim().toLowerCase();
  return TOURNAMENTS.find(t => t.name.toLowerCase() === n) || null;
}

# SWD Data & Formats — Findings (from the Google Drive corpus)

*Source: full SWD Drive export (Men's/Women's Tournaments + Docs), read 2026-07-04. ~40 tournament workbooks + 34 Conditions-of-Play/flyer docs + season standings aggregator. Feeds PRD §11 (migration), §15 (discovery), §16 (playdowns).*

---

## 1. How the Google Sheets are actually organized

**The dominant pattern — one workbook per tournament, one tab per year:**
- Each tournament = a single Google Sheet workbook (e.g., `SWD Mumma Mixed Pairs`).
- Inside: a tab **per year** — `2026 Entries`, `2025 Entries`, … back to `2012 Entries` (some to 2008).
- Current year usually has **two tabs**: `2026 Entries` *and* a bare `2026`.

**What the two current-year tabs actually are:**
| Tab | Role | Evidence |
|---|---|---|
| `2026` (bare) | **Raw form-submission collector** — the Squarespace entry form writes here via Apps Script | Columns: `Team #, Timestamp, Skip, Lead, …, Note/Green`; rows carry submission timestamps (e.g., `2026-01-25 11:13`) |
| `2026 Entries` | **Hand-arranged roster / draw sheet** — cleaned, ordered, assigned to greens | Mumma: laid out as `A Green` / `B Green` blocks with team numbers; ends with a manual `ENTRIES CLOSED` marker |

So the pipeline today is: **Squarespace form → `YYYY` collector tab (timestamped) → hand-copied/arranged into `YYYY Entries` → used for the draw.** That hand step is exactly where labor and errors live.

**Naming is inconsistent everywhere** (this is the "inconsistent tab structures" pain, concretely):
- `2026 Entries` vs `2026` vs `2025  Entries` (double space) vs `2022 Entries ` (trailing space) vs stray `Sheet1` (Men's Singles Playdowns) vs `Players` (Waterbury).
- Any importer must normalize by regex/trim, not exact match.

**Special cases:**
- **SW Open (Men & Women)** — different shape: tabs by **discipline × year** (`2026Fours | 2026Pairs | 2026Singles | SyncLog | 2025 Fours | …`) plus a **`SyncLog`** tab (the Apps Script sync log). This is the big multi-discipline championship; it aggregates many years in one workbook.
- **New per-discipline entry sheets** — `SW Open Women_s Singles/Pairs/Fours`, `SW Open Men_s Singles/Pairs/Fours` each have only a single `2026 Entries` tab. These look like 2026 split-out entry collectors feeding the main `SOUTHWEST OPEN` workbook.
- **Results Sheets** (separate workbooks under `.../Results Sheets/`) — end-by-end scoring, split by **session and division**: `Sat AM - Stars | Sat PM - Stars | Sun AM - Stars` (and a parallel Stripes workbook). Nationals template uses `Tues AM | Tues PM | … | Scoresheet`.

---

## 2. How scoring & standings work

**Per-game scoring (end-by-end sheets):** hand-built grids — per **rink**, per **session** (`Sat AM`), per **division** (`Stars`/`Stripes`). Each row = an end; columns track each team's shot count and running total. Very manual, very format-specific.

**Stripes vs Stars = PLAYDOWNS ONLY** (owner-confirmed). It is the qualifier mechanism: the playdowns field is split into two pools — "Stars" and "Stripes" — that each independently qualify a winner to Nationals. It is **not** used for regular events. Regular big-field events split by **A/B green** (often "separate tournaments per green"). The `EndBy_SWD22_LadiesPairs_Stars/Stripes` results sheets are from the **Pairs Playdowns** (a qualifier), consistent with this.

**Season-long standings aggregator** (`SWD 2026 Women's Standings.xlsx` — the "master dashboard"):
- Tabs: `Detailed Standings | Results | SWD Members | Standings (not sorted) | Normalized | Criteria | Instructions`.
- `Detailed Standings` = **one row per player**, **one column per tournament**, cell = points earned that event, plus `Total Points` and `Ranking`. A season points ladder.
- Confirms a real, maintained artifact the Hub could eventually auto-generate from results (kept **Phase 2** — see PRD §12).

---

## 3. Implication for the Hub data model (validates PRD §4)

The whole "tab-per-year × workbook-per-tournament" sprawl collapses into a few tables:
- Every `YYYY Entries` / `YYYY` tab across ~40 workbooks → rows in **`entries`** + **`entry_players`**, keyed by `event_id` + year. One table replaces ~500 tabs.
- The timestamped `YYYY` collector → the **online entry flow** (PRD §7). No more hand-copying form rows into a roster.
- The hand-arranged `YYYY Entries` green/rink layout → the **TD day console draw** (PRD §8).
- Stripes/Stars → an event that **splits into sections/divisions**, each producing results (`division_label` already modeled).
- Season aggregator → a **derived** view over `results` (Phase 2), not a hand-maintained sheet.

**Migration reality check:** for MVP, do NOT migrate 500 historical year-tabs. Import **current-year rosters** + the **member list** (from `SWD Members` tab of the standings file — a ready-made roster source). Historical tabs stay as read-only archive in Drive. (Refines PRD §11 step 6.)

---

## 4. Men's Singles Playdowns — why it's wonky (PRD §16)

**Observed:** the 2026 Men's Singles Playdowns entry list holds **~43 singles entrants** (numbered to 43 with names; slots to 45). Results split into **Stripes/Stars**.

**Hypothesis for the wonkiness:** a **large, variable singles field** (43 players) is genuinely hard to run fairly at one club over limited days/rinks. Sectioning 43 singles players, deciding how many advance from each section, and handling byes is awkward and changes every year with turnout — which is precisely why organizers "need a way to do it that makes sense with the people they have."

**This strongly supports the PRD §16 idea of a singles-qualifier structure engine**: input `entrant_count` (e.g., 43) + rinks + days + qualifiers-needed → propose structure, previewable before commit.

**Owner-confirmed facts (2026-07-04):**
- **Stars/Stripes applies to playdowns only** — two qualifying pools, each qualifies a winner to Nationals.
- **The men's double-elimination (>24 path) has been run WRONG for two years** (by "Bill"). So the Hub must implement a *correct* canonical double-elimination, not replicate current practice. Automating it fixes a multi-year error.
- **The men's seeding is also wonky** — prior-year winners preset + 2 performance seeds + rest drawn, applied inconsistently. Needs a deterministic documented rule.
- **Women's playdowns stay ≤24 → round robin → easy** (fully covered by the draw engine, §18).

See PRD §16 for the full breakdown and open questions for the men's committee.

---

## 5. Suggested next steps

1. **Confirm the Men's Singles Playdowns pain** with whoever runs it (turnout bands, advancement count, what broke) — §16 discovery.
2. **Pick the member roster source** — the `SWD Members` tab of the standings workbook looks like the cleanest existing roster; verify fields.
3. **Draw templates** — cross-read the repo `/score-sheets/` draw tables (`draw-2-3-4-game-8-16-teams`, `draw-5-6-game-10-16-teams`) against these rosters to codify the round-robin draw generator.
4. **Formats catalog** — extract each event's format/eligibility from the 34 Conditions-of-Play docs into one table (feeds the entry-form eligibility rules).

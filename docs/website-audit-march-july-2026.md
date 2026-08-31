# Southwest Lawn Bowls Website — Audit (March–July 2026)

Prepared for GG's newsletter planning conversation. Covers what the site looks like today and everything that changed underneath it since March 2026. Source: git history of the `swd-google-calendar` repo (159 commits since March 1) + current file/data state as of July 20, 2026.

---

## 1. The site today, in one paragraph

swlawnbowls.org is a Squarespace "shell" — nav, header, footer — with most of the actual content now living in a companion Vercel-hosted app (`swd-google-calendar.vercel.app`) and pulled into Squarespace pages via iframe. That split didn't exist in this form back in March: tournament pages, results, the homepage feature section, the season agenda, and several brand-new standalone pages (Welcome, Club Info, Delegates) have all moved into the repo since then, which means they can be edited and redeployed in minutes instead of hand-built in Squarespace.

## 2. Current page inventory

| Page | URL | What it does |
|---|---|---|
| Tournament Hub | swlawnbowls.org (root) | Landing page listing open/upcoming tournaments |
| Tournament detail pages | `/event?id=<slug>` | One page per tournament — flyer, COP, schedule, entries, fee, register/PayPal button. **43 tournaments** currently have a page |
| Results | `/results` → `/results_new` | Scrolling carousel of tournament results with photos, newest first. **18 tournaments** have posted results |
| Homepage feature | `/home-feature` (iframed into swlawnbowls.org homepage) | What's New feed, Coronado documentary feature, SW TV video panel, Facebook feed, Explore cards, upcoming livestreams grid |
| Season Agenda | `/agenda` (spreadsheet-style grid) and `/agenda-calendar` (calendar view) | Full-season tournament calendar with category colors, deadlines, holidays |
| Welcome / newcomer page | swlawnbowls.org/welcome | Photo-rich landing page for the license-plate/newcomer recruitment campaign; directory of all 26 clubs |
| Club Info | `/club-info` | Interactive map + verified contact info for every SWD club |
| Delegate Assembly | `/delegates` | Current delegate roster pulled from the published Google Sheet, privacy-filtered |
| Policies | `/policies` | Self-hosted By-Laws, Disciplinary Policy, Hand Signals, meeting minutes, tournament score sheets |
| Open Tournaments widget | `/open-tournaments` | Embeddable widget showing tournaments within their 6-week registration window |

Legacy pages from before March (`results.html`, `mens-pairs-results.html`, `womens-singles-results.html`, etc.) are still in the repo but superseded by the data-driven `results_new.html` — worth a mental note that they're not the current system if referenced anywhere.

## 3. What changed, by theme

### Tournament publishing became a real pipeline (April)
Before: tournament pages were one-off, hand-built. Starting mid-April, every tournament became a single JSON entry (`events-data.json`) rendered by one template (`event.html`). A Publisher tool was built for entering new tournaments, and by April 18 **every SW tournament had a working PayPal registration button** wired in. Roughly 30 tournament pages went up in the first two weeks alone.

### Results went the same route (April–July)
`results-data.json` + `results_new.html` replaced the old per-tournament results pages. Results are now posted as they come in — 18 tournaments so far, each with team photos, sorted newest-first. Small but real fixes along the way: name-spelling corrections, better-cropped photos, linking results back to the correct Squarespace event page.

### The homepage was substantially rebuilt (June)
The homepage feature section moved from a pasted Squarespace code block into the repo (`home-feature.html`), which unlocked a run of improvements:
- **What's New feed** — auto-generated from `news-data.json` + results data, no manual entry needed as of July 2
- **Live-scoring alerts** — a real-time scoreboard + draw/bracket embed that appeared on the homepage during the Men's and Women's US Nationals Singles Playdowns, then was removed once each event concluded
- **Southwest Bowls Facebook feed** added to the right column
- Featured banners for the newcomer Welcome page and the All Comers II tournament
- SW TV video panel and the upcoming-livestreams grid moved in from a separate Squarespace footer injection, making the whole homepage self-contained in one file

### Season agenda redesign (June)
The agenda went through several iterations in a single day — calendar view, then a spreadsheet-style grid, category colors, US holidays, a blue theme — landing on `/agenda` as a classic-sheet-style grid that's now the primary calendar view, with `/agenda-calendar` kept as an alternate.

### Three brand-new standalone pages (June)
- **Welcome page** — built for the license-plate newcomer campaign; went through a full visual redesign (Webflow-style, real club photos, 26-club directory) before landing
- **Club Info** — interactive map with verified contact info per club
- **Delegate Assembly page** — roster pulled live from the Delegate Assembly's Google Sheet

### Policies page cleanup (June)
By-Laws, Disciplinary Policy, Hand Signals, and multiple EB meeting minutes were self-hosted (previously dead/external links) and organized with tournament score sheets and an Intro to Bowls doc.

### Live scoring for major tournaments (June–July)
Real-time scoring spreadsheets were added to tournament pages as they happened: Coronado Crown City Cup, Pat Gonzales Pairs, Men's and Women's Singles Playdowns, San Diego Mixed Triples. For the two Singles Playdowns events, this scoring feed was also surfaced as a temporary live-alert banner on the homepage itself during the event weekend.

### Behind-the-scenes infrastructure (April, ongoing)
Less visible to members but worth a mention if the newsletter goes technical: a `sync-links` system auto-matches tournament pages to their Squarespace listing URLs and self-heals broken links; the events feed got gender-aware matching and gets refreshed on a short cache TTL so registration deadlines stay current.

## 4. By the numbers (since March)

- **159** commits / discrete changes to the site
- **43** tournament pages currently published
- **18** tournaments with results posted (photos + placements)
- **26** clubs represented in the new Club Info directory
- **3** brand-new standalone pages shipped (Welcome, Club Info, Delegates)
- Homepage rebuilt from a static Squarespace block into a self-contained, auto-updating page

## 5. Possible newsletter angles

- "Behind the scenes" piece on how tournament registration went from manual/email to instant online entry + payment across the whole division
- Spotlight on the new Welcome page for the license-plate recruitment push
- "Did you know" — live scoring during the US Nationals Playdowns, in case members missed it
- Club Info / Delegates pages as a "find your club" or governance-transparency angle

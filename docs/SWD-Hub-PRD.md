# PRD — SWD Hub v1.0

**Tournament operations and member platform for the Southwest Division, Bowls USA**
Owner: GG (Giulia Gallo) · Target engineer: Fable 5 · Repo: **new repo (`swd-hub`), NOT `swd-google-calendar`** (see §1a/§3) · Date: 2026-07-04

---

## 0. Executive summary (read this first)

**What it is.** SWD Hub is one database-backed web app (Next.js + Supabase + PayPal on Vercel) that replaces today's fragile stack — ~40 Google Sheets, breakable Apps Script, and a PayPal entry hack that loses player data. It lets a **tournament director run an event end-to-end without GG**: publish → take online entries → check in → assign rinks → score → post results → feed the livestream overlay. Every write is authenticated, permissioned, and audited.

**Why now.** Three pains, in the owner's words "everything is broken": (1) PayPal's 127-char field truncates multi-player entries → data loss on every registration; (2) ~40 inconsistent sheets + fragile Apps Script; (3) no TD self-service — everything routes through GG, who hand-edits JSON and pushes git for every change. Plus an untrustworthy 4-hop livestream pipeline and no audit trail (a sheet was once wiped with no accountability).

**Non-negotiables (from the owner):**
- **New repo / new folder / new Vercel project** — never touch the live `swd-google-calendar` site.
- **TD full self-service is the whole point.**
- **Maintainability is a hard requirement** — a solo volunteer must be able to run this; lean entirely on managed services, document as we build, add a backup admin.
- **Keep PayPal** (fix the architecture, don't switch processors). **Keep Squarespace** for now (it holds the domain), but build public pages good enough that the Hub can *become* the site later.

**MVP = 7 features** (§5), sequenced as **8 build slices** (§14) so relief comes fast: GG stops hand-editing JSON at slice 2, the PayPal data-loss bug dies at slice 3, and TD self-service (the goal) lands at slice 5.

**The one genuinely hard problem: the Men's Singles Playdowns** (§16). Everything else is tractable — nearly every event is a round-robin off a *fixed draw table* (§18), with one shared 3/1/0 scoring model (§17). The men's singles playdowns is the exception: a large field (~43) forced into two-weekend **double elimination** that's been **run incorrectly for two years**, layered on a **subjective seeding process** ("top 4 voted by committee"), with the **flyer and Conditions of Play contradicting each other**. It's the highest-value *and* hardest automation, needs human-authored correct rules first, and ships last.

**Status.** This PRD + `SWD-Data-Findings.md` are grounded in the real data (every 2026 event's rules, the draw templates, the entry/results sheets). Remaining unknowns are **human decisions**, not missing data: the correct men's bracket + seeding rule, resolving the flyer/CoP conflict, and picking the pilot event.

---

## 1. Product thesis

SWD Hub replaces the fragile Sheets + Apps Script + PayPal-custom_id pipeline with one database-backed web app on Vercel where tournament directors run events end-to-end — publish, take online (PayPal) entries, check in players, assign rinks, record scores, post results — without GG in the loop. Every write is authenticated, permissioned, and audited, and every public surface (event pages, entry lists, standings, live overlays) reads from the same database via stable APIs.

### 1a. Owner directives (locked)

These come directly from the owner and override conflicting assumptions elsewhere in this doc:

1. **New repo / new folder / new Vercel project.** The Hub is NOT built inside `swd-google-calendar` (the live auto-deploy site). It gets its own repository (`swd-hub` or similar) and its own Vercel project. Integration with the existing site is via compatibility endpoints + rewrites only.
2. **TD full self-service is the point.** A tournament director runs event day with zero GG involvement. This is the primary success criterion, not a nice-to-have.
3. **Maintainability is a hard requirement, not an afterthought.** The owner is a solo volunteer (~$150/mo honorarium) and is *explicitly worried* about maintaining a system more complex than today's static files. Therefore: (a) lean entirely on managed services (Supabase, PayPal) so the owner configures but never operates infrastructure; (b) Fable 5 writes a plain-language runbook *as it builds* (add an event, issue a refund, common fixes); (c) a second backup admin exists from day one (bus-factor); (d) ship in digestible slices, each removing real pain, never one big black box.
4. **Pilot event is TBD.** Build generic. Do not hardcode any single tournament.
5. **Keep PayPal — do NOT switch to Stripe.** SWD's payment account is PayPal (treasurer/org setup); changing processors is an org decision, not a technical one, and is out of scope. The 127-char data-loss bug is fixed by architecture, not by changing processors (see §7): player data lives in Postgres; PayPal carries only a tiny `entry_id` reference. Code the payment layer processor-agnostic so a future swap is small, but ship on PayPal.
6. **Squarespace stays for MVP, but the long-term goal is to replace it.** It currently holds the domain (swlawnbowls.org) and is the public-site backbone, so MVP integrates via iframe/rewrite as today. BUT it is clunky and underused, and the owner's stated direction is: *once the Hub is a nice enough full website, move off Squarespace and point the domain at Vercel.* **Implication for the build:** design the Hub's public-facing pages (home, events, results, news) to be good enough to eventually stand alone as the whole site — not merely an admin tool hidden behind an iframe. Domain migration itself is Phase 3, not MVP.
7. **"Everything is broken" is the mandate, but sequence for fast relief.** The owner's top pain is *no TD self-service* + *the Sheets* + *Squarespace's clunkiness*. Build order (§14) is designed so each slice removes real pain fast, never one big black box.

---

## 2. Users and roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| **Public** | Anyone, no login | View events, entry lists (names only), draws, live scores, results, news | See emails/phones/payment data; write anything |
| **Member** | Registered bowler with account | Enter events, pay, manage own entries (edit team/withdraw before deadline), view own payment history | Edit others' entries; see admin views |
| **Tournament Director (TD)** | e.g., Anne Nunes; assigned per-event | Full control of **their assigned events only**: edit event details, open/close entries, record offline payments, check-in, rink assignment, enter/verify scores, publish results | Edit other events; manage users; issue refunds (can request); delete events |
| **Division Admin** | GG + 1 backup | Everything TDs can do on all events, plus: create events, assign TDs, manage members/clubs, publish news, issue Stripe refunds, run migrations/exports, view audit log | Delete audit log entries (nobody can) |
| **System** | Stripe webhooks, cron | Confirm payments, expire holds | — |

**Hard permission rules (enforce server-side, not just in UI):**
- Every mutating endpoint checks `role` + (for TDs) `event.td_ids.includes(user.id)`.
- Nothing is ever hard-deleted by TDs; `status`/`deleted_at` soft-deletes only. This is the direct fix for the Amador Martinez sheet wipe.
- Every write inserts an `audit_log` row (see §4). No exceptions.

---

## 3. Tech stack decision

**Recommendation: Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage) + PayPal Checkout (Orders API v2), deployed on Vercel. Tailwind + shadcn/ui.**

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js App Router, TypeScript | Vercel-native, server actions cut API boilerplate, one deploy target |
| DB | Supabase Postgres | Base44 app already uses Supabase → schema/concepts port directly; free tier covers SWD scale (~1k members, ~40 events/yr); RLS as defense-in-depth |
| Auth | Supabase Auth, **magic link only** (no passwords) | Demographic skews older — email link beats password resets; free; roles stored in our own `users` table, not JWT claims |
| Payments | **PayPal Checkout (Orders API v2)** + webhooks | Keeps SWD's existing PayPal account (no processor change). Kills the 127-char problem structurally: PayPal carries only `entry_id` in `custom_id`/`invoice_id`; all player data lives in Postgres before checkout starts. Layer coded processor-agnostic for a future swap. |
| Storage | Supabase Storage | Flyers/CoPs PDFs, winner photos (currently in `/photos/` and Squarespace CDN) |
| ORM | Drizzle | Typed schema-in-code, trivial migrations, one-person maintainable |
| UI | Tailwind + shadcn/ui | Matches the Base44 portal; reuse `QuestionRenderer` patterns later |
| Overlay | Plain JSON API + static HTML overlay page in same app | Collapses Sheets → Apps Script → Netlify → GitHub Pages into one URL |

**Repo strategy:** new app in a `hub/` directory (or new repo `swd-hub`) with a Vercel rewrite from the existing project, so current static pages (`event.html`, `results.html`, etc.) keep working untouched during migration. Do **not** rewrite the existing pages in v1 — point them at compatibility JSON endpoints (§11).

**Explicitly rejected:** keeping Apps Script anywhere in the write path; Google Sheets as a datastore; separate Netlify/GitHub Pages hops; **and the root antipattern — carrying player data in the payment provider's `custom_id` field.** PayPal itself is kept.

Cost: Vercel Hobby/Pro + Supabase free + PayPal per-transaction (standard nonprofit/business rate, absorbed or passed through as an optional fee) ≈ **$0–20/month** fixed.

---

## 4. Data model

Adapted from the Base44 entities (Member, Club, Division, AuditLog carry over; Program/Assessment/Quiz entities are Phase 2) plus the shapes already in `events-data.json` / `results-data.json`.

### `users`
`id (uuid)`, `email (unique)`, `role (enum: member | td | admin)`, `member_id (fk, nullable)`, `created_at`, `last_login_at`

### `clubs`
`id`, `name`, `short_name`, `address`, `map_url`, `green_count (int)`, `rinks_per_green (int, default 8)`, `contact_name`, `contact_email`, `contact_phone`, `active (bool)`

### `members`
`id`, `first_name`, `last_name`, `display_name`, `email`, `phone`, `club_id (fk)`, `bowls_usa_number (nullable)`, `gender (enum: M | F | X)`, `novice_since (date, nullable)` — derives novice status per the 24-month rule already encoded in `events-data.json`'s `noviceDefinition`, `notes`, `created_at`, `deleted_at`

### `events`  *(supersedes events-data.json entries; keep field parity so migration is 1:1)*
- `id (slug, e.g. mumma-mixed-pairs-2026)`, `title`, `subtitle`, `status (see §6)`
- `start_date`, `end_date`, `schedule (jsonb[] — the timeline lines)`
- `format (enum: singles | pairs | triples | rinks)`, `format_details (text)`, `team_size (int, derived)`
- `host_club_id (fk)`, `greens_used (text[], e.g. ["North","South"])`
- `fee_cents (int)`, `fee_unit (enum: per_team | per_player)`, `entry_deadline (timestamptz)`, `refund_policy (text)`, `max_entries (int, nullable)`
- `rules (text[])`, `eligibility (jsonb — e.g. {min_women:1, min_novices:1, mixed_required:true})`
- `td_ids (uuid[])`, `contact (jsonb: name/phone/email/mail_to)`
- `flyer_url`, `cops_url`, `livestream_notice (bool)`, `livestream_url (nullable)`
- `created_by`, `published_at`, `created_at`, `updated_at`

### `entries`
`id`, `event_id (fk)`, `status (enum: pending_payment | confirmed | waitlisted | withdrawn | refunded)`, `submitted_by (user fk)`, `team_name (nullable)`, `payment_id (fk, nullable)`, `paid_offline (bool)`, `offline_note (text)`, `check_in_status (enum: not_checked_in | checked_in | no_show)`, `created_at`, `updated_at`

### `entry_players`  *(the structural fix for the 127-char loss)*
`id`, `entry_id (fk)`, `member_id (fk, nullable — allow free-text for non-members)`, `full_name`, `position (enum: skip | vice | lead | second | player)`, `club_name (denormalized)`, `is_novice_at_event (bool, computed at entry time)`

### `payments`
`id`, `entry_id (fk)`, `provider (enum: paypal | offline)`, `paypal_order_id`, `paypal_capture_id`, `amount_cents`, `status (enum: created | paid | failed | refunded | expired)`, `paid_at`, `refunded_at`, `raw_webhook (jsonb)`

### `games`
`id`, `event_id`, `round (int)`, `label (e.g. "Game 2", "Semifinal")`, `green (text)`, `rink (int)`, `team_a_entry_id`, `team_b_entry_id`, `score_a (int)`, `score_b (int)`, `ends_played (int, nullable)`, `status (enum: scheduled | in_progress | reported | verified)`, `reported_by`, `verified_by`, `updated_at`

### `results`  *(final placements; supersedes results-data.json)*
`id`, `event_id`, `division_label (nullable — "Stripes"/"Stars"/null, matches current JSON)`, `rank (int)`, `entry_id (fk, nullable)`, `names (text — display string, e.g. "Phil Dunn / Dee McSparran")`, `photo_url`, `published (bool)`

### `news_items`
`id`, `date`, `type (enum: tournament | update | result | announcement)`, `title`, `body`, `link`, `auto_generated (bool)` — auto-created on entries-open and results-published transitions.

### `audit_log`
`id`, `actor_user_id`, `actor_role`, `action (text, e.g. "entry.withdraw")`, `entity_type`, `entity_id`, `before (jsonb)`, `after (jsonb)`, `created_at`. **Append-only; no update/delete grants for any app role.**

---

## 5. MVP scope — 7 features

### F1 — Auth & roles
*As a TD, I sign in with an email magic link and see only the admin tools for my events.*
- ✅ Magic-link sign-in; session persists 30 days
- ✅ Admin can set role and assign TDs to events from a Users screen
- ✅ Unauthenticated hit on any admin route → sign-in, then redirect back
- ✅ Server rejects (403) any mutation outside the caller's role/event scope, verified by test

### F2 — Event publisher (finishes `event-publisher.html`, see §9)
*As an admin, I create and publish an event without editing JSON or committing to git.*
- ✅ Form covers every field the current `events-data.json` supports (schedule lines, rules list, eligibility, flyer/CoPs upload, contact)
- ✅ Draft preview renders the exact public event page before publishing
- ✅ Publishing makes `/event?id=<slug>` live within 60 seconds, no deploy
- ✅ Existing `event.html` continues to render migrated events identically (visual diff on 3 sample events)

### F3 — Online entry + PayPal payment (§7)
*As a bowler, I enter an event with my partner and pay online in one flow.*
- ✅ Player names of any length/count stored losslessly (test: 4-player rinks team, 30-char names)
- ✅ Entry becomes `confirmed` only on PayPal webhook, never on client redirect
- ✅ TD can record a check/cash entry as `paid_offline`
- ✅ Duplicate-player detection warns if a member appears in two entries for the same event

### F4 — Public entry list & counts
*As a bowler, I can see who's entered before the deadline.*
- ✅ `/event?id=X` shows confirmed entry count and team names (players + clubs only — no contact info)
- ✅ Waitlist shown separately when `max_entries` reached
- ✅ Updates without redeploy (SSR or ≤60s revalidate)

### F5 — Tournament day console (§8)
*As a TD, I run check-in, rinks, and scores from my phone at the green.*
- ✅ All console screens usable at 390px width (TDs use phones — mirrors the existing `results-publisher-mobile.html` lesson)
- ✅ Check-in, rink assignment, score entry each work in ≤3 taps per action
- ✅ Score edits after `verified` require admin and are audit-logged

### F6 — Results publishing (replaces `results-publisher.html`)
*As a TD, I post final placements with photos from my phone right after the trophy shot.*
- ✅ Ranks 1–4, division splits (Stripes/Stars), photo upload with auto-resize (~1600px max, JPEG)
- ✅ Published results appear on `/results` and auto-generate a news item
- ✅ Matches current `results-data.json` display contract so `results.html` works unchanged during migration

### F7 — Live overlay API (§10)
*As GG streaming an event, ECamm reads one stable URL that never breaks.*
- ✅ `GET /api/overlay/{event_id}` returns current-game JSON in <300ms, cache 5s
- ✅ Overlay HTML page in-app renders it as an OBS/ECamm browser source
- ✅ Zero dependency on Sheets, Apps Script, Netlify, or GitHub Pages

**Pilot gate:** the first real tournament run entirely on the Hub — entries via Stripe, day-of ops by the TD, results published same day, GG touches nothing but the livestream. *(Pilot event TBD — build generic, not hardcoded to any one event. Mumma Mixed Pairs is a candidate, not a commitment.)*

> **North-star requirement (from owner):** TD **full self-service** is the point of this project. A TD must run an entire event day — check-in, draws, scores, results — with zero involvement from GG. Every roles/permissions and day-console decision serves this.

---

## 6. Event lifecycle state machine

```
draft ──publish──▶ published ──open_entries──▶ entries_open
                                                   │
                                          close_entries (manual
                                          or auto at deadline)
                                                   ▼
                    in_progress ◀──start_event── entries_closed
                         │                            │
                         │                       post_draws
                    finish_event                 (draws_posted flag,
                         ▼                        not a state)
                    completed ──publish_results──▶ archived

any pre-completed state ──cancel──▶ cancelled
```

| Transition | Who | Side effects |
|---|---|---|
| `publish` | Admin | Page live; optional auto news item |
| `open_entries` | Admin/TD | Entry form enabled; auto news item ("Entries Now Open" — matches current news-data.json pattern) |
| `close_entries` | TD or cron at `entry_deadline` | Entry form disabled; late entries TD-only |
| `start_event` | TD (event day) | Day console unlocked; overlay API goes live |
| `finish_event` | TD | All games must be `verified` or explicitly voided; scores frozen for TDs |
| `publish_results` | TD | Results public; news item; overlay switches to final standings |
| `cancel` | Admin only | Entries flagged for refund; page shows cancelled banner |

Guards: no `start_event` before `entries_closed`; no `publish_results` with unverified games; no state skips except admin `cancel`.

---

## 7. Entry system (keep PayPal, fix the architecture)

**Root cause being fixed:** PayPal `custom_id` (127 chars) was the *only* carrier of player data, parsed by regex in Apps Script. That is the bug — not PayPal itself. In the new design, **the payment carries only an `entry_id`** (tiny, fixed-length) in `custom_id`/`invoice_id`; all player data is written to Postgres *before* money moves. Same PayPal account, bug gone.

**Flow:**
1. Bowler opens `/enter/{event_id}` (linked from event page). Signed-out users enter email → magic link → return to a restored draft.
2. Form renders `team_size` player slots from `event.format`. Each slot: typeahead against `members` (name + club) or free-text fallback (`member_id = null`). Position labels per format (Skip/Vice/Lead for triples, per current `formatDetails`).
3. Client + server validate `event.eligibility` (e.g., mixed: exactly 1 man + 1 woman; Vet/Novice: ≥1 woman, ≥1 novice). Violations block submit with a plain-language message.
4. Submit → `entries` row (`pending_payment`) + `entry_players` rows → **PayPal Order created server-side (Orders API v2)**: `amount = fee_cents`, `custom_id = entry_id`, `invoice_id = entry_id`. PayPal Smart Buttons (or hosted redirect) complete payment; `return_url = /enter/confirmed?entry={id}`.
5. **Webhook `PAYMENT.CAPTURE.COMPLETED`** (verified against PayPal's webhook signature) → create `payments` row (`paid`), flip entry to `confirmed` (or `waitlisted` if `max_entries` was hit in the meantime — check inside a transaction), email confirmation to submitter.
6. No capture within 30 min (order stays `CREATED`/`APPROVED`) → 60-min cron sweep → entry `withdrawn`, slot released.
7. Offline path: TD "Add entry (paid offline)" → `confirmed` immediately, `paid_offline = true`, note required.
8. Withdrawal: self-service until `entry_deadline` → status `withdrawn`, refund flagged for admin (manual PayPal refund in MVP, deep-link to the transaction). After deadline: TD/admin only, per `refund_policy`.

**Acceptance criteria**
- ✅ Webhook is the sole source of `confirmed`; PayPal webhook signature verified; idempotent on replay (dedupe by `paypal_capture_id`)
- ✅ Kill the browser after paying → entry still confirms (webhook path independent of redirect)
- ✅ `max_entries` never exceeded under concurrent checkouts (transactional capacity check)
- ✅ Confirmation email lists all players, fee paid, event details
- ✅ Zero character limits anywhere in the player-data path (PayPal only ever sees `entry_id`)

---

## 8. Tournament day operations (TD console)

Route: `/td/{event_id}` — tabs **Check-in · Rinks · Scores · Results**. Phone-first.

**Check-in:** roster of confirmed entries, one tap toggles `checked_in`; long-press → `no_show`. Header shows `12/16 checked in`. No-shows visibly excluded from draw generation.

**Rink assignment:** per round, TD taps "Generate round" → app pairs checked-in entries and assigns `green` + `rink` from the host club's rink inventory, avoiding repeat opponents and repeat rinks where possible (greedy is fine for MVP; **manual drag/override always available and wins**). "Post draw" makes it public on the event page and printable via existing `print.html` pattern. MVP algorithm: random round-robin draw for 3–4 game formats (the Mumma/Vet-Novice style "four 12-end games" events). Bracket/knockout draws (playdowns): **manual assignment only** in MVP.

**Score reporting:** per game: two big steppers (score A / score B) + optional ends played → `reported`. Optional public path: event page shows a "Report score" link per game with a per-event 4-digit PIN (printed on scorecards) so markers can submit; all public reports land as `reported`, never `verified`.

**Verification:** TD reviews reported scores against paper cards → `verified`. `finish_event` blocked until every game is `verified` or voided. Post-verification edits: admin only + audit log + reason field.

**Standings:** computed live from `verified` games — wins, then points differential (configurable plus cap, default +/-15... MVP: raw differential, cap as event setting `diff_cap`). Shown on event page and fed to overlay.

**Acceptance criteria**
- ✅ Full happy path (16 entries, 4 rounds) executable by a non-technical TD with a one-page cheat sheet
- ✅ Draw regeneration before posting doesn't leak to public page
- ✅ Standings update within 5s of a score being verified
- ✅ Works on iPhone Safari over spotty club wifi (all writes are small POSTs, optimistic UI with retry)

---

## 9. Admin / publisher flow

Finishes the never-adopted `event-publisher.html` with the two things it lacked: **auth and workflow**.

- `/admin` dashboard: events by status, entry revenue this season, pending refund requests, recent audit entries.
- **Event editor** (create/edit): sections mirroring the current JSON — Basics, Schedule (repeatable time+text rows), Format & eligibility (structured, not free text), Fees & deadline, Rules (repeatable), Files (flyer/CoPs upload to Supabase Storage — replaces Squarespace CDN links), Contact, TD assignment.
- **"Duplicate from last year"** — one click clones e.g. `mumma-mixed-pairs-2026` → `-2027` with dates cleared. This is the single highest-leverage admin feature given the annual event cycle.
- Live preview pane = the real public event component, draft data.
- News manager: CRUD on `news_items` + review queue for auto-generated ones.
- Users screen: promote member→TD, assign to events.
- Audit log viewer: filter by entity/actor/date; read-only.

**Acceptance:** GG publishes a complete event (with flyer PDF) in <10 minutes with zero git operations; a TD editing an unassigned event gets 403.

---

## 10. Live overlay feed

Replaces: Sheets → Apps Script JSON → Netlify → GitHub Pages → ECamm (four failure points) with: **Postgres → `/api/overlay` → ECamm** (zero moving parts).

**`GET /api/overlay/{event_id}`** — public, no auth, `Cache-Control: s-maxage=5`:

```json
{
  "event": { "id": "mumma-mixed-pairs-2026", "title": "2026 Mumma Mixed Pairs",
             "status": "in_progress", "round": 3 },
  "featured_game": {
    "green": "North", "rink": 4, "ends_played": 8,
    "team_a": { "names": "Nunes / Herbert", "club": "Newport Harbor", "score": 12 },
    "team_b": { "names": "Dunn / McSparran", "club": "Laguna Beach", "score": 9 }
  },
  "standings": [
    { "rank": 1, "names": "Nunes / Herbert", "wins": 3, "diff": 21 }
  ],
  "updated_at": "2026-08-22T18:42:11Z"
}
```

- TD console gets a "Feature on stream" toggle per game (sets `featured_game`; defaults to most recently updated in-progress game).
- **`/overlay/{event_id}`** — transparent-background HTML page (lower-third scorebug + optional standings panel, SWD navy/gold), polls the API every 5s. ECamm/OBS adds it once as a browser source; **the URL never changes across events of the same slug pattern**, and `/overlay/live` can alias the currently in-progress event.
- When event completes: renders final standings; when nothing live: renders nothing (transparent).

**Acceptance:** score verified in TD console → visible in ECamm within 10s; overlay survives a Vercel redeploy mid-stream (stateless, cache-backed).

---

## 11. Migration path

**Order matters — each step is independently shippable and reversible.**

1. **Schema + seed clubs** — one-time script; club list is small and known.
2. **Import `events-data.json`** — script maps 1:1 to `events` (slugs preserved, so all existing `?id=` links keep working — per the standing rule that broken event links = id mismatch). Dates parsed from display strings; flyer/CoPs PDFs downloaded from Squarespace CDN into Storage.
3. **Import `results-data.json`** — → `results` rows; photos already in repo `/photos/` → Storage; `names` strings kept verbatim (no need to split pairs/triples names retroactively).
4. **Import `news-data.json`** — trivial.
5. **Compatibility endpoints** — `/api/compat/events-data.json`, `/api/compat/results-data.json`, `/api/compat/news-data.json` emit the *exact* legacy shapes from the DB. Point `event.html`, `results.html`, `home-news.html` at these via one-line fetch-URL changes. From this moment the DB is the source of truth and the static JSON files are frozen (kept in git as backup, no longer edited).
6. **Members** — export the best of the ~30 Google Sheets (division roster sheet) to CSV → admin CSV importer with dedupe-by-email preview. **Do not attempt to migrate all 30 sheets** — only the roster; historical entry/result sheets stay read-only in Google Drive as archive.
7. **PayPal** — same account, new integration. The old `custom_id`-as-data-carrier flow (via Squarespace form + Apps Script) is retired; new event pages use the Orders API v2 flow (§7). No payment-data migration; old sheets remain the record for past payments.
8. **Overlay** — next livestreamed event uses `/overlay/...`; Netlify + GitHub Pages pipeline retired after one successful stream.
9. **Squarespace** — unchanged; it keeps iframing/linking the Vercel pages exactly as today.

---

## 12. Stays manual / out of scope for MVP

**Manual (by design):**
- PayPal refunds (admin clicks through to the PayPal transaction; app records the refund webhook)
- Bracket/knockout draw seeding (playdowns) — TD assigns matches by hand in the console
- Winner photo capture/cropping beyond auto-resize
- Member roster hygiene (dedupe suggestions only, human decides)
- E-blasts (John Billon II's channel stays; Hub provides copy-pasteable event links)

**Out of scope (Phase 2+):**
- Bowls USA certification portal features (Programs, Assessments, QuizAttempt, `YES_NO_LAW` exams, GradeExams) — port from Base44 later on the same `members`/`clubs` foundation
- Multi-division / National Admin role
- Squarespace replacement; custom domain move
- Season-long points ladders / player rating stats
- Native app, offline mode, push notifications
- Automated round-robin optimizers beyond greedy; Swiss pairing
- Membership dues collection
- GovernancePerson / ChangeRequest entities (delegates.html stays as-is)

---

## 13. Success metrics

| Metric | Baseline today | Target (90 days post-pilot) |
|---|---|---|
| Registrations with data loss/truncation | ~every multi-player PayPal entry needs manual repair | **0** (structurally impossible) |
| GG manual touches per event (JSON edits, commits, sheet fixes) | ~10–15 | **≤1** (livestream setup only) |
| Events run start-to-finish by a TD without GG | 0 | **≥3**, incl. Mumma pilot |
| Time from final game to public results | hours–days | **<30 min** |
| Overlay pipeline failures per stream | frequent (4 hops) | **0** |
| Unaudited destructive edits (Amador-style wipes) | possible for any sheet editor | **0** — every write attributed in `audit_log` |
| % of entries paid online at pilot event | ~0 via a working flow | **≥70%** |
| Fixed monthly infra cost | ~$0 but fragile | **≤$20** |

**Pilot definition of done:** Mumma Mixed Pairs completes on the Hub with Anne Nunes (or assigned TD) operating check-in → draws → scores → results solo; GG's only role is streaming; zero data repaired by hand afterward.

---

## 14. Build order (slices — each ships independently and removes real pain)

Sequenced so the owner (GG) gets relief early and the north-star (TD self-service) lands mid-way, never as a big-bang. Each slice is deployable on its own.

| # | Slice | Pain it removes | Ships |
|---|---|---|---|
| **0** | **Foundation** — new repo + Vercel project, Supabase, magic-link auth, roles, full data model, `audit_log` | (internal) unblocks everything; audit trail from line 1 (Amador fix) | Scaffold + login |
| **1** | **Migration + compatibility endpoints** — import events/results/news JSON → DB; serve legacy shapes so `event.html`/`results.html` keep working | Data now lives in one DB, not scattered JSON | Invisible to public; DB is source of truth |
| **2** | **Admin publisher** — create/edit/publish events & results from a form; "duplicate last year"; news manager | **GG stops hand-editing JSON and pushing git for every change** ← her daily pain | GG self-serves all content |
| **3** | **Online entry + PayPal** — DB-first entry, `entry_id`-only to PayPal, offline path | **Kills the 127-char data loss** ← the notorious bug | Members enter & pay online, lossless |
| **4** | **Public entry list & counts** — who's entered, live | Entry counts no longer locked in Sheets | Public sees entries |
| **5** | **TD day console** — check-in, draws, scores, verify (phone-first) | **TD self-service** ← the north star | A TD runs event day solo |
| **6** | **Results publishing polish** — photos, division splits, auto news (may fold into slice 2's results side) | Same-day results from the green | TD posts results from phone |
| **7** | **Live overlay API** — `/api/overlay`, in-app overlay page | 4-hop ECamm pipeline → 1 URL | Stream reads one stable feed |

**Relief checkpoints:** GG's own workload drops at **slice 2**; the famous bug dies at **slice 3**; TD self-service (the whole point) arrives at **slice 5**.

---

## 15. Open discovery — MUST resolve before slices 1 & 5

The PRD's data model and day-console are only as good as our understanding of two things the owner has flagged as underspecified. **These need a working session with GG before Fable 5 builds the affected slices.**

1. **Google Sheets organization (blocks slice 1 migration).** ~30 sheets with *inconsistent tab structures*. We must decide: which sheets are the roster system-of-record vs. per-event archives; what the canonical member fields are; what actually needs to migrate vs. stay read-only in Drive. Output: a one-page "source-of-truth map" before writing importers.

2. **Tournament structures & charts (blocks slice 5 day-console + draws).** SWD runs multiple formats — round-robin "four 12-end games" events, knockout/bracket playdowns, Stripes/Stars division splits, sectional play. The PRD currently only auto-generates simple round-robin draws and leaves brackets manual. **Owner wants draw/chart generation automated where possible.** Before building, we need: the exact set of tournament formats, how draws/charts are currently made (the paper/sheet templates in `/score-sheets/`), and how standings/advancement are computed per format. Output: a "formats & draws spec" enumerating each format's draw rule, scoring, and chart layout — *this is likely the single largest design unknown in the project.*

> Recommendation: do these two discovery sessions **before** handing slices 1 and 5 to Fable 5. Slices 0, 2, 3, 4 can proceed in parallel without them.

---

## 16. Special case — Men's Singles Playdowns format (needs a rethink)

**Problem (from owner):** The Men's Singles Playdowns have become *wonky* — the format/structure no longer fits the number of players who actually turn up, and organizers need a way to run it "that makes sense with the people they have." Because this event is a **US National qualifier**, the structure isn't cosmetic: it decides who advances, so it has to be both fair and defensible.

**What's known today (from the repo + Drive corpus — see `SWD-Data-Findings.md`):**
- 2026 ran at Long Beach LBC (June 27–29), multi-day.
- Results are split into divisions labeled **"Stripes"** and **"Stars"** (see `results-data.json`) — i.e., players are divided into sections/qualifying groups that each produce advancers.
- A live-scoring spreadsheet drives it; singles format.
- **The 2026 entry list holds ~43 singles entrants.** A field that large at one club over limited days/rinks is the likely root of the wonkiness: sectioning 43 singles, setting per-section advancement, and handling byes is awkward and shifts every year with turnout — exactly "run it in a way that makes sense with the people they have."

**The women's playdowns are NOT the problem — only the men's are.** (Owner, confirmed.)
- **Women's singles playdowns → round robin.** Their field stays within the round-robin bands (≤24), so they use fixed draw-master tables (see §18). Owner: *"the women do a round robin, which is totally easy to do."* This path is fully automatable today.
- **Men's singles playdowns → the crazy one.** With **~43 entrants in 2026**, the men blow past the ">24 entries" threshold into **double elimination**, split into Stars/Stripes, run across **two weekends**. That is the wonky monster.

**The turnout bands already exist on paper** — from the 2026 Singles Playdowns Conditions of Play:

| Entries | Format (per the CoP) |
|---|---|
| **≤16** | Round robin, two 21-point games each day |
| **17–24** | Round robin, three 16-point games/day as needed (two when possible) |
| **>24** | **Double elimination**, 21-point games, both weekends used as needed |

Plus: blind draw into **Stars/Stripes**; prior-year Stars/Stripes winners preset to opposite groups; 2 players seeded by past performance; the rest drawn. **Each group's winner qualifies for Nationals.**

**Why it's hard (the design tension):**
- The ≤24 (round-robin) bands are easy — deterministic tables. **The >24 double-elimination path is the hard one**, and it's where the men land every year.
- Double elimination across two groups (Stars/Stripes) over two weekends means byes, winners'/losers' brackets, and cross-weekend scheduling — none of which the current spreadsheets handle well.
- Turnout isn't final until close to the day, so the men's structure must be **decided late**, with confidence.
- It must reconcile **fairness** (balanced groups, seeding, minimal byes) with **logistics** (rinks, two weekends, people to run it).

**What the Hub should provide (scope TBD after discovery — likely spans slice 5 and a Phase 2 follow-on):**
- A **format/structure engine for singles qualifiers** that takes `entrant_count`, `available_rinks`, `days`, and `qualifiers_needed` and proposes a sensible structure (section sizes, games per player, byes, advancement rule) — a *recommendation the TD can preview and adjust*, not a black box.
- A **"what-if" preview**: enter the current confirmed count and see the resulting bracket/section chart *before* committing, so organizers can compare options for "the people they have."
- Clean modeling of **sectional play → advancement → knockout**, with byes handled explicitly and auditable.

**Critical context (owner):** The men's double-elimination has been run **incorrectly for the past two years** (by **Bill Brault**, the men's playdowns director). So the goal is **NOT to replicate current practice** — current practice is the bug. The Hub must implement a **correct, canonical double-elimination**, which is a well-defined algorithm. Automating it is therefore the *fix*, not merely a time-saver: it removes a recurring human error. **The seeding is also wonky** and needs to be pinned down (see below).

**⚠️ The two governing documents contradict each other** (found in the 2026 source docs — likely a root cause of the mess):

| Document | Prescribed format |
|---|---|
| **Men's Singles Playdowns flyer** (`MenUSSinglesPlaydowns.docx`) | **Double-elimination, always** — 21-point games, three games/day (incl. byes), two concurrent playdowns (Stars/Stripes) by blind draw |
| **Singles Playdowns Conditions of Play** | ≤16 → round robin (2×21-pt/day); 17–24 → round robin (3×16-pt/day); **>24 → double-elimination** |

They **disagree for any field ≤24**: the flyer says always double-elim; the CoP says round robin unless >24. **This contradiction must be resolved by the men's committee before the Hub encodes anything** — the two source-of-truth docs currently can't both be followed. (2026 men had ~43, so >24 → double-elim under *either* doc; the conflict bites in lower-turnout years.)

**Men's Singles Playdowns 2026 facts (from the flyer):** Long Beach LBC, June 27–29 (may extend to two weekends by turnout), entry deadline June 20, $30/entry, check-in 8:30 / start 9:00, winners of each pool **must** play Bowls USA Nationals. Director & entry contact: **Bill Brault**.

**Three compounding problems in the men's playdowns (all must be solved together):**
1. **Seeding** — prior-year Stars/Stripes winners are preset to opposite groups, plus 2 players seeded "by past performance in major singles events," rest drawn. In practice this is applied inconsistently. Need a **deterministic, documented seeding rule** (who counts as a seed, how ties/absences are handled, how seeds are distributed across Stars/Stripes).
2. **Stars/Stripes split** — the field is divided into two pools that each independently qualify a winner to Nationals. **This split is playdowns-only** (not used in regular events, which split by A/B green).
3. **Double elimination** (the >24 path) — winners'/losers' brackets, byes, advancement, run across two weekends. This is where Bill's process has gone wrong.

### Seeding — the two models, and which one the Hub should implement

Seeding is the most politically sensitive part of the playdowns (historically the women resisted being "judged" by the Tournament Committee). SWD currently runs **two very different seeding methods**, and the Hub should implement the *good* one as its canonical engine.

**❌ Men's method (subjective — "terrible," per owner):**
- Seed a **top 10**, of which the **top 4 are voted in by the men's committee**, and the **last 6 are allocated**. "Random and non-clear." Subjective committee judgment is exactly what invites disputes.

**✅ Women's method (objective, defensible, and *proven* — the lopsided-groups complaints stopped after adopting it):**
1. **Objective seed data:** aggregate **3 years of Team SW points** across the relevant discipline's events. This is a transparent, evidence-based ranking — not committee opinion. The exact event sets (from the actual seeding spreadsheets):
   - **Singles seeding:** SW Open Singles + SWD Women's Singles (formerly "Katy Stone") + Singles Playdowns + US Open Singles, summed over the last 3 years.
   - **Pairs seeding:** SW Open Pairs + Pairs Playdowns + US Open Pairs, over 3 years.
   - *Rule of thumb from the TDs:* exclude the current-year event a player is being seeded into, and note that years with no majors (e.g., 2020–21) or a missing US Open simply contribute nothing.
2. **Seed count:** up to **25% of entries** (the rule "the men seed up to 25%" applied objectively). *E.g., 17 entries → 4 seeds.*
3. **Distribute the top seeds across the two pools (Stars/Stripes)** using a **World Bowls–style bracket seeding** so the strongest can't collide early:
   - `Group 1 = seeds 1, 4, 5, 8` · `Group 2 = seeds 2, 3, 6, 7` (mirrors 1v8/4v5 top, 2v7/3v6 bottom bracket construction — #1 and #2 can only meet in the final).
   - Alternative used in practice: seeds blind-draw in pairs (1&2 draw into opposite groups, then 3&4, …). The Hub should support **both** "deterministic World Bowls placement" and "seeded blind draw" as selectable modes.
4. **Everyone else draws cards** (blind draw) into the two groups.
5. **Special presets:** prior-year Stars/Stripes winners are placed into opposite groups (so last year's two winners can't meet early). Absent/withdrawn seeds handled explicitly.

**Known caveats the Hub must respect (raised by the TDs):**
- Team SW points are **inflated for anyone who partnered with a top player**, and **incomplete games** skew them — so for *pairs* seeding especially, points are a guide, not gospel. Singles seeding is cleaner.
- **Transparency is the acceptance criterion:** the method was only accepted because it's objective and *shown*. The Hub's seeding screen must **display the underlying points and the resulting placement** so players can see it isn't arbitrary. (Directly echoes the owner's own stated principle: decisions must be objective, evidence-based, and least-controversial.)

> **Design takeaway:** build one **seeding engine** parameterized by `seed_source` (3-yr Team SW points), `seed_pct` (default 25%), `distribution_mode` (world_bowls_bracket | seeded_blind_draw), and `presets` (prior-year winners → opposite pools). It shows its work. This single engine replaces the men's subjective vote *and* formalizes the women's method — and it's reusable for any Stars/Stripes qualifier.

**Open questions for discovery (with the men's committee):**
1. ~~Turnout bands~~ — answered by the CoP. Confirm the men keep >24 → double-elimination, or whether the real fix is *changing the rule* (cap the field, or sections-to-knockout instead of full double-elim). Given ~43 entrants and a broken process, **rule change is on the table and worth discussing.**
2. **Get the correct double-elimination reference** — what *should* the bracket be for ~43 players split into two pools? Standard double-elim with seeded byes, or an SWD-specific variant? This is the authoritative spec the Hub must implement (NOT what's been done the last two years).
3. **Pin the seeding rule precisely** — it's currently wonky; the Hub needs it unambiguous.
4. How many qualifiers advance — one per pool (Stars + Stripes = 2 to Nationals)? Appears yes; confirm.
5. Who has authority to set/approve the structure, and by when relative to the entry deadline?

> This is the **known recurring failure** in the project, and uniquely so: the women's round-robin path is already easy (§18), but the men's double-elim has been *actively wrong for two years* and layered with wonky seeding. It may be the highest-value single automation in the project — a correct implementation ends a multi-year error — and also the hardest. It lands **after** the round-robin engine ships, and it needs a human-authored correct-bracket spec before any code.

---

## 17. Appendix A — Formats catalog (from 2026 Conditions of Play)

Extracted from the 34 Conditions-of-Play / flyer docs in the SWD Drive corpus. This is the real variety the entry system (§7 eligibility) and draw engine (§18) must support. **Nearly every event shares one scoring model; the variation is in team composition, game count, and end count.**

### Shared scoring model (applies unless noted)
- **Points:** 3 = win, 1 = tie, 0 = loss. (**Playdowns:** 3 = win, 0 = loss, no ties.)
- **Plus-points cap** per game varies by game length (see table). Playdowns: **no cap** (all ends played; plus points break ties).
- **Standard tiebreaker ladder:** head-to-head → fewest opponent points allowed → most ends won → one-end roll-off.
- **Eligibility (standard):** US citizens must be Bowls USA members; others must belong to a Member National Authority. Some add "must be SWD member" or novice/gender constraints.
- **Draw:** "open blind draw" unless noted.

### Round-robin events (the common case — §18 handles these)
| Event | Team composition | Games × ends | +cap | Notes |
|---|---|---|---|---|
| Mumma Mixed Pairs | Mixed pair, 1W+1M, **woman skips** | 3 × 12-end | 10 | A/B green if entries allow |
| Vet-Novice Pairs | 3-bowl pairs (vet/novice) | 4 × 10-end | 7 | A/B green |
| Vet-Novice Triples | 2-bowl triples | 4 × 12-end | 8 | |
| Vet-Novice Mix/Match Triples | 2-bowl triples, ≥1 woman + ≥1 novice | 4 × 12-end | 10 | **multi-green = separate tournaments per green** |
| Izzie Forbes Triples | mix/match 3-person, ≥1 woman + ≥1 novice | 3 × 12-end | 10 | |
| Fossati & Friends | Triples | 3 × 14-end | 10 | |
| Heidi Rittner Aussie Pairs | 2-woman, **Australian 2-4-2** pairs | 3 × 14-end | 10 | |
| Division Rinks | Rinks (fours) | 4 × 10-end | 7 | |
| Novice Singles | Singles | 3 × 15-point | 7 | |
| SWD Open Getaway 2+2 | Rinks (2+2) | — | 7 | |

### Special / non-standard formats (NOT plain round-robin — need custom handling)
| Event | Structure | Why special |
|---|---|---|
| **Women's Singles** | **Sets play** — 4 games of two 7-end sets, 3-end tiebreak | Separate "Sets Play Scoring" sheet; different scoring engine |
| **CA Bears** | Multi-discipline: G1 triples+singles, G2 rinks, G3 pairs | Team plays *different disciplines* each game |
| **Cal 5s** | 5-woman team plays triples, pairs, singles, fours | Squad rotates across disciplines |
| **Men's/Women's Singles Playdowns** | Stars/Stripes + turnout bands (§16) | Qualifier; men's → double-elim |
| **Pairs Playdowns** | Stars/Stripes; ≤16 RR 2×18-end/day; >16 double-elim | Qualifier |
| **SW Open** | Multi-discipline championship (Singles/Pairs/Fours), week-long | Own workbook shape + SyncLog |

### Men's events — additional structures (from the 14 men's flyers)
The men's calendar introduces draw patterns the women's events don't use:

| Event | Structure | New pattern |
|---|---|---|
| Men's So Cal **Rinks** | Day 1: 3×12-end rinks, 4 rounds (each team sits 1). **Top 8 → Day 2.** ≤8 teams → round robin | **Qualify → top-8 cut → Day 2** |
| Men's So Cal **Triples** | Day 1: 4×14-end 2-bowl triples. **Top 8 → Day 2.** ≤8 → round robin | Same top-8-cut hybrid |
| **Cary-MacDonald Pairs** | Day 1: 3×18-end 3-bowl pairs; teams **seeded A/B/C/D** by committee; random draw for **pennant** (one of each seed) | **Seeded → pennant playoff** |
| **5-Man All-Star** | 5-man club team; AM pairs+triples, PM pairs+triples then singles+rinks | Multi-discipline (like Cal 5s) |
| Men's **Mixed Pairs** | 4×14-end, A/B greens, **max 32 teams (16A+16B)**, 1M+1W | Round robin + hard cap |
| **Waterbury** All-League | Club entry = **two 3-person teams** | Team-of-teams |
| Novice Pairs / Novice Singles / Vet-Novice Pairs | **"Format dependent on number of entries"** | Turnout-band, bands unstated on flyer |
| Murray-Allison Singles, SWD Men's Open | Multi-day championship | (Open = week-long, like SW Open) |

> **Note:** several men's events (novice/vet-novice) explicitly say *"format dependent on number of entries"* without stating the bands — like the playdowns, they need a **turnout→format rule pinned down** during discovery.

> **Design takeaway:** model an event's format as structured fields — `discipline` (singles/pairs/triples/rinks/multi), `team_size`, `games`, `ends_per_game` (or `points_per_game`), `plus_cap`, `scoring_mode` (points | sets | qualifier), `eligibility` (gender/novice/citizenship/SWD), `draw_mode` (round_robin | sets | double_elim | multi_discipline | **qualify_then_cut** | **seeded_pennant**), `multi_green_splits_into_separate_tournaments` (bool), `max_teams` (nullable), `turnout_bands` (nullable list). The 3/1/0 + standard tiebreaker is the default; sets play and playdowns override it.

---

## 18. Appendix B — Draw engine spec (round robin first)

**Key finding:** SWD's round-robin draws are **fixed draw-master tables**, not computed. The templates in the repo `/score-sheets/` (`draw-2-3-4-game-8-16-teams`, `draw-5-6-game-10-16-teams`) encode, for each **team count** (8/10/12/14/16) and **game count** (2–6), a deterministic schedule.

**Decoded table shape** (`draw-5-6-game-10-16-teams.xlsx`, tab `16 Teams`): rows = team number 1..16; for each **Game** there are two columns — **RINK** (which rink that team plays) and **OP #** (opponent team number). Example (16 teams):

```
Team  G1:rink/opp  G2:rink/opp  G3:rink/opp  | G4:rink/opp  G5:rink/opp  G6:rink/opp
 1      1 / 2        3 / 4        6 / 6         7 / 8         2 / 10       4 / 12
 2      1 / 1        5 / 6        7 / 10        3 / 14        6 / 15       7 / 11
 ...
(Day 1 = games 1–3, Day 2 = games 4–6; note "8 TEAMS PLAY / CHANGE GREEN" annotations)
```

**Implementation for MVP:** transcribe these tables into data (JSON/DB) — a lookup keyed by `(team_count, game_count) → [ {team, [{game, rink, opponent}]} ]`. The "auto-draw" is then: sort/seed the entry list into team numbers 1..N, look up the table, assign. **No pairing algorithm to invent** — this is transcription + assignment.

**What the engine must do (round-robin, MVP):**
1. Given confirmed (checked-in) entries and `games`, pick the right table by team count (handle odd counts / byes as the templates do — some have "* = bye" markers).
2. Assign each entry a team number (blind draw = shuffle; seeded events = place seeds first).
3. Produce per-game **rink + opponent** assignments from the table → the `games` rows (§4).
4. Handle **multi-green splits**: when entries exceed one green, split into A/B (or "separate tournaments per green" for events that specify it — Vet-Novice Mix/Match).
5. **Livestream rink pinning** (owner-flagged, real workflow): certain rinks are the camera/livestream rinks — typically **6 or 7, or 1 or 2** depending on the club's setup. The TD must be able to **pin a specific game (or team) to a livestream rink**, overriding the draw-master table's rink for that match, so that *important games* land on stream. Requirements:
   - Mark rinks as `is_livestream_rink` per club/green (configurable; e.g., {1,2} or {6,7}).
   - Per game, a "Put on livestream rink" action that swaps that game onto an available livestream rink and reshuffles the conflicting assignment (or warns).
   - This is how the draw connects to the overlay (§10): the `featured_game` for the stream is usually whatever's pinned to the livestream rink.
6. Manual override always wins (TD can drag/reassign any rink — §8).

**Coverage:** these tables + the multi-green split cover the women's playdowns and essentially every round-robin event in Appendix A. 

**Explicitly deferred to a later slice:**
- **Double elimination** (men's singles playdowns, pairs playdowns >16) — winners'/losers' brackets, byes, seeding, Stars/Stripes split, two-weekend scheduling. This is the §16 hard problem; build after round-robin ships.
- **Qualify → top-8 cut → Day 2** (Men's So Cal Rinks & Triples) — round-robin Day 1 (reuse the tables) + a knockout Day 2 for the top 8; the Day-1 half is easy, the cut + Day-2 bracket is new.
- **Seeded pennant** (Cary-MacDonald Pairs) — A/B/C/D committee seeding + pennant draw.
- **Sets play** scoring (Women's Singles).
- **Multi-discipline** rotation (CA Bears, Cal 5s, 5-Man All-Star, SW Open).

> Reassuring note: even the "hard" structures (top-8 cut, pennant) **reuse the round-robin tables for their qualifying stage** — only the post-qualifying knockout/pennant piece is new. Round robin remains the foundation everything builds on.

> Source tables to transcribe live at `/score-sheets/draw-2-3-4-game-8-16-teams.zip` (2/3/4-game, 8–16 teams) and `/score-sheets/draw-5-6-game-10-16-teams.xlsx` (5/6-game, 10–16 teams). Scorecards per format: `/score-sheets/scorecard-{3,4}game-{10,12,21}end.xls`.

---

*Grounding notes for the implementing engineer: field parity targets are the live files `events-data.json`, `results-data.json`, `news-data.json` at repo root (`/Users/giuliagallo/Documents/GitHub/swd-google-calendar/`); the public rendering contract is `event.html` (`?id=` driven) and `results.html`; slugs like `mens-singles-playdowns-2026` must survive migration unchanged.*

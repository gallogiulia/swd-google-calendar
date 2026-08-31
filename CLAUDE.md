# swlawnbowls.org — working notes

This repo is the website for the Southwest Bowls Division (SWD) of lawn bowls.
It deploys to Vercel and is embedded into the public site at
**https://www.swlawnbowls.org**.

The person maintaining this site is **not a developer**. The whole design goal
is that updating the website means **editing a JSON data file**, not writing
HTML. When you add something new, keep it that way: put the content in data and
the layout in a shared template. If you find yourself writing a new one-off HTML
page for content, stop — that is the pattern we are actively removing.

## How a change reaches the public site

    edit a JSON file  →  commit  →  push to main  →  Vercel deploys (~60s)

Pushing to `main` publishes immediately. There is no staging environment.
Vercel takes a minute or two, and rolls out gradually — a page can 404 for a few
seconds mid-rollout, so retry before believing a failure.

## The four content systems

Each pairs a data file with a template. To publish, edit the data.

| What | Data | Template | Public URL |
|---|---|---|---|
| Tournaments & events | `events-data.json` | `event.html` | `/event?id=<id>` |
| Current-season results | `results-data.json` | `results_new.html` | `/results` |
| Multi-division results | `results-data.json` | `division.html` | `/division?event=<id>&division=<slug>` |
| Information pages | `content/<id>.json` | `page.html` | `/<id>` |
| Historical archive | `archive-data.json` | `archive.html` | `/archive` |

Read `docs/page-content-schema.md` before touching anything under `content/`.

### Adding a tournament
Add an entry to `events-data.json`. A broken event link is almost always a
missing or mismatched `id`, not a missing page — the page always exists.

### Adding results
Add a tournament to the `tournaments` array in `results-data.json`, newest
first. Photos go in `photos/<tournament-id>/`.

For an event run in **flights** (like the Southwest Open), give each division a
`flights` array instead of `places`. `/results` then shows only the top flight's
podium and links to `/division` for the full breakdown. Flights are the single
source of truth — do not also keep a separate `places` list, or the two will
drift apart.

### Adding an information page
1. Write `content/<id>.json` per `docs/page-content-schema.md`.
2. Add a rewrite in `vercel.json`: `/<id>` → `/page?id=<id>`.
3. Put images in `photos/pages/<id>/`.

Text in content JSON is **escaped, not rendered as HTML**. Never put `<a>` tags
inside a paragraph — use a `buttons` or `contact` section instead.

## Rules that matter

**Never hotlink Squarespace.** Images served from `images.squarespace-cdn.com`
die the day the Squarespace subscription lapses. Copy them into `photos/`.

**Do not rename the Vercel project.** `swd-google-calendar.vercel.app` is
hardcoded in 186 places, 83 of them inside Squarespace pages we cannot edit
programmatically. Renaming the project releases that hostname and breaks all of
them. This is safe only at cutover, when everything moves to swlawnbowls.org.
The GitHub repo has already been renamed to `swlawnbowls-website`; that was
safe, and Vercel followed it.

**Names are a permanent record.** Player names in results are real people in a
competitive record. Transcribe them exactly; never "fix" a spelling silently.
Where the source is inconsistent (the archive has both "Susie" and "Suzie"
Houston), carry it across as written and flag it rather than guessing.

**Validate JSON before committing.** `python3 -c "import json;json.load(open('X.json'))"`.
A malformed data file takes the page down, and there is no staging to catch it.

## The migration off Squarespace

In progress. ~55 top-level Squarespace pages; the ones already served from here
are listed in `vercel.json`. The remaining work, the open decisions, and the
per-page status live in the status page linked from the project memory.

**Forms — done.** The four form pages now embed Google Forms, created
2026-08-30. See `docs/forms.md` for the edit and response-spreadsheet links.
To change a form's questions, edit it in Google Forms; nothing here changes.
Do not re-run `scripts/create-swd-forms.gs` — it would create a second set.

With the forms live, **cutover is the only remaining step**: point
swlawnbowls.org at this deployment, rebuild the navigation, rewrite the
hardcoded `swd-google-calendar.vercel.app` links, and retire the subscription.

**Retired pages.** `content/home-two.json`, `live-scoring.json` and
`schedule.json` carry `"retired": true` and have no route in `vercel.json`.
Their content is kept as a record. Do not "fix" their missing routes — the
absence is deliberate.

## Scripts

- `scripts/rescue-archive.py` — copies historical result images off the
  Squarespace CDN into `photos/archive/` and rebuilds `archive-data.json`.
  Re-runnable; skips what it already has. Use `--dry-run` to re-index without
  downloading, and `--year YYYY` for one year (it merges rather than clobbers).
  If you change the parser, re-run it for real afterwards: renamed tournament
  slugs mean renamed directories, and the index will otherwise point at files
  that do not exist. Always reconcile index against disk when you are done.
- `scripts/create-swd-forms.gs` — Apps Script that creates the four Google
  Forms. Run once in script.google.com.
- `scripts/attach-form.py` — puts a created form into its page.
  `--list` shows which pages still need one.

## Serverless functions (`api/`)

Node functions on Vercel. `events.js` pulls from five Google Calendars,
`agenda.pdf.js` renders the season agenda PDF, `sync-links.js` keeps Squarespace
tournament links in step (it requires slugs to begin with the season year).
These are real code — unlike the content files, treat changes here carefully.

## Repository size

`photos/` is ~534 MB and `.git` is ~841 MB, mostly the image archive. Clones are
slow. **Compress photos before the commit, not after** — once a large file is in
git history it stays there forever, even if you shrink it later:

    sips -Z 1400 IN --out IN                          # cap the long edge
    sips -s format jpeg -s formatOptions 58 IN --out IN

Doing that to one batch of Ladies Day photos saved 57 MB.

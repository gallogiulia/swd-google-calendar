# SWD Bowls Calendar (Custom UI powered by Google Calendar)

This repo renders a **custom-branded calendar UI** (FullCalendar) backed by **multiple public Google Calendars**.
It supports **Vercel** (recommended if you already use it) and **Netlify**.

## What you get
- Custom SWD-styled **List (agenda) view** by default + optional Month view toggle
- Pulls events from **multiple calendars** via a lightweight serverless endpoint
- Works great embedded inside Squarespace (iframe)

---

## 0) Do you need multiple API keys?
No. **One Google Calendar API key** can fetch events from any number of **public** calendars, as long as:
- The **Google Calendar API** is enabled in the Google Cloud project
- The key is allowed to call that API

---

## 1) Create a Google API Key (one-time)
1. Go to Google Cloud Console → create/select a project
2. APIs & Services → Library → enable **Google Calendar API**
3. APIs & Services → Credentials → **Create Credentials** → API key
4. (Recommended) Restrict the key:
   - API restrictions: **Google Calendar API**
   - Application restrictions:
     - You can start with **None** while testing
     - Then lock down to your domain(s) under **HTTP referrers**

---

## 2) Configure environment variables
You will set these in Vercel or Netlify (NOT in code).

Required:
- `GCAL_API_KEY` = your Google API key
- `GCAL_CALENDAR_IDS` = comma-separated list of calendar IDs

Optional:
- `GCAL_TZ` = timezone, default `America/Los_Angeles`
- `GCAL_DAYS_DEFAULT` = default days range returned, default `180`
- `GCAL_MAX_RESULTS` = max results per calendar, default `250`

Example `GCAL_CALENDAR_IDS`:
```
a@group.calendar.google.com,b@group.calendar.google.com,c@group.calendar.google.com
```

---

## 3A) Deploy on Vercel (recommended)
### Steps
1. Create a new Git repo from this folder (or upload to GitHub)
2. In Vercel: **New Project** → import the repo
3. In Vercel project settings → Environment Variables:
   - Add `GCAL_API_KEY`
   - Add `GCAL_CALENDAR_IDS`
   - (Optional) add `GCAL_TZ`, `GCAL_DAYS_DEFAULT`
4. Deploy

### Verify
- Visit your site URL (root) → you should see the calendar UI
- Check the endpoint:
  - `https://YOUR-VERCEL-URL/api/events?days=90`

---

## 3B) Deploy on Netlify
### Option 1: Git-based deploy (recommended)
1. Push this folder to GitHub
2. Netlify → New site from Git → select repo
3. Build settings:
   - Build command: *(leave empty)*
   - Publish directory: `public`
4. Environment variables (Site settings → Environment variables):
   - `GCAL_API_KEY`
   - `GCAL_CALENDAR_IDS`
   - (Optional) `GCAL_TZ`, `GCAL_DAYS_DEFAULT`
5. Deploy

### Verify
- Root page loads the calendar UI
- Endpoint:
  - `https://YOUR-NETLIFY-URL/.netlify/functions/events?days=90`

---

## 4) Embed in Squarespace
1. Create a page where you want the calendar
2. Add an **Embed** block (or Code block with iframe)
3. Use this iframe (replace URL):

```html
<iframe
  src="https://YOUR-DEPLOYED-URL/"
  style="width:100%;height:1100px;border:0;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  title="SWD Bowls Calendar">
</iframe>
```

Tip: set height to 1000–1400px depending on your layout.

---

## Local dev (optional)
Because the serverless endpoints require env vars, local dev is optional.
If you want it:
- Vercel: `vercel dev` (after setting env vars)
- Netlify: `netlify dev`

The UI is in `public/index.html`.

## Calendar IDs
This version has SWD calendar IDs prefilled in the serverless functions as defaults. You only need to set `GCAL_API_KEY` in your host (Vercel/Netlify). You can override IDs by setting `GCAL_CALENDAR_IDS`.

## Prefilled IDs (v2)
Calendar IDs are hardcoded as defaults in the serverless functions. Only `GCAL_API_KEY` is required. Setting `GCAL_CALENDAR_IDS` will override defaults.

## Calendar Labels
This build includes labeled sources for:
- 2026 Club Sponsored Tournaments
- 2026 Other Tournaments
- 2026 SWD Tournaments - Men's
- 2026 SWD Tournaments - Women's
- PBA USA

Colors can be changed in `public/index.html` under `SOURCE_META`.

# Page content schema

Static information pages (About Us, Umpires, Coaching Hub, ...) are **data, not
HTML**. Each page is one JSON file in `content/`, rendered by the shared
template `page.html`.

The point: to change a page, edit its JSON. Nobody needs to touch HTML or CSS.

    /about-us   →  content/about-us.json   →  page.html?id=about-us

## File shape

```json
{
  "id": "about-us",
  "title": "About Us",
  "subtitle": "One sentence under the page title. Optional.",
  "sourceUrl": "https://www.swlawnbowls.org/about-us",
  "sections": [ ... ]
}
```

`id` must equal the filename stem. `sourceUrl` records where the content was
migrated from, so it can be checked later.

## Section types

Every section may carry an optional `"heading"`.

### prose
Paragraphs of text. The workhorse — use it unless another type genuinely fits.
```json
{ "type": "prose", "heading": "Our Division",
  "body": ["First paragraph.", "Second paragraph."] }
```

### list
```json
{ "type": "list", "heading": "What you need",
  "ordered": false,
  "items": ["Flat-soled shoes", "Bowls are provided"] }
```

### image
```json
{ "type": "image",
  "src": "/photos/pages/about-us/01-green.jpg",
  "alt": "Bowlers on the green at Newport Harbor",
  "caption": "Optional caption shown under the image." }
```

### gallery
Two or more images shown as a grid.
```json
{ "type": "gallery", "heading": "Our clubs",
  "images": [ { "src": "...", "alt": "...", "caption": "..." } ] }
```

### cards
Repeating items with a name and a description — people, programs, clubs.
```json
{ "type": "cards", "heading": "Coaches",
  "items": [ { "title": "Jane Doe", "meta": "Newport Harbor",
               "body": "Certified coach.", "photo": "/photos/...",
               "link": "mailto:jane@example.com" } ] }
```

### table
```json
{ "type": "table", "heading": "Fees",
  "columns": ["Event", "Entry"],
  "rows": [["Singles", "$20"]] }
```

### embed
An iframe — a published Google Sheet, a scoring sheet, a map.
```json
{ "type": "embed", "heading": "Standings",
  "url": "https://docs.google.com/spreadsheets/d/e/.../pubhtml?widget=true&headers=false",
  "height": 600 }
```

### buttons
Calls to action.
```json
{ "type": "buttons",
  "items": [ { "label": "Download the form", "url": "/pdfs/entry.pdf" } ] }
```

### contact
```json
{ "type": "contact", "heading": "Get in touch",
  "items": [ { "label": "Tournament Secretary", "name": "Jane Doe",
               "email": "jane@example.com", "phone": "555-1234" } ] }
```

## Rules

1. **Never invent content.** Everything must come from the source page. If a
   detail is unclear, leave it out and note it in `migrationNotes`.
2. **Drop the Squarespace chrome** — nav, footer, cookie banners, "Skip to
   Content", social icons. Only the page's own content.
3. **Images live in the repo.** Download every image to
   `photos/pages/<id>/NN-name.jpg`. Never hotlink `squarespace-cdn.com` — the
   whole point is to stop depending on it.
4. **Alt text must describe the picture.** Squarespace auto-generated alt text
   is frequently wrong (it calls lawn bowling "golf"). Write it yourself, or
   leave `alt` as an empty string rather than repeating something false.
5. **Keep the wording.** Copy the club's own text; fix only clear typos.
6. **Preserve links.** Rewrite links to other migrated pages as our own paths
   (`/umpires`), keep external links absolute, and keep `mailto:` links.
7. **Anything you could not carry across** goes in a top-level
   `"migrationNotes": ["..."]` array so it is visible rather than silently lost.

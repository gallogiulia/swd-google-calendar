#!/usr/bin/env python3
"""
Rescue the historical results archive off the Squarespace CDN.

The 2022-2025 results pages live on Squarespace and their images are served
from images.squarespace-cdn.com. The day the Squarespace subscription lapses,
every one of those images 404s -- including the ones our own /results page
still links to. This script copies them all into the repo so that can't happen.

It also captures whatever text sits next to each image. 2023 and 2024 were
published as real markup (a "First Place" heading and a line of names beside
each photo), so those years come across as structured data. 2025 was published
as flat Canva graphics with the names burned into the pixels, so those come
across as images only, and the names must be transcribed later.

Usage:
    python3 scripts/rescue-archive.py            # download everything
    python3 scripts/rescue-archive.py --year 2024
    python3 scripts/rescue-archive.py --dry-run  # index only, no downloads

Output:
    photos/archive/<year>/<tournament-slug>/NN-<name>.jpg
    archive-data.json
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(REPO, "photos", "archive")
INDEX = os.path.join(REPO, "archive-data.json")

# Source pages, newest first.
PAGES = [
    ("2025", "2025 Results", "https://www.swlawnbowls.org/2025-tournament-results"),
    ("2025", "2025 Southwest Open", "https://www.swlawnbowls.org/2025-southwest-open"),
    ("2025", "2025 US Playdowns", "https://www.swlawnbowls.org/2025-usplaydowns"),
    ("2024", "2024 Results", "https://www.swlawnbowls.org/2024results"),
    ("2023", "2023 Results", "https://www.swlawnbowls.org/2023-results"),
    ("2022", "2022 Results", "https://www.swlawnbowls.org/results-2022"),
]

# "First Place", "2nd Place - Coronado", "Champions", "Runners-up" ...
PLACE_RE = re.compile(
    r"^\s*(first|second|third|fourth|fifth|sixth|seventh|eighth"
    r"|1st|2nd|3rd|4th|5th|6th|7th|8th"
    r"|champion|champions|winner|winners|runner|runners)\b",
    re.I,
)
ORDINALS = {
    "first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3,
    "fourth": 4, "4th": 4, "fifth": 5, "5th": 5, "sixth": 6, "6th": 6,
    "seventh": 7, "7th": 7, "eighth": 8, "8th": 8,
}

# Chrome-lookalike header text that isn't page content.
NAV_JUNK = re.compile(
    r"^(skip to content|open menu|close menu|cart|0 items|back|home)$", re.I
)

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


def slugify(text, fallback="untitled"):
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:60] or fallback


def fetch(url, accept=None):
    headers = dict(UA)
    if accept:
        headers["Accept"] = accept
    with urlopen(Request(url, headers=headers), timeout=60) as r:
        return r.read()


def content_stream(markup):
    """Walk the page in document order, yielding (kind, value, is_continuation).

    Squarespace nests everything in divs, so document order is the only
    reliable signal for which caption belongs to which image.
    """
    markup = re.sub(r"<style.*?</style>", "", markup, flags=re.S)
    markup = re.sub(r"<script.*?</script>", "", markup, flags=re.S)
    markup = re.sub(r"<!--.*?-->", "", markup, flags=re.S)
    markup = re.sub(r"<nav.*?</nav>", "", markup, flags=re.S)
    markup = re.sub(r"<footer.*?</footer>", "", markup, flags=re.S)

    out = []
    pattern = r"<h([1-6])[^>]*>(.*?)</h\1>|<p[^>]*>(.*?)</p>|<img[^>]+>"
    for m in re.finditer(pattern, markup, re.S):
        chunk = m.group(0)
        if chunk.startswith("<img"):
            src = re.search(r'data-src="([^"]+)"', chunk) or re.search(
                r'src="([^"]+)"', chunk
            )
            if not src:
                continue
            url = html.unescape(src.group(1)).split("?")[0]
            if "squarespace-cdn" not in url:
                continue
            if re.search(r"favicon|logo|SWBlogo", url, re.I):
                continue
            out.append(("IMG", url, False))
        else:
            raw = m.group(2) if m.group(2) is not None else m.group(3)
            # Squarespace puts the tournament name and its venue in one block
            # separated by <br>. Keep that boundary before stripping tags.
            raw = re.sub(r"<br\s*/?>", "\n", raw or "", flags=re.I)
            text = html.unescape(re.sub("<[^>]+>", "", raw)).strip()
            lines = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
            lines = [l for l in lines if l]
            if not lines:
                continue
            kind = "H" if m.group(2) is not None else "P"
            for n, line in enumerate(lines):
                if len(line) <= 400 and not NAV_JUNK.match(line):
                    # n > 0 marks a continuation line -- the venue that followed
                    # a <br> after the tournament name, not a new heading.
                    out.append((kind, line, n > 0))
    return out


def looks_like_names(text):
    """A roster line: separated names, no sentence punctuation, fairly short.

    Most are comma-separated, but pairs are often written "Steve Marsh &
    Ivan Hyland" with no comma at all, so accept those joiners too.
    """
    if len(text) > 160 or text.count(".") > 1 or "?" in text:
        return False
    if PLACE_RE.match(text):
        return False
    return bool(re.search(r",| & | and ", text))


def parse_page(markup):
    """Group the content stream into tournaments, each with placed images."""
    stream = content_stream(markup)
    tournaments = []
    current = None
    pending_title = None   # heading seen before this section's first image
    expect_names = False   # the line right after a place heading is the roster

    def ensure(title):
        nonlocal current
        if current is None or (title and current["title"] != title):
            current = {"title": title or "Untitled", "venue": None, "places": []}
            tournaments.append(current)

    for kind, value, is_cont in stream:
        if kind == "IMG":
            ensure(pending_title if current is None else current["title"])
            pending_title = None
            current["places"].append({"image": value, "rank": None,
                                      "rankLabel": None, "names": None})
            expect_names = False
            continue

        if PLACE_RE.match(value) and current and current["places"]:
            word = re.match(r"\s*([A-Za-z0-9]+)", value).group(1).lower()
            slot = current["places"][-1]
            slot["rankLabel"] = value
            slot["rank"] = ORDINALS.get(word)
            expect_names = slot["names"] is None
            continue

        # Directly after a place heading, a short line is the roster even when
        # it carries no comma at all (a single name, or "A & B").
        if expect_names and current and current["places"] and len(value) <= 160:
            current["places"][-1]["names"] = value
            expect_names = False
            continue

        if looks_like_names(value) and current and current["places"]:
            slot = current["places"][-1]
            if slot["names"] is None:
                slot["names"] = value
                continue

        # A continuation line is the venue under the tournament name, so it
        # annotates the current section rather than starting a new one.
        if is_cont and current is not None:
            if current["venue"] is None:
                current["venue"] = value
            continue

        # Anything else that isn't a caption starts a new tournament section.
        if len(value) > 8 and not looks_like_names(value):
            pending_title = value
            ensure(value)
            expect_names = False

    # Drop sections that captured no images (nav crumbs, stray headings).
    return [t for t in tournaments if t["places"]]


def download_one(job):
    url, dest = job
    if os.path.exists(dest):
        return "skip"
    try:
        data = fetch(url + "?format=1200w", accept="image/jpeg")
    except Exception as e:
        return f"FAIL {url}: {e}"

    tmp = dest + ".tmp"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(tmp, "wb") as f:
        f.write(data)

    # Re-encode to JPEG q60. These are flat 1000px graphics; the archive is
    # ~1000 images, and the originals would add the better part of a gigabyte.
    try:
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "60",
             tmp, "--out", dest],
            check=True, capture_output=True,
        )
        os.remove(tmp)
    except subprocess.CalledProcessError:
        os.replace(tmp, dest)  # keep the original rather than lose it
    return "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", help="only this year")
    ap.add_argument("--dry-run", action="store_true", help="index, no downloads")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    pages = [p for p in PAGES if not args.year or p[0] == args.year]
    archive, jobs = [], []
    used_slugs = set()   # two sections can share a title; their paths must not

    for year, page_title, url in pages:
        print(f"→ {page_title} ({url})")
        try:
            markup = fetch(url).decode("utf8", "replace")
        except Exception as e:
            print(f"  !! could not fetch: {e}")
            continue

        for tournament in parse_page(markup):
            slug = slugify(tournament["title"])
            if (year, slug) in used_slugs:
                n = 2
                while (year, f"{slug}-{n}") in used_slugs:
                    n += 1
                slug = f"{slug}-{n}"
            used_slugs.add((year, slug))
            entry = {
                "year": year,
                "sourcePage": url,
                "title": tournament["title"],
                "venue": tournament.get("venue"),
                "slug": slug,
                "places": [],
            }
            for n, place in enumerate(tournament["places"], 1):
                name = os.path.basename(place["image"])
                name = re.sub(r"[^A-Za-z0-9._-]", "-", html.unescape(name))
                name = os.path.splitext(name)[0][:40]
                rel = f"photos/archive/{year}/{slug}/{n:02d}-{slugify(name)}.jpg"
                entry["places"].append({
                    "rank": place["rank"],
                    "rankLabel": place["rankLabel"],
                    "names": place["names"],
                    "photo": "/" + rel,
                })
                jobs.append((place["image"], os.path.join(REPO, rel)))
            archive.append(entry)

        got = sum(len(t["places"]) for t in archive if t["sourcePage"] == url)
        print(f"  {got} images across "
              f"{len([a for a in archive if a['sourcePage'] == url])} tournaments")

    with_names = sum(1 for a in archive for p in a["places"] if p["names"])
    total = sum(len(a["places"]) for a in archive)
    print(f"\nindexed {total} images in {len(archive)} tournaments "
          f"({with_names} with names as text, {total - with_names} image-only)")

    # A --year run only rebuilds that year, so merge it into whatever is
    # already indexed instead of dropping every other year on the floor.
    if args.year and os.path.exists(INDEX):
        with open(INDEX) as f:
            existing = json.load(f).get("archive", [])
        archive = [a for a in existing if a["year"] != args.year] + archive
        archive.sort(key=lambda a: a["year"], reverse=True)

    with open(INDEX, "w") as f:
        json.dump({"archive": archive}, f, indent=2, ensure_ascii=False)
    print(f"wrote {os.path.relpath(INDEX, REPO)}")

    if args.dry_run:
        print("dry run - no images downloaded")
        return

    print(f"downloading {len(jobs)} images...")
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(download_one, jobs):
            done += 1
            if result.startswith("FAIL"):
                print(f"  {result}")
            if done % 50 == 0:
                print(f"  {done}/{len(jobs)}")
    print("done")


if __name__ == "__main__":
    main()

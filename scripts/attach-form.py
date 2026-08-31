#!/usr/bin/env python3
"""
Attach a Google Form to a page, replacing its placeholder.

The four pages that used to carry Squarespace forms currently show a
placeholder saying the form is being rebuilt. Once the Google Forms exist
(see scripts/create-swd-forms.gs), this swaps each placeholder for the real
embedded form, in place, without anyone editing JSON by hand.

Usage:
    python3 scripts/attach-form.py contact-us "https://docs.google.com/forms/d/e/XXX/viewform?embedded=true"

    python3 scripts/attach-form.py --list      # which pages still need a form

The URL must be the form's published address. The script adds
?embedded=true itself if you forget it.
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(REPO, "content")

# A Google Form is taller than our default embed; these suit each form's length.
HEIGHTS = {
    "contact-us": 900,
    "ladies-day-sign-up": 1250,
    "ie-sign-up": 1000,
    "bowlsdevelopmnetfund": 850,
}


def pages_with_forms():
    out = []
    for name in sorted(os.listdir(CONTENT)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(CONTENT, name)) as f:
            data = json.load(f)
        if data.get("formSpec"):
            attached = any(
                s.get("type") == "embed" and "docs.google.com/forms" in (s.get("url") or "")
                for s in data.get("sections", [])
            )
            out.append((data["id"], len(data["formSpec"].get("fields", [])), attached))
    return out


def main():
    if "--list" in sys.argv or len(sys.argv) < 3:
        rows = pages_with_forms()
        print(f"{'page':24} {'fields':>6}  form attached")
        for pid, n, attached in rows:
            print(f"{pid:24} {n:>6}  {'yes' if attached else 'NOT YET'}")
        missing = [p for p, _, a in rows if not a]
        if missing:
            print("\nstill needing a form:", ", ".join(missing))
        return 0 if "--list" in sys.argv else 1

    page_id, url = sys.argv[1], sys.argv[2]
    path = os.path.join(CONTENT, page_id + ".json")
    if not os.path.exists(path):
        print(f"No such page: {page_id}", file=sys.stderr)
        return 1

    if not re.match(r"^https://docs\.google\.com/forms/", url):
        print("That does not look like a Google Form URL.", file=sys.stderr)
        return 1
    if "embedded=true" not in url:
        url += ("&" if "?" in url else "?") + "embedded=true"

    with open(path) as f:
        data = json.load(f)

    sections = data.get("sections", [])
    target = None
    for i, s in enumerate(sections):
        head = (s.get("heading") or "").lower()
        if s.get("type") in ("prose", "embed") and ("form" in head):
            target = i
            break
    if target is None:
        print(f"Could not find the form placeholder in {page_id}.json", file=sys.stderr)
        return 1

    heading = sections[target].get("heading") or "Form"
    sections[target] = {
        "type": "embed",
        "heading": heading,
        "url": url,
        "height": HEIGHTS.get(page_id, 1000),
    }

    data.setdefault("migrationNotes", []).append(
        f"The {heading.lower()} is now a Google Form; responses go to its linked "
        f"spreadsheet. To change the questions, edit the form in Google Forms - "
        f"nothing here needs changing."
    )

    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Attached the form to {page_id} (height {sections[target]['height']}).")
    print("Check it, then commit and push to publish.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

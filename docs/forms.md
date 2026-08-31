# The website's forms

The four sign-up and contact forms are **Google Forms**, embedded in their
pages. Created 2026-08-30, replacing the Squarespace form blocks.

## To change a form's questions

Open its **Edit form** link below and change it there. Nothing in this repo
needs touching — the page shows whatever the form currently says.

## To read the responses

Open its **Responses** spreadsheet below. Every submission lands there
automatically, newest at the bottom.

## The four forms

### Contact Us — `/contact-us`
Name, Email, Message. All required.

- Edit form: https://docs.google.com/forms/d/1K-nFmwejFDR87qhQbtq3c9ft-BvNUKHYPzQPJ8M57tk/edit
- Responses: https://docs.google.com/spreadsheets/d/1w4K_Yd4IozKFGqZxpkTWH_cwzh40cfY8o_CyEZWEBe0/edit

### Ladies' Day Sign-up — `/ladies-day-sign-up`
Name, Email, Club (26 options), which event (9 dates), team names.

- Edit form: https://docs.google.com/forms/d/1PMsSGhySsjWD_EQbl4RgSR8YazHH-YRyvsGEyDy_OqA/edit
- Responses: https://docs.google.com/spreadsheets/d/1951fJ630rPR020RZcD2ofD2ADIqv9opvSEFwYQ8W6L4/edit

**Needs attention each season:** the nine event dates are the 2026 list carried
over from Squarespace, starting 8 April. Update them in the form when the new
season's schedule is set.

### Inland Empire Ladies' Day Sign-up — `/ie-sign-up`
Name, Email, which event, position (Skip / Vice / Lead / Any).

- Edit form: https://docs.google.com/forms/d/1U9bJryPeuNnet641PcV3OodxmCAEpgTUCYvBm5tpt7Y/edit
- Responses: https://docs.google.com/spreadsheets/d/1gLRzvS_kevhMg0V6XbQxHzLSC6dLlMiOMUsEjUF5Lfk/edit

**Needs attention now:** the event dropdown has a single option, "July 11,
6:30pm at Riverside LBC", which has already passed. Add the upcoming dates.

### Bowls Development Fund — `/bowlsdevelopmnetfund`
Name, Email, "Will you be donating?" (Yes / No / Still Unsure).

- Edit form: https://docs.google.com/forms/d/1_Mu_NtSJkaxf5ebaDeL77fQhikfvgOLnEUC9l7ZQCiI/edit
- Responses: https://docs.google.com/spreadsheets/d/1qsTx5381RUjEZcCiSdk1d_J-PcG9P2gpPUkWCqYW9m4/edit

This form does **not** take money. Donations are made on the Fund's own
website; the form only records interest.

## Notes

- No form on this site takes a payment. Tournament entry payments are handled
  separately on the tournament pages.
- Each form has its own response spreadsheet, so one can be shared with the
  person who runs that event without exposing the others.
- The forms were built by `scripts/create-swd-forms.gs` from field specs read
  off the old Squarespace pages. That script is kept as a record of how they
  were made; do not run it again or it will create a second set.
- `scripts/attach-form.py --list` shows which pages have a form attached.

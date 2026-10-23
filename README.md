# An Anglican Synaxarium: website

Static site (Astro) for anglicansynaxarium.com. Build it, then upload the contents of `dist/` to the web root on Spaceship, the same way The Universal Office is hosted.

## Commands

- `npm install` once.
- `npm run build` converts the entries, builds all 366 day pages, and checks that no SIN number, source field or dead link is in the output. The site is in `dist/`.
- `npm run dev` previews while you work.

## Where things live

- `content/source/MM-DD.txt` holds an approved entry exactly as it reads in Google Docs (bold heading line, paragraphs, "Let us pray.", collect). `npm run build` turns each into `content/entries/`. The words are never changed. A day with no source file shows "The entry for this day is in preparation."
- `data/calendar.json` is generated: `npm run calendar` (needs the PrayerAppNew repository cloned beside this one). It carries no apparatus.
- `data/rank.json` holds the Prayer Book ranks (principal, lord, major; everything else is a commemoration). `data/reception.json` lists the Greater Church dates.
- `site.config.json` holds the podcast links. A button with an empty link is hidden, and so is the Listen card when all are empty.
- Cover art: add `public/assets/anglican-communion-compass-rose-transparent.png` and the cover shows the compass rose. Replace `public/og.png` with the 1200 px version of the green cover when you want it.

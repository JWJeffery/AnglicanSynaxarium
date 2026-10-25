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
- `python3 tools/verify-entries.py <zip>` compares every entry with the approved Google Docs, word for word. Download Completed Hagiographies from Drive as a zip, run `pip install python-docx` once, then run the script on the zip.
- `npm run cover` makes `public/cover-400.png` and `public/og.png` from `public/assets/synaxarium-cover-green-3000.png`.
- Season names follow the 1979 Book of Common Prayer (Calendar, pp. 30-33); the BCP does not use "Ordinary Time".

## Daily reminder (notifications)

`/reminders/` lets a visitor choose a time (15-minute steps) and days, and get a notification that today's saint is ready to read. The notification names the saint (it reads today's entry from the copy already on the device, so it works offline). It is a Web Push message: the **sender runs in The Universal Office's API** (`api/src/Handlers/Push.php` and the 5-minute cron job `api/cron/push.sh` in PrayerAppNew), and this page calls it across sites; `site.config.json` → `reminders.api` is its address, and `push.origins` in the Office's `config.php` must list `https://anglicansynaxarium.com`. Nothing is stored here. `public/sw-push.js` shows the notification and is pulled into `sw.js` by `tools/build-service-worker.mjs`. Setup steps: `documentation/REMINDERS.md` in PrayerAppNew.

## The podcast

**Podcast Studio (point and click).** Everything below can be done from one page instead of the terminal. Once ever: `pip install -r tools/requirements.txt` (and `sudo apt-get update && sudo apt-get install -y ffmpeg` if `ffmpeg -version` is not found). Then, in the Codespace terminal, run `npm run studio` and open port 8765 from the **Ports** tab (click the globe icon; keep the port **Private**). Five steps: Recordings (choose your GarageBand exports and click Upload; large files are sent in small pieces that shrink automatically if the Codespaces connection refuses big ones, and you can instead drag files into the `incoming` folder in the Codespace file list), Volume (evens out loudness and lets you listen to every result), Schedule (adds episodes and lets you change release times), Settings (owner name and email, description), Publish (builds the site, makes `site.zip` and `audio.zip` to download, and saves your schedule and settings to GitHub). It runs the same tools described below, and every button also works from the terminal. Press Ctrl+C in the terminal to stop it.

The audio and the feed live on this site, so the show does not depend on any outside service. Apple Podcasts, Spotify, YouTube and every other app only read the feed, `https://anglicansynaxarium.com/feed.xml`; submit that address to each once.

**Adding recordings** (do this in the Codespace). To add a short welcome episode, name its file `Welcome - ....aif` (any text after Welcome); it is released as soon as it is scheduled and marked as a trailer in the feed, which lets you submit the feed to Apple and Spotify before the first daily episode (Apple requires at least one episode). Its title and description can be set under Settings.

1. Drag the recordings (WAV or MP3) into a folder named `incoming/` (it is never committed). File names such as `November 18 - Hilda of Whitby.wav` or `11-18.mp3` both work.
2. Once ever: `pip install mutagen ffmpeg-normalize`, and if `ffmpeg -version` says command not found, `sudo apt-get update && sudo apt-get install -y ffmpeg`.
3. Even out the volume: `python3 tools/master-episodes.py incoming/`. It brings every recording to the podcast standard (stereo -16 LUFS, mono -19 LUFS, peaks under -1 dBTP; two-pass EBU R128 through the open-source `ffmpeg-normalize`), writes MP3s to `mastered/` (originals untouched), and prints a before/after table plus the loudness spread across the files. Anything it flags, such as a recording with a loud cough or mic bump that cannot be raised to target, needs that spike fixed in an audio editor first. `python3 tools/master-episodes.py --check-only audio/` measures finished files without changing them. This evens out volume only: it does not remove noise, trim silence, or add the bell.
4. Run `python3 tools/add-episodes.py mastered/`. It copies each file to `audio/MM-DD.mp3`, writes its title tags, measures it, and records it in `data/episodes.json` with a release time of 6:00 a.m. Pacific on the day itself. Add `--dry-run` to preview. Changing a release time later: edit `published` for that day in `data/episodes.json` (times are UTC).
5. Download the `audio/` folder's files and upload them into `audio/` on the web root at Spaceship (cPanel File Manager). The site's own upload never deletes them.
6. `npm run build`, then upload `dist/` as usual. The build refuses to finish if the feed has a problem.

Episodes appear in the feed, and the player and Listen buttons appear on the site, at their release time; no new upload is needed on the day. This is done by `feed.php`, which serves `feed-source.xml` as `/feed.xml` with unreleased episodes removed (see `public/.htaccess`).

**Settings** are in `site.config.json` under `feed`: owner name and email (required by Apple and Spotify, and public in the feed), description, category, copyright, release time. `npm run podcast-art` remakes `public/podcast-cover.jpg` (3000 x 3000, no transparency) from the green cover.

**After the first upload, check once:**
- `https://anglicansynaxarium.com/feed.xml` shows XML. If it says Not Found, use `https://anglicansynaxarium.com/feed.php` instead (same content).
- `curl -I -H "Range: bytes=0-1" https://anglicansynaxarium.com/audio/11-01.mp3` answers `206 Partial Content`. Apple requires it.

## Installable app (works offline)

The site is an installable web app. On a phone, open anglicansynaxarium.com and choose Add to Home Screen (iPhone: Share, then Add to Home Screen; Android: the browser menu, then Install app). After the first visit every page and entry reads with no connection. Recordings always need a connection.

- `npm run build` now also writes `dist/sw.js` (the offline copy, made with Workbox, the same tool the Universal Office uses) and checks that all 366 pages are stored and the audio and feed are not.
- When a new release is uploaded, the app downloads it quietly and offers "Update now" or "Later".
- `npm run icons` remakes the home-screen icons in `public/icons/` from the cover art (title and compass rose).
- Upload `dist/` complete each time, including `sw.js` and the `workbox-....js` file next to it. `public/.htaccess` makes sure `sw.js` is never served from a stale cache; if it is missing from the server, updates will not reach installed copies.
- The first visit downloads about 5 MB (22 MB stored). Only changed pages download again after later releases.

**Samsung Internet.** That browser builds its own Android wrapper when it installs a web app, and Google Play Protect warns about that wrapper ("built for an older version of Android"). `public/.htaccess` therefore tells Samsung Internet (and only it) that `manifest.webmanifest` does not exist, so it offers a plain home-screen shortcut instead. Chrome, Edge, Firefox and the rest still get the full install. The offline copy works the same in all of them. To undo this, delete the `SamsungBrowser` rule near the top of `public/.htaccess`.

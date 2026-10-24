#!/usr/bin/env python3
"""Prepare podcast recordings for upload and record them in data/episodes.json.

Usage:   python3 tools/add-episodes.py incoming/            (a folder of MP3 files)
         python3 tools/add-episodes.py "incoming/November 18 - Hilda of Whitby.mp3"

What it does for each MP3:
  1. Reads the day from the file name: "November 18 - Hilda of Whitby.mp3" or "11-18.mp3".
  2. Checks that the day exists in data/calendar.json.
  3. Copies the file to audio/MM-DD.mp3 (your original is never changed) and writes the
     title, artist, album and year into the copy's ID3 tags.
  4. Measures the finished copy: exact size in bytes and running time.
  5. Records the episode in data/episodes.json with its release time (default 06:00 Pacific
     on the day itself, starting from 2026-11-01). An episode already in the list keeps its
     release time unless you pass --reschedule.

Then upload everything in audio/ to the /audio/ folder on the server (see README).
"""
import argparse, json, os, re, shutil, sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

try:
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, ID3NoHeaderError, TIT2, TPE1, TALB, TDRC, TCON
except ImportError:
    sys.exit("This tool needs one small add-on. Run:  pip install mutagen   then try again.")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MANIFEST = os.path.join(ROOT, "data", "episodes.json")
CALENDAR = os.path.join(ROOT, "data", "calendar.json")
CONFIG = os.path.join(ROOT, "site.config.json")
OUT = os.path.join(ROOT, "audio")


def day_from_name(name):
    base = os.path.splitext(os.path.basename(name))[0]
    m = re.match(r"^(\d\d)-(\d\d)$", base)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r"^\s*([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b", base)
    if m:
        for i, mo in enumerate(MONTHS, 1):
            if mo.lower() == m.group(1).lower() or mo[:3].lower() == m.group(1).lower():
                return i, int(m.group(2))
    return None


def release_instant(month, day, start, hhmm, zone):
    """First occurrence of month/day on or after start, at hhmm local time, as a UTC datetime."""
    tz = ZoneInfo(zone)
    h, mi = [int(x) for x in hhmm.split(":")]
    for year in (start.year, start.year + 1):  # the podcast runs one year from its start
        try:
            d = datetime(year, month, day, h, mi, tzinfo=tz)
        except ValueError:  # February 29 in a year without one
            continue
        if d.date() >= start:
            return d.astimezone(timezone.utc), False
    # Feb 29 never falls in the first year: release the evening before March 1.
    d = datetime(start.year + 1, 2, 28, 18, 0, tzinfo=tz)
    return d.astimezone(timezone.utc), True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", help="MP3 files, or folders that contain them")
    ap.add_argument("--start", default="2026-11-01", help="first day of the podcast (default 2026-11-01)")
    ap.add_argument("--reschedule", action="store_true", help="reset release times of episodes already listed")
    ap.add_argument("--no-tags", action="store_true", help="do not write ID3 tags into the copies")
    ap.add_argument("--dry-run", action="store_true", help="show what would happen and change nothing")
    a = ap.parse_args()

    cfg = json.load(open(CONFIG, encoding="utf-8"))
    feed = cfg["feed"]
    start = datetime.strptime(a.start, "%Y-%m-%d").date()
    cal = {d["key"]: d for d in json.load(open(CALENDAR, encoding="utf-8"))["days"]}
    manifest = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {"episodes": []}
    have = {e["key"]: e for e in manifest["episodes"]}

    files = []
    for p in a.paths:
        if os.path.isdir(p):
            files += sorted(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith(".mp3"))
        else:
            files.append(p)
    if not files:
        sys.exit("No MP3 files found.")

    seen, problems, done = {}, 0, 0
    for f in files:
        label = os.path.basename(f)
        md = day_from_name(f)
        if not md:
            print(f"SKIPPED  {label}: cannot read a date from the file name (use 'November 18 - Name.mp3' or '11-18.mp3')")
            problems += 1
            continue
        key = f"{md[0]:02d}-{md[1]:02d}"
        if key not in cal:
            print(f"SKIPPED  {label}: {key} is not a day in the calendar")
            problems += 1
            continue
        if key in seen:
            print(f"SKIPPED  {label}: {key} is already supplied by {seen[key]}")
            problems += 1
            continue
        seen[key] = label
        try:
            audio = MP3(f)
        except Exception as e:  # not an MP3, or damaged
            print(f"SKIPPED  {label}: not readable as an MP3 ({e})")
            problems += 1
            continue
        info = audio.info
        notes = []
        if info.length < 60: notes.append(f"only {info.length:.0f} seconds long")
        if info.length > 30 * 60: notes.append(f"{info.length / 60:.0f} minutes long")
        if info.bitrate and info.bitrate < 48000: notes.append(f"low bitrate ({info.bitrate // 1000} kbps)")
        if info.sample_rate not in (22050, 24000, 32000, 44100, 48000): notes.append(f"unusual sample rate ({info.sample_rate} Hz)")

        title = cal[key]["name"].split(" / ")[0]
        entry_md = [x for x in os.listdir(os.path.join(ROOT, "content", "entries")) if x.startswith(key + "-")] if os.path.isdir(os.path.join(ROOT, "content", "entries")) else []
        if entry_md:
            m = re.search(r'^title:\s*"(.*)"\s*$', open(os.path.join(ROOT, "content", "entries", entry_md[0]), encoding="utf-8").read(), re.M)
            if m: title = json.loads('"' + m.group(1) + '"')

        when, shifted = release_instant(md[0], md[1], start, feed["release_time"], feed["release_zone"])
        dest = os.path.join(OUT, f"{key}.mp3")
        if a.dry_run:
            print(f"WOULD ADD {label} -> audio/{key}.mp3  ({info.length / 60:.1f} min, {info.bitrate // 1000} kbps)  release {when:%Y-%m-%d %H:%M} UTC")
            continue
        os.makedirs(OUT, exist_ok=True)
        shutil.copyfile(f, dest)
        if not a.no_tags:
            try:
                tags = ID3(dest)
            except ID3NoHeaderError:
                tags = ID3()
            tags.delall("TIT2"); tags.delall("TPE1"); tags.delall("TALB"); tags.delall("TDRC"); tags.delall("TCON")
            tags.add(TIT2(encoding=3, text=title)); tags.add(TPE1(encoding=3, text=feed["author"]))
            tags.add(TALB(encoding=3, text=feed["title"])); tags.add(TDRC(encoding=3, text=str(when.year))); tags.add(TCON(encoding=3, text="Podcast"))
            tags.save(dest, v2_version=3)
        final = MP3(dest)  # measure the file that will actually be served
        prev = have.get(key)
        published = prev["published"] if prev and not a.reschedule else when.strftime("%Y-%m-%dT%H:%M:%SZ")
        have[key] = {"key": key, "file": f"{key}.mp3", "bytes": os.path.getsize(dest), "seconds": round(final.info.length, 1), "published": published}
        done += 1
        extra = f"  [{'; '.join(notes)}]" if notes else ""
        shift = "  (no February 29 next year: released the evening of Feb 28)" if shifted else ""
        print(f"ADDED    {label} -> audio/{key}.mp3  {final.info.length / 60:.1f} min, {os.path.getsize(dest) / 1e6:.1f} MB, release {published}{extra}{shift}")

    if a.dry_run:
        return
    manifest["episodes"] = sorted(have.values(), key=lambda e: e["published"])
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"\n{done} episode(s) recorded; {len(manifest['episodes'])} in data/episodes.json; {problems} skipped.")
    if done:
        print("Next: upload the files in the audio/ folder to the /audio/ folder on the server, then build and upload the site.")


if __name__ == "__main__":
    main()

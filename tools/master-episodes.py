#!/usr/bin/env python3
"""Even out the loudness of podcast recordings so every episode sounds equally loud.

Usage:   python3 tools/master-episodes.py incoming/              (a folder of recordings)
         python3 tools/master-episodes.py "incoming/November 18 - Hilda of Whitby.wav"
         python3 tools/master-episodes.py --check-only audio/     (measure only, change nothing)

What it does for each recording:
  1. Measures it (integrated loudness in LUFS, true peak in dBTP, loudness range in LU).
  2. Corrects it with ffmpeg-normalize (open source, EBU R128, two passes) to the podcast standard:
        stereo  -16 LUFS      mono  -19 LUFS      (Apple Podcasts asks for -16 +/- 1; mono is 3 below
        because a mono file at -19 sounds as loud as a stereo file at -16)
     with peaks held at -1.5 dBTP, so the MP3 stays under -1 dBTP after encoding.
  3. Writes the result to mastered/ as an MP3 (128 kbps, 44.1 kHz) with the same file name.
     Your original recording is never changed.
  4. Measures the finished file and prints a before/after table, flagging anything outside
     +/- 1 LU of its target or above -1 dBTP.

This evens out volume only. It does not remove noise, trim silence, equalize, or add the bell.
Then run:  python3 tools/add-episodes.py mastered/
"""
import argparse, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mastered")
EXT = (".wav", ".mp3", ".m4a", ".flac", ".aif", ".aiff", ".ogg", ".aac")
TARGET_STEREO, TARGET_MONO = -16.0, -19.0
PEAK_LIMIT = -1.5   # limiter ceiling; leaves room for MP3 encoding overshoot
PEAK_MAX = -1.0     # Apple's ceiling, checked on the finished file
TOLERANCE = 1.0     # LU


def need_tools():
    missing = []
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        missing.append("ffmpeg  ->  run:  sudo apt-get update && sudo apt-get install -y ffmpeg")
    if not shutil.which("ffmpeg-normalize"):
        missing.append("ffmpeg-normalize  ->  run:  pip install ffmpeg-normalize")
    if missing:
        sys.exit("This tool needs:\n  " + "\n  ".join(missing) + "\nThen run it again.")


def channels(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try:
        return int(r.stdout.strip().split(",")[0])
    except ValueError:
        return 0


def measure(path):
    """Return (integrated LUFS, true peak dBTP, loudness range LU) or None if unreadable."""
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    text = r.stderr.split("Summary:")[-1]
    i = re.search(r"\bI:\s+(-?\d+(?:\.\d+)?)\s+LUFS", text)
    lra = re.search(r"\bLRA:\s+(-?\d+(?:\.\d+)?)\s+LU\b", text)
    pk = re.search(r"\bPeak:\s+(-?\d+(?:\.\d+)?)\s+dBFS", text)
    if not (i and lra and pk):
        return None
    return float(i.group(1)), float(pk.group(1)), float(lra.group(1))


def gather(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith(EXT))
        elif os.path.isfile(p):
            files.append(p)
        else:
            print(f"NOT FOUND  {p}")
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", help="recordings, or folders that contain them")
    ap.add_argument("--check-only", action="store_true", help="measure and report; change nothing")
    ap.add_argument("--target", type=float, help="override the loudness target in LUFS for every file")
    ap.add_argument("--bitrate", default="128k", help="MP3 bitrate (default 128k)")
    a = ap.parse_args()

    need_tools()
    files = gather(a.paths)
    if not files:
        sys.exit("No audio files found.")
    if not a.check_only:
        os.makedirs(OUT, exist_ok=True)

    rows, problems = [], 0
    for n, f in enumerate(files, 1):
        name = os.path.basename(f)
        print(f"[{n} of {len(files)}] {name}", flush=True)
        before = measure(f)
        if not before:
            print(f"SKIPPED  {name}: could not be read as audio")
            problems += 1
            continue
        ch = channels(f)
        target = a.target if a.target is not None else (TARGET_MONO if ch == 1 else TARGET_STEREO)
        kind = "mono" if ch == 1 else ("stereo" if ch == 2 else f"{ch}-channel")
        final = f
        after = before
        if not a.check_only:
            final = os.path.join(OUT, os.path.splitext(name)[0] + ".mp3")
            if os.path.abspath(final) == os.path.abspath(f):
                print(f"SKIPPED  {name}: input and output are the same file")
                problems += 1
                continue
            r = subprocess.run(["ffmpeg-normalize", f, "-nt", "ebu", "-t", str(target), "-tp", str(PEAK_LIMIT), "-lrt", "11",
                                "-c:a", "libmp3lame", "-b:a", a.bitrate, "-ar", "44100", "-ext", "mp3", "-o", final, "-f"],
                               capture_output=True, text=True)
            after = measure(final) if r.returncode == 0 and os.path.exists(final) else None
            if not after:
                print(f"FAILED   {name}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else 'no output'}")
                problems += 1
                continue
        flags = []
        if abs(after[0] - target) > TOLERANCE: flags.append(f"loudness {after[0]:+.1f} is more than {TOLERANCE:.0f} LU from target")
        if after[1] > PEAK_MAX: flags.append(f"peak {after[1]:+.1f} dBTP is above {PEAK_MAX} dBTP")
        problems += bool(flags)
        rows.append((name, kind, target, before, after, flags))

    if not rows:
        sys.exit("Nothing was processed.")
    w = max(len(r[0]) for r in rows)
    head = "BEFORE" if not a.check_only else "MEASURED"
    print(f"\n{'File'.ljust(w)}  {'Type':6}  {'Target':>6}  {head + ' LUFS / peak / range':>30}" + ("" if a.check_only else f"  {'AFTER LUFS / peak / range':>28}"))
    for name, kind, target, b, af, flags in rows:
        line = f"{name.ljust(w)}  {kind:6}  {target:6.1f}  {b[0]:9.1f} / {b[1]:6.1f} / {b[2]:5.1f}"
        if not a.check_only:
            line += f"   {af[0]:9.1f} / {af[1]:6.1f} / {af[2]:5.1f}"
        print(line + ("   <-- " + "; ".join(flags) if flags else ""))

    for kind in sorted({r[1] for r in rows}):
        vals = [r[4][0] for r in rows if r[1] == kind]
        if len(vals) > 1:
            print(f"\nLoudness spread across {len(vals)} {kind} files: {max(vals) - min(vals):.1f} LU "
                  f"(lowest {min(vals):.1f}, highest {max(vals):.1f} LUFS). Under 1 LU sounds identical.")
    if a.check_only:
        print("\nCheck only: nothing was changed.")
    else:
        print(f"\nMastered files are in {os.path.relpath(OUT, ROOT)}/. Originals are untouched.")
        print("Next: python3 tools/add-episodes.py mastered/")
    if problems:
        print(f"{problems} item(s) need attention (see above).")
        sys.exit(1)


if __name__ == "__main__":
    main()

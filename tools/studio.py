#!/usr/bin/env python3
"""Podcast Studio: a point-and-click page for the podcast tools.

Start it in the Codespace terminal:   python3 tools/studio.py
Then open port 8765 from the Ports tab (keep it set to Private).

It does nothing the command-line tools cannot do; it runs the same tools for you:
  1 Recordings  drag in your exports (stored in incoming/)            -> tools/master-episodes.py
  2 Volume      even out loudness, listen to the results (mastered/)  -> tools/master-episodes.py
  3 Schedule    add episodes, change release times (data/episodes.json) -> tools/add-episodes.py
  4 Settings    owner name and email, description (site.config.json)
  5 Publish     build the site, make site.zip and audio.zip to download, save to GitHub
Nothing is deleted except what you click Delete on. Originals are never changed.
"""
import argparse, importlib.util, json, os, re, secrets, subprocess, sys, threading, time, zipfile
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

try:
    from flask import Flask, abort, redirect, render_template, request, send_from_directory
    from jinja2 import DictLoader
except ImportError:
    sys.exit("Podcast Studio needs Flask. Run:  pip install -r tools/requirements.txt   then try again.")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
INCOMING, MASTERED, AUDIO, DIST = (os.path.join(ROOT, d) for d in ("incoming", "mastered", "audio", "dist"))
DOWNLOADS = os.path.join(ROOT, "studio-downloads")
MANIFEST = os.path.join(ROOT, "data", "episodes.json")
CONFIG = os.path.join(ROOT, "site.config.json")
CALENDAR = os.path.join(ROOT, "data", "calendar.json")
AUDIO_EXT = (".wav", ".mp3", ".m4a", ".flac", ".aif", ".aiff", ".ogg", ".aac")
TOKEN = secrets.token_urlsafe(16)  # changes every time Studio starts; guards every button against other web pages


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(TOOLS, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ADD = load_tool("add-episodes")  # reuses its file-name reader so both agree on what "November 18 - ..." means


# ---------------------------------------------------------------- data helpers
def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def calendar():
    return {d["key"]: d for d in read_json(CALENDAR, {"days": []})["days"]}


def title_for(key):
    d = calendar().get(key)
    title = d["name"].split(" / ")[0] if d else key
    entries = os.path.join(ROOT, "content", "entries")
    if os.path.isdir(entries):
        for f in os.listdir(entries):
            if f.startswith(key + "-"):
                m = re.search(r'^title:\s*"(.*)"\s*$', open(os.path.join(entries, f), encoding="utf-8").read(), re.M)
                if m:
                    return json.loads('"' + m.group(1) + '"')
    return title


def zone():
    return ZoneInfo(read_json(CONFIG, {}).get("feed", {}).get("release_zone", "America/Los_Angeles"))


def to_local(iso):
    dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(zone())
    return dt.strftime("%Y-%m-%dT%H:%M")


def from_local(text):
    dt = datetime.strptime(text, "%Y-%m-%dT%H:%M").replace(tzinfo=zone())
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def mb(n):
    return f"{n / 1e6:.1f} MB"


def audio_files(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(f for f in os.listdir(folder) if f.lower().endswith(AUDIO_EXT) and not f.startswith("."))


def clean_name(name):
    name = os.path.basename(name.replace("\\", "/"))
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "", name).strip().lstrip(".")
    return name


# ---------------------------------------------------------------- background tasks
JOBS = {}
LOCK = threading.Lock()


def running_job():
    for jid, j in JOBS.items():
        if j["status"] == "running":
            return jid
    return None


def start_job(title, steps, nxt):
    """steps: a list of commands (lists) or functions(log)->bool, run one after another."""
    with LOCK:
        if running_job():
            return None
        jid = str(int(time.time() * 1000))
        JOBS[jid] = {"title": title, "status": "running", "log": [], "next": nxt, "started": time.time()}
    threading.Thread(target=run_job, args=(jid, steps), daemon=True).start()
    return jid


def run_job(jid, steps):
    job = JOBS[jid]
    log = job["log"].append
    env = dict(os.environ, PYTHONUNBUFFERED="1", GIT_TERMINAL_PROMPT="0")
    ok = True
    try:
        for step in steps:
            if callable(step):
                ok = step(log)
            else:
                log("$ " + " ".join(step))
                p = subprocess.Popen(step, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
                for line in p.stdout:
                    log(line.rstrip("\n"))
                ok = p.wait() == 0
            if not ok:
                break
    except Exception as e:  # show the reason on the page instead of failing silently
        log(f"Error: {e}")
        ok = False
    job["status"] = "done" if ok else "failed"
    log("")
    log("Finished." if ok else "Stopped: something needs attention (see above).")


def make_zips(log):
    os.makedirs(DOWNLOADS, exist_ok=True)
    if os.path.isdir(DIST):
        out = os.path.join(DOWNLOADS, "site.zip")
        n = 0
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for base, _dirs, files in os.walk(DIST):
                for f in files:
                    full = os.path.join(base, f)
                    z.write(full, os.path.relpath(full, DIST))
                    n += 1
        log(f"site.zip: {n} files, {mb(os.path.getsize(out))}")
    else:
        log("No built site yet (dist/ is missing). Build the site first.")
        return False
    names = [e["file"] for e in read_json(MANIFEST, {"episodes": []})["episodes"] if os.path.exists(os.path.join(AUDIO, e["file"]))]
    out = os.path.join(DOWNLOADS, "audio.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for f in names:
            z.write(os.path.join(AUDIO, f), f)
    log(f"audio.zip: {len(names)} recordings, {mb(os.path.getsize(out))}")
    return True


def save_to_github(log):
    files = ["data/episodes.json", "site.config.json"]

    def run(argv):
        log("$ " + " ".join(argv))
        p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
        text = (p.stdout + p.stderr).strip()
        if text:
            log(text)
        return p.returncode

    if run(["git", "add"] + files):
        return False
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        log("These two files already match what is saved; nothing new to commit.")
    elif run(["git", "commit", "-m", "Podcast: schedule and settings (saved from Podcast Studio)"]):
        return False
    return run(["git", "push"]) == 0


# ---------------------------------------------------------------- pages
STYLE = """
body{font:16px/1.55 system-ui,-apple-system,sans-serif;margin:0;color:#1c2020;background:#f3f2ee}
header{background:#1f4a33;color:#fbfaf7;padding:14px 24px}
header h1{margin:0 0 8px;font-size:22px;font-weight:600}header small{font-weight:400;opacity:.85;margin-left:8px}
nav a{color:#fbfaf7;text-decoration:none;padding:6px 12px;border-radius:4px;margin-right:4px;display:inline-block}
nav a.on{background:#fbfaf7;color:#1f4a33;font-weight:600}
main{max-width:62rem;margin:0 auto;padding:20px 24px 60px}
h2{margin-top:0}
.card{background:#fbfaf7;border:1px solid #cbc8bd;border-radius:8px;padding:16px 20px;margin:16px 0}
.note{background:#d8e9dc;padding:10px 24px}.banner{background:#f4e3b3;padding:10px 24px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e0ddd2;vertical-align:middle}
th{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#545a58}
button,.btn{font:inherit;padding:8px 16px;border-radius:4px;border:1.5px solid #1c2020;background:transparent;cursor:pointer;color:#1c2020;text-decoration:none;display:inline-block}
button.primary,.btn.primary{background:#2b6540;border-color:#2b6540;color:#fff}
button.danger{border-color:#9a2b2b;color:#9a2b2b;padding:3px 10px}
input[type=text],input[type=email],input[type=time],input[type=datetime-local],textarea{font:inherit;padding:6px 8px;width:100%;box-sizing:border-box;border:1px solid #767b78;border-radius:4px}
label{display:block;margin:12px 0 4px;font-weight:600}.hint{color:#545a58;font-size:14px;font-weight:400}
pre{background:#1c2020;color:#e8e6df;padding:14px;border-radius:6px;overflow:auto;font-size:13px;white-space:pre-wrap}
.ok{color:#2b6540;font-weight:600}.bad{color:#9a2b2b;font-weight:600}.muted{color:#545a58}
audio{width:100%;max-width:340px;height:34px}
"""

TEMPLATES = {
    "base.html": """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ title }} - Podcast Studio</title>{% if refresh %}<meta http-equiv="refresh" content="{{ refresh }}">{% endif %}
<style>""" + STYLE + """</style></head><body>
<header><h1>Podcast Studio <small><em>An Anglican Synaxarium</em></small></h1>
<nav>{% for href, label, key in steps %}<a href="{{ href }}" class="{{ 'on' if key == active else '' }}">{{ label }}</a>{% endfor %}</nav></header>
{% if running %}<div class="banner">A task is running. <a href="/job/{{ running }}">Watch it</a></div>{% endif %}
{% if msg %}<div class="note">{{ msg }}</div>{% endif %}
<main>{% block body %}{% endblock %}</main></body></html>""",

    "recordings.html": """{% extends 'base.html' %}{% block body %}
<h2>1. Recordings</h2>
<div class="card">
<p>Add your finished exports here (the bell already mixed in). In GarageBand: <b>Share, then Export Song to Disk</b>, and choose <b>WAV</b> or <b>AIFF</b> (best quality for the next step; MP3 also works). Name each file with its day, like <code>November 18 - Hilda of Whitby.wav</code>.</p>
<form method="post" action="/recordings/upload" enctype="multipart/form-data">
<input type="hidden" name="t" value="{{ token }}">
<input type="file" name="files" multiple accept=".wav,.aif,.aiff,.mp3,.m4a,.flac,.ogg,.aac"> <button class="primary">Upload</button>
</form></div>
<div class="card"><h3>In the incoming folder ({{ files|length }})</h3>
{% if files %}<table><tr><th>File</th><th>Day</th><th>Size</th><th>Mastered?</th><th></th></tr>
{% for f in files %}<tr><td>{{ f.name }}</td>
<td>{% if f.day %}<span class="ok">{{ f.day }}</span>{% else %}<span class="bad">cannot read a date from this name</span>{% endif %}</td>
<td>{{ f.size }}</td><td>{{ 'yes' if f.mastered else 'not yet' }}</td>
<td><form method="post" action="/recordings/delete" onsubmit="return confirm('Delete {{ f.name }} from the incoming folder?')"><input type="hidden" name="t" value="{{ token }}"><input type="hidden" name="name" value="{{ f.name }}"><button class="danger">Delete</button></form></td></tr>{% endfor %}</table>
<p><a class="btn primary" href="/volume">Next: 2. Volume</a></p>
{% else %}<p class="muted">Nothing here yet.</p>{% endif %}</div>
{% endblock %}""",

    "volume.html": """{% extends 'base.html' %}{% block body %}
<h2>2. Volume</h2>
<div class="card"><p>Evens out the loudness of every recording so they all sound equally loud: <b>-16 LUFS</b> for stereo, <b>-19 LUFS</b> for mono, with peaks kept under -1 dBTP (the Apple Podcasts standard). Your originals are never changed; the results go to the mastered folder. It takes about a minute per recording.</p>
<form method="post" action="/volume/run" style="display:inline"><input type="hidden" name="t" value="{{ token }}"><button class="primary" {% if not incoming %}disabled{% endif %}>Even out the volume of {{ incoming }} recording{{ '' if incoming == 1 else 's' }}</button></form>
<form method="post" action="/volume/check" style="display:inline"><input type="hidden" name="t" value="{{ token }}"><button {% if not mastered %}disabled{% endif %}>Re-measure the mastered files</button></form>
<p class="hint">It evens out volume only. It does not remove noise or trim silence. A recording with a loud cough or mic bump may be flagged; fix that spike in GarageBand and export again.</p></div>
<div class="card"><h3>Mastered ({{ mastered|length }})</h3>
{% if mastered %}<p class="hint">Listen to a few before you go on. Check the quiet and loud ones especially.</p>
<table><tr><th>File</th><th>Size</th><th>Listen</th></tr>
{% for f in mastered %}<tr><td>{{ f.name }}</td><td>{{ f.size }}</td><td><audio controls preload="none" src="/files/mastered/{{ f.name|urlencode }}"></audio></td></tr>{% endfor %}</table>
<p><a class="btn primary" href="/schedule">Next: 3. Schedule</a></p>{% else %}<p class="muted">Nothing mastered yet.</p>{% endif %}</div>
{% endblock %}""",

    "schedule.html": """{% extends 'base.html' %}{% block body %}
<h2>3. Schedule</h2>
<div class="card"><p>Adds the mastered recordings to the podcast and gives each its release time (6:00 a.m. on its own day by default). Listeners and apps see an episode only after its release time, so you can add a whole month ahead.</p>
<form method="post" action="/schedule/add"><input type="hidden" name="t" value="{{ token }}"><button class="primary" {% if not mastered %}disabled{% endif %}>Add {{ mastered }} mastered recording{{ '' if mastered == 1 else 's' }} to the schedule</button></form></div>
<div class="card"><h3>Scheduled episodes ({{ rows|length }})</h3>
{% if rows %}<form method="post" action="/schedule/save"><input type="hidden" name="t" value="{{ token }}">
<table><tr><th>Day</th><th>Title</th><th>Release ({{ zone }})</th><th>Length</th><th>Status</th><th>Listen</th><th></th></tr>
{% for r in rows %}<tr><td>{{ r.key }}</td><td>{{ r.title }}</td>
<td><input type="datetime-local" name="rel_{{ r.key }}" value="{{ r.local }}"></td><td>{{ r.length }}</td>
<td>{% if r.live %}<span class="ok">live</span>{% else %}scheduled{% endif %}{% if not r.present %}<br><span class="bad">audio file not on this computer</span>{% endif %}</td>
<td>{% if r.present %}<audio controls preload="none" src="/files/audio/{{ r.file|urlencode }}"></audio>{% endif %}</td>
<td><button class="danger" formaction="/schedule/remove" formmethod="post" name="key" value="{{ r.key }}" onclick="return confirm('Remove {{ r.key }} from the schedule? The audio file stays on disk.')">Remove</button></td></tr>{% endfor %}</table>
<p><button class="primary">Save release times</button></p></form>
<p class="hint">Remember to save to GitHub in step 5 so these changes are kept.</p>
<p><a class="btn primary" href="/settings">Next: 4. Settings</a></p>
{% else %}<p class="muted">No episodes yet.</p>{% endif %}</div>
{% endblock %}""",

    "settings.html": """{% extends 'base.html' %}{% block body %}
<h2>4. Settings</h2>
<form method="post" action="/settings/save" class="card"><input type="hidden" name="t" value="{{ token }}">
<p class="hint">These go in the podcast feed. Apple and Spotify require an owner name and email, and the email is <b>public</b> in the feed.</p>
<label>Owner name</label><input type="text" name="owner_name" value="{{ f.owner_name }}">
<label>Owner email</label><input type="email" name="owner_email" value="{{ f.owner_email }}">
<label>Show description <span class="hint">(the text under the show title in podcast apps)</span></label><textarea name="description" rows="3">{{ f.description }}</textarea>
<label>Copyright line <span class="hint">(optional)</span></label><input type="text" name="copyright" value="{{ f.copyright }}">
<label>Release time of day <span class="hint">({{ f.release_zone }}; used when new episodes are added)</span></label><input type="time" name="release_time" value="{{ f.release_time }}" style="width:10rem">
<label><input type="checkbox" name="transcripts" {% if f.transcripts %}checked{% endif %} style="width:auto"> Offer the written entry as the transcript in apps that show one</label>
<p><button class="primary">Save settings</button></p></form>
<p><a class="btn primary" href="/publish">Next: 5. Publish</a></p>
{% endblock %}""",

    "publish.html": """{% extends 'base.html' %}{% block body %}
<h2>5. Publish</h2>
<div class="card"><h3>Checklist</h3><table>
{% for ok, text, link in checks %}<tr><td class="{{ 'ok' if ok else 'bad' }}" style="width:2rem">{{ 'OK' if ok else 'NO' }}</td><td>{{ text }}{% if link and not ok %} <a href="{{ link }}">Fix this</a>{% endif %}</td></tr>{% endfor %}</table></div>
<div class="card"><h3>A. Build the site</h3><p>Rebuilds the website and the podcast feed, and checks them. It stops with a message if anything is wrong.</p>
<form method="post" action="/publish/build"><input type="hidden" name="t" value="{{ token }}"><button class="primary">Build the site</button></form></div>
<div class="card"><h3>B. Make the files to upload</h3><p>Packs the built site into <b>site.zip</b> and your recordings into <b>audio.zip</b>.</p>
<form method="post" action="/publish/zip"><input type="hidden" name="t" value="{{ token }}"><button class="primary">Make site.zip and audio.zip</button></form>
{% if zips %}<p>{% for z in zips %}<a class="btn" href="/download/{{ z.name }}">Download {{ z.name }}</a> <span class="muted">{{ z.size }}, made {{ z.when }}</span><br>{% endfor %}</p>{% endif %}
<p class="hint">Upload with cPanel File Manager: extract <b>site.zip</b> in the web folder, and extract <b>audio.zip</b> inside its <b>audio</b> folder (create it the first time).</p></div>
<div class="card"><h3>C. Save to GitHub</h3><p>Saves your schedule and settings (<code>data/episodes.json</code> and <code>site.config.json</code>) so they are not lost.</p>
<form method="post" action="/publish/git"><input type="hidden" name="t" value="{{ token }}"><button class="primary">Save to GitHub</button></form></div>
{% endblock %}""",

    "job.html": """{% extends 'base.html' %}{% block body %}
<h2>{{ job.title }}</h2>
<p>{% if job.status == 'running' %}<b>Running...</b> this page refreshes by itself.{% elif job.status == 'done' %}<span class="ok">Finished.</span>{% else %}<span class="bad">Stopped. Something needs attention.</span>{% endif %}</p>
<pre>{{ job.log|join('\\n') }}</pre>
{% if job.status != 'running' %}<p><a class="btn primary" href="{{ job.next }}">Continue</a></p>{% endif %}
{% endblock %}""",
}

STEPS = [("/recordings", "1 Recordings", "recordings"), ("/volume", "2 Volume", "volume"), ("/schedule", "3 Schedule", "schedule"),
         ("/settings", "4 Settings", "settings"), ("/publish", "5 Publish", "publish")]

app = Flask(__name__)
app.jinja_loader = DictLoader(TEMPLATES)
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 ** 3
app.config["MAX_FORM_MEMORY_SIZE"] = 64 * 1024 * 1024


@app.context_processor
def common():
    return {"steps": STEPS, "running": running_job(), "msg": request.args.get("msg", ""), "token": TOKEN}


@app.before_request
def guard():
    if request.method == "POST" and request.form.get("t") != TOKEN:
        abort(403, "This page is out of date. Go back, reload it, and try again.")


def page(name, active, title, **kw):
    return render_template(name, active=active, title=title, **kw)


@app.get("/")
def index_redirect():
    return redirect("/recordings")


@app.get("/recordings")
def recordings():
    cal, rows = calendar(), []
    done = {os.path.splitext(f)[0] for f in audio_files(MASTERED)}
    for f in audio_files(INCOMING):
        md = ADD.day_from_name(f)
        key = f"{md[0]:02d}-{md[1]:02d}" if md else None
        day = f"{ADD.MONTHS[md[0] - 1]} {md[1]}: {title_for(key)}" if key and key in cal else None
        rows.append({"name": f, "day": day, "size": mb(os.path.getsize(os.path.join(INCOMING, f))), "mastered": os.path.splitext(f)[0] in done})
    return page("recordings.html", "recordings", "Recordings", files=rows)


@app.post("/recordings/upload")
def upload():
    os.makedirs(INCOMING, exist_ok=True)
    saved = skipped = 0
    for f in request.files.getlist("files"):
        name = clean_name(f.filename or "")
        if not name.lower().endswith(AUDIO_EXT):
            skipped += bool(name)
            continue
        f.save(os.path.join(INCOMING, name))
        saved += 1
    msg = f"Uploaded {saved} file{'' if saved == 1 else 's'}." + (f" Skipped {skipped} that were not audio." if skipped else "")
    return redirect("/recordings?msg=" + msg.replace(" ", "+"))


@app.post("/recordings/delete")
def delete_recording():
    name = clean_name(request.form.get("name", ""))
    path = os.path.join(INCOMING, name)
    if name and os.path.isfile(path) and os.path.dirname(os.path.abspath(path)) == INCOMING:
        os.remove(path)
        return redirect("/recordings?msg=Deleted+" + name.replace(" ", "+"))
    return redirect("/recordings?msg=File+not+found")


@app.get("/volume")
def volume():
    m = [{"name": f, "size": mb(os.path.getsize(os.path.join(MASTERED, f)))} for f in audio_files(MASTERED)]
    return page("volume.html", "volume", "Volume", incoming=len(audio_files(INCOMING)), mastered=m)


def go(title, steps, nxt, fallback):
    jid = start_job(title, steps, nxt)
    return redirect(f"/job/{jid}" if jid else fallback + "?msg=Another+task+is+still+running")


@app.post("/volume/run")
def volume_run():
    return go("Evening out the volume", [[sys.executable, "-u", "tools/master-episodes.py", "incoming/"]], "/volume", "/volume")


@app.post("/volume/check")
def volume_check():
    return go("Measuring the mastered files", [[sys.executable, "-u", "tools/master-episodes.py", "--check-only", "mastered/"]], "/volume", "/volume")


@app.get("/schedule")
def schedule():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for e in sorted(read_json(MANIFEST, {"episodes": []})["episodes"], key=lambda e: e["published"]):
        rows.append({"key": e["key"], "file": e["file"], "title": title_for(e["key"]), "local": to_local(e["published"]),
                     "length": f"{int(e['seconds']) // 60}:{int(e['seconds']) % 60:02d}", "live": e["published"] <= now,
                     "present": os.path.exists(os.path.join(AUDIO, e["file"]))})
    return page("schedule.html", "schedule", "Schedule", rows=rows, mastered=len(audio_files(MASTERED)), zone=str(zone()))


@app.post("/schedule/add")
def schedule_add():
    return go("Adding recordings to the schedule", [[sys.executable, "-u", "tools/add-episodes.py", "mastered/"]], "/schedule", "/schedule")


@app.post("/schedule/save")
def schedule_save():
    data = read_json(MANIFEST, {"episodes": []})
    changed = 0
    for e in data["episodes"]:
        v = request.form.get("rel_" + e["key"], "").strip()
        if v:
            try:
                new = from_local(v)
            except ValueError:
                return redirect("/schedule?msg=Could+not+read+the+date+for+" + e["key"])
            if new != e["published"]:
                e["published"], changed = new, changed + 1
    data["episodes"].sort(key=lambda e: e["published"])
    write_json(MANIFEST, data)
    return redirect(f"/schedule?msg=Saved.+{changed}+release+time{'' if changed == 1 else 's'}+changed.")


@app.post("/schedule/remove")
def schedule_remove():
    key = request.form.get("key", "")
    data = read_json(MANIFEST, {"episodes": []})
    data["episodes"] = [e for e in data["episodes"] if e["key"] != key]
    write_json(MANIFEST, data)
    return redirect("/schedule?msg=Removed+" + key)


@app.get("/settings")
def settings():
    return page("settings.html", "settings", "Settings", f=read_json(CONFIG, {}).get("feed", {}))


@app.post("/settings/save")
def settings_save():
    cfg = read_json(CONFIG, {})
    feed = cfg.setdefault("feed", {})
    email = request.form.get("owner_email", "").strip()
    time_of_day = request.form.get("release_time", "").strip()
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return redirect("/settings?msg=That+does+not+look+like+an+email+address.+Nothing+was+saved.")
    if time_of_day and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time_of_day):
        return redirect("/settings?msg=Could+not+read+the+release+time.+Nothing+was+saved.")
    feed["owner_name"] = request.form.get("owner_name", "").strip()
    feed["owner_email"] = email
    feed["description"] = request.form.get("description", "").strip()
    feed["copyright"] = request.form.get("copyright", "").strip()
    if time_of_day:
        feed["release_time"] = time_of_day
    feed["transcripts"] = "transcripts" in request.form
    write_json(CONFIG, cfg)
    return redirect("/settings?msg=Saved.")


@app.get("/publish")
def publish():
    feed = read_json(CONFIG, {}).get("feed", {})
    eps = read_json(MANIFEST, {"episodes": []})["episodes"]
    email_ok = bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", feed.get("owner_email", "")))
    missing = [e["key"] for e in eps if not os.path.exists(os.path.join(AUDIO, e["file"]))]
    checks = [
        (email_ok, "Owner email is filled in (Apple and Spotify require it)", "/settings"),
        (bool(feed.get("owner_name", "").strip()), "Owner name is filled in", "/settings"),
        (bool(eps), f"{len(eps)} episode{'' if len(eps) == 1 else 's'} in the schedule", "/schedule"),
        (not missing, "Every scheduled episode has its audio file on this computer" + (f" (missing: {', '.join(missing)})" if missing else ""), "/schedule"),
    ]
    zips = []
    for n in ("site.zip", "audio.zip"):
        p = os.path.join(DOWNLOADS, n)
        if os.path.exists(p):
            zips.append({"name": n, "size": mb(os.path.getsize(p)), "when": datetime.fromtimestamp(os.path.getmtime(p)).strftime("%b %d, %H:%M")})
    return page("publish.html", "publish", "Publish", checks=checks, zips=zips)


@app.post("/publish/build")
def publish_build():
    return go("Building the site", [["npm", "run", "build"]], "/publish", "/publish")


@app.post("/publish/zip")
def publish_zip():
    return go("Making the files to upload", [make_zips], "/publish", "/publish")


@app.post("/publish/git")
def publish_git():
    return go("Saving to GitHub", [save_to_github], "/publish", "/publish")


@app.get("/job/<jid>")
def job(jid):
    j = JOBS.get(jid)
    if not j:
        abort(404)
    return page("job.html", "", j["title"], job=j, refresh=2 if j["status"] == "running" else None)


@app.get("/files/<kind>/<path:name>")
def files(kind, name):
    folder = {"mastered": MASTERED, "audio": AUDIO, "incoming": INCOMING}.get(kind)
    if not folder:
        abort(404)
    return send_from_directory(folder, name, conditional=True)


@app.get("/download/<name>")
def download(name):
    if name not in ("site.zip", "audio.zip"):
        abort(404)
    return send_from_directory(DOWNLOADS, name, as_attachment=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 if the Ports tab shows nothing")
    a = ap.parse_args()
    print(f"\nPodcast Studio is starting on port {a.port}.")
    print("In Codespaces: open the Ports tab, find the port, and click the globe icon. Keep its visibility Private.")
    print("Stop it with Ctrl+C.\n")
    app.run(host=a.host, port=a.port, threaded=True)


if __name__ == "__main__":
    main()

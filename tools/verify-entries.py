#!/usr/bin/env python3
"""Compare the entries on this site with the approved Google Docs, word for word.

How to use (about two minutes):
 1. In Google Drive, open Anglican Synaxarium > Completed Hagiographies.
    Right-click the folder > Download. Drive sends a zip of Word files.
 2. Drag that zip into the Codespace, then run:
        pip install python-docx
        python3 tools/verify-entries.py path/to/the-downloaded.zip
 3. It prints OK or the exact differences for each November and December entry.

Quote marks, dashes, spacing, heading markup and Google's backslash escapes are
ignored. Every word, number and punctuation mark that carries meaning is compared.
"""
import glob, io, os, re, sys, zipfile
from docx import Document

def norm(t):
    t = t.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    t = t.replace("\u2014", "-").replace("\u2013", "-").replace("\xa0", " ")
    t = t.replace("\\!", "!").replace("\\", "")
    t = re.sub(r"\*+", "", t)
    t = re.sub(r"^#+\s*", "", t)
    return re.sub(r"\s+", " ", t).strip()

def paragraphs_from_docx(data):
    doc = Document(io.BytesIO(data))
    return [norm(p.text) for p in doc.paragraphs if norm(p.text)]

def paragraphs_from_source(path):
    text = open(path, encoding="utf-8").read()
    return [norm(b) for b in re.split(r"\n\s*\n", text) if norm(b)]

if len(sys.argv) < 2:
    sys.exit(__doc__)
z = zipfile.ZipFile(sys.argv[1])
docs = {}
for name in z.namelist():
    m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December) (\d\d)", os.path.basename(name))
    if m and name.lower().endswith(".docx"):
        mon = ["January","February","March","April","May","June","July","August","September","October","November","December"].index(m.group(1)) + 1
        docs[f"{mon:02d}-{m.group(2)}"] = z.read(name)

bad = missing = ok = 0
for src in sorted(glob.glob("content/source/*.txt")):
    key = os.path.basename(src)[:-4]
    if key not in docs:
        print(f"{key}: no matching Word file in the zip"); missing += 1; continue
    a, b = paragraphs_from_docx(docs[key]), paragraphs_from_source(src)
    # The site never shows the dated heading line, so compare from the second paragraph or from the heading's own words.
    problems = []
    for i in range(max(len(a), len(b))):
        x = a[i] if i < len(a) else "(missing)"
        y = b[i] if i < len(b) else "(missing)"
        if x != y:
            # Heading lines differ in markup and rank words only; flag everything else.
            problems.append((i + 1, x, y))
    if problems:
        bad += 1
        print(f"\n{key}: {len(problems)} paragraph(s) differ")
        for n, x, y in problems[:6]:
            print(f"  paragraph {n}\n    Drive: {x[:200]}\n    Site : {y[:200]}")
    else:
        ok += 1
print(f"\n{ok} entries match exactly, {bad} differ, {missing} not found.")

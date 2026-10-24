import unicodedata
#!/usr/bin/env python3
"""Turn approved Google Doc text (content/source/MM-DD.txt) into content/entries/MM-DD-slug.md.

The words of an entry are never changed. Only the heading is read for a title:
the part before the em dash, minus a trailing rank phrase, set in Title Case.
Format of a source file: a bold heading line, the entry paragraphs (the first is
the opening line), a line "Let us pray.", then the collect.
"""
import glob, os, re, json

RANKS = [", Principal Feast", ", Major Feast", ", Commemoration", ", Feast of Our Lord"]
SMALL = {"a","an","the","and","but","or","nor","for","so","yet","of","in","on","at","to","by","up","as","her","his","from","with","de","von","van"}

def title_case(t):
    words = t.split(" ")
    out = []
    for i, w in enumerate(words):
        core = w.lower()
        if i > 0 and core in SMALL and not words[i - 1].endswith(":"):
            out.append(core)
        elif w[:1].islower() or w.isupper() is False and w[:1].isalpha() and w[:1].islower():
            out.append(w[:1].upper() + w[1:])
        else:
            out.append(w)
    return " ".join(out)

def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()  # Dũng-Lạc -> Dung-Lac
    s = re.sub(r"[^a-z0-9]+", "-", t.lower().replace("’", "")).strip("-")
    return s[:48].rstrip("-")

os.makedirs("content/entries", exist_ok=True)
for old in glob.glob("content/entries/*.md"):
    os.remove(old)

count = 0
for path in sorted(glob.glob("content/source/*.txt")):
    key = os.path.basename(path)[:-4]
    text = open(path, encoding="utf-8").read().strip()
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    m = re.match(r"^(?:#+\s*)?(?:\*\*)?(.+?)\s+—\s+[A-Za-z]+ \d+(?:st|nd|rd|th)?(?:\*\*)?$", blocks[0])
    if m:
        title, first_body = m.group(1), 1
    else:
        # Two-line heading: "# Name" then "## Office, year — Month Day".
        m1 = re.match(r"^#\s+(.+)$", blocks[0])
        m2 = re.match(r"^##\s+(.+?)\s+—\s+[A-Za-z]+ \d+(?:st|nd|rd|th)?$", blocks[1]) if len(blocks) > 1 else None
        assert m1 and m2, f"{key}: heading not recognized: {blocks[0][:80]}"
        title, first_body = f"{m1.group(1)}, {m2.group(1)}", 2
    for r in RANKS:
        if title.endswith(r):
            title = title[: -len(r)]
    title = re.sub(r",\s*(?:c\.\s*)?\d{3,4}(?:\s+and\s+\d{3,4}|\s*[–-]\s*\d{3,4})*$|,\s*(?:First Century|About \d{3,4})$", "", title)  # a year in the heading is shown separately as the period
    title = title_case(title)
    pray = [i for i, b in enumerate(blocks) if b == "Let us pray."]
    assert len(pray) == 1, f"{key}: need exactly one 'Let us pray.' line"
    body, collect = blocks[first_body : pray[0]], blocks[pray[0] + 1 :]
    assert body and collect, key
    opening = "greater-church" if body[0].startswith("Today the Greater Church") else "church"
    out = ["---", f'key: "{key}"', "title: " + json.dumps(title, ensure_ascii=False), "status: approved", f"opening: {opening}", "---", ""]
    out += [b + "\n" for b in body]
    out += ["## Collect\n"] + [b + "\n" for b in collect]
    open(f"content/entries/{key}-{slug(title)}.md", "w", encoding="utf-8").write("\n".join(out))
    count += 1
print("converted", count, "entries")

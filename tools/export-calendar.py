#!/usr/bin/env python3
"""Rebuild data/calendar.json from the PrayerAppNew decisions file.

Usage: python3 tools/export-calendar.py path/to/PrayerAppNew/data/kalendar/synaxarium/decisions.json

Only public fields leave this script: key, month, day, name, designation, period,
and the curator-approved alternates. No SIN numbers, sources, tiers or flags.
OVERRIDES holds curator decisions newer than the repository export; each one
cites its date in Calendar and Admission Decisions (Google Drive).
"""
import json, sys

OVERRIDES = {
    # Curator decisions of October 23, 2026.
    "12-31": {"name": "Samuel Ajayi Crowther", "designation": "Bishop in the Niger Territories", "period": "1891"},
    "11-28": {"period": "1863 and 1885"},  # matches the approved entry heading; the BCP calendar prints 1864
    "08-14": {"name": "Jonathan Myrick Daniels", "designation": "Seminarian and Martyr", "period": "1965"},
    # Section I, curator decision October 21, 2026.
    "12-16": {"name": "Richard Upjohn", "designation": "Architect", "period": "1878"},
}

src = sys.argv[1]
decisions = json.load(open(src))["decisions"]
days = []
for key in sorted(decisions):
    rec = decisions[key]
    p = dict(rec["primary"])
    p.update(OVERRIDES.get(key, {}))
    alts = [
        {"name": a["name"], "designation": a.get("designation", ""), "period": a.get("period", "")}
        for a in rec.get("alternates", [])
        if a.get("curator_approved") is True and key not in OVERRIDES
    ]
    month, day = (int(x) for x in key.split("-"))
    days.append({
        "key": key, "month": month, "day": day,
        "name": p["name"], "designation": p.get("designation", ""),
        "period": p.get("period", ""), "alternates": alts,
    })
assert len(days) == 366, len(days)
json.dump({"days": days}, open("data/calendar.json", "w"), indent=1, ensure_ascii=False)
print("wrote", len(days), "days")

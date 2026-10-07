#!/usr/bin/env python3
"""Packt src/pkjs/einstellungen.html als String in src/pkjs/einstellungen_seite.js (wird von bauen.sh aufgerufen).
Setzt dabei src/pkjs/logik.js an die Marke /*LOGIK*/ — dieselbe Logik, die das Handy-Skript fürs Uhr-Menü nutzt."""
import json
from pathlib import Path
basis = Path(__file__).resolve().parent.parent / "src" / "pkjs"
html = (basis / "einstellungen.html").read_text(encoding="utf-8")
logik = (basis / "logik.js").read_text(encoding="utf-8")
assert html.count("/*LOGIK*/") == 1, "Marke /*LOGIK*/ fehlt oder steht mehrfach in einstellungen.html"
html = html.replace("/*LOGIK*/", logik)
(basis / "einstellungen_seite.js").write_text(
    "// Automatisch erzeugt von tools/seite_erzeugen.py aus einstellungen.html und logik.js — nicht von Hand ändern.\n"
    "module.exports = " + json.dumps(html, ensure_ascii=True) + ";\n", encoding="utf-8")
print("einstellungen_seite.js:", len(html), "Zeichen")

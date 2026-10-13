#!/usr/bin/env python3
"""Erzeugt src/pkjs/db_bahnhoefe.json: alle DB-Bahnhöfe mit EVA-Nummer und Koordinaten (seit 0.9.0).

Das Handy-Skript ordnet damit eine Haltestelle (Koordinaten aus Transitous oder RMV) dem DB-Bahnhof zu,
dessen Abfahrtstafel es bei DB Timetables abfragt. Die Namenssuche von Timetables taugt dafür nicht
("Wiesbaden Hauptbahnhof" findet nichts, nur "Wiesbaden").

Quelle: Paket db-stations (derhuerst), Daten der DB Station&Service, Lizenz CC BY 4.0.
Format: "eva,lat,lon[,eva2...];..." mit lat/lon * 10^4 als ganze Zahl, EVA 80xxxxx als "xxxxx" (minus 8000000).
Weitere EVA-Nummern (z. B. Frankfurt Hbf tief) stehen hinter den Koordinaten.

Aufruf: python3 tools/db_bahnhoefe_erzeugen.py   (lädt einmal ~7,5 MB, nur bei Bedarf neu erzeugen)
"""
import json
import urllib.request
from pathlib import Path

VERSION = "5.0.2"
URL = f"https://unpkg.com/db-stations@{VERSION}/full.ndjson"
ziel = Path(__file__).resolve().parent.parent / "src" / "pkjs" / "db_bahnhoefe.json"


def kurz(eva):
    eva = int(eva)
    return str(eva - 8000000) if 8000000 <= eva < 8100000 else "~" + str(eva)


zeilen = urllib.request.urlopen(URL, timeout=60).read().decode("utf-8").splitlines()
teile, n = [], 0
for z in zeilen:
    if not z.strip():
        continue
    d = json.loads(z)
    loc = d.get("location") or {}
    if loc.get("latitude") is None or not d.get("id"):
        continue
    evas = [kurz(d["id"])] + [kurz(x) for x in d.get("additionalIds") or []]
    teile.append(",".join([evas[0], str(round(loc["latitude"] * 1e4)), str(round(loc["longitude"] * 1e4))] + evas[1:]))
    n += 1

daten = {"quelle": f"db-stations {VERSION}, DB Station&Service, CC BY 4.0", "b": ";".join(teile)}
ziel.write_text(json.dumps(daten, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
print(f"{ziel.name}: {n} Bahnhöfe, {ziel.stat().st_size // 1024} KB")

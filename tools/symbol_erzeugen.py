#!/usr/bin/env python3
"""App-Symbol im LED-Stil: 8 x 8 LEDs, Abstand 3 px, LED 2 x 2 px, auf schwarzer Tafel 25 x 25 px.
Schreibt resources/images/symbol_<variante>.png (für die Uhr) und eine 8-fach vergrößerte Vorschau.
Aufruf: python3 tools/symbol_erzeugen.py"""
import struct, zlib
from pathlib import Path

MUSTER = {
    "acht": [  # die "8" der Abfahrtszeile, darunter eine Zeile wie eine Restminuten-Anzeige
        "..####..",
        ".#....#.",
        ".#....#.",
        "..####..",
        ".#....#.",
        ".#....#.",
        "..####..",
        "........",
    ],
}
AN, AUS, TAFEL = (255, 170, 0, 255), (85, 0, 0, 255), (0, 0, 0, 255)

def bild(muster):
    px = [[(0, 0, 0, 0)] * 25 for _ in range(25)]
    for y in range(25):                      # Tafel mit abgeschnittenen Ecken
        for x in range(25):
            ecke = min(x, 24 - x) + min(y, 24 - y)
            if ecke >= 2: px[y][x] = TAFEL
    for gy, zeile in enumerate(muster):
        for gx, c in enumerate(zeile):
            x0, y0 = 1 + gx * 3, 1 + gy * 3
            if c == "#":
                for dy in range(2):
                    for dx in range(2): px[y0 + dy][x0 + dx] = AN
            else:
                px[y0][x0] = AUS
    return px

def png(px, pfad, s=1):
    h, w = len(px) * s, len(px[0]) * s
    roh = b"".join(b"\x00" + b"".join(bytes(px[y // s][x // s]) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    pfad.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) +
                     chunk(b"IDAT", zlib.compress(roh)) + chunk(b"IEND", b""))

basis = Path(__file__).resolve().parent.parent
for name, m in MUSTER.items():
    p = bild(m)
    png(p, basis / "resources" / "images" / f"symbol_{name}.png")
    png(p, basis.parent / f"linie8-symbol-{name}.png", 8)
    print("geschrieben:", name)

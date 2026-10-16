#!/usr/bin/env python3
"""Schrift Fredoka (OFL, Google Fonts) für die Ansicht Cartoon (0.16.0, wie Water im Timer): feste Schnitte SemiBold
und Bold aus der variablen Schrift, gekürzt auf die Zeichen der App — ASCII, Latin-1 (Umlaute, ß, é …), Mittelpunkt,
Pfeil, Auslassungspunkte (die Systemschrift kürzt mit „…“), Gedankenstrich, typografische Anführungszeichen.

    uv run -q --with fonttools python tools/fredoka_schrift.py <Fredoka[wdth,wght].ttf>

Quelle: https://github.com/google/fonts/tree/main/ofl/fredoka — Lizenz liegt als resources/fonts/OFL.txt daneben.
Der Bereich muss zu characterRegex in package.json passen.
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ZEICHEN = ''.join(chr(c) for c in range(32, 127)) + ''.join(chr(c) for c in range(0xA0, 0x100)) + '·→…–‘’‚“”„'
ZIEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'resources', 'fonts')

for wght, name in ((600, 'SemiBold'), (700, 'Bold')):
    f = instancer.instantiateVariableFont(TTFont(sys.argv[1]), {'wght': wght, 'wdth': 100})
    opt = subset.Options()
    opt.layout_features = []
    opt.notdef_outline = True
    s = subset.Subsetter(opt)
    s.populate(text=ZEICHEN)
    s.subset(f)
    f.save(os.path.join(ZIEL, f'Fredoka-{name}.ttf'))
    print(name, os.path.getsize(os.path.join(ZIEL, f'Fredoka-{name}.ttf')))

#!/bin/zsh
# Baut die App außerhalb des Quellordners (~/.local/share/linie8-build, kein build/ neben den Quellen) und installiert sie.
#   tools/bauen.sh            nur bauen
#   tools/bauen.sh emu        bauen + Emulator emery + Logs
#   tools/bauen.sh uhr <IP>   bauen + über das Handy im WLAN (Entwicklerverbindung in der Pebble-App)
#   tools/bauen.sh uhr        bauen + über CloudPebble (vorher einmal: pebble login)
# Die fertige App liegt danach als linie8.pbw neben dem Quellordner, wenn dieser in einem Ordner "dateien"
# liegt (Notizablage, per Sync aufs Handy), sonst in dist/linie8.pbw.
set -e
export PATH="$HOME/.local/bin:$PATH"
QUELLE="${0:A:h:h}/"
ZIEL="$HOME/.local/share/linie8-build"
mkdir -p "$ZIEL"
if [ "${QUELLE:h:t}" = "dateien" ]; then
  AUSGABE="${QUELLE}../linie8.pbw"
  PRUEF_ORDNER="${QUELLE:h:h:h:h}"     # Notizablage: den ganzen Themenordner prüfen
else
  AUSGABE="${QUELLE}dist/linie8.pbw"
  PRUEF_ORDNER="${QUELLE}"
fi
python3 "${QUELLE}tools/seite_erzeugen.py"
# Sperre: ein RMV-Schlüssel darf nie in Quellen, Doku oder App landen (er gehört nur in die Einstellungen am Handy).
# Liegt eine Test-Kopie in RMV_SCHLUESSEL_DATEI (Standard ~/.config/rmv/accessId), wird danach gesucht.
SCHLUESSEL="${RMV_SCHLUESSEL_DATEI:-$HOME/.config/rmv/accessId}"
if [ -s "$SCHLUESSEL" ] && grep -rqF --exclude-dir=.git -f "$SCHLUESSEL" "$PRUEF_ORDNER" 2>/dev/null; then
  echo "ABBRUCH: RMV-Schlüssel steht in einer Datei unter $PRUEF_ORDNER:"
  grep -rlF --exclude-dir=.git -f "$SCHLUESSEL" "$PRUEF_ORDNER"
  exit 1
fi
rsync -a --delete --exclude build --exclude tools --exclude dist --exclude docs --exclude .git "$QUELLE" "$ZIEL/"
cd "$ZIEL"
rm -rf build   # pebble clean reicht nicht: rsync --delete entfernt die waf-Statusdatei, dann bleibt build/ veraltet
pebble build 2>&1 | grep -v "PebblePacket\|Represents" | tail -3
if [ -s "$SCHLUESSEL" ] && unzip -p build/*.pbw | grep -qaF -f "$SCHLUESSEL"; then
  echo "ABBRUCH: RMV-Schlüssel steckt in der gebauten App — nicht kopiert"
  exit 1
fi
mkdir -p "${AUSGABE:h}"
cp build/*.pbw "$AUSGABE"
case "$1" in
  emu) pebble install --emulator emery --logs ;;
  uhr) if [ -n "$2" ]; then pebble install --phone "$2" --logs; else pebble install --cloudpebble --logs; fi ;;
esac

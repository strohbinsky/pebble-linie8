#!/bin/zsh
# Testkopie von Linie 8 für Emulator-Bilder (0.16.0). Die Kopie entsteht außerhalb des Repos und kommt nie hinein: feste Haltestellen und Abfahrten (Transitous nachgebaut),
# fester Standort, Heimathaltestelle Luisenplatz, gestellte Fahrt. Aufruf: tools/emu_testkopie.sh <ansicht> <fahrt_min|-> [startseite]
#   ansicht: cartoon | papier | phosphor_weiss. Danach im Ordner der Kopie: pebble install --emulator emery build/*.pbw
# Vorher den Emulator-Speicher der App sichern (localstorage/<UUID>.*), danach zurückspielen
set -e
export PATH="$HOME/.local/bin:$PATH"
ANSICHT=${1:-cartoon}
FAHRT=${2:--}
START=${3:-0}
Z=${TMPDIR:-/tmp}/linie8-emu
rm -rf $Z && mkdir -p $Z
rsync -a --exclude .git --exclude build --exclude dist --exclude bilder --exclude tools "${0:A:h:h}/" $Z/
python3 - "$Z/src/pkjs/index.js" "$ANSICHT" "$FAHRT" "$START" <<'EOF'
import sys
p, ansicht, fahrt, start = sys.argv[1:5]
s = open(p, encoding='utf-8').read()
kopf = r'''
// ===== TESTKOPIE: feste Daten für Emulator-Bilder (nie ins Repo) =====
var T_HBF = { id: 'test:hbf', name: 'Wiesbaden Hauptbahnhof', lat: 50.0707, lon: 8.2436 };
var T_KUR = { id: 'test:kur', name: 'Wiesbaden Kurhaus/Theater', lat: 50.0855, lon: 8.2445 };
var T_LUI = { id: 'test:lui', name: 'Wiesbaden Luisenplatz', lat: 50.0786, lon: 8.2402 };
var T_NAH = { name: 'Wiesbaden Platz der Deutschen Einheit', lat: 50.0805, lon: 8.2370 };
var T_RHS = { name: 'Wiesbaden Rheinstraße', lat: 50.0750, lon: 8.2410 };
var T_FERN = { name: 'Wiesbaden-Biebrich Rheinufer', lat: 50.0380, lon: 8.2330 };
function t_seite(h) { return { a: { id: h.id, name: h.name, kurz: h.name.replace('Wiesbaden ', '').toUpperCase(), lat: h.lat, lon: h.lon }, b: null, alle: true, linien: [] }; }
(function () {
  var ls = localStorage;
  ls.setItem('seiten', JSON.stringify([t_seite(T_HBF), t_seite(T_KUR)]));
  ls.setItem('layout', '@ANSICHT@'); ls.setItem('quelle', 'trans'); ls.setItem('umkreis', '500');
  ls.setItem('heim', JSON.stringify({ name: T_LUI.name, id: T_LUI.id, lat: T_LUI.lat, lon: T_LUI.lon }));
  ls.setItem('puffer', '{}'); ls.setItem('aktiv', ''); ls.setItem('seite', '0'); ls.setItem('rubrik', '0');
  ls.setItem('startseite', '@START@'); ls.setItem('rmvKey', '');
})();
function t_iso(t) { return new Date(t * 1000).toISOString(); }
function t_ort(h) { return { name: h.name, stopId: 'x', lat: h.lat, lon: h.lon, dropoffType: 'NORMAL' }; }
function t_fahrten(id) {
  var j = Math.floor(Date.now() / 1000);
  if (id === 'test:kur') return [
    { l: '1', z: 'Wiesbaden Nerotal', dt: -20, d: 0, st: 'A', f: [T_FERN] },
    { l: '8', z: 'Wiesbaden Hauptbahnhof', dt: 25, d: 0, st: 'B', f: [T_LUI, T_HBF] },
    { l: 'S1', z: 'Frankfurt (Main) Hauptbahnhof', dt: 560, d: 0, st: '3', f: [T_FERN], m: 'SUBURBAN' },
    { l: '4', z: 'Wiesbaden-Biebrich', dt: 800, d: 0, st: 'A', f: [T_FERN] }];
  return [
    { l: '8', z: 'Wiesbaden Eigenheim', dt: 125, d: 0, st: 'B', f: [T_RHS, T_LUI] },
    { l: '4', z: 'Wiesbaden-Biebrich', dt: 250, d: 2, st: 'B', f: [T_RHS, T_NAH] },
    { l: '14', z: 'Wiesbaden Dotzheim', dt: 320, d: 0, st: 'C', f: [T_FERN], aus: true },
    { l: 'S1', z: 'Frankfurt (Main) Hauptbahnhof', dt: 560, d: 0, st: '3', f: [T_FERN], m: 'SUBURBAN' },
    { l: '8', z: 'Wiesbaden Eigenheim', dt: 725, d: 0, st: 'B', f: [T_RHS, T_LUI] },
    { l: '27', z: 'Wiesbaden Klarenthal', dt: 900, d: 0, st: 'D', f: [T_NAH] }];
}
function XMLHttpRequest() {}
XMLHttpRequest.prototype.open = function (m, u) { this.url = u; };
XMLHttpRequest.prototype.setRequestHeader = function () {};
XMLHttpRequest.prototype.send = function () {
  var self = this, u = self.url, d = null, j = Math.floor(Date.now() / 1000);
  if (/stoptimes/.test(u)) {
    var id = decodeURIComponent((/stopId=([^&]*)/.exec(u) || [])[1] || '');
    d = { stopTimes: t_fahrten(id).map(function (f, k) {
      var plan = j + f.dt - f.d * 60, t = j + f.dt;
      var x = { place: { departure: t_iso(t), scheduledDeparture: t_iso(plan), track: f.st, scheduledTrack: f.st }, routeShortName: f.l, headsign: f.z,
                tripId: id + k, mode: f.m || 'BUS', realTime: true, cancelled: !!f.aus };
      if (/fetchStops=true/.test(u)) x.nextStops = f.f.map(t_ort);
      return x;
    }) };
  } else if (/map\/stops/.test(u)) d = [T_HBF, T_KUR].map(function (h) { return { stopId: h.id, name: h.name, lat: h.lat, lon: h.lon }; });
  else if (/geocode/.test(u)) d = [{ type: 'STOP', id: 'test:hbf', name: T_HBF.name, lat: T_HBF.lat, lon: T_HBF.lon }];
  setTimeout(function () { self.status = d ? 200 : 404; self.responseText = JSON.stringify(d || {}); if (self.onload) self.onload(); }, 30);
};
var T_FAHRT = '@FAHRT@';
function t_fahrtSenden() {
  var j = Math.floor(Date.now() / 1000), an = j + Math.round(parseFloat(T_FAHRT) * 60);
  var f = {}; f[keys.FAHRT] = an + 900; f[keys.F_TITEL] = '8 > Luisenplatz'; f[keys.WECKEN] = 0; senden(f);
  karteSenden({ phase: 4, halte: parseFloat(T_FAHRT) > 5 ? 6 : 3, rf: 0, r1: 'nächster', r2: 'Rheinstraße', steig: 'D', kopfr: '', kopf: 'Im Bus 8 > Luisenplatz',
                zeit: an, zeitl: 'bis Ausstieg', label: 'aussteigen', name: 'Luisenplatz', fuss: 'an ' + hm(an),
                zeilen: [{ l: 'Ziel', w: 'an ' + hm(an), r: '', s: '', f: 8 | 64 }],
                ht: [an - 200, an - 125, an - 55], hn: ['Rheinstr.', 'Mühlgasse', 'Wilhelmstr.'] });
}
if (T_FAHRT !== '-') Pebble.addEventListener('ready', function () {
  setTimeout(function () { var f = {}; f[keys.FAHRT] = Math.floor(Date.now() / 1000) + 1800; f[keys.F_TITEL] = '8 > Luisenplatz'; senden(f);
                           var m = {}; m[keys.SPRUNG] = 0; m[keys.RUBRIK] = RUBRIK_FAHRT; senden(m); }, 1500);
});
// ===== Ende Testkopie-Kopf =====
'''.replace('@ANSICHT@', ansicht).replace('@START@', start).replace('@FAHRT@', fahrt)
s = s.replace("var keys = require('message_keys');", "var keys = require('message_keys');" + kopf, 1) if "var keys = require('message_keys');" in s else kopf + s
alt = "function kommende(fahrten) { var j = jetztS(); return"
assert alt in s
s = s.replace(alt, "function kommende(fahrten) { var j = jetztS() - 60; return")   # Testkopie: abgefahrene 1 min mitschicken (Bus fährt weg)
alt = "function standort(fertig) {"
assert alt in s
s = s.replace(alt, "function standort(fertig) { return setTimeout(function () { fertig({ lat: T_HBF.lat, lon: T_HBF.lon, gen: 10 }); }, 20);")
alt = "function fahrtSenden() {"
assert alt in s
s = s.replace(alt, "function fahrtSenden() { if (T_FAHRT !== '-') return t_fahrtSenden();")
open(p, 'w', encoding='utf-8').write(s)
print('Testkopie', ansicht, 'Fahrt', fahrt, 'Startseite', start)
EOF
grep -c "TESTKOPIE" $Z/src/pkjs/index.js
cd $Z && rm -rf build && pebble build 2>&1 | grep -E "error|virtual size" | head -5
ls -la $Z/build/*.pbw

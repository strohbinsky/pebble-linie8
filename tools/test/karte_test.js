// Fahrtkarte (0.7.0): berechnet die Karten einer Beispielfahrt in allen Phasen mit der echten Logik aus index.js
// und schreibt sie als Textdateien für tools/vorschau (MODUS=karte KARTE=<datei>). Ohne Netz.
// Aufruf: node tools/test/karte_test.js [ausgabeordner]   (Standard /tmp)
var fs = require('fs'), path = require('path'), vm = require('vm');
var basis = path.join(__dirname, '../../src/pkjs');
var paket = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
var keys = {}, nr = 10000, namen = {};
paket.pebble.messageKeys.forEach(function (k) {
  var m = /^(\w+)\[(\d+)\]$/.exec(k), n = m ? +m[2] : 1, name = m ? m[1] : k;
  keys[name] = nr; for (var i = 0; i < n; i++) namen[nr + i] = name + (m ? '[' + i + ']' : '');
  nr += n;
});
var speicher = { layout: process.env.LAYOUT || 'phosphor' };
var gesendet = [];
var ctx = {
  Pebble: { addEventListener: function () {}, sendAppMessage: function (m, ok) { gesendet.push(m); setTimeout(ok, 1); } },
  localStorage: { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } },
  XMLHttpRequest: function () {}, console: { log: function () {} }, setTimeout: setTimeout, clearTimeout: clearTimeout,
  JSON: JSON, Math: Math, Date: Date, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, navigator: {}, module: { exports: {} }
};
ctx.require = function (n) {
  if (n === 'message_keys') return keys;
  if (n === './schrift.json') return JSON.parse(fs.readFileSync(path.join(basis, 'schrift.json'), 'utf8'));
  return require(path.join(basis, n));
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(basis, 'index.js'), 'utf8'), ctx);

// Beispiel (neutrale Daten): Hbf zu Fuß zum Hauptbahnhof Steig B, Bus 8 bis Kurhaus/Theater, zu Fuß zur Wilhelmstraße C,
// Bus 6 nach Mainz Hbf D, zu Fuß zum Ziel. t0 = 10:00 MESZ
var t0 = Date.UTC(2026, 9, 12, 8, 0, 0) / 1000, M = 60;
function zw(namen, ab, schritt) { return namen.map(function (n, i) { return { name: n, t: ab + (i + 1) * schritt }; }); }
var a = { art: 'route', stadt: 'Wiesbaden', titel: { led: 'MAINZ HBF', klar: 'Mainz Hbf' }, von: { led: 'HIER', klar: 'Hier' },
  nach: { led: 'ZIEL', klar: 'Ziel' }, ziel: { lat: 50.0013, lon: 8.2588 }, gefragt: {}, spaeter: {}, seit: t0,
  v: { los: t0 - 2 * M, an: t0 + 41 * M, umst: 1, legs: [
    { fuss: true, ab: t0 - 2 * M, an: t0 + 3 * M, m: 251, von: '', nach: 'Wiesbaden Hauptbahnhof' },
    { fuss: false, ab: t0 + 3 * M, an: t0 + 11 * M, abPlan: t0 + 2 * M, anPlan: t0 + 10 * M, del: 1, live: true, linie: '8', richtung: 'Wiesbaden Eigenheim',
      von: 'Wiesbaden Hauptbahnhof', nach: 'Wiesbaden Kurhaus/Theater', vonSteig: 'B', vonSteigPlan: 'B', nachSteig: 'A', halte: 5, mittel: 'BUS',
      zwischen: zw(['Wiesbaden Geschwister-Stock-Platz', 'Wiesbaden Rheinstraße', 'Wiesbaden Wilhelmstraße', 'Wiesbaden Friedrichstraße'], t0 + 3 * M, 90), vonLat: 50.0714, vonLon: 8.2433 },
    { fuss: true, ab: t0 + 11 * M, an: t0 + 13 * M, m: 120, von: 'Wiesbaden Kurhaus/Theater', nach: 'Wiesbaden Wilhelmstraße' },
    { fuss: false, ab: t0 + 16 * M, an: t0 + 37 * M, abPlan: t0 + 16 * M, anPlan: t0 + 37 * M, del: 0, live: true, linie: '6', richtung: 'Mainz Hauptbahnhof',
      von: 'Wiesbaden Wilhelmstraße', nach: 'Mainz Hauptbahnhof', vonSteig: 'D', vonSteigPlan: 'C', nachSteig: 'D', halte: 18, mittel: 'BUS',
      zwischen: zw(['Mainz-Kastel Bahnhof', 'Mainz Kaisertor', 'Mainz Kaiserstraße'], t0 + 30 * M, 120), vonLat: 50.0800, vonLon: 8.2440 },
    { fuss: true, ab: t0 + 37 * M, an: t0 + 41 * M, m: 300, von: 'Mainz Hauptbahnhof', nach: '' } ] } };
a.planEnde = a.v.an; a.ende = a.v.an + 60;
var aus = process.argv[2] || '/tmp', fehler = 0;
var faelle = [['1', t0 - 4 * M], ['1b', t0], ['2', t0 + 5 * M], ['2b', t0 + 8 * M], ['3', t0 + 12 * M], ['4', t0 + 22 * M], ['4b', t0 + 34 * M], ['5', t0 + 38 * M]];
faelle.forEach(function (f) {
  var v = ctx.fahrtV(a), ph = ctx.fahrtPhase(v, f[1], null), k = ctx.karteBauen(a, v, ph, f[1]);
  var zeilen = ctx.StreckenM.detailVerbindung(a.v, ctx.textHilfe('Wiesbaden'), 'HIER', 'ZIEL', 2), akt = ctx.aktZeile(zeilen, ph, v);
  var txt = ['phase=' + k.phase, 'zeit=' + k.zeit, 'halte=' + (k.halte || 0), 'rf=' + k.rf, 'kopf=' + k.kopf, 'kopfr=' + (k.kopfr || ''), 'zeitl=' + k.zeitl,
             'r1=' + k.r1, 'r2=' + k.r2, 'label=' + k.label, 'name=' + k.name, 'steig=' + k.steig, 'fuss=' + k.fuss, 'jetzt=' + f[1], 'akt=' + akt];
  k.zeilen.forEach(function (z, i) { txt.push('z' + i + '=' + [z.l, z.w, z.r, z.s, z.f | 128].join('|')); });
  fs.writeFileSync(path.join(aus, 'karte_' + f[0] + '.txt'), txt.join('\n') + '\n');
  console.log('Phase ' + f[0] + ' -> ' + k.phase + ': ' + k.kopf + ' | ' + k.label + ' ' + k.name + ' [' + k.steig + '] | markiert ' + akt + ' (' + (zeilen[akt] || {}).text + ')');
  var soll = { '1': 1, '1b': 1, '2': 2, '2b': 2, '3': 3, '4': 4, '4b': 4, '5': 5 }[f[0]];
  if (k.phase !== soll) { console.log('  FEHLER: Phase ' + k.phase + ' statt ' + soll); fehler++; }
});
// Standort: Abfahrt laut Uhr vorbei, aber noch an der Haltestelle -> weiter Phase 1, "überfällig"
var ph = ctx.fahrtPhase(ctx.fahrtV(a), t0 + 5 * M, { lat: 50.0714, lon: 8.2433 });
console.log('Standort an der Haltestelle 2 min nach Abfahrt: Phase ' + ph.phase + (ph.wartet ? ', wartet' : ''));
if (ph.phase !== 1 || !ph.wartet) fehler++;
// Weckzeiten: losgehen, ein Halt vor Ausstieg
Date.now = function () { return (t0 - 10 * M) * 1000; };
console.log('Wecken zuerst: ' + ctx.hm(ctx.weckZeit(a)) + ' (losgehen ' + ctx.hm(a.v.los) + ')');
if (ctx.weckZeit(a) !== a.v.los) fehler++;
process.exit(fehler ? 1 : 0);

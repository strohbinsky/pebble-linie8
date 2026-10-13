// Spielt das Uhr-Menü im Handy-Skript (src/pkjs/index.js) in Node mit echten Daten durch.
// Die "Uhr" hier setzt die Listen aus den Blöcken zusammen und wählt Einträge per Text.
// Aufruf: node tools/test/handy_test.js   (RMV-Schlüssel optional aus ~/.config/rmv/accessId, wird nie ausgegeben)
var fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
var X = require('./xhr');
var basis = path.join(__dirname, '../../src/pkjs');
var paket = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

// message_keys wie das SDK: fortlaufende Nummern, Arrays belegen mehrere
var keys = {}, nr = 10000, namen = {};
paket.pebble.messageKeys.forEach(function (k) {
  var m = /^(\w+)\[(\d+)\]$/.exec(k), n = m ? +m[2] : 1, name = m ? m[1] : k;
  keys[name] = nr; for (var i = 0; i < n; i++) namen[nr + i] = name + (m ? '[' + i + ']' : '');
  nr += n;
});

var speicher = { layout: 'phosphor' };   // Großbuchstaben-Texte wie bisher (Standard seit 0.12.0: Klar)
var localStorage = { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } };
var schluessel = path.join(os.homedir(), '.config/rmv/accessId');
if (process.env.RMV !== '0' && fs.existsSync(schluessel)) speicher.rmvKey = fs.readFileSync(schluessel, 'utf8').trim();
var HBF = { lat: 50.0707, lon: 8.2436 }, KURHAUS = { lat: 50.0848, lon: 8.2446 };   // Beispielorte Wiesbaden
var standort = HBF;
var lauscher = {};

var HBF = { lat: 50.0707, lon: 8.2436 }, KURHAUS = { lat: 50.0848, lon: 8.2446 };   // Beispielorte Wiesbaden
var standort = HBF;
var lauscher = {};

// ---------- die "Uhr" (seit 0.6.1 mit Strecken, Detailzeilen, Treffern) ----------
var uhr = { seiten: [], liste: null, ende: [], einrichtung: null, routen: null, lade: [], abfahrten: [], strecken: [], detail: {}, treffer: [], sprung: [], groesste: 0 };
function bytes(msg) {
  var n = 1;
  Object.keys(msg).forEach(function (k) { var v = msg[k]; n += 7 + (typeof v === 'string' ? Buffer.byteLength(v) + 1 : 4); });
  return n;
}
var Pebble = {
  addEventListener: function (t, f) { lauscher[t] = f; },
  sendAppMessage: function (msg, ok) {
    uhr.groesste = Math.max(uhr.groesste, bytes(msg));
    if (bytes(msg) > 2048) { console.log('NACHRICHT ZU GROSS: ' + bytes(msg)); process.exit(1); }
    var m = {}; Object.keys(msg).forEach(function (k) { m[namen[k] || k] = msg[k]; });
    if (m.L_ANZAHL !== undefined) {
      if (m.L_ANZAHL < 0) { uhr.liste = null; uhr.ende.push(m.L_ANZAHL); }
      else uhr.liste = { titel: m.L_TITEL, n: m.L_ANZAHL, texte: [], sel: m.WAHL || 0 };
    }
    if (m.L_AB !== undefined && uhr.liste) for (var j = 0; j < 10; j++) if (m['L_TEXT[' + j + ']'] !== undefined) uhr.liste.texte[m.L_AB + j] = m['L_TEXT[' + j + ']'];
    if (m.L_LADE !== undefined) uhr.lade.push(m.L_LADE);
    if (m.ANZAHL !== undefined) { uhr.liste = null; uhr.einrichtung = { anzahl: m.ANZAHL }; }
    if (m.R_ANZAHL !== undefined) {
      uhr.liste = null;
      uhr.routen = { anzahl: m.R_ANZAHL, seite: m.R_SEITE, rubrik: m.RUBRIK, namen: [] };
      for (var i = 0; i < m.R_ANZAHL; i++) uhr.routen.namen.push((m['R_VON[' + i + ']'] || 'HIER') + ' > ' + m['R_NAME[' + i + ']']);
    }
    if (m.R_N !== undefined || (m.RUBRIK === 1 && m.STATUS !== undefined && m.R_ANZAHL === undefined)) uhr.strecken.push(m);
    if (m.D_AB !== undefined) {
      var schl = m.RUBRIK + ':' + m.SEITE;
      if (m.D_AB === 0) uhr.detail[schl] = { n: m.D_N, nr: m.D_NR, akt: m.D_AKT, zeilen: [] };
      var d = uhr.detail[schl];
      for (var k = 0; k < 8; k++) if (m['D_ART[' + k + ']'] !== undefined) d.zeilen[m.D_AB + k] = { art: m['D_ART[' + k + ']'], t: m['D_ZEIT[' + k + ']'], text: m['D_TEXT[' + k + ']'], zus: m['D_ZUS[' + k + ']'], re: m['D_RE[' + k + ']'] };
    }
    if (m.AB !== undefined || m['AB[0]'] !== undefined) uhr.abfahrten.push(m);
    if (m.STAND !== undefined) uhr.seiten.push(m);
    if (m.FAHRT !== undefined) (uhr.fahrt = uhr.fahrt || []).push(m);
    if (m.K_PHASE !== undefined) uhr.karte = m;
    if (m.L_INFO !== undefined) uhr.info = m.L_INFO;   // Seiten beider Rubriken in Reihenfolge (Puffer-Test)
    if (m.TREFFER !== undefined) uhr.treffer.push(m.TREFFER);
    if (m.SPRUNG !== undefined) uhr.sprung.push(m);
    setTimeout(ok, 5);
  }
};
var ctx = {
  Pebble: Pebble, localStorage: localStorage, XMLHttpRequest: X.XMLHttpRequest, console: { log: function (s) { if (process.env.LOG) console.log('    [js] ' + X.maske(s)); } },
  setTimeout: setTimeout, clearTimeout: clearTimeout, JSON: JSON, Math: Math, Date: Date, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
  navigator: { geolocation: { getCurrentPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: standort.lat, longitude: standort.lon } }); }, 10); } } },
  module: { exports: {} }
};
ctx.require = function (n) {
  if (n === 'message_keys') return keys;
  if (n === './schrift.json') return JSON.parse(fs.readFileSync(path.join(basis, 'schrift.json'), 'utf8'));
  return require(path.join(basis, n));
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(basis, 'index.js'), 'utf8'), ctx);

function senden(p) { lauscher.appmessage({ payload: p }); }
function aktion(a, w, text, det) { var p = { AKTION: a, WAHL: w || 0 }; if (text !== undefined) p.TEXT = text; if (det !== undefined) p.DETAIL = det; senden(p); }
function warte(bed, cb, t0) {
  t0 = t0 || Date.now();
  if (bed()) return cb();
  if (Date.now() - t0 > 120000) { console.log('ZEITÜBERSCHREITUNG', JSON.stringify(uhr.liste), uhr.lade.slice(-3)); process.exit(1); }
  setTimeout(function () { warte(bed, cb, t0); }, 100);
}
function listeDa(titel) { return function () { return uhr.liste && (titel instanceof RegExp ? titel.test(uhr.liste.titel) : uhr.liste.titel === titel) && uhr.liste.texte.filter(Boolean).length === uhr.liste.n; }; }
function zeige() { var l = uhr.liste; return l.titel + ' (' + l.n + '): ' + l.texte.slice(0, 14).join(' | ') + (l.n > 14 ? ' | …' : ''); }
function waehle(re) {
  var i = uhr.liste.texte.findIndex(function (t) { return re.test(t); });
  if (i < 0) { console.log('NICHT GEFUNDEN: ' + re + ' in ' + zeige()); process.exit(1); }
  console.log('  -> wähle ' + uhr.liste.texte[i]);
  aktion(5, i);
}
var schritte = [], t0 = Date.now();
function dann(f) { schritte.push(f); }
function los() { var f = schritte.shift(); if (f) f(los); else fertig(); }
function erwarte(titel, re, info) {
  dann(function (w) { warte(listeDa(titel), function () { console.log(zeige()); if (info) info(); if (re) waehle(re); w(); }); });
}
function fehler(t) { console.log('FEHLER: ' + t); process.exit(1); }
function hmZ(t) { return t ? new Date(t * 1000).toISOString().substring(11, 16) + 'Z' : '-'; }
function streckeZeigen(seite, pruef) {
  dann(function (w) { var n0 = uhr.strecken.length; warte(function () { return uhr.strecken.length > n0 - 1 && uhr.strecken.some(function (m) { return m.SEITE === seite; }); }, function () {
    var a = uhr.strecken.filter(function (m) { return m.SEITE === seite; }).pop();
    console.log('  Strecke ' + seite + ' (' + a.QUELLE + ', Status ' + a.STATUS + ', ' + a.R_N + '): ' + [0, 1, 2].map(function (j) {
      return 'los ' + hmZ(a['R_LOS[' + j + ']']) + ' an ' + hmZ(a['R_AN[' + j + ']']) + ' ' + a['R_UM[' + j + ']'] + 'x ' + a['R_KETTE[' + j + ']'] + ' f' + a['R_FLAG[' + j + ']'];
    }).join(' | '));
    if (pruef) pruef(a);
    w();
  }); });
}
function detailZeigen(schl, pruef) {
  dann(function (w) { warte(function () { var d = uhr.detail[schl]; return d && d.zeilen.filter(Boolean).length === d.n; }, function () {
    var d = uhr.detail[schl];
    console.log('  Detail ' + schl + ' Nr ' + d.nr + ' (' + d.n + ' Zeilen):');
    d.zeilen.forEach(function (z) { console.log('    ' + ('  ' + z.art).slice(-3) + ' ' + (z.t ? hmZ(z.t) : '      ') + ' ' + z.text + (z.zus ? '  [' + z.zus + ']' : '') + (z.re ? '  St ' + z.re : '')); });
    if (pruef) pruef(d);
    delete uhr.detail[schl];
    w();
  }); });
}

// ---------- Ablauf ----------
dann(function (w) { lauscher.ready(); w(); });
dann(function (w) { warte(function () { return uhr.routen; }, function () { console.log('Einrichtung Strecken: ' + JSON.stringify(uhr.routen)); w(); }); });
console.log('== 1 Favorit neu: Haltestelle A-Z (Ort, Buchstaben mit Anzahl) -> Luisenplatz');
dann(function (w) { aktion(25); w(); });
erwarte('FAVORITEN', /^FAVORIT NEU 0\/20/);
erwarte('FAVORIT NEU', /^SUCHEN$/, function () { if (uhr.liste.texte[0] !== 'HIER') fehler('HIER nicht oben'); });
erwarte('SUCHEN', /^HALTESTELLE A-Z$/);
erwarte(/^ORT/, /^WIESBADEN \(HIER\)$/, function () { if (uhr.liste.texte[0] !== 'WIESBADEN (HIER)') fehler('eigener Ort nicht oben'); });
erwarte(/^WIESBADEN A-Z$/, /^L \(\d+\)$/);
erwarte(/^WIESBADEN L/, /^LUISENPL/);
erwarte('FAVORITEN', null, function () { if (!/^LUISENPL/.test(uhr.liste.texte[1])) fehler('Favorit fehlt'); });
console.log('== 2 Favorit neu: Sprechen (Diktat), dann Liste -> Kurhaus; Mehr am Handy führt zurück');
dann(function (w) { waehle(/^FAVORIT NEU 1\/20/); w(); });
erwarte('FAVORIT NEU', /^SUCHEN$/);
erwarte('SUCHEN', /^MEHR AM HANDY$/, function () { if (uhr.liste.texte.indexOf('TIPPEN') >= 0) fehler('TIPPEN noch im Menü'); });
erwarte('AM HANDY', /./);
erwarte('SUCHEN', /^SPRECHEN$/);
dann(function (w) { warte(function () { return uhr.ende.length && uhr.ende[uhr.ende.length - 1] === -4; }, function () { console.log('  Diktat offen (L_ANZAHL -4)'); aktion(27, 0, 'KURHAUS'); w(); }); });
erwarte('KURHAUS', /^KURHAUS/);
erwarte('FAVORITEN', null, function () { console.log('  Favoriten: ' + uhr.liste.texte.slice(1).join(' | ')); });
console.log('== 3 Favorit neu: Hier speichern (Adresssuche rückwärts)');
dann(function (w) { waehle(/^FAVORIT NEU 2\/20/); w(); });
erwarte('FAVORIT NEU', /^HIER$/);
erwarte('FAVORITEN', null, function () { if (uhr.liste.n !== 5 || uhr.liste.texte[4] !== 'ALLE 3 LOESCHEN') fehler('3 Favoriten erwartet'); console.log('  Favoriten: ' + uhr.liste.texte.slice(1).join(' | ')); });
console.log('== 3b Favorit löschen (den dritten)');
dann(function (w) { waehle(/^BAHNHOFSPL/); w(); });
erwarte(/^BAHNHOFSPL/, /^LOESCHEN: /);
erwarte('FAVORITEN', null, function () { if (uhr.liste.n !== 4) fehler('2 Favoriten erwartet'); });
dann(function (w) { var e0 = uhr.ende.length; aktion(6); warte(function () { return uhr.ende.length > e0; }, function () { console.log('  Ende -> Uhr-Menü'); w(); }); });
console.log('== 4 Neue Strecke: VON HIER, NACH Favorit Kurhaus');
dann(function (w) { aktion(20, -1); w(); });
erwarte('VON', /^HIER$/, function () { console.log('  (Einträge: ' + uhr.liste.texte.join(' | ') + ')'); });
erwarte('NACH', /^KURHAUS/);
erwarte(/ AN \d\d:\d\d$|^KEINE VERBINDUNG$/, /^SPEICHERN$/);
dann(function (w) { warte(function () { return uhr.routen && uhr.routen.anzahl === 1; }, function () { console.log('  Strecken: ' + uhr.routen.namen.join(' | ')); w(); }); });
streckeZeigen(0, function (a) { if (!(a.R_N > 0)) fehler('keine Verbindung'); });
console.log('== 5 Detail Strecke 1, Verbindung 1 (REQUEST mit DETAIL)');
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 1, DETAIL: 0 }); w(); });
detailZeigen('1:0', function (d) {
  if (d.zeilen[0].art !== 1 || d.zeilen[d.n - 1].art !== 3) fehler('Detail beginnt nicht mit START oder endet nicht mit ZIEL');
  var zw = d.zeilen.filter(function (z) { return z.art === 4; }).length;   // 0.13.0: Strecken zeigen Zwischenhalte
  console.log('  Zwischenhalte: ' + zw);
  if (!zw) fehler('Strecke ohne Zwischenhalte (Hbf -> Kurhaus hat welche)');
});
console.log('== 6 Neue Strecke mit Umstieg: VON Favorit Luisenplatz, NACH Suche "Mainz Hauptbahnhof"');
dann(function (w) { aktion(20, -1); w(); });
erwarte('VON', /^LUISENPL/);
erwarte('NACH', /^SUCHEN$/);
erwarte('SUCHEN', /^SPRECHEN$/);
dann(function (w) { warte(function () { return uhr.ende[uhr.ende.length - 1] === -4; }, function () { aktion(27, 0, 'MAINZ HAUPTBAHNHOF'); w(); }); });
erwarte('MAINZ HAUPTBAHNHOF', /MAINZ|HBF|HAUPTBAHNHOF/);
erwarte(/ AN \d\d:\d\d$|^KEINE VERBINDUNG$/, /^SPEICHERN$/);
dann(function (w) { warte(function () { return uhr.routen && uhr.routen.anzahl === 2; }, function () { console.log('  Strecken: ' + uhr.routen.namen.join(' | ')); w(); }); });
streckeZeigen(1);
dann(function (w) { senden({ REQUEST: 1, RUBRIK: 1, DETAIL: 0 }); w(); });
detailZeigen('1:1');
console.log('== 7 Rückfahrt der Strecke 2 (fester Start) -> Strecke 3 dahinter');
dann(function (w) { aktion(22, 1); w(); });
dann(function (w) { warte(function () { return uhr.routen && uhr.routen.anzahl === 3; }, function () { console.log('  Strecken: ' + uhr.routen.namen.join(' | ')); if (!/^HBF|HAUPTBAHNHOF|MAINZ/.test(uhr.routen.namen[2])) fehler('Rückfahrt falsch'); w(); }); });
console.log('== 8 STRECKE AB HIER: Favorit wählen, Sofort-Strecke (L_ANZAHL -5), runter = nächstes Ziel');
// Ankommen um (0.11.0): Strecke 1, Stunde in 3 h, Minute :30 -> Fuß AN..:30, alle Ankünfte vor der Zielzeit
var zielAn = 0;
dann(function (w) { aktion(37, 0); w(); });
erwarte('ANKOMMEN UM', null, function () { if (uhr.liste.texte[0] !== 'JETZT') fehler('JETZT nicht oben'); console.log('  -> wähle ' + uhr.liste.texte[3]); aktion(5, 3); });
dann(function (w) { warte(function () { return uhr.liste && /:\d\d$/.test(uhr.liste.texte[0] || '') && uhr.liste.texte.filter(Boolean).length === uhr.liste.n; }, function () {
  console.log(zeige()); uhr.strecken = []; waehle(/:30$/); w(); }); });
dann(function (w) { warte(function () { return uhr.ende[uhr.ende.length - 1] === -2; }, w); });
streckeZeigen(0, function (a) {
  if (!/^AN\d\d:30$/.test(a.QUELLE)) fehler('Fuß ohne Zielzeit: ' + a.QUELLE);
  zielAn = JSON.parse(speicher.ankunft).t;
  for (var j = 0; j < a.R_N; j++) if (a['R_AN[' + j + ']'] > zielAn + 60) fehler('Ankunft nach der Zielzeit');
  if (!(a.R_N > 0)) fehler('keine Verbindung zur Zielzeit');
});
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 1, DETAIL: 0 }); w(); });
detailZeigen('1:0');
dann(function (w) { uhr.strecken = []; aktion(37, 0); w(); });
erwarte('ANKOMMEN UM', /^JETZT$/);
streckeZeigen(0, function (a) { if (/^AN/.test(a.QUELLE)) fehler('Zielzeit nicht aufgehoben'); });

dann(function (w) { aktion(23); w(); });
erwarte('STRECKE AB HIER', /^KURHAUS/);
dann(function (w) { warte(function () { return uhr.ende[uhr.ende.length - 1] === -5; }, function () { w(); }); });
streckeZeigen(8, function (a) { console.log('  Ziel ' + a.HIER_NAME + ' ' + (a.HIER_NR + 1) + '/' + a.HIER_N); });
dann(function (w) { uhr.strecken = []; aktion(24, 1); w(); });
streckeZeigen(8, function (a) { console.log('  Ziel ' + a.HIER_NAME + ' ' + (a.HIER_NR + 1) + '/' + a.HIER_N); });
console.log('== 9 Haltestellen-Seite mit Detail: Neue Haltestelle (Favoriten in der Liste), Hbf ohne Ziel');
dann(function (w) { aktion(1); w(); });
erwarte('HALTESTELLE', /^HAUPTBAHNHOF/, function () { if (uhr.liste.texte.indexOf('-- FAVORITEN --') < 0) fehler('Favoriten fehlen bei Neue Haltestelle'); });
erwarte('LINIE', /^ALLE LINIEN$/);
erwarte(/^AUSSTIEG/, /^OHNE AUSSTIEG$/);
dann(function (w) { warte(function () { return uhr.einrichtung && uhr.einrichtung.anzahl === 1; }, function () { w(); }); });
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 0, DETAIL: 0 }); w(); });
detailZeigen('0:0', function (d) { if (d.n < 3) fehler('Verlauf zu kurz'); });
console.log('== 11 Haltestelle A-Z in Frankfurt bis zum Flughafen Regionalbahnhof (gemeinsamer Anfang übersprungen), Tippen: Haltestellen zuerst');
dann(function (w) { standort = { lat: 50.1140, lon: 8.6787 }; aktion(25); w(); });
erwarte('FAVORITEN', /^FAVORIT NEU/);
erwarte('FAVORIT NEU', /^SUCHEN$/);
erwarte('SUCHEN', /^HALTESTELLE A-Z$/);
erwarte(/^ORT/, /^FRANKFURT \(HIER\)$/);
var ziel = 'FLUGHAFEN REGIONAL', stufen = 0;
function azStufe(w) {
  warte(function () { return uhr.liste && /^FRANKFURT/.test(uhr.liste.titel) && uhr.liste.texte.filter(Boolean).length === uhr.liste.n; }, function () {
    console.log(zeige());
    var t = uhr.liste.texte, i = t.findIndex(function (x) { return x.indexOf(ziel) === 0; });
    if (i >= 0) { console.log('  -> gefunden nach ' + stufen + ' Stufen: ' + t[i]); return w(); }
    var g = t.map(function (x) { return (/^(.*) \(\d+\)$/.exec(x) || [])[1]; }), k = -1;
    g.forEach(function (p, j) { if (p && ziel.indexOf(p) === 0 && (k < 0 || p.length > g[k].length)) k = j; });
    if (k < 0 || ++stufen > 6) fehler('Regionalbahnhof nicht erreichbar');
    var vorher = uhr.liste.titel; console.log('  -> wähle ' + t[k]); aktion(5, k);
    warte(function () { return uhr.liste && uhr.liste.titel !== vorher; }, function () { azStufe(w); });
  });
}
dann(azStufe);
dann(function (w) { aktion(6); w(); });
erwarte(/^FRANKFURT/, null);
dann(function (w) { var e0 = uhr.ende.length; aktion(6); aktion(6); aktion(6); setTimeout(w, 500); });
console.log('== 12 Aktive Fahrt (0.6.6): aus den Details starten, neu öffnen -> Fahrtansicht; knapper Anschluss -> Frage -> verpasst -> neue Führung');
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 0, DETAIL: 0 }); w(); });
detailZeigen('0:0');
dann(function (w) { var e0 = uhr.ende.length; aktion(31, 0); warte(function () { return uhr.ende.length > e0; }, function () {
  if (uhr.ende[uhr.ende.length - 1] !== -6) fehler('Fahrt starten: Uhr bekommt ' + uhr.ende[uhr.ende.length - 1] + ' statt -6');
  var a = JSON.parse(speicher.aktiv); console.log('  aktiv: ' + a.art + ' nach ' + a.titel.klar + ', Ende ' + hmZ(a.ende)); w(); }); });
dann(function (w) { uhr.sprung = []; uhr.fahrt = []; lauscher.ready(); warte(function () { return uhr.sprung.length; }, function () {
  console.log('  neu geöffnet: ' + JSON.stringify(uhr.fahrt[0]) + ' / Sprung ' + JSON.stringify(uhr.sprung[0]));
  if (uhr.sprung[0].RUBRIK !== 2 || !uhr.fahrt[0] || !uhr.fahrt[0].FAHRT) fehler('kein Sprung in die Fahrt'); w(); }); });
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 2, DETAIL: 0 }); w(); });
detailZeigen('2:0', function (d) { if (!d.n) fehler('Fahrt ohne Zeilen'); });
dann(function (w) {                                  // Umstieg künstlich knapp (1 min), Frage ist fällig
  var j = Math.floor(Date.now() / 1000);
  var a = { art: 'route', titel: { led: 'MAINZ HBF', klar: 'Mainz Hbf' }, stadt: 'Wiesbaden', von: { led: 'HIER', klar: 'Hier' }, nach: { led: 'MAINZ HBF', klar: 'Mainz Hbf' },
    ziel: { lat: 50.0013, lon: 8.2588 }, gefragt: {}, spaeter: {}, seit: j,
    v: { los: j - 1200, an: j + 1800, umst: 1, legs: [
      { fuss: false, ab: j - 1200, an: j - 120, abPlan: j - 1200, anPlan: j - 120, del: 0, linie: 'S8', richtung: 'Hanau', von: 'Wiesbaden Hauptbahnhof', nach: 'Mainz-Kastel Bahnhof', vonSteig: '6', nachSteig: '1', halte: 2, zwischen: [] },
      { fuss: false, ab: j - 60, an: j + 1800, abPlan: j - 60, anPlan: j + 1800, del: 0, linie: '6', richtung: 'Mainz', von: 'Mainz-Kastel Bahnhof', nach: 'Mainz Hauptbahnhof', vonSteig: '', nachSteig: '', halte: 10, zwischen: [], vonLat: 50.0086, vonLon: 8.2826 } ] } };
  a.planEnde = a.v.an; a.ende = a.v.an + 60;
  speicher.aktiv = JSON.stringify(a);
  senden({ REQUEST: 0, RUBRIK: 2, DETAIL: 0 }); w(); });
erwarte(/^ANSCHLUSS 6\?$/, /^VERPASST$/);
erwarte(/^ANDERE FAHRT$/, /^UEBERNEHMEN$/, function () { console.log('  Info: ' + uhr.info); if (!uhr.info) fehler('Vorschlag ohne Info-Zeilen'); });
dann(function (w) { warte(function () { return !uhr.liste && uhr.ende[uhr.ende.length - 1] === -6; }, function () {
  var a = JSON.parse(speicher.aktiv);
  console.log('  neue Führung ab ' + a.von.klar + ': ' + a.v.legs.filter(function (l) { return !l.fuss; }).map(function (l) { return l.linie + ' ' + hmZ(l.ab); }).join(' > ') + ', an ' + hmZ(a.v.an));
  if (a.von.klar.indexOf('Kastel') < 0) fehler('neue Führung nicht ab dem Umstieg'); w(); }); });
dann(function (w) { uhr.karte = null; senden({ REQUEST: 0, RUBRIK: 2, DETAIL: 0 }); warte(function () { return uhr.karte; }, function () {
  var k = uhr.karte; console.log('  Karte: Phase ' + k.K_PHASE + ' | ' + k.K_KOPF + ' | ' + k.K_LABEL + ' ' + k.K_NAME + ' [' + k.K_STEIG + '] | ' + k['K_W[0]'] + ' | ' + k['K_W[1]']);
  if (!k.K_PHASE) fehler('keine Karte'); w(); }); });
detailZeigen('2:0', function (d) { console.log('  markiert: Zeile ' + d.akt); if (!(d.akt >= 0)) fehler('kein markierter Schritt'); });
console.log('== 12b Fahrt-Menü > ANDERE FAHRT SUCHEN: Vorschlag, andere zeigen, übernehmen');
dann(function (w) { aktion(33, 0); w(); });
erwarte(/^(AB WELCHER\?|ANDERE FAHRT)$/, null);
dann(function (w) { if (/WELCHER/.test(uhr.liste.titel)) { console.log('  -> wähle erste'); aktion(5, 0); } w(); });
erwarte(/^ANDERE FAHRT$/, /^ANDERE ZEIGEN$/);
erwarte(/^ANDERE FAHRTEN$/, /./);
dann(function (w) { warte(function () { return !uhr.liste && uhr.ende[uhr.ende.length - 1] === -6; }, function () { console.log('  übernommen'); w(); }); });
dann(function (w) { aktion(32, 0); setTimeout(function () { if (speicher.aktiv) fehler('Fahrt nicht beendet'); console.log('  Fahrt beendet'); w(); }, 300); });
console.log('== 13 Puffer (0.6.5): App gleich wieder geöffnet -> Seite sofort aus dem Puffer, ohne Abfrage');
function seitenNachrichten() { return uhr.seiten.length; }
dann(function (w) { setTimeout(w, 3000); });         // Abfragen aus 12 auslaufen lassen
dann(function (w) {
  var n0 = X.zaehler.n, m0 = seitenNachrichten(), t1 = Date.now();
  lauscher.ready();
  warte(function () { return seitenNachrichten() > m0; }, function () {
    var ms = Date.now() - t1;
    setTimeout(function () {
      var neu = X.zaehler.n - n0, stand = uhr.seiten[uhr.seiten.length - 1].STAND, alter = Math.floor(Date.now() / 1000) - stand;
      console.log('  frisch: Seite nach ' + ms + ' ms, ' + neu + ' Abfragen (Details ohne Ziel brauchen eine), Stand ' + alter + ' s alt');
      if (ms > 1000) fehler('Puffer greift nicht: Seite erst nach ' + ms + ' ms');
      if (neu > 1) fehler('Puffer frisch, trotzdem ' + neu + ' Abfragen');
      w();
    }, 2000);
  });
});
dann(function (w) {                                  // Puffer künstlich altern: sofort zeigen, dann neu laden
  var p = JSON.parse(speicher.puffer);
  Object.keys(p).forEach(function (k) { p[k].t -= 600; });
  speicher.puffer = JSON.stringify(p);
  var n0 = X.zaehler.n, m0 = seitenNachrichten(), t1 = Date.now();
  lauscher.ready();
  warte(function () { return seitenNachrichten() >= m0 + 2; }, function () {
    var liste = uhr.seiten, alt = liste[liste.length - 2], frisch = liste[liste.length - 1], jetzt = Math.floor(Date.now() / 1000);
    console.log('  alt: erst Puffer (Stand ' + (jetzt - alt.STAND) + ' s), dann neu (Stand ' + (jetzt - frisch.STAND) + ' s), ' + (X.zaehler.n - n0) + ' Abfragen, ' + (Date.now() - t1) + ' ms');
    if (jetzt - alt.STAND < 590 || jetzt - frisch.STAND > 30) fehler('Reihenfolge Puffer/neu stimmt nicht');
    w();
  });
});

console.log('== 14 WEITERE FAHRTEN (0.13.0): Liste ab 30 min vorher, Auswahl auf der ersten kommenden, Details, später/früher laden, Fahrt starten');
var listeN = 0;
function fahrtenPruefen() {
  var t = uhr.liste.texte;
  if (t[0] !== 'FRUEHERE LADEN' || t[t.length - 1] !== 'SPAETERE LADEN') fehler('Laden-Einträge fehlen');
  if (uhr.liste.n < 4) fehler('zu wenige Fahrten: ' + uhr.liste.n);
  console.log('  Auswahl ' + uhr.liste.sel + ': ' + t[uhr.liste.sel]);
  if (uhr.liste.sel < 1 || uhr.liste.sel > t.length - 2) fehler('Auswahl nicht auf einer Fahrt');
}
dann(function (w) { senden({ AKTION: 38, WAHL: 0, RUBRIK: 1 }); w(); });
erwarte('WEITERE FAHRTEN', null, function () { fahrtenPruefen(); listeN = uhr.liste.n; });
dann(function (w) { var e0 = uhr.ende.length; aktion(5, uhr.liste.sel); warte(function () { return uhr.ende.length > e0; }, function () {
  if (uhr.ende[uhr.ende.length - 1] !== -7) fehler('Uhr soll Details öffnen (-7), bekommt ' + uhr.ende[uhr.ende.length - 1]); w(); }); });
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 1, DETAIL: 4 }); w(); });
detailZeigen('1:0', function (d) { if (d.nr !== 4) fehler('Details nicht als LISTE (4): ' + d.nr); });
dann(function (w) { senden({ AKTION: 38, WAHL: -1, RUBRIK: 1 }); w(); });
erwarte('WEITERE FAHRTEN', null, function () { fahrtenPruefen(); });
dann(function (w) { aktion(5, uhr.liste.n - 1); uhr.liste = null; w(); });   // SPAETERE LADEN
erwarte('WEITERE FAHRTEN', null, function () { fahrtenPruefen(); console.log('  später: ' + listeN + ' -> ' + uhr.liste.n); if (uhr.liste.n <= listeN) fehler('Spätere nicht dazu'); listeN = uhr.liste.n; });
dann(function (w) { aktion(5, 0); uhr.liste = null; w(); });                // FRUEHERE LADEN
erwarte('WEITERE FAHRTEN', null, function () { fahrtenPruefen(); console.log('  früher: ' + listeN + ' -> ' + uhr.liste.n); if (uhr.liste.n <= listeN) fehler('Frühere nicht dazu'); });
dann(function (w) { var e0 = uhr.ende.length; aktion(6); warte(function () { return uhr.ende.length > e0; }, function () { console.log('  Zurück -> Uhr-Menü (' + uhr.ende[uhr.ende.length - 1] + ')'); w(); }); });
dann(function (w) { senden({ AKTION: 38, WAHL: 0, RUBRIK: 0 }); w(); });       // Abfahrten: Hbf ohne Ziel
erwarte('WEITERE FAHRTEN', null, function () { fahrtenPruefen(); console.log(zeige()); });
dann(function (w) { var e0 = uhr.ende.length; aktion(5, Math.max(1, uhr.liste.sel - 1)); warte(function () { return uhr.ende.length > e0; }, w); });   // eine schon abgefahrene
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 0, DETAIL: 4 }); w(); });
detailZeigen('0:0', function (d) { if (d.nr !== 4 || d.n < 2) fehler('Abfahrt-Details aus der Liste fehlen'); });
dann(function (w) { var e0 = uhr.ende.length; aktion(31, 0); warte(function () { return uhr.ende.length > e0; }, function () {
  if (uhr.ende[uhr.ende.length - 1] !== -6) fehler('Fahrt aus der Liste starten: ' + uhr.ende[uhr.ende.length - 1]);
  var a = JSON.parse(speicher.aktiv); console.log('  aktiv aus der Liste: ' + a.art + ' ' + a.f.linie + ' ab ' + hmZ(a.f.ab) + ' nach ' + a.titel.klar); w(); }); });
dann(function (w) { senden({ REQUEST: 0, RUBRIK: 2, DETAIL: 0 }); w(); });
detailZeigen('2:0', function (d) { console.log('  markiert: Zeile ' + d.akt + (d.zeilen[d.akt] ? ' ' + d.zeilen[d.akt].text : '')); if (!(d.akt >= 0)) fehler('kein Balken'); });
dann(function (w) { aktion(32, 0); setTimeout(w, 300); });

function fertig() {
  console.log('\nOK in ' + Math.round((Date.now() - t0) / 1000) + ' s, ' + X.zaehler.n + ' Abfragen, größte Nachricht ' + uhr.groesste + ' Bytes');
  process.exit(0);
}
los();

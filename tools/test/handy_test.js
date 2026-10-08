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

var speicher = {};
var localStorage = { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } };
var schluessel = path.join(os.homedir(), '.config/rmv/accessId');
if (process.env.RMV !== '0' && fs.existsSync(schluessel)) speicher.rmvKey = fs.readFileSync(schluessel, 'utf8').trim();
var HBF = { lat: 50.0707, lon: 8.2436 }, KURHAUS = { lat: 50.0848, lon: 8.2446 };   // Beispielorte Wiesbaden
var standort = HBF;
var lauscher = {};

// ---------- die "Uhr" ----------
var uhr = { liste: null, ende: 0, einrichtung: null, lade: [], abfahrten: [], groesste: 0 };
function bytes(msg) {
  var n = 1;
  Object.keys(msg).forEach(function (k) { var v = msg[k]; n += 7 + (typeof v === 'string' ? Buffer.byteLength(v) + 1 : 4); });
  return n;
}
var Pebble = {
  addEventListener: function (t, f) { lauscher[t] = f; },
  sendAppMessage: function (msg, ok) {
    uhr.groesste = Math.max(uhr.groesste, bytes(msg));
    var m = {}; Object.keys(msg).forEach(function (k) { m[namen[k] || k] = msg[k]; });
    if (m['L_ANZAHL'] !== undefined) {
      if (m['L_ANZAHL'] < 0) { uhr.liste = null; uhr.ende++; }
      else uhr.liste = { titel: m['L_TITEL'], n: m['L_ANZAHL'], texte: [] };
    }
    if (m['L_AB'] !== undefined && uhr.liste) for (var j = 0; j < 10; j++) if (m['L_TEXT[' + j + ']'] !== undefined) uhr.liste.texte[m['L_AB'] + j] = m['L_TEXT[' + j + ']'];
    if (m['L_LADE'] !== undefined) uhr.lade.push(m['L_LADE']);
    if (m['ANZAHL'] !== undefined) {
      uhr.liste = null;
      uhr.einrichtung = { anzahl: m['ANZAHL'], seite: m['SEITE'], umkreis: m['UMKREIS'], namen: [] };
      for (var i = 0; i < m['ANZAHL']; i++) uhr.einrichtung.namen.push(m['NAME_A[' + i + ']'] + ' / ' + m['NAME_B[' + i + ']']);
    }
    if (m['HIN[0]'] !== undefined || m['STATUS'] !== undefined && m['ANZAHL'] === undefined) uhr.abfahrten.push(m);
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

function aktion(a, w) { var p = {}; p.AKTION = a; p.WAHL = w || 0; lauscher.appmessage({ payload: p }); }
function warte(bed, cb, t0) {
  t0 = t0 || Date.now();
  if (bed()) return cb();
  if (Date.now() - t0 > 180000) { console.log('ZEITÜBERSCHREITUNG', JSON.stringify(uhr.liste)); process.exit(1); }
  setTimeout(function () { warte(bed, cb, t0); }, 100);
}
function listeDa(titel) { return function () { return uhr.liste && (titel instanceof RegExp ? titel.test(uhr.liste.titel) : uhr.liste.titel === titel) && uhr.liste.texte.filter(Boolean).length === uhr.liste.n; }; }
function zeige() { var l = uhr.liste; return l.titel + ' (' + l.n + '): ' + l.texte.slice(0, 12).join(' | ') + (l.n > 12 ? ' | …' : ''); }
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
function strecken() { return JSON.parse(speicher.strecken || '[]'); }
function zeigeStrecken() { strecken().forEach(function (s, i) { console.log('  Strecke ' + (i + 1) + ': ' + s.a.kurz + ' -> ' + s.b.kurz + ' | zurück ' + (s.c ? s.c.kurz : '-') + ' | [' + s.linien.join(',') + ']' + (s.alle ? ' alle' : '')); }); }
function einrichtungDa(n) { dann(function (w) { warte(function () { return uhr.einrichtung && uhr.einrichtung.anzahl === n && !uhr.liste; }, function () { console.log('Einrichtung an Uhr: ' + JSON.stringify(uhr.einrichtung)); zeigeStrecken(); w(); }); }); }

// ---------- Ablauf (Beispielstrecken rund um Wiesbaden Hbf) ----------
dann(function (w) { lauscher.ready(); w(); });
einrichtungDa(0);
console.log('== 1 Neue Fahrt ab Hbf, Linie 4, Rückfahrt nein -> Liste');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', /^4$/);
erwarte('ZIEL', /^RHEINSTR/);
erwarte('ZURUECK AB ZIEL?', /^NEIN$/);
erwarte('RUECKFAHRT AB', /M$/, function () { if (uhr.liste.texte.some(function (t) { return /\(ZIEL\)/.test(t); })) { console.log('FEHLER: Ziel trotz Nein angeboten'); process.exit(1); } });
einrichtungDa(1);
dann(function (w) { warte(function () { return uhr.abfahrten.length; }, function () { var a = uhr.abfahrten[uhr.abfahrten.length - 1]; console.log('Abfahrten: Quelle ' + a.QUELLE + ' Status ' + a.STATUS + ' hin ' + [0, 1, 2].map(function (j) { return a['HIN_L[' + j + ']'] + '@' + new Date(a['HIN[' + j + ']'] * 1000).toISOString().substring(11, 16) + 'Z+' + a['HIN_F[' + j + ']'] + "'"; }).join(' ')); if (!(a['HIN_F[0]'] > 0)) { console.log('FEHLER: keine Fahrtdauer'); process.exit(1); } w(); }); });
console.log('== 2 Zurück-Taste: Linie -> Start -> Ende; Abbruch während des Ladens');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
dann(function (w) { setTimeout(function () { console.log('  -> zurück während LADE'); aktion(6); w(); }, 300); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', null);
dann(function (w) { console.log('  -> zurück'); aktion(6); w(); });
erwarte('START', null);
dann(function (w) { var e0 = uhr.ende; console.log('  -> zurück'); aktion(6); warte(function () { return uhr.ende > e0; }, function () { console.log('Ende -> Uhr-Menü'); w(); }); });
console.log('== 3 Fahrt ändern -> Rückfahrt (Ziel angeboten)');
dann(function (w) { aktion(2, 0); w(); });
erwarte('RUECKFAHRT AB', /\(ZIEL\)/);
einrichtungDa(1);
console.log('== 3b Fahrt ändern -> Rückfahrt -> Umkreis bewusst gewählt -> Einstieg -> Ausstieg (nicht am Start)');
dann(function (w) { aktion(2, 0); w(); });
erwarte('RUECKFAHRT AB', /^UMKREIS 1KM$/);
erwarte(/^EINSTIEG 1KM$/, /./);
erwarte('AUSSTIEG', /M$/, function () { if (!/\(START\)$/.test(uhr.liste.texte[0])) console.log('  Hinweis: Start nicht erster Ausstieg (von hier fährt nichts genau zum Start)'); });
einrichtungDa(1);
dann(function (w) { var st = strecken()[0]; if (!st.d) { console.log('FEHLER: Ausstieg d nicht gespeichert'); process.exit(1); } console.log('  Rückfahrt ' + st.c.kurz + ' -> ' + st.d.kurz); w(); });
dann(function (w) { warte(function () { var a = uhr.abfahrten[uhr.abfahrten.length - 1]; return a && a['RUECK_L[0]'] !== undefined; }, function () { var a = uhr.abfahrten[uhr.abfahrten.length - 1]; console.log('  Abfahrten zurück: ' + [0, 1, 2].map(function (j) { return a['RUECK_L[' + j + ']'] + '@' + (a['RUECK[' + j + ']'] ? new Date(a['RUECK[' + j + ']'] * 1000).toISOString().substring(11, 16) + 'Z+' + a['RUECK_F[' + j + ']'] + "'" : '-'); }).join(' ') + ' (' + a.QUELLE + ')'); w(); }); });
console.log('== 3c Umkreis an der Uhr auf 2 km, Rückfahrt-Liste bietet 2KM an, Zurück');
dann(function (w) { aktion(8, 2000); setTimeout(function () { if (speicher.umkreis !== '2000') { console.log('FEHLER: Umkreis nicht gespeichert'); process.exit(1); } w(); }, 50); });
dann(function (w) { aktion(2, 0); w(); });
erwarte('RUECKFAHRT AB', null, function () { if (uhr.liste.texte.indexOf('UMKREIS 2KM') < 0) { console.log('FEHLER: UMKREIS 2KM fehlt'); process.exit(1); } });
dann(function (w) { var e0 = uhr.ende; aktion(6); warte(function () { return uhr.ende > e0; }, function () { console.log('  Zurück -> Uhr-Menü'); w(); }); });
dann(function (w) { aktion(8, 1000); w(); });
console.log('== 4 Neue Fahrt ab Hbf, alle Linien, Buchstabe K, Rückfahrt ja');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', /^ALLE LINIEN$/);
erwarte('ZIEL A-Z', /^K \(/);
erwarte('ZIEL', /^KURHAUS/);
erwarte('ZURUECK AB ZIEL?', /^JA$/);
einrichtungDa(2);
console.log('== 5 Fahrt ändern -> Start (ersetzt Strecke 2), Start am Kurhaus');
dann(function (w) { standort = KURHAUS; aktion(3, 1); w(); });
erwarte('START', /^KURHAUS/);
erwarte('LINIE', /^\d/);
erwarte(/^ZIEL$/, /./);
erwarte(/^(ZURUECK AB ZIEL\?|RUECKFAHRT AB)$/, /./);
einrichtungDa(2);
console.log('== 6 Löschen Strecke 1');
dann(function (w) { aktion(4, 0); w(); });
einrichtungDa(1);
function fertig() {
  console.log('Lade-Meldungen: ' + uhr.lade.length + ' (z. B. ' + uhr.lade.slice(0, 6).join(', ') + ')');
  console.log('Größte Nachricht: ' + uhr.groesste + ' Bytes (Puffer Uhr 2048)');
  console.log('Umkreis in der Einrichtung: ' + (uhr.einrichtung && uhr.einrichtung.umkreis));
  console.log('Abfragen: ' + X.zaehler.n + ' | Dauer: ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(0);
}
los();

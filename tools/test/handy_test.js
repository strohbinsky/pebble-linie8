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
var uhr = { liste: null, ende: 0, einrichtung: null, lade: [], abfahrten: [], groesste: 0, sprung: [] };
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
    if (m['AB[0]'] !== undefined || m['STATUS'] !== undefined && m['ANZAHL'] === undefined) uhr.abfahrten.push(m);
    if (m['SPRUNG'] !== undefined) uhr.sprung.push(m['SPRUNG']);
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
function alleHalteFallsRichtung() {   // seit 0.35: nach einer Linie kommt die Richtung, wenn es mehrere gibt
  dann(function (w) { warte(function () { return listeDa('RICHTUNG')() || listeDa('ZIEL')(); }, function () { if (uhr.liste.titel === 'RICHTUNG') { console.log(zeige()); waehle(/^ALLE HALTE A-Z$/); } w(); }); });
}
function zurueckBis(titel) { dann(function (w) { console.log('  -> zurück'); aktion(6); w(); }); erwarte(titel, null); }
function strecken() { return JSON.parse(speicher.seiten || '[]'); }
function zeigeStrecken() { strecken().forEach(function (s, i) { console.log('  Seite ' + (i + 1) + ': ' + s.a.kurz + (s.b ? ' -> ' + s.b.kurz : ' (alle Abfahrten)') + ' | [' + s.linien.join(',') + ']' + (s.alle ? ' alle' : '')); }); }
function einrichtungDa(n) { dann(function (w) { warte(function () { return uhr.einrichtung && uhr.einrichtung.anzahl === n && !uhr.liste; }, function () { console.log('Einrichtung an Uhr: ' + JSON.stringify(uhr.einrichtung)); zeigeStrecken(); w(); }); }); }
function fehler(t) { console.log('FEHLER: ' + t); process.exit(1); }
function hmZ(t) { return t ? new Date(t * 1000).toISOString().substring(11, 16) + 'Z' : '-'; }
function abfahrtenZeigen(info) {        // letzte Abfahrten an die Uhr; info(a) prüft
  dann(function (w) { warte(function () { return uhr.abfahrten.length; }, function () {
    var a = uhr.abfahrten[uhr.abfahrten.length - 1];
    console.log('  Abfahrten (' + a.QUELLE + ', Status ' + a.STATUS + '): ' + [0, 1, 2].map(function (j) {
      return a['AB_L[' + j + ']'] + (a['AB_S[' + j + ']'] ? '/' + a['AB_S[' + j + ']'] : '') + '@' + hmZ(a['AB[' + j + ']']) + (a['AB_F[' + j + ']'] ? '+' + a['AB_F[' + j + ']'] + "'" : '') +
             (a['AB_Z[' + j + ']'] ? ' > ' + a['AB_Z[' + j + ']'] + ' / ' + a['AB_ZK[' + j + ']'] : '');
    }).join(' | '));
    if (info) info(a);
    w();
  }); });
}

// ---------- Ablauf (Beispielseiten rund um Wiesbaden Hbf) ----------
dann(function (w) { lauscher.ready(); w(); });
einrichtungDa(0);
console.log('== 1 Neue Fahrt ab Hbf, Linie 4, Ziel -> gleich gespeichert (seit 0.50 keine Rückfahrt-Frage)');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', /^4$/);
alleHalteFallsRichtung();
erwarte('ZIEL', /^RHEINSTR/, function () { if (uhr.liste.texte[0] !== 'OHNE ZIEL') fehler('OHNE ZIEL nicht oben in der Zielliste'); });
einrichtungDa(1);
abfahrtenZeigen(function (a) { if (a['AB[0]'] && !(a['AB_F[0]'] > 0)) fehler('keine Fahrtdauer'); if (a['AB_Z[0]']) fehler('Endziel bei Seite mit Ziel'); });
console.log('== 1b Linie 8 ab Hbf: Richtung mit OHNE ZIEL oben, Ziele in Fahrtreihenfolge, zurück bis ins Menü');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', /^8$/);
erwarte('RICHTUNG', /UEBER/, function () { var t = uhr.liste.texte; if (t[0] !== 'OHNE ZIEL' || t[t.length - 1] !== 'ALLE HALTE A-Z') fehler('OHNE ZIEL oder ALLE HALTE A-Z fehlt'); });
erwarte('ZIEL', null);
zurueckBis('RICHTUNG');
zurueckBis('LINIE');
zurueckBis('START');
dann(function (w) { var e0 = uhr.ende; aktion(6); warte(function () { return uhr.ende > e0; }, function () { console.log('Ende -> Uhr-Menü'); w(); }); });
console.log('== 2 Zurück-Taste: Linie -> Start -> Ende; Abbruch während des Ladens');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
dann(function (w) { setTimeout(function () { console.log('  -> zurück während LADE'); aktion(6); w(); }, 300); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', null);
dann(function (w) { console.log('  -> zurück'); aktion(6); w(); });
erwarte('START', null);
dann(function (w) { var e0 = uhr.ende; console.log('  -> zurück'); aktion(6); warte(function () { return uhr.ende > e0; }, function () { console.log('Ende -> Uhr-Menü'); w(); }); });
console.log('== 3 Rückfahrt von Seite 1 (Ziel angeboten) -> neue Seite 2 dahinter');
dann(function (w) { aktion(2, 0); w(); });
erwarte('RUECKFAHRT AB', /\(ZIEL\)/);
einrichtungDa(2);
dann(function (w) { var l = strecken(), h = l[0], r = l[1];
  if (r.a.name !== h.b.name || r.b.name !== h.a.name) fehler('Rückfahrt nicht Ziel -> Start: ' + r.a.name + ' -> ' + r.b.name);
  if (speicher.seite !== '1') fehler('Rückfahrt nicht aktive Seite'); console.log('  Rückfahrt ' + r.a.kurz + ' -> ' + r.b.kurz + ' [' + r.linien + ']'); w(); });
abfahrtenZeigen();
console.log('== 3b Rückfahrt von Seite 1 -> Umkreis bewusst gewählt -> Einstieg -> Ausstieg (nicht am Start) -> neue Seite 2');
dann(function (w) { aktion(2, 0); w(); });
erwarte('RUECKFAHRT AB', /^UMKREIS 1KM$/, function () { if (uhr.liste.texte.some(function (t) { return /OHNE RUECKFAHRT/.test(t); })) fehler('OHNE RUECKFAHRT noch da'); });
erwarte(/^EINSTIEG 1KM$/, /./);
erwarte('AUSSTIEG', /M$/, function () { if (!/\(START\)$/.test(uhr.liste.texte[0])) console.log('  Hinweis: Start nicht erster Ausstieg (von hier fährt nichts genau zum Start)'); });
einrichtungDa(3);
dann(function (w) { var l = strecken(), r = l[1]; if (r.b.name === l[0].a.name) fehler('Ausstieg im Umkreis nicht gespeichert'); console.log('  Rückfahrt ' + r.a.kurz + ' -> ' + r.b.kurz); w(); });
console.log('== 3c Umkreis an der Uhr auf 2 km, Rückfahrt-Liste bietet 2KM an, Zurück');
dann(function (w) { aktion(8, 2000); setTimeout(function () { if (speicher.umkreis !== '2000') fehler('Umkreis nicht gespeichert'); w(); }, 50); });
dann(function (w) { aktion(2, 0); w(); });
erwarte('RUECKFAHRT AB', null, function () { if (uhr.liste.texte.indexOf('UMKREIS 2KM') < 0) fehler('UMKREIS 2KM fehlt'); });
dann(function (w) { var e0 = uhr.ende; aktion(6); warte(function () { return uhr.ende > e0; }, function () { console.log('  Zurück -> Uhr-Menü'); w(); }); });
dann(function (w) { aktion(8, 1000); w(); });
console.log('== 4 Seite ohne Ziel (seit 0.50): Hbf, Linie 8, Richtung OHNE ZIEL');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', /^8$/);
erwarte('RICHTUNG', /^OHNE ZIEL$/);
einrichtungDa(4);
dann(function (w) { var st = strecken()[3]; if (st.b || st.alle || st.linien.join() !== '8') fehler('Seite ohne Ziel falsch gespeichert'); if (uhr.einrichtung.namen[3] !== 'HAUPTBAHNHOF / ') fehler('NAME_B nicht leer: ' + uhr.einrichtung.namen[3]); w(); });
abfahrtenZeigen(function (a) { if (a['AB[0]'] && !a['AB_Z[0]']) fehler('Endziel fehlt'); if (a['AB_L[0]'] && a['AB_L[0]'] !== '8') fehler('fremde Linie ' + a['AB_L[0]']); });
dann(function (w) { var n0 = uhr.abfahrten.length; aktion(9, 2); warte(function () { return uhr.abfahrten.length > n0; }, function () { w(); }); });
abfahrtenZeigen(function (a) { if (a.QUELLE !== 'TRANS') fehler('nicht Transitous'); });
dann(function (w) { var n0 = uhr.abfahrten.length; aktion(9, 0); warte(function () { return uhr.abfahrten.length > n0; }, function () { w(); }); });
console.log('== 4b Hbf, alle Linien, Ziel A-Z: OHNE ZIEL oben');
dann(function (w) { aktion(1); w(); });
erwarte('START', /^HAUPTBAHNHOF/);
erwarte('LINIE', /^ALLE LINIEN$/);
erwarte('ZIEL A-Z', /^OHNE ZIEL$/);
einrichtungDa(5);
dann(function (w) { var st = strecken()[4]; if (st.b || !st.alle) fehler('alle Linien ohne Ziel falsch'); console.log('  ' + st.linien.length + ' Linien'); w(); });
abfahrtenZeigen(function (a) { var s = [0, 1, 2].map(function (j) { return a['AB_S[' + j + ']']; }); console.log('  Steige: ' + s.join(',') + ' (verschiedene = alle Steige der Haltestelle)'); });
console.log('== 5 Fahrt ändern (ersetzt Seite 2), Start am Kurhaus');
dann(function (w) { standort = KURHAUS; aktion(3, 1); w(); });
erwarte('START', /^KURHAUS/);
erwarte('LINIE', /^\d/);
alleHalteFallsRichtung();
erwarte(/^ZIEL$/, /^(?!OHNE ZIEL)./);
einrichtungDa(5);
dann(function (w) { if (!/^KURHAUS/.test(strecken()[1].a.kurz)) fehler('Seite 2 nicht ersetzt'); w(); });
console.log('== 5c Abfahrt aktuell, Fahrtdauer aus (an der Uhr), dann zurück auf Standard');
dann(function (w) { aktion(10, 1); aktion(11, 0); setTimeout(function () {
  if (speicher.abfahrt !== 'aktuell' || speicher.dauer !== 'aus') fehler('Abfahrt/Fahrtdauer nicht gespeichert');
  aktion(10, 0); aktion(11, 1); w(); }, 50); });
console.log('== 6 Löschen Seite 1');
dann(function (w) { aktion(4, 0); w(); });
einrichtungDa(4);

function aufsteigendM() {              // Einstieg im Umkreis: nächste Haltestelle zuerst
  var m = uhr.liste.texte.map(function (t) { var x = / (\d+)M$/.exec(t); return x ? +x[1] : -1; });
  if (m.some(function (v) { return v < 0; })) fehler('Einstieg ohne Meterangabe');
  for (var i = 1; i < m.length; i++) if (m[i] < m[i - 1]) fehler('Einstieg nicht nach Entfernung sortiert');
}
console.log('== 7 Neue Fahrt IM UMKREIS am Kurhaus, Linie 8: kein OHNE ZIEL, Einstieg nach Entfernung, gleich gespeichert');
dann(function (w) { standort = KURHAUS; aktion(1); w(); });
erwarte('START', /^IM UMKREIS 1KM$/);
erwarte('LINIE', /^8$/);
dann(function (w) { warte(function () { return listeDa('RICHTUNG')() || listeDa('ZIEL')(); }, function () { console.log(zeige()); if (uhr.liste.texte.indexOf('OHNE ZIEL') >= 0) fehler('OHNE ZIEL im Umkreis'); if (uhr.liste.titel === 'RICHTUNG') waehle(/^ALLE HALTE A-Z$/); w(); }); });
erwarte('ZIEL', /./, function () { if (uhr.liste.texte.indexOf('OHNE ZIEL') >= 0) fehler('OHNE ZIEL im Umkreis'); });
erwarte('EINSTIEG', /./, aufsteigendM);
einrichtungDa(5);
console.log('== 8 Schnellere Abfahrt: Beispielseite Hbf -> Kurhaus/Theater nur Linie 8, ohne Koordinaten');
function nachMeter() {
  var m = uhr.liste.texte.map(function (t) { var x = / (\d+)M$/.exec(t); return x ? +x[1] : 0; });
  for (var i = 1; i < m.length; i++) if (m[i] < m[i - 1]) fehler('nicht nach Entfernung sortiert');
}
function schnellDurchlauf(seite, uebernehmen) {
  dann(function (w) { aktion(12, seite); w(); });
  dann(function (w) { warte(function () { return listeDa('SCHNELLER AB')() || listeDa('NICHTS SCHNELLER')(); }, function () {
    console.log(zeige());
    if (uhr.liste.titel !== 'SCHNELLER AB') { var e0 = uhr.ende; aktion(6); return warte(function () { return uhr.ende > e0; }, w); }
    nachMeter();
    waehle(/./);
    warte(listeDa('AUSSTIEG'), function () {
      console.log(zeige());
      if (uhr.liste.texte.slice(1).some(function (t) { return /\(ZIEL\)$/.test(t); })) fehler('Ziel nicht oben');
      waehle(/./);
      warte(listeDa(/^BISHER /), function () {
        console.log(zeige());
        var fahrt = uhr.liste.texte[0];
        waehle(/./);
        warte(listeDa(fahrt), function () {
          if (uhr.liste.texte.join('|') !== 'ZURUECK|UEBERNEHMEN') fehler('Mini-Menü falsch');
          if (!uebernehmen) { var e0 = uhr.ende; waehle(/^ZURUECK$/); return warte(function () { return uhr.ende > e0; }, function () { console.log('  Zurück -> Anzeige'); w(); }); }
          var n0 = uhr.abfahrten.length, linie = fahrt.split(' ')[0];
          uhr.einrichtung = null;
          waehle(/^UEBERNEHMEN$/);
          warte(function () { return uhr.einrichtung && !uhr.liste && uhr.abfahrten.length > n0; }, function () {
            var st = strecken()[seite], a = uhr.abfahrten[uhr.abfahrten.length - 1];
            console.log('  übernommen: ' + st.a.kurz + ' -> ' + st.b.kurz + ' [' + st.linien + ']');
            if (st.alle || st.linien.join() !== linie) fehler('Linie nicht übernommen');
            if (a['AB_L[0]'] && a['AB_L[0]'] !== linie.substring(0, 4)) fehler('fremde Linie in der Anzeige: ' + a['AB_L[0]']);
            w();
          });
        });
      });
    });
  }); });
}
dann(function (w) {
  var l = strecken();
  l.push({ a: { id: 'de-DELFI_de:06414:6907', name: 'Wiesbaden Hauptbahnhof', kurz: 'HAUPTBAHNHOF' },
           b: { id: 'de-DELFI_de:06414:25411:1:1', name: 'Wiesbaden Kurhaus/Theater', kurz: 'KURHAUS/THEATER' }, alle: false, linien: ['8'] });
  speicher.seiten = JSON.stringify(l); standort = HBF; w();
});
schnellDurchlauf(5);
console.log('== 8d Standort weit weg (Frankfurt): Rechnung ab dem Start, Liste nicht leer');
dann(function (w) { standort = { lat: 50.107, lon: 8.663 }; w(); });
schnellDurchlauf(5);
console.log('== 8f Bezug (seit 0.41): erste Fahrt, die man zu Fuß erreicht, 50 m Luftlinie je Minute');
dann(function (w) {
  var j = Math.floor(Date.now() / 1000), x = { lat: 50.0707, lon: 8.2436 }, liste = [{ ab: j + 120 }, { ab: j + 900 }];
  var weg = { lat: 50.0707 + 500 / 111320, lon: 8.2436 };
  var b1 = ctx.bezugWaehlen(liste, null, x), b2 = ctx.bezugWaehlen(liste, weg, x), b3 = ctx.bezugWaehlen(liste, { lat: 50.2, lon: 8.2436 }, x);
  if (!b1 || b1.ab !== j + 120 || !b2 || b2.ab !== j + 900 || !b3 || b3.ab !== j + 120) fehler('Bezugswahl');
  if (ctx.bezugWaehlen([{ ab: j + 120 }], weg, x) !== null) fehler('unerreichbarer Bezug gewählt');
  w();
});
console.log('== 8e Übernehmen auf der Beispielseite, Standort Kurhaus');
dann(function (w) { standort = KURHAUS; w(); });
schnellDurchlauf(5, true);
console.log('== 8g Schneller auf Seite ohne Ziel: Handy beendet gleich');
dann(function (w) { var e0 = uhr.ende, i = strecken().findIndex(function (s) { return !s.b; }); aktion(12, i); warte(function () { return uhr.ende > e0; }, function () { console.log('  beendet'); w(); }); });
console.log('== 9 Startseite nach Standort (seit 0.50)');
dann(function (w) {
  var l = strecken(), hbf = l.findIndex(function (s) { return /HAUPTBAHNHOF/.test(s.a.kurz) && s.a.lat !== undefined; });
  delete speicher.ort; speicher.seite = String(hbf); standort = KURHAUS; uhr.sprung = [];
  lauscher.ready();
  warte(function () { return uhr.sprung.length; }, function () {
    var i = uhr.sprung[0], st = strecken()[i];
    console.log('  am Kurhaus, aktiv Seite ' + (hbf + 1) + ' -> Sprung auf Seite ' + (i + 1) + ' ab ' + st.a.kurz);
    if (i === hbf) fehler('kein Sprung');
    lauscher.appmessage({ payload: { REQUEST: i } });      // Uhr übernimmt und fordert an
    uhr.sprung = [];
    lauscher.ready();                                     // gleich wieder geöffnet, kaum bewegt: kein Sprung
    setTimeout(function () { if (uhr.sprung.length) fehler('Sprung trotz kaum bewegt'); console.log('  wieder geöffnet, kaum bewegt: bleibt'); if (!(strecken()[i].zuletzt > 0)) fehler('zuletzt nicht gesetzt'); w(); }, 400);
  });
});
console.log('== 10 Abfahrten hier (seit 0.51): nächste Haltestelle am Hbf, dann nächstnähere, rückwärts umlaufend, nichts gespeichert');
function hier(k, pruefen) {
  dann(function (w) {
    var n0 = uhr.abfahrten.length, s0 = speicher.seiten;
    aktion(13, k);
    warte(function () { return uhr.abfahrten.slice(n0).some(function (a) { return a.SEITE === 8; }); }, function () {
      var a = uhr.abfahrten.slice(n0).filter(function (x) { return x.SEITE === 8; }).pop();
      console.log('  hier ' + k + ': ' + a.HIER_NAME + ' / ' + a.HIER_KLAR + ' (' + (a.HIER_NR + 1) + '/' + a.HIER_N + ', ' + a.QUELLE + ') ' + [0, 1, 2].map(function (j) {
        return a['AB_L[' + j + ']'] + (a['AB_S[' + j + ']'] ? '/' + a['AB_S[' + j + ']'] : '') + '@' + hmZ(a['AB[' + j + ']']) + ' > ' + a['AB_Z[' + j + ']'];
      }).join(' | '));
      if (speicher.seiten !== s0) fehler('Abfahrten hier hat Seiten verändert');
      if (!a.HIER_NAME || !(a.HIER_N > 0)) fehler('Name oder Anzahl fehlt');
      if (a['AB[0]'] && !a['AB_Z[0]']) fehler('Endziel fehlt');
      if (pruefen) pruefen(a);
      w();
    });
  });
}
dann(function (w) { standort = HBF; w(); });
hier(0, function (a) { if (a.HIER_NR !== 0 || !/HAUPTBAHNHOF/.test(a.HIER_NAME)) fehler('nicht die nächste Haltestelle'); });
hier(1, function (a) { if (a.HIER_NR !== 1) fehler('nicht die zweite'); });
hier(-1, function (a) { if (a.HIER_NR !== a.HIER_N - 1) fehler('rückwärts nicht umgelaufen'); });
dann(function (w) { standort = KURHAUS; w(); });
hier(0, function (a) { if (!/KURHAUS/.test(a.HIER_NAME)) fehler('Standort nicht neu geholt'); });
function fertig() {
  console.log('Lade-Meldungen: ' + uhr.lade.length + ' (z. B. ' + uhr.lade.slice(0, 6).join(', ') + ')');
  console.log('Größte Nachricht: ' + uhr.groesste + ' Bytes (Puffer Uhr 2048)');
  console.log('Abfragen: ' + X.zaehler.n + ' | Dauer: ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(0);
}
los();

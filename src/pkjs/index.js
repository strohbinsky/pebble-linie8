// Linie 8 — Handy-Teil (PebbleKit JS).
// Hält bis zu 8 Strecken (Haltestellenpaare), lädt beim Öffnen und Blättern die nächsten Fahrten
// und schickt Abfahrtszeiten (Unix-Sekunden, UTC) und Linien an die Uhr.
//
// Datenquelle: RMV (HAFAS ReST), wenn in den Einstellungen ein Schlüssel hinterlegt ist, sonst oder bei
// Fehler Transitous (MOTIS, nur Sollfahrplan). In beiden Fällen Verbindungssuche Start -> Ziel ohne Umstieg:
// liefert genau die Fahrten, die an BEIDEN Haltestellen halten — damit sind geteilte Linien erledigt.
//
// Uhr-Menü (Version 3.0): Strecken direkt an der Uhr anlegen, ändern, löschen. Der Ablauf ist ein
// Zustandsautomat hier im Handy-Skript (siehe "Uhr-Menü" unten); die Uhr zeigt nur Listen und meldet die Wahl.

var keys = require('message_keys');
var SEITE_HTML = require('./einstellungen_seite');
var SCHRIFT = require('./schrift.json');
var Logik = require('./logik');

var PLAN = 'https://api.transitous.org/api/v5/plan';
var MAXD = 3;          // muss zu HIN[3] / RUECK[3] in package.json passen
var MAXS = 8;          // muss zu NAME_A[8] / NAME_B[8] passen
var TIMEOUT_MS = 15000;

var STATUS_SOLL = 0, STATUS_LIVE = 1, STATUS_NETZ = 2, STATUS_FEHLER = 3;
var AUSFALL = 9999;   // Verspätungswert für eine ausgefallene Fahrt

// ---------- Speicher ----------
function strecken() {
  try { return JSON.parse(localStorage.getItem('strecken')) || []; } catch (e) { return []; }
}
function aktiveSeite() {
  var n = strecken().length, s = parseInt(localStorage.getItem('seite') || '0', 10);
  return n === 0 ? 0 : Math.max(0, Math.min(n - 1, isNaN(s) ? 0 : s));
}

// ---------- Nachrichten der Reihe nach senden ----------
var schlange = [], sendet = false;
function senden(msg, liste) { schlange.push({ msg: msg, liste: !!liste }); weiter(); }   // liste: Menü-Nachricht, verwerfbar
function weiter() {
  if (sendet || schlange.length === 0) return;
  sendet = true;
  Pebble.sendAppMessage(schlange.shift().msg,
    function () { sendet = false; weiter(); },
    function (e) { console.log('Senden fehlgeschlagen: ' + JSON.stringify(e)); sendet = false; weiter(); });
}

// ---------- Datenquelle ----------
function linienKurz(name) {          // Anzeige auf der Uhr: höchstens 4 Zeichen
  var s = String(name || '').toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE');
  var teile = s.split(' ');
  if (teile.length > 1 && /^[A-Z]+$/.test(teile[0])) s = teile[0];   // "ICE 78" -> "ICE"
  return s.replace(/[^A-Z0-9]/g, '').substring(0, 4);
}

// Steig der Abfahrt (z. B. "B" am Tränkweg), höchstens 3 Zeichen; leer, wenn die Haltestelle keine Steige hat.
// Bei mehreren Wörtern zählt das letzte: RMV meldet am Flughafen "Regio 3" (Regionalbahnhof, Gleis 3) -> "3".
function steigText(s) {
  var teile = String(s || '').trim().split(/\s+/);
  return teile[teile.length - 1].substring(0, 3);
}

function holen(von, nach, linien, fertig) {
  var url = PLAN +
    '?fromPlace=' + encodeURIComponent(von) +
    '&toPlace=' + encodeURIComponent(nach) +
    '&maxTransfers=0&numItineraries=10&directModes=WALK' +
    '&maxPreTransitTime=0&maxPostTransitTime=0';
  var erledigt = false;
  function ende(fehler, erg) { if (!erledigt) { erledigt = true; fertig(fehler, erg); } }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  // Transitous lehnt Anfragen ohne User-Agent mit 403 ab.
  try { xhr.setRequestHeader('User-Agent', 'pebble-linie8/2.2 (privat)'); } catch (e) {}
  xhr.onload = function () {
    if (xhr.status !== 200) { console.log('HTTP ' + xhr.status); return ende(STATUS_FEHLER); }
    try {
      var daten = JSON.parse(xhr.responseText), liste = [], live = false, gesehen = {};
      (daten.itineraries || []).forEach(function (it) {
        var fahrten = it.legs.filter(function (l) { return l.mode !== 'WALK'; });
        if (fahrten.length !== 1) return;
        var f = fahrten[0];
        if (linien && linien.length && linien.indexOf(f.routeShortName) < 0) return;
        var t = Math.floor(Date.parse(f.startTime) / 1000), k = t + '|' + f.routeShortName;
        if (gesehen[k]) return;
        gesehen[k] = true;
        liste.push({ t: t, l: linienKurz(f.routeShortName), d: 0, s: steigText(f.from && (f.from.track || f.from.scheduledTrack)) });
        live = live || !!f.realTime;
      });
      liste.sort(function (a, b) { return a.t - b.t; });
      ende(null, { fahrten: liste.slice(0, MAXD), live: live });
    } catch (e) {
      console.log('Antwort unlesbar: ' + e);
      ende(STATUS_FEHLER);
    }
  };
  xhr.onerror = function () { ende(STATUS_NETZ); };
  setTimeout(function () { ende(STATUS_NETZ); }, TIMEOUT_MS);
  xhr.send();
}

// ---------- Datenquelle RMV (HAFAS ReST, mit eigenem Schlüssel) ----------
var RMV = 'https://www.rmv.de/hapi/';
function rmvSchluessel() { return (localStorage.getItem('rmvKey') || '').trim(); }

function rmvGet(pfad, fertig) {
  var erledigt = false;
  function ende(f, d) { if (!erledigt) { erledigt = true; fertig(f, d); } }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', RMV + pfad + '&format=json&accessId=' + encodeURIComponent(rmvSchluessel()), true);
  xhr.onload = function () {
    if (xhr.status !== 200) { console.log('RMV HTTP ' + xhr.status); return ende(STATUS_FEHLER); }
    try { ende(null, JSON.parse(xhr.responseText)); } catch (e) { ende(STATUS_FEHLER); }
  };
  xhr.onerror = function () { ende(STATUS_NETZ); };
  setTimeout(function () { ende(STATUS_NETZ); }, TIMEOUT_MS);
  xhr.send();
}

function entfernung(a, b, c, d) { return L.entfernung(a, b, c, d); }

// RMV-Kennung zu einer Haltestelle aus der Einrichtung (Transitous-Kennung, Name, ggf. Koordinaten).
// Einmal per Namenssuche ermittelt, über die Entfernung abgesichert, dann gemerkt.
function rmvKennung(h, fertig) {
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem('rmvIds')) || {}; } catch (e) {}
  if (cache[h.id]) return fertig(null, cache[h.id]);
  var such = h.name.replace(/,/g, ' ').replace(/\s+/g, ' ');
  var q = 'location.name?type=S&maxNo=5&input=' + encodeURIComponent(such);
  if (h.lat !== undefined) q += '&coordLat=' + h.lat + '&coordLong=' + h.lon;
  rmvGet(q, function (f, d) {
    if (f !== null) return fertig(f);
    var liste = (d.stopLocationOrCoordLocation || []).map(function (x) { return x.StopLocation; }).filter(Boolean);
    if (h.lat !== undefined) liste = liste.filter(function (x) { return entfernung(h.lat, h.lon, x.lat, x.lon) < 600; });
    if (!liste.length) { console.log('RMV: keine Haltestelle zu ' + h.name); return fertig(STATUS_FEHLER); }
    cache[h.id] = liste[0].extId || liste[0].id;
    localStorage.setItem('rmvIds', JSON.stringify(cache));
    console.log('RMV-Kennung ' + h.name + ' -> ' + liste[0].name + ' ' + cache[h.id]);
    fertig(null, cache[h.id]);
  });
}

// RMV liefert Ortszeit Deutschland. Umrechnung nach UTC ohne die Zeitzone des Handys (das kann in Hongkong sein).
function letzterSonntag0100(y, m) {   // m: 1-12, Ergebnis Unix-Sekunden UTC
  var t = Date.UTC(y, m, 0) / 1000;    // letzter Tag des Monats, 00:00 UTC
  var wd = new Date(t * 1000).getUTCDay();
  return t - wd * 86400 + 3600;
}
function deZuUtc(datum, zeit) {
  var d = datum.split('-'), z = zeit.split(':');
  var naiv = Date.UTC(+d[0], +d[1] - 1, +d[2], +z[0], +z[1], +(z[2] || 0)) / 1000;
  var y = +d[0], utc = naiv - 7200;
  if (utc >= letzterSonntag0100(y, 3) && utc < letzterSonntag0100(y, 10)) return utc;
  return naiv - 3600;
}

function holenRmv(von, nach, linien, fertig) {
  rmvKennung(von, function (f1, a) {
    if (f1 !== null) return fertig(f1);
    rmvKennung(nach, function (f2, b) {
      if (f2 !== null) return fertig(f2);
      rmvGet('trip?maxChange=0&numF=6&originExtId=' + encodeURIComponent(a) + '&destExtId=' + encodeURIComponent(b), function (f, d) {
        if (f !== null) return fertig(f);
        try {
          var liste = [], live = false, gesehen = {};
          (d.Trip || []).forEach(function (tr) {
            var legs = (tr.LegList && tr.LegList.Leg) || [];
            var fahrten = legs.filter(function (l) { return l.type === 'JNY'; });
            if (fahrten.length !== 1 || legs.length !== 1) return;
            var l = fahrten[0], pr = l.Product;
            if (pr && pr.length !== undefined) pr = pr[0];
            var name = (pr && (pr.line || pr.displayNumber || pr.num)) || l.name || '';
            if (linien && linien.length && linien.indexOf(name) < 0) return;
            var o = l.Origin, rt = !!o.rtTime;
            var plan = deZuUtc(o.date, o.time);
            var t = rt ? deZuUtc(o.rtDate || o.date, o.rtTime) : plan, k = t + '|' + name;
            if (gesehen[k]) return;
            gesehen[k] = true;
            // Verspätung in Minuten (negativ = zu früh); ausgefallene Fahrt als AUSFALL
            var d = (l.cancelled || o.cancelled) ? AUSFALL : Math.round((t - plan) / 60);
            // Steig: Echtzeit vor Fahrplan (RMV meldet Steigwechsel als rtTrack)
            var steig = o.rtTrack || o.track || (o.rtPlatform && o.rtPlatform.text) || (o.platform && o.platform.text);
            liste.push({ t: t, l: linienKurz(name), d: d, s: steigText(steig) });
            live = live || rt;
          });
          liste.sort(function (x, y) { return x.t - y.t; });
          fertig(null, { fahrten: liste.slice(0, MAXD), live: live });
        } catch (e) {
          console.log('RMV-Antwort unlesbar: ' + e);
          fertig(STATUS_FEHLER);
        }
      });
    });
  });
}

// ---------- An die Uhr ----------
// Rückfahrt startet an c (eigene Haltestelle nahe dem Ziel); ältere Einrichtungen ohne c: am Ziel b.
function rueckStart(st) { return st.ohneRueck ? null : (st.c || st.b); }

// Ansicht: 'led' (Standard) oder 'klar'. Einstellbar am Handy (Seite) und an der Uhr (Menü Einstellungen).
function layout() { return localStorage.getItem('layout') === 'klar' ? 'klar' : 'led'; }
function T(led, klar) { return layout() === 'klar' ? klar : led; }   // Text je nach Ansicht

function einrichtungSenden() {
  var liste = strecken(), msg = {};
  msg[keys.ANZAHL] = liste.length;
  msg[keys.SEITE] = aktiveSeite();
  msg[keys.LAYOUT] = layout() === 'klar' ? 1 : 0;
  for (var i = 0; i < liste.length && i < MAXS; i++) {
    var c = rueckStart(liste[i]), stadt = L.stadtVon(liste[i].a.name);
    msg[keys.NAME_A + i] = liste[i].a.kurz;
    msg[keys.NAME_B + i] = c ? c.kurz : 'KEIN RUECKWEG';
    // Namen für die Ansicht „Klar“ immer mitschicken, damit die Uhr ohne Handy umschalten kann
    msg[keys.KLAR_A + i] = L.utf8Kuerzen(L.klarname(liste[i].a.name, stadt), 31);
    msg[keys.KLAR_B + i] = c ? L.utf8Kuerzen(L.klarname(c.name, stadt), 31) : 'Kein Rückweg';
  }
  senden(msg);
}

// Lädt beide Richtungen einer Strecke aus einer Quelle. fertig(msg) bei Erfolg, fertig(null, fehler) sonst.
function richtungenLaden(st, quelle, fertig) {
  var linien = st.alle ? null : st.linien;
  var msg = {}, offen = 2, fehler = null, live = true;
  function eintragen(t, l, v, st, erg) {
    for (var j = 0; j < MAXD; j++) {
      var f = erg.fahrten[j];
      msg[t + j] = f ? f.t : 0;
      msg[l + j] = f ? f.l : '';
      msg[v + j] = f ? f.d : 0;
      msg[st + j] = f ? (f.s || '') : '';
    }
    live = live && erg.live;
  }
  function eins() {
    if (--offen > 0) return;
    if (fehler !== null) return fertig(null, fehler);
    msg[keys.STATUS] = live ? STATUS_LIVE : STATUS_SOLL;
    fertig(msg);
  }
  // Transitous kennt Haltestellen per Kennung, RMV per Haltestellen-Objekt (Name, Koordinaten)
  function abfrage(von, nach, cb) {
    if (quelle === 'RMV') holenRmv(von, nach, linien, cb); else holen(von.id, nach.id, linien, cb);
  }
  abfrage(st.a, st.b, function (f, erg) {
    if (f !== null) fehler = f; else eintragen(keys.HIN, keys.HIN_L, keys.HIN_D, keys.HIN_S, erg);
    eins();
  });
  var c = rueckStart(st);
  if (!c) { eintragen(keys.RUECK, keys.RUECK_L, keys.RUECK_D, keys.RUECK_S, { fahrten: [], live: true }); eins(); return; }
  abfrage(c, st.a, function (f, erg) {
    if (f !== null) fehler = f; else eintragen(keys.RUECK, keys.RUECK_L, keys.RUECK_D, keys.RUECK_S, erg);
    eins();
  });
}

// RMV, wenn ein Schlüssel hinterlegt ist; schlägt RMV fehl, die ganze Strecke aus Transitous.
function streckeLaden(i) {
  var st = strecken()[i];
  if (!st) return;
  function senden2(msg, quelle) {
    msg[keys.SEITE] = i;
    msg[keys.QUELLE] = quelle;
    msg[keys.STAND] = Math.floor(Date.now() / 1000);
    senden(msg);
  }
  function transitous() {
    richtungenLaden(st, 'TRANS', function (msg, fehler) {
      if (msg) return senden2(msg, 'TRANS');
      var m = {}; m[keys.STATUS] = fehler;
      senden2(m, 'TRANS');
    });
  }
  if (!rmvSchluessel()) return transitous();
  richtungenLaden(st, 'RMV', function (msg, fehler) {
    if (msg) return senden2(msg, 'RMV');
    console.log('RMV fehlgeschlagen (' + fehler + '), nehme Transitous');
    transitous();
  });
}

Pebble.addEventListener('ready', function () {      // App geöffnet
  ablauf = null;
  einrichtungSenden();
  if (strecken().length) streckeLaden(aktiveSeite());
});

function wert(p, k) { return p[k] !== undefined ? p[k] : p[keys[k]]; }

Pebble.addEventListener('appmessage', function (e) { // Select oder Blättern auf der Uhr, oder Menü
  var p = e.payload || {};
  var aktion = wert(p, 'AKTION');
  if (aktion !== undefined) return menueAktion(aktion, wert(p, 'WAHL') || 0);
  var s = wert(p, 'REQUEST');
  if (s !== undefined) localStorage.setItem('seite', String(s));
  streckeLaden(aktiveSeite());
});

// ---------- Uhr-Menü: Strecken an der Uhr anlegen, ändern, löschen ----------
// Listen und Haltestellen immer über Transitous (keine Echtzeit nötig, kein RMV-Kontingent).
// Uhr -> Handy: AKTION + WAHL. Handy -> Uhr: Liste (L_TITEL, L_ANZAHL, L_AB, L_TEXT[10]) in Blöcken zu 10,
// Fortschritt L_LADE, L_ANZAHL = -1 heißt "Ablauf beendet, zurück ins Uhr-Menü".
// Nach jeder Änderung: localStorage -> einrichtungSenden() -> streckeLaden() — dieselben Strecken wie am Handy.
var A_NEU = 1, A_AENDERN_RUECK = 2, A_AENDERN_START = 3, A_LOESCHEN = 4, A_WAHL = 5, A_ZURUECK = 6, A_LAYOUT = 7;
var BLOCK = 10;        // muss zu L_TEXT[10] in package.json passen
var MAXL = 300;        // muss zu MAXL in main.c passen
var LTXT = 31;         // Zeichen je Listeneintrag (Puffer 32 auf der Uhr)
var NAH = 10;          // so viele Haltestellen vom Standort
var ZIEL_DIREKT = 40;  // mehr Ziele (Hbf mit allen Linien: über 300): erst Anfangsbuchstabe wählen

function transitousHolen(pfad, fertig) {
  var erledigt = false;
  function ende(f, d) { if (!erledigt) { erledigt = true; fertig(f, d); } }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://api.transitous.org/api/' + pfad, true);
  try { xhr.setRequestHeader('User-Agent', 'pebble-linie8/3.0 (privat)'); } catch (e) {}
  xhr.onload = function () {
    if (xhr.status !== 200) return ende('HTTP ' + xhr.status);
    try { ende(null, JSON.parse(xhr.responseText)); } catch (e) { ende('Antwort unlesbar'); }
  };
  xhr.onerror = function () { ende('kein Netz'); };
  setTimeout(function () { ende('kein Netz'); }, 30000);   // Transitous bremst bei vielen Abfragen bis ~12 s
  xhr.send();
}
var L = Logik(transitousHolen, SCHRIFT.F35);

var ablauf = null;     // laufender Menü-Ablauf: { ziel, nurRueck, schritte[], a, linie, erg, b, extra, hin, gen }

function listeSenden(titel, texte) {
  schlange = schlange.filter(function (x) { return !x.liste; });   // Blöcke einer veralteten Liste verwerfen
  var n = Math.min(texte.length, MAXL);
  for (var ab = 0; ab === 0 || ab < n; ab += BLOCK) {
    var msg = {};
    if (ab === 0) { msg[keys.L_TITEL] = L.utf8Kuerzen(titel, LTXT); msg[keys.L_ANZAHL] = n; }
    msg[keys.L_AB] = ab;
    for (var j = 0; j < BLOCK && ab + j < n; j++) msg[keys.L_TEXT + j] = L.utf8Kuerzen(texte[ab + j], LTXT);
    senden(msg, true);
  }
}

function ladeSenden(text, immer) {     // Fortschritt nur, wenn die Leitung frei ist (sonst staut es sich)
  if (!immer && (sendet || schlange.length)) return;
  var m = {}; m[keys.L_LADE] = L.utf8Kuerzen(text, LTXT); senden(m, true);
}

function menueEnde() {                  // zurück ins Uhr-Menü
  ablauf = null;
  var m = {}; m[keys.L_TITEL] = ''; m[keys.L_ANZAHL] = -1;
  senden(m, true);
}

function schrittZeigen() {
  var s = ablauf.schritte[ablauf.schritte.length - 1];
  listeSenden(s.titel, s.eintraege.map(function (x) { return x.t; }));
}

function schritt(titel, eintraege, wahl) {
  ablauf.laedt = false;
  ablauf.schritte.push({ titel: titel, eintraege: eintraege, wahl: wahl });
  schrittZeigen();
}

// Rückruf nur, wenn der Ablauf inzwischen nicht verlassen oder zurückgeblättert wurde
function aktuell(cb) {
  var gen = ablauf.gen;
  return function () {
    if (!ablauf || ablauf.gen !== gen) return;
    try { cb.apply(null, arguments); } catch (e) { ausnahme(e); }
  };
}

function ausnahme(e) {                  // statt stillem Hängen: Fehler zeigen, Zurück führt zur vorigen Liste
  console.log('Menü: Ausnahme ' + e + (e && e.stack ? ' ' + e.stack : ''));
  if (ablauf) schritt(T('FEHLER', 'Fehler'), [{ t: T('ZURUECK', 'Zurück') }], function () { ablauf.schritte.pop(); schrittZeigen(); });
  else menueEnde();
}

function fehlerSchritt(f, nochmal) {
  var titel = f === 'kein Netz' ? T('KEIN NETZ', 'Kein Netz') : f === 'standort' ? T('KEIN STANDORT', 'Kein Standort') :
              f === 'leer' ? T('NICHTS GEFUNDEN', 'Nichts gefunden') : T('FEHLER', 'Fehler');
  console.log('Menü: ' + titel + ' (' + f + ')');
  schritt(titel, [{ t: T('NOCHMAL', 'Nochmal') }], function () { ablauf.schritte.pop(); nochmal(); });
}

function nameT(name, stadt) { return T(L.kurzname(name, stadt), L.klarname(name, stadt)); }
function mitM(name, m, stadt) {        // Entfernung hinten, Name notfalls gekürzt, damit sie sichtbar bleibt
  var hinten = m ? ' ' + m + T('M', ' m') : '';
  return L.utf8Kuerzen(nameT(name, stadt), LTXT - hinten.length) + hinten;
}
function vereinigen(a, b) {
  var m = {};
  (a || []).concat(b || []).forEach(function (x) { m[x] = 1; });
  return Object.keys(m).sort(L.sortDe);
}
function halt(x) { return { id: x.id, name: x.name, lat: x.lat, lon: x.lon }; }

// 1. Die 10 nächsten Haltestellen vom Handy-Standort
function schrittNah() {
  ladeSenden(T('STANDORT', 'Standort'), true);
  var weiter = aktuell(function (pos, f) {
    if (!pos) return fehlerSchritt('standort', schrittNah);
    ladeSenden(T('HALTESTELLEN', 'Haltestellen'), true);
    L.naechsteHaltestellen(pos.lat, pos.lon, NAH, aktuell(function (f2, liste) {
      if (f2) return fehlerSchritt(f2, schrittNah);
      if (!liste.length) return fehlerSchritt('leer', schrittNah);
      schritt(T('START', 'Start'), liste.map(function (h) { return { t: mitM(h.name, h.m, L.stadtVon(h.name)), h: h }; }), function (x) {
        ablauf.a = halt(x.h);
        schrittLinie();
      });
    }));
  });
  standort(weiter);
}

function standort(fertig) {
  var offen = true;
  function ende(p, f) { if (offen) { offen = false; fertig(p, f); } }
  setTimeout(function () { ende(null, 'keine Antwort'); }, 12000);
  if (typeof navigator === 'undefined' || !navigator.geolocation) return ende(null, 'nicht vorhanden');
  navigator.geolocation.getCurrentPosition(
    function (p) {
      console.log('Menü: Standort ' + p.coords.latitude.toFixed(2) + ',' + p.coords.longitude.toFixed(2));
      ende({ lat: p.coords.latitude, lon: p.coords.longitude });
    },
    function (e) { ende(null, e.message || ('Fehler ' + e.code)); },
    { timeout: 10000, maximumAge: 60000 });
}

// 2. Linien ab dieser Haltestelle, erster Eintrag ALLE LINIEN
function schrittLinie() {
  ladeSenden(T('FAHRTEN', 'Fahrten'), true);
  L.erreichbar(ablauf.a, aktuell(function (n, gesamt) { ladeSenden(T('FAHRTEN ', 'Fahrten ') + n + '/' + gesamt); }), aktuell(function (f, erg) {
    if (f) return fehlerSchritt(f, schrittLinie);
    var linien = Object.keys(erg.linien).sort(L.sortDe);
    if (!linien.length) return fehlerSchritt('leer', schrittLinie);
    ablauf.erg = erg;
    schritt(T('LINIE', 'Linie'), [{ t: T('ALLE LINIEN', 'Alle Linien'), l: '*' }].concat(linien.map(function (l) { return { t: T(L.ledText(l), l), l: l }; })), function (x) {
      ablauf.linie = x.l;
      schrittZiel();
    });
  }));
}

// 3. Ziele alphabetisch, nur Hinweg, je nach Linie gefiltert
function schrittZiel() {
  var stadt = L.stadtVon(ablauf.a.name), gesehen = {}, eintraege = [];
  L.zieleHin(ablauf.erg, ablauf.linie).forEach(function (z) {
    var t = nameT(z.name, stadt);
    if (gesehen[t]) return;
    gesehen[t] = true;
    eintraege.push({ t: t, z: z });
  });
  eintraege.sort(function (x, y) { return L.sortDe(x.t, y.t); });
  if (!eintraege.length) return fehlerSchritt('leer', schrittZiel);
  if (eintraege.length <= ZIEL_DIREKT) return zielListe(eintraege);
  var gruppen = {}, reihe = [];
  eintraege.forEach(function (x) {
    var k = L.ledText(x.t)[0] || '';           // Ä zählt als A
    if (!/[A-Z]/.test(k)) k = '0-9';
    if (!gruppen[k]) { gruppen[k] = []; reihe.push(k); }
    gruppen[k].push(x);
  });
  schritt(T('ZIEL A-Z', 'Ziel A-Z'), reihe.map(function (k) { return { t: k + ' (' + gruppen[k].length + ')', liste: gruppen[k] }; }), function (x) {
    zielListe(x.liste);
  });
}

function zielListe(eintraege) {
  schritt(T('ZIEL', 'Ziel'), eintraege.slice(0, MAXL), function (x) {
    var z = x.z;
    ablauf.b = { id: z.id, name: z.name, lat: z.lat, lon: z.lon };
    ablauf.extra = { linien: Object.keys(z.linien), hin: z.hin, rueck: z.rueck };
    schrittPruefen();
  });
}

function nurLinie(liste) {              // gewählte Linie aus Schritt 2 (oder alle)
  var l = ablauf.linie;
  return (!l || l === '*') ? liste : liste.filter(function (x) { return x === l; });
}

// 4. Hinweg-Linien und Direktverbindung vom Ziel zurück prüfen
function schrittPruefen() {
  ladeSenden(T('PRUEFE', 'Prüfe'), true);
  var a = ablauf.a, b = ablauf.b, ex = ablauf.extra, offen = 2, hin = null, rueck = null, fehler = null;
  var fertig = aktuell(function () {
    if (--offen) return;
    if (fehler) return fehlerSchritt(fehler, schrittPruefen);
    ablauf.hin = vereinigen(hin, ex.hin ? ex.linien : []);
    var zurueck = nurLinie(vereinigen(rueck, ex.rueck ? ex.linien : []));
    if (!zurueck.length) return schrittRueck(true);
    schritt(T('ZURUECK AB ZIEL?', 'Zurück ab Ziel?'), [{ t: T('JA', 'Ja'), ja: true }, { t: T('NEIN', 'Nein') }], function (x) {
      if (x.ja) { var c = halt(b); c.linien = zurueck; return speichern(c); }
      schrittRueck(true);
    });
  });
  L.direkt(a.id, b.id, function (f, l) { if (f) fehler = f; else hin = l; fertig(); });
  L.direkt(b.id, a.id, function (f, l) { if (f) fehler = f; else rueck = l; fertig(); });
}

// 5. Rückfahrt-Haltestellen bis 2 km um das Ziel, nach Entfernung, nur mit Direktverbindung zum Start.
//    ohneZiel: das Ziel selbst nicht anbieten (dort wurde "nein" gesagt oder es fährt nichts zurück).
function schrittRueck(ohneZiel) {
  ladeSenden(T('SUCHE', 'Suche'), true);
  var a = ablauf.a, b = ablauf.b;
  L.rueckSuchen(a, b, ablauf.extra, aktuell(function (n, gesamt) { ladeSenden(T('SUCHE ', 'Suche ') + n + '/' + gesamt); }), aktuell(function (f, liste) {
    if (f) return fehlerSchritt(f, function () { schrittRueck(ohneZiel); });
    liste = liste.filter(function (k) { return !(ohneZiel && k.m === 0); });
    var erlaubt = (ablauf.linie && ablauf.linie !== '*') ? [ablauf.linie] : ablauf.erlaubt;
    if (erlaubt) {                       // Haltestellen mit der gewählten Linie bevorzugen, sonst alle
      var passend = liste.filter(function (k) { return k.linien.some(function (l) { return erlaubt.indexOf(l) >= 0; }); });
      if (passend.length) liste = passend;
    }
    var stadt = L.stadtVon(a.name);
    var eintraege = liste.map(function (k) {
      return { t: k.m ? mitM(k.name, k.m, stadt) : nameT(k.name, stadt) + T(' (ZIEL)', ' (Ziel)'), k: k };
    });
    if (!eintraege.length) eintraege = [{ t: T('OHNE RUECKFAHRT', 'Ohne Rückfahrt') }];
    schritt(T('RUECKFAHRT AB', 'Rückfahrt ab'), eintraege, function (x) {
      if (!x.k) return speichern(null);
      var c = halt(x.k); c.linien = x.k.linien;
      speichern(c);
    });
  }));
}

// 6. Strecke speichern, Kurznamen automatisch, Seite anzeigen
function speichern(c) {
  var liste = strecken(), stadt = L.stadtVon(ablauf.a.name), st, i = ablauf.ziel;
  function mitKurz(h) { return h && { id: h.id, name: h.name, kurz: L.kurzname(h.name, stadt), lat: h.lat, lon: h.lon }; }
  if (ablauf.nurRueck) {                 // Fahrt ändern -> Rückfahrt: nur c ersetzen
    st = liste[i];
    if (!st) return menueEnde();
    var cl = c ? c.linien : [];
    st.c = mitKurz(c);
    st.ohneRueck = !c;
    if (st.alle) st.linien = vereinigen(st.linien, cl);
    else if (c && !cl.some(function (l) { return st.linien.indexOf(l) >= 0; })) st.linien = vereinigen(st.linien, cl);
  } else {
    var l = ablauf.linie, cl2 = c ? c.linien : [];
    st = { a: { id: ablauf.a.id, name: ablauf.a.name, kurz: L.kurzname(ablauf.a.name, L.stadtVon(ablauf.a.name)), lat: ablauf.a.lat, lon: ablauf.a.lon },
           b: mitKurz(ablauf.b), c: mitKurz(c), ohneRueck: !c };
    if (l && l !== '*') {
      st.alle = false;
      st.linien = (c && cl2.indexOf(l) < 0) ? vereinigen([l], cl2) : [l];
    } else {
      st.alle = true;
      st.linien = vereinigen(ablauf.hin, cl2);
    }
    if (i >= 0 && i < liste.length) liste[i] = st;
    else { if (liste.length >= MAXS) return menueEnde(); liste.push(st); i = liste.length - 1; }
  }
  localStorage.setItem('strecken', JSON.stringify(liste));
  localStorage.setItem('seite', String(i));
  console.log('Menü: Strecke ' + (i + 1) + ' gespeichert: ' + st.a.kurz + ' -> ' + st.b.kurz + ', zurück ab ' + (st.c ? st.c.kurz : '-') + ' [' + st.linien.join(',') + (st.alle ? ' alle' : '') + ']');
  ablauf = null;
  einrichtungSenden();                   // Uhr schließt das Menü, sobald die Einrichtung ankommt
  streckeLaden(i);
}

function loeschen(i) {
  var liste = strecken();
  ablauf = null;
  if (i >= 0 && i < liste.length) liste.splice(i, 1);
  localStorage.setItem('strecken', JSON.stringify(liste));
  localStorage.setItem('seite', String(Math.max(0, Math.min(i, liste.length - 1))));
  console.log('Menü: Strecke ' + (i + 1) + ' gelöscht, ' + liste.length + ' übrig');
  einrichtungSenden();
  if (liste.length) streckeLaden(aktiveSeite());
}

// Zielkoordinaten für ältere Einrichtungen ohne lat/lon nachholen
function koordinaten(h, fertig) {
  if (h.lat !== undefined) return fertig(null);
  transitousHolen('v1/geocode?type=STOP&text=' + encodeURIComponent(h.name), function (f, d) {
    var t = !f && (d || []).filter(function (x) { return x.type === 'STOP'; })[0];
    if (!t) return fertig(f || 'leer');
    h.lat = t.lat; h.lon = t.lon; fertig(null);
  });
}

function menueAktion(aktion, wahl) {
  try { menueAktion2(aktion, wahl); } catch (e) { ausnahme(e); }
}

function menueAktion2(aktion, wahl) {
  console.log('Menü: Aktion ' + aktion + ' Wahl ' + wahl);
  if (aktion === A_LOESCHEN) return loeschen(wahl);
  if (aktion === A_LAYOUT) {             // an der Uhr umgeschaltet: merken, damit Seite und Listen passen
    localStorage.setItem('layout', wahl === 1 ? 'klar' : 'led');
    console.log('Menü: Ansicht ' + layout());
    return;
  }
  if (aktion === A_NEU || aktion === A_AENDERN_START) {
    ablauf = { ziel: aktion === A_NEU ? -1 : wahl, schritte: [], gen: 0, laedt: true };
    return schrittNah();
  }
  if (aktion === A_AENDERN_RUECK) {
    var st = strecken()[wahl];
    if (!st) return menueEnde();
    ablauf = { ziel: wahl, nurRueck: true, schritte: [], gen: 0, laedt: true, a: halt(st.a), b: halt(st.b),
               extra: null, erlaubt: st.alle ? null : st.linien };
    return koordinaten(ablauf.b, aktuell(function (f) {
      if (f) return fehlerSchritt(f, function () { menueAktion2(A_AENDERN_RUECK, wahl); });
      schrittRueck(false);
    }));
  }
  if (!ablauf) return menueEnde();
  if (aktion === A_ZURUECK) {
    ablauf.gen++;                        // laufende Abfragen verwerfen
    if (ablauf.laedt && ablauf.schritte.length) { ablauf.laedt = false; return schrittZeigen(); }   // Laden abbrechen
    ablauf.schritte.pop();
    if (!ablauf.schritte.length) return menueEnde();
    return schrittZeigen();
  }
  if (aktion === A_WAHL) {
    var s = ablauf.schritte[ablauf.schritte.length - 1];
    if (!s || !s.eintraege[wahl]) return schrittZeigen();
    ablauf.gen++;
    ablauf.laedt = true;                 // bis der nächste Schritt steht: Zurück bricht nur das Laden ab
    s.wahl(s.eintraege[wahl]);
  }
}

// ---------- Einstellungen: eingebettete Seite ----------
function seiteOeffnen(standort, standortFehler) {
  var zustand = { strecken: strecken(), standort: standort, standortFehler: standortFehler, schrift: SCHRIFT.F35,
                  rmvKey: rmvSchluessel(), layout: layout() };
  var html = SEITE_HTML.replace('/*ZUSTAND*/null', function () { return JSON.stringify(zustand); });
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

Pebble.addEventListener('showConfiguration', function () {
  // Standort hier holen: die Seite selbst darf es nicht (Android: nur sichere Herkunft)
  var offen = true;
  function weiter(s, f) { if (offen) { offen = false; seiteOeffnen(s, f); } }
  setTimeout(function () { weiter(null, 'keine Antwort in 4 s'); }, 4000);
  if (!navigator.geolocation) return weiter(null, 'nicht vorhanden');
  navigator.geolocation.getCurrentPosition(
    function (p) { weiter({ lat: p.coords.latitude, lon: p.coords.longitude }, null); },
    function (e) { weiter(null, e.message || ('Fehler ' + e.code)); },
    { timeout: 3500, maximumAge: 600000 });
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) return;
  try {
    var daten = JSON.parse(decodeURIComponent(e.response));
    if (!daten.strecken) return;                      // Abbrechen
    if (daten.rmvKey !== undefined) localStorage.setItem('rmvKey', String(daten.rmvKey).trim());
    if (daten.layout === 'klar' || daten.layout === 'led') localStorage.setItem('layout', daten.layout);
    ablauf = null;
    localStorage.setItem('strecken', JSON.stringify(daten.strecken.slice(0, MAXS)));
    localStorage.setItem('seite', '0');
    einrichtungSenden();
    if (daten.strecken.length) streckeLaden(0);
  } catch (err) {
    console.log('Antwort der Seite unlesbar: ' + err);
  }
});

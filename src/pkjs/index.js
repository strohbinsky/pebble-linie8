// Linie 8 — Handy-Teil (PebbleKit JS).
// Hält bis zu 8 Strecken (Haltestellenpaare), lädt beim Öffnen und Blättern die nächsten Fahrten
// und schickt Abfahrtszeiten (Unix-Sekunden, UTC) und Linien an die Uhr.
//
// Datenquelle: RMV (HAFAS ReST), wenn in den Einstellungen ein Schlüssel hinterlegt ist, sonst oder bei
// Fehler Transitous (MOTIS, nur Sollfahrplan). In beiden Fällen Verbindungssuche Start -> Ziel ohne Umstieg:
// liefert genau die Fahrten, die an BEIDEN Haltestellen halten — damit sind geteilte Linien erledigt.
//
// Uhr-Menü (Version 0.30): Strecken direkt an der Uhr anlegen, ändern, löschen. Der Ablauf ist ein
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

function holen(von, nach, linien, fertig, max) {   // max: so viele Fahrten (Standard MAXD, Bezugssuche mehr)
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
  try { xhr.setRequestHeader('User-Agent', 'pebble-linie8/0.41 (privat)'); } catch (e) {}
  xhr.onload = function () {
    if (xhr.status !== 200) { console.log('HTTP ' + xhr.status); return ende(STATUS_FEHLER); }
    try {
      var daten = JSON.parse(xhr.responseText), liste = [], live = false, gesehen = {};
      (daten.itineraries || []).forEach(function (it) {
        var fahrten = it.legs.filter(function (l) { return l.mode !== 'WALK'; });
        if (fahrten.length !== 1 || !L.oepnv(fahrten[0])) return;   // keine Mitfahrbörse
        var f = fahrten[0];
        if (linien && linien.length && linien.indexOf(f.routeShortName) < 0) return;
        var t = Math.floor(Date.parse(f.startTime) / 1000), k = t + '|' + f.routeShortName;
        if (gesehen[k]) return;
        gesehen[k] = true;
        // Fahrtdauer bis zum Ziel in Minuten (Transitous: nur Fahrplan)
        var an = Math.floor(Date.parse(f.endTime) / 1000), dauer = an > t ? Math.round((an - t) / 60) : 0;
        liste.push({ t: t, l: linienKurz(f.routeShortName), d: 0, s: steigText(f.from && (f.from.track || f.from.scheduledTrack)), f: dauer });
        live = live || !!f.realTime;
      });
      liste.sort(function (a, b) { return a.t - b.t; });
      ende(null, { fahrten: liste.slice(0, max || MAXD), live: live });
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

function holenRmv(von, nach, linien, fertig, max) {
  rmvKennung(von, function (f1, a) {
    if (f1 !== null) return fertig(f1);
    rmvKennung(nach, function (f2, b) {
      if (f2 !== null) return fertig(f2);
      // Linie gleich bei RMV filtern: ohne Filter sind die 6 Fahrten an großen Haltestellen oft fremde Linien,
      // die gewählte fehlt dann ganz (Hbf -> CongressCenter: 1 von 6 ist eine 4). Unbekannte Linie -> HTTP 400 -> Fehler.
      var filter = (linien && linien.length) ? '&lines=' + encodeURIComponent(linien.join(',')) : '';
      rmvGet('trip?maxChange=0&numF=6' + filter + '&originExtId=' + encodeURIComponent(a) + '&destExtId=' + encodeURIComponent(b), function (f, d) {
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
            // Fahrtdauer bis zum Ziel: Ankunft minus Abfahrt, beide mit Echtzeit, wo vorhanden
            var z = l.Destination || {}, dauer = 0;
            if (z.time) {
              var an = z.rtTime ? deZuUtc(z.rtDate || z.date, z.rtTime) : deZuUtc(z.date, z.time);
              if (an > t) dauer = Math.round((an - t) / 60);
            }
            liste.push({ t: t, l: linienKurz(name), d: d, s: steigText(steig), f: dauer });
            live = live || rt;
          });
          liste.sort(function (x, y) { return x.t - y.t; });
          fertig(null, { fahrten: liste.slice(0, max || MAXD), live: live });
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
// Rückfahrt endet an d (bewusst gewählter Ausstieg im Umkreis um A, seit 0.33); ohne d genau am Start a.
function rueckZiel(st) { return st.d || st.a; }
// Linienfilter je Richtung: linienHin / linienRueck (seit 0.39, aus „Schnellere Abfahrt > Übernehmen“) vor dem
// gemeinsamen Filter linien; alle = kein Filter. Die Einstellungsseite kennt nur linien und lässt die beiden beim Ändern weg.
function linienFuer(st, rueck) {
  var o = rueck ? st.linienRueck : st.linienHin;
  if (o && o.length) return o;
  return st.alle ? null : st.linien;
}

// Umkreis um den Start für die Rückfahrt-Suche: 500 / 1000 / 2000 m, Standard 1000. Uhr-Menü und Seite.
function umkreis() {
  var u = parseInt(localStorage.getItem('umkreis'), 10);
  return L.UMKREISE.indexOf(u) >= 0 ? u : 1000;
}
function umkreisText(m) { return m >= 1000 ? (m / 1000) + T('KM', ' km') : m + T('M', ' m'); }

// Ansicht: 'led' (Standard), 'klar' oder 'phosphor'. Einstellbar am Handy (Seite) und an der Uhr (Menü Einstellungen).
// Phosphor nutzt die LED-Texte (Großbuchstaben ohne Umlaute), nur Klar die normale Schreibweise.
var LAYOUTS = ['led', 'klar', 'phosphor'];   // Index = LAYOUT/WAHL an der Uhr
function layout() { var v = localStorage.getItem('layout'); return LAYOUTS.indexOf(v) >= 0 ? v : 'led'; }
function T(led, klar) { return layout() === 'klar' ? klar : led; }   // Text je nach Ansicht

// Quelle der Abfahrten (seit 0.35): 'auto' (Standard: RMV mit Schlüssel, bei Fehler Transitous), 'rmv' (nur RMV,
// Fehler bleibt Fehler — auch ohne Schlüssel), 'trans' (nur Transitous). Einstellbar an Seite und Uhr.
var QUELLEN = ['auto', 'rmv', 'trans'];   // Index = QUELLWAHL/WAHL an der Uhr
function quelle() { var v = localStorage.getItem('quelle'); return QUELLEN.indexOf(v) >= 0 ? v : 'auto'; }

// Anzeige der Abfahrten (seit 0.35), umgesetzt auf der Uhr — das Handy merkt sich die Werte nur für Seite und Einrichtung.
// abfahrt: 'plan' (Standard, Fahrplanzeit + Verspätung als +2') oder 'aktuell' (Zeit mit Verspätung). dauer: 'an' (Standard) / 'aus'.
function abfahrt() { return localStorage.getItem('abfahrt') === 'aktuell' ? 'aktuell' : 'plan'; }
function dauer() { return localStorage.getItem('dauer') === 'aus' ? 'aus' : 'an'; }

function einrichtungSenden() {
  var liste = strecken(), msg = {};
  msg[keys.ANZAHL] = liste.length;
  msg[keys.SEITE] = aktiveSeite();
  msg[keys.LAYOUT] = LAYOUTS.indexOf(layout());
  msg[keys.UMKREIS] = umkreis();
  msg[keys.QUELLWAHL] = QUELLEN.indexOf(quelle());
  msg[keys.ABFAHRT] = abfahrt() === 'aktuell' ? 1 : 0;
  msg[keys.DAUER] = dauer() === 'an' ? 1 : 0;
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
  var msg = {}, offen = 2, fehler = null, live = true;
  function eintragen(t, l, v, st, fd, erg) {
    for (var j = 0; j < MAXD; j++) {
      var f = erg.fahrten[j];
      msg[t + j] = f ? f.t : 0;
      msg[l + j] = f ? f.l : '';
      msg[v + j] = f ? f.d : 0;
      msg[st + j] = f ? (f.s || '') : '';
      msg[fd + j] = f ? (f.f || 0) : 0;
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
  function abfrage(von, nach, rueck, cb) {
    var linien = linienFuer(st, rueck);
    if (quelle === 'RMV') holenRmv(von, nach, linien, cb); else holen(von.id, nach.id, linien, cb);
  }
  abfrage(st.a, st.b, false, function (f, erg) {
    if (f !== null) fehler = f; else eintragen(keys.HIN, keys.HIN_L, keys.HIN_D, keys.HIN_S, keys.HIN_F, erg);
    eins();
  });
  var c = rueckStart(st);
  if (!c) { eintragen(keys.RUECK, keys.RUECK_L, keys.RUECK_D, keys.RUECK_S, keys.RUECK_F, { fahrten: [], live: true }); eins(); return; }
  abfrage(c, rueckZiel(st), true, function (f, erg) {
    if (f !== null) fehler = f; else eintragen(keys.RUECK, keys.RUECK_L, keys.RUECK_D, keys.RUECK_S, keys.RUECK_F, erg);
    eins();
  });
}

// Auto: RMV, wenn ein Schlüssel hinterlegt ist; schlägt RMV fehl, die ganze Strecke aus Transitous.
// Nur RMV / nur Transitous: kein Wechsel, ein Fehler wird als Fehler gezeigt.
// Jeder Aufruf macht den vorigen ungültig (ladeNr): wird während einer Abfrage die Quelle oder Seite gewechselt,
// darf die alte Antwort nicht mehr an die Uhr — sonst zeigt sie RMV, obwohl gerade Transitous gewählt wurde.
var ladeNr = 0;
function streckeLaden(i) {
  var st = strecken()[i];
  if (!st) return;
  var nr = ++ladeNr;
  function senden2(msg, quelle) {
    if (nr !== ladeNr) { console.log('Abfrage ' + nr + ' (' + quelle + ') veraltet, verworfen'); return; }
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
  function fehlerRmv(fehler) { var m = {}; m[keys.STATUS] = fehler; senden2(m, 'RMV'); }
  var q = quelle();
  if (q === 'trans' || (q === 'auto' && !rmvSchluessel())) return transitous();
  if (!rmvSchluessel()) { console.log('Quelle nur RMV, aber kein Schlüssel'); return fehlerRmv(STATUS_FEHLER); }
  richtungenLaden(st, 'RMV', function (msg, fehler) {
    if (msg) return senden2(msg, 'RMV');
    if (q === 'rmv') { console.log('RMV fehlgeschlagen (' + fehler + '), Quelle nur RMV'); return fehlerRmv(fehler); }
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
var A_NEU = 1, A_AENDERN_RUECK = 2, A_AENDERN_START = 3, A_LOESCHEN = 4, A_WAHL = 5, A_ZURUECK = 6, A_LAYOUT = 7, A_UMKREIS = 8, A_QUELLE = 9, A_ABFAHRT = 10, A_DAUER = 11, A_SCHNELL_HIN = 12, A_SCHNELL_RUECK = 13;
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
  try { xhr.setRequestHeader('User-Agent', 'pebble-linie8/0.41 (privat)'); } catch (e) {}
  xhr.onload = function () {
    if (xhr.status !== 200) return ende('HTTP ' + xhr.status);
    try { ende(null, JSON.parse(xhr.responseText)); } catch (e) { ende('Antwort unlesbar'); }
  };
  xhr.onerror = function () { ende('kein Netz'); };
  setTimeout(function () { ende('kein Netz'); }, 30000);   // Transitous bremst bei vielen Abfragen bis ~12 s
  xhr.send();
}
var L = Logik(transitousHolen, SCHRIFT.F35);

var ablauf = null;     // laufender Menü-Ablauf: { ziel, nurRueck, schritte[], a, linie, erg, b, extra, hin, genau, gen }

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

function menueEnde(anzeige) {           // zurück ins Uhr-Menü; anzeige: gleich zur Anzeige der Abfahrten (L_ANZAHL -2)
  ablauf = null;
  var m = {}; m[keys.L_TITEL] = ''; m[keys.L_ANZAHL] = anzeige ? -2 : -1;
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
function mitZusatz(name, zusatz, stadt) {   // "(ZIEL)" / "(START)" hinten, Name notfalls gekürzt
  return L.utf8Kuerzen(nameT(name, stadt), LTXT - zusatz.length) + zusatz;
}
function vereinigen(a, b) {
  var m = {};
  (a || []).concat(b || []).forEach(function (x) { m[x] = 1; });
  return Object.keys(m).sort(L.sortDe);
}
function halt(x) { return { id: x.id, name: x.name, lat: x.lat, lon: x.lon }; }

// 1. Die 10 nächsten Haltestellen vom Handy-Standort. Oben (seit 0.37) "IM UMKREIS 1KM": alle Haltestellen im Umkreis
//    aus den Einstellungen gelten als Start — jede Linie dort, jedes Ziel, das sie anfahren. Die Start-Haltestelle
//    wählt man erst nach dem Ziel (Schritt 3b). Hilft, wo man sich nicht auskennt.
function schrittNah() {
  ladeSenden(T('STANDORT', 'Standort'), true);
  var weiter = aktuell(function (pos, f) {
    if (!pos) return fehlerSchritt('standort', schrittNah);
    ladeSenden(T('HALTESTELLEN', 'Haltestellen'), true);
    L.naechsteHaltestellen(pos.lat, pos.lon, NAH, aktuell(function (f2, liste) {
      if (f2) return fehlerSchritt(f2, schrittNah);
      if (!liste.length) return fehlerSchritt('leer', schrittNah);
      var r = umkreis(), eintraege = [{ t: T('IM UMKREIS ', 'Im Umkreis ') + umkreisText(r), um: { lat: pos.lat, lon: pos.lon, r: r, stadt: liste[0].name } }];
      schritt(T('START', 'Start'), eintraege.concat(liste.map(function (h) { return { t: mitM(h.name, h.m, L.stadtVon(h.name)), h: h }; })), function (x) {
        if (x.um) { ablauf.um = x.um; ablauf.a = null; return schrittLinie(); }
        ablauf.um = null;
        ablauf.a = halt(x.h);
        vorladen(ablauf.a);                // Rückfahrt-Daten laden, während Linie und Ziel gewählt werden
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
  var um = ablauf.um, fortschritt = aktuell(function (n, gesamt) { ladeSenden(T('FAHRTEN ', 'Fahrten ') + n + '/' + gesamt); });
  function holenL(cb) { if (um) L.erreichbarUm(um.lat, um.lon, um.r, cb); else L.erreichbar(ablauf.a, fortschritt, cb); }
  holenL(aktuell(function (f, erg) {
    if (f) return fehlerSchritt(f, schrittLinie);
    var linien = Object.keys(erg.linien).sort(L.sortDe);
    if (!linien.length) return fehlerSchritt('leer', schrittLinie);
    ablauf.erg = erg;
    schritt(T('LINIE', 'Linie'), [{ t: T('ALLE LINIEN', 'Alle Linien'), l: '*' }].concat(linien.map(function (l) { return { t: T(L.ledText(l), l), l: l }; })), function (x) {
      ablauf.linie = x.l;
      if (x.l === '*') return schrittZiel();
      schrittRichtung();
    });
  }));
}

// 2b. Richtung der gewählten Linie (seit 0.35): je Endhalt eine, bei verschiedenen Wegen "EIGENHEIM UEBER DAMBACHTAL".
//     Danach die Ziele in Fahrtreihenfolge. Nur eine Richtung: gleich deren Ziele. Keine: wie bisher alphabetisch.
function schrittRichtung() {
  var stadt = startStadt(), r = L.richtungen(ablauf.erg, ablauf.linie);
  if (!r.length) return schrittZiel();
  if (r.length === 1) return zielListe(zieleInFolge(r[0]));
  var eintraege = r.map(function (x) {
    var led = L.kurzname(x.endhalt, stadt) + (x.ueber ? ' UEBER ' + L.kurzname(x.ueber, stadt) : '');
    var klar = L.klarname(x.endhalt, stadt) + (x.ueber ? ' über ' + L.klarname(x.ueber, stadt) : '');
    return { t: T(led, klar), r: x };
  });
  eintraege.push({ t: T('ALLE HALTE A-Z', 'Alle Halte A-Z'), alle: true });
  schritt(T('RICHTUNG', 'Richtung'), eintraege, function (x) {
    if (x.alle) return schrittZiel();
    zielListe(zieleInFolge(x.r));
  });
}

function startStadt() { return L.stadtVon(ablauf.a ? ablauf.a.name : ablauf.um.stadt); }   // im Umkreis: Stadt der nächsten Haltestelle

function zieleInFolge(richtung) {       // Ziele einer Richtung, nächster Halt zuerst
  var stadt = startStadt(), gesehen = {}, eintraege = [];
  richtung.ziele.forEach(function (z) {
    var t = nameT(z.name, stadt);
    if (gesehen[t]) return;
    gesehen[t] = true;
    eintraege.push({ t: t, z: z });
  });
  return eintraege;
}

// 3. Ziele alphabetisch, nur Hinweg, je nach Linie gefiltert
function schrittZiel() {
  var stadt = startStadt(), gesehen = {}, eintraege = [];
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
    ablauf.genau = null;                 // Rückfahrt-Kandidaten hängen an A und B: nach Zurück und neuer Wahl neu rechnen
    if (ablauf.um) return schrittEinstiegHin(z);
    ablauf.extra = { linien: Object.keys(z.linien), hin: z.hin, rueck: z.rueck };
    schrittPruefen();
  });
}

// 3b. Nur nach "IM UMKREIS": Start-Haltestelle im Umkreis, von der es direkt zum Ziel geht (mit der gewählten Linie),
//     nächste zuerst. Immer als eigener Schritt, auch bei nur einem Eintrag — man sieht, wohin man gehen muss.
function schrittEinstiegHin(z) {
  var stadt = startStadt(), liste = L.einstiegeUm(z, ablauf.linie);
  if (!liste.length) return fehlerSchritt('leer', function () { schrittEinstiegHin(z); });
  schritt(T('EINSTIEG', 'Einstieg'), liste.map(function (e) { return { t: mitM(e.name, e.m, stadt), e: e }; }), function (x) {
    ablauf.a = halt(x.e);
    ablauf.genau = null;
    ablauf.extra = { linien: nurLinie(x.e.linien), hin: true, rueck: false };
    vorladen(ablauf.a);
    schrittPruefen();
  });
}

function nurLinie(liste) {              // gewählte Linie aus Schritt 2 (oder alle)
  var l = ablauf.linie;
  return (!l || l === '*') ? liste : liste.filter(function (x) { return x === l; });
}

// Rückfahrt (seit 0.33). Grundsatz: Ankunft genau am Start A ist der Normalfall; der Umkreis um A gilt nur,
// wenn er bewusst gewählt wird — nie automatisch. Gespeichert und abgefragt wird immer genau c -> d (ohne d: A).
// Daten: Fahrten, die an A (bzw. im Umkreis) ankommen — L.ankunftUm, vorgeladen sobald A feststeht.
function vorladen(a) {
  if (a.lat === undefined) return;
  L.ankunftUm(a, L.GENAU_R, null, function () { L.ankunftUm(a, umkreis(), null, function () {}); });
}

function bevorzugt(liste) {             // Einträge mit der gewählten Linie bevorzugen, sonst alle
  var erlaubt = (ablauf.linie && ablauf.linie !== '*') ? [ablauf.linie] : ablauf.erlaubt;
  if (!erlaubt) return liste;
  var passend = liste.filter(function (k) { return k.linien.some(function (l) { return erlaubt.indexOf(l) >= 0; }); });
  return passend.length ? passend : liste;
}

function einstiegText(k, stadt) {
  return k.ziel ? mitZusatz(k.name, T(' (ZIEL)', ' (Ziel)'), stadt) : mitM(k.name, k.m, stadt);
}

function genauLaden(weiter) {           // Kandidaten mit Ankunft genau an A, einmal je Ablauf
  if (ablauf.genau) return weiter(null);
  L.ankunftUm(ablauf.a, L.GENAU_R, aktuell(function (n, g) { ladeSenden(T('SUCHE ', 'Suche ') + n + '/' + g); }), aktuell(function (f, fahrten) {
    if (!f) ablauf.genau = L.rueckKandidaten(fahrten, ablauf.a, ablauf.b, 0);
    weiter(f);
  }));
}

// 4. Hinweg-Linien prüfen; fährt vom Ziel etwas genau nach A zurück: Frage "Zurück ab Ziel?"
function schrittPruefen() {
  ladeSenden(T('PRUEFE', 'Prüfe'), true);
  var a = ablauf.a, b = ablauf.b, ex = ablauf.extra, offen = 2, hin = null, fehler = null;
  var fertig = aktuell(function () {
    if (--offen) return;
    if (fehler) return fehlerSchritt(fehler, schrittPruefen);
    ablauf.hin = vereinigen(hin, ex.hin ? ex.linien : []);
    var amZiel = ablauf.genau.filter(function (k) { return k.ziel; })[0];
    var zurueck = amZiel ? nurLinie(amZiel.linien) : [];
    if (!zurueck.length) return schrittRueck(true);
    schritt(T('ZURUECK AB ZIEL?', 'Zurück ab Ziel?'), [{ t: T('JA', 'Ja'), ja: true }, { t: T('NEIN', 'Nein') }], function (x) {
      if (x.ja) { var c = halt(b); c.linien = zurueck; return speichern(c, null); }
      schrittRueck(true);
    });
  });
  L.direkt(a.id, b.id, function (f, l) { if (f) fehler = f; else hin = l; fertig(); });
  genauLaden(function (f) { if (f) fehler = f; fertig(); });
}

// 5. Einstieg bis 2 km um das Ziel, nur mit Direktverbindung genau nach A. Darunter: Umkreis, ohne Rückfahrt.
//    ohneZiel: das Ziel selbst nicht anbieten (dort wurde "nein" gesagt oder es fährt nichts zurück).
function schrittRueck(ohneZiel) {
  ladeSenden(T('SUCHE', 'Suche'), true);
  genauLaden(function (f) {
    if (f) return fehlerSchritt(f, function () { schrittRueck(ohneZiel); });
    var stadt = L.stadtVon(ablauf.a.name), r = umkreis();
    var liste = bevorzugt(ablauf.genau.filter(function (k) { return !(ohneZiel && k.ziel); }));
    var eintraege = liste.map(function (k) { return { t: einstiegText(k, stadt), k: k }; });
    var titel = eintraege.length ? T('RUECKFAHRT AB', 'Rückfahrt ab') : T('NICHTS NACH ', 'Nichts nach ') + nameT(ablauf.a.name, stadt);
    eintraege.push({ t: T('UMKREIS ', 'Umkreis ') + umkreisText(r), umkreis: r });
    eintraege.push({ t: T('OHNE RUECKFAHRT', 'Ohne Rückfahrt'), ohne: true });
    schritt(titel, eintraege, function (x) {
      if (x.ohne) return speichern(null, null);
      if (x.umkreis) return schrittEinstieg(x.umkreis);
      var c = halt(x.k); c.linien = x.k.linien;
      speichern(c, null);
    });
  });
}

// 5b. Nur nach bewusster Wahl: Einstieg mit Ankunft im Umkreis r um A. Leer: größeren Umkreis anbieten.
function schrittEinstieg(r) {
  ladeSenden(T('SUCHE', 'Suche'), true);
  var a = ablauf.a, b = ablauf.b, stadt = L.stadtVon(a.name);
  L.ankunftUm(a, r, aktuell(function (n, g) { ladeSenden(T('SUCHE ', 'Suche ') + n + '/' + g); }), aktuell(function (f, fahrten) {
    if (f) return fehlerSchritt(f, function () { schrittEinstieg(r); });
    var eintraege = bevorzugt(L.rueckKandidaten(fahrten, a, b, r)).map(function (k) { return { t: einstiegText(k, stadt), k: k }; });
    var titel = T('EINSTIEG ', 'Einstieg ') + umkreisText(r);
    if (!eintraege.length) {
      titel = T('NICHTS IM UMKREIS', 'Nichts im Umkreis');
      var groesser = L.UMKREISE.filter(function (u) { return u > r; })[0];
      if (groesser) eintraege.push({ t: T('UMKREIS ', 'Umkreis ') + umkreisText(groesser), umkreis: groesser });
      eintraege.push({ t: T('OHNE RUECKFAHRT', 'Ohne Rückfahrt'), ohne: true });
    }
    schritt(titel, eintraege, function (x) {
      if (x.ohne) return speichern(null, null);
      if (x.umkreis) return schrittEinstieg(x.umkreis);
      schrittAusstieg(x.k);
    });
  }));
}

// 5c. Ausstieg selbst wählen, immer mit Bestätigung: A zuerst, sonst nach Entfernung zu A
function schrittAusstieg(k) {
  var stadt = L.stadtVon(ablauf.a.name);
  var eintraege = bevorzugt(k.ziele).map(function (z) {
    return { t: z.start ? mitZusatz(z.name, T(' (START)', ' (Start)'), stadt) : mitM(z.name, z.m, stadt), z: z };
  });
  schritt(T('AUSSTIEG', 'Ausstieg'), eintraege, function (x) {
    var c = halt(k); c.linien = x.z.linien;
    speichern(c, x.z.start ? null : halt(x.z));
  });
}

// 6. Strecke speichern, Kurznamen automatisch, Seite anzeigen
function speichern(c, d) {
  var liste = strecken(), stadt = L.stadtVon(ablauf.a.name), st, i = ablauf.ziel;
  function mitKurz(h) { return h && { id: h.id, name: h.name, kurz: L.kurzname(h.name, stadt), lat: h.lat, lon: h.lon }; }
  if (ablauf.nurRueck) {                 // Fahrt ändern -> Rückfahrt: nur c ersetzen
    st = liste[i];
    if (!st) return menueEnde();
    var cl = c ? c.linien : [];
    st.c = mitKurz(c);
    if (c && d) st.d = mitKurz(d); else delete st.d;
    st.ohneRueck = !c;
    delete st.linienRueck;               // neue Rückfahrt: wieder der gemeinsame Filter
    if (st.alle) st.linien = vereinigen(st.linien, cl);
    else if (c && !cl.some(function (l) { return st.linien.indexOf(l) >= 0; })) st.linien = vereinigen(st.linien, cl);
  } else {
    var l = ablauf.linie, cl2 = c ? c.linien : [];
    st = { a: { id: ablauf.a.id, name: ablauf.a.name, kurz: L.kurzname(ablauf.a.name, L.stadtVon(ablauf.a.name)), lat: ablauf.a.lat, lon: ablauf.a.lon },
           b: mitKurz(ablauf.b), c: mitKurz(c), ohneRueck: !c };
    if (c && d) st.d = mitKurz(d);
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
  console.log('Menü: Strecke ' + (i + 1) + ' gespeichert: ' + st.a.kurz + ' -> ' + st.b.kurz + ', zurück ab ' + (st.c ? st.c.kurz : '-') + (st.d ? ' nach ' + st.d.kurz : '') + ' [' + st.linien.join(',') + (st.alle ? ' alle' : '') + ']');
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
    localStorage.setItem('layout', LAYOUTS[wahl] || 'led');
    console.log('Menü: Ansicht ' + layout());
    return;
  }
  if (aktion === A_UMKREIS) {            // an der Uhr gewählt (Meter)
    if (L.UMKREISE.indexOf(wahl) >= 0) localStorage.setItem('umkreis', String(wahl));
    console.log('Menü: Umkreis ' + umkreis());
    return;
  }
  if (aktion === A_ABFAHRT || aktion === A_DAUER) {   // an der Uhr umgeschaltet, dort schon wirksam
    if (aktion === A_ABFAHRT) localStorage.setItem('abfahrt', wahl ? 'aktuell' : 'plan');
    else localStorage.setItem('dauer', wahl ? 'an' : 'aus');
    console.log('Menü: Abfahrt ' + abfahrt() + ', Fahrtdauer ' + dauer());
    return;
  }
  if (aktion === A_QUELLE) {             // an der Uhr gewählt: merken, aktuelle Strecke neu laden
    localStorage.setItem('quelle', QUELLEN[wahl] || 'auto');
    console.log('Menü: Quelle ' + quelle());
    if (strecken().length) streckeLaden(aktiveSeite());
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
    return koordinaten(ablauf.a, aktuell(function (f0) {
      koordinaten(ablauf.b, aktuell(function (f) {
        if (f0 || f) return fehlerSchritt(f0 || f, function () { menueAktion2(A_AENDERN_RUECK, wahl); });
        vorladen(ablauf.a);
        schrittRueck(false);
      }));
    }));
  }
  if (aktion === A_SCHNELL_HIN || aktion === A_SCHNELL_RUECK) return schnellStart(wahl, aktion === A_SCHNELL_RUECK);
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

// ---------- Schnellere Abfahrt (seit 0.38) ----------
// Menü > Schnellere Abfahrt > Hin (vorausgewählt) oder Rück. Bezug ist die nächste angezeigte Fahrt x -> y.
// Gesucht: Fahrten ab dem Umkreis um x, die im Umkreis um y früher ankommen (L.schneller).
// Liste 1 Einstieg nach Entfernung vom Standort, Liste 2 Ausstieg (y zuerst), Liste 3 die Fahrten mit Ab- und Ankunft,
// dann Mini-Menü Zurück (Anzeige ohne Änderung) / Übernehmen (seit 0.39: Strecke in dieser Richtung umstellen).
function hm(t) {                        // UTC-Sekunden -> "HH:MM" deutsche Zeit, unabhängig von der Zeitzone des Handys
  var y = new Date(t * 1000).getUTCFullYear();
  var d = new Date((t + (t >= letzterSonntag0100(y, 3) && t < letzterSonntag0100(y, 10) ? 7200 : 3600)) * 1000);
  return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
}

// Bezugsfahrten x -> y aus derselben Quelle wie die Anzeige (RMV mit Echtzeit, sonst Transitous), bis zu 10.
// fertig(fehler, [{ ab, an, linie, plan }]) ohne Ausfälle; an = 0: Fahrtdauer unbekannt. Welche zählt, entscheidet
// bezugWaehlen, sobald der Standort da ist.
function bezugHolen(st, rueck, fertig) {
  var von = rueck ? rueckStart(st) : st.a, nach = rueck ? rueckZiel(st) : st.b, linien = linienFuer(st, rueck);
  function weiter(f, erg) {
    if (f !== null && f !== undefined) return fertig(f === STATUS_NETZ ? 'kein Netz' : 'fehler');
    fertig(null, erg.fahrten.filter(function (x) { return x.d !== AUSFALL; }).map(function (r) {
      return { ab: r.t, an: r.f ? r.t + r.f * 60 : 0, linie: r.l, plan: r.t - (r.d || 0) * 60 };
    }));
  }
  function trans() { holen(von.id, nach.id, linien, weiter, 10); }
  var q = quelle();
  if (q === 'trans' || !rmvSchluessel()) return trans();
  holenRmv(von, nach, linien, function (f, erg) { if (f !== null && q === 'auto') return trans(); weiter(f, erg); }, 10);
}

// Bezug ist die erste Fahrt, die man vom Standort zu Fuß noch erreicht (seit 0.41) — gleiche Gehzeit wie für die
// Alternativen. Standort unbekannt oder weit weg: man steht an x. Keine erreichbar: null (Titel BISHER KEINE FAHRT).
function bezugWaehlen(liste, pos, x) {
  var p = L.standortNah(pos, x, umkreis()), jetzt = Math.floor(Date.now() / 1000);
  var geh = p ? L.gehSek(L.entfernung(p.lat, p.lon, x.lat, x.lon)) : 0;
  return liste.filter(function (b) { return b.ab >= jetzt + geh; })[0] || null;
}

function schnellStart(i, rueck) {
  var st = strecken()[i];
  if (!st) return menueEnde();
  var x = rueck ? rueckStart(st) : st.a, y = rueck ? rueckZiel(st) : st.b;
  ablauf = { ziel: i, schnell: true, rueck: rueck, schritte: [], gen: 0, laedt: true, x: x && halt(x), y: halt(y) };
  if (!x) return schritt(T('KEINE RUECKFAHRT', 'Keine Rückfahrt'), [{ t: T('ZURUECK', 'Zurück') }], function () { menueEnde(); });
  koordinaten(ablauf.x, aktuell(function (f0) {
    koordinaten(ablauf.y, aktuell(function (f) {
      if (f0 || f) return fehlerSchritt(f0 || f, function () { schnellStart(i, rueck); });
      schrittSchneller();
    }));
  }));
}

function schrittSchneller() {
  ladeSenden(T('SUCHE', 'Suche'), true);
  var a = ablauf, st = strecken()[a.ziel], offen = 2, bezuege = [], bezug = null, fehler = null, pos = null;
  if (!st) return menueEnde();
  var fertig = aktuell(function () {
    if (--offen) return;
    if (fehler) return fehlerSchritt(fehler, schrittSchneller);
    bezug = bezugWaehlen(bezuege, pos, a.x);
    ladeSenden(T('FAHRTEN', 'Fahrten'), true);
    L.schneller(a.x, a.y, umkreis(), bezug, pos, Math.floor(Date.now() / 1000), aktuell(function (f, liste) {
      if (f) return fehlerSchritt(f, schrittSchneller);
      a.bezug = bezug;
      console.log('Schneller: Bezug ' + (bezug ? bezug.linie + ' ' + hm(bezug.ab) + (bezug.an ? '-' + hm(bezug.an) : '') : 'keiner') +
                  ', ' + liste.length + ' Einstiege' + (pos ? '' : ', ohne Standort'));
      if (!liste.length) {
        return schritt(T('NICHTS SCHNELLER', 'Nichts Schnelleres'), [{ t: T('NOCHMAL', 'Nochmal') }], function () { ablauf.schritte.pop(); schrittSchneller(); });
      }
      var stadt = L.stadtVon(a.x.name);
      schritt(T('SCHNELLER AB', 'Schneller ab'), liste.map(function (e) { return { t: mitM(e.name, e.m, stadt), e: e }; }), function (w) {
        schrittSchnellZiel(w.e);
      });
    }));
  });
  bezugHolen(st, a.rueck, function (f, b) { if (f) fehler = f; else bezuege = b; fertig(); });
  standort(function (p) { pos = p; fertig(); });   // ohne Standort: Entfernung und Gehzeit ab x
}

function schrittSchnellZiel(e) {
  var stadt = L.stadtVon(ablauf.x.name);
  schritt(T('AUSSTIEG', 'Ausstieg'), e.ziele.map(function (z) {
    return { t: z.ziel ? mitZusatz(z.name, T(' (ZIEL)', ' (Ziel)'), stadt) : mitM(z.name, z.m, stadt), z: z };
  }), function (w) { schrittSchnellFahrten(e, w.z); });
}

function fahrtText(f) { return T(L.ledText(f.l), f.l) + ' ' + hm(f.ab) + '-' + hm(f.an); }

function schrittSchnellFahrten(e, z) { // Titel: Ankunft der Bezugsfahrt
  var b = ablauf.bezug;
  var titel = !b ? T('BISHER KEINE FAHRT', 'Bisher keine Fahrt') : b.an ? T('BISHER AN ', 'Bisher an ') + hm(b.an) : T('BISHER AB ', 'Bisher ab ') + hm(b.ab);
  schritt(titel, z.fahrten.map(function (f) { return { t: fahrtText(f), f: f }; }), function (w) { schrittSchnellWahl(e, z, w.f); });
}

// Mini-Menü zur gewählten Fahrt (Wunsch Seb 2026-10-09): ZURUECK vorausgewählt = Anzeige ohne Änderung,
// UEBERNEHMEN eine Zeile tiefer. Zurück-Taste: wieder die Fahrtenliste.
function schrittSchnellWahl(e, z, f) {
  schritt(fahrtText(f), [{ t: T('ZURUECK', 'Zurück') }, { t: T('UEBERNEHMEN', 'Übernehmen'), ok: true }], function (w) {
    if (w.ok) return schnellUebernehmen(e, z, f);
    menueEnde(true);
  });
}

// Übernehmen: Einstieg und Ausstieg der gewählten Richtung ersetzen, Linienfilter dieser Richtung = gewählte Linie.
// Die andere Richtung bleibt, wie sie war: Hin geändert -> Rückfahrt startet weiter am alten Ziel (c) und endet
// weiter am alten Start (d). Rück geändert -> c und d neu, Hinfahrt unberührt.
function schnellUebernehmen(e, z, f) {
  var liste = strecken(), i = ablauf.ziel, st = liste[i];
  if (!st) return menueEnde(true);
  var stadt = L.stadtVon(st.a.name);
  function mitKurz(h) { return { id: h.id, name: h.name, kurz: L.kurzname(h.name, stadt), lat: h.lat, lon: h.lon }; }
  var x = ablauf.rueck ? rueckStart(st) : st.a, neuX = e.name === x.name ? x : mitKurz(e);
  if (!ablauf.rueck) {
    if (!st.ohneRueck && !st.c) st.c = st.b;
    if (!st.ohneRueck && !st.d && neuX !== st.a) st.d = st.a;
    st.a = neuX;
    if (!z.ziel) st.b = mitKurz(z);
    st.linienHin = [f.l];
  } else {
    st.c = neuX;
    if (!z.ziel) st.d = mitKurz(z);       // Ausstieg = bisheriges Ziel: d bleibt (bzw. ohne d: Start)
    st.linienRueck = [f.l];
  }
  // Seite zeigt die Linie mit. Vorher den Filter der anderen Richtung festschreiben, sonst fährt die neue Linie dort mit
  if (!st.alle) {
    if (ablauf.rueck) { if (!st.linienHin) st.linienHin = st.linien.slice(); }
    else if (!st.linienRueck) st.linienRueck = st.linien.slice();
    st.linien = vereinigen(st.linien, [f.l]);
  }
  localStorage.setItem('strecken', JSON.stringify(liste));
  localStorage.setItem('seite', String(i));
  console.log('Schneller: übernommen ' + (ablauf.rueck ? 'rück ' + st.c.kurz + ' -> ' + rueckZiel(st).kurz : 'hin ' + st.a.kurz + ' -> ' + st.b.kurz) + ' [' + f.l + ']');
  ablauf = null;
  einrichtungSenden();                   // Uhr schließt das Menü und zeigt die Strecke
  streckeLaden(i);
}

// ---------- Einstellungen: eingebettete Seite ----------
function seiteOeffnen(standort, standortFehler) {
  var zustand = { strecken: strecken(), standort: standort, standortFehler: standortFehler, schrift: SCHRIFT.F35,
                  rmvKey: rmvSchluessel(), layout: layout(), umkreis: umkreis(), quelle: quelle(), abfahrt: abfahrt(), dauer: dauer() };
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
    if (LAYOUTS.indexOf(daten.layout) >= 0) localStorage.setItem('layout', daten.layout);
    if (QUELLEN.indexOf(daten.quelle) >= 0) localStorage.setItem('quelle', daten.quelle);
    if (daten.abfahrt === 'plan' || daten.abfahrt === 'aktuell') localStorage.setItem('abfahrt', daten.abfahrt);
    if (daten.dauer === 'an' || daten.dauer === 'aus') localStorage.setItem('dauer', daten.dauer);
    if (L.UMKREISE.indexOf(daten.umkreis) >= 0) localStorage.setItem('umkreis', String(daten.umkreis));
    ablauf = null;
    localStorage.setItem('strecken', JSON.stringify(daten.strecken.slice(0, MAXS)));
    localStorage.setItem('seite', '0');
    einrichtungSenden();
    if (daten.strecken.length) streckeLaden(0);
  } catch (err) {
    console.log('Antwort der Seite unlesbar: ' + err);
  }
});

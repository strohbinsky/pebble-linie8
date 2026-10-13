// Linie 8 — Handy-Teil (PebbleKit JS).
// Hält bis zu 8 Seiten, lädt beim Öffnen und Blättern die nächsten Fahrten und schickt Abfahrtszeiten
// (Unix-Sekunden, UTC) und Linien an die Uhr.
//
// Seit 0.50 ist eine Seite eine Richtung: Haltestelle a, optional Ziel b, Linienfilter. Mit Ziel: Verbindungssuche
// a -> b ohne Umstieg (liefert genau die Fahrten, die an BEIDEN Haltestellen halten — geteilte Linien erledigt),
// mit Fahrtdauer. Ohne Ziel: alle Abfahrten an a mit Endziel. Die Rückfahrt ist eine eigene Seite, angelegt über
// das Uhr-Menü direkt hinter der Seite, von der sie ausgeht. Bis 0.42 war eine Seite ein Paar Hin + Rück.
//
// Datenquelle: RMV (HAFAS ReST), wenn in den Einstellungen ein Schlüssel hinterlegt ist, sonst oder bei
// Fehler Transitous (MOTIS, nur Sollfahrplan).
// Seit 0.9.0 zusätzlich DB Timetables (db.js) mit eigenem Schlüssel: für Züge Zeit, Gleis und Ausfall von der DB,
// über RMV bzw. Transitous gelegt. Fuß der Uhr dann "RMV+DB" bzw. "TR+DB".
//
// Uhr-Menü (Version 0.30): Seiten direkt an der Uhr anlegen, ändern, löschen. Der Ablauf ist ein
// Zustandsautomat hier im Handy-Skript (siehe "Uhr-Menü" unten); die Uhr zeigt nur Listen und meldet die Wahl.
//
// Seit 0.6.1 zwei Rubriken (RUBRIK 0/1): HALTESTELLEN (die Seiten von bisher: Start fest, Ziel optional) und
// STRECKEN (von A nach B mit Umstieg und Fußwegen, Start = Standort oder fester Ort). Dazu bis zu 10 FAVORITEN
// (Adressen oder Haltestellen) als Vorrat für Start und Ziel, und je Seite eine Detailansicht (DETAIL = Nummer der
// Abfahrt bzw. Verbindung). Die zuletzt geöffnete Detailansicht ist die „laufende Fahrt“: bis 5 min nach der Ankunft
// öffnet die App wieder dort.
//
// 0.8.0 (mit Seb 2026-10-10): Rubrik HALTESTELLEN heißt ABFAHRTEN, ihr Ziel heißt AUSSTIEG. Volle Rubrik bzw. volle
// Favoriten (20): beim Speichern fragt die Uhr, was ersetzt wird (L_FRAGE: Bestätigung an der Uhr). Favoriten direkt aus
// jeder Seite anlegen, Namen am Handy oder per Diktat. Vorschlag FRUEHER DA (ab 10 min früher) auf Seiten mit Ziel und
// in der aktiven Fahrt; Schnellere Abfahrt (0.38) entfällt dafür. Alle löschen je Rubrik und für Favoriten.

var keys = require('message_keys');
var SEITE_HTML = require('./einstellungen_seite');
var SCHRIFT = require('./schrift.json');
var Logik = require('./logik');
var StreckenModul = require('./strecken');
var DBModul = require('./db');
var BAHNHOEFE = require('./db_bahnhoefe.json');

var PLAN = 'https://api.transitous.org/api/v5/plan';
var MAXD = 3;          // muss zu AB[3] in package.json passen
var MAXS = 8;          // muss zu NAME_A[8] / NAME_B[8] passen
var TIMEOUT_MS = 15000;

var STATUS_SOLL = 0, STATUS_LIVE = 1, STATUS_NETZ = 2, STATUS_FEHLER = 3;
var AUSFALL = 9999;   // Verspätungswert für eine ausgefallene Fahrt

// ---------- Speicher ----------
// Seiten (seit 0.50) unter 'seiten': [{ a, b (null = ohne Ziel), linien, alle, zuletzt }]. Die Paare bis 0.42
// unter 'strecken' werden nicht übernommen (Entscheidung Seb 2026-10-09: neu anlegen geht schnell).
function strecken() {
  try { return JSON.parse(localStorage.getItem('seiten')) || []; } catch (e) { return []; }
}
function streckenSchreiben(liste) { localStorage.setItem('seiten', JSON.stringify(liste)); }
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

// Details: Linie ganz, ohne Leerzeichen, höchstens 7 Zeichen ("RE 4" -> "RE4", "ICE 578" -> "ICE578")
function linienVoll(name) {
  return String(name || '').toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/[^A-Z0-9]/g, '').substring(0, 7);
}

// Steig der Abfahrt (z. B. "B" am Tränkweg), höchstens 3 Zeichen; leer, wenn die Haltestelle keine Steige hat.
// Bei mehreren Wörtern zählt das letzte: RMV meldet am Flughafen "Regio 3" (Regionalbahnhof, Gleis 3) -> "3".
function steigText(s) {
  var teile = String(s || '').trim().split(/\s+/);
  return teile[teile.length - 1].substring(0, 3);
}

// max: so viele Fahrten (Standard MAXD, Bezugssuche mehr); ab: Abfahrten ab dieser Zeit (UTC, WEITERE FAHRTEN), sonst ab jetzt
function holen(von, nach, linien, fertig, max, ab) {
  var url = PLAN +
    '?fromPlace=' + encodeURIComponent(von) +
    '&toPlace=' + encodeURIComponent(nach) +
    '&maxTransfers=0&numItineraries=' + Math.max(10, max || 0) + '&directModes=WALK' +
    '&maxPreTransitTime=0&maxPostTransitTime=0' + (ab ? '&time=' + new Date(ab * 1000).toISOString() : '');
  var erledigt = false;
  function ende(fehler, erg) { if (!erledigt) { erledigt = true; fertig(fehler, erg); } }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  // Transitous lehnt Anfragen ohne User-Agent mit 403 ab.
  try { xhr.setRequestHeader('User-Agent', 'pebble-linie8/0.9.0 (privat)'); } catch (e) {}
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
        // Verspätung (0.9.0): Transitous hat bei Zügen inzwischen Echtzeit; bis 0.8.2 stand hier immer 0, die Echtzeit-Abfahrt
        // erschien dann als Fahrplanzeit
        var planT = Math.floor(Date.parse(f.scheduledStartTime || f.startTime) / 1000);
        var dl = f.cancelled ? AUSFALL : (f.realTime && planT ? Math.round((t - planT) / 60) : 0);
        // Für die Detailansicht (0.6.1): Linie voll, Richtung, Ankunft, Halte dazwischen, Steig am Ziel; zn: Zugnummer für die DB (0.9.0)
        liste.push({ t: dl === AUSFALL ? planT : t, l: linienKurz(f.routeShortName), d: dl, zn: f.tripShortName || '', s: steigText(f.from && (f.from.track || f.from.scheduledTrack)), f: dauer,
                     lv: f.routeShortName, r: f.headsign || '', an: an, zs: steigText(f.to && (f.to.track || f.to.scheduledTrack)), tid: f.tripId,
                     mi: StreckenM.verkehrsmittel(f.mode || ''), sp: steigText(f.from && f.from.scheduledTrack), anPlan: Math.floor(Date.parse(f.scheduledEndTime || f.endTime) / 1000),
                     zw: (f.intermediateStops || []).map(function (h) { return { name: h.name, t: Math.floor(Date.parse(h.arrival || h.departure) / 1000) }; }) });
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

function rmvAb(t) {                    // '&date=…&time=…' in deutscher Zeit für RMV-Abfragen ab t (UTC)
  var dz = new Date((t + mezVersatz(t)) * 1000).toISOString();
  return '&date=' + dz.slice(0, 10) + '&time=' + dz.slice(11, 16);
}
function holenRmv(von, nach, linien, fertig, max, ab) {
  rmvKennung(von, function (f1, a) {
    if (f1 !== null) return fertig(f1);
    rmvKennung(nach, function (f2, b) {
      if (f2 !== null) return fertig(f2);
      // Linie gleich bei RMV filtern: ohne Filter sind die 6 Fahrten an großen Haltestellen oft fremde Linien,
      // die gewählte fehlt dann ganz (Hbf -> CongressCenter: 1 von 6 ist eine 4). Unbekannte Linie -> HTTP 400 -> Fehler.
      var filter = (linien && linien.length) ? '&lines=' + encodeURIComponent(linien.join(',')) : '';
      rmvGet('trip?maxChange=0&numF=6&passlist=1' + filter + (ab ? rmvAb(ab) : '') + '&originExtId=' + encodeURIComponent(a) + '&destExtId=' + encodeURIComponent(b), function (f, d) {
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
            var halte = (l.Stops && l.Stops.Stop) || [];
            liste.push({ t: t, l: linienKurz(name), d: d, s: steigText(steig), f: dauer,
                         lv: name, r: l.direction || '', an: dauer ? t + dauer * 60 : 0, zs: steigText(z.rtTrack || z.track),
                         anPlan: z.time ? deZuUtc(z.date, z.time) : 0,                       // für die DB (0.9.0)
                         ref: l.JourneyDetailRef && l.JourneyDetailRef.ref, mi: StreckenM.verkehrsmittel((pr && pr.catOut) || ''), sp: steigText(o.track),
                         zw: halte.slice(1, -1).map(function (h) {
                           var hz = h.rtArrTime || h.rtDepTime || h.arrTime || h.depTime, hd = h.rtArrDate || h.rtDepDate || h.arrDate || h.depDate;
                           return { name: h.name, t: hz && hd ? deZuUtc(hd, hz) : 0 };
                         }) });
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

// ---------- Seite ohne Ziel: alle Abfahrten der Haltestelle (seit 0.50) ----------
// Je Fahrt zusätzlich das Endziel (z). "über …" liefert keine der beiden Quellen (geprüft 2026-10-09), daher nur das Endziel.
var TAFEL_N = 60;      // so viele Abfahrten ansehen, bevor der Linienfilter greift (Hbf: 25 Linien)
function tafelTransitous(von, linien, fertig, ab, max) {
  transitousHolen('v5/stoptimes?stopId=' + encodeURIComponent(von.id) + '&n=' + TAFEL_N + (ab ? '&time=' + new Date(ab * 1000).toISOString() : ''), function (f, d) {
    if (f) return fertig(f === 'kein Netz' ? STATUS_NETZ : STATUS_FEHLER);
    try {
      var liste = [], live = false;
      (d.stopTimes || []).forEach(function (x) {
        if (!L.oepnv(x)) return;                                   // keine Mitfahrbörse
        if (linien && linien.length && linien.indexOf(x.routeShortName) < 0) return;
        var p = x.place || {};
        if (p.pickupType === 'NOT_ALLOWED') return;                  // endet hier
        var plan = Math.floor(Date.parse(p.scheduledDeparture || p.departure) / 1000);
        var t = Math.floor(Date.parse(p.departure || p.scheduledDeparture) / 1000);
        if (!t) return;
        var dl = (x.cancelled || x.tripCancelled || p.cancelled) ? AUSFALL : (x.realTime ? Math.round((t - plan) / 60) : 0);
        liste.push({ t: t, l: linienKurz(x.routeShortName), d: dl, zn: x.tripShortName || '', s: steigText(p.track || p.scheduledTrack), f: 0,
                     z: x.headsign || (x.tripTo && x.tripTo.name) || '', lv: x.routeShortName, r: x.headsign || '', tid: x.tripId,
                     mi: StreckenM.verkehrsmittel(x.mode || ''), sp: steigText(p.scheduledTrack) });
        live = live || !!x.realTime;
      });
      liste.sort(function (a, b) { return a.t - b.t; });
      fertig(null, { fahrten: liste.slice(0, max || MAXD), live: live });
    } catch (e) {
      console.log('Abfahrten unlesbar: ' + e);
      fertig(STATUS_FEHLER);
    }
  });
}

function tafelRmv(von, linien, fertig, ab, max) {
  rmvKennung(von, function (f1, a) {
    if (f1 !== null) return fertig(f1);
    var filter = (linien && linien.length) ? '&lines=' + encodeURIComponent(linien.join(',')) : '';
    rmvGet('departureBoard?maxJourneys=30&duration=120' + filter + (ab ? rmvAb(ab) : '') + '&id=' + encodeURIComponent(a), function (f, d) {
      if (f !== null) return fertig(f);
      try {
        var liste = [], live = false;
        (d.Departure || []).forEach(function (x) {
          var pr = x.ProductAtStop || x.Product;
          if (pr && pr.length !== undefined) pr = pr[0];
          var name = (pr && (pr.line || pr.displayNumber || pr.num)) || x.name || '';
          if (linien && linien.length && linien.indexOf(name) < 0) return;
          var rt = !!x.rtTime, plan = deZuUtc(x.date, x.time), t = rt ? deZuUtc(x.rtDate || x.date, x.rtTime) : plan;
          var steig = x.rtTrack || x.track || (x.rtPlatform && x.rtPlatform.text) || (x.platform && x.platform.text);
          liste.push({ t: t, l: linienKurz(name), d: x.cancelled ? AUSFALL : Math.round((t - plan) / 60), s: steigText(steig), f: 0,
                       z: x.direction || '', lv: name, r: x.direction || '', ref: x.JourneyDetailRef && x.JourneyDetailRef.ref,
                       mi: StreckenM.verkehrsmittel((pr && pr.catOut) || ''), sp: steigText(x.track) });
          live = live || rt;
        });
        liste.sort(function (x, y) { return x.t - y.t; });
        fertig(null, { fahrten: liste.slice(0, max || MAXD), live: live });
      } catch (e) {
        console.log('RMV-Abfahrten unlesbar: ' + e);
        fertig(STATUS_FEHLER);
      }
    });
  });
}

// ---------- DB Timetables (seit 0.9.0): Züge mit Zeit, Gleis und Ausfall von der DB ----------
// Nur mit Schlüssel (Client-ID + API-Key, Einstellungsseite). Gilt für Züge an DB-Bahnhöfen, gleich aus welcher Quelle
// die Fahrt stammt. Findet die DB den Zug nicht oder antwortet nicht, bleibt alles wie von RMV bzw. Transitous.
// Höchstens DB_WARTEN_MS warten, damit die Anzeige nicht hängt; Pläne puffert db.js, die zweite Abfrage ist sofort da.
var DB_WARTEN_MS = 6000;
function dbSchluessel() {
  var id = (localStorage.getItem('dbId') || '').trim(), key = (localStorage.getItem('dbKey') || '').trim();
  return id && key ? { id: id, key: key } : null;
}
var Db = DBModul({ schluessel: dbSchluessel, deZuUtc: deZuUtc, entfernung: function (a, b, c, d) { return L.entfernung(a, b, c, d); },
                   bahnhoefe: BAHNHOEFE.b, speicher: localStorage });
function quelleText(q, db) { return db && q ? (q === 'RMV' ? 'RMV+DB' : 'TR+DB') : q; }   // Fuß der Uhr, höchstens 7 Zeichen

// Abfahrten einer Seite: Abfahrt an a, mit Ziel auch die Ankunft an b (Fahrtdauer, Teilausfall)
function dbAbfahrten(st, erg, fertig) {
  if (!erg || !erg.fahrten || !Db.aktiv()) return fertig(erg);
  var anfragen = [], wohin = [];
  erg.fahrten.forEach(function (x, i) {
    if (x.mi !== 'ZUG') return;
    var plan = x.t - (x.d === AUSFALL ? 0 : x.d) * 60;
    anfragen.push({ art: 'dp', lat: st.a.lat, lon: st.a.lon, t: plan, linie: x.lv, zn: x.zn }); wohin.push([i, 'dp']);
    if (st.b && x.anPlan) { anfragen.push({ art: 'ar', lat: st.b.lat, lon: st.b.lon, t: x.anPlan, linie: x.lv, zn: x.zn }); wohin.push([i, 'ar']); }
  });
  if (!anfragen.length) return fertig(erg);
  Db.anreichern(anfragen, function (r) {
    var n = 0;
    r.forEach(function (e, k) {
      if (!e) return;
      var x = erg.fahrten[wohin[k][0]];
      n++;
      if (wohin[k][1] === 'dp') {
        if (x.d === AUSFALL) return;                 // Ausfall der Quelle bleibt stehen, die DB hebt ihn nicht auf
        x.t = e.aus ? e.plan : e.t; x.d = e.aus ? AUSFALL : e.del;
        if (e.steig) x.s = steigText(e.steig);
        if (e.steigPlan) x.sp = steigText(e.steigPlan);
      } else {
        x.an = e.t; if (e.steig) x.zs = steigText(e.steig);
        if (e.aus) x.d = AUSFALL;                    // Teilausfall: der Zug erreicht das Ziel nicht
      }
      if (x.an && x.d !== AUSFALL && x.an > x.t) x.f = Math.round((x.an - x.t) / 60);
    });
    if (n) { erg.db = true; erg.live = true; erg.fahrten.sort(function (a, b) { return a.t - b.t; }); }
    console.log('DB: ' + n + ' von ' + anfragen.length + ' Zugereignissen');
    fertig(erg);
  }, DB_WARTEN_MS);
}

// Verbindungen (Strecken, aktive Fahrt): je Zugabschnitt Abfahrt am Einstieg und Ankunft am Ausstieg
function dbVerbindungen(liste, fertig) {
  if (!liste || !Db.aktiv()) return fertig();
  var anfragen = [], wohin = [], alt = jetztS() - 300;
  liste.forEach(function (v) {
    if (!v || !v.legs) return;
    v.legs.forEach(function (l) {
      if (l.fuss || l.mittel !== 'ZUG' || l.an < alt) return;
      anfragen.push({ art: 'dp', lat: l.vonLat, lon: l.vonLon, t: l.abPlan, linie: l.linie, zn: l.zn }); wohin.push([v, l, 'dp']);
      if (l.nachLat !== undefined && l.anPlan) { anfragen.push({ art: 'ar', lat: l.nachLat, lon: l.nachLon, t: l.anPlan, linie: l.linie, zn: l.zn }); wohin.push([v, l, 'ar']); }
    });
  });
  if (!anfragen.length) return fertig();
  Db.anreichern(anfragen, function (r) {
    var n = 0;
    r.forEach(function (e, k) {
      if (!e) return;
      var v = wohin[k][0], l = wohin[k][1];
      n++; v.db = true; v.live = true; l.live = true;
      if (wohin[k][2] === 'dp') {
        if (l.ausfall) return;                       // Ausfall der Quelle bleibt stehen
        l.ab = e.aus ? e.plan : e.t; l.del = e.del;
        if (e.steig) l.vonSteig = steigText(e.steig);
        if (e.steigPlan) l.vonSteigPlan = steigText(e.steigPlan);
      } else {
        l.an = e.t; if (e.steig) l.nachSteig = steigText(e.steig);
      }
      if (e.aus) l.ausfall = true;                   // auch Teilausfall am Ausstieg
    });
    liste.forEach(function (v) { if (v && v.db) fussNachziehen(v); });
    console.log('DB: ' + n + ' von ' + anfragen.length + ' Zugereignissen in ' + liste.length + ' Verbindungen');
    fertig();
  }, DB_WARTEN_MS);
}

// Aktive Fahrt: Abfahrt aus einer Seite (a.f) oder Verbindung (a.v)
function dbFahrt(a, fertig) {
  if (!Db.aktiv()) return fertig();
  if (a.art !== 'abfahrt') return dbVerbindungen([a.v], function () { if (a.v.db) a.stand = jetztS(); fertig(); });
  var f = a.f;
  if (a.mittel !== 'ZUG' || !f.abPlan) return fertig();
  var anfragen = [{ art: 'dp', lat: a.startLat, lon: a.startLon, t: f.abPlan, linie: f.linie, zn: f.zn }];
  if (a.ziel && f.anPlan) anfragen.push({ art: 'ar', lat: a.ziel.lat, lon: a.ziel.lon, t: f.anPlan, linie: f.linie, zn: f.zn });
  Db.anreichern(anfragen, function (r) {
    if (r[0] && !f.ausfall) {
      f.ab = r[0].aus ? r[0].plan : r[0].t; f.del = r[0].del;
      if (r[0].steig) f.steig = steigText(r[0].steig);
      if (r[0].aus) f.ausfall = true;
      a.stand = jetztS();
    }
    if (r[1]) { f.an = r[1].t; if (r[1].steig) f.zielSteig = steigText(r[1].steig); if (r[1].aus) f.ausfall = true; }
    fertig();
  }, DB_WARTEN_MS);
}

// ---------- An die Uhr ----------
function linienFuer(st) { return st.alle ? null : st.linien; }   // alle = kein Filter

// Umkreis um den Start für die Rückfahrt-Suche: 500 / 1000 / 2000 m, Standard 1000. Uhr-Menü und Seite.
function umkreis() {
  var u = parseInt(localStorage.getItem('umkreis'), 10);
  return L.UMKREISE.indexOf(u) >= 0 ? u : 1000;
}
function umkreisText(m) { return m >= 1000 ? (m / 1000) + T('KM', ' km') : m + T('M', ' m'); }

// Ansicht seit 0.13.0: 'papier' (Standard) oder 'phosphor_weiss', dazu unabhängig 'invers' (Papier dunkel, Phosphor hell)
// und 'kontrast' (keine graue Schrift, nur Phosphor). Alte Werte: 'phosphor' (grün) wird Phosphor weiß; 'klar', 'led'
// und 'invers' (LED invers als eigene Ansicht bis 0.9.0) werden Papier — LED-Stände dabei nicht invertiert.
// Phosphor nutzt die Großbuchstaben-Texte ohne Umlaute, Papier die normale Schreibweise.
var LAYOUTS = ['led', 'klar', 'phosphor', 'invers', 'phosphor_weiss', 'papier'];   // Index = Wert in LAYOUT; gesendet nur noch 4 und 5
function altLed() { var v = localStorage.getItem('layout'); return v === 'led' || v === 'invers'; }
function layout() { var v = localStorage.getItem('layout'); return v === 'phosphor' || v === 'phosphor_weiss' ? 'phosphor_weiss' : 'papier'; }
function invers() { return !altLed() && localStorage.getItem('invers') === '1'; }
function kontrast() { return localStorage.getItem('kontrast') === '1'; }
function schliessen() { return localStorage.getItem('schliessen') === '1'; }   // App nach 10 s ohne Taste zu (0.9.2, Standard aus)
// LAYOUT an der Uhr: Grundansicht + 8 invertiert + 16 hoher Kontrast + 32 App schließen
function layoutWert() { return LAYOUTS.indexOf(layout()) | (invers() ? 8 : 0) | (kontrast() ? 16 : 0) | (schliessen() ? 32 : 0); }
function layoutMerken(w) {
  var b = w & 7, led = b === 0 || b === 3;
  localStorage.setItem('layout', b === 2 || b === 4 ? 'phosphor_weiss' : 'papier');
  localStorage.setItem('invers', !led && (w & 8) ? '1' : '0');
  localStorage.setItem('kontrast', w & 16 ? '1' : '0');
  localStorage.setItem('schliessen', w & 32 ? '1' : '0');
}
function T(led, klar) { return layout() === 'papier' ? klar : led; }   // Text je nach Ansicht

// Quelle der Abfahrten (seit 0.35): 'auto' (Standard: RMV mit Schlüssel, bei Fehler Transitous), 'rmv' (nur RMV,
// Fehler bleibt Fehler — auch ohne Schlüssel), 'trans' (nur Transitous). Einstellbar an Seite und Uhr.
var QUELLEN = ['auto', 'rmv', 'trans'];   // Index = QUELLWAHL/WAHL an der Uhr
function quelle() { var v = localStorage.getItem('quelle'); return QUELLEN.indexOf(v) >= 0 ? v : 'auto'; }

// Anzeige der Abfahrten (seit 0.35), umgesetzt auf der Uhr — das Handy merkt sich die Werte nur für Seite und Einrichtung.
// abfahrt: 'plan' (Standard, Fahrplanzeit + Verspätung als +2') oder 'aktuell' (Zeit mit Verspätung). dauer: 'an' (Standard) / 'aus'.
function abfahrt() { return localStorage.getItem('abfahrt') === 'aktuell' ? 'aktuell' : 'plan'; }
function dauer() { return localStorage.getItem('dauer') === 'aus' ? 'aus' : 'an'; }

// Welche Orte schon Favorit sind (0.8.0): die Uhr bietet "FAVORIT: <Ort>" nur für die anderen an.
// H_FAV / R_FAV: Bit 2i = Start, 2i+1 = Ziel der Seite i; S_FAV: Bit 0 = Haltestelle von "Abfahrten hier", 1 = Ziel von "Strecke ab hier"
function istFav(o) { return !!o && o.lat !== undefined && favoriten().some(function (f) { return gleicherOrt(f, o); }); }
function favMasken(msg) {
  var h = 0, r = 0;
  strecken().forEach(function (st, i) { if (i < 15) { if (istFav(st.a)) h |= 1 << (2 * i); if (istFav(st.b)) h |= 1 << (2 * i + 1); } });
  routen().forEach(function (x, i) { if (i < 15) { if (istFav(x.von)) r |= 1 << (2 * i); if (istFav(x.nach)) r |= 1 << (2 * i + 1); } });
  msg[keys.H_FAV] = h; msg[keys.R_FAV] = r;
  msg[keys.S_FAV] = (istFav(hierAktuell) ? 1 : 0) | (istFav(sofortAktuell) ? 2 : 0);
  return msg;
}
function favMaskenSenden() { senden(favMasken({})); }
var hierAktuell = null, sofortAktuell = null;   // zuletzt gezeigte Haltestelle (Abfahrten hier) bzw. Ziel (Strecke ab hier)

function einrichtungSenden() {
  var liste = strecken(), msg = {};
  favMasken(msg);
  msg[keys.ANZAHL] = liste.length;
  msg[keys.SEITE] = aktiveSeite();
  msg[keys.LAYOUT] = layoutWert();
  msg[keys.UMKREIS] = umkreis();
  msg[keys.QUELLWAHL] = QUELLEN.indexOf(quelle());
  msg[keys.ABFAHRT] = abfahrt() === 'aktuell' ? 1 : 0;
  msg[keys.DAUER] = dauer() === 'an' ? 1 : 0;
  for (var i = 0; i < liste.length && i < MAXS; i++) {
    var b = liste[i].b, stadt = L.stadtVon(liste[i].a.name);
    msg[keys.NAME_A + i] = liste[i].a.kurz;
    msg[keys.NAME_B + i] = b ? b.kurz : '';           // leer = Seite ohne Ziel
    // Namen für die Ansicht „Klar“ immer mitschicken, damit die Uhr ohne Handy umschalten kann
    msg[keys.KLAR_A + i] = L.utf8Kuerzen(L.klarname(liste[i].a.name, stadt), 31);
    msg[keys.KLAR_B + i] = b ? L.utf8Kuerzen(L.klarname(b.name, stadt), 31) : '';
  }
  senden(msg);
}

// Lädt die Abfahrten einer Seite aus einer Quelle. fertig(msg) bei Erfolg, fertig(null, fehler) sonst.
// Mit Ziel: Verbindungssuche mit Fahrtdauer. Ohne Ziel: Abfahrten der Haltestelle mit Endziel (AB_Z, AB_ZK).
function seiteNachricht(st, erg) {
  var stadt = L.stadtVon(st.a.name), msg = {};
    for (var j = 0; j < MAXD; j++) {
      var x = erg.fahrten[j];
      msg[keys.AB + j] = x ? x.t : 0;
      msg[keys.AB_L + j] = x ? x.l : '';
      msg[keys.AB_D + j] = x ? x.d : 0;
      msg[keys.AB_S + j] = x ? (x.s || '') : '';
      msg[keys.AB_F + j] = x ? (x.f || 0) : 0;
      msg[keys.AB_Z + j] = x && x.z ? L.utf8Kuerzen(L.kurzname(x.z, stadt), 31) : '';
      msg[keys.AB_ZK + j] = x && x.z ? L.utf8Kuerzen(L.klarname(x.z, stadt), 31) : '';
    }
    msg[keys.STATUS] = erg.live ? STATUS_LIVE : STATUS_SOLL;
    return msg;
}
function seiteHolen(st, quelle, fertig) {
  var linien = linienFuer(st);
  function cb(f, erg) {
    if (f !== null && f !== undefined) return fertig(null, f);
    dbAbfahrten(st, erg, function (erg2) { fertig(seiteNachricht(st, erg2), null, erg2); });   // Züge: DB drüber (0.9.0)
  }
  // Transitous kennt Haltestellen per Kennung, RMV per Haltestellen-Objekt (Name, Koordinaten)
  if (st.b) {
    if (quelle === 'RMV') holenRmv(st.a, st.b, linien, cb); else holen(st.a.id, st.b.id, linien, cb);
  } else {
    if (quelle === 'RMV') tafelRmv(st.a, linien, cb); else tafelTransitous(st.a, linien, cb);
  }
}

// Auto: RMV, wenn ein Schlüssel hinterlegt ist; schlägt RMV fehl, die ganze Seite aus Transitous.
// Nur RMV / nur Transitous: kein Wechsel, ein Fehler wird als Fehler gezeigt.
// Jeder Aufruf macht den vorigen desselben Kanals ungültig (ladeNrn): wird während einer Abfrage die Quelle oder Seite gewechselt,
// darf die alte Antwort nicht mehr an die Uhr — sonst zeigt sie RMV, obwohl gerade Transitous gewählt wurde.
// kanal: 'seite' (gespeicherte Seiten) oder 'hier' (Abfahrten hier) — je Kanal zählt nur die letzte Abfrage.
// extra: weitere Felder für die Nachricht (Name der Haltestelle bei „Abfahrten hier“).
var ladeNrn = {};

// Puffer (0.6.5, Wunsch Seb 2026-10-10: „bei jedem App-Start wird alles neu geladen, auch wenn es erst 30 s alt ist“).
// Je Seite die Rohdaten (Abfahrten bzw. Verbindungen) mit Zeitpunkt im Handy-Speicher. Jünger als FRISCH_S: nicht neu
// laden. Älter (bis ALT_S): sofort zeigen, mit dem alten Stand in der Fußzeile, und im Hintergrund neu laden.
// Der Schlüssel enthält alles, was das Ergebnis ändert (Quelle, Orte, Linienfilter, Suchwerte).
var FRISCH_S = 60, ALT_S = 3 * 3600, PUFFER_MAX = 20;
function jetztS() { return Math.floor(Date.now() / 1000); }
function pufferAlle() { try { return JSON.parse(localStorage.getItem('puffer')) || {}; } catch (e) { return {}; } }
function pufferLesen(k) {
  var p = pufferAlle()[k];
  if (!p || !p.t) return null;
  p.alter = jetztS() - p.t;
  return p.alter >= 0 && p.alter < ALT_S ? p : null;
}
function pufferSchreiben(k, daten) {
  var alle = pufferAlle();
  daten.t = jetztS();
  alle[k] = daten;
  Object.keys(alle).sort(function (a, b) { return alle[b].t - alle[a].t; }).slice(PUFFER_MAX).forEach(function (x) { delete alle[x]; });
  try { localStorage.setItem('puffer', JSON.stringify(alle)); }
  catch (e) { console.log('Puffer nicht gespeichert: ' + e); try { localStorage.setItem('puffer', '{}'); } catch (e2) {} }
}
function ortKennung(o) { return o ? (o.id || (o.lat !== undefined ? o.lat.toFixed(4) + ',' + o.lon.toFixed(4) : o.name)) : ''; }
function pufferHalt(st) { return ['H', quelle() + (dbSchluessel() ? '+db' : ''), ortKennung(st.a), ortKennung(st.b), (linienFuer(st) || []).join(',')].join('|'); }

function streckeLaden(i, detail) {
  var st = strecken()[i];
  if (st) abfahrtenLaden(st, i, null, 'seite', detail);
}
// detail >= 0: zusätzlich die Detailzeilen dieser Abfahrt (0.6.1), siehe detailAbfahrtSenden
function abfahrtenLaden(st, i, extra, kanal, detail) {
  var nr = ladeNrn[kanal] = (ladeNrn[kanal] || 0) + 1;
  var pk = pufferHalt(st), p = pufferLesen(pk);
  function senden2(msg, quelle, erg, stand, mitDetail) {
    if (nr !== ladeNrn[kanal]) { console.log('Abfrage ' + kanal + ' ' + nr + ' (' + quelle + ') veraltet, verworfen'); return; }
    if (erg && !stand) pufferSchreiben(pk, { q: quelle, erg: erg });
    if (!erg && p) { console.log('Abfrage ' + kanal + ' fehlgeschlagen, Puffer bleibt stehen'); return; }
    Object.keys(extra || {}).forEach(function (k) { msg[k] = extra[k]; });
    msg[keys.SEITE] = i;
    msg[keys.RUBRIK] = 0;
    msg[keys.QUELLE] = quelleText(quelle, erg && erg.db);
    msg[keys.STAND] = stand || jetztS();
    if (kanal === 'seite') msg[keys.V_TEXT] = vorschlagText(0, i, pk);
    senden(msg);
    if (erg && kanal === 'seite' && st.b) vorschlagPruefen(0, i, pk, st.a, st.b, seitenZiel(st), function (ab) {   // FRUEHER DA (0.8.0)
      var x = erg.fahrten.filter(function (f) { return f.d !== AUSFALL && f.t >= ab; })[0];
      return x ? (x.an || (x.f ? x.t + x.f * 60 : 0)) : 0;
    });
    if (detail === VORSCHLAG) return vorschlagDetailSenden(0, i);
    if (detail === LISTE) return fahrtenDetailSenden(0, i);
    if (erg && mitDetail !== false && detail !== undefined && detail >= 0) detailAbfahrtSenden(st, i, erg.fahrten, detail, quelle, function () { return nr !== ladeNrn[kanal]; }, stand || jetztS());
  }
  if (p) {                               // gepuffert: sofort zeigen; frisch genug -> fertig
    var frisch = p.alter < FRISCH_S;
    console.log('Puffer ' + kanal + ' Seite ' + (i + 1) + ': ' + p.alter + ' s alt' + (frisch ? '' : ', lade neu'));
    senden2(seiteNachricht(st, p.erg), p.q, p.erg, p.t, frisch);
    if (frisch) return;
  }
  function transitous() {
    seiteHolen(st, 'TRANS', function (msg, fehler, erg) {
      if (msg) return senden2(msg, 'TRANS', erg);
      var m = {}; m[keys.STATUS] = fehler;
      senden2(m, 'TRANS');
    });
  }
  function fehlerRmv(fehler) { var m = {}; m[keys.STATUS] = fehler; senden2(m, 'RMV'); }
  var q = quelle();
  if (q === 'trans' || (q === 'auto' && !rmvSchluessel())) return transitous();
  if (!rmvSchluessel()) { console.log('Quelle nur RMV, aber kein Schlüssel'); return fehlerRmv(STATUS_FEHLER); }
  seiteHolen(st, 'RMV', function (msg, fehler, erg) {
    if (msg) return senden2(msg, 'RMV', erg);
    if (q === 'rmv') { console.log('RMV fehlgeschlagen (' + fehler + '), Quelle nur RMV'); return fehlerRmv(fehler); }
    console.log('RMV fehlgeschlagen (' + fehler + '), nehme Transitous');
    transitous();
  });
}

// Seite i zuletzt angesehen: entscheidet bei mehreren gleich nahen Starts (Startseite nach Standort)
function merken(i) {
  var liste = strecken();
  if (!liste[i]) return;
  liste[i].zuletzt = Math.floor(Date.now() / 1000);
  streckenSchreiben(liste);
}

// Startseite nach Standort (seit 0.50). Kaum bewegt seit dem letzten Öffnen (unter BEWEGT): die Seite vom letzten
// Mal bleibt. Sonst die Seite mit dem nächsten Start (L.seiteNachOrt). Die Uhr springt nur, solange man noch nicht
// selbst geblättert oder das Menü geöffnet hat, und fordert die Seite dann selbst an (REQUEST).
var BEWEGT = 300, GLEICH_NAH = 50;   // Meter
function standortSprung() {
  var liste = strecken();
  if (liste.length < 2) return;
  standort(function (pos) {
    if (!pos) return;
    var vorher = null;
    try { vorher = JSON.parse(localStorage.getItem('ort')); } catch (e) {}
    localStorage.setItem('ort', JSON.stringify({ lat: pos.lat, lon: pos.lon }));
    var aktiv = aktiveSeite();
    if (vorher && L.entfernung(vorher.lat, vorher.lon, pos.lat, pos.lon) < BEWEGT) { console.log('Standort: kaum bewegt, Seite ' + (aktiv + 1) + ' bleibt'); return; }
    var i = L.seiteNachOrt(strecken(), pos, aktiv, GLEICH_NAH);
    console.log('Standort: nächste Seite ' + (i + 1) + (i === aktiv ? ' (schon aktiv)' : ''));
    if (i === aktiv) return;
    var m = {}; m[keys.SPRUNG] = i; senden(m);
  });
}

Pebble.addEventListener('ready', function () {      // App geöffnet
  ablauf = null;
  try { if (localStorage.getItem('strecken') && localStorage.removeItem) localStorage.removeItem('strecken'); } catch (e) {}   // Paare bis 0.42
  einrichtungSenden();
  routenSenden();
  // Seit 0.6.6: die App schließt sich nach 10 s Ruhe. Wer kurz danach wieder öffnet, will die letzte Seite —
  // nach Standort gesprungen wird erst nach einer längeren Pause (PAUSE_S).
  var zuletzt = parseInt(localStorage.getItem('offen') || '0', 10), kurz = jetztS() - zuletzt < PAUSE_S;
  localStorage.setItem('offen', String(jetztS()));
  var a = aktivLesen();
  senden(fahrtNachricht(a));
  if (a) {                             // aktive Fahrt: gleich deren Ansicht, die Seite dahinter lädt trotzdem
    var m = {}; m[keys.SPRUNG] = 0; m[keys.RUBRIK] = RUBRIK_FAHRT; senden(m);
    console.log('Aktive Fahrt: ' + a.titel.klar + ' bis ' + hm(a.ende));
  }
  if (rubrik() === 1) { if (routen().length) { routeLaden(aktiveRoute()); if (!kurz && !a) routenSprung(); } return; }
  if (strecken().length) { merken(aktiveSeite()); streckeLaden(aktiveSeite()); if (!kurz && !a) standortSprung(); }
});
var PAUSE_S = 1800;

function wert(p, k) { return p[k] !== undefined ? p[k] : p[keys[k]]; }

// Uhr -> Handy: REQUEST (Seite) + RUBRIK + DETAIL (Nummer der Abfahrt/Verbindung, -1 = keine), oder AKTION + WAHL (+ TEXT)
Pebble.addEventListener('appmessage', function (e) {
  var p = e.payload || {};
  var aktion = wert(p, 'AKTION'), rub = wert(p, 'RUBRIK'), det = wert(p, 'DETAIL');
  if (det === undefined) det = -1;
  localStorage.setItem('offen', String(jetztS()));
  if (ablauf && ablauf.fahrten && aktion === undefined && det !== LISTE) ablauf = null;   // WEITERE FAHRTEN verlassen
  if (aktion !== undefined) return menueAktion(aktion, wert(p, 'WAHL') || 0, p, det);
  if (rub === RUBRIK_FAHRT) return fahrtSenden();
  var s = wert(p, 'REQUEST');
  if (rub === 1) {
    localStorage.setItem('rubrik', '1');
    if (s !== undefined) localStorage.setItem('rseite', String(s));
    return routeLaden(aktiveRoute(), det);
  }
  if (rub === 0) localStorage.setItem('rubrik', '0');
  if (s !== undefined) { localStorage.setItem('seite', String(s)); merken(aktiveSeite()); }
  streckeLaden(aktiveSeite(), det);
});

// ---------- Uhr-Menü: Seiten an der Uhr anlegen, ändern, löschen ----------
// Listen und Haltestellen immer über Transitous (keine Echtzeit nötig, kein RMV-Kontingent).
// Uhr -> Handy: AKTION + WAHL. Handy -> Uhr: Liste (L_TITEL, L_ANZAHL, L_AB, L_TEXT[10]) in Blöcken zu 10,
// Fortschritt L_LADE, L_ANZAHL = -1 heißt "Ablauf beendet, zurück ins Uhr-Menü".
// Nach jeder Änderung: localStorage -> einrichtungSenden() -> streckeLaden() — dieselben Strecken wie am Handy.
var A_NEU = 1, A_RUECKFAHRT = 2, A_AENDERN = 3, A_LOESCHEN = 4, A_WAHL = 5, A_ZURUECK = 6, A_LAYOUT = 7, A_UMKREIS = 8, A_QUELLE = 9, A_ABFAHRT = 10, A_DAUER = 11, A_HIER = 13;
// seit 0.6.1: Strecken, Sofort-Strecke, Favoriten, Suche, Einstellungen der Verbindungssuche
var A_R_NEU = 20, A_R_LOESCHEN = 21, A_R_RUECK = 22, A_SOFORT = 23, A_SOFORT_NR = 24, A_FAVORITEN = 25, A_TIPP = 26, A_SUCHTEXT = 27,
    A_UMSTIEGE = 28, A_FUSSWEG = 29, A_UMSTZEIT = 30;
var A_ALLE_LOESCHEN = 34, A_FAV_SEITE = 35, A_SOFORT_SPEICHERN = 36;   // 0.8.0
var A_R_ANKUNFT = 37;                   // 0.11.0
var BLOCK = 10;        // muss zu L_TEXT[10] in package.json passen
var MAXL = 300;        // muss zu MAXL in main.c passen
var VTXT = 64;         // Vorschlag FRUEHER DA, beide Zeilen (Puffer auf der Uhr, 0.12.0)
var LTXT = 31;         // Zeichen je Listeneintrag (Puffer 32 auf der Uhr)
var NAH = 10;          // so viele Haltestellen vom Standort
var ZIEL_DIREKT = 40;  // mehr Ziele (Hbf mit allen Linien: über 300): erst Anfangsbuchstabe wählen

function transitousHolen(pfad, fertig) {
  var erledigt = false;
  function ende(f, d) { if (!erledigt) { erledigt = true; fertig(f, d); } }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://api.transitous.org/api/' + pfad, true);
  try { xhr.setRequestHeader('User-Agent', 'pebble-linie8/0.9.0 (privat)'); } catch (e) {}
  xhr.onload = function () {
    if (xhr.status !== 200) return ende('HTTP ' + xhr.status);
    try { ende(null, JSON.parse(xhr.responseText)); } catch (e) { ende('Antwort unlesbar'); }
  };
  xhr.onerror = function () { ende('kein Netz'); };
  setTimeout(function () { ende('kein Netz'); }, 30000);   // Transitous bremst bei vielen Abfragen bis ~12 s
  xhr.send();
}
var L = Logik(transitousHolen, SCHRIFT.F35);

var ablauf = null;     // laufender Menü-Ablauf: { ziel, rueck, schritte[], a, linie, erg, b, extra, genau, gen }

// frage: Bitmaske der Einträge, die an der Uhr die Bestätigungsseite brauchen (0.8.0); summen: Uhr vibriert (Vorschlag)
// sel: Eintrag, auf dem die Auswahl steht (sonst der erste; WEITERE FAHRTEN: die erste kommende, 0.13.0)
function listeSenden(titel, texte, info, frage, summen, sel) {
  schlange = schlange.filter(function (x) { return !x.liste; });   // Blöcke einer veralteten Liste verwerfen
  var n = Math.min(texte.length, MAXL);
  for (var ab = 0; ab === 0 || ab < n; ab += BLOCK) {
    var msg = {};
    if (ab === 0) {
      msg[keys.L_TITEL] = L.utf8Kuerzen(titel, LTXT); msg[keys.L_ANZAHL] = n; msg[keys.L_INFO] = L.utf8Kuerzen((info || []).join('|'), 127);
      if (frage) msg[keys.L_FRAGE] = frage;
      if (summen) msg[keys.L_SUMMEN] = 1;
      if (sel) msg[keys.WAHL] = sel;
    }
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
  var s = ablauf.schritte[ablauf.schritte.length - 1], frage = 0;
  s.eintraege.forEach(function (x, i) { if (x.frage && i < 31) frage |= 1 << i; });   // Eintrag mit frage: Bestätigung an der Uhr
  listeSenden(s.titel, s.eintraege.map(function (x) { return x.t; }), s.info, frage, s.summen, s.sel);
  s.summen = false;                      // nur beim ersten Zeigen vibrieren
}

function schritt(titel, eintraege, wahl, info, summen) {   // info: Zeilen über der Liste (0.7.0, Vorschlag)
  ablauf.laedt = false;
  ablauf.schritte.push({ titel: titel, eintraege: eintraege, wahl: wahl, info: info, summen: summen });
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
function mitM(name, m, stadt) {        // Entfernung hinten (ab 1 km als "10.4KM"), Name notfalls gekürzt, damit sie sichtbar bleibt
  var hinten = m ? ' ' + km(m) : '';
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
      // seit 0.8.0 wie alle Ortslisten: ALLE IN DER NAEHE · -- IN DER NAEHE -- · -- FAVORITEN -- · -- ZULETZT -- · SUCHEN (nur Haltestellen)
      var r = umkreis(), eintraege = [{ t: T('ALLE IN DER NAEHE ', 'Alle in der Nähe ') + umkreisText(r), um: { lat: pos.lat, lon: pos.lon, r: r, stadt: liste[0].name } }];
      eintraege.push(trenner(T('IN DER NAEHE', 'In der Nähe')));
      eintraege = eintraege.concat(liste.map(function (h) { return { t: mitM(h.name, h.m, L.stadtVon(h.name)), h: h }; }));
      favEintraege(eintraege, pos, null, true);
      zuletztEintraege(eintraege, pos, null, true);
      eintraege.push({ t: T('SUCHEN', 'Suchen'), suchen: true });
      schritt(T('HALTESTELLE', 'Haltestelle'), eintraege, function (x) {
        if (x.um) { ablauf.um = x.um; ablauf.a = null; return schrittLinie(); }
        ablauf.um = null;
        if (x.suchen) return schrittSuchen(true, function (o) { ablauf.a = { id: o.id, name: o.name, lat: o.lat, lon: o.lon }; schrittLinie(); });
        if (x.ort) { genutzt(x.ort); ablauf.a = { id: x.ort.id, name: x.ort.name, lat: x.ort.lat, lon: x.ort.lon }; return schrittLinie(); }
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
  schritt(T('RICHTUNG', 'Richtung'), ohneZiel(eintraege), function (x) {
    if (x.ohne) return hinSpeichern(null, null);
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
  schritt(T('AUSSTIEG A-Z', 'Ausstieg A-Z'), ohneZiel(reihe.map(function (k) { return { t: k + ' (' + gruppen[k].length + ')', liste: gruppen[k] }; })), function (x) {
    if (x.ohne) return hinSpeichern(null, null);
    zielListe(x.liste);
  });
}

// Seite ohne Ausstieg (seit 0.50, Begriff seit 0.8.0): oben in Richtung, Ausstieg A-Z und Ausstieg. Nur bei fester
// Haltestelle, nicht "alle in der Nähe". Ausstieg statt Ziel: eine Haltestelle auf der Linie, kein beliebiger Ort.
function ohneZiel(eintraege) {
  if (ablauf.um) return eintraege;
  return [{ t: T('OHNE AUSSTIEG', 'Ohne Ausstieg'), ohne: true }].concat(eintraege);
}

function zielListe(eintraege) {
  schritt(T('AUSSTIEG', 'Ausstieg'), ohneZiel(eintraege).slice(0, MAXL), function (x) {
    if (x.ohne) return hinSpeichern(null, null);
    var z = x.z;
    ablauf.b = { id: z.id, name: z.name, lat: z.lat, lon: z.lon };
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
    ablauf.extra = { linien: nurLinie(x.e.linien), hin: true, rueck: false };
    schrittPruefen();
  });
}

function nurLinie(liste) {              // gewählte Linie aus Schritt 2 (oder alle)
  var l = ablauf.linie;
  return (!l || l === '*') ? liste : liste.filter(function (x) { return x === l; });
}

// Rückfahrt (seit 0.33, seit 0.50 als eigene Seite über Menü > Rückfahrt). Grundsatz: Ankunft genau am Start A ist
// der Normalfall; der Umkreis um A gilt nur, wenn er bewusst gewählt wird — nie automatisch. Die neue Seite fährt
// c -> d (ohne d: A). Daten: Fahrten, die an A (bzw. im Umkreis) ankommen — L.ankunftUm, vorgeladen beim Start des Ablaufs.
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

function einstiegText(k, stadt) {         // Rückfahrt: der Ausstieg der Hinfahrt zuerst
  return k.ziel ? mitZusatz(k.name, T(' (AUSSTIEG)', ' (Ausstieg)'), stadt) : mitM(k.name, k.m, stadt);
}

function genauLaden(weiter) {           // Kandidaten mit Ankunft genau an A, einmal je Ablauf
  if (ablauf.genau) return weiter(null);
  L.ankunftUm(ablauf.a, L.GENAU_R, aktuell(function (n, g) { ladeSenden(T('SUCHE ', 'Suche ') + n + '/' + g); }), aktuell(function (f, fahrten) {
    if (!f) ablauf.genau = L.rueckKandidaten(fahrten, ablauf.a, ablauf.b, 0);
    weiter(f);
  }));
}

// 4. Linien mit Direktverbindung a -> b prüfen, dann speichern. Die Rückfahrt legt man bei Bedarf danach an
//    (Menü > Rückfahrt), sie wird nicht mehr automatisch angeboten (seit 0.50).
function schrittPruefen() {
  ladeSenden(T('PRUEFE', 'Prüfe'), true);
  var ex = ablauf.extra;
  L.direkt(ablauf.a.id, ablauf.b.id, aktuell(function (f, l) {
    if (f) return fehlerSchritt(f, schrittPruefen);
    hinSpeichern(ablauf.b, vereinigen(l, ex.hin ? ex.linien : []));
  }));
}

// 5. Rückfahrt: Einstieg bis 2 km um das Ziel, nur mit Direktverbindung genau nach A, das Ziel selbst zuerst.
//    Darunter: Umkreis. Nichts gewünscht: Zurück-Taste. ohneZiel: das Ziel selbst nicht anbieten.
function schrittRueck(ohneZiel) {
  ladeSenden(T('SUCHE', 'Suche'), true);
  genauLaden(function (f) {
    if (f) return fehlerSchritt(f, function () { schrittRueck(ohneZiel); });
    var stadt = L.stadtVon(ablauf.a.name), r = umkreis();
    var liste = bevorzugt(ablauf.genau.filter(function (k) { return !(ohneZiel && k.ziel); }));
    var eintraege = liste.map(function (k) { return { t: einstiegText(k, stadt), k: k }; });
    var titel = eintraege.length ? T('RUECKFAHRT AB', 'Rückfahrt ab') : T('NICHTS NACH ', 'Nichts nach ') + nameT(ablauf.a.name, stadt);
    eintraege.push({ t: T('UMKREIS ', 'Umkreis ') + umkreisText(r), umkreis: r });
    schritt(titel, eintraege, function (x) {
      if (x.umkreis) return schrittEinstieg(x.umkreis);
      var c = halt(x.k); c.linien = x.k.linien;
      rueckSpeichern(c, null);
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
      eintraege.push({ t: T('ABBRECHEN', 'Abbrechen'), ohne: true });
    }
    schritt(titel, eintraege, function (x) {
      if (x.ohne) return menueEnde(true);
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
    rueckSpeichern(c, x.z.start ? null : halt(x.z));
  });
}

// 6. Seite speichern, Kurznamen automatisch, Seite anzeigen. neu = { a, b (null = ohne Ausstieg), linien, alle }.
//    Neue Seite: hinten anfügen. Ändern: an derselben Stelle ersetzen. Rückfahrt: direkt hinter der Seite einfügen,
//    von der sie ausgeht. Rubrik voll (seit 0.8.0): erst jetzt fragen, welche ersetzt wird — die gewählte fällt weg,
//    die neue kommt an ihren normalen Platz. Abbrechen (Zurück) löscht nichts.
function mitKurz(h, stadt) { return h ? { id: h.id, name: h.name, kurz: L.kurzname(h.name, stadt), lat: h.lat, lon: h.lon } : null; }

// ---------- Voll: ersetzen (0.8.0) ----------
// Liste aller Einträge, Select wählt, die Uhr fragt auf der Bestätigungsseite nach (frage), dann weiter(Index).
function ersetzenFragen(texte, weiter) {
  if (!ablauf) neuerAblauf(-1);
  schritt(T('ERSETZEN?', 'Voll: welche ersetzen?'), texte.map(function (t, i) { return { t: L.utf8Kuerzen(t, LTXT), i: i, frage: true }; }),
          function (x) { weiter(x.i); });
}
function rueckPlatz(hin, weg) { return weg === hin ? weg : hin > weg ? hin : hin + 1; }   // hinter die (ggf. nachgerückte) Hinfahrt
function seitenText(st) {
  var stadt = L.stadtVon(st.a.name);
  return T(st.a.kurz || L.kurzname(st.a.name, stadt), L.klarname(st.a.name, stadt)) +
         (st.b ? ' > ' + T(st.b.kurz || L.kurzname(st.b.name, stadt), L.klarname(st.b.name, stadt)) : '');
}

function speichern(neu) {
  var liste = strecken(), i = ablauf.ziel, rueck = !!ablauf.rueck;
  if (!rueck && i >= 0 && i < liste.length) { liste[i] = neu; return seiteFertig(liste, i, neu); }
  if (liste.length < MAXS) {
    var j = rueck ? Math.min(i + 1, liste.length) : liste.length;
    liste.splice(j, 0, neu);
    return seiteFertig(liste, j, neu);
  }
  ersetzenFragen(liste.map(seitenText), function (weg) {
    var l = strecken(), pos;
    l.splice(weg, 1);
    pos = rueck ? rueckPlatz(i, weg) : l.length;
    l.splice(pos, 0, neu);
    console.log('Menü: Seite ' + (weg + 1) + ' ersetzt');
    seiteFertig(l, pos, neu);
  });
}
function seiteFertig(liste, i, neu) {
  neu.zuletzt = Math.floor(Date.now() / 1000);
  streckenSchreiben(liste);
  localStorage.setItem('seite', String(i));
  console.log('Menü: Seite ' + (i + 1) + ' gespeichert: ' + neu.a.kurz + (neu.b ? ' -> ' + neu.b.kurz : ' (alle Abfahrten)') +
              ' [' + neu.linien.join(',') + (neu.alle ? ' alle' : '') + ']');
  ablauf = null;
  einrichtungSenden();                   // Uhr schließt das Menü, sobald die Einrichtung ankommt
  streckeLaden(i);
}

// Neue Fahrt / Fahrt ändern. b = null: ohne Ziel. hin = Linien mit Direktverbindung (nur mit Ziel).
function hinSpeichern(b, hin) {
  var l = ablauf.linie, stadt = L.stadtVon(ablauf.a.name);
  var neu = { a: mitKurz(ablauf.a, stadt), b: mitKurz(b, stadt) };
  if (l && l !== '*') { neu.alle = false; neu.linien = [l]; }
  else { neu.alle = true; neu.linien = b ? (hin || []) : Object.keys((ablauf.erg && ablauf.erg.linien) || {}).sort(L.sortDe); }
  speichern(neu);
}

// Rückfahrt als neue Seite c -> d (ohne d: zurück genau zum Start A der Ausgangsseite). Linienfilter der
// Ausgangsseite gilt weiter, soweit die Linien auch zurückfahren; sonst die Linien, die zurückfahren.
function rueckSpeichern(c, d) {
  var stadt = L.stadtVon(ablauf.a.name), cl = c.linien || [], erlaubt = ablauf.erlaubt;
  var passend = erlaubt ? cl.filter(function (l) { return erlaubt.indexOf(l) >= 0; }) : [];
  speichern({ a: mitKurz(c, stadt), b: mitKurz(d || ablauf.a, stadt), alle: !erlaubt,
              linien: (passend.length ? passend : cl).slice().sort(L.sortDe) });
}

function loeschen(i) {
  var liste = strecken();
  ablauf = null;
  if (i >= 0 && i < liste.length) liste.splice(i, 1);
  streckenSchreiben(liste);
  localStorage.setItem('seite', String(Math.max(0, Math.min(i, liste.length - 1))));
  console.log('Menü: Seite ' + (i + 1) + ' gelöscht, ' + liste.length + ' übrig');
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

function menueAktion(aktion, wahl, p, det) {
  try { menueAktion2(aktion, wahl, p || {}, det === undefined ? -1 : det); } catch (e) { ausnahme(e); }
}

function neuerAblauf(ziel) { ablauf = { ziel: ziel, schritte: [], gen: 0, laedt: true }; }

function menueAktion2(aktion, wahl, p, det) {
  console.log('Menü: Aktion ' + aktion + ' Wahl ' + wahl);
  if (aktion === A_LOESCHEN) return loeschen(wahl);
  if (aktion === A_R_LOESCHEN) return routeLoeschen(wahl);
  if (aktion === A_R_RUECK) return routeRueck(wahl);
  if (aktion === A_R_ANKUNFT) return ankunftWaehlen(wahl);
  if (aktion === A_SOFORT_NR) return sofortLaden(wahl, det);
  if (aktion === A_R_NEU) { neuerAblauf(wahl); return schrittVon(); }
  if (aktion === A_SOFORT) { neuerAblauf(-1); return schrittSofort(); }
  if (aktion === A_FAVORITEN) { neuerAblauf(-1); return schrittFavoriten(); }
  if (aktion === A_TIPP) return tippen(wert(p, 'TEXT') || '');
  if (aktion === A_SUCHTEXT) { if (!ablauf) return menueEnde(); if (ablauf.umbenennen) return umbenennen(wert(p, 'TEXT') || ''); return suchtext(wert(p, 'TEXT') || ''); }
  if (aktion === A_FAV_SEITE) return favAusSeite(wert(p, 'RUBRIK') === 1 ? 1 : 0, wahl);
  if (aktion === A_SOFORT_SPEICHERN) return sofortSpeichern(wert(p, 'RUBRIK') === 1 ? 1 : 0);
  if (aktion === A_ALLE_LOESCHEN) return alleLoeschen(wahl);
  if (aktion === A_UMSTIEGE || aktion === A_FUSSWEG || aktion === A_UMSTZEIT) {   // an der Uhr gewählt: merken, Strecke neu laden
    var k = aktion === A_UMSTIEGE ? 'umstiege' : aktion === A_FUSSWEG ? 'fussweg' : 'umstzeit';
    localStorage.setItem(k, String(wahl));
    console.log('Menü: Umstiege ' + umstiege() + ', Fußweg ' + fussweg() + ', Umstiegszeit ' + umstzeit());
    if (rubrik() === 1 && routen().length) routeLaden(aktiveRoute());
    return;
  }
  if (aktion === A_LAYOUT) {             // an der Uhr umgeschaltet: merken, damit Seite und Listen passen
    layoutMerken(wahl);
    console.log('Menü: Ansicht ' + layout() + (invers() ? ', invertiert' : '') + (kontrast() ? ', hoher Kontrast' : ''));
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
  if (aktion === A_NEU || aktion === A_AENDERN) {
    ablauf = { ziel: aktion === A_NEU ? -1 : wahl, schritte: [], gen: 0, laedt: true };
    return schrittNah();
  }
  if (aktion === A_RUECKFAHRT) {         // neue Seite hinter Seite wahl, zurück zu deren Start (voll: ersetzen beim Speichern)
    var st = strecken()[wahl];
    if (!st || !st.b) return menueEnde();
    ablauf = { ziel: wahl, rueck: true, schritte: [], gen: 0, laedt: true, a: halt(st.a), b: halt(st.b),
               extra: null, erlaubt: st.alle ? null : st.linien };
    return koordinaten(ablauf.a, aktuell(function (f0) {
      koordinaten(ablauf.b, aktuell(function (f) {
        if (f0 || f) return fehlerSchritt(f0 || f, function () { menueAktion2(A_RUECKFAHRT, wahl); });
        vorladen(ablauf.a);
        schrittRueck(false);
      }));
    }));
  }
  if (aktion === A_FAHRT_START) return fahrtStarten(wahl);
  if (aktion === A_VERPASST) return verpasstWaehlen();
  if (aktion === A_FAHRT_ENDE) { aktivSchreiben(null); senden(fahrtNachricht(null)); console.log('Fahrt beendet'); return menueEnde(true); }
  if (aktion === A_HIER) return hierLaden(wahl, det);
  if (aktion === A_FAHRTEN) return fahrtenListe(wert(p, 'RUBRIK') === 1 ? 1 : 0, wahl);
  if (!ablauf) return menueEnde();
  if (aktion === A_ZURUECK && ablauf.frage !== undefined) {   // Frage weggedrückt: in 2 min wieder fragen
    var af = aktivLesen();
    if (af) { af.spaeter[ablauf.frage] = jetztS(); aktivSchreiben(af); }
    ablauf = null;
    return fahrtOeffnen();
  }
  if (aktion === A_ZURUECK) {
    ablauf.gen++;                        // laufende Abfragen verwerfen
    if (ablauf.imRad) { ablauf.imRad = false; ablauf.umbenennen = null; ablauf.laedt = false; return schrittZeigen(); }   // aus Rad/Diktat: wieder SUCHEN
    if (ablauf.laedt && ablauf.schritte.length) { ablauf.laedt = false; return schrittZeigen(); }   // Laden abbrechen
    ablauf.schritte.pop();
    if (!ablauf.schritte.length) return menueEnde();
    return schrittZeigen();
  }
  if (aktion === A_WAHL) {
    var s = ablauf.schritte[ablauf.schritte.length - 1];
    if (!s || !s.eintraege[wahl]) return schrittZeigen();
    if (s.eintraege[wahl].trenner) return;   // Zwischenüberschrift: nichts tun (die Uhr schickt sie gar nicht erst)
    ablauf.gen++;
    ablauf.laedt = true;                 // bis der nächste Schritt steht: Zurück bricht nur das Laden ab
    s.wahl(s.eintraege[wahl]);
  }
}

// Zeit für Listen und Protokoll
function mezVersatz(t) { var y = new Date(t * 1000).getUTCFullYear(); return t >= letzterSonntag0100(y, 3) && t < letzterSonntag0100(y, 10) ? 7200 : 3600; }
function hm(t) {                        // UTC-Sekunden -> "HH:MM" deutsche Zeit, unabhängig von der Zeitzone des Handys
  var d = new Date((t + mezVersatz(t)) * 1000);
  return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
}

// Schnellere Abfahrt (0.38 bis 0.7.1, Menü der Seite) entfällt seit 0.8.0: die App schlägt selbst vor (FRUEHER DA).

// ---------- Vorschlag FRUEHER DA (0.8.0, Wunsch Seb 2026-10-10) ----------
// Auf einer Seite mit Ziel (Abfahrten mit Ausstieg, Strecken mit festem Start), wenn man im Umkreis ihres Starts steht:
// Verbindung vom Standort zum Ziel, die mindestens 10 min vor der ersten zu Fuß erreichbaren Fahrt der Seite ankommt.
// Die Uhr zeigt sie an Stelle der dritten Zeile (V_TEXT "vorn|hinten") und als obersten Menüeintrag; DETAIL 3 zeigt
// ihre Details, dort Select > FAHRT STARTEN. Die Seite selbst bleibt unverändert. Höchstens alle 3 min neu gerechnet.
var VORSCHLAG = 3, FRUEHER_S = 600, VORSCHLAG_NEU_S = 180, VORSCHLAG_GILT_S = 600;
var vorschlaege = {};                    // 'rubrik:seite' -> { key, t, text, v, nach {led, klar}, ziel {lat, lon} }
function seitenZiel(st) { var stadt = L.stadtVon(st.a.name); return { led: st.b.kurz || L.kurzname(st.b.name, stadt), klar: L.klarname(st.b.name, stadt) }; }
function vorschlagText(rub, i, key) {
  var x = vorschlaege[rub + ':' + i];
  return x && x.key === key && x.v && jetztS() - x.t < VORSCHLAG_GILT_S && x.v.los >= jetztS() - 60 ? x.text : '';
}
function vorschlagPruefen(rub, i, key, start, ziel, nach, bezugAn) {
  var k = rub + ':' + i, alt = vorschlaege[k];
  if (alt && alt.key === key && jetztS() - alt.t < VORSCHLAG_NEU_S) return;
  vorschlaege[k] = { key: key, t: jetztS(), text: alt && alt.key === key ? alt.text : '', v: alt && alt.key === key ? alt.v : null, nach: nach, ziel: ziel };
  function fertig(v, text) {
    vorschlaege[k] = { key: key, t: jetztS(), text: text || '', v: v || null, nach: nach, ziel: ziel };
    var m = {}; m[keys.RUBRIK] = rub; m[keys.SEITE] = i; m[keys.V_TEXT] = text || ''; senden(m);
    if (text) console.log('Vorschlag Seite ' + rub + ':' + (i + 1) + ': ' + text);
  }
  if (!start || start.lat === undefined || !ziel || ziel.lat === undefined) return fertig(null);
  standort(function (pos) {
    if (!pos) return fertig(null);
    var m = L.entfernung(pos.lat, pos.lon, start.lat, start.lon);
    if (m > umkreis()) return fertig(null);                // nicht in der Nähe des Starts: kein Vorschlag
    var bez = bezugAn(jetztS() + L.gehSek(m));
    if (!bez) return fertig(null);
    verbindungenHolen(pos, ziel, function (f, liste) {
      if (f !== null || !liste) return fertig(null);
      var opt = StreckenM.auswaehlen(liste, jetztS(), 5).filter(function (v) { return !v.legs.some(function (l) { return !l.fuss && l.ausfall; }); })
                         .sort(function (a, b) { return a.an - b.an; });
      var best = opt[0];
      if (!best || bez - best.an < FRUEHER_S) return fertig(null);
      var min = Math.round((bez - best.an) / 60);
      // Ankunft vorn: sie darf nie abgeschnitten werden, die Linienkette schon (0.12.0, vorher fehlte bei langem Text die letzte Ziffer)
      fertig(best, L.utf8Kuerzen(T("FRUEHER DA -" + min + "'", 'Früher da: ' + min + ' min') + '|' + T('AN ', 'an ') + hm(best.an) + T('  ', ' · ') + StreckenM.kette(best), VTXT - 1));
    });
  });
}
function vorschlagDetailSenden(rub, i) {
  var x = vorschlaege[rub + ':' + i], v = x && x.v;
  if (!v) return detailSenden(rub, i, VORSCHLAG, []);
  var erste = v.legs.filter(function (l) { return !l.fuss; })[0], stadt = L.stadtVon(erste ? erste.von : '');
  detailSenden(rub, i, VORSCHLAG, StreckenM.detailVerbindung(v, textHilfe(stadt), T('HIER', 'Hier'), TT(x.nach), umstzeit(), DMAX), undefined, x.t);
  letztesDetail = { rubrik: rub, art: 'route', v: v, stadt: stadt, ziel: x.ziel ? { lat: x.ziel.lat, lon: x.ziel.lon } : null,
                    von: { led: 'HIER', klar: 'Hier' }, nach: x.nach, titel: x.nach };
}

// ---------- Weitere Fahrten (0.13.0) ----------
// Wunsch Seb 2026-10-13: im Bus saß er schon und konnte die eigene Fahrt nicht mehr wählen (sie stand nicht mehr auf
// der Seite). Menü der Seite > WEITERE FAHRTEN: bis zu 6 Fahrten der letzten 30 min und 12 kommende, frisch geholt (mit
// Echtzeit, ohne Puffer; zwei Abfragen, sonst füllen an großen Haltestellen die abgefahrenen die Liste); die Auswahl steht
// auf der ersten kommenden. Oben FRUEHERE LADEN, unten SPAETERE LADEN holen weitere dazu.
// Wahl -> Details wie auf der Seite (DETAIL = LISTE), dort Select -> FAHRT STARTEN. Zurück aus den Details: die Liste.
var LISTE = 4, A_FAHRTEN = 38;          // wie LISTE und A_FAHRTEN in main.c
var FAHRTEN_VOR_S = 1800, FAHRTEN_VOR_N = 6, FAHRTEN_SCHRITT_S = 3600, FAHRTEN_N = 12, FAHRTEN_MAX = 60;
var fahrtenWahl = null;                 // { rub, seite, o, x, q, stand }: gewählte Fahrt, Grundlage der Details mit LISTE

function fahrtenObjekt(rub, i) {        // Seite i der Rubrik: Abfahrten-Seite bzw. Strecke (HIER: die Sofort-Ansicht)
  if (rub === 1) return i === HIER ? (sofortAktuell ? { von: null, nach: sofortAktuell } : null) : routen()[i] || null;
  return i === HIER ? (hierAktuell ? { a: halt(hierAktuell), b: null, alle: true, linien: [] } : null) : strecken()[i] || null;
}
function abfahrtZeit(x) { return x.t; }
function verbindungZeit(v) { return v.los; }
// Abfahrten der Seite st ab Zeit ab; Quelle wie auf der Seite (Auto: RMV, bei Fehler Transitous). fertig(fehler, liste, quelle)
function abfahrtenAb(st, ab, fertig) {
  var linien = linienFuer(st), q = quelle();
  function trans() {
    function cb(f, erg) { fertig(f, erg ? erg.fahrten : null, 'TRANS'); }
    if (st.b) holen(st.a.id, st.b.id, linien, cb, FAHRTEN_N, ab); else tafelTransitous(st.a, linien, cb, ab, FAHRTEN_N);
  }
  if (q === 'trans' || (q === 'auto' && !rmvSchluessel())) return trans();
  if (!rmvSchluessel()) return fertig(STATUS_FEHLER, null, 'RMV');
  function rmv(f, erg) {
    if (f === null) return fertig(null, erg.fahrten, 'RMV');
    if (q === 'rmv') return fertig(f, null, 'RMV');
    trans();
  }
  if (!st.b) return tafelRmv(st.a, linien, rmv, ab, FAHRTEN_N);
  // RMV-Trip liefert je Abfrage höchstens 6 Fahrten: weiter ab der letzten, höchstens dreimal
  var alle = [], live = false, runde = 0;
  (function weiter(t) {
    holenRmv(st.a, st.b, linien, function (f, erg) {
      if (f !== null) return alle.length ? rmv(null, { fahrten: alle, live: live }) : rmv(f);
      var neu = erg.fahrten.filter(function (x) { return !alle.some(function (y) { return abfahrtKennung(y) === abfahrtKennung(x); }); });
      alle = alle.concat(neu); live = live || erg.live;
      var letzte = alle[alle.length - 1];
      if (alle.length >= FAHRTEN_N || !neu.length || ++runde >= 3) return rmv(null, { fahrten: alle.slice(0, FAHRTEN_N), live: live });
      weiter(letzte.t - (letzte.d === AUSFALL ? 0 : letzte.d) * 60 + 60);
    }, 99, t);
  })(ab);
}
// Verbindungen der Strecke r ab Zeit ab (fester Start oder Standort), bis FAHRTEN_N. fertig(fehler, liste, quelle)
function verbindungenAb(r, ab, fertig) {
  startOrt(r, function (von) {
    if (!von) return fertig('standort');
    var alle = [], runde = 0, qq = '';
    (function weiter(t) {
      verbindungenHolen(von, r.nach, function (f, liste, q) {
        if (f !== null) return alle.length ? fertig(null, alle, qq) : fertig(f, null, q);
        qq = q;
        var neu = liste.filter(function (v) { return v && !v.nurFuss && !alle.some(function (w) { return StreckenM.kennung(w) === StreckenM.kennung(v); }); });
        alle = alle.concat(neu).sort(function (a, b) { return a.los - b.los; });
        if (alle.length >= FAHRTEN_N || !neu.length || ++runde >= 3) return fertig(null, alle, qq);
        weiter(alle[alle.length - 1].los + 60);
      }, 0, t);
    })(ab);
  });
}
function verzText(d) { return d === AUSFALL ? '' : d ? ' ' + (d > 0 ? '+' : '') + d + "'" : ''; }
// Listenzeile: "09:26 +2' · 8 · an 09:39" (Ziel) bzw. "09:26 · 8 · Eigenheim" (ohne Ziel); Strecke "09:20-09:51 · 8 > S1"
function fahrtZeile(rub, x, o) {
  var sep = T(' ', ' · ');
  if (rub === 1) {
    var erste = x.legs.filter(function (l) { return !l.fuss; })[0], d = erste ? (erste.ausfall ? AUSFALL : erste.del) : 0;
    return hm(x.los) + '-' + hm(x.an) + verzText(d) + sep + (d === AUSFALL ? T('FAELLT AUS', 'fällt aus') + sep : '') + StreckenM.kette(x);
  }
  var plan = x.t - (x.d === AUSFALL ? 0 : x.d) * 60, stadt = L.stadtVon(o.a.name);
  var rest = x.d === AUSFALL ? T('FAELLT AUS', 'fällt aus') : o.b ? (x.an ? T('AN ', 'an ') + hm(x.an) : '') : nameT(x.z || x.r || '', stadt);
  return hm(plan) + verzText(x.d) + sep + x.l + (rest ? sep + rest : '');
}
function fahrtenListe(rub, i) {
  if (i < 0) {                          // aus den Details zurück: dieselbe Liste, Auswahl auf der gewählten Fahrt
    if (ablauf && ablauf.fahrten) { ablauf.laedt = false; return schrittZeigen(); }
    if (!fahrtenWahl) return menueEnde();
    rub = fahrtenWahl.rub; i = fahrtenWahl.seite;
  }
  var o = fahrtenObjekt(rub, i);
  if (!o) return menueEnde();
  neuerAblauf(-1);
  ablauf.fahrten = { rub: rub, seite: i, o: o, liste: [], q: '', stand: 0 };
  fahrtenLaden(jetztS(), 0);
}
function fahrtenLaden(ab, richtung) {   // richtung 0: neu (ab = jetzt), -1: frühere vor ab, 1: spätere ab ab
  var F = ablauf.fahrten, zeit = F.rub === 1 ? verbindungZeit : abfahrtZeit, kenn = F.rub === 1 ? StreckenM.kennung : abfahrtKennung;
  var hole = F.rub === 1 ? function (t, cb) { verbindungenAb(F.o, t, cb); } : function (t, cb) { abfahrtenAb(F.o, t, cb); };
  var fertig = aktuell(function (f, liste, q) {
    if (f !== null && f !== undefined) return fehlerSchritt(f === STATUS_NETZ ? 'kein Netz' : f, function () { fahrtenLaden(ab, richtung); });
    var alt = F.liste, frisch = (liste || []).filter(function (x) { return !alt.some(function (y) { return kenn(y) === kenn(x); }); });
    var neu = richtung === 0 ? frisch.filter(function (x) { return zeit(x) < ab - 60; }).slice(-FAHRTEN_VOR_N)          // abgefahrene
                                 .concat(frisch.filter(function (x) { return zeit(x) >= ab - 60; }).slice(0, FAHRTEN_N))   // kommende
            : richtung < 0 ? frisch.filter(function (x) { return zeit(x) < ab; }).slice(-FAHRTEN_N)
            : frisch.filter(function (x) { return zeit(x) >= ab; }).slice(0, FAHRTEN_N);
    F.liste = alt.concat(neu).sort(function (a, b) { return zeit(a) - zeit(b); });
    if (F.liste.length > FAHRTEN_MAX) F.liste = richtung < 0 ? F.liste.slice(0, FAHRTEN_MAX) : F.liste.slice(-FAHRTEN_MAX);
    F.q = q || F.q; F.stand = jetztS();
    // Auswahl: neu die erste kommende, früher die letzte neue vor der alten Liste, später die erste neue dahinter
    var k = -1;
    F.liste.forEach(function (x, n) { if (k < 0 && (richtung < 0 ? kenn(x) === kenn(alt[0] || x) : zeit(x) >= ab - (richtung === 0 ? 60 : 0))) k = n; });
    if (richtung < 0) k = Math.max(0, k - 1);
    if (k < 0) k = Math.max(0, F.liste.length - 1);
    console.log('Weitere Fahrten: ' + F.liste.length + ' (' + neu.length + ' neu, ' + F.q + '), Auswahl ' + (k + 1));
    var eintraege = [{ t: T('FRUEHERE LADEN', 'Frühere laden'), mehr: -1 }].concat(F.liste.map(function (x) { return { t: fahrtZeile(F.rub, x, F.o), x: x }; }),
                    [{ t: T('SPAETERE LADEN', 'Spätere laden'), mehr: 1 }]);
    ablauf.schritte = [];
    schritt(T('WEITERE FAHRTEN', 'Weitere Fahrten'), eintraege, function (e) {
      var j = jetztS();
      if (e.mehr) return fahrtenLaden(e.mehr < 0 ? (F.liste.length ? zeit(F.liste[0]) : j) : (F.liste.length ? zeit(F.liste[F.liste.length - 1]) + 60 : j), e.mehr);
      ablauf.laedt = false;
      ablauf.schritte[0].sel = eintraege.indexOf(e);
      fahrtenWahl = { rub: F.rub, seite: F.seite, o: F.o, x: e.x, q: F.q, stand: F.stand };
      var m = {}; m[keys.L_TITEL] = ''; m[keys.L_ANZAHL] = -7; senden(m, true);   // Uhr öffnet die Details (LISTE)
    });
    ablauf.schritte[0].sel = k + 1;     // +1: FRUEHERE LADEN steht oben
    schrittZeigen();
  });
  ladeSenden(T('LADE FAHRTEN', 'Lade Fahrten'), true);
  if (richtung > 0) return hole(ab, fertig);
  // Fahrten unmittelbar vor bis, lückenlos: Fenster w; reicht die Antwort nicht bis bis (dichte Haltestelle, die Abfrage
  // liefert nur FAHRTEN_N), noch einmal mit einem Drittel des Fensters
  function holeVor(bis, w, cb, versuche) {
    hole(bis - w, function (f, liste, q) {
      if (f !== null && f !== undefined) return cb(f, null, q);
      var l = liste || [], reicht = !l.length || zeit(l[l.length - 1]) >= bis - 60;
      if (!reicht && versuche > 0) return holeVor(bis, Math.round(w / 3), cb, versuche - 1);
      cb(null, l.filter(function (x) { return zeit(x) < bis; }), q);
    });
  }
  if (richtung < 0) return holeVor(ab, FAHRTEN_SCHRITT_S, fertig, 2);
  // neu: die letzten 30 min und ab jetzt, beide Antworten zusammen
  var teile = [], offen = 2, q0 = '', f0 = null;
  function teil(f, liste, q) {
    if (f !== null && f !== undefined) f0 = f; else { teile = teile.concat(liste || []); q0 = q || q0; }
    if (--offen) return;
    var gesehen = {};
    teile = teile.filter(function (x) { var k2 = kenn(x); if (gesehen[k2]) return false; gesehen[k2] = true; return true; }).sort(function (a, b) { return zeit(a) - zeit(b); });
    fertig(teile.length ? null : (f0 || null), teile, q0);
  }
  holeVor(ab - 60, FAHRTEN_VOR_S, teil, 2);
  hole(ab - 60, teil);
}
// Details der in der Liste gewählten Fahrt; kommt mit jeder Seitenabfrage mit DETAIL = LISTE (jede Minute neu)
function fahrtenDetailSenden(rub, seite) {
  var w = fahrtenWahl;
  if (!w || w.rub !== rub || w.seite !== seite) return detailSenden(rub, seite, LISTE, []);
  if (rub === 0) return detailAbfahrtSenden(w.o, seite, [w.x], 0, w.q, function () { return false; }, w.stand, LISTE);
  routeDetailSenden(w.o, seite, LISTE, w.x, w.stand);
}

// ---------- Abfahrten hier (seit 0.51) ----------
// Menü > Abfahrten hier: nächste Haltestelle vom Standort, alle Linien mit Endziel, ohne eine Seite anzulegen.
// Auf der Uhr blättert hoch/runter zur nächstnäheren (WAHL = Nummer in der Liste, das Handy rechnet sie um).
// Nummer 0 holt den Standort neu, andere nutzen die Liste von eben (bis 10 min alt). Platz HIER hinter den Seiten.
var HIER = MAXS, hierListe = null;
function hierLaden(k, detail) {
  function fehlerAn(status, led, klar) {
    var m = {};
    m[keys.SEITE] = HIER; m[keys.STATUS] = status; m[keys.HIER_NAME] = led; m[keys.HIER_KLAR] = klar;
    m[keys.STAND] = Math.floor(Date.now() / 1000);
    senden(m);
  }
  function weiter() {
    var liste = hierListe.liste, n = liste.length;
    if (!n) return fehlerAn(STATUS_FEHLER, 'NICHTS IN DER NAEHE', 'Nichts in der Nähe');
    var i = ((k % n) + n) % n, h = liste[i], stadt = L.stadtVon(h.name), extra = {};
    hierAktuell = h;
    extra[keys.S_FAV] = (istFav(h) ? 1 : 0) | (istFav(sofortAktuell) ? 2 : 0);
    extra[keys.HIER_NAME] = L.utf8Kuerzen(L.kurzname(h.name, stadt), 31);
    extra[keys.HIER_KLAR] = L.utf8Kuerzen(L.klarname(h.name, stadt), 31);
    extra[keys.HIER_NR] = i;
    extra[keys.HIER_N] = n;
    console.log('Hier: ' + (i + 1) + '/' + n + ' ' + h.name + ' ' + h.m + ' m');
    abfahrtenLaden({ a: halt(h), b: null, alle: true, linien: [] }, HIER, extra, 'hier', detail);
  }
  if (k !== 0 && hierListe && Date.now() - hierListe.zeit < 600000) return weiter();
  standort(function (pos) {
    if (!pos) return fehlerAn(STATUS_FEHLER, 'KEIN STANDORT', 'Kein Standort');
    L.naechsteHaltestellen(pos.lat, pos.lon, NAH, function (f, liste) {
      if (f) return fehlerAn(f === 'kein Netz' ? STATUS_NETZ : STATUS_FEHLER, 'KEINE HALTESTELLEN', 'Keine Haltestellen');
      hierListe = { liste: liste, zeit: Date.now() };
      weiter();
    });
  });
}

// ---------- Detailansicht (seit 0.6.1) ----------
// Zeilen von oben nach unten (Art, Zeit, Text, Zusatz, Steig), in Blöcken zu 8 an die Uhr (D_AB, D_N im ersten Block).
// Welche Abfahrt bzw. Verbindung: die Nummer von der Uhr; wird nur neu geladen (gleiche Nummer wie zuletzt), zählt die
// Kennung (Linie + Planzeit), damit die Ansicht nicht auf die nächste springt, sobald die erste abgefahren ist.
var DBLOCK = 8, DMAX = 40;       // muss zu D_ART[8] in package.json und DMAX in main.c passen (0.13.0: 24 -> 40)
var DTXT = 47;                   // Bytes je Detailtext, Puffer 48 auf der Uhr (bis 0.12.0: 27, lange Halte kamen gekürzt an)
var gezeigt = {};                // 'rubrik:seite' -> { nr, kennung }
function detailWahl(schl, liste, nr, kennungVon) {
  var g = gezeigt[schl], k = Math.max(0, Math.min(liste.length - 1, nr));
  if (g && (g.nr === nr || g.nr < 0 || nr < 0) && g.kennung) {   // g.nr < 0: laufende Fahrt nach dem Öffnen
    var gef = -1;
    liste.forEach(function (x, i) { if (gef < 0 && kennungVon(x) === g.kennung) gef = i; });
    if (gef >= 0) k = gef;
  }
  gezeigt[schl] = { nr: k, kennung: liste[k] ? kennungVon(liste[k]) : null };
  return k;
}
function detailSenden(rub, seite, nr, zeilen, akt, stand) {   // stand: wann die Daten abgerufen wurden (Fuß der Uhr, 0.8.0)
  zeilen = zeilen.slice(0, DMAX);
  for (var ab = 0; ab === 0 || ab < zeilen.length; ab += DBLOCK) {
    var m = {};
    m[keys.RUBRIK] = rub; m[keys.SEITE] = seite; m[keys.D_NR] = nr; m[keys.D_AB] = ab;
    if (ab === 0) { m[keys.D_N] = zeilen.length; m[keys.D_AKT] = akt === undefined ? -1 : akt; m[keys.D_STAND] = stand || 0; }
    for (var j = 0; j < DBLOCK && ab + j < zeilen.length; j++) {
      var z = zeilen[ab + j];
      m[keys.D_ART + j] = z.art; m[keys.D_ZEIT + j] = z.t || 0;
      m[keys.D_TEXT + j] = L.utf8Kuerzen(z.text, DTXT); m[keys.D_ZUS + j] = L.utf8Kuerzen(z.zus, DTXT); m[keys.D_RE + j] = L.utf8Kuerzen(z.re, 3);
    }
    senden(m);
  }
}
function textHilfe(stadt) {
  return { T: T, name: function (n) { return T(L.kurzname(n || '', stadt), L.klarname(n || '', stadt)); } };
}
// ---------- Aktive Fahrt (0.6.6, Wunsch Seb 2026-10-10) ----------
// In den Details Select > FAHRT STARTEN: die gezeigte Verbindung bzw. Abfahrt wird zur aktiven Fahrt. Sie bleibt fest
// (kein neues Suchen ab Standort), ihre Zeiten kommen live aus dem Fahrtverlauf (RMV journeyDetail, Transitous trip).
// Ende: nach der Ankunft laut Fahrplan bzw. Echtzeit, je nachdem, was später ist. Knapper oder verpasster Anschluss:
// zur Abfahrt des Anschlusses (verpasst: bei Ankunft am Umstieg) fragt die Uhr nach; die Uhr weckt sich dafür selbst
// (WECKEN). VERPASST: neue Führung ab dem Umstiegshalt zum Ziel.
// Gespeichert unter 'aktiv': { art: 'route' | 'abfahrt', titel {led, klar}, stadt, ende, planEnde, gefragt {}, spaeter {},
//   route: v (Verbindung), von/nach {led, klar}, ziel {lat, lon}; abfahrt: f (wie detailAbfahrt), start {led, klar}, startRoh, ref, tid }
var RUBRIK_FAHRT = 2, A_FAHRT_START = 31, A_FAHRT_ENDE = 32, SPAETER_S = 120;
var letztesDetail = null;              // zuletzt an die Uhr geschickte Details, Grundlage für FAHRT STARTEN
function namen(roh, stadt) { return { led: L.kurzname(roh || '', stadt), klar: L.klarname(roh || '', stadt) }; }
function TT(n) { return n ? T(n.led, n.klar) : ''; }
function aktivLesen() {
  var a = null;
  try { a = JSON.parse(localStorage.getItem('aktiv') || 'null'); } catch (e) {}
  return a && a.ende > jetztS() ? a : null;
}
function aktivSchreiben(a) { localStorage.setItem('aktiv', a ? JSON.stringify(a) : ''); }
function fahrtEnde(a) {
  if (a.art === 'abfahrt') {
    var f = a.f, an = f.an || (f.ab + 3600);
    return Math.max(an, f.anPlan || an) + 60;
  }
  return Math.max(a.v.an, a.planEnde || a.v.an) + 60;
}
function planEnde(v) {                 // Ankunft laut Fahrplan: letzte Fahrt planmäßig, danach der Fußweg
  var legs = v.legs, letzte = -1;
  legs.forEach(function (l, i) { if (!l.fuss) letzte = i; });
  if (letzte < 0) return v.an;
  var ende = legs[letzte].anPlan || legs[letzte].an;
  for (var i = letzte + 1; i < legs.length; i++) ende += legs[i].an - legs[i].ab;
  return ende;
}
function fahrtStarten(rub) {
  var d = letztesDetail;
  if (!d || d.rubrik !== rub) { console.log('Fahrt starten: keine passenden Details'); return menueEnde(true); }
  var a = JSON.parse(JSON.stringify(d));
  a.gefragt = {}; a.spaeter = {}; a.seit = jetztS(); a.stand = jetztS(); a.abgelehnt = [];
  if (a.art === 'route') a.planEnde = planEnde(a.v);
  a.ende = fahrtEnde(a);
  aktivSchreiben(a);
  ablauf = null;                         // auch aus WEITERE FAHRTEN: Liste ist erledigt, Fragen der Fahrt dürfen kommen
  localStorage.setItem('ankunft', '');   // Ankommen um erledigt (0.11.0)
  console.log('Fahrt gestartet: ' + a.titel.klar + ' bis ' + hm(a.ende));
  senden(fahrtNachricht(a));
  fahrtOeffnen();
}
function fahrtOeffnen() { var m = {}; m[keys.L_TITEL] = ''; m[keys.L_ANZAHL] = -6; senden(m, true); }
// Halte einer Fahrt mit Echtzeit: [{ name, ab, an, abPlan, anPlan, steig, aus }]
function fahrtHalte(ref, tid, fertig) {
  function sek(x) { return x ? Math.floor(Date.parse(x) / 1000) : 0; }
  function trip() {
    transitousHolen('v5/trip?tripId=' + encodeURIComponent(tid), function (f, d) {
      var l = !f && d && d.legs && d.legs[0];
      if (!l) return fertig(null);
      fertig([l.from].concat(l.intermediateStops || [], [l.to]).map(function (h) {
        return { name: h.name, ab: sek(h.departure), an: sek(h.arrival), abPlan: sek(h.scheduledDeparture) || sek(h.departure),
                 anPlan: sek(h.scheduledArrival) || sek(h.arrival), steig: steigText(h.track || h.scheduledTrack), aus: !!h.cancelled };
      }));
    });
  }
  if (ref && rmvSchluessel()) {
    return rmvGet('journeyDetail?id=' + encodeURIComponent(ref), function (f, d) {
      if (f !== null || !d || !d.Stops || !d.Stops.Stop) return tid ? trip() : fertig(null);
      function z(t, dt) { return t && dt ? deZuUtc(dt, t) : 0; }
      fertig(d.Stops.Stop.map(function (h) {
        var abP = z(h.depTime, h.depDate), anP = z(h.arrTime, h.arrDate);
        return { name: h.name, abPlan: abP, anPlan: anP, ab: z(h.rtDepTime, h.rtDepDate || h.depDate) || abP, an: z(h.rtArrTime, h.rtArrDate || h.arrDate) || anP,
                 steig: steigText(h.rtDepTrack || h.depTrack || h.rtArrTrack || h.arrTrack), aus: !!(h.cancelled || h.cancelledDeparture) };
      }));
    });
  }
  if (tid) return trip();
  fertig(null);
}
function haltSuchen(halte, name, ab, plan) {   // Index des Halts mit diesem Namen ab ab, bei mehreren der zeitlich nächste
  var best = -1, abst = 1e12;
  for (var i = Math.max(0, ab); i < halte.length; i++) {
    if (!gleicherName(halte[i].name, name)) continue;
    var d = plan ? Math.abs((halte[i].abPlan || halte[i].anPlan) - plan) : 0;
    if (d < abst) { abst = d; best = i; }
  }
  return best;
}
function abschnittNeu(l, halte) {      // Zeiten, Steige, Zwischenhalte eines Abschnitts aus dem Fahrtverlauf
  var iv = haltSuchen(halte, l.von, 0, l.abPlan), ina = haltSuchen(halte, l.nach, iv + 1, l.anPlan);
  if (iv >= 0) {
    l.ab = halte[iv].ab || l.ab; l.live = true;
    l.del = Math.round((l.ab - l.abPlan) / 60);
    if (halte[iv].steig) l.vonSteig = halte[iv].steig;
    if (halte[iv].aus) l.ausfall = true;
  }
  if (ina >= 0) { l.an = halte[ina].an || l.an; if (halte[ina].steig) l.nachSteig = halte[ina].steig; }
  if (iv >= 0 && ina > iv) l.zwischen = halte.slice(iv + 1, ina).map(function (h) { return { name: h.name, t: h.an || h.ab }; });
}
function fussNachziehen(v) {           // Fußwege hängen an den Fahrten davor bzw. (am Anfang) an der ersten Fahrt
  var legs = v.legs;
  for (var i = 0; i < legs.length; i++) {
    var l = legs[i], d = l.an - l.ab;
    if (!l.fuss) continue;
    if (i > 0 && !legs[i - 1].fuss) { l.ab = legs[i - 1].an; l.an = l.ab + d; }
    else if (i === 0 && legs[1] && !legs[1].fuss) { l.an = legs[1].ab; l.ab = l.an - d; }
  }
  v.los = legs[0].ab; v.an = legs[legs.length - 1].an;
}
function fahrtAktualisieren(a, fertig) {
  var jetzt = jetztS();
  if (a.art === 'abfahrt') {
    return fahrtHalte(a.ref, a.tid, function (h) {
      if (h) a.stand = jetztS();                       // Stand (0.8.0): wann zuletzt Echtzeit geholt wurde
      if (h) {
        var f = a.f, iv = haltSuchen(h, a.startRoh, 0, f.abPlan), ina = haltSuchen(h, f.zielName, iv + 1, 0);
        if (iv >= 0) { f.ab = h[iv].ab || f.ab; f.del = Math.round((f.ab - f.abPlan) / 60); if (h[iv].steig) f.steig = h[iv].steig; if (h[iv].aus) f.ausfall = true; }
        if (ina >= 0) { f.an = h[ina].an || f.an; if (h[ina].steig) f.zielSteig = h[ina].steig; if (!f.anPlan) f.anPlan = h[ina].anPlan; }
        if (iv >= 0 && ina > iv) f.zwischen = h.slice(iv + 1, ina).map(function (x) { return { name: x.name, t: x.an || x.ab }; });
      }
      dbFahrt(a, function () { a.ende = fahrtEnde(a); fertig(a); });   // Zug: DB drüber (0.9.0)
    });
  }
  var offen = 0;
  function ende() { dbFahrt(a, function () { fussNachziehen(a.v); a.ende = fahrtEnde(a); fertig(a); }); }
  a.v.legs.forEach(function (l) {
    if (l.fuss || (!l.ref && !l.tid) || l.an < jetzt - 120) return;   // vorbei: nicht mehr nachfragen
    offen++;
  });
  if (!offen) { a.stand = jetzt; return ende(); }      // nichts mehr nachzufragen: so aktuell wie möglich
  a.v.legs.forEach(function (l) {
    if (l.fuss || (!l.ref && !l.tid) || l.an < jetzt - 120) return;
    fahrtHalte(l.ref, l.tid, function (h) { if (h) { abschnittNeu(l, h); a.stand = jetztS(); } if (--offen === 0) ende(); });
  });
}

// Erster knapper oder verpasster Umstieg, der noch nicht beantwortet ist; zeit = wann gefragt wird.
// Seit 0.8.0 zuerst: eine noch kommende Fahrt fällt aus (auch bei einer Abfahrt ohne Umstieg) — sofort melden.
function faelligeFrage(a) {
  var jetzt = jetztS(), aus = null;
  fahrtV(a).legs.forEach(function (l, i) {
    if (aus || l.fuss || !l.ausfall || l.ab < jetzt - 120 || a.gefragt[i] || (a.spaeter[i] && jetzt - a.spaeter[i] < SPAETER_S)) return;
    aus = { i: i, zeit: jetzt, leg: l, ausfall: true };
  });
  if (aus) return aus;
  if (a.art !== 'route') return null;
  var vorher = null, fuss = 0, res = null;
  a.v.legs.forEach(function (l, i) {
    if (l.fuss) { fuss += l.an - l.ab; return; }
    if (vorher && !res && !a.gefragt[i] && !(a.spaeter[i] && jetzt - a.spaeter[i] < SPAETER_S)) {
      var min = Math.floor((l.ab - vorher.an - fuss) / 60), gesamt = Math.round((l.ab - vorher.an) / 60);
      if (min < 0) res = { i: i, zeit: vorher.an, leg: l, weg: true };
      else if (gesamt < umstzeit()) res = { i: i, zeit: l.ab + 30, leg: l, weg: false };
    }
    vorher = l; fuss = 0;
  });
  return res;
}
// ---------- Fahrtkarte (0.7.0, Entwurf linie8-fahrt-entwurf.png) ----------
// Phase aus Uhrzeit (Fahrplan + Echtzeit) und Handy-Standort: 1 vor der Abfahrt, 2 im Fahrzeug mit Umstieg danach,
// 3 am Umstieg, 4 letzte Fahrt, 5 Fußweg zum Ziel. Die Karte zeigt den aktuellen Schritt mit allem, was man braucht;
// runter auf der Uhr: Verlauf mit markiertem Schritt (D_AKT).
var A_VERPASST = 33, NAH_M = 150;
var fahrtOrt = null;                   // letzter Handy-Standort während der Fahrt { lat, lon, t }
function fahrtV(a) {                   // Abfahrt aus einer Haltestelle als Verbindung mit einem Abschnitt
  if (a.art === 'route') return a.v;
  var f = a.f;
  var l = { fuss: false, ab: f.ab, an: f.an || f.ab + 3600, abPlan: f.abPlan || f.ab, anPlan: f.anPlan || f.an, del: f.del || 0, ausfall: !!f.ausfall,
            linie: f.linie, richtung: f.richtung, von: a.startRoh, nach: f.zielName, vonSteig: f.steig, nachSteig: f.zielSteig,
            vonSteigPlan: f.steigPlan || '', halte: (f.zwischen || []).length + 1, zwischen: f.zwischen || [], mittel: a.mittel || 'BUS',
            vonLat: a.startLat, vonLon: a.startLon, ref: a.ref, tid: a.tid };
  return { los: l.ab, an: l.an, umst: 0, legs: [l] };
}
function fahrtPhase(v, t, pos) {
  var legs = v.legs, T = [];
  legs.forEach(function (l, i) { if (!l.fuss) T.push(i); });
  for (var k = 0; k < T.length; k++) {
    var l = legs[T[k]];
    var nah = !!(pos && l.vonLat && L.entfernung(pos.lat, pos.lon, l.vonLat, l.vonLon) < NAH_M);
    // noch an der Einstiegshaltestelle: weiter "vor der Abfahrt", auch wenn die Abfahrt laut Uhr schon war (bis 10 min)
    if (t < l.ab || (nah && t < l.ab + 600 && t < l.an)) return { phase: k === 0 ? 1 : 3, k: k, li: T[k], T: T, wartet: t >= l.ab };
    if (t < l.an) return { phase: k === T.length - 1 ? 4 : 2, k: k, li: T[k], T: T };
  }
  return { phase: 5, k: T.length - 1, li: legs.length - 1, T: T };
}
function minT(s) { return Math.max(1, Math.round(s / 60)) + "'"; }
function meterT(m) { return m >= 1000 ? (Math.round(m / 100) / 10).toFixed(1).replace('.', T('.', ',')) + T('KM', ' km') : m + T('M', ' m'); }
function mittelT(l) { var m = l.mittel || 'BUS'; return T(m, { BUS: 'Bus', TRAM: 'Tram', ZUG: 'Zug', FAEHRE: 'Fähre' }[m] || m); }
function imMittel(l) { var m = l.mittel || 'BUS'; return T(m === 'TRAM' ? 'IN TRAM' : m === 'FAEHRE' ? 'AUF FAEHRE' : 'IM ' + m, m === 'TRAM' ? 'In Tram' : m === 'FAEHRE' ? 'Auf Fähre' : 'Im ' + mittelT(l)); }
function fussVor(legs, i) {            // Fußweg direkt vor Abschnitt i (zusammengefasst)
  var s = 0, m = 0, da = false;
  for (var j = i - 1; j >= 0 && legs[j].fuss; j--) { s += legs[j].an - legs[j].ab; m += legs[j].m || 0; da = true; }
  return da ? { s: s, m: m } : null;
}
function fussNach(legs, i) {
  var s = 0, m = 0, da = false;
  for (var j = i + 1; j < legs.length && legs[j].fuss; j++) { s += legs[j].an - legs[j].ab; m += legs[j].m || 0; da = true; }
  return da ? { s: s, m: m } : null;
}
function karteBauen(a, v, ph, t) {
  var h = textHilfe(a.stadt), legs = v.legs, z = [], k = { phase: ph.phase, halte: 0, rf: 0, r1: '', r2: '', steig: '', kopfr: '' };
  function zeile(l, w, r, s, f) { if (z.length < 6) z.push({ l: l || '', w: w || '', r: r || '', s: s || '', f: f || 0 }); }
  function linie(l) { return linienVoll(l.linie) + ' > ' + h.name(l.richtung); }
  function verspaetung(l) { return l.ausfall ? '' : l.del > 0 ? '+' + l.del + "'" : l.live || l.del < 0 ? (l.del < 0 ? l.del + "'" : T('PUENKTLICH', 'pünktlich')) : ''; }
  function warnungen(l, imFahrzeug) {
    if (l.ausfall) zeile('', T('FAELLT AUS', 'fällt aus'), '', '', 4 | 16);
    if (!imFahrzeug && l.vonSteigPlan && l.vonSteig && l.vonSteigPlan !== l.vonSteig) zeile('', T('STEIG NEU: ', 'Steig neu: ') + l.vonSteig + T(' STATT ', ' statt ') + l.vonSteigPlan, '', '', 4 | 16);
  }
  var an = hm(v.an);
  if (ph.phase === 1 || ph.phase === 3) {
    var B = legs[ph.li], fw = fussVor(legs, ph.li), los = fw ? B.ab - fw.s : B.ab;
    if (ph.phase === 1) k.kopf = ph.wartet ? T('ABFAHRT UEBERFAELLIG', 'Abfahrt überfällig') : !fw ? T('ZUR ABFAHRT', 'Zur Abfahrt') : t < los ? T('LOSGEHEN', 'Losgehen') : T('JETZT LOS', 'Jetzt los');
    else k.kopf = ph.wartet ? T('ABFAHRT UEBERFAELLIG', 'Abfahrt überfällig') : T('UMSTEIGEN', 'Umsteigen');
    if (ph.phase === 1 && fw && t < los) { k.zeit = los; k.zeitl = T('BIS LOS', 'bis los'); }
    else { k.zeit = B.ab; k.zeitl = T('BIS ABFAHRT', 'bis Abfahrt'); }
    if (fw) { k.r1 = T('FUSS ', 'zu Fuß ') + minT(fw.s); k.r2 = meterT(fw.m); k.rf = 1; }
    k.label = T('ZU', 'zu'); k.name = h.name(B.von); k.steig = B.vonSteig || '';
    zeile(mittelT(B), linie(B));
    var vs = verspaetung(B);
    zeile(T('AB', 'ab'), hm(B.ab), vs, '', B.del > 0 ? 1 : 0);
    warnungen(B);
    var letzte = ph.k === ph.T.length - 1;
    zeile('', T('DANN ', 'dann ') + (B.halte === 1 ? T('1 HALT', '1 Halt') : B.halte + T(' HALTE', ' Halte')) + T(' BIS', ' bis'), '', '', 4 | 8 | 32);
    zeile('', h.name(B.nach) + (letzte && !fussNach(legs, ph.li) ? T(', ZIEL', ', Ziel') : ''), '', '', 4 | 32);
    k.fuss = T('AN ', 'an ') + an;          // 0.8.0: Fuß links die Ankunft, rechts der Stand (Umstiege stehen im Verlauf)
  } else if (ph.phase === 2 || ph.phase === 4) {
    var C = legs[ph.li], kom = (C.zwischen || []).filter(function (x) { return x.t > t - 30; });
    k.kopf = imMittel(C) + ' ' + linie(C);
    k.zeit = C.an; k.zeitl = T('BIS AUSSTIEG', 'bis Ausstieg');
    if (C.zwischen && C.zwischen.length) k.halte = kom.length + 1;
    k.r1 = T('NAECHSTER', 'nächster'); k.r2 = L.utf8Kuerzen(kom.length ? h.name(kom[0].name) : h.name(C.nach), 12); k.rf = 0;
    k.label = T('AUSSTEIGEN', 'aussteigen'); k.name = h.name(C.nach); k.steig = C.nachSteig || '';
    warnungen(C, true);
    var fn = fussNach(legs, ph.li);
    if (ph.phase === 2) {
      var N = legs[ph.T[ph.k + 1]], wS = fn ? fn.s : 0;
      zeile(T('DANN', 'dann'), fn ? T('FUSS ', 'zu Fuß ') + minT(fn.s) + '  ' + meterT(fn.m) : T('UMSTIEG', 'Umstieg'), '', '', 8);
      zeile(T('ZU', 'zu'), h.name(N.von), '', N.vonSteig || '');
      zeile(mittelT(N), linie(N));
      if (N.vonSteigPlan && N.vonSteig && N.vonSteigPlan !== N.vonSteig) zeile('', T('STEIG NEU: ', 'Steig neu: ') + N.vonSteig + T(' STATT ', ' statt ') + N.vonSteigPlan, '', '', 4 | 16);
      var frei = Math.floor((N.ab - C.an - wS) / 60), gesamt = Math.round((N.ab - C.an) / 60);
      var pt = frei < 0 ? T('WEG', 'weg') : gesamt < umstzeit() ? T('KNAPP ', 'knapp ') + gesamt + "'" : T('PUFFER ', 'Puffer ') + gesamt + "'";
      zeile(T('AB', 'ab'), hm(N.ab), pt, '', frei < 0 || gesamt < umstzeit() ? 1 : 2);
      if (N.ausfall) zeile('', T('ANSCHLUSS FAELLT AUS', 'Anschluss fällt aus'), '', '', 4 | 16);
      k.fuss = T('AN ', 'an ') + an;
    } else {
      if (fn) zeile(T('DANN', 'dann'), T('FUSS ', 'zu Fuß ') + minT(fn.s) + '  ' + meterT(fn.m), '', '', 8);
      zeile(T('ZIEL', 'Ziel'), T('AN ', 'an ') + an, '', '', fn ? 64 : 8 | 64);
      k.fuss = T('AN ', 'an ') + an;
    }
  } else {
    var fz = fussNach(legs, ph.T.length ? ph.T[ph.T.length - 1] : -1);
    k.kopf = T('ZUM ZIEL', 'Zum Ziel'); k.kopfr = '';
    k.zeit = v.an; k.zeitl = T('BIS ANKUNFT', 'bis Ankunft');
    if (fz) { k.r1 = T('FUSS ', 'zu Fuß ') + minT(fz.s); k.r2 = meterT(fz.m); k.rf = 1; }
    k.label = T('ZIEL', 'Ziel'); k.name = TT(a.nach || a.titel);
    zeile(T('AN', 'an'), an, '', '', 64);
    k.fuss = T('AN ', 'an ') + an;
  }
  k.zeilen = z;
  return k;
}
function karteSenden(k) {
  var m = {};
  m[keys.K_PHASE] = k.phase; m[keys.K_KOPF] = L.utf8Kuerzen(k.kopf || '', 31); m[keys.K_KOPFR] = L.utf8Kuerzen(k.kopfr || '', 15);
  m[keys.K_ZEIT] = k.zeit || 0; m[keys.K_ZEITL] = L.utf8Kuerzen(k.zeitl || '', 23); m[keys.K_HALTE] = k.halte || 0;
  m[keys.K_RF] = k.rf; m[keys.K_R1] = L.utf8Kuerzen(k.r1, 15); m[keys.K_R2] = L.utf8Kuerzen(k.r2, 19);
  m[keys.K_LABEL] = L.utf8Kuerzen(k.label || '', 15); m[keys.K_NAME] = L.utf8Kuerzen(k.name || '', 31); m[keys.K_STEIG] = L.utf8Kuerzen(k.steig || '', 3);
  for (var i = 0; i < 6; i++) {
    var z = k.zeilen[i] || { l: '', w: '', r: '', s: '', f: 0 };
    m[keys.K_L + i] = L.utf8Kuerzen(z.l, 7); m[keys.K_W + i] = L.utf8Kuerzen(z.w, 27); m[keys.K_R + i] = L.utf8Kuerzen(z.r, 15);
    m[keys.K_S + i] = L.utf8Kuerzen(z.s, 3); m[keys.K_F + i] = i < k.zeilen.length ? z.f | 128 : 0;   // 128 = Zeile belegt
  }
  m[keys.K_FUSS] = L.utf8Kuerzen(k.fuss || '', 27);
  senden(m);
}
function aktZeile(z, ph, v) {          // welche Detailzeile im Verlauf markiert wird
  function f(p) { for (var i = 0; i < z.length; i++) if (p(z[i], z[i].art & 31)) return i; return -1; }
  var li = ph.li, r = -1;
  if (ph.phase === 1) { r = f(function (x, a) { return a === 10 && x.leg === li - 1; }); if (r < 0) r = f(function (x, a) { return x.leg === li && a <= 2; }); }
  else if (ph.phase === 3) {
    var vor = ph.T[ph.k - 1];
    r = f(function (x, a) { return a === 12 && x.leg > vor && x.leg <= li; });
    if (r < 0) r = f(function (x, a) { return x.leg === li && a === 2; });
  } else if (ph.phase === 2 || ph.phase === 4) {   // im Fahrzeug: Balken auf dem nächsten Halt (0.13.0), sonst auf der Fahrt
    var fz = f(function (x, a) { return a === 11 && x.leg === li; }), jetzt = jetztS();
    r = fz;
    for (var i = fz + 1; fz >= 0 && i < z.length && z[i].leg === li; i++) {
      var a2 = z[i].art & 31;
      if ((a2 === 2 || a2 === 3 || a2 === 4) && z[i].t && z[i].t >= jetzt - 30) { r = i; break; }
    }
  }
  else { r = f(function (x, a) { return a === 10 && x.leg === v.legs.length - 1; }); if (r < 0) r = z.length - 1; }
  return r;
}
function weckZeit(a) {                 // nächster Anlass, die Uhr zu wecken: losgehen, einen Halt vor dem Ausstieg, Anschlussfrage
  var v = fahrtV(a), j = jetztS(), ev = [];
  if (v.legs[0] && v.legs[0].fuss) ev.push(v.legs[0].ab);
  v.legs.forEach(function (l) {
    if (l.fuss) return;
    var zw = l.zwischen || [];
    ev.push(zw.length ? zw[zw.length - 1].t : l.an - 90);
  });
  var q = faelligeFrage(a);
  if (q) ev.push(q.zeit);
  ev = ev.filter(function (x) { return x > j + 60; }).sort(function (x, y) { return x - y; });
  return ev[0] || 0;
}
function fahrtNachricht(a) {           // Uhr: ob eine Fahrt aktiv ist (Ende), Titel, nächste Weckzeit
  var m = {};
  m[keys.FAHRT] = a ? a.ende : 0;
  m[keys.F_TITEL] = a ? L.utf8Kuerzen(TT(a.titel), 31) : '';
  m[keys.WECKEN] = a ? weckZeit(a) : 0;
  return m;
}

// Frage: Anschluss (knapp/verpasst laut Echtzeit) oder erster Bus (noch an der Haltestelle, Abfahrt + 2 min vorbei).
// Fällt eine Fahrt aus (0.8.0): gleich eine andere Fahrt vorschlagen, oben der Grund; die Uhr vibriert.
function frageStellen(q) {
  ablauf = { ziel: -1, frage: q.i, schritte: [], gen: 0, laedt: false };
  var lin = linienVoll(q.leg.linie);
  if (q.ausfall) {
    var a0 = aktivLesen();
    if (a0) { a0.gefragt[q.i] = 'ausfall'; aktivSchreiben(a0); }
    return vorschlag(q.i, T(lin + ' FAELLT AUS', lin + ' fällt aus'), true);
  }
  schritt(q.erste ? T(lin + ' ERREICHT?', lin + ' erreicht?') : T('ANSCHLUSS ' + lin + '?', 'Anschluss ' + lin + '?'),
          [{ t: T('BEKOMMEN', 'Bekommen'), ja: true }, { t: T('VERPASST', 'Verpasst') }], function (x) {
    var a = aktivLesen();
    if (!a) { ablauf = null; return menueEnde(true); }
    a.gefragt[q.i] = x.ja ? 'ja' : 'nein';
    aktivSchreiben(a);
    if (x.ja) { ablauf = null; return fahrtOeffnen(); }
    vorschlag(q.i);
  });
}
// Fahrt-Menü > ANDERE FAHRT SUCHEN (bis 0.7.1 ANSCHLUSS VERPASST): welche (wenn mehrere offen), dann Vorschlag
function verpasstWaehlen() {
  var a = aktivLesen();
  if (!a) return menueEnde(true);
  var v = fahrtV(a), j = jetztS(), kand = [], h = textHilfe(a.stadt);
  v.legs.forEach(function (l, i) { if (!l.fuss && l.an > j) kand.push(i); });
  ablauf = { ziel: -1, frage: -1, schritte: [], gen: 0, laedt: false };
  if (!kand.length) { ablauf = null; return fahrtOeffnen(); }
  if (kand.length === 1) return vorschlag(kand[0]);
  schritt(T('AB WELCHER?', 'Welche Fahrt ersetzen?'), kand.map(function (i) {
    var l = v.legs[i];
    return { t: linienVoll(l.linie) + ' ' + hm(l.ab) + ' ' + h.name(l.von), i: i };
  }), function (x) { vorschlag(x.i); });
}
// Neu rechnen ab dem Einstieg des verpassten (bzw. ausgefallenen) Abschnitts zum Ziel: andere Fahrt anbieten.
// grund: erste Info-Zeile ("8 FAELLT AUS"), summen: Uhr vibriert
function vorschlag(i, grund, summen) {
  var a = aktivLesen();
  if (!a) { ablauf = null; return menueEnde(true); }
  var v = fahrtV(a), l = v.legs[i];
  function zurFahrt() { ablauf = null; fahrtOeffnen(); }
  if (!a.ziel || !l || !l.vonLat) return schritt(T('OHNE AUSSTIEG KEINE ANDERE FAHRT', 'Ohne Ausstieg keine andere Fahrt'), [{ t: T('ZURUECK', 'Zurück') }], zurFahrt);
  ladeSenden(T('SUCHE ANDERE FAHRT', 'Suche andere Fahrt'), true);
  verbindungenHolen({ lat: l.vonLat, lon: l.vonLon }, a.ziel, aktuell(function (f, liste) {
    var opt = f === null ? StreckenM.auswaehlen(liste, jetztS(), 5).filter(function (x) { return !x.legs.some(function (y) { return !y.fuss && y.ausfall; }); }) : [];
    if (!opt.length) return schritt(T('NICHTS GEFUNDEN', 'Nichts gefunden'), [{ t: T('BEHALTEN', 'Behalten') }], zurFahrt, grund ? [grund] : null, summen);
    opt.sort(function (x, y) { return x.an - y.an || x.los - y.los; });
    angebot(T('ANDERE FAHRT', 'Andere Fahrt'), opt, { lat: l.vonLat, lon: l.vonLon, name: l.von }, grund, summen,
            function (b) { b.gefragt[i] = 'alt'; });
  }));
}
// Angebot einer anderen Fahrt (verpasst, Ausfall, FRUEHER DA): Info oben, UEBERNEHMEN · ANDERE ZEIGEN · BEHALTEN
function angebot(titel, opt, ab, grund, summen, beiBehalten) {
  var a = aktivLesen();
  if (!a) { ablauf = null; return menueEnde(true); }
  var v = fahrtV(a), h = textHilfe(a.stadt), best = opt[0], diff = Math.round((best.an - v.an) / 60);
  function zurFahrt() { ablauf = null; fahrtOeffnen(); }
  var erste = best.legs.filter(function (x) { return !x.fuss; })[0];
  var info = (grund ? [grund] : []).concat([T('AB ', 'ab ') + h.name(ab.name), hm(best.los) + ' > ' + hm(best.an),
              (best.umst ? StreckenM.kette(best) : erste ? linienVoll(erste.linie) + ' > ' + h.name(erste.richtung) : '') +
              (diff > 0 ? '  +' + diff + T("' SPAETER", ' min später') : diff < 0 ? '  ' + diff + T("' FRUEHER", ' min früher') : '')]);
  if (opt[1] && info.length < 4) info.push(T('ODER ', 'oder ') + hm(opt[1].los) + ' > ' + hm(opt[1].an) + '  ' + opt[1].umst + T(' UMST.', ' Umst.'));
  function nehmen(nv) {
    var b = aktivLesen();
    if (!b) return zurFahrt();
    b.art = 'route'; b.v = nv; b.von = namen(ab.name, b.stadt); b.nach = b.nach || b.titel;
    b.gefragt = {}; b.spaeter = {}; b.seit = jetztS(); b.stand = jetztS(); b.planEnde = planEnde(nv); b.ende = fahrtEnde(b);
    aktivSchreiben(b);
    console.log('Andere Fahrt ab ' + ab.name + ': ' + StreckenM.kette(nv) + ' an ' + hm(nv.an));
    zurFahrt();
  }
  schritt(titel, [{ t: T('UEBERNEHMEN', 'Übernehmen'), v: best }, { t: T('ANDERE ZEIGEN', 'Andere zeigen'), andere: true },
                  { t: T('BEHALTEN', 'Behalten'), alt: true }], function (x) {
    if (x.alt) { var b = aktivLesen(); if (b) { beiBehalten(b); aktivSchreiben(b); } return zurFahrt(); }
    if (x.andere) return schritt(T('ANDERE FAHRTEN', 'Andere Fahrten'), opt.map(function (o) {
      return { t: hm(o.los) + '>' + hm(o.an) + ' ' + StreckenM.kette(o), v: o };
    }), function (y) { nehmen(y.v); });
    nehmen(x.v);
  }, info, summen);
}
// FRUEHER DA in der Fahrt (0.8.0): vor dem Einsteigen (Phase 1, ab Standort) und am Umstieg (Phase 3, ab dort),
// höchstens alle 3 min. Abgelehnte Vorschläge (BEHALTEN) kommen nicht wieder.
function frueherPruefen(a, ph, pos) {
  if (ablauf || !a.ziel || (ph.phase !== 1 && ph.phase !== 3) || jetztS() - (a.frueherT || 0) < VORSCHLAG_NEU_S) return;
  var B = fahrtV(a).legs[ph.li];
  var ab = ph.phase === 1 && pos ? { lat: pos.lat, lon: pos.lon, name: T('HIER', 'Hier') } : (B && B.vonLat ? { lat: B.vonLat, lon: B.vonLon, name: B.von } : null);
  if (!ab) return;
  a.frueherT = jetztS(); aktivSchreiben(a);
  verbindungenHolen(ab, a.ziel, function (f, liste) {
    var b = aktivLesen();
    if (!b || b.seit !== a.seit || ablauf || f !== null || !liste) return;
    var weg = b.abgelehnt || [], an = fahrtV(b).an;
    var opt = StreckenM.auswaehlen(liste, jetztS(), 5).filter(function (x) {
      return !x.legs.some(function (y) { return !y.fuss && y.ausfall; }) && weg.indexOf(StreckenM.kennung(x)) < 0;
    }).sort(function (x, y) { return x.an - y.an; });
    if (!opt.length || an - opt[0].an < FRUEHER_S) return;
    console.log('Fahrt: früher da ' + Math.round((an - opt[0].an) / 60) + ' min mit ' + StreckenM.kette(opt[0]));
    ablauf = { ziel: -1, frage: -1, schritte: [], gen: 0, laedt: false };
    var k = StreckenM.kennung(opt[0]);
    angebot(T('FRUEHER DA', 'Früher da'), opt, ab, null, true, function (c) { c.abgelehnt = (c.abgelehnt || []).concat([k]); });
  });
}
// Uhr fragt die aktive Fahrt an (RUBRIK 2): Ende/Titel/Wecken, Karte, Verlauf mit markiertem Schritt, ggf. Frage.
// Danach der Handy-Standort: ändert er die Phase (noch an der Haltestelle), kommt die Karte noch einmal.
function fahrtSenden() {
  var a = aktivLesen();
  if (!a) { senden(fahrtNachricht(null)); return detailSenden(RUBRIK_FAHRT, 0, 0, []); }
  fahrtAktualisieren(a, function (a2) {
    var alt = aktivLesen();
    if (!alt || alt.seit !== a2.seit) return;   // inzwischen beendet, neu gestartet oder neu geführt
    a2.gefragt = alt.gefragt; a2.spaeter = alt.spaeter; a2.abgelehnt = alt.abgelehnt || []; a2.frueherT = alt.frueherT;
    if (a2.ende <= jetztS()) { aktivSchreiben(null); senden(fahrtNachricht(null)); return menueEnde(true); }
    aktivSchreiben(a2);
    senden(fahrtNachricht(a2));
    var pos = fahrtOrt && jetztS() - fahrtOrt.t < 120 ? fahrtOrt : null;
    var ph = zeigen(a2, pos);
    if (!fragen(a2, ph)) standort(function (p) {
      if (!p) return;
      fahrtOrt = { lat: p.lat, lon: p.lon, t: jetztS() };
      var b = aktivLesen();
      if (!b || b.seit !== a2.seit) return;
      var ph2 = fahrtPhase(fahrtV(b), jetztS(), fahrtOrt);
      if (ph2.phase !== ph.phase || ph2.k !== ph.k || ph2.wartet !== ph.wartet) { console.log('Fahrt: Standort ändert die Phase ' + ph.phase + ' -> ' + ph2.phase); ph2 = zeigen(b, fahrtOrt); }
      if (!fragen(b, ph2)) frueherPruefen(b, ph2, fahrtOrt);
    });
  });
}
function zeigen(a, pos) {
  var v = fahrtV(a), t = jetztS(), ph = fahrtPhase(v, t, pos);
  karteSenden(karteBauen(a, v, ph, t));
  var zeilen = a.art === 'route'
    ? StreckenM.detailVerbindung(a.v, textHilfe(a.stadt), TT(a.von), TT(a.nach), umstzeit(), DMAX)
    : StreckenM.detailAbfahrt(a.f, textHilfe(a.stadt), TT(a.start), DMAX);
  detailSenden(RUBRIK_FAHRT, 0, 0, zeilen, aktZeile(zeilen, ph, v), a.stand || 0);
  return ph;
}
function fragen(a, ph) {               // true = eine Frage ist jetzt dran (und gestellt)
  if (ablauf) return false;
  var j = jetztS(), q = faelligeFrage(a);
  if (q && q.zeit <= j) { frageStellen(q); return true; }
  var B = fahrtV(a).legs[ph.li];
  if (ph.wartet && B && j > B.ab + 120 && !a.gefragt[ph.li] && !(a.spaeter[ph.li] && j - a.spaeter[ph.li] < SPAETER_S)) {
    frageStellen({ i: ph.li, leg: B, zeit: B.ab + 120, erste: ph.k === 0 });
    return true;
  }
  return false;
}

function abfahrtKennung(x) { return x.lv + '@' + (x.t - (x.d === AUSFALL ? 0 : x.d) * 60); }
// Verlauf einer Abfahrt der Haltestellen-Seite: mit Ziel kommen die Halte schon mit (RMV passlist, Transitous
// intermediateStops), ohne Ziel eine Abfrage mehr (RMV journeyDetail, Transitous trip) ab der eigenen Haltestelle.
// nrUhr: Nummer an die Uhr, wenn sie nicht die Abfahrt der Seite ist (LISTE aus WEITERE FAHRTEN, 0.13.0)
function detailAbfahrtSenden(st, seite, fahrten, nr, quelle, veraltet, stand, nrUhr) {
  if (!fahrten.length) return detailSenden(0, seite, nrUhr === undefined ? 0 : nrUhr, []);   // keine Abfahrt: leere Detailansicht ("keine Fahrt")
  var k = nrUhr === undefined ? detailWahl('0:' + seite, fahrten, nr, abfahrtKennung) : 0, x = fahrten[k], stadt = L.stadtVon(st.a.name);
  var basis = { ab: x.t, an: x.an || 0, linie: x.lv || x.l, richtung: x.r || x.z || '', steig: x.s, del: x.d === AUSFALL ? 0 : x.d,
                ausfall: x.d === AUSFALL, zwischen: x.zw || [], zielName: st.b ? st.b.name : (x.z || x.r || ''), zielSteig: x.zs || '' };
  function fertig(f) {
    if (veraltet()) return;
    var startName = T(st.a.kurz || L.kurzname(st.a.name, stadt), L.klarname(st.a.name, stadt));
    detailSenden(0, seite, nrUhr === undefined ? k : nrUhr, StreckenM.detailAbfahrt(f, textHilfe(stadt), startName, DMAX), undefined, stand);
    var fk = JSON.parse(JSON.stringify(f));
    fk.abPlan = x.t - (x.d === AUSFALL ? 0 : x.d) * 60; fk.steigPlan = x.sp || ''; if (x.anPlan) fk.anPlan = x.anPlan;
    fk.zn = x.zn || '';                  // Zugnummer für die DB (0.9.0)
    letztesDetail = { rubrik: 0, art: 'abfahrt', f: fk, mittel: x.mi || 'BUS', startLat: st.a.lat, startLon: st.a.lon,
                      ziel: st.b && st.b.lat !== undefined ? { lat: st.b.lat, lon: st.b.lon } : null, start: { led: st.a.kurz || L.kurzname(st.a.name, stadt), klar: L.klarname(st.a.name, stadt) },
                      startRoh: st.a.name, stadt: stadt, ref: x.ref, tid: x.tid, titel: namen(f.zielName, stadt) };
  }
  if (st.b) return fertig(basis);
  function abHier(halte, zeitVon) {      // Halte nach der eigenen Haltestelle (Name oder Abfahrtszeit), letzter = Endziel
    var i0 = -1;
    halte.forEach(function (h, i) { if (i0 < 0 && (gleicherName(h.name, st.a.name) || zeitVon(h) === x.t)) i0 = i; });
    if (i0 < 0 || i0 >= halte.length - 1) return fertig(basis);
    var rest = halte.slice(i0 + 1), ende = rest[rest.length - 1];
    basis.zwischen = rest.slice(0, -1).map(function (h) { return { name: h.name, t: zeitVon(h) }; });
    basis.an = zeitVon(ende); basis.zielName = ende.name;
    fertig(basis);
  }
  if (quelle === 'RMV' && x.ref) {
    return rmvGet('journeyDetail?id=' + encodeURIComponent(x.ref), function (f, d) {
      if (f !== null) return fertig(basis);
      abHier((d.Stops && d.Stops.Stop) || [], function (h) {
        var z = h.rtDepTime || h.depTime || h.rtArrTime || h.arrTime, dt = h.rtDepDate || h.depDate || h.rtArrDate || h.arrDate;
        return z && dt ? deZuUtc(dt, z) : 0;
      });
    });
  }
  if (x.tid) {
    return transitousHolen('v5/trip?tripId=' + encodeURIComponent(x.tid), function (f, d) {
      var l = !f && d && d.legs && d.legs[0];
      if (!l) return fertig(basis);
      abHier([l.from].concat(l.intermediateStops || [], [l.to]), function (h) { return Math.floor(Date.parse(h.departure || h.arrival) / 1000) || 0; });
    });
  }
  fertig(basis);
}
function gleicherName(a, b) {
  function n(s) { return String(s || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
  return n(a) === n(b);
}

// ---------- Strecken (seit 0.6.1) ----------
// Gespeichert unter 'routen': [{ von (null = Standort), nach, zuletzt }], Orte wie Favoriten:
// { name, stadt, kurz (LED), klar, lat, lon, typ ('halt' | 'adresse' | 'ort'), id (nur Haltestellen), n (genutzt) }.
// Je Strecke eine eigene Kopie der Orte (Wunsch Seb 2026-10-09): Favorit löschen lässt die Strecke heil.
var MAXR = 8, MAXF = 20, MAXZ = 5;      // Strecken (R_NAME[8]), Favoriten (seit 0.8.0 20), zuletzt genutzte Ziele
var STATUS_STANDORT = 4;                 // wie ST_STANDORT in main.c
var StreckenM = StreckenModul({ deZuUtc: deZuUtc, linienKurz: linienKurz, linienVoll: linienVoll, steigText: steigText, oepnv: function (x) { return L.oepnv(x); } });
function lesen(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } }
function routen() { return lesen('routen'); }
function routenSchreiben(l) { localStorage.setItem('routen', JSON.stringify(l)); }
function favoriten() { return lesen('favoriten'); }
function favoritenSchreiben(l) { localStorage.setItem('favoriten', JSON.stringify(l)); }
function zuletztListe() { return lesen('zuletzt'); }
function rubrik() { return localStorage.getItem('rubrik') === '1' ? 1 : 0; }
function aktiveRoute() {
  var n = routen().length, s = parseInt(localStorage.getItem('rseite') || '0', 10);
  return n === 0 ? 0 : Math.max(0, Math.min(n - 1, isNaN(s) ? 0 : s));
}
// Einstellungen der Verbindungssuche: höchstens so viele Umstiege (9 = beliebig), Fußweg am Anfang/Ende (min),
// Umstiegszeit mindestens (min). Gehtempo fest 4 km/h (Wunsch Seb 2026-10-09).
var UMSTIEGE = [0, 1, 2, 3, 9], FUSSWEGE = [5, 10, 15, 20], UMSTZEITEN = [2, 5, 10], GEHEN_M_MIN = 67;
function zahl(k, erlaubt, std) { var v = parseInt(localStorage.getItem(k), 10); return erlaubt.indexOf(v) >= 0 ? v : std; }
function umstiege() { return zahl('umstiege', UMSTIEGE, 2); }
function fussweg() { return zahl('fussweg', FUSSWEGE, 15); }
function umstzeit() { return zahl('umstzeit', UMSTZEITEN, 2); }

// fern (über 5 km vom Standort): Stadt bleibt im Namen ("MAINZ HBF", "HAUPTBAHNHOF MAINZ"), sonst weg ("HBF")
function ortNeu(name, stadt, lat, lon, typ, id, fern) {
  var st = typ === 'halt' && !fern ? L.stadtVon(name) : '';
  var anzeige = fern && stadt && typ !== 'halt' && name.indexOf(stadt) < 0 ? name + ' ' + stadt : name;
  return { name: name, stadt: stadt || st, kurz: L.utf8Kuerzen(L.kurzname(anzeige, st), 31), klar: L.utf8Kuerzen(L.klarname(anzeige, st), 31),
           lat: lat, lon: lon, typ: typ, id: id || null, n: 0 };
}
function ortAusHalt(h) { return ortNeu(h.name, '', h.lat, h.lon, 'halt', h.id, h.m > 5000); }
function ortName(o) { return T(o.kurz, o.klar); }
function km(m) {
  if (m < 1000) return m + T('M', ' m');
  return (m < 10000 ? (Math.round(m / 100) / 10).toFixed(1).replace('.', T('.', ',')) : String(Math.round(m / 1000))) + T('KM', ' km');
}
function ortText(o, pos) {                 // "ZUHAUSE 1.2KM": Entfernung hinten, Name notfalls gekürzt
  var hinten = pos ? ' ' + km(L.entfernung(pos.lat, pos.lon, o.lat, o.lon)) : '';
  return L.utf8Kuerzen(ortName(o), LTXT - hinten.length) + hinten;
}
function gleicherOrt(a, b) { return a && b && L.entfernung(a.lat, a.lon, b.lat, b.lon) < 30; }
function genutzt(o) {                      // Favorit genutzt: Zähler hoch (Sortierung nach Häufigkeit)
  if (!o) return;
  var liste = favoriten(), f = liste.filter(function (x) { return gleicherOrt(x, o); })[0];
  if (!f) return;
  f.n = (f.n || 0) + 1;
  favoritenSchreiben(liste);
}
function favSortiert() { return favoriten().slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0) || L.sortDe(a.name, b.name); }); }
function zuletztMerken(o) {
  if (favoriten().some(function (x) { return gleicherOrt(x, o); })) return;
  var l = zuletztListe().filter(function (x) { return !gleicherOrt(x, o); });
  l.unshift(o);
  localStorage.setItem('zuletzt', JSON.stringify(l.slice(0, MAXZ)));
}

function routenSenden() {
  var liste = routen(), msg = {};
  favMasken(msg);
  msg[keys.R_ANZAHL] = liste.length;
  msg[keys.R_SEITE] = aktiveRoute();
  msg[keys.RUBRIK] = rubrik();
  msg[keys.UMSTIEGE] = umstiege();
  msg[keys.FUSSWEG] = fussweg();
  msg[keys.UMSTZEIT] = umstzeit();
  for (var i = 0; i < liste.length && i < MAXR; i++) {
    var r = liste[i];
    msg[keys.R_NAME + i] = r.nach.kurz;
    msg[keys.R_KLAR + i] = r.nach.klar;
    msg[keys.R_VON + i] = r.von ? r.von.kurz : '';     // leer = ab Standort
    msg[keys.R_VONK + i] = r.von ? r.von.klar : '';
  }
  senden(msg);
}

// Verbindungen von -> nach (je { lat, lon }) aus der gewählten Quelle. fertig(fehler, [Verbindung], 'RMV' | 'TRANS')
// an (0.11.0): Ankunft spätestens (UTC-Sekunden), 0 = ab jetzt
function verbindungenHolen(von, nach, fertig0, an, ab) {   // an: ankommen bis (0.11.0); ab: losfahren ab (WEITERE FAHRTEN, 0.13.0)
  var dz = an ? new Date((an + mezVersatz(an)) * 1000).toISOString() : '';
  var mx = umstiege() === 9 ? 5 : umstiege(), fm = fussweg() * GEHEN_M_MIN;
  function fertig(f, liste, q) {        // Züge: DB drüber (0.9.0)
    if (f !== null || !liste) return fertig0(f, liste, q);
    dbVerbindungen(liste, function () { fertig0(f, liste, q); });
  }
  function trans() {
    transitousHolen('v5/plan?fromPlace=' + von.lat.toFixed(6) + ',' + von.lon.toFixed(6) + '&toPlace=' + nach.lat.toFixed(6) + ',' + nach.lon.toFixed(6) +
      '&maxTransfers=' + mx + '&minTransferTime=' + umstzeit() + '&pedestrianSpeed=1.11&numItineraries=5' +
      '&maxPreTransitTime=' + fussweg() * 60 + '&maxPostTransitTime=' + fussweg() * 60 +
      (an ? '&arriveBy=true&time=' + new Date(an * 1000).toISOString() : ab ? '&time=' + new Date(ab * 1000).toISOString() : ''), function (f, d) {
      if (f) return fertig(f === 'kein Netz' ? STATUS_NETZ : STATUS_FEHLER, null, 'TRANS');
      try { fertig(null, (d.itineraries || []).map(StreckenM.ausTransitous), 'TRANS'); }
      catch (e) { console.log('Transitous-Verbindungen unlesbar: ' + e); fertig(STATUS_FEHLER, null, 'TRANS'); }
    });
  }
  var q = quelle();
  if (q === 'trans' || (q === 'auto' && !rmvSchluessel())) return trans();
  if (!rmvSchluessel()) return fertig(STATUS_FEHLER, null, 'RMV');
  rmvGet('trip?numF=5&passlist=1&maxChange=' + mx + '&minChangeTime=' + umstzeit() +
         '&originCoordLat=' + von.lat.toFixed(6) + '&originCoordLong=' + von.lon.toFixed(6) +
         '&destCoordLat=' + nach.lat.toFixed(6) + '&destCoordLong=' + nach.lon.toFixed(6) +
         '&originWalk=1,0,' + fm + ',100&destWalk=1,0,' + fm + ',100' +
         (an ? '&searchForArrival=1&date=' + dz.slice(0, 10) + '&time=' + dz.slice(11, 16) : ab ? rmvAb(ab) : ''), function (f, d) {
    if (f === null) {
      try { return fertig(null, (d.Trip || []).map(StreckenM.ausRmv), 'RMV'); }
      catch (e) { console.log('RMV-Verbindungen unlesbar: ' + e); f = STATUS_FEHLER; }
    }
    if (q === 'rmv') return fertig(f, null, 'RMV');
    console.log('RMV-Verbindungen fehlgeschlagen (' + f + '), nehme Transitous');
    trans();
  });
}

function startOrt(r, fertig) {             // fester Start oder Standort des Handys
  if (r.von) return fertig({ lat: r.von.lat, lon: r.von.lon });
  standort(function (p) { fertig(p); });
}

// Lädt Strecke i (oder die Sofort-Strecke HIER) und schickt Übersicht, bei detail >= 0 auch die Detailzeilen.
function routeLaden(i, detail) {
  var r = routen()[i];
  if (r) verbindungenLaden(r, i, null, 'route', detail);
}
// Puffer wie bei den Haltestellen; ab Standort gilt er nur, solange man sich kaum bewegt hat (PUFFER_ORT_M).
var PUFFER_ORT_M = 150;
function pufferRoute(r) { return ['R', quelle() + (dbSchluessel() ? '+db' : ''), r.von ? ortKennung(r.von) : 'HIER', ortKennung(r.nach), umstiege(), fussweg(), umstzeit()].join('|'); }
function verbindungenLaden(r, i, extra, kanal, detail) {
  var nr = ladeNrn[kanal] = (ladeNrn[kanal] || 0) + 1;
  var zt = kanal === 'route' ? ankunftZiel(r) : 0;
  var pk = pufferRoute(r) + (zt ? '|an' + zt : ''), p = pufferLesen(pk);
  function veraltet() { return nr !== ladeNrn[kanal]; }
  function an(msg, q, stand) {
    Object.keys(extra || {}).forEach(function (k) { msg[k] = extra[k]; });
    msg[keys.RUBRIK] = 1; msg[keys.SEITE] = i; msg[keys.QUELLE] = q || '';
    msg[keys.STAND] = stand || jetztS();
    if (zt) msg[keys.QUELLE] = 'AN' + hm(zt);   // Ankommen um: Zielzeit statt Quelle im Fuß (0.11.0)
    if (kanal === 'route') msg[keys.V_TEXT] = zt ? '' : vorschlagText(1, i, pk);
    senden(msg);
  }
  if (p) {                               // gepuffert: sofort zeigen (ab Standort: vom Ort des Puffers aus)
    console.log('Puffer ' + kanal + ' Strecke ' + (i + 1) + ': ' + p.alter + ' s alt');
    zeigen(p.liste, p.q, p.t, p.alter < FRISCH_S);
    if (p.alter < FRISCH_S && r.von) return;
  }
  startOrt(r, function (von) {
    if (veraltet()) return;
    if (!von) {
      if (p) return;                     // kein Standort: der Puffer bleibt stehen
      var m0 = {}; m0[keys.STATUS] = STATUS_STANDORT; m0[keys.R_N] = 0; return an(m0, '');
    }
    if (p && p.alter < FRISCH_S && p.von && L.entfernung(p.von.lat, p.von.lon, von.lat, von.lon) < PUFFER_ORT_M) return;
    verbindungenHolen(von, r.nach, function (f, liste, q) {
      if (veraltet()) return;
      if (f !== null) {
        if (p) { console.log('Strecke ' + (i + 1) + ': Abfrage fehlgeschlagen, Puffer bleibt stehen'); return; }
        var m1 = {}; m1[keys.STATUS] = f; return an(m1, q);
      }
      pufferSchreiben(pk, { q: q, liste: liste, von: { lat: von.lat, lon: von.lon } });
      zeigen(liste, q, 0, true);
    }, zt);
  });
  function zeigen(liste, q, stand, mitDetail) {
      liste = liste.filter(Boolean);
      var v = zt ? StreckenM.auswaehlen(liste.filter(function (x) { return x.an <= zt + 60; }), jetztS(), 99).slice(-3)   // die letzten vor der Zielzeit
                 : StreckenM.auswaehlen(liste, jetztS(), 3), msg = {};
      msg[keys.R_N] = v.length;
      for (var j = 0; j < 3; j++) {
        var x = v[j], erste = x && x.legs.filter(function (l) { return !l.fuss; })[0];
        msg[keys.R_LOS + j] = x ? x.los : 0;
        msg[keys.R_AN + j] = x ? x.an : 0;
        msg[keys.R_UM + j] = x ? x.umst : 0;
        msg[keys.R_DEL + j] = erste ? (erste.ausfall ? AUSFALL : erste.del) : 0;
        msg[keys.R_KETTE + j] = x ? L.utf8Kuerzen(StreckenM.kette(x), 31) : '';
        msg[keys.R_FLAG + j] = x ? StreckenM.merker(x, umstzeit()) : 0;
      }
      msg[keys.STATUS] = v.some(function (x) { return x.live; }) ? STATUS_LIVE : STATUS_SOLL;
      console.log('Strecke ' + (i + 1) + ': ' + v.length + ' Verbindungen (' + q + (stand ? ', Puffer' : '') + ')' + (v[0] ? ', erste ' + hm(v[0].los) + '-' + hm(v[0].an) + ' ' + StreckenM.kette(v[0]) : ''));
      an(msg, quelleText(q, v.some(function (x) { return x.db; })), stand);
      if (kanal === 'route' && !zt && r.von && v.length) vorschlagPruefen(1, i, pk, r.von, { name: r.nach.name, lat: r.nach.lat, lon: r.nach.lon },
        { led: r.nach.kurz, klar: r.nach.klar }, function (ab) {            // FRUEHER DA nur mit festem Start (0.8.0)
          var x = v.filter(function (y) { return y.los >= ab && !y.legs.some(function (l) { return !l.fuss && l.ausfall; }); })[0];
          return x ? x.an : 0;
        });
      if (!mitDetail || detail === undefined || detail < 0) return;
      if (detail === VORSCHLAG) return vorschlagDetailSenden(1, i);
      if (detail === LISTE) return fahrtenDetailSenden(1, i);
      if (!v.length) return detailSenden(1, i, 0, []);
      var k = detailWahl('1:' + i, v, detail, StreckenM.kennung);
      routeDetailSenden(r, i, k, v[k], stand || jetztS());
  }
}
// Details einer Verbindung v der Strecke r an die Uhr (Nummer nr), Grundlage für FAHRT STARTEN
function routeDetailSenden(r, i, nr, v, stand) {
  // Ortsname weg nur für den Ort der ersten Haltestelle ("HBF"), fremde behalten ihn ("MAINZ HBF")
  var erste = v.legs.filter(function (l) { return !l.fuss; })[0];
  var stadt = L.stadtVon(erste ? erste.von : r.nach.name);
  var vonName = r.von ? ortName(r.von) : T('HIER', 'Hier');
  detailSenden(1, i, nr, StreckenM.detailVerbindung(v, textHilfe(stadt), vonName, ortName(r.nach), umstzeit(), DMAX), undefined, stand);
  letztesDetail = { rubrik: 1, art: 'route', v: v, stadt: stadt, ziel: { lat: r.nach.lat, lon: r.nach.lon },
                    von: r.von ? { led: r.von.kurz, klar: r.von.klar } : { led: 'HIER', klar: 'Hier' },
                    nach: { led: r.nach.kurz, klar: r.nach.klar }, titel: { led: r.nach.kurz, klar: r.nach.klar } };
}

// Sofort-Strecke (VON HIER NACH): Platz HIER, ab Standort zu einem Favoriten oder zuletzt genutzten Ziel.
// Hoch/runter auf der Uhr: nächstes Ziel der Liste (WAHL = Nummer, das Handy rechnet sie um, wie bei Abfahrten hier).
function sofortListe() {
  var f = favSortiert();
  return f.concat(zuletztListe().filter(function (z) { return !f.some(function (x) { return gleicherOrt(x, z); }); }));
}
function sofortLaden(k, detail) {
  var liste = sofortListe(), n = liste.length;
  if (!n) { var m = {}; m[keys.RUBRIK] = 1; m[keys.SEITE] = HIER; m[keys.STATUS] = STATUS_FEHLER; m[keys.R_N] = 0; m[keys.HIER_NAME] = 'KEIN ZIEL'; m[keys.HIER_KLAR] = 'Kein Ziel'; return senden(m); }
  var i = ((k % n) + n) % n, o = liste[i], extra = {};
  sofortAktuell = o;
  extra[keys.S_FAV] = (istFav(hierAktuell) ? 1 : 0) | (istFav(o) ? 2 : 0);
  extra[keys.HIER_NAME] = o.kurz; extra[keys.HIER_KLAR] = o.klar; extra[keys.HIER_NR] = i; extra[keys.HIER_N] = n;
  verbindungenLaden({ von: null, nach: o }, HIER, extra, 'sofort', detail);
}

// Startseite der Strecken nach Standort: ein fester Start in der Nähe (500 m) zuerst; sonst bleibt die Seite, außer
// man steht schon an ihrem Ziel (unter 300 m) — dann die nächste, deren Ziel weiter weg ist. Kaum bewegt: nichts.
function routenSprung() {
  var liste = routen();
  if (liste.length < 2) return;
  standort(function (pos) {
    if (!pos) return;
    var vorher = null;
    try { vorher = JSON.parse(localStorage.getItem('rort')); } catch (e) {}
    localStorage.setItem('rort', JSON.stringify({ lat: pos.lat, lon: pos.lon }));
    if (vorher && L.entfernung(vorher.lat, vorher.lon, pos.lat, pos.lon) < BEWEGT) return;
    var aktiv = aktiveRoute(), ziel = aktiv, best = 501;
    liste.forEach(function (r, i) {
      if (!r.von) return;
      var m = L.entfernung(pos.lat, pos.lon, r.von.lat, r.von.lon);
      if (m < best - GLEICH_NAH || (m <= best + GLEICH_NAH && i === aktiv)) { best = m; ziel = i; }
    });
    if (best > 500) {
      function amZiel(r) { return L.entfernung(pos.lat, pos.lon, r.nach.lat, r.nach.lon) < BEWEGT; }
      if (amZiel(liste[aktiv]))
        for (var d = 1; d < liste.length; d++) { var j = (aktiv + d) % liste.length; if (!amZiel(liste[j])) { ziel = j; break; } }
    }
    console.log('Standort: Strecke ' + (ziel + 1) + (ziel === aktiv ? ' (schon aktiv)' : ''));
    if (ziel === aktiv) return;
    var m = {}; m[keys.SPRUNG] = ziel; m[keys.RUBRIK] = 1; senden(m);
  });
}

// ---------- Suche (seit 0.6.1): eine für alle Abläufe ----------
// SUCHEN > HALTESTELLE A-Z (Ort, Anfangsbuchstaben mit Anzahl) | SPRECHEN (Diktat auf der Uhr) | MEHR AM HANDY (Hinweis:
// Adressen und Favoriten bequem in der Pebble-App). weiter(ort) mit dem Fund. nurHalt: nur Haltestellen (Neue Haltestelle).
// TIPPEN (Buchstabenrad) seit 0.6.4 nicht mehr angeboten (Seb 2026-10-09: „eine Katastrophe“); Rad und Live-Treffer
// sind im Code geblieben (L_ANZAHL -3, A_TIPP). Das Diktat ist kein eigener Schritt: Zurück zeigt wieder SUCHEN (ablauf.imRad).
var REGION_M = 50000;                   // Haltestellen A-Z: Umkreis um den Standort (seit 0.6.4, vorher 15 km)
function schrittSuchen(nurHalt, weiter) {
  ablauf.gefunden = weiter; ablauf.nurHalt = nurHalt;
  schritt(T('SUCHEN', 'Suchen'), [{ t: T('HALTESTELLE A-Z', 'Haltestelle A-Z'), az: true }, { t: T('SPRECHEN', 'Sprechen'), art: -4 },
                                   { t: T('MEHR AM HANDY', 'Mehr am Handy'), info: true }], function (x) {
    if (x.az) return schrittOrte();
    if (x.info) {                       // Hinweis als Liste: jede Zeile führt zurück zu SUCHEN
      return schritt(T('AM HANDY', 'Am Handy'), [{ t: T('PEBBLE-APP OEFFNEN', 'Pebble-App öffnen') }, { t: T('LINIE 8: ZAHNRAD', 'Linie 8: Einstellungen') },
                                                  { t: T('FAVORITEN: SUCHEN', 'Favoriten: Adresse suchen') }, { t: T('WIRD SOFORT GESPEICHERT', 'wird sofort gespeichert') }],
                     function () { ablauf.schritte.pop(); ablauf.laedt = false; schrittZeigen(); });
    }
    ablauf.imRad = true; ablauf.laedt = false;
    var m = {}; m[keys.L_TITEL] = L.utf8Kuerzen(nurHalt ? T('HALTESTELLE', 'Haltestelle') : T('ADRESSE, ORT', 'Adresse, Ort'), LTXT); m[keys.L_ANZAHL] = x.art;
    senden(m, true);
  });
}
function geocode(text, n, nurHalt, pos, fertig) {
  var q = 'v1/geocode?language=de&numResults=' + n + '&text=' + encodeURIComponent(text) + (nurHalt ? '&type=STOP' : '') +
          (pos ? '&place=' + pos.lat.toFixed(5) + ',' + pos.lon.toFixed(5) + '&placeBias=4' : '');
  // Ortsbezug 4: "Kurhaus" findet das in Wiesbaden, "Wiesbaden Hauptbahnhof" aus Bielefeld trotzdem Wiesbaden (bei 10
  // stand Bielefeld Hbf oben, geprüft 2026-10-09). Danach: Treffer mit allen gesuchten Wörtern zuerst, darin
  // Haltestellen vor Adressen und Orten (Wunsch Seb 2026-10-09), gleiche Anzeige nur einmal.
  var woerter = L.ledText(text).split(' ').filter(function (w) { return w.length >= 3; });
  function punkte(o) { var h = L.ledText(o.name + ' ' + o.stadt); return woerter.filter(function (w) { return h.indexOf(w) >= 0; }).length; }
  transitousHolen(q, function (f, d) {
    if (f) return fertig(f);
    fertig(null, (d || []).map(function (r) {
      var stadt = ((r.areas || []).filter(function (a) { return a.default; })[0] || (r.areas || [])[0] || {}).name || '';
      var fern = pos && L.entfernung(pos.lat, pos.lon, r.lat, r.lon) > 5000;
      if (r.type === 'STOP') return ortNeu(r.name, stadt, r.lat, r.lon, 'halt', r.id, fern);
      var name = r.type === 'ADDRESS' && r.street ? r.street + (r.houseNumber ? ' ' + r.houseNumber : '') : r.name;
      return ortNeu(name, stadt, r.lat, r.lon, r.type === 'ADDRESS' ? 'adresse' : 'ort', null, fern);
    }).filter(function (o) { return o.name && (!nurHalt || o.id); })
      .map(function (o, i) { return { o: o, p: punkte(o), h: o.typ === 'halt' ? 0 : 1, i: i }; })
      .sort(function (a, b) { return b.p - a.p || a.h - b.h || a.i - b.i; })
      .map(function (x) { return x.o; })
      .filter(function (o, i, alle) {
        var k = ortName(o) + '|' + o.stadt;
        return !alle.slice(0, i).some(function (x) { return ortName(x) + '|' + x.stadt === k; });
      }));
  });
}
function trefferText(o, pos) {          // "WILHELMSTR 12 WIESBADEN 1.2KM"
  var stadt = o.stadt && ortName(o).toUpperCase().indexOf(o.stadt.toUpperCase()) < 0 && o.name.indexOf(o.stadt) < 0 ? ' ' + T(L.ledText(o.stadt), o.stadt) : '';
  var hinten = pos ? ' ' + km(L.entfernung(pos.lat, pos.lon, o.lat, o.lon)) : '';
  return L.utf8Kuerzen(ortName(o) + stadt, LTXT - hinten.length) + hinten;
}
var letzterOrt = null;                   // Standort für die Suche (Ortsbezug), höchstens 10 min alt
function suchOrt(fertig) {
  if (letzterOrt && Date.now() - letzterOrt.zeit < 600000) return fertig(letzterOrt.pos);
  standort(function (p) { if (p) letzterOrt = { pos: p, zeit: Date.now() }; fertig(p); });
}
function tippen(text) {                  // live beim Tippen: die drei besten Treffer unter dem Rad
  var nr = ladeNrn.tipp = (ladeNrn.tipp || 0) + 1;
  if (!text || text.length < 3) return;
  suchOrt(function (pos) {
    geocode(text, 3, ablauf && ablauf.nurHalt, pos, function (f, liste) {
      if (nr !== ladeNrn.tipp || f) return;
      var m = {}; m[keys.TREFFER] = L.utf8Kuerzen(liste.slice(0, 3).map(function (o) { return trefferText(o, null); }).join('|'), 120);
      senden(m, true);
    });
  });
}
function suchtext(text) {                // Rad fertig (Select lang) oder Diktat: Trefferliste
  ablauf.imRad = false;
  if (!text) { ablauf.laedt = false; return schrittZeigen(); }
  ladeSenden(T('SUCHE', 'Suche'), true);
  suchOrt(aktuell(function (pos) {
    geocode(text, 25, ablauf.nurHalt, pos, aktuell(function (f, liste) {
      if (f) return fehlerSchritt(f, function () { suchtext(text); });
      if (!liste.length) return schritt(T('NICHTS GEFUNDEN', 'Nichts gefunden'), [{ t: T('NOCHMAL', 'Nochmal') }], function () { ablauf.schritte.pop(); ablauf.laedt = false; schrittZeigen(); });
      schritt(L.utf8Kuerzen(T(L.ledText(text), text), LTXT), liste.map(function (o) { return { t: trefferText(o, pos), o: o }; }), function (x) {
        ablauf.gefunden(x.o);
      });
    }));
  }));
}

// Haltestelle A-Z (seit 0.6.4): alle Haltestellen im Umkreis REGION_M (50 km), Orte alphabetisch — die Stadt findet man
// so schneller als nach Entfernung (Wunsch Seb 2026-10-09). Oben der eigene Ort als Abkürzung. Dann die Haltestellen
// des Orts nach Anfangsbuchstaben. Transitous liefert höchstens ein Rechteck von ~25 km ("too many stops"): 4 x 4
// Kacheln, zusammen ~5 MB, ~8.000 Haltestellen in ~700 Orten (Wiesbaden, geprüft 2026-10-09). Gemerkt wird eine
// kompakte Liste [Name, lat, lon, Kennung] (~0,5 MB) bis 30 Tage, solange man keine 5 km weiter ist.
function ortVon(name) {
  if (name.indexOf(',') >= 0) return name.split(',')[0].trim();
  var t = name.split(/[ \-]/);
  if (t.length > 1 && /^(Bad|St\.|Sankt|Neu|Groß|Klein|Ober|Nieder|Unter|Alt)$/.test(t[0])) return t[0] + ' ' + t[1];
  return t[0];
}
var regionCache = null;
function regionLaden(pos, fertig) {
  var jetzt = Date.now(), r = regionCache;
  if (!r) { try { r = JSON.parse(localStorage.getItem('region')); } catch (e) {} }
  if (r && r.liste && L.entfernung(r.lat, r.lon, pos.lat, pos.lon) < 5000 && jetzt - r.zeit < 30 * 86400000) { regionCache = r; return fertig(null, r.liste); }
  var N = 4, dl = REGION_M / 111320, dn = REGION_M / (111320 * Math.cos(pos.lat * Math.PI / 180)), aufgaben = [], je = {}, fehler = null;
  for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) (function (a, b, c, d) {
    aufgaben.push(function (weiter) {
      transitousHolen('v1/map/stops?min=' + a.toFixed(5) + ',' + b.toFixed(5) + '&max=' + c.toFixed(5) + ',' + d.toFixed(5), function (f, daten) {
        if (f || !daten || !daten.length) fehler = fehler || f || 'leer';
        (daten && daten.length ? daten : []).forEach(function (s) {
          if (!s.stopId || !s.name || L.entfernung(pos.lat, pos.lon, s.lat, s.lon) > REGION_M) return;
          var k = s.name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
          if (!je[k] || s.name.indexOf(',') < 0) je[k] = [s.name, +s.lat.toFixed(5), +s.lon.toFixed(5), s.stopId];
        });
        weiter();
      });
    });
  })(pos.lat - dl + i * 2 * dl / N, pos.lon - dn + j * 2 * dn / N, pos.lat - dl + (i + 1) * 2 * dl / N, pos.lon - dn + (j + 1) * 2 * dn / N);
  var n = 0;
  (function parallel() {                // höchstens 4 gleichzeitig (Transitous drosselt), Fortschritt an die Uhr
    var laufend = 0, i = 0;
    function los() {
      while (laufend < 4 && i < aufgaben.length) {
        laufend++;
        aufgaben[i++](function () {
          laufend--; n++;
          ladeSenden(T('HALTESTELLEN ', 'Haltestellen ') + n + '/' + aufgaben.length);
          if (n === aufgaben.length) return ende(); los();
        });
      }
    }
    los();
  })();
  function ende() {
    var liste = Object.keys(je).map(function (k) { return je[k]; });
    if (!liste.length) return fertig(fehler || 'leer');
    regionCache = { lat: pos.lat, lon: pos.lon, zeit: jetzt, liste: liste };
    try { localStorage.setItem('region', JSON.stringify(regionCache)); } catch (e) { console.log('Region nicht gemerkt: ' + e); }
    console.log('Region: ' + liste.length + ' Haltestellen' + (fehler ? ', Kachel-Fehler ' + fehler : ''));
    fertig(null, liste);
  }
}

// Allgemeine A-Z-Auswahl: bis AZ_DIREKT Einträge direkt, sonst Gruppen nach dem Anfang mit Anzahl. Ein gemeinsamer
// Anfang wird übersprungen (alle "FLUGHAFEN …" -> gleich FLUGHAFEN F / G / R / T), eine Gruppe mit nur einem Eintrag
// steht gleich als Eintrag da. oben: feste Einträge nur auf der ersten Stufe (eigener Ort).
var AZ_DIREKT = 20;
function azSchritt(titel, items, schluessel, zeile, wahl, vorn, oben) {
  vorn = vorn || '';
  var passend = items.filter(function (x) { return schluessel(x).indexOf(vorn) === 0; });
  function sortiert(l) { return l.slice().sort(function (a, b) { return L.sortDe(schluessel(a), schluessel(b)); }); }
  if (passend.length > AZ_DIREKT) {
    var gemeinsam = schluessel(passend[0]);
    passend.forEach(function (x) { var s = schluessel(x); while (s.indexOf(gemeinsam) !== 0) gemeinsam = gemeinsam.slice(0, -1); });
    if (gemeinsam.length > vorn.length) vorn = gemeinsam;
  }
  var kopf = (oben || []).map(function (o) { return { t: o.t, oben: o }; });
  if (passend.length <= AZ_DIREKT) {
    return schritt(L.utf8Kuerzen(titel + (vorn ? ' ' + vorn : ''), LTXT), kopf.concat(sortiert(passend).map(function (x) { return { t: zeile(x), x: x }; })), function (y) {
      if (y.oben) return y.oben.wahl();
      wahl(y.x);
    });
  }
  var gruppen = {}, reihe = [];
  passend.forEach(function (x) {
    var s = schluessel(x), k = s.substring(0, vorn.length + 1);
    if (k.length <= vorn.length) k = vorn;               // Name endet hier: eigene Gruppe
    else if (!/[A-Z]$/.test(k)) k = vorn + '0-9';
    if (!gruppen[k]) { gruppen[k] = []; reihe.push(k); }
    gruppen[k].push(x);
  });
  reihe.sort(L.sortDe);
  schritt(L.utf8Kuerzen(titel + ' ' + vorn + T('A-Z', 'A–Z'), LTXT), kopf.concat(reihe.map(function (k) {
    return gruppen[k].length === 1 ? { t: zeile(gruppen[k][0]), x: gruppen[k][0] } : { t: k + ' (' + gruppen[k].length + ')', k: k };
  })), function (y) {
    if (y.oben) return y.oben.wahl();
    if (y.x) return wahl(y.x);
    if (y.k === vorn || /0-9$/.test(y.k) || gruppen[y.k].length <= AZ_DIREKT) {
      return schritt(L.utf8Kuerzen(titel + ' ' + y.k, LTXT), sortiert(gruppen[y.k]).map(function (x) { return { t: zeile(x), x: x }; }), function (z) { wahl(z.x); });
    }
    azSchritt(titel, gruppen[y.k], schluessel, zeile, wahl, y.k);
  });
}

function schrittOrte() {
  ladeSenden(T('HALTESTELLEN', 'Haltestellen'), true);
  suchOrt(aktuell(function (pos) {
    if (!pos) return fehlerSchritt('standort', schrittOrte);
    regionLaden(pos, aktuell(function (f, liste) {
      if (f) return fehlerSchritt(f, schrittOrte);
      var orte = {}, reihe = [], naechster = null;
      liste.forEach(function (e) {
        var h = { name: e[0], lat: e[1], lon: e[2], id: e[3], m: L.entfernung(pos.lat, pos.lon, e[1], e[2]) }, o = ortVon(h.name);
        if (!orte[o]) { orte[o] = { name: o, halte: [] }; reihe.push(o); }
        orte[o].halte.push(h);
        if (!naechster || h.m < naechster.m) naechster = h;
      });
      function ortWahl(o) {
        azSchritt(T(L.ledText(o.name), o.name), o.halte, function (h) { return L.ledText(L.kurzname(h.name, o.name)); },
                  function (h) { return mitM(h.name, h.m, o.name); }, function (h) { ablauf.gefunden(ortAusHalt(h)); });
      }
      var hier = naechster && orte[ortVon(naechster.name)];
      var oben = hier ? [{ t: T(L.ledText(hier.name) + ' (HIER)', hier.name + ' (hier)'), wahl: function () { ortWahl(hier); } }] : [];
      azSchritt(T('ORT', 'Ort'), reihe.map(function (o) { return orte[o]; }), function (o) { return L.ledText(o.name); },
                function (o) { return T(L.ledText(o.name), o.name) + ' (' + o.halte.length + ')'; }, ortWahl, '', oben);
    }));
  }));
}

// ---------- Neue Strecke / Strecke ändern ----------
function trenner(t) { return { t: '-- ' + t + ' --', trenner: true }; }
// Ortslisten (seit 0.8.0 überall dieselbe Reihenfolge): HIER bzw. ALLE IN DER NAEHE · -- IN DER NAEHE -- ·
// -- FAVORITEN -- · -- ZULETZT -- · SUCHEN. Blöcke, die nicht passen, fehlen (als Ziel gibt es kein HIER).
function favEintraege(e, pos, ohne, nurHalt) {
  var f = favSortiert().filter(function (o) { return !gleicherOrt(o, ohne) && (!nurHalt || o.id); });
  if (!f.length) return;
  e.push(trenner(T('FAVORITEN', 'Favoriten')));
  f.forEach(function (o) { e.push({ t: ortText(o, pos), ort: o }); });
}
function zuletztEintraege(e, pos, ohne, nurHalt) {
  var z = zuletztListe().filter(function (o) { return !gleicherOrt(o, ohne) && !istFav(o) && (!nurHalt || o.id); });
  if (!z.length) return;
  e.push(trenner(T('ZULETZT', 'Zuletzt')));
  z.forEach(function (o) { e.push({ t: ortText(o, pos), ort: o }); });
}
function schrittVon() {
  ladeSenden(T('STANDORT', 'Standort'), true);
  standort(aktuell(function (pos) {
    if (pos) letzterOrt = { pos: pos, zeit: Date.now() };
    ablauf.pos = pos;
    function rest(nah) {
      var e = [{ t: T('HIER', 'Hier') + (pos ? '' : T(' (KEIN STANDORT)', ' (kein Standort)')), hier: true }];
      if (nah && nah.length) {
        e.push(trenner(T('IN DER NAEHE', 'In der Nähe')));
        nah.forEach(function (h) { e.push({ t: mitM(h.name, h.m, L.stadtVon(h.name)), ort: ortAusHalt(h) }); });
      }
      favEintraege(e, pos, null);
      zuletztEintraege(e, pos, null);
      e.push({ t: T('SUCHEN', 'Suchen'), suchen: true });
      schritt(T('VON', 'Von'), e, function (x) {
        if (x.suchen) return schrittSuchen(false, function (o) { ablauf.von = o; schrittNach(); });
        ablauf.von = x.hier ? null : x.ort;
        schrittNach();
      });
    }
    if (!pos) return rest(null);
    L.naechsteHaltestellen(pos.lat, pos.lon, NAH, aktuell(function (f, liste) { rest(f ? null : liste); }));
  }));
}
function zielEintraege(pos, ohne) {      // Favoriten, zuletzt genutzte Ziele, Suchen
  var e = [];
  favEintraege(e, pos, ohne);
  zuletztEintraege(e, pos, ohne);
  e.push({ t: T('SUCHEN', 'Suchen'), suchen: true });
  return e;
}
function schrittNach() {
  var von = ablauf.von, pos = von ? { lat: von.lat, lon: von.lon } : ablauf.pos;
  schritt(T('NACH', 'Nach'), zielEintraege(pos, von), function (x) {
    if (x.suchen) return schrittSuchen(false, function (o) { ablauf.nach = o; schrittRoutePruefen(); });
    ablauf.nach = x.ort;
    schrittRoutePruefen();
  });
}
function schrittRoutePruefen() {
  ladeSenden(T('PRUEFE', 'Prüfe'), true);
  startOrt({ von: ablauf.von }, aktuell(function (von) {
    if (!von) return fehlerSchritt('standort', schrittRoutePruefen);
    verbindungenHolen(von, ablauf.nach, aktuell(function (f, liste) {
      if (f !== null) return fehlerSchritt(f === STATUS_NETZ ? 'kein Netz' : 'fehler', schrittRoutePruefen);
      var v = StreckenM.auswaehlen(liste, Math.floor(Date.now() / 1000), 1)[0];
      var titel = v ? StreckenM.kette(v) + ' ' + T('AN ', 'an ') + hm(v.an) : T('KEINE VERBINDUNG', 'Keine Verbindung');
      schritt(L.utf8Kuerzen(titel, LTXT), [{ t: T('SPEICHERN', 'Speichern'), ok: true }, { t: T('NOCHMAL', 'Nochmal') }], function (x) {
        if (!x.ok) { ablauf.schritte.pop(); return schrittRoutePruefen(); }
        routeSpeichern();
      });
    }));
  }));
}
function routenText(r) { return (r.von ? ortName(r.von) : T('HIER', 'Hier')) + ' > ' + ortName(r.nach); }
function routeSpeichern() {
  var liste = routen(), i = ablauf.ziel, neu = { von: ablauf.von || null, nach: ablauf.nach, zuletzt: Math.floor(Date.now() / 1000) };
  genutzt(neu.von); genutzt(neu.nach); zuletztMerken(neu.nach);
  if (i >= 0 && i < liste.length) { liste[i] = neu; return routeFertig(liste, i, neu); }
  if (liste.length < MAXR) { liste.push(neu); return routeFertig(liste, liste.length - 1, neu); }
  ersetzenFragen(liste.map(routenText), function (weg) {      // voll (0.8.0): gewählte weg, neue ans Ende
    var l = routen();
    l.splice(weg, 1); l.push(neu);
    console.log('Menü: Strecke ' + (weg + 1) + ' ersetzt');
    routeFertig(l, l.length - 1, neu);
  });
}
function routeFertig(liste, i, neu) {
  routenSchreiben(liste);
  localStorage.setItem('rseite', String(i));
  localStorage.setItem('rubrik', '1');
  console.log('Menü: Strecke ' + (i + 1) + ' gespeichert: ' + (neu.von ? neu.von.kurz : 'HIER') + ' -> ' + neu.nach.kurz);
  ablauf = null;
  routenSenden();                        // Uhr schließt das Menü, sobald die Einrichtung ankommt
  routeLaden(i);
}
function routeRueck(i) {                 // Rückfahrt: Start und Ziel getauscht, direkt dahinter (voll: ersetzen)
  var liste = routen(), r = liste[i];
  if (!r || !r.von) return menueEnde();
  var neu = { von: r.nach, nach: r.von, zuletzt: Math.floor(Date.now() / 1000) };
  if (liste.length < MAXR) { liste.splice(i + 1, 0, neu); return routeFertig(liste, i + 1, neu); }
  ersetzenFragen(liste.map(routenText), function (weg) {
    var l = routen(), pos = rueckPlatz(i, weg);
    l.splice(weg, 1); l.splice(pos, 0, neu);
    routeFertig(l, pos, neu);
  });
}
// Ankommen um (0.11.0): Zielzeit für eine gespeicherte Strecke, zwei Listen (Stunde, Minute in 5er-Schritten).
// Gilt, bis sie vorbei ist, eine Fahrt startet oder JETZT gewählt wird. 'ankunft' = { k: Start|Ziel, t: UTC-Sekunden }
function routeKennung(r) { return (r.von ? ortKennung(r.von) : 'HIER') + '|' + ortKennung(r.nach); }
function ankunftZiel(r) {
  var a = null;
  try { a = JSON.parse(localStorage.getItem('ankunft') || 'null'); } catch (e) {}
  return a && a.k === routeKennung(r) && a.t > jetztS() ? a.t : 0;
}
function ankunftWaehlen(i) {
  var r = routen()[i];
  if (!r) return menueEnde();
  function fertig(t) {
    if (t) localStorage.setItem('ankunft', JSON.stringify({ k: routeKennung(r), t: t })); else localStorage.setItem('ankunft', '');
    console.log('Ankommen um: ' + (t ? hm(t) : 'aus'));
    menueEnde(true);
    routeLaden(i);
  }
  var jetzt = jetztS(), o = new Date((jetzt + mezVersatz(jetzt)) * 1000), h0 = o.getUTCHours();
  function zeit(h, m) {                  // deutsche Uhrzeit heute (vorbei: morgen) -> UTC-Sekunden
    var s = Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate(), h, m) / 1000, t = s - mezVersatz(s - 7200);
    return t <= jetzt ? t + 86400 : t;
  }
  function zz(n) { return ('0' + n).slice(-2); }
  var stunden = [{ t: T('JETZT', 'Jetzt'), jetzt: true }];
  for (var k = o.getUTCMinutes() >= 55 ? 1 : 0; k < 24; k++) stunden.push({ t: zz((h0 + k) % 24) + T(' UHR', ' Uhr'), h: (h0 + k) % 24 });
  neuerAblauf(-1);
  schritt(T('ANKOMMEN UM', 'Ankommen um'), stunden, function (x) {
    if (x.jetzt) return fertig(0);
    var min = [];
    for (var m = 0; m < 60; m += 5) if (x.h !== h0 || zeit(x.h, m) - jetzt < 82800) min.push({ t: zz(x.h) + ':' + zz(m), m: m });
    schritt(T('ANKOMMEN UM', 'Ankommen um'), min, function (y) { fertig(zeit(x.h, y.m)); });
  });
}
function routeLoeschen(i) {
  var liste = routen();
  ablauf = null;
  if (i >= 0 && i < liste.length) liste.splice(i, 1);
  routenSchreiben(liste);
  localStorage.setItem('rseite', String(Math.max(0, Math.min(i, liste.length - 1))));
  routenSenden();
  if (liste.length) routeLaden(aktiveRoute());
}

// VON HIER NACH: Ziel wählen, dann die Sofort-Strecke auf der Uhr (L_ANZAHL -5), nichts gespeichert außer „zuletzt“
function schrittSofort() {
  suchOrt(aktuell(function (pos) {
    schritt(T('STRECKE AB HIER', 'Strecke ab hier'), zielEintraege(pos, null), function (x) {
      if (x.suchen) return schrittSuchen(false, sofortZeigen);
      sofortZeigen(x.ort);
    });
  }));
}
function sofortZeigen(o) {
  genutzt(o); zuletztMerken(o);
  var liste = sofortListe(), k = 0;
  liste.forEach(function (x, i) { if (gleicherOrt(x, o)) k = i; });
  ablauf = null;
  var m = {}; m[keys.L_TITEL] = ''; m[keys.L_ANZAHL] = -5; m[keys.WAHL] = k; senden(m, true);
  sofortLaden(k);
}

// ---------- Favoriten (Einstellungen > Favoriten, seit 0.8.0 bis 20, auch aus jeder Seite) ----------
// Liste nach Häufigkeit (wie überall), darunter ALLE n LOESCHEN. Je Favorit: UMBENENNEN (Diktat) und LOESCHEN: <Name>.
// Löschen und Ersetzen gehen über die Bestätigungsseite der Uhr (frage).
function schrittFavoriten() {
  suchOrt(aktuell(function (pos) {
    var liste = favSortiert(), e = [{ t: T('FAVORIT NEU ', 'Favorit neu ') + liste.length + '/' + MAXF, neu: true }];
    liste.forEach(function (o) { e.push({ t: ortText(o, pos), o: o }); });
    if (liste.length) e.push({ t: T('ALLE ' + liste.length + ' LOESCHEN', 'Alle ' + liste.length + ' löschen'), alle: true, frage: true });
    schritt(T('FAVORITEN', 'Favoriten'), e, function (x) {
      if (x.neu) return schrittFavNeu();
      if (x.alle) {
        favoritenSchreiben([]); favMaskenSenden();
        console.log('Favoriten: alle gelöscht');
        ablauf.schritte = []; return schrittFavoriten();
      }
      schrittFavorit(x.o);
    });
  }));
}
function schrittFavorit(o) {
  schritt(L.utf8Kuerzen(ortName(o), LTXT), [{ t: T('UMBENENNEN', 'Umbenennen'), um: true },
                                            { t: L.utf8Kuerzen(T('LOESCHEN: ', 'Löschen: ') + ortName(o), LTXT), weg: true, frage: true }], function (x) {
    if (x.weg) {
      favoritenSchreiben(favoriten().filter(function (f) { return !gleicherOrt(f, o); }));
      favMaskenSenden();
      console.log('Favorit gelöscht: ' + o.kurz);
      ablauf.schritte = []; return schrittFavoriten();
    }
    ablauf.umbenennen = o; ablauf.imRad = true; ablauf.laedt = false;   // Diktat auf der Uhr, Antwort kommt als A_SUCHTEXT
    var m = {}; m[keys.L_TITEL] = L.utf8Kuerzen(T('NEUER NAME', 'Neuer Name'), LTXT); m[keys.L_ANZAHL] = -4; senden(m, true);
  });
}
function umbenennen(text) {
  var o = ablauf.umbenennen, t = String(text || '').replace(/[.!?]+$/, '').trim();
  ablauf.umbenennen = null; ablauf.imRad = false;
  if (!t || !o) { ablauf.laedt = false; return schrittZeigen(); }
  var alt = favoriten(), neu = alt.map(function (f) {
    if (!gleicherOrt(f, o)) return f;
    var g = JSON.parse(JSON.stringify(f));
    g.klar = L.utf8Kuerzen(t, 31); g.kurz = L.utf8Kuerzen(L.ledText(t), 31);
    return g;
  });
  favoritenSchreiben(neu);
  namenNachziehen(alt, neu);
  console.log('Favorit umbenannt: ' + o.kurz + ' -> ' + L.ledText(t));
  ablauf.schritte = []; schrittFavoriten();
}
// Favorit umbenannt (Uhr oder Handy): Strecken mit demselben Ort, die noch den alten Namen tragen, ziehen mit.
// Eigene Namen einer Strecke bleiben. Die Strecken behalten ihre Kopie des Orts (Favorit löschen lässt sie heil).
function namenNachziehen(alt, neu) {
  var r = routen(), geaendert = false;
  neu.forEach(function (f) {
    var a = alt.filter(function (x) { return gleicherOrt(x, f); })[0];
    if (!a || (a.kurz === f.kurz && a.klar === f.klar)) return;
    r.forEach(function (x) {
      ['von', 'nach'].forEach(function (k) {
        var q = x[k];
        if (q && gleicherOrt(q, f) && q.kurz === a.kurz) { q.kurz = f.kurz; q.klar = f.klar; geaendert = true; }
      });
    });
  });
  if (geaendert) { routenSchreiben(r); routenSenden(); console.log('Strecken: Favoritennamen nachgezogen'); }
  return geaendert;
}
// Neuer Favorit; voll (20): erst fragen, welcher ersetzt wird — selten genutzte oben (bewusst gegen die übliche Sortierung)
function favNeu(o, fertig) {
  var l = favoriten();
  if (l.some(function (x) { return gleicherOrt(x, o); })) return fertig();
  function rein(l2) {
    o.n = 0;
    l2.push(o);
    favoritenSchreiben(l2);
    localStorage.setItem('zuletzt', JSON.stringify(zuletztListe().filter(function (x) { return !gleicherOrt(x, o); })));
    console.log('Favorit gespeichert: ' + o.kurz + ' (' + o.typ + '), ' + l2.length + '/' + MAXF);
    favMaskenSenden();
    fertig();
  }
  if (l.length < MAXF) return rein(l);
  var auf = l.slice().sort(function (a, b) { return (a.n || 0) - (b.n || 0) || L.sortDe(a.name, b.name); });
  ersetzenFragen(auf.map(function (x) { return ortText(x, null); }), function (k) {
    var weg = auf[k];
    console.log('Favorit ersetzt: ' + weg.kurz);
    rein(favoriten().filter(function (x) { return !gleicherOrt(x, weg); }));
  });
}
function schrittFavNeu() {               // HIER · -- IN DER NAEHE -- · -- ZULETZT -- · SUCHEN (Reihenfolge wie alle Ortslisten)
  ladeSenden(T('STANDORT', 'Standort'), true);
  standort(aktuell(function (pos) {
    if (pos) letzterOrt = { pos: pos, zeit: Date.now() };
    function rest(nah) {
      var e = [];
      if (pos) e.push({ t: T('HIER', 'Hier'), hier: true });
      if (nah && nah.length) {
        e.push(trenner(T('IN DER NAEHE', 'In der Nähe')));
        nah.forEach(function (h) { e.push({ t: mitM(h.name, h.m, L.stadtVon(h.name)), ort: ortAusHalt(h) }); });
      }
      zuletztEintraege(e, pos, null, false);
      e.push({ t: T('SUCHEN', 'Suchen'), suchen: true });
      schritt(T('FAVORIT NEU', 'Favorit neu'), e, function (x) {
        if (x.suchen) return schrittSuchen(false, favSpeichern);
        if (x.hier) return hierSpeichern(pos);
        favSpeichern(x.ort);
      });
    }
    if (!pos) return rest(null);
    L.naechsteHaltestellen(pos.lat, pos.lon, NAH, aktuell(function (f, liste) { rest(f ? null : liste); }));
  }));
}
function hierSpeichern(pos) {            // Name per Adresssuche rückwärts, sonst "STANDORT 12:34"
  ladeSenden(T('ADRESSE', 'Adresse'), true);
  transitousHolen('v1/reverse-geocode?place=' + pos.lat.toFixed(6) + ',' + pos.lon.toFixed(6), aktuell(function (f, d) {
    var r = !f && (d || []).filter(function (x) { return x.type === 'ADDRESS' && x.street; })[0];
    var stadt = r ? (((r.areas || []).filter(function (a) { return a.default; })[0] || {}).name || '') : '';
    favSpeichern(ortNeu(r ? r.street + (r.houseNumber ? ' ' + r.houseNumber : '') : T('STANDORT ', 'Standort ') + hm(Math.floor(Date.now() / 1000)),
                        stadt, pos.lat, pos.lon, 'adresse'));
  }));
}
function favSpeichern(o) { favNeu(o, function () { ablauf.schritte = []; schrittFavoriten(); }); }

// Menü einer Seite: FAVORIT: <Ort> (0.8.0). WAHL = Seite * 2 + (1 = Ziel), Seite HIER = Sofort-Ansicht. Danach zur Anzeige.
function favAusSeite(rub, wahl) {
  var seite = Math.floor(wahl / 2), ziel = wahl % 2 === 1, o = null, h = null;
  if (rub === 1) {
    var r = seite === HIER ? { nach: sofortAktuell } : routen()[seite];
    o = r && (ziel ? r.nach : r.von);
    if (o) { o = JSON.parse(JSON.stringify(o)); o.n = 0; }
  } else {
    h = seite === HIER ? hierAktuell : (strecken()[seite] || {})[ziel ? 'b' : 'a'];
    if (h) o = ortNeu(h.name, '', h.lat, h.lon, 'halt', h.id, false);
  }
  if (!o) return menueEnde(true);
  neuerAblauf(-1);
  function weiter() { favNeu(o, function () { menueEnde(true); }); }
  if (o.lat !== undefined) return weiter();
  koordinaten(o, aktuell(function (f) { if (f) return fehlerSchritt(f, function () { favAusSeite(rub, wahl); }); weiter(); }));
}
// Sofort-Ansicht speichern (0.8.0): ABFAHRT SPEICHERN (Haltestelle, alle Linien, ohne Ausstieg) bzw. STRECKE SPEICHERN (ab Standort)
function sofortSpeichern(rub) {
  if (rub === 1) {
    if (!sofortAktuell) return menueEnde(true);
    neuerAblauf(-1); ablauf.von = null; ablauf.nach = sofortAktuell;
    return routeSpeichern();
  }
  if (!hierAktuell) return menueEnde(true);
  neuerAblauf(-1);
  speichern({ a: mitKurz(halt(hierAktuell), L.stadtVon(hierAktuell.name)), b: null, alle: true, linien: [] });
}
function alleLoeschen(w) {               // Einstellungen > Abfahrten bzw. Strecken > ALLE n LOESCHEN (bestätigt an der Uhr)
  ablauf = null;
  if (w === 1) { routenSchreiben([]); localStorage.setItem('rseite', '0'); console.log('Strecken: alle gelöscht'); return routenSenden(); }
  streckenSchreiben([]); localStorage.setItem('seite', '0'); console.log('Abfahrten: alle gelöscht');
  einrichtungSenden();
}

// ---------- Einstellungen: eingebettete Seite ----------
var seitenOrt = null;                    // Standort für die Seite, beim Wiederöffnen nach dem Speichern weiterverwendet
function seiteOeffnen(standort, standortFehler) {
  if (standort) seitenOrt = standort;
  var zustand = { strecken: strecken(), standort: standort || seitenOrt, standortFehler: standortFehler, schrift: SCHRIFT.F35,
                  rmvKey: rmvSchluessel(), dbId: localStorage.getItem('dbId') || '', dbKey: localStorage.getItem('dbKey') || '', layout: layout(), invers: invers(), kontrast: kontrast(), schliessen: schliessen(), umkreis: umkreis(), quelle: quelle(), abfahrt: abfahrt(), dauer: dauer(),
                  routen: routen(), favoriten: favoriten(), umstiege: umstiege(), fussweg: fussweg(), umstzeit: umstzeit() };
  var html = SEITE_HTML.replace('/*ZUSTAND*/null', function () { return JSON.stringify(zustand); });
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function konfig(an) { var m = {}; m[keys.KONFIG] = an ? 1 : 0; senden(m); }   // Uhr: Ruhe-Zeit aussetzen (0.6.6)
Pebble.addEventListener('showConfiguration', function () {
  konfig(true);
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
  if (!e || !e.response) return konfig(false);
  var daten = null;
  try {
    daten = JSON.parse(decodeURIComponent(e.response));
    if (!daten.strecken) return;                      // Abbrechen (bis 0.6.3)
    if (daten.rmvKey !== undefined) localStorage.setItem('rmvKey', String(daten.rmvKey).trim());
    if (daten.dbId !== undefined) localStorage.setItem('dbId', String(daten.dbId).trim());      // DB Timetables (0.9.0)
    if (daten.dbKey !== undefined) localStorage.setItem('dbKey', String(daten.dbKey).trim());
    if (LAYOUTS.indexOf(daten.layout) >= 0 && daten.layout !== 'invers' && daten.layout !== 'led') localStorage.setItem('layout', daten.layout);
    if (daten.invers !== undefined) localStorage.setItem('invers', daten.invers ? '1' : '0');
    if (daten.kontrast !== undefined) localStorage.setItem('kontrast', daten.kontrast ? '1' : '0');
    if (daten.schliessen !== undefined) localStorage.setItem('schliessen', daten.schliessen ? '1' : '0');
    if (QUELLEN.indexOf(daten.quelle) >= 0) localStorage.setItem('quelle', daten.quelle);
    if (daten.abfahrt === 'plan' || daten.abfahrt === 'aktuell') localStorage.setItem('abfahrt', daten.abfahrt);
    if (daten.dauer === 'an' || daten.dauer === 'aus') localStorage.setItem('dauer', daten.dauer);
    if (L.UMKREISE.indexOf(daten.umkreis) >= 0) localStorage.setItem('umkreis', String(daten.umkreis));
    ablauf = null;
    streckenSchreiben(daten.strecken.slice(0, MAXS));   // aktive Seite bleibt (aktiveSeite begrenzt sie), seit 0.6.4
    if (daten.routen) {                                // seit 0.6.1: Strecken, Favoriten, Verbindungssuche
      var favAlt = favoriten(), favNeu2 = (daten.favoriten || []).slice(0, MAXF);
      routenSchreiben(daten.routen.filter(function (r) { return r && r.nach; }).slice(0, MAXR));
      favoritenSchreiben(favNeu2);
      namenNachziehen(favAlt, favNeu2);               // Favorit umbenannt: Strecken mit demselben Ort ziehen mit (0.8.0)
      if (UMSTIEGE.indexOf(daten.umstiege) >= 0) localStorage.setItem('umstiege', String(daten.umstiege));
      if (FUSSWEGE.indexOf(daten.fussweg) >= 0) localStorage.setItem('fussweg', String(daten.fussweg));
      if (UMSTZEITEN.indexOf(daten.umstzeit) >= 0) localStorage.setItem('umstzeit', String(daten.umstzeit));
    }
    einrichtungSenden();
    routenSenden();
    if (rubrik() === 1) { if (routen().length) routeLaden(aktiveRoute()); }
    else if (daten.strecken.length) streckeLaden(aktiveSeite());
    // 0.6.4–0.8.0 öffnete sich die Seite hier wieder (weiter = Unterseite). Die Pebble-App lässt openURL außerhalb von
    // showConfiguration nicht zu (Seb 2026-10-10) — seit 0.8.1 sammelt die Seite und schließt nur mit „Speichern“.
  } catch (err) {
    console.log('Antwort der Seite unlesbar: ' + err);
  }
  konfig(false);
});

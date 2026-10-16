// Prüft src/pkjs/db.js (DB Timetables, 0.9.0) mit echten Daten: Bahnhofszuordnung, Zugsuche über Linie/Planzeit bzw.
// Zugnummer, Abgleich mit Transitous und RMV. Schlüssel aus ~/.config/db/ (clientId, apiKey) und ~/.config/rmv/accessId,
// werden nie ausgegeben. Aufruf: node tools/test/db_test.js
var fs = require('fs'), path = require('path'), os = require('os');
var X = require('./xhr');
global.XMLHttpRequest = X.XMLHttpRequest;
var DB = require('../../src/pkjs/db');
function lies(p) { try { return fs.readFileSync(path.join(os.homedir(), p), 'utf8').trim(); } catch (e) { return ''; } }
var dbId = lies('.config/db/clientId'), dbKey = lies('.config/db/apiKey'), rmv = lies('.config/rmv/accessId');
if (!dbId || !dbKey) { console.log('kein DB-Schlüssel in ~/.config/db/'); process.exit(1); }

function letzterSonntag0100(y, m) { var t = Date.UTC(y, m, 0) / 1000; return t - new Date(t * 1000).getUTCDay() * 86400 + 3600; }
function deZuUtc(datum, zeit) {
  var d = datum.split('-'), z = zeit.split(':');
  var naiv = Date.UTC(+d[0], +d[1] - 1, +d[2], +z[0], +z[1], +(z[2] || 0)) / 1000, utc = naiv - 7200;
  return (utc >= letzterSonntag0100(+d[0], 3) && utc < letzterSonntag0100(+d[0], 10)) ? utc : naiv - 3600;
}
function entfernung(a, b, c, d) {
  var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
var speicher = { startseite: '0' };
var db = DB({ schluessel: function () { return { id: dbId, key: dbKey }; }, deZuUtc: deZuUtc, entfernung: entfernung,
              bahnhoefe: require('../../src/pkjs/db_bahnhoefe.json').b,
              speicher: { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } } });

var fehler = 0;
function pruef(ok, text) { console.log((ok ? 'ok   ' : 'FEHL ') + text); if (!ok) fehler++; }
function hm(t) { var s = db.stunde(t); return t ? s.h + ':' + ('0' + s.min).slice(-2) : '--:--'; }
function holen(url, fertig, kopf) {
  var x = new X.XMLHttpRequest(); x.open('GET', url);
  if (kopf) x.setRequestHeader('User-Agent', 'pebble-linie8/0.9.0 test (privat)');
  x.onload = function () { try { fertig(JSON.parse(x.responseText)); } catch (e) { fertig(null); } };
  x.onerror = function () { fertig(null); };
  x.send();
}

// 1. Bahnhöfe
var wi = db.nahe(50.0707, 8.2433), tief = db.nahe(50.107275, 8.66255), flug = db.nahe(50.0512, 8.5712);
pruef(wi[0] && wi[0].evas[0] === '8000250', 'Wiesbaden Hbf -> 8000250');
pruef(tief[0] && tief[0].evas.join() === '8000105,8098105', 'Frankfurt Hbf mit tief -> 8000105, 8098105');
pruef(flug.length >= 1 && flug[0].evas[0] === '8070004', 'Flughafen Regionalbf zuerst (' + flug.map(function (b) { return b.evas[0] + ' ' + Math.round(b.m) + ' m'; }).join(', ') + ')');
pruef(db.nahe(50.0848, 8.2446).length === 0, 'Kurhaus Wiesbaden: kein DB-Bahnhof');

// 2. Transitous-Verbindungen Wiesbaden Hbf -> Frankfurt Hbf, je Zug Abfahrt und Ankunft
function abschnitteTesten(name, legs, weiter) {
  var anfragen = [];
  legs.forEach(function (l) {
    anfragen.push({ art: 'dp', lat: l.vonLat, lon: l.vonLon, t: l.abPlan, linie: l.linie, zn: l.zn });
    anfragen.push({ art: 'ar', lat: l.nachLat, lon: l.nachLon, t: l.anPlan, linie: l.linie, zn: l.zn });
  });
  var t0 = Date.now(), n0 = X.zaehler.n;
  db.anreichern(anfragen, function (erg) {
    var gefunden = 0;
    legs.forEach(function (l, k) {
      var a = erg[2 * k], b = erg[2 * k + 1];
      if (a) gefunden++; if (b) gefunden++;
      console.log('     ' + (l.linie + '      ').substring(0, 6) + (l.zn || '-') + '  ab ' + hm(l.abPlan) + ' ' + name + ' ' + l.del + "'" +
        ' | DB ' + (a ? '+' + a.del + "' Gl " + a.steig + (a.aus ? ' AUSFALL' : '') + ' eva ' + a.eva : 'nicht gefunden') +
        ' | an ' + hm(l.anPlan) + ' DB ' + (b ? '+' + b.del + "' Gl " + b.steig + (b.aus ? ' AUSFALL' : '') + ' eva ' + b.eva : 'nicht gefunden'));
    });
    pruef(gefunden >= anfragen.length - 1, name + ': ' + gefunden + ' von ' + anfragen.length + ' Ereignissen gefunden, ' +
      (X.zaehler.n - n0) + ' Abfragen, ' + (Date.now() - t0) + ' ms');
    weiter();
  }, 20000);
}
function sek(s) { return s ? Math.floor(Date.parse(s) / 1000) : 0; }
holen('https://api.transitous.org/api/v5/plan?' + (process.env.STRECKE || 'fromPlace=50.0707,8.2433&toPlace=50.1069,8.6625') + '&numItineraries=4&maxTransfers=0', function (d) {
  var legs = [];
  ((d && d.itineraries) || []).forEach(function (it) {
    it.legs.forEach(function (l) {
      if (l.mode === 'WALK') return;
      legs.push({ linie: l.routeShortName, zn: l.tripShortName, abPlan: sek(l.scheduledStartTime), anPlan: sek(l.scheduledEndTime),
                  del: l.realTime ? Math.round((sek(l.startTime) - sek(l.scheduledStartTime)) / 60) : 0,
                  vonLat: l.from.lat, vonLon: l.from.lon, nachLat: l.to.lat, nachLon: l.to.lon });
    });
  });
  pruef(legs.length > 0, 'Transitous: ' + legs.length + ' Zugabschnitte');
  abschnitteTesten('Transitous', legs, function () {
    // Zweiter Durchgang: alles aus dem Puffer (Pläne im Speicher, Änderungen 30 s)
    var n0 = X.zaehler.n;
    abschnitteTesten('Transitous (Puffer)', legs, function () {
      pruef(X.zaehler.n - n0 === 0, 'zweiter Durchgang ohne neue Abfragen (' + (X.zaehler.n - n0) + ')');
      rmvTesten();
    });
  });
}, true);

// 3. RMV: keine Zugnummer, nur Linie und Planzeit
function rmvTesten() {
  if (!rmv) { console.log('kein RMV-Schlüssel, RMV-Teil übersprungen'); return schluss(); }
  holen('https://www.rmv.de/hapi/trip?format=json&numF=4&maxChange=0&originCoordLat=50.0707&originCoordLong=8.2433&destCoordLat=50.1069&destCoordLong=8.6625&accessId=' + rmv, function (d) {
    var legs = [];
    ((d && d.Trip) || []).forEach(function (t) {
      t.LegList.Leg.forEach(function (l) {
        if (l.type !== 'JNY') return;
        var p = l.Product; if (p && p.length !== undefined) p = p[0];
        var o = l.Origin, z = l.Destination;
        legs.push({ linie: p.line || p.name, zn: '', abPlan: deZuUtc(o.date, o.time), anPlan: deZuUtc(z.date, z.time),
                    del: o.rtTime ? Math.round((deZuUtc(o.rtDate || o.date, o.rtTime) - deZuUtc(o.date, o.time)) / 60) : 0,
                    vonLat: +o.lat, vonLon: +o.lon, nachLat: +z.lat, nachLon: +z.lon });
      });
    });
    pruef(legs.length > 0, 'RMV: ' + legs.length + ' Zugabschnitte');
    abschnitteTesten('RMV', legs, schluss);
  });
}

// 4. Falscher Schlüssel: still, keine Ausnahme
function schluss() {
  var falsch = DB({ schluessel: function () { return { id: 'x', key: 'y' }; }, deZuUtc: deZuUtc, entfernung: entfernung,
                    bahnhoefe: require('../../src/pkjs/db_bahnhoefe.json').b, speicher: { getItem: function () { return null; }, setItem: function () {} } });
  falsch.anreichern([{ art: 'dp', lat: 50.0707, lon: 8.2433, t: Math.floor(Date.now() / 1000), linie: 'S1' }], function (erg) {
    pruef(erg[0] === null && !falsch.aktiv(), 'falscher Schlüssel: kein Ergebnis, DB danach aus');
    console.log(fehler ? fehler + ' FEHLER' : 'alles grün');
    process.exit(fehler ? 1 : 0);
  });
}

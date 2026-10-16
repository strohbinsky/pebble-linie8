// 0.15.0 ohne Netz: nur kommende Abfahrten an die Uhr, Anfrage mit NEU umgeht den Puffer, Startseite beim Öffnen (erst
// Puffer, dann Standort), Zeiten der nächsten Halte in der Karte (K_HT/K_HN, vorbei ab Abfahrt), Fahrtprotokoll.
// Transitous und Standort sind nachgebaut. Aufruf: node tools/test/nachladen_test.js
var fs = require('fs'), path = require('path'), vm = require('vm');
var basis = path.join(__dirname, '../../src/pkjs');
var paket = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
var fehler = 0;
function pruefe(ok, text) { console.log((ok ? 'ok     ' : 'FEHLER ') + text); if (!ok) fehler++; }

var keys = {}, nr = 10000, namen = {};
paket.pebble.messageKeys.forEach(function (k) {
  var m = /^(\w+)\[(\d+)\]$/.exec(k), n = m ? +m[2] : 1, name = m ? m[1] : k;
  keys[name] = nr; for (var i = 0; i < n; i++) namen[nr + i] = name + (m ? '[' + i + ']' : ''); nr += n;
});
function lesbar(msg) { var m = {}; Object.keys(msg).forEach(function (k) { m[namen[k] || k] = msg[k]; }); return m; }

// Beispiel (neutrale Daten): Wiesbaden Hauptbahnhof, Abfahrten der Linie 8 alle 3 min, die erste vor 2 min
var JETZT = Math.floor(Date.now() / 1000);
var HBF = { id: 'test:hbf', name: 'Wiesbaden Hauptbahnhof', lat: 50.0707, lon: 8.2436 };
var GSP = { id: 'test:gsp', name: 'Wiesbaden Geschwister-Stock-Platz', lat: 50.0730, lon: 8.2400 };
function iso(t) { return new Date(t * 1000).toISOString(); }
function tafel(ab) {
  var st = [];
  for (var k = 0; k < 8; k++) {
    var t = ab - 120 + k * 180;
    st.push({ place: { departure: iso(t), scheduledDeparture: iso(t), track: 'C' }, routeShortName: '8', headsign: 'Wiesbaden Eigenheim',
              tripId: 'trip' + k, mode: 'BUS', realTime: false });
  }
  return { stopTimes: st };
}
var anfragen = [], ort = { lat: HBF.lat, lon: HBF.lon }, ortMs = 2;
function FakeXHR() {}
FakeXHR.prototype.open = function (m, u) { this.url = u; };
FakeXHR.prototype.setRequestHeader = function () {};
FakeXHR.prototype.send = function () {
  var self = this; anfragen.push(self.url);
  setTimeout(function () {
    var d = null;
    if (/stoptimes/.test(self.url)) d = tafel(JETZT);
    else if (/map\/stops/.test(self.url)) d = [{ stopId: HBF.id, name: HBF.name, lat: HBF.lat, lon: HBF.lon }, { stopId: GSP.id, name: GSP.name, lat: GSP.lat, lon: GSP.lon }];
    self.status = d ? 200 : 404; self.responseText = JSON.stringify(d || {});
    if (self.onload) self.onload();
  }, 2);
};
var speicher = { layout: 'papier', quelle: 'trans', startseite: '0' }, lauscher = {}, gesendet = [];
var ctx = {
  Pebble: { addEventListener: function (t, f) { lauscher[t] = f; }, sendAppMessage: function (m, ok) { gesendet.push(lesbar(m)); setTimeout(ok, 1); }, openURL: function () {} },
  localStorage: { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } },
  XMLHttpRequest: FakeXHR, console: { log: function () {} }, setTimeout: setTimeout, clearTimeout: clearTimeout, JSON: JSON, Math: Math, Date: Date,
  navigator: { geolocation: { getCurrentPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: ort.lat, longitude: ort.lon, accuracy: 12 } }); }, ortMs); } } },
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, module: { exports: {} }
};
ctx.require = function (n) {
  if (n === 'message_keys') return keys;
  if (n === './schrift.json') return JSON.parse(fs.readFileSync(path.join(basis, 'schrift.json'), 'utf8'));
  return require(path.join(basis, n));
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(basis, 'index.js'), 'utf8'), ctx);
function warte(ms) { return new Promise(function (r) { setTimeout(r, ms || 60); }); }
function seiten(nachricht) { return gesendet.filter(function (m) { return m.SEITE === nachricht && m['AB[0]'] !== undefined; }); }

function seiteProtokoll() {
  var seite = require(path.join(basis, 'einstellungen_seite.js')), schrift = JSON.parse(fs.readFileSync(path.join(basis, 'schrift.json'), 'utf8'));
  var log = JSON.parse(speicher.fahrtlog);
  var html = seite.replace('/*ZUSTAND*/null', JSON.stringify({ strecken: [], schrift: schrift.F35, unterseite: 'protokoll', fahrtlog: log }));
  var app = { innerHTML: '' }, klick = null, rueck = null;
  var sctx = { document: { getElementById: function (id) { return id === 'app' ? app : null; }, querySelectorAll: function () { return []; }, addEventListener: function (t, f) { klick = f; },
                           set location(v) { rueck = JSON.parse(decodeURIComponent(v.split('#')[1])); } },
               setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, console: console, JSON: JSON, Math: Math, Date: Date };
  vm.createContext(sctx);
  vm.runInContext(html.substring(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), sctx);
  pruefe(/<table class="prot">/.test(app.innerHTML) && /Rheinstraße/.test(app.innerHTML) && /textarea/.test(app.innerHTML), 'Seite: Fahrtprotokoll mit Tabelle und Rohdaten');
  pruefe(/Geschwister-Stock-Platz<\/td><td>[0-9:]+<\/td><td>[0-9:]+<\/td><td>[0-9:]+ · \d+ m/.test(app.innerHTML), 'Seite: Halt mit Standort und Abstand');
  function klicke(attr) { klick({ target: { getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, value: attr.value, checked: attr.checked, parentNode: null } }); }
  klicke({ 'data-a': 'protLoeschen' }); klicke({ 'data-a': 'speichern' });
  pruefe(rueck && rueck.fahrtlogLoeschen === true, 'Seite: Protokoll löschen wird übergeben');
  lauscher.webviewclosed({ response: encodeURIComponent(JSON.stringify(rueck)) });
  pruefe(speicher.fahrtlog === '[]', 'Handy: Protokoll gelöscht');
}
(async function () {
  // 1. Seite ohne Ausstieg: erste Abfahrt vor 2 min -> an die Uhr nur kommende, alle drei belegt
  speicher.seiten = JSON.stringify([{ a: { id: HBF.id, name: HBF.name, kurz: 'HAUPTBAHNHOF', lat: HBF.lat, lon: HBF.lon }, b: null, linien: ['8'], alle: false }]);
  lauscher.ready(); await warte();
  var s = seiten(0).pop();
  pruefe(s && s['AB[0]'] >= JETZT && s['AB[1]'] > s['AB[0]'] && s['AB[2]'] > s['AB[1]'], 'nur kommende Abfahrten, drei Stück (' + (s ? [s['AB[0]'] - JETZT, s['AB[1]'] - JETZT, s['AB[2]'] - JETZT] : '-') + ' s)');
  var puffer = JSON.parse(speicher.puffer || '{}'), pk = Object.keys(puffer)[0];
  pruefe(pk && puffer[pk].erg.fahrten.length === 6, 'Puffer hält sechs Abfahrten (' + (pk ? puffer[pk].erg.fahrten.length : 0) + ')');
  // 2. Puffer frisch: normale Anfrage lädt nicht, Anfrage mit NEU zeigt den Puffer und lädt trotzdem
  var vorher = anfragen.length; gesendet = [];
  lauscher.appmessage({ payload: { REQUEST: 0, RUBRIK: 0, DETAIL: -1 } }); await warte();
  pruefe(anfragen.length === vorher && seiten(0).length === 1, 'frischer Puffer: keine Abfrage, Puffer gezeigt');
  gesendet = [];
  lauscher.appmessage({ payload: { REQUEST: 0, RUBRIK: 0, DETAIL: -1, NEU: 1 } }); await warte();
  pruefe(anfragen.length === vorher + 1, 'NEU: Puffer umgangen, eine Abfrage');
  pruefe(seiten(0).length === 2, 'NEU: erst der Puffer, dann die neue Antwort (' + seiten(0).length + ' Nachrichten)');
  // Puffer mit einer inzwischen abgefahrenen ersten Abfahrt: die Uhr bekommt die drei danach
  puffer = JSON.parse(speicher.puffer); puffer[pk].erg.fahrten.forEach(function (x) { x.t -= 175; }); speicher.puffer = JSON.stringify(puffer);
  gesendet = []; lauscher.appmessage({ payload: { REQUEST: 0, RUBRIK: 0, DETAIL: -1 } }); await warte();
  s = seiten(0)[0];
  pruefe(s && s['AB[0]'] >= Math.floor(Date.now() / 1000) - 1, 'Puffer: abgefahrene fallen weg, die Uhr bekommt die nächsten');

  // 3. Startseite beim Öffnen: Puffer der Haltestelle vom letzten Mal sofort, Standort danach
  speicher.startseite = '1';
  gesendet = []; anfragen = [];
  lauscher.ready(); await warte(5);
  var reihe = gesendet.map(function (m) { return m.SPRUNG !== undefined ? 'SPRUNG' + m.RUBRIK : m.SEITE === 8 ? 'HIER' : m.ANZAHL !== undefined ? 'EINR' : '?'; });
  pruefe(reihe.indexOf('SPRUNG3') >= 0, 'Startseite: SPRUNG mit RUBRIK 3 (' + reihe.join(' ') + ')');
  await warte();
  var hier = gesendet.filter(function (m) { return m.SEITE === 8; });
  pruefe(hier.length >= 1 && hier[hier.length - 1].HIER_NAME === 'HAUPTBAHNHOF' && hier[hier.length - 1].HIER_M <= 20, 'Startseite: nächste Haltestelle mit Entfernung (' + (hier.length ? hier[hier.length - 1].HIER_M : '-') + ' m)');
  pruefe(anfragen.some(function (u) { return /map\/stops/.test(u); }), 'Startseite: erstes Öffnen holt die Haltestellen in der Nähe');
  // wieder öffnen, 60 m bewegt: Puffer kommt vor dem Standort, keine neue Haltestellensuche
  ort = { lat: HBF.lat + 0.0005, lon: HBF.lon }; ortMs = 300;   // Standort kommt erst nach 300 ms
  gesendet = []; anfragen = [];
  lauscher.ready(); await warte(80);
  hier = gesendet.filter(function (m) { return m.SEITE === 8 && m['AB[0]'] !== undefined; });
  pruefe(hier.length === 1 && hier[0].HIER_NAME === 'HAUPTBAHNHOF', 'Startseite: Puffer sofort, ohne auf den Standort zu warten');
  await warte(400);
  pruefe(!anfragen.some(function (u) { return /map\/stops/.test(u); }), 'Startseite: unter 150 m bewegt, Liste von eben');
  ortMs = 2;
  // Standort fehlt: STATUS 4, die Uhr zeigt dann wie bisher
  ctx.navigator.geolocation.getCurrentPosition = function (ok, nein) { setTimeout(function () { nein({ code: 1, message: 'aus' }); }, 2); };
  gesendet = []; lauscher.ready(); await warte();
  pruefe(gesendet.some(function (m) { return m.SEITE === 8 && m.STATUS === 4; }), 'Startseite ohne Standort: STATUS 4');
  speicher.startseite = '0';

  // 4. Fahrt im Bus: Zeiten der nächsten drei Halte (Abfahrt), vorbei ab Abfahrt
  var t = Math.floor(Date.now() / 1000), M = 60;
  var a = { art: 'route', stadt: 'Wiesbaden', titel: { led: 'KURHAUS/THEATER', klar: 'Kurhaus/Theater' }, von: { led: 'HIER', klar: 'Hier' },
    nach: { led: 'ZIEL', klar: 'Ziel' }, ziel: null, gefragt: {}, spaeter: {}, seit: t - 300, ende: t + 3600, stand: t,
    v: { los: t - 300, an: t + 10 * M, umst: 0, legs: [
      { fuss: false, ab: t - 2 * M, an: t + 10 * M, abPlan: t - 2 * M, anPlan: t + 10 * M, del: 0, live: false, linie: '8', richtung: 'Wiesbaden Eigenheim',
        von: 'Wiesbaden Hauptbahnhof', nach: 'Wiesbaden Kurhaus/Theater', vonSteig: 'C', nachSteig: 'A', halte: 6, mittel: 'BUS', nachLat: 50.0848, nachLon: 8.2446,
        zwischen: [{ name: 'Wiesbaden Geschwister-Stock-Platz', t: t - 30, lat: 50.073, lon: 8.24 }, { name: 'Wiesbaden Rheinstraße', t: t + 50 },
                   { name: 'Wiesbaden Wilhelmstraße', t: t + 2 * M }, { name: 'Wiesbaden Friedrichstraße', t: t + 4 * M }, { name: 'Wiesbaden Luisenplatz', t: t + 6 * M }] }
    ] } };
  var v = a.v, ph = ctx.fahrtPhase(v, t, null), k = ctx.karteBauen(a, v, ph, t);
  pruefe(ph.phase === 4 && k.halte === 5, 'Karte im Bus: 4 kommende Halte + Ausstieg = 5 (' + k.halte + ')');
  pruefe(k.ht && k.ht.length === 3 && k.ht[0] === t + 50 && k.ht[2] === t + 4 * M, 'Karte: Zeiten der nächsten drei Halte');
  pruefe(k.hn && k.hn[0] === 'Rheinstraße' && /Wilhelmstr/.test(k.hn[1]), 'Karte: Namen der nächsten drei Halte (' + (k.hn || []).join(', ') + ')');
  pruefe(k.r2 === 'Rheinstraße', 'Karte: nächster Halt ist der erste kommende (Geschwister-Stock-Platz ist abgefahren)');
  gesendet = []; ctx.karteSenden(k); await warte(10);
  var km = gesendet[0];
  pruefe(km && km['K_HT[0]'] === t + 50 && km['K_HN[2]'] === k.hn[2], 'Karte an die Uhr mit K_HT und K_HN');
  var z = ctx.StreckenM.detailVerbindung(v, ctx.textHilfe('Wiesbaden'), 'Hier', 'Ziel', 2, 40), akt = ctx.aktZeile(z, ph, v);
  pruefe(z[akt] && /Rheinstr/.test(z[akt].text), 'Verlauf: Balken auf dem ersten kommenden Halt (' + (z[akt] ? z[akt].text : '-') + ')');
  // 5. Fahrtprotokoll
  speicher.fahrtlog = '[]';
  ctx.protokoll(a, ph, { lat: 50.0731, lon: 8.2401, gen: 9 });
  ctx.protokoll(a, ph, null);
  var log = JSON.parse(speicher.fahrtlog);
  pruefe(log.length === 1 && log[0].e.length === 2 && log[0].e[0].gen === 9 && log[0].e[0].h.length === 6, 'Protokoll: Einträge mit Standort, Genauigkeit und Halten');
  pruefe(log[0].o['Wiesbaden Geschwister-Stock-Platz'] && log[0].o['Wiesbaden Kurhaus/Theater'], 'Protokoll: Koordinaten der Halte');
  a.seit = t; ctx.protokoll(a, ph, null);
  pruefe(JSON.parse(speicher.fahrtlog).length === 2, 'Protokoll: neue Fahrt beginnt einen neuen Eintrag');
  // 6. RMV-Halt im Fahrtverlauf: Abfahrt (Echtzeit) vor Ankunft
  var h = { arrTime: '10:00:00', arrDate: '2026-10-16', depTime: '10:01:00', depDate: '2026-10-16', rtArrTime: '10:02:00', rtArrDate: '2026-10-16', rtDepTime: '10:03:00', rtDepDate: '2026-10-16' };
  pruefe(ctx.rmvHaltZeit(h) === ctx.deZuUtc('2026-10-16', '10:03:00'), 'RMV-Halt: Echtzeit-Abfahrt zählt');
  delete h.rtDepTime;
  pruefe(ctx.rmvHaltZeit(h) === ctx.deZuUtc('2026-10-16', '10:02:00'), 'RMV-Halt: ohne Echtzeit-Abfahrt die Echtzeit-Ankunft');
  delete h.rtArrTime;
  pruefe(ctx.rmvHaltZeit(h) === ctx.deZuUtc('2026-10-16', '10:01:00'), 'RMV-Halt: ohne Echtzeit die Plan-Abfahrt');
  // 7. Einstellungsseite: Fahrtprotokoll als Tabelle, Löschen wird beim Speichern übergeben
  seiteProtokoll();
  console.log(fehler ? fehler + ' Fehler' : 'alles grün');
  process.exit(fehler ? 1 : 0);
})();

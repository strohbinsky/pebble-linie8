// 0.16.0 ohne Netz: Heimathaltestelle. Zeichen je Abfahrt (2 hält später dort, 1 in ihrem Umkreis, 0 nichts) aus den
// Folgehalten von Transitous (fetchStops) und RMV (passlist), Setzen und Löschen über die Uhr (A_HEIM), Puffer, Liste
// WEITERE FAHRTEN mit Haus-Zeichen vorn, Einstellungsseite. Transitous und RMV sind nachgebaut, neutrale Beispieldaten
// (Linie 8: Hauptbahnhof, Luisenplatz). Aufruf: node tools/test/heim_test.js
var fs = require('fs'), path = require('path'), vm = require('vm');
var basis = path.join(__dirname, '../../src/pkjs');
var paket = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
var L = require(path.join(basis, 'logik.js'))({ holen: function () {} });
var fehler = 0;
function pruefe(ok, text) { console.log((ok ? 'ok     ' : 'FEHLER ') + text); if (!ok) fehler++; }

var keys = {}, nr = 10000, namen = {};
paket.pebble.messageKeys.forEach(function (k) {
  var m = /^(\w+)\[(\d+)\]$/.exec(k), n = m ? +m[2] : 1, name = m ? m[1] : k;
  keys[name] = nr; for (var i = 0; i < n; i++) namen[nr + i] = name + (m ? '[' + i + ']' : ''); nr += n;
});
function lesbar(msg) { var m = {}; Object.keys(msg).forEach(function (k) { m[namen[k] || k] = msg[k]; }); return m; }

var JETZT = Math.floor(Date.now() / 1000);
var HBF = { id: 'test:hbf', name: 'Wiesbaden Hauptbahnhof', lat: 50.0707, lon: 8.2436 };
var LUI = { id: 'test:lui', name: 'Wiesbaden Luisenplatz', lat: 50.0786, lon: 8.2402 };
var NAH = { id: 'test:nah', name: 'Wiesbaden Platz der Deutschen Einheit', lat: 50.0805, lon: 8.2370 };   // ~300 m vom Luisenplatz
var RHS = { id: 'test:rhs', name: 'Wiesbaden Rheinstraße', lat: 50.0750, lon: 8.2410 };
var FERN = { id: 'test:fern', name: 'Wiesbaden-Biebrich Rheinufer', lat: 50.0380, lon: 8.2330 };

// ---------- 1. Logik ----------
var R = 500;                             // Hauptbahnhof liegt gut 900 m vom Luisenplatz: bei 1 km gälte er schon als nah
pruefe(L.heimMarke(LUI, HBF, [RHS, LUI], R) === 2, 'Logik: hält später an der Heimat -> 2');
pruefe(L.heimMarke(LUI, HBF, [RHS, NAH], R) === 1, 'Logik: hält im Umkreis -> 1');
pruefe(L.heimMarke(LUI, HBF, [FERN], R) === 0, 'Logik: fährt woanders hin -> 0');
pruefe(L.heimMarke(LUI, HBF, [RHS, NAH], 200) === 0, 'Logik: Umkreis 200 m reicht nicht bis zum Halt in 300 m');
pruefe(L.heimMarke(LUI, HBF, [RHS, NAH], 1000) === 0, 'Logik: Start schon im Umkreis 1 km: kein schwaches Zeichen');
pruefe(L.heimMarke(LUI, LUI, [RHS, LUI], R) === 0, 'Logik: an der Heimat selbst nichts');
pruefe(L.heimMarke(LUI, NAH, [RHS], R) === 0 && L.heimMarke(LUI, NAH, [LUI], R) === 2, 'Logik: Start schon im Umkreis: nur noch 2');
pruefe(L.heimMarke({ name: 'Wiesbaden Luisenplatz' }, HBF, [{ name: 'Wiesbaden Luisenplatz' }], R) === 2, 'Logik: ohne Koordinaten nach dem Namen');
pruefe(L.heimMarke(LUI, HBF, [{ name: 'Luisenplatz, Wiesbaden', lat: 50.0787, lon: 8.2404 }], R) === 2, 'Logik: andere Schreibweise, 20 m daneben -> 2');
pruefe(L.heimMarke(null, HBF, [LUI], R) === 0 && L.heimMarke(LUI, HBF, [], R) === 0, 'Logik: ohne Heimat oder ohne Folgehalte 0');

// ---------- 2. Handy-Skript mit nachgebauten Quellen ----------
function iso(t) { return new Date(t * 1000).toISOString(); }
function deZeit(t) {                     // deutsche Ortszeit wie bei RMV: { date: 'YYYY-MM-DD', time: 'HH:MM:SS' }
  var s = new Date(t * 1000).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' });
  return { date: s.slice(0, 10), time: s.slice(11, 19) };
}
function ort(h) { return { name: h.name, stopId: h.id, lat: h.lat, lon: h.lon, dropoffType: 'NORMAL' }; }
var FAHRTEN = [{ dt: 120, ziel: 'Wiesbaden Eigenheim', folge: [RHS, LUI] },        // -> 2
               { dt: 300, ziel: 'Wiesbaden Nerotal', folge: [RHS, NAH] },          // -> 1
               { dt: 600, ziel: 'Wiesbaden-Biebrich', folge: [FERN] },              // -> 0
               { dt: 900, ziel: 'Wiesbaden Eigenheim', folge: [RHS, LUI] }];       // -> 2 (Weitere Fahrten)
var anfragen = [];
function transitous(url) {
  var mit = /fetchStops=true/.test(url), st = [];
  FAHRTEN.forEach(function (f, k) {
    var t = JETZT + f.dt, x = { place: { departure: iso(t), scheduledDeparture: iso(t), track: 'C' }, routeShortName: '8', headsign: f.ziel,
                                 tripId: 'trip' + k, mode: 'BUS', realTime: false };
    if (mit) x.nextStops = f.folge.map(ort);
    st.push(x);
  });
  return { stopTimes: st };
}
function rmv(url) {
  if (/location\.name/.test(url)) {
    var name = decodeURIComponent(/input=([^&]*)/.exec(url)[1]);
    var h = [HBF, LUI].filter(function (x) { return x.name.replace(/,/g, ' ') === name; })[0] || HBF;
    return { stopLocationOrCoordLocation: [{ StopLocation: { extId: h.id, id: h.id, name: h.name, lat: h.lat, lon: h.lon } }] };
  }
  if (/departureBoard/.test(url)) {
    var mit = /passlist=1/.test(url), start = /id=test%3Alui|id=test:lui/.test(url) ? LUI : HBF;
    return { Departure: FAHRTEN.map(function (f) {
      var z = deZeit(JETZT + f.dt), d = { name: 'Bus 8', direction: f.ziel, date: z.date, time: z.time, track: 'C', ProductAtStop: { line: '8', catOut: 'Bus' } };
      if (mit) d.Stops = { Stop: [start].concat(f.folge).map(function (h) { return { name: h.name, extId: h.id, lat: h.lat, lon: h.lon }; }) };
      return d;
    }) };
  }
  return null;
}
function FakeXHR() {}
FakeXHR.prototype.open = function (m, u) { this.url = u; };
FakeXHR.prototype.setRequestHeader = function () {};
FakeXHR.prototype.send = function () {
  var self = this; anfragen.push(self.url);
  setTimeout(function () {
    var d = /rmv\.de/.test(self.url) ? rmv(self.url) : /stoptimes/.test(self.url) ? transitous(self.url) : null;
    self.status = d ? 200 : 404; self.responseText = JSON.stringify(d || {});
    if (self.onload) self.onload();
  }, 2);
};
function seite(h) { return { a: { id: h.id, name: h.name, kurz: h.name.replace('Wiesbaden ', '').toUpperCase(), lat: h.lat, lon: h.lon }, b: null, alle: true, linien: [] }; }
var speicher = { layout: 'papier', quelle: 'trans', startseite: '0', umkreis: '500', seiten: JSON.stringify([seite(HBF), seite(LUI)]) }, lauscher = {}, gesendet = [];
var ctx = {
  Pebble: { addEventListener: function (t, f) { lauscher[t] = f; }, sendAppMessage: function (m, ok) { gesendet.push(lesbar(m)); setTimeout(ok, 1); }, openURL: function (u) { ctx.offen = u; } },
  localStorage: { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } },
  XMLHttpRequest: FakeXHR, console: { log: function () {} }, setTimeout: setTimeout, clearTimeout: clearTimeout, JSON: JSON, Math: Math, Date: Date,
  navigator: { geolocation: { getCurrentPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: HBF.lat, longitude: HBF.lon, accuracy: 12 } }); }, 2); } } },
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, module: { exports: {} }
};
ctx.require = function (n) {
  if (n === 'message_keys') return keys;
  if (n === './schrift.json') return JSON.parse(fs.readFileSync(path.join(basis, 'schrift.json'), 'utf8'));
  return require(path.join(basis, n));
};
global.XMLHttpRequest = FakeXHR;         // per require geladene Module laufen im Node-Global (Falle 0.9.0)
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(basis, 'index.js'), 'utf8'), ctx);
function warte(ms) { return new Promise(function (r) { setTimeout(r, ms || 80); }); }
function uhr(p) { var m = {}; Object.keys(p).forEach(function (k) { m[keys[k]] = p[k]; }); lauscher.appmessage({ payload: m }); }
function letzteSeite(i) { var l = gesendet.filter(function (m) { return m.SEITE === i && m['AB[0]'] !== undefined; }); return l[l.length - 1]; }
function marken(m) { return m ? [m['AB_H[0]'] & 3, m['AB_H[1]'] & 3, m['AB_H[2]'] & 3].join(',') : 'keine'; }

(async function () {
  lauscher.ready();
  await warte();
  var ein = gesendet.filter(function (m) { return m.ANZAHL !== undefined; })[0];
  pruefe(ein && ein.HEIM_N === '' && ein.HEIM_K === '', 'Einrichtung: ohne Heimat leere Namen an die Uhr');
  var s0 = letzteSeite(0);
  pruefe(marken(s0) === '0,0,0' && s0.HEIM_S === 0, 'ohne Heimat: keine Zeichen (' + marken(s0) + ')');
  pruefe(!anfragen.some(function (u) { return /fetchStops/.test(u); }), 'ohne Heimat: Transitous ohne fetchStops');

  // Uhr: Menü der Seite 2 (Luisenplatz) > HEIMATHALTESTELLE
  gesendet = [];
  uhr({ AKTION: 40, WAHL: 1 });
  await warte();
  var h = JSON.parse(speicher.heim || 'null');
  pruefe(h && h.name === LUI.name && h.lat === LUI.lat, 'A_HEIM: Haltestelle der Seite ist Heimat');
  pruefe(gesendet.some(function (m) { return m.HEIM_N === 'LUISENPLATZ' && m.HEIM_K === 'Luisenplatz'; }), 'A_HEIM: Name in beiden Schreibweisen an die Uhr');
  pruefe(gesendet.some(function (m) { return m.L_ANZAHL === -2; }), 'A_HEIM: danach zur Seite (L_ANZAHL -2)');

  // Uhr fragt Seite 1 (Hauptbahnhof) neu an: Puffer gilt nicht mehr, Folgehalte kommen mit
  anfragen = []; gesendet = [];
  uhr({ REQUEST: 0, RUBRIK: 0 });
  await warte();
  s0 = letzteSeite(0);
  pruefe(anfragen.some(function (u) { return /stoptimes/.test(u) && /fetchStops=true/.test(u); }), 'Transitous: neu geholt, mit fetchStops');
  pruefe(marken(s0) === '2,1,0', 'Transitous: Zeichen 2,1,0 (' + marken(s0) + ')');
  pruefe(s0 && s0.HEIM_S === 0, 'Transitous: Hauptbahnhof ist nicht die Heimat (HEIM_S 0)');

  gesendet = [];
  uhr({ REQUEST: 1, RUBRIK: 0 });
  await warte();
  var s1 = letzteSeite(1);
  pruefe(s1 && s1.HEIM_S === 1 && marken(s1) === '0,0,0', 'Seite der Heimat selbst: HEIM_S 1, keine Zeichen (' + marken(s1) + ')');

  // WEITERE FAHRTEN der Seite 1: Haus-Zeichen vorn in der Zeile
  gesendet = [];
  uhr({ REQUEST: 0, RUBRIK: 0 });
  await warte();
  uhr({ AKTION: 38, WAHL: 0, RUBRIK: 0 });
  await warte(150);
  var texte = [];                         // die zuletzt gesendete Liste, Blöcke zu 10
  gesendet.forEach(function (m) {
    if (typeof m.L_ANZAHL === 'number' && m.L_ANZAHL >= 0) texte = new Array(m.L_ANZAHL);
    if (typeof m.L_AB === 'number') for (var j = 0; j < 10; j++) if (typeof m['L_TEXT[' + j + ']'] === 'string' && m.L_AB + j < texte.length) texte[m.L_AB + j] = m['L_TEXT[' + j + ']'];
  });
  texte = texte.filter(function (t) { return typeof t === 'string'; });
  var mit2 = texte.filter(function (t) { return t.charCodeAt(0) === 2; }).length, mit1 = texte.filter(function (t) { return t.charCodeAt(0) === 1; }).length;
  pruefe(mit2 === 2 && mit1 === 1, 'Weitere Fahrten: 2 Zeilen mit vollem, 1 mit leerem Haus (' + mit2 + '/' + mit1 + ' von ' + texte.length + ')');
  uhr({ AKTION: 6, WAHL: 0 });             // Zurück aus der Liste
  await warte();

  // RMV: passlist und 12 Fahrten
  speicher.quelle = 'rmv'; speicher.rmvKey = 'test';
  anfragen = []; gesendet = [];
  uhr({ REQUEST: 0, RUBRIK: 0 });
  await warte(150);
  s0 = letzteSeite(0);
  pruefe(anfragen.some(function (u) { return /departureBoard\?maxJourneys=12&passlist=1/.test(u); }), 'RMV: departureBoard mit passlist, 12 Fahrten');
  pruefe(marken(s0) === '2,1,0', 'RMV: Zeichen 2,1,0 (' + marken(s0) + ')');
  speicher.quelle = 'trans';

  // Umkreis kleiner: Puffer neu, das schwache Zeichen fällt weg
  speicher.umkreis = '200';
  gesendet = [];
  uhr({ REQUEST: 0, RUBRIK: 0 });
  await warte();
  pruefe(marken(letzteSeite(0)) === '2,0,0', 'Umkreis 200 m: Halt in 300 m zählt nicht mehr (' + marken(letzteSeite(0)) + ')');
  speicher.umkreis = '500';

  // Einstellungsseite: Name sichtbar, Löschen mit Rückfrage auf der Seite
  var html = decodeURIComponent((lauscher.showConfiguration(), await warte(), ctx.offen).replace(/^data:text\/html;charset=utf-8,/, ''));
  var app = { innerHTML: '' }, klick = null, rueck = null;
  var sctx = { document: { getElementById: function (id) { return id === 'app' ? app : null; }, querySelectorAll: function () { return []; }, addEventListener: function (t, f) { klick = f; },
                           set location(v) { rueck = JSON.parse(decodeURIComponent(v.split('#')[1])); } },
               setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, console: console, JSON: JSON, Math: Math, Date: Date,
               history: { pushState: function () {} }, addEventListener: function () {} };
  vm.createContext(sctx);
  vm.runInContext(html.substring(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), sctx);
  function klicke(attr) { klick({ target: { getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, value: attr.value, checked: attr.checked, parentNode: null } }); }
  klicke({ 'data-a': 'geh', 'data-s': 'haltestellen' });
  pruefe(/Heimathaltestelle/.test(app.innerHTML) && /Wiesbaden Luisenplatz/.test(app.innerHTML), 'Seite: Heimathaltestelle mit Namen');
  klicke({ 'data-a': 'frage', 'data-k': 'heim' });
  pruefe(/Heimathaltestelle löschen\?/.test(app.innerHTML), 'Seite: Löschen fragt auf der Seite');
  klicke({ 'data-a': 'ja', 'data-k': 'heim' });
  klicke({ 'data-a': 'speichern' });
  pruefe(rueck && rueck.heimLoeschen === true, 'Seite: Löschen wird übergeben');
  gesendet = [];
  lauscher.webviewclosed({ response: encodeURIComponent(JSON.stringify(rueck)) });
  await warte();
  pruefe(!speicher.heim, 'Handy: Heimat gelöscht');
  pruefe(gesendet.some(function (m) { return m.HEIM_N === ''; }), 'Handy: leerer Name an die Uhr');

  // Uhr: Einstellungen > Abfahrten > Heimathaltestelle > keine (A_HEIM -1)
  uhr({ AKTION: 40, WAHL: 1 }); await warte();
  gesendet = [];
  uhr({ AKTION: 40, WAHL: -1 }); await warte();
  pruefe(!speicher.heim && gesendet.some(function (m) { return m.HEIM_N === ''; }) && !gesendet.some(function (m) { return m.L_ANZAHL !== undefined; }),
         'A_HEIM -1: gelöscht, ohne Listenwechsel an der Uhr');

  console.log(fehler ? fehler + ' FEHLER' : 'alles grün');
  process.exit(fehler ? 1 : 0);
})();

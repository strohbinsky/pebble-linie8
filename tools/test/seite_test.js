// Testet die Einstellungsseite in Node mit echten Transitous-Daten: neue Strecke über "In meiner Nähe".
// Aufruf: node tools/test/seite_test.js
var fs = require('fs'), path = require('path'), vm = require('vm');
var X = require('./xhr');
var src = require(path.join(__dirname, '../../src/pkjs/einstellungen_seite.js'));
var schrift = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/pkjs/schrift.json'), 'utf8')).F35;
var zustand = { strecken: [], standort: { lat: 50.0707, lon: 8.2436 }, schrift: schrift, rmvKey: '' };
src = src.replace('/*ZUSTAND*/null', JSON.stringify(zustand));
var script = src.substring(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));

var app = { innerHTML: '' }, klick = null, ergebnis = null;
var document = {
  getElementById: function (id) { return id === 'app' ? app : null; },
  addEventListener: function (t, f) { if (t === 'click') klick = f; },
  set location(v) { ergebnis = JSON.parse(decodeURIComponent(v.split('#')[1])); }
};
var ctx = { document: document, XMLHttpRequest: X.XMLHttpRequest, setTimeout: setTimeout, clearTimeout: clearTimeout,
            setInterval: function () {}, alert: console.log, confirm: function () { return true; }, console: console, JSON: JSON, Math: Math };
vm.createContext(ctx);
vm.runInContext(script, ctx);
function klicke(attr) { klick({ target: { getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, parentNode: null } }); }
function warte(bed, cb, t0) {
  t0 = t0 || Date.now();
  if (bed()) return cb();
  if (Date.now() - t0 > 120000) { console.log('ZEITÜBERSCHREITUNG'); process.exit(1); }
  setTimeout(function () { warte(bed, cb, t0); }, 200);
}
function text() { return app.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }
var t0 = Date.now();
klicke({ 'data-a': 'neu' });
klicke({ 'data-a': 'nah' });
warte(function () { return ctx.e && ctx.e.suche && ctx.e.suche.length; }, function () {
  console.log('Nah (' + ctx.e.suche.length + '):', ctx.e.suche.map(function (t) { return t.name + ' ' + t.m + 'm'; }).join(' | '));
  var i = ctx.e.suche.findIndex(function (t) { return /Hauptbahnhof/.test(t.name); });
  klicke({ 'data-a': 'start', 'data-i': String(i) });
  warte(function () { return ctx.e.erg; }, function () {
    console.log('Linien:', Object.keys(ctx.e.erg.linien).join(' '), '| Ziele:', Object.keys(ctx.e.erg.ziele).length);
    klicke({ 'data-a': 'linie', 'data-l': '4' });
    var z = Object.keys(ctx.e.erg.ziele).filter(function (n) { return /Luisenplatz$/.test(n); })[0];
    klicke({ 'data-a': 'ziel', 'data-n': z });
    warte(function () { return ctx.e.pruef && ctx.e.pruef.fertig && ctx.e.rk && !ctx.e.rk.lade; }, function () {
      console.log('Hin:', ctx.e.pruef.hin.join(' '), '| Rückfahrt-Kandidaten:', ctx.e.rk.liste.map(function (k) { return k.name + ' ' + k.m + 'm [' + k.linien.join(',') + ']'; }).join(' | '));
      console.log('Rückfahrt ab:', ctx.e.c && ctx.e.c.name, '| Auswahl:', ctx.e.auswahl.join(' '));
      klicke({ 'data-a': 'uebernehmen' });
      console.log('Liste:', text().substring(0, 160));
      klicke({ 'data-a': 'speichern' });
      console.log('Ergebnis:', JSON.stringify(ergebnis));
      console.log('Abfragen:', X.zaehler.n, '| Dauer:', Math.round((Date.now() - t0) / 1000) + ' s');
    });
  });
});

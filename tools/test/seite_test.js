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
function klicke(attr) { klick({ target: { value: attr.value, getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, parentNode: null } }); }
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
      function gesperrt() { return /data-a="uebernehmen" disabled/.test(app.innerHTML); }
      if (gesperrt()) { console.log('FEHLER: Übernehmen gesperrt im Genau-Modus'); process.exit(1); }
      // Umkreis (seit 3.3): nur auf Knopfdruck, Ausstieg muss bewusst gewählt werden
      klicke({ 'data-a': 'umkreis' });
      warte(function () { return ctx.e.rkU && !ctx.e.rkU.lade; }, function () {
        var l = ctx.e.rkU.liste;
        console.log('Umkreis ' + ctx.e.rkU.r + ' m: ' + l.length + ' Einstiege, z. B. ' + l.slice(0, 4).map(function (k) { return k.name + ' ' + k.m + 'm [' + k.linien + '] ' + k.ziele.length + ' Ausstiege'; }).join(' | '));
        if (!l.length) { console.log('FEHLER: Umkreis leer'); process.exit(1); }
        klicke({ 'data-a': 'rueckU', 'data-i': '0' });
        if (!gesperrt()) { console.log('FEHLER: Übernehmen ohne gewählten Ausstieg möglich'); process.exit(1); }
        var zi = l[0].ziele.findIndex(function (z) { return !z.start; });
        console.log('Ausstiege ab ' + l[0].name + ': ' + l[0].ziele.slice(0, 5).map(function (z) { return z.name + (z.start ? ' (Start)' : ' ' + z.m + 'm'); }).join(' | '));
        klicke({ 'data-a': 'aus', 'data-i': String(zi) });
        if (gesperrt()) { console.log('FEHLER: Übernehmen trotz Ausstieg gesperrt'); process.exit(1); }
        klicke({ 'data-a': 'umkreisWert', value: '2000' });
        klicke({ 'data-a': 'uebernehmen' });
        console.log('Liste:', text().substring(0, 200));
        klicke({ 'data-a': 'speichern' });
        console.log('Ergebnis:', JSON.stringify(ergebnis));
        if (!ergebnis.strecken[0].d || ergebnis.umkreis !== 2000) { console.log('FEHLER: d oder Umkreis fehlt'); process.exit(1); }
        console.log('Abfragen:', X.zaehler.n, '| Dauer:', Math.round((Date.now() - t0) / 1000) + ' s');
      });
    });
  });
});

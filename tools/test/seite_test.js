// Testet die Einstellungsseite in Node mit echten Transitous-Daten: neue Seite mit Ziel über "In meiner Nähe", dann eine ohne Ziel.
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
  getElementById: function (id) { return id === 'app' ? app : null; }, querySelectorAll: function () { return []; },
  addEventListener: function (t, f) { if (t === 'click') klick = f; },
  set location(v) { ergebnis = JSON.parse(decodeURIComponent(v.split('#')[1])); }
};
var ctx = { document: document, XMLHttpRequest: X.XMLHttpRequest, setTimeout: setTimeout, clearTimeout: clearTimeout,
            setInterval: function () {}, alert: console.log, confirm: function () { return true; }, console: console, JSON: JSON, Math: Math };
vm.createContext(ctx);
vm.runInContext(script, ctx);
function klicke(attr) { klick({ target: { value: attr.value, checked: attr.checked, getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, parentNode: null } }); }
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
    // Richtung (seit 0.35): Linie 8 ab Hbf hat mehrere, danach Ziele in Fahrtreihenfolge
    klicke({ 'data-a': 'linie', 'data-l': '8' });
    var tr = text();
    if (!/2b · Richtung/.test(tr) || /3 · Ausstieg /.test(tr)) { console.log('FEHLER: Richtung fehlt oder Ziel zu früh'); process.exit(1); }
    console.log('Richtungen:', (tr.match(/2b · Richtung (.*?) Alle Halte/) || [])[1]);
    klicke({ 'data-a': 'richtung', 'data-i': '0' });
    console.log('Ziele in Folge:', (text().match(/Ausstieg eingrenzen?.{0,0}(.*)/) || [''])[0].substring(0, 160));
    if (!/3 · Ausstieg /.test(text())) { console.log('FEHLER: Ziel nach Richtung fehlt'); process.exit(1); }
    klicke({ 'data-a': 'linie', 'data-l': '4' });
    if (ctx.e.wahlRichtung !== null) { console.log('FEHLER: Richtung bleibt nach Linienwechsel'); process.exit(1); }
    var z = Object.keys(ctx.e.erg.ziele).filter(function (n) { return /Luisenplatz$/.test(n); })[0];
    klicke({ 'data-a': 'ziel', 'data-n': z });
    function gesperrt() { return /data-a="uebernehmen" disabled/.test(app.innerHTML); }
    warte(function () { return ctx.e.pruef && ctx.e.pruef.fertig; }, function () {
      console.log('Hin:', ctx.e.pruef.hin.join(' '), '| Auswahl:', ctx.e.auswahl.join(' '));
      if (gesperrt()) { console.log('FEHLER: Übernehmen mit Ziel gesperrt'); process.exit(1); }
      if (/Rückfahrt ab|4 · Rückfahrt/.test(text())) { console.log('FEHLER: Rückfahrt-Abschnitt noch da (seit 0.50 nur an der Uhr)'); process.exit(1); }
      klicke({ 'data-a': 'umkreisWert', value: '2000' });
      klicke({ 'data-a': 'quelleWert', value: 'trans' });
      klicke({ 'data-a': 'abfahrtWert', value: 'aktuell' });
      klicke({ 'data-a': 'dauerWert', checked: false });
      klicke({ 'data-a': 'uebernehmen' });
      // Seite ohne Ziel (seit 0.50): Hbf, Linie 8, in der Richtungsliste "Ohne Ziel"
      klicke({ 'data-a': 'neu' });
      klicke({ 'data-a': 'nah' });
      warte(function () { return ctx.e && ctx.e.suche && ctx.e.suche.length; }, function () {
        klicke({ 'data-a': 'start', 'data-i': String(ctx.e.suche.findIndex(function (t) { return /Hauptbahnhof/.test(t.name); })) });
        warte(function () { return ctx.e.erg; }, function () {
          klicke({ 'data-a': 'linie', 'data-l': '8' });
          if (!/Ohne Ausstieg/.test(text())) { console.log('FEHLER: "Ohne Ausstieg" fehlt in der Richtungsliste'); process.exit(1); }
          klicke({ 'data-a': 'ohneZiel' });
          console.log('Ohne Ziel, Auswahl:', ctx.e.auswahl.join(' '));
          if (gesperrt() || ctx.e.auswahl.join() !== '8') { console.log('FEHLER: Ohne Ziel nicht übernehmbar oder Linie falsch'); process.exit(1); }
          klicke({ 'data-a': 'uebernehmen' });
          console.log('Liste:', text().substring(0, 260));
          // 0.6.1: Favorit aus Suchtreffern, Strecke Standort -> Favorit, Rückfahrt gibt es nur mit festem Start
          ctx.favSuche.treffer = [ctx.ortNeu('Wiesbaden Kurhaus/Theater', 'Wiesbaden', 50.0848, 8.2446, 'halt', 'x1'),
                                  ctx.ortNeu('Wilhelmstraße 12', 'Wiesbaden', 50.0820, 8.2440, 'adresse')];
          ergebnis = null;
          klicke({ 'data-a': 'geh', 'data-s': 'favoriten' });
          klicke({ 'data-a': 'fneu', 'data-i': '0' });
          // 0.8.1: Seite bleibt offen, Änderung nur vorgemerkt, Namensfeld beschriftet
          if (ergebnis || !ctx.geaendert || ctx.favoriten.length !== 1) { console.log('FEHLER: Seite hat sich geschlossen oder nichts vorgemerkt'); process.exit(1); }
          if (!/Name auf der Uhr/.test(app.innerHTML)) { console.log('FEHLER: Namensfeld bei Favoriten unbeschriftet'); process.exit(1); }
          console.log('Vorgemerkt, Seite offen');
          ctx.favSuche.treffer = [ctx.ortNeu('Wilhelmstraße 12', 'Wiesbaden', 50.0820, 8.2440, 'adresse')];
          klicke({ 'data-a': 'fneu', 'data-i': '0' });
          klicke({ 'data-a': 'rneu' });
          klicke({ 'data-a': 'rok' });
          ctx.r = { von: 1, nach: 0 };
          klicke({ 'data-a': 'rok' });
          klicke({ 'data-a': 'rrueck', 'data-i': '1' });
          klicke({ 'data-a': 'umstiegeWert', value: '1' });
          klicke({ 'data-a': 'uebersicht' });
          if (!/Strecken/.test(text()) || !/Favoriten/.test(text()) || !/Verbindungssuche/.test(text())) { console.log('FEHLER: Hauptmenü unvollständig'); process.exit(1); }
          console.log('Hauptmenü:', text().substring(0, 200));
          if (ergebnis) { console.log('FEHLER: Seite vor Speichern geschlossen'); process.exit(1); }
          if (!/Speichern und schließen/.test(app.innerHTML)) { console.log('FEHLER: Schließen-Knopf ohne Speichern-Hinweis'); process.exit(1); }
          klicke({ 'data-a': 'speichern' });
          if (ergebnis.weiter !== undefined) { console.log('FEHLER: weiter noch gesetzt'); process.exit(1); }
          var rr = ergebnis.routen.map(function (x) { return (x.von ? x.von.kurz : 'STANDORT') + ' > ' + x.nach.kurz; });
          console.log('Strecken:', rr.join(' | '), '| Favoriten:', ergebnis.favoriten.map(function (f) { return f.kurz; }).join(' | '));
          if (rr.length !== 3 || rr[2] !== 'KURHAUS/THEATER > WILHELMSTR 12' || ergebnis.umstiege !== 1) { console.log('FEHLER: Strecken falsch'); process.exit(1); }
          console.log('Ergebnis:', JSON.stringify(ergebnis));
          var s0 = ergebnis.strecken[0], s1 = ergebnis.strecken[1];
          if (!s0.b || s1.b !== null || s1.alle || s1.linien.join() !== '8' || ergebnis.umkreis !== 2000 || ergebnis.quelle !== 'trans' ||
              ergebnis.abfahrt !== 'aktuell' || ergebnis.dauer !== 'aus' || s0.c || s0.d) { console.log('FEHLER: Ergebnis falsch'); process.exit(1); }
          console.log('Abfragen:', X.zaehler.n, '| Dauer:', Math.round((Date.now() - t0) / 1000) + ' s');
        });
      });
    });
  });
});

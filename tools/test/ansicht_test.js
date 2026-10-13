// Prüft ohne Netz die Einstellung "Ansicht", die Seite ohne Ziel und die Startseite nach Standort: Seite (Auswahl Klar -> Rückgabe) und Handy-Skript
// (Rückgabe speichern -> Einrichtung an die Uhr mit LAYOUT und Klar-Namen). Aufruf: node tools/test/ansicht_test.js
var fs = require('fs'), path = require('path'), vm = require('vm');
var basis = path.join(__dirname, '../../src/pkjs');
var paket = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
var schrift = JSON.parse(fs.readFileSync(path.join(basis, 'schrift.json'), 'utf8'));
var fehler = 0;
function pruefe(ok, text) { console.log((ok ? 'ok     ' : 'FEHLER ') + text); if (!ok) fehler++; }

// 1. Seite: Standard Klar (seit 0.12.0, LED entfernt), Phosphor und zurück auf Klar wählen, speichern
var seite = require(path.join(basis, 'einstellungen_seite.js'));
var strecke = { a: { id: 'x', name: 'Wiesbaden Hauptbahnhof', kurz: 'HAUPTBAHNHOF' }, b: { id: 'y', name: 'Wiesbaden Luisenplatz', kurz: 'LUISENPLATZ' },
                linien: ['4'], alle: true };
var html = seite.replace('/*ZUSTAND*/null', JSON.stringify({ strecken: [strecke], schrift: schrift.F35, rmvKey: '', unterseite: 'anzeige' }));
var app = { innerHTML: '' }, klick = null, rueck = null;
var ctx = { document: { getElementById: function (id) { return id === 'app' ? app : null; }, querySelectorAll: function () { return []; }, addEventListener: function (t, f) { klick = f; },
                        set location(v) { rueck = JSON.parse(decodeURIComponent(v.split('#')[1])); } },
            setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {}, console: console, JSON: JSON, Math: Math };
vm.createContext(ctx);
vm.runInContext(html.substring(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), ctx);
function klicke(attr) { klick({ target: { getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, value: attr.value, checked: attr.checked, parentNode: null } }); }
pruefe(/value="papier" checked/.test(app.innerHTML), 'Seite: Papier ist vorausgewählt (0.13.0)');
pruefe(!/value="led"/.test(app.innerHTML) && !/value="klar"/.test(app.innerHTML) && !/value="phosphor"/.test(app.innerHTML), 'Seite: nur Papier und Phosphor weiß');
klicke({ 'data-a': 'layout', value: 'led' });          // alte Angabe: wird Papier
klicke({ 'data-a': 'layout', value: 'klar' });
klicke({ 'data-a': 'speichern' });
pruefe(rueck && rueck.layout === 'papier', 'Seite: Rückgabe layout = papier (klar wird Papier)');
pruefe(rueck && rueck.invers === false && rueck.kontrast === false && rueck.schliessen === false, 'Seite: Invertiert, Kontrast, Schließen aus');
// Farben (0.9.1): zweite Seite, Phosphor weiß, invertiert, hoher Kontrast
var rueck1 = rueck; rueck = null;
html = seite.replace('/*ZUSTAND*/null', JSON.stringify({ strecken: [strecke], schrift: schrift.F35, rmvKey: '', unterseite: 'anzeige', layout: 'klar' }));
vm.runInContext(html.substring(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), ctx);
pruefe(/value="papier" checked/.test(app.innerHTML) && /data-a="invers">/.test(app.innerHTML), 'Seite: alter Stand Klar zeigt Papier, Invertiert aus');
klicke({ 'data-a': 'layout', value: 'phosphor_weiss' }); klicke({ 'data-a': 'invers', checked: true }); klicke({ 'data-a': 'kontrast', checked: true }); klicke({ 'data-a': 'schliessen', checked: true });
klicke({ 'data-a': 'speichern' });
pruefe(rueck && rueck.layout === 'phosphor_weiss' && rueck.invers === true && rueck.kontrast === true && rueck.schliessen === true, 'Seite: Phosphor weiß, invertiert, Kontrast, schließen');
var rueck2 = rueck; rueck = rueck1;

// 2. Handy-Skript: Rückgabe übernehmen, Einrichtung prüfen
var keys = {}, nr = 10000, namen = {};
paket.pebble.messageKeys.forEach(function (k) {
  var m = /^(\w+)\[(\d+)\]$/.exec(k), n = m ? +m[2] : 1, name = m ? m[1] : k;
  keys[name] = nr; for (var i = 0; i < n; i++) namen[nr + i] = name + (m ? '[' + i + ']' : ''); nr += n;
});
var speicher = {}, lauscher = {}, gesendet = [];
var hctx = {
  Pebble: { addEventListener: function (t, f) { lauscher[t] = f; }, sendAppMessage: function (m, ok) { gesendet.push(m); setTimeout(ok, 1); }, openURL: function () {} },
  localStorage: { getItem: function (k) { return speicher[k] === undefined ? null : speicher[k]; }, setItem: function (k, v) { speicher[k] = String(v); } },
  XMLHttpRequest: function () { this.open = function () {}; this.setRequestHeader = function () {}; this.send = function () {}; },
  console: { log: function () {} }, setTimeout: setTimeout, JSON: JSON, Math: Math, Date: Date,
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, module: { exports: {} }
};
hctx.require = function (n) {
  if (n === 'message_keys') return keys;
  if (n === './schrift.json') return schrift;
  return require(path.join(basis, n));
};
vm.createContext(hctx);
vm.runInContext(fs.readFileSync(path.join(basis, 'index.js'), 'utf8'), hctx);
function warte() { return new Promise(function (r) { setTimeout(r, 30); }); }
(async function () {
lauscher.ready();
await warte();
pruefe(gesendet[0][keys.LAYOUT] === 5, 'Handy: ohne Einstellung LAYOUT = 5 (Papier)');
gesendet = [];
await warte();
lauscher.webviewclosed({ response: encodeURIComponent(JSON.stringify(rueck)) });
await warte();
var e = gesendet[0];
pruefe(speicher.layout === 'papier', 'Handy: layout gespeichert');
pruefe(e[keys.LAYOUT] === 5, 'Handy: Einrichtung mit LAYOUT = 5');
pruefe(e[keys.KLAR_A] === 'Hauptbahnhof' && e[keys.KLAR_B] === 'Luisenplatz', 'Handy: Klar-Namen ' + e[keys.KLAR_A] + ' / ' + e[keys.KLAR_B]);
pruefe(e[keys.NAME_A] === 'HAUPTBAHNHOF' && e[keys.NAME_B] === 'LUISENPLATZ', 'Handy: Großbuchstaben-Namen, NAME_B = Ziel');
lauscher.appmessage({ payload: { AKTION: 7, WAHL: 0 } });
await warte();
pruefe(speicher.layout === 'papier', 'Handy: alte LED von der Uhr (AKTION 7, WAHL 0) wird Papier');
lauscher.appmessage({ payload: { AKTION: 7, WAHL: 2 } });
await warte();
pruefe(speicher.layout === 'phosphor_weiss', 'Handy: Phosphor grün von der Uhr (AKTION 7, WAHL 2) wird Phosphor weiß');
lauscher.appmessage({ payload: { AKTION: 7, WAHL: 3 } });
await warte();
pruefe(speicher.layout === 'papier' && speicher.invers === '0', 'Handy: altes LED invers (WAHL 3) wird Papier, nicht invertiert');
speicher.layout = 'invers'; delete speicher.invers;
gesendet = []; lauscher.ready(); await warte();
pruefe(gesendet[0][keys.LAYOUT] === 5, 'Handy: alter Speicherstand layout=invers sendet LAYOUT = 5 (Papier)');
lauscher.appmessage({ payload: { AKTION: 7, WAHL: 4 + 8 + 16 } });
await warte();
pruefe(speicher.layout === 'phosphor_weiss' && speicher.invers === '1' && speicher.kontrast === '1', 'Handy: Phosphor weiß + invertiert + Kontrast an der Uhr');
gesendet = []; lauscher.ready(); await warte();
pruefe(gesendet[0][keys.LAYOUT] === 28, 'Handy: Einrichtung mit LAYOUT = 28');
lauscher.webviewclosed({ response: encodeURIComponent(JSON.stringify(rueck2)) }); await warte();
pruefe(speicher.layout === 'phosphor_weiss' && speicher.invers === '1' && speicher.kontrast === '1' && speicher.schliessen === '1', 'Handy: Rückgabe der Seite mit Farben und Schließen gespeichert');
gesendet = []; lauscher.ready(); await warte();
pruefe(gesendet[0][keys.LAYOUT] === 60, 'Handy: Einrichtung mit LAYOUT = 60 (4 + 8 + 16 + 32)');
speicher.invers = '0'; speicher.kontrast = '0'; speicher.schliessen = '0';
lauscher.appmessage({ payload: { AKTION: 7, WAHL: 2 } });
await warte();
gesendet = []; lauscher.ready();
await warte();
pruefe(gesendet[0][keys.LAYOUT] === 4, 'Handy: Einrichtung mit LAYOUT = 4 (Phosphor weiß; grün gibt es seit 0.13.0 nicht mehr)');
pruefe(gesendet[0][keys.NAME_A] === 'HAUPTBAHNHOF', 'Handy: Phosphor nutzt Großbuchstaben-Namen');
// Seite ohne Ziel (0.50): NAME_B und KLAR_B leer
speicher.seiten = JSON.stringify([{ a: strecke.a, b: null, linien: ['8'], alle: false }]);
await warte(); gesendet = []; lauscher.ready();
await warte();
pruefe(gesendet[0][keys.ANZAHL] === 1 && gesendet[0][keys.NAME_B] === '' && gesendet[0][keys.KLAR_B] === '', 'Handy: Seite ohne Ziel, NAME_B/KLAR_B leer');
// Größte Einrichtung: 8 Seiten, lange Namen in beiden Schreibweisen
var lang = { id: 'z', name: 'Wiesbaden Schwalbacher Straße/LuisenForum Süd Übergang', kurz: 'SCHWALBACHER STR./LUISENFORUM SU' };
speicher.seiten = JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7].map(function () { return { a: lang, b: lang, linien: [], alle: true }; }));
await warte(); gesendet = []; lauscher.ready();
await warte();
var bytes = 1; Object.keys(gesendet[0]).forEach(function (k) { var v = gesendet[0][k]; bytes += 7 + (typeof v === 'string' ? Buffer.byteLength(v) + 1 : 4); });
pruefe(bytes <= 2048, 'Größte Einrichtung: ' + bytes + ' Bytes (Puffer Uhr 2048)');
// Startseite nach Standort (L.seiteNachOrt): nächster Start, bei Gleichstand die aktive, sonst die zuletzt angesehene
var L = require(path.join(basis, 'logik.js'))(function () {}, schrift.F35);
var hbf = { lat: 50.0707, lon: 8.2436 }, kurhaus = { lat: 50.0848, lon: 8.2446 };
var seiten = [{ a: hbf, zuletzt: 5 }, { a: kurhaus, zuletzt: 1 }, { a: kurhaus, zuletzt: 9 }, { a: {} }];
pruefe(L.seiteNachOrt(seiten, hbf, 1, 50) === 0, 'Standort: am Hbf -> Seite 1');
pruefe(L.seiteNachOrt(seiten, kurhaus, 0, 50) === 2, 'Standort: Kurhaus, zwei gleich nah -> zuletzt angesehene (Seite 3)');
pruefe(L.seiteNachOrt(seiten, kurhaus, 1, 50) === 1, 'Standort: Kurhaus, aktive gehört dazu -> bleibt');
pruefe(L.seiteNachOrt([{ a: {} }], hbf, 0, 50) === 0, 'Standort: ohne Koordinaten -> aktive');
process.exit(fehler ? 1 : 0);
})();

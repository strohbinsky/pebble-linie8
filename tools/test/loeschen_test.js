// Testet Löschen und Ersetzen der Einstellungsseite ohne Netz (0.13.1, GitHub-Issue #1): Rückfrage auf der Seite statt
// confirm(), das die Pebble-App auf Android nicht zeigt. confirm() und alert() werfen hier, damit sie nicht zurückkommen.
// Aufruf: node tools/test/loeschen_test.js
var fs = require('fs'), path = require('path'), vm = require('vm');
var src = require(path.join(__dirname, '../../src/pkjs/einstellungen_seite.js'));
var schrift = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/pkjs/schrift.json'), 'utf8')).F35;
function ort(name, k) { return { name: name, stadt: 'Wiesbaden', kurz: name.toUpperCase(), klar: name, lat: 50.07 + k / 1000, lon: 8.24, typ: 'halt', id: null, n: k }; }
var fav = [];
for (var k = 0; k < 20; k++) fav.push(ort('Halt ' + k, k));
var zustand = { schrift: schrift, rmvKey: '', standort: { lat: 50.0707, lon: 8.2436 }, favoriten: fav,
  routen: [{ von: null, nach: ort('Kurhaus', 1), zuletzt: 1 }, { von: ort('Hauptbahnhof', 2), nach: ort('Luisenplatz', 3), zuletzt: 2 }],
  strecken: [{ a: { kurz: 'HBF', name: 'Wiesbaden Hauptbahnhof', id: 'x1' }, b: null, linien: ['8'], alle: false },
             { a: { kurz: 'KURHAUS', name: 'Kurhaus/Theater', id: 'x2' }, b: null, linien: ['8'], alle: false }] };
src = src.replace('/*ZUSTAND*/null', JSON.stringify(zustand));
var script = src.substring(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
var app = { innerHTML: '' }, klick = null, ergebnis = null;
var document = {
  getElementById: function (id) { return id === 'app' ? app : null; }, querySelectorAll: function () { return []; }, querySelector: function () { return null; },
  addEventListener: function (t, f) { if (t === 'click') klick = f; },
  set location(v) { ergebnis = JSON.parse(decodeURIComponent(v.split('#')[1])); }
};
var ctx = { document: document, XMLHttpRequest: function () {}, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {},
  alert: function () { throw new Error('alert() geht in der Pebble-App nicht'); },
  confirm: function () { throw new Error('confirm() geht in der Pebble-App nicht'); }, console: console, JSON: JSON, Math: Math };
vm.createContext(ctx);
vm.runInContext(script, ctx);
function klicke(attr) { klick({ target: { value: attr.value, checked: attr.checked, getAttribute: function (k) { return attr[k] === undefined ? null : attr[k]; }, parentNode: null } }); }
var fehler = 0;
function pruefe(ok, was) { console.log((ok ? 'ok     ' : 'FEHLER ') + was); if (!ok) fehler++; }
function frageOffen() { return /data-a="ja"/.test(app.innerHTML); }

klicke({ 'data-a': 'geh', 'data-s': 'favoriten' });
// Ersetzen bei voller Liste (20)
ctx.favSuche.treffer = [ort('Neuer Halt', 0)];
klicke({ 'data-a': 'fneu', 'data-i': '0' });
pruefe(/Voll: welche ersetzen/.test(app.innerHTML), 'volle Favoriten: Ersetzen-Liste');
klicke({ 'data-a': 'frage', 'data-k': 'e0' });
pruefe(frageOffen() && /ersetzen\?/.test(app.innerHTML), 'Ersetzen fragt auf der Seite');
klicke({ 'data-a': 'nein' });
pruefe(!frageOffen() && /Voll: welche ersetzen/.test(app.innerHTML), 'Nein: Frage zu, Liste bleibt');
klicke({ 'data-a': 'frage', 'data-k': 'e0' });
klicke({ 'data-a': 'ja', 'data-k': 'e0' });
pruefe(ctx.favoriten.length === 20 && ctx.favoriten[19].name === 'Neuer Halt' && !ctx.favoriten.some(function (f) { return f.name === 'Halt 0'; }),
  'Ja: selten genutzter ersetzt');
// einzelner Favorit (Platz 3 nach dem Ersetzen)
var name3 = ctx.favoriten[3].klar;
klicke({ 'data-a': 'frage', 'data-k': 'f3' });
pruefe(frageOffen() && app.innerHTML.indexOf(name3 + ' löschen?') >= 0, 'Favorit: Frage mit Namen');
klicke({ 'data-a': 'nein' });
pruefe(ctx.favoriten.length === 20 && !frageOffen(), 'Nein: nichts gelöscht');
klicke({ 'data-a': 'frage', 'data-k': 'f3' });
klicke({ 'data-a': 'geh', 'data-s': 'favoriten' });
pruefe(!frageOffen() && ctx.favoriten.length === 20, 'andere Aktion schließt die Frage');
klicke({ 'data-a': 'frage', 'data-k': 'f3' });
klicke({ 'data-a': 'ja', 'data-k': 'f3' });
pruefe(ctx.favoriten.length === 19 && !ctx.favoriten.some(function (f) { return f.klar === name3; }), 'Ja: Favorit gelöscht');
// alle Favoriten
klicke({ 'data-a': 'frage', 'data-k': 'alle-favoriten' });
pruefe(/Alle 19 Favoriten löschen\?/.test(app.innerHTML), 'Alle löschen fragt mit Anzahl');
klicke({ 'data-a': 'ja', 'data-k': 'alle-favoriten' });
pruefe(ctx.favoriten.length === 0, 'Ja: alle Favoriten weg');
// Strecke
klicke({ 'data-a': 'geh', 'data-s': 'strecken' });
klicke({ 'data-a': 'frage', 'data-k': 'r1' });
pruefe(/Hauptbahnhof → Luisenplatz löschen\?/.test(app.innerHTML), 'Strecke: Frage mit Namen');
klicke({ 'data-a': 'ja', 'data-k': 'r1' });
pruefe(ctx.routen.length === 1 && ctx.routen[0].nach.name === 'Kurhaus', 'Ja: Strecke gelöscht');
// Abfahrt
klicke({ 'data-a': 'geh', 'data-s': 'haltestellen' });
klicke({ 'data-a': 'frage', 'data-k': 'h0' });
pruefe(/HBF löschen\?/.test(app.innerHTML), 'Abfahrt: Frage mit Namen');
klicke({ 'data-a': 'ja', 'data-k': 'h0' });
pruefe(ctx.strecken.length === 1 && ctx.strecken[0].a.kurz === 'KURHAUS', 'Ja: Abfahrt gelöscht');
// Ergebnis an die Uhr
klicke({ 'data-a': 'speichern' });
pruefe(ergebnis && ergebnis.favoriten.length === 0 && ergebnis.routen.length === 1 && ergebnis.strecken.length === 1, 'Speichern übergibt den Stand');
console.log(fehler ? fehler + ' FEHLER' : 'alles grün');
process.exit(fehler ? 1 : 0);

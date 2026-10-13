// DB Timetables im ganzen Handy-Skript (0.9.0): Seite und Strecke mit Zügen (Wiesbaden Hbf -> Frankfurt Hbf),
// je mit Transitous und RMV, mit und ohne DB-Schlüssel. Echte Daten. Schlüssel aus ~/.config/db/ und ~/.config/rmv/,
// werden nie ausgegeben. Aufruf: node tools/test/db_handy_test.js   (LOG=1 zeigt die Ausgaben des Handy-Skripts)
//
// Die nachgebaute Uhr ist die aus strecken_test.js (alles vor "Ablauf"), hier eingelesen statt kopiert.
var fs = require('fs'), path = require('path'), os = require('os');
var X0 = require('./xhr');
global.XMLHttpRequest = X0.XMLHttpRequest;          // db.js läuft als Node-Modul, nicht im vm-Kontext
eval(fs.readFileSync(path.join(__dirname, 'strecken_test.js'), 'utf8').split('// ---------- Ablauf ----------')[0]);

function lies(p) { try { return fs.readFileSync(path.join(os.homedir(), p), 'utf8').trim(); } catch (e) { return ''; } }
var DB_ID = lies('.config/db/clientId'), DB_KEY = lies('.config/db/apiKey');
if (!DB_ID || !DB_KEY) { console.log('kein DB-Schlüssel in ~/.config/db/'); process.exit(1); }

var WI = { id: 'de-DELFI_de:06414:6907', name: 'Wiesbaden Hauptbahnhof', kurz: 'HBF', lat: 50.0707, lon: 8.2433 };
var FFM = { id: 'de-DELFI_de:06412:10', name: 'Frankfurt (Main) Hauptbahnhof', kurz: 'FRANKFURT HBF', lat: 50.1069, lon: 8.6625 };
var fehlerZahl = 0;
function pruef(ok, text) { console.log((ok ? 'ok   ' : 'FEHL ') + text); if (!ok) fehlerZahl++; }
function einstellen(q, mitDb) {
  speicher.quelle = q; speicher.puffer = '{}';
  speicher.dbId = mitDb ? DB_ID : ''; speicher.dbKey = mitDb ? DB_KEY : '';
}
function seiteTesten(q, mitDb, a, b) {
  dann(function (w) {
    einstellen(q, mitDb);
    speicher.seiten = JSON.stringify([{ a: a || WI, b: b === undefined ? FFM : b, linien: [], alle: true }]);
    var n0 = uhr.abfahrten.length;
    senden({ REQUEST: 0, RUBRIK: 0 });
    warte(function () { return uhr.abfahrten.length > n0 && uhr.abfahrten[uhr.abfahrten.length - 1].STATUS !== undefined; }, function () {
      var m = uhr.abfahrten[uhr.abfahrten.length - 1];
      console.log('  Seite ' + (a ? a.kurz : 'HBF') + (b === null ? ' ohne Ziel ' : ' ') + q + (mitDb ? ' mit DB' : ' ohne DB') + ': Fuß ' + m.QUELLE + ', Status ' + m.STATUS + ' | ' + [0, 1, 2].map(function (j) {
        return m['AB_L[' + j + ']'] + ' ' + hmZ(m['AB[' + j + ']']) + ' ' + (m['AB_D[' + j + ']'] === 9999 ? 'AUSFALL' : '+' + m['AB_D[' + j + ']']) + ' Gl ' + m['AB_S[' + j + ']'] + ' ' + m['AB_F[' + j + ']'] + "'";
      }).join(' | '));
      var erwartet = mitDb ? (q === 'rmv' ? 'RMV+DB' : 'TR+DB') : (q === 'rmv' ? 'RMV' : 'TRANS');
      pruef(m.QUELLE === erwartet, 'Fuß ' + erwartet);
      pruef(m['AB[0]'] > 0, 'mindestens eine Abfahrt');
      w();
    });
  });
}
function streckeTesten(q, mitDb) {
  dann(function (w) {
    einstellen(q, mitDb);
    speicher.routen = JSON.stringify([{ von: { name: WI.name, kurz: 'HBF', klar: 'Hbf', lat: WI.lat, lon: WI.lon }, nach: { name: FFM.name, kurz: 'FRANKFURT HBF', klar: 'Frankfurt Hbf', lat: FFM.lat, lon: FFM.lon }, zuletzt: 1 }]);
    var n0 = uhr.strecken.length;
    senden({ REQUEST: 0, RUBRIK: 1 });
    warte(function () { return uhr.strecken.length > n0 && uhr.strecken[uhr.strecken.length - 1].STATUS !== undefined; }, function () {
      var a = uhr.strecken[uhr.strecken.length - 1];
      console.log('  Strecke ' + q + (mitDb ? ' mit DB' : ' ohne DB') + ': Fuß ' + a.QUELLE + ', Status ' + a.STATUS + ' | ' + [0, 1, 2].map(function (j) {
        return hmZ(a['R_LOS[' + j + ']']) + '-' + hmZ(a['R_AN[' + j + ']']) + ' ' + a['R_KETTE[' + j + ']'] + ' +' + a['R_DEL[' + j + ']'];
      }).join(' | '));
      var erwartet = mitDb ? (q === 'rmv' ? 'RMV+DB' : 'TR+DB') : (q === 'rmv' ? 'RMV' : 'TRANS');
      pruef(a.QUELLE === erwartet, 'Fuß ' + erwartet);
      pruef(a.R_N > 0, 'mindestens eine Verbindung');
      w();
    });
  });
}
dann(function (w) { lauscher.ready(); setTimeout(w, 1500); });
seiteTesten('trans', false);
seiteTesten('trans', true);
streckeTesten('trans', false);
streckeTesten('trans', true);
if (speicher.rmvKey) { seiteTesten('rmv', true); streckeTesten('rmv', true); }
// Tafel Frankfurt Hbf ohne Ziel: dort ist fast immer ein Zug verspätet — DB überschreibt Transitous
seiteTesten('trans', false, FFM, null);
seiteTesten('trans', true, FFM, null);
function fertig() {
  console.log(fehlerZahl ? fehlerZahl + ' FEHLER' : 'alles grün', '| Abfragen ' + X.zaehler.n + ' | ' + Math.round((Date.now() - t0) / 1000) + ' s');
  process.exit(fehlerZahl ? 1 : 0);
}
los();

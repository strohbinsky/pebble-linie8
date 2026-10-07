// Linie 8 — gemeinsame Logik für Einstellungsseite und Uhr-Menü (eine Wahrheit für beide Wege).
// Handy-Skript: require('./logik')(holen, schrift). Einstellungsseite: tools/seite_erzeugen.py setzt diese
// Datei vor das Skript der Seite, dort steht Logik(...) als globale Funktion bereit.
//   holen(pfad, fertig)  Transitous-Abfrage relativ zu https://api.transitous.org/api/, fertig(fehlerText, daten)
//   schrift              LED-Glyphen F35 (für Breite und Kurzname)
function Logik(holenRoh, schrift) {
  var COLS = 66;               // Breite des LED-Rasters auf der Uhr
  var UMKREIS_RUECK = 2000;    // Rückfahrt-Haltestellen bis 2 km um das Ziel
  var MAX_RUECK = 20;          // davon die 20 nächsten prüfen (je eine Verbindungssuche)
  var GLEICHZEITIG = 4;        // so viele Abfragen parallel (Transitous drosselt bei mehr, HTTP 429)
  var cacheErreichbar = {};    // Start-ID -> Ergebnis

  // Transitous antwortet bei vielen Abfragen mit HTTP 429: nach 1, 2, 4 s erneut versuchen
  function holen(pfad, fertig, versuch) {
    versuch = versuch || 0;
    holenRoh(pfad, function (f, d) {
      if (f === 'HTTP 429' && versuch < 3) return setTimeout(function () { holen(pfad, fertig, versuch + 1); }, 1000 << versuch);
      fertig(f, d);
    });
  }

  // Deutsche Sortierung, Zahlen numerisch. localeCompare mit Sprache wirft im Emulator-JS einen ICU-Fehler
  // ("Internal error. Icu error") — dann eigener Vergleich: Umlaute wie Grundbuchstaben, Ziffernfolgen als Zahl.
  var kollator = true;
  function grund(s) {
    return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  }
  function vergleichEigen(a, b) {
    var x = grund(a).match(/\d+|\D+/g) || [], y = grund(b).match(/\d+|\D+/g) || [];
    for (var i = 0; i < x.length && i < y.length; i++) {
      if (x[i] === y[i]) continue;
      if (/^\d/.test(x[i]) && /^\d/.test(y[i])) return (+x[i]) - (+y[i]);
      return x[i] < y[i] ? -1 : 1;
    }
    return x.length - y.length;
  }
  function sortDe(a, b) {
    if (kollator) {
      try { return a.localeCompare(b, 'de', { numeric: true }); } catch (e) { kollator = false; }
    }
    return vergleichEigen(a, b);
  }

  function entfernung(a, b, c, d) {
    var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r;
    return Math.round(Math.sqrt(x * x + y * y) * 6371000);
  }

  // ---------- LED-Schrift: Breite, Kurzname ----------
  function ledText(s) {
    return String(s).toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
      .replace(/[^A-Z0-9 .,:\-\/()&'+]/g, '').replace(/\s+/g, ' ').trim();
  }
  function breite(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += ((schrift[s[i]] ? schrift[s[i]][0].length : 2) + 1);
    return w > 0 ? w - 1 : 0;
  }
  function stadtVon(name) {
    if (name.indexOf(',') >= 0) return name.split(',')[0].trim();
    return name.split(/[ \-]/)[0];
  }
  function kurzname(name, stadt) {
    var n = name;
    if (n.indexOf(',') >= 0) n = n.split(',').slice(1).join(',').trim();
    else if (stadt && (n.indexOf(stadt + ' ') === 0 || n.indexOf(stadt + '-') === 0)) n = n.substring(stadt.length + 1);
    n = n.replace(/^\([^)]*\)\s*/, '');
    n = ledText(n);
    var kuerzel = [[/STRASSE/g, 'STR'], [/PLATZ/g, 'PL'], [/BAHNHOF/g, 'BF'], [/HAUPTBF/g, 'HBF'], [/ALLEE/g, 'AL']];
    for (var i = 0; i < kuerzel.length && breite(n) > COLS - 2; i++) n = n.replace(kuerzel[i][0], kuerzel[i][1]);
    return n;
  }

  // Ansicht „Klar“: normale Schreibweise mit Umlauten, Stadt weg, ab 17 Zeichen gekürzt (Systemschrift, Zeile ~16 Zeichen)
  function klarname(name, stadt) {
    var n = String(name);
    if (n.indexOf(',') >= 0) n = n.split(',').slice(1).join(',').trim();
    else if (stadt && (n.indexOf(stadt + ' ') === 0 || n.indexOf(stadt + '-') === 0)) n = n.substring(stadt.length + 1);
    n = n.replace(/^\([^)]*\)\s*/, '').replace(/\s+/g, ' ').trim();
    var kuerzel = [[/straße\b/g, 'str.'], [/Straße\b/g, 'Str.'], [/strasse\b/g, 'str.'], [/Hauptbahnhof/g, 'Hbf'],
                   [/Bahnhof/g, 'Bf'], [/platz\b/g, 'pl.'], [/Platz\b/g, 'Pl.'], [/allee\b/g, 'al.']];
    for (var i = 0; i < kuerzel.length && n.length > 16; i++) n = n.replace(kuerzel[i][0], kuerzel[i][1]);
    return n;
  }

  // Auf höchstens max Bytes UTF-8 kürzen, ohne ein Zeichen zu zerschneiden (Puffer auf der Uhr)
  function utf8Kuerzen(s, max) {
    s = String(s);
    var aus = '', n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), b = c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xD800 && c < 0xDC00) ? 4 : 3;
      if (n + b > max) break;
      aus += b === 4 ? s.substr(i++, 2) : s[i];
      n += b;
    }
    return aus;
  }

  // Führt aufgaben (Funktionen mit Rückruf) mit begrenzter Parallelität aus; fertig() nach der letzten.
  function nacheinander(aufgaben, fortschritt, fertig) {
    var i = 0, laufend = 0, erledigt = 0;
    if (!aufgaben.length) return fertig();
    function weiter() {
      while (laufend < GLEICHZEITIG && i < aufgaben.length) {
        laufend++;
        aufgaben[i++](function () {
          laufend--; erledigt++;
          if (fortschritt) fortschritt(erledigt, aufgaben.length);
          if (erledigt === aufgaben.length) fertig(); else weiter();
        });
      }
    }
    weiter();
  }

  // ---------- Haltestellen im Umkreis ----------
  // Transitous map/stops liefert alle Steige in einem Rechteck (je Steig ein Eintrag, teils doppelt aus
  // mehreren Datenquellen). Zusammengefasst nach Namen, je Haltestelle der nächste Steig, nach Entfernung.
  function namensSchluessel(n) { return String(n).replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function haltestellenUm(lat, lon, radius, fertig) {
    var dlat = radius / 111320, dlon = radius / (111320 * Math.cos(lat * Math.PI / 180));
    holen('v1/map/stops?min=' + (lat - dlat).toFixed(6) + ',' + (lon - dlon).toFixed(6) +
          '&max=' + (lat + dlat).toFixed(6) + ',' + (lon + dlon).toFixed(6), function (f, d) {
      if (f) return fertig(f);
      var je = {};
      (d || []).forEach(function (s) {
        if (!s.stopId || !s.name) return;
        var m = entfernung(lat, lon, s.lat, s.lon);
        if (m > radius) return;
        var k = namensSchluessel(s.name), alt = je[k];
        if (!alt || m < alt.m) je[k] = { id: s.stopId, name: alt ? alt.name : s.name, m: m, lat: s.lat, lon: s.lon };
        if (s.name.indexOf(',') < 0) je[k].name = s.name;   // "Wiesbaden Luisenplatz" vor "Wiesbaden, Luisenplatz"
      });
      fertig(null, Object.keys(je).map(function (k) { return je[k]; }).sort(function (a, b) { return a.m - b.m; }));
    });
  }

  // Die n nächsten Haltestellen zum Standort: erst 1 km, reicht das nicht, 3 km.
  function naechsteHaltestellen(lat, lon, n, fertig) {
    haltestellenUm(lat, lon, 1000, function (f, liste) {
      if (!f && liste.length >= n) return fertig(null, liste.slice(0, n));
      haltestellenUm(lat, lon, 3000, function (f2, l2) {
        if (f2) return f ? fertig(f2) : fertig(null, liste.slice(0, n));
        fertig(null, l2.slice(0, n));
      });
    });
  }

  // ---------- Erreichbare Ziele ab einem Start ----------
  // Abfahrtsliste am Start, je Muster Linie+Ziel eine Fahrt (bei vielen eine zweite: Äste), deren Verlauf.
  // Haltestellen nach dem Start: hin möglich, davor: zurück möglich.
  function erreichbar(start, fortschritt, fertig) {
    if (cacheErreichbar[start.id]) return fertig(null, cacheErreichbar[start.id]);
    holen('v1/stoptimes?n=300&stopId=' + encodeURIComponent(start.id), function (f, d) {
      if (f) return fertig(f);
      var muster = {}, liste = [];
      (d.stopTimes || []).forEach(function (x) {
        var k = x.routeShortName + '|' + x.headsign;
        (muster[k] = muster[k] || []).push(x);
      });
      Object.keys(muster).forEach(function (k) {
        var a = muster[k];
        liste.push(a[0]);
        if (a.length >= 4) liste.push(a[Math.floor(a.length / 2)]);
      });
      liste = liste.slice(0, 120);
      var erg = { linien: {}, ziele: {} };
      function auswerten(t, x) {
        var leg = t.legs && t.legs[0];
        if (!leg) return;
        var halte = [leg.from].concat(leg.intermediateStops || [], [leg.to]);
        var ab = -1, j;
        for (j = 0; j < halte.length; j++) if (halte[j].stopId === x.place.stopId) { ab = j; break; }
        if (ab < 0) for (j = 0; j < halte.length; j++) if (halte[j].name === x.place.name) { ab = j; break; }
        if (ab < 0) return;
        erg.linien[x.routeShortName] = 1;
        for (j = 0; j < halte.length; j++) {
          var h = halte[j];
          if (j === ab || h.name === start.name || h.name === x.place.name) continue;
          var z = erg.ziele[h.name] || (erg.ziele[h.name] = { name: h.name, id: h.stopId, lat: h.lat, lon: h.lon, linien: {}, hin: false, rueck: false });
          z.linien[x.routeShortName] = 1;
          if (j > ab) z.hin = true; else z.rueck = true;
        }
      }
      var aufgaben = liste.map(function (x) {
        return function (weiter) {
          holen('v1/trip?tripId=' + encodeURIComponent(x.tripId), function (f2, t) {
            if (!f2) auswerten(t, x);
            weiter();
          });
        };
      });
      nacheinander(aufgaben, fortschritt, function () {
        cacheErreichbar[start.id] = erg;
        fertig(null, erg);
      });
    });
  }

  // Ziele für den Hinweg, alphabetisch, optional nur einer Linie ('*' oder leer = alle)
  function zieleHin(erg, linie) {
    return Object.keys(erg.ziele).sort(sortDe).map(function (n) { return erg.ziele[n]; }).filter(function (z) {
      return z.hin && (!linie || linie === '*' || z.linien[linie]);
    });
  }

  // ---------- Direktverbindungen ----------
  function direkt(von, nach, fertig) {             // Linien mit Direktverbindung, wie auf der Uhr
    holen('v5/plan?maxTransfers=0&numItineraries=10&directModes=WALK&maxPreTransitTime=0&maxPostTransitTime=0' +
          '&fromPlace=' + encodeURIComponent(von) + '&toPlace=' + encodeURIComponent(nach), function (f, d) {
      if (f) return fertig(f);
      var l = {};
      (d.itineraries || []).forEach(function (it) {
        var fa = it.legs.filter(function (x) { return x.mode !== 'WALK'; });
        if (fa.length === 1) l[fa[0].routeShortName] = 1;
      });
      fertig(null, Object.keys(l).sort(sortDe));
    });
  }

  // Rückfahrt: Ziel selbst und Haltestellen bis 2 km darum, die 20 nächsten, nur mit Direktverbindung zum Start.
  //   a, b     Start und Ziel ({id, name, lat, lon})
  //   extra    optional {linien: [...], rueck: bool} — selten fahrende Linien vom Ziel zurück (aus erreichbar)
  //   fertig(fehler, liste)  liste: [{id, name, m, lat, lon, linien}] nach Entfernung, nur mit Linien
  function rueckSuchen(a, b, extra, fortschritt, fertig) {
    haltestellenUm(b.lat, b.lon, UMKREIS_RUECK, function (f, um) {
      var kand = [{ id: b.id, name: b.name, m: 0, lat: b.lat, lon: b.lon }];
      if (!f) um.forEach(function (t) {
        if (namensSchluessel(t.name) === namensSchluessel(a.name) || namensSchluessel(t.name) === namensSchluessel(b.name)) return;
        kand.push(t);
      });
      kand = kand.slice(0, MAX_RUECK);
      var fehler = 0, letzter = null;
      var aufgaben = kand.map(function (k) {
        return function (weiter) {
          direkt(k.id, a.id, function (f2, l) {
            if (f2) { fehler++; letzter = f2; }
            k.linien = f2 ? [] : l;
            if (k.m === 0 && extra && extra.rueck) (extra.linien || []).forEach(function (x) { if (k.linien.indexOf(x) < 0) k.linien.push(x); });
            k.linien.sort(sortDe);
            weiter();
          });
        };
      });
      nacheinander(aufgaben, fortschritt, function () {
        if (fehler === kand.length) return fertig(letzter);   // keine einzige Antwort: Fehler statt leerer Liste
        fertig(null, kand.filter(function (x) { return x.linien.length; }).sort(function (x, y) { return x.m - y.m; }));
      });
    });
  }

  return {
    COLS: COLS, UMKREIS_RUECK: UMKREIS_RUECK, MAX_RUECK: MAX_RUECK,
    sortDe: sortDe, entfernung: entfernung, ledText: ledText, breite: breite, stadtVon: stadtVon, kurzname: kurzname,
    klarname: klarname, utf8Kuerzen: utf8Kuerzen,
    haltestellenUm: haltestellenUm, naechsteHaltestellen: naechsteHaltestellen,
    erreichbar: erreichbar, zieleHin: zieleHin, direkt: direkt, rueckSuchen: rueckSuchen
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = Logik;

// Linie 8 — gemeinsame Logik für Einstellungsseite und Uhr-Menü (eine Wahrheit für beide Wege).
// Handy-Skript: require('./logik')(holen, schrift). Einstellungsseite: tools/seite_erzeugen.py setzt diese
// Datei vor das Skript der Seite, dort steht Logik(...) als globale Funktion bereit.
//   holen(pfad, fertig)  Transitous-Abfrage relativ zu https://api.transitous.org/api/, fertig(fehlerText, daten)
//   schrift              LED-Glyphen F35 (für Breite und Kurzname)
function Logik(holenRoh, schrift) {
  var COLS = 66;               // Breite des LED-Rasters auf der Uhr
  var UMKREIS_B = 2000;        // Rückfahrt: Einstieg bis 2 km um das Ziel (Bummeln)
  var GENAU_R = 300;           // Rückfahrt genau zum Start: Ankünfte in 300 m abfragen …
  var GENAU_M = 150;           // … und gleichen Namen oder bis 150 m als Start zählen
  var UMKREISE = [500, 1000, 2000];   // wählbarer Umkreis um den Start (Einstellungen), Standard 1000
  var GLEICHZEITIG = 4;        // so viele Abfragen parallel (Transitous drosselt bei mehr, HTTP 429)
  var cacheErreichbar = {};    // Start-ID -> Ergebnis
  var cacheAnkunft = {};       // 'Start-ID|Radius' -> { fertig, f, erg, warten[] }

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
  // Nur Linienverkehr: Transitous führt auch Mitfahrbörsen (MiFAZ, Datenquelle amarillo) als RIDE_SHARING ohne Liniennamen
  function oepnv(x) { return x && x.mode !== 'RIDE_SHARING' && !!x.routeShortName; }

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
  // Schnell (seit 3.3): die Abfahrten bringen ihre Folgehalte mit (v6 fetchStops, Hbf ~0,3 s). Abends und nachts
  // zusätzlich der nächste Mittag, sonst fehlen Tageslinien (Hbf 21:30: 419 statt ~610 Ziele).
  // fetchStops ist laut API experimentell — fehlt nextStops, gilt der alte Weg über die Fahrtverläufe.
  // Linien je Ziel nur aus der Fahrtrichtung Start -> Ziel (der alte Weg mischte beide Richtungen).
  function erreichbar(start, fortschritt, fertig) {
    if (cacheErreichbar[start.id]) return fertig(null, cacheErreichbar[start.id]);
    var h = (new Date().getUTCHours() + 2) % 24, zeiten = [null];
    if (h >= 20 || h < 6) zeiten.push(morgenMittag());
    var offen = zeiten.length, alle = [], fehler = null, ohneHalte = false;
    zeiten.forEach(function (zeit) {
      holen('v6/stoptimes?n=150&window=7200&fetchStops=true&stopId=' + encodeURIComponent(start.id) + (zeit ? '&time=' + zeit : ''), function (f, d) {
        var st = (!f && d && d.stopTimes) || [];
        if (f) fehler = f;
        else if (st.length && !st.some(function (x) { return x.nextStops; })) ohneHalte = true;
        alle = alle.concat(st);
        if (--offen) return;
        if (fehler || ohneHalte || !alle.length) {
          console.log('Ziele: schneller Weg ' + (fehler || 'ohne Folgehalte') + ', nehme Fahrtverläufe');
          return erreichbarAlt(start, fortschritt, fertig);
        }
        var erg = { linien: {}, ziele: {} };
        alle.forEach(function (x) {
          if (!oepnv(x) || (x.place && x.place.pickupType === 'NOT_ALLOWED')) return;   // Endhalt: nur Ausstieg
          var halte = x.nextStops || [];
          if (!halte.length) return;
          erg.linien[x.routeShortName] = 1;
          halte.forEach(function (hh) {
            if (hh.name === start.name || hh.name === x.place.name) return;
            var z = erg.ziele[hh.name] || (erg.ziele[hh.name] = { name: hh.name, id: hh.stopId, lat: hh.lat, lon: hh.lon, linien: {}, hin: false, rueck: false });
            z.linien[x.routeShortName] = 1;
            z.hin = true;
          });
        });
        cacheErreichbar[start.id] = erg;
        fertig(null, erg);
      });
    });
  }

  function erreichbarAlt(start, fortschritt, fertig) {
    holen('v1/stoptimes?n=300&stopId=' + encodeURIComponent(start.id), function (f, d) {
      if (f) return fertig(f);
      var muster = {}, liste = [];
      (d.stopTimes || []).filter(oepnv).forEach(function (x) {
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
          if (j > ab) { z.hin = true; z.linien[x.routeShortName] = 1; } else z.rueck = true;   // Linien nur in Fahrtrichtung
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
        if (fa.length === 1 && oepnv(fa[0])) l[fa[0].routeShortName] = 1;
      });
      fertig(null, Object.keys(l).sort(sortDe));
    });
  }

  // ---------- Rückfahrt (seit 3.3): Fahrten, die am Start A oder in seinem Umkreis ankommen ----------
  // Ankünfte an allen Haltestellen im Kreis um A (v6/stoptimes mit radius, zwei Zeitfenster: jetzt und morgen
  // Mittag, sonst fehlen abends die Tageslinien), je Linie+Endhalt+Richtung ein Fahrtverlauf. Hängt nicht vom
  // Ziel ab: einmal je A und Umkreis laden, die Liste für jedes Ziel entsteht dann lokal (rueckKandidaten).
  function morgenMittag() {            // ~12:30 deutscher Zeit, genau genug für ein Stundenfenster
    return new Date(Date.now() + 86400000).toISOString().substring(0, 10) + 'T10:30:00Z';
  }

  function ankunftUm(a, radius, fortschritt, fertig) {
    var k = a.id + '|' + radius, c = cacheAnkunft[k];
    if (c && c.fertig) return fertig(c.f, c.erg);
    if (c) { c.warten.push(fertig); if (fortschritt) c.fortschritt = fortschritt; return; }   // läuft schon (vorgeladen)
    c = cacheAnkunft[k] = { fertig: false, warten: [fertig], fortschritt: fortschritt };
    function ende(f, erg) {
      c.fertig = true; c.f = f; c.erg = erg;
      if (f) delete cacheAnkunft[k];   // Fehler nicht merken, nächster Versuch fragt neu
      var w = c.warten; c.warten = [];
      w.forEach(function (cb) { cb(f, erg); });
    }
    // Abdeckung: je Linie+Endhalt+Richtung UND Ankunftshaltestelle mindestens eine Fahrt. Nur Linie+Endhalt reicht
    // nicht — manche Linien fahren mit gleichem Endhalt in zwei Varianten über verschiedene Halte.
    var abdeckung = {}, alle = {}, offen = 2, fehler = null;
    function abfrage(zeit) {
      holen('v6/stoptimes?stopId=' + encodeURIComponent(a.id) + (a.lat !== undefined ? '&center=' + a.lat + ',' + a.lon : '') +
            '&radius=' + radius + '&exactRadius=true&arriveBy=true&direction=LATER&window=3600&n=50' +
            (zeit ? '&time=' + zeit : ''), function (f, d) {
        if (f) fehler = f;
        else (d.stopTimes || []).filter(oepnv).forEach(function (x) {
          var key = x.routeShortName + '|' + (x.tripTo && x.tripTo.name) + '|' + x.directionId + '|' + namensSchluessel(x.place.name);
          var t = abdeckung[x.tripId] || (abdeckung[x.tripId] = { linie: x.routeShortName, tripId: x.tripId, keys: {}, n: 0 });
          if (!t.keys[key]) { t.keys[key] = 1; t.n++; }
          alle[key] = 1;
        });
        if (--offen) return;
        // gierig: Fahrten mit den meisten Haltestellen zuerst, jede nur, wenn sie etwas Neues abdeckt
        var liste = [];
        Object.keys(abdeckung).map(function (k2) { return abdeckung[k2]; }).sort(function (x, y) { return y.n - x.n; }).forEach(function (t) {
          var neu = Object.keys(t.keys).filter(function (k3) { return alle[k3]; });
          if (!neu.length) return;
          neu.forEach(function (k3) { delete alle[k3]; });
          liste.push(t);
        });
        if (!liste.length && fehler) return ende(fehler);
        var erg = [];
        nacheinander(liste.map(function (m) {
          return function (weiter) {
            holen('v1/trip?tripId=' + encodeURIComponent(m.tripId), function (f2, t) {
              var leg = !f2 && t && t.legs && t.legs[0];
              if (leg) erg.push({ linie: m.linie, halte: [leg.from].concat(leg.intermediateStops || [], [leg.to]).map(function (h) {
                return { name: h.name, id: h.stopId, lat: h.lat, lon: h.lon };
              }) });
              weiter();
            });
          };
        }), function (n, g) { if (c.fortschritt) c.fortschritt(n, g); }, function () { ende(null, erg); });
      });
    }
    abfrage(null);
    abfrage(morgenMittag());
  }

  // Rückfahrt-Kandidaten: Einstieg C bis 2 km um b, auf derselben Fahrt vor dem Ausstieg D.
  //   umkreis  0 = genau A (gleicher Name oder bis 150 m: zweite Datenquelle, anderer Steig), sonst Meter um A
  //   Ergebnis [{id, name, lat, lon, m, ziel, linien[], ziele[]}] nach Entfernung von b;
  //   ziele: [{id, name, lat, lon, m, start, linien[]}] — Ausstiege, A selbst zuerst, sonst nach Entfernung zu A
  function rueckKandidaten(fahrten, a, b, umkreis) {
    var ka = namensSchluessel(a.name), kb = namensSchluessel(b.name), je = {};
    function istA(h) { return namensSchluessel(h.name) === ka || entfernung(a.lat, a.lon, h.lat, h.lon) <= GENAU_M; }
    (fahrten || []).forEach(function (f) {
      var h = f.halte;
      for (var j = 1; j < h.length; j++) {
        var d = h[j], dA = entfernung(a.lat, a.lon, d.lat, d.lon), start = istA(d), kd = namensSchluessel(d.name);
        if (umkreis ? !(dA <= umkreis) && !start : !start) continue;
        for (var i = 0; i < j; i++) {
          var c = h[i], kc = namensSchluessel(c.name);
          if (kc === kd || istA(c)) continue;
          var m = kc === kb ? 0 : entfernung(b.lat, b.lon, c.lat, c.lon);
          if (!(m <= UMKREIS_B)) continue;
          var e = je[kc];
          if (!e || m < e.m) {
            var alt = e;
            e = je[kc] = { id: c.id, name: c.name, lat: c.lat, lon: c.lon, m: m, ziel: kc === kb,
                           linien: alt ? alt.linien : {}, ziele: alt ? alt.ziele : {} };
          }
          e.linien[f.linie] = 1;
          var z = e.ziele[kd];
          if (!z || dA < z.m) {
            var altz = z;
            z = e.ziele[kd] = { id: d.id, name: d.name, lat: d.lat, lon: d.lon, m: start ? 0 : dA, start: start, linien: altz ? altz.linien : {} };
          }
          z.linien[f.linie] = 1;
        }
      }
    });
    return Object.keys(je).map(function (kc) {
      var e = je[kc];
      e.linien = Object.keys(e.linien).sort(sortDe);
      e.ziele = Object.keys(e.ziele).map(function (kd) {
        var z = e.ziele[kd]; z.linien = Object.keys(z.linien).sort(sortDe); return z;
      }).sort(function (x, y) { return (y.start - x.start) || (x.m - y.m); });
      return e;
    }).sort(function (x, y) { return x.m - y.m; });
  }

  return {
    COLS: COLS, UMKREIS_B: UMKREIS_B, GENAU_R: GENAU_R, UMKREISE: UMKREISE,
    sortDe: sortDe, entfernung: entfernung, ledText: ledText, breite: breite, stadtVon: stadtVon, kurzname: kurzname,
    klarname: klarname, utf8Kuerzen: utf8Kuerzen, oepnv: oepnv,
    haltestellenUm: haltestellenUm, naechsteHaltestellen: naechsteHaltestellen,
    erreichbar: erreichbar, zieleHin: zieleHin, direkt: direkt, ankunftUm: ankunftUm, rueckKandidaten: rueckKandidaten
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = Logik;

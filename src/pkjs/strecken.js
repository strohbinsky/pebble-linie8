// Linie 8 — Strecken (seit 0.6.1): Verbindungen von A nach B mit Umstieg und Fußwegen, Übersicht und Detailzeilen
// für die Uhr. Reine Funktionen ohne Netz: index.js holt die Antworten (RMV oder Transitous) und reicht sie hier durch.
//   hilfe = { deZuUtc(datum, zeit), linienKurz(name), linienVoll(name), steigText(s), oepnv(leg), name(text, istZiel) }
//
// Verbindung: { los, an, umst, live, legs: [Abschnitt] }
// Abschnitt:  { fuss: true,  ab, an, m, von, nach }
//             { fuss: false, ab, an, abPlan, anPlan, del, ausfall, live, linie, richtung, von, nach, vonSteig, nachSteig,
//               halte, zwischen: [{ name, t }], vonLat/vonLon, nachLat/nachLon, zn (Zugnummer, nur Transitous) }
// Zeiten in Unix-Sekunden (UTC), mit Echtzeit, wo vorhanden. Namen roh aus der Quelle, Kürzen erst beim Senden.
function Strecken(hilfe) {
  var KNAPP = 1, WEG = 2, LIVE = 4, AUSFALL = 8;   // Merker je Verbindung (R_FLAG an die Uhr)

  // Verkehrsmittel für die Fahrtkarte (0.7.0): BUS, TRAM, ZUG — aus RMV catOut bzw. Transitous mode
  function verkehrsmittel(x) {
    x = String(x).toUpperCase();
    if (/BUS|^AST|COACH/.test(x)) return 'BUS';
    if (/TRAM|^STR/.test(x)) return 'TRAM';
    if (/FERRY|FAEHRE|SCHIFF/.test(x)) return 'FAEHRE';
    return 'ZUG';
  }

  // ---------- RMV (HAFAS ReST trip) ----------
  function produktName(l) {
    var pr = l.Product;
    if (pr && pr.length !== undefined) pr = pr[0];
    return String((pr && (pr.line || pr.displayNumber || pr.num)) || l.name || '').trim();
  }
  function rmvZeit(x, rt) {
    if (!x || !x.time) return 0;
    return rt && x.rtTime ? hilfe.deZuUtc(x.rtDate || x.date, x.rtTime) : hilfe.deZuUtc(x.date, x.time);
  }
  function ausRmv(trip) {
    var legs = [];
    ((trip.LegList && trip.LegList.Leg) || []).forEach(function (l) {
      var o = l.Origin || {}, z = l.Destination || {};
      var ab = rmvZeit(o, true), an = rmvZeit(z, true);
      if (l.type !== 'JNY') {
        legs.push({ fuss: true, ab: ab, an: an, m: +l.dist || 0, von: o.name || '', nach: z.name || '' });
        return;
      }
      var stops = (l.Stops && l.Stops.Stop) || [];
      var abPlan = rmvZeit(o, false), pr = l.Product;
      if (pr && pr.length !== undefined) pr = pr[0];
      legs.push({
        fuss: false, ab: ab, an: an, abPlan: abPlan, anPlan: rmvZeit(z, false),
        del: Math.round((ab - abPlan) / 60), ausfall: !!(l.cancelled || o.cancelled), live: !!o.rtTime,
        linie: produktName(l), richtung: l.direction || '', von: o.name || '', nach: z.name || '',
        vonSteig: hilfe.steigText(o.rtTrack || o.track), nachSteig: hilfe.steigText(z.rtTrack || z.track),
        ref: l.JourneyDetailRef && l.JourneyDetailRef.ref, vonLat: +o.lat, vonLon: +o.lon,   // für die aktive Fahrt (0.6.6)
        nachLat: +z.lat, nachLon: +z.lon,                                                    // für die DB (0.9.0); RMV ohne Zugnummer
        mittel: verkehrsmittel((pr && pr.catOut) || ''), vonSteigPlan: hilfe.steigText(o.track),
        halte: stops.length > 1 ? stops.length - 1 : 0,
        zwischen: stops.slice(1, -1).map(function (s) { return { name: s.name, t: rmvZeit({ date: s.arrDate || s.depDate, time: s.arrTime || s.depTime, rtTime: s.rtArrTime || s.rtDepTime, rtDate: s.rtArrDate || s.rtDepDate }, true) }; })
      });
    });
    return verbindung(legs);
  }

  // ---------- Transitous (MOTIS plan) ----------
  function sek(s) { return s ? Math.floor(Date.parse(s) / 1000) : 0; }
  function ausTransitous(it) {
    var legs = [], ok = true;
    (it.legs || []).forEach(function (l) {
      var ab = sek(l.startTime), an = sek(l.endTime);
      if (l.mode === 'WALK' || l.mode === 'BIKE' || l.mode === 'CAR') {
        legs.push({ fuss: true, ab: ab, an: an, m: Math.round(l.distance || 0), von: (l.from && l.from.name) || '', nach: (l.to && l.to.name) || '' });
        return;
      }
      if (!hilfe.oepnv(l)) { ok = false; return; }     // Mitfahrbörse: ganze Verbindung verwerfen
      var abPlan = sek(l.scheduledStartTime) || ab, inter = l.intermediateStops || [];
      legs.push({
        fuss: false, ab: ab, an: an, abPlan: abPlan, anPlan: sek(l.scheduledEndTime) || an,
        del: l.realTime ? Math.round((ab - abPlan) / 60) : 0, ausfall: !!l.cancelled, live: !!l.realTime,
        linie: l.routeShortName || '', richtung: l.headsign || (l.tripTo && l.tripTo.name) || '',
        von: (l.from && l.from.name) || '', nach: (l.to && l.to.name) || '',
        vonSteig: hilfe.steigText(l.from && (l.from.track || l.from.scheduledTrack)),
        nachSteig: hilfe.steigText(l.to && (l.to.track || l.to.scheduledTrack)),
        tid: l.tripId, vonLat: l.from && l.from.lat, vonLon: l.from && l.from.lon,             // für die aktive Fahrt (0.6.6)
        nachLat: l.to && l.to.lat, nachLon: l.to && l.to.lon, zn: l.tripShortName || '',        // für die DB (0.9.0)
        mittel: verkehrsmittel(l.mode || ''), vonSteigPlan: hilfe.steigText(l.from && l.from.scheduledTrack),
        halte: inter.length + 1,
        zwischen: inter.map(function (s) { return { name: s.name, t: sek(s.arrival || s.departure) }; })
      });
    });
    return ok ? verbindung(legs) : null;
  }

  // Fußwege direkt hintereinander zusammenfassen, Länge 0 am Anfang/Ende weglassen
  function verbindung(legs) {
    var aus = [];
    legs.forEach(function (l) {
      var v = aus[aus.length - 1];
      if (l.fuss && v && v.fuss) { v.an = l.an; v.m += l.m; v.nach = l.nach; return; }
      aus.push(l);
    });
    aus = aus.filter(function (l, i) { return !(l.fuss && l.m === 0 && l.an - l.ab < 60 && (i === 0 || i === aus.length - 1)); });
    var fahrten = aus.filter(function (l) { return !l.fuss; });
    if (!aus.length) return null;
    return {
      los: aus[0].ab, an: aus[aus.length - 1].an, umst: Math.max(0, fahrten.length - 1), legs: aus,
      live: fahrten.some(function (l) { return l.live; }), nurFuss: !fahrten.length
    };
  }

  // Umstiegszeiten: Abfahrt des nächsten Verkehrsmittels minus Ankunft des vorigen minus Fußweg dazwischen
  function umstiege(v) {
    var aus = [], vorher = null, fuss = 0;
    v.legs.forEach(function (l) {
      if (l.fuss) { fuss += l.an - l.ab; return; }
      if (vorher) aus.push({ min: Math.floor((l.ab - vorher.an - fuss) / 60), gesamt: Math.round((l.ab - vorher.an) / 60), fuss: Math.round(fuss / 60) });
      vorher = l; fuss = 0;
    });
    return aus;
  }

  function merker(v, minUmstieg) {
    var f = v.live ? LIVE : 0;
    umstiege(v).forEach(function (u) { if (u.min < 0) f |= WEG; else if (u.gesamt < minUmstieg) f |= KNAPP; });
    if (v.legs.some(function (l) { return !l.fuss && l.ausfall; })) f |= AUSFALL;
    return f;
  }

  // Sortieren, Doppelte (gleiche Abfahrten) weg, nur noch erreichbare (los ab jetzt - 1 min)
  function auswaehlen(liste, jetzt, n) {
    var gesehen = {};
    return liste.filter(Boolean).filter(function (v) {
      if (v.nurFuss) return false;
      var k = v.legs.filter(function (l) { return !l.fuss; }).map(function (l) { return l.linie + '@' + l.abPlan; }).join('|');
      if (gesehen[k] || v.los < jetzt - 60) return false;
      gesehen[k] = true;
      return true;
    }).sort(function (a, b) { return a.los - b.los || a.an - b.an; }).slice(0, n);
  }

  // Kennung einer Verbindung über Nachladen hinweg: Linien und Planzeiten
  function kennung(v) {
    return v.legs.filter(function (l) { return !l.fuss; }).map(function (l) { return l.linie + '@' + l.abPlan; }).join('|');
  }

  // Linienkette für die Übersicht: "8 > S1 > U5"
  function kette(v) {
    return v.legs.filter(function (l) { return !l.fuss; }).map(function (l) { return hilfe.linienKurz(l.linie); }).join(' > ');
  }

  // Detailzeilen für die Uhr, von oben nach unten. Arten wie D_ART in main.c:
  //   1 START, 2 HALT, 3 ZIEL, 4 ZWISCHEN (Punkte) · 10 FUSS, 11 FAHRT, 12 UMSTIEG (Abschnitte); +32 = Warnung (farbig)
  // t: Text-Funktionen { name(roh) -> Anzeigename, T(led, klar) }; vonName/nachName: Anzeigenamen von Start und Ziel.
  var Z = { START: 1, HALT: 2, ZIEL: 3, ZWISCHEN: 4, FUSS: 10, FAHRT: 11, UMSTIEG: 12, WARN: 32 };
  function minText(sekunden) { return Math.max(1, Math.round(sekunden / 60)) + "'"; }
  function meterText(m, t) { return m >= 1000 ? (Math.round(m / 100) / 10).toFixed(1).replace('.', t.T('.', ',')) + t.T('KM', ' km') : m + t.T('M', ' m'); }
  function halteText(n, t) { return n === 1 ? t.T('1 HALT', '1 Halt') : n + t.T(' HALTE', ' Halte'); }
  function sep(t) { return t.T(' ', ' · '); }            // LED-Schrift hat keinen Mittelpunkt

  function detailVerbindung(v, t, vonName, nachName, minUmstieg) {
    var z = [], legs = v.legs, um = umstiege(v), ui = 0, akt = 0;
    function zeile(art, zeit, text, zus, re) { z.push({ art: art, t: zeit || 0, text: text || '', zus: zus || '', re: re || '', leg: akt }); }
    var erste = legs[0];
    if (erste.fuss) zeile(Z.START, v.los, vonName);
    for (var i = 0; i < legs.length; i++) {
      var l = legs[i], letzte = i === legs.length - 1;
      akt = i;
      if (l.fuss) {
        var nachFahrt = i > 0, vorFahrt = !letzte;
        if (nachFahrt && vorFahrt) {                      // Fußweg beim Umsteigen
          var u = um[ui++] || { gesamt: 0, min: 0 };
          var warnU = u.min < 0 || u.gesamt < minUmstieg;
          zeile(Z.UMSTIEG + (warnU ? Z.WARN : 0), 0, t.T('UMSTIEG ', 'Umstieg ') + u.gesamt + "'",
                (u.min < 0 ? t.T('ANSCHLUSS WEG', 'Anschluss weg') : u.gesamt < minUmstieg ? t.T('KNAPP', 'knapp') + sep(t) : '') +
                (u.min < 0 ? '' : t.T('FUSS ', 'zu Fuß ') + minText(l.an - l.ab) + ' ' + meterText(l.m, t)));
        } else {
          zeile(Z.FUSS, 0, t.T('FUSS ', 'zu Fuß ') + minText(l.an - l.ab), meterText(l.m, t));
          if (letzte) zeile(Z.ZIEL, l.an, nachName);
        }
        continue;
      }
      var vorher = legs[i - 1];
      if (vorher && !vorher.fuss) {                       // Umstieg ohne Fußweg (gleiche Haltestelle)
        var u2 = um[ui++] || { gesamt: 0, min: 0 };
        var warn2 = u2.min < 0 || u2.gesamt < minUmstieg;
        zeile(Z.UMSTIEG + (warn2 ? Z.WARN : 0), 0, t.T('UMSTIEG ', 'Umstieg ') + u2.gesamt + "'",
              u2.min < 0 ? t.T('ANSCHLUSS WEG', 'Anschluss weg') : warn2 ? t.T('KNAPP', 'knapp') : '');
      }
      zeile(i === 0 ? Z.START : Z.HALT, l.ab, i === 0 && vonName ? vonName : t.name(l.von), '', l.vonSteig);
      var zus = halteText(l.halte, t) + sep(t) + minText(l.an - l.ab);
      if (l.ausfall) zus = t.T('FAELLT AUS', 'fällt aus');
      else if (l.del) zus = (l.del > 0 ? '+' : '') + l.del + "'" + sep(t) + zus;
      zeile(Z.FAHRT + (l.ausfall || l.del > 0 ? Z.WARN : 0), 0, hilfe.linienVoll(l.linie) + ' > ' + t.name(l.richtung), zus);
      zeile(letzte ? Z.ZIEL : Z.HALT, l.an, letzte && nachName ? nachName : t.name(l.nach), '', l.nachSteig);
    }
    return z;
  }

  // Haltestellen-Seite: Verlauf einer Abfahrt. f = { ab, an, linie, richtung, steig, del, ausfall, zwischen[], zielName,
  // zielSteig } — Halte einzeln (bis max Zeilen), danach Ziel bzw. Endziel.
  function detailAbfahrt(f, t, startName, max) {
    var z = [];
    function zeile(art, zeit, text, zus, re) { z.push({ art: art, t: zeit || 0, text: text || '', zus: zus || '', re: re || '', leg: 0 }); }
    zeile(Z.START, f.ab, startName, '', f.steig);
    var halte = (f.zwischen || []).length + 1;
    var zus = halteText(halte, t) + (f.an > f.ab ? sep(t) + minText(f.an - f.ab) : '');
    if (f.ausfall) zus = t.T('FAELLT AUS', 'fällt aus');
    else if (f.del) zus = (f.del > 0 ? '+' : '') + f.del + "'" + sep(t) + zus;
    zeile(Z.FAHRT + (f.ausfall || f.del > 0 ? Z.WARN : 0), 0, hilfe.linienVoll(f.linie) + ' > ' + t.name(f.richtung), zus);
    var zw = f.zwischen || [], platz = (max || 24) - 3;
    if (zw.length > platz) {                            // zu viele: die ersten zeigen, Rest als Zahl am Ziel
      var rest = zw.length - (platz - 1);
      zw = zw.slice(0, platz - 1);
      zw.forEach(function (s) { zeile(Z.ZWISCHEN, s.t, t.name(s.name)); });
      zeile(Z.ZWISCHEN, 0, t.T('+', '… ') + rest + t.T(' WEITERE', ' weitere'));
    } else {
      zw.forEach(function (s) { zeile(Z.ZWISCHEN, s.t, t.name(s.name)); });
    }
    zeile(Z.ZIEL, f.an, t.name(f.zielName), '', f.zielSteig);
    return z;
  }

  return { ausRmv: ausRmv, ausTransitous: ausTransitous, auswaehlen: auswaehlen, kennung: kennung, kette: kette,
           merker: merker, umstiege: umstiege, detailVerbindung: detailVerbindung, detailAbfahrt: detailAbfahrt,
           Z: Z, KNAPP: KNAPP, WEG: WEG, LIVE: LIVE, AUSFALL: AUSFALL, verkehrsmittel: verkehrsmittel };
}
if (typeof module !== 'undefined' && module.exports) module.exports = Strecken;

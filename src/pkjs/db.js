// Linie 8 — DB Timetables (seit 0.9.0): Echtzeit für Zugabschnitte als Zusatz zu RMV und Transitous.
// Liefert zu einem Zug an einem Bahnhof (Abfahrt oder Ankunft) die aktuelle Zeit, das Gleis und ob er ausfällt.
// Gilt nur für Züge an DB-Bahnhöfen; Bus und Tram bleiben bei RMV bzw. Transitous.
//
// Ablauf je Anfrage { art: 'dp' | 'ar', lat, lon, t (Planzeit, UTC-Sekunden), linie, zn (Zugnummer, falls bekannt) }:
//   1. DB-Bahnhöfe im Umkreis von 400 m aus der Tabelle db_bahnhoefe.json (die Namenssuche von Timetables taugt nicht)
//   2. Plan der Stunde (/plan/{eva}/{yymmdd}/{hh}): Zug suchen — gleiche Planzeit (±1 min) und gleiche Linie
//      ("RB10", "S1", "ICE710") oder gleiche Zugnummer. RMV liefert keine Zugnummer, Transitous schon (tripShortName)
//   3. Änderungen (/fchg/{eva}): ct = neue Zeit, cp = neues Gleis, cs = 'c' fällt aus (bei 'ar' am Ausstieg: Teilausfall)
// Pläne bleiben 6 h im Handy-Speicher, Änderungen 30 s im Arbeitsspeicher. Gratis-Tarif: 60 Abfragen/min — darüber
// wird die DB für den Rest der Minute übersprungen. Jeder Fehler ist still: dann bleibt es bei RMV bzw. Transitous.
//   hilfe = { schluessel() -> { id, key } | null, deZuUtc(datum, zeit), entfernung(lat1, lon1, lat2, lon2),
//             bahnhoefe (String aus db_bahnhoefe.json), speicher (localStorage) }
function DB(hilfe) {
  var BASIS = 'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/';
  var UMKREIS_M = 400, TIMEOUT_MS = 10000, PLAN_S = 6 * 3600, FCHG_S = 30, PLAN_MAX = 12, PRO_MIN = 55;

  // ---------- Bahnhöfe ----------
  var tabelle = null;
  function bahnhoefe() {
    if (tabelle) return tabelle;
    tabelle = hilfe.bahnhoefe.split(';').map(function (z) {
      var t = z.split(','), evas = [t[0]].concat(t.slice(3)).map(function (e) { return e.charAt(0) === '~' ? e.substring(1) : String(8000000 + +e); });
      return { lat: t[1] / 1e4, lon: t[2] / 1e4, evas: evas };
    });
    return tabelle;
  }
  function nahe(lat, lon) {            // Bahnhöfe im Umkreis, nächster zuerst
    if (lat === undefined || lat === null || isNaN(lat)) return [];
    var d = UMKREIS_M / 111000, aus = [];
    bahnhoefe().forEach(function (b) {
      if (Math.abs(b.lat - lat) > d || Math.abs(b.lon - lon) > 2 * d) return;
      var m = hilfe.entfernung(lat, lon, b.lat, b.lon);
      if (m <= UMKREIS_M) aus.push({ m: m, evas: b.evas });
    });
    return aus.sort(function (a, b) { return a.m - b.m; });
  }

  // ---------- Zeit: UTC <-> deutsche Ortszeit (wie deZuUtc in index.js, ohne Zeitzone des Handys) ----------
  function letzterSonntag0100(y, m) { var t = Date.UTC(y, m, 0) / 1000; return t - new Date(t * 1000).getUTCDay() * 86400 + 3600; }
  function zwei(n) { return (n < 10 ? '0' : '') + n; }
  function stunde(t) {                 // UTC-Sekunden -> { tag: 'yymmdd', h: 'hh' } deutsche Zeit
    var y = new Date(t * 1000).getUTCFullYear();
    var off = (t >= letzterSonntag0100(y, 3) && t < letzterSonntag0100(y, 10)) ? 7200 : 3600, d = new Date((t + off) * 1000);
    return { tag: zwei(d.getUTCFullYear() % 100) + zwei(d.getUTCMonth() + 1) + zwei(d.getUTCDate()), h: zwei(d.getUTCHours()), min: d.getUTCMinutes() };
  }
  function utc(s) {                    // "2610121631" -> UTC-Sekunden
    if (!s || s.length < 10) return 0;
    return hilfe.deZuUtc('20' + s.substring(0, 2) + '-' + s.substring(2, 4) + '-' + s.substring(4, 6), s.substring(6, 8) + ':' + s.substring(8, 10));
  }

  // ---------- Abruf ----------
  var zeiten = [], gesperrt = 0;      // Zeitpunkte der Abfragen der letzten Minute; gesperrt: Schlüssel abgelehnt (bis Neustart)
  function get(pfad, fertig) {
    var s = hilfe.schluessel(), jetzt = Date.now();
    if (!s || gesperrt) return fertig('aus');
    zeiten = zeiten.filter(function (z) { return jetzt - z < 60000; });
    if (zeiten.length >= PRO_MIN) { console.log('DB: Kontingent der Minute erreicht, übersprungen'); return fertig('voll'); }
    zeiten.push(jetzt);
    var erledigt = false;
    function ende(f, d) { if (!erledigt) { erledigt = true; fertig(f, d); } }
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', BASIS + pfad, true);
      xhr.setRequestHeader('DB-Client-Id', s.id);
      xhr.setRequestHeader('DB-Api-Key', s.key);
      xhr.setRequestHeader('Accept', 'application/xml');
    } catch (e) { console.log('DB: Abfrage nicht möglich: ' + e); return ende('netz'); }
    xhr.onload = function () {
      if (xhr.status === 401 || xhr.status === 403) { gesperrt = xhr.status; console.log('DB: Schlüssel abgelehnt (HTTP ' + xhr.status + ')'); return ende('schluessel'); }
      if (xhr.status === 404) return ende(null, '');          // keine Daten für diese Stunde
      if (xhr.status !== 200) { console.log('DB HTTP ' + xhr.status + ' ' + pfad.split('/')[0]); return ende('http'); }
      ende(null, xhr.responseText || '');
    };
    xhr.onerror = function () { ende('netz'); };
    setTimeout(function () { ende('netz'); }, TIMEOUT_MS);
    xhr.send();
  }
  var laufend = {};                    // gleiche Abfrage nur einmal gleichzeitig
  function einmal(k, holer, fertig) {
    if (laufend[k]) return laufend[k].push(fertig);
    laufend[k] = [fertig];
    holer(function (f, d) { var l = laufend[k]; delete laufend[k]; l.forEach(function (cb) { cb(f, d); }); });
  }

  // ---------- XML lesen (ohne Parser: Timetables liefert flaches XML) ----------
  function attribute(s) {
    var a = {}, re = /(\w+)=(?:"([^"]*)"|'([^']*)')/g, m;
    while ((m = re.exec(s))) a[m[1]] = m[2] !== undefined ? m[2] : m[3];
    return a;
  }
  function zuege(xml) {                // [{ id, tl, ar, dp }] — je Zug die Attribute von tl, ar, dp
    var aus = [], re = /<s\s([^>]*)>([\s\S]*?)<\/s>/g, m;
    while ((m = re.exec(xml))) {
      var z = { id: attribute(m[1]).id }, re2 = /<(tl|ar|dp)\b([^>]*)>/g, e;
      while ((e = re2.exec(m[2]))) z[e[1]] = attribute(e[2]);
      aus.push(z);
    }
    return aus;
  }

  // Plan einer Stunde: { id: [n, c, arPt, arPp, arL, dpPt, dpPp, dpL] }, gemerkt im Handy-Speicher
  function plaene() { try { return JSON.parse(hilfe.speicher.getItem('dbPlan')) || {}; } catch (e) { return {}; } }
  function plan(eva, st, fertig) {
    var k = eva + '|' + st.tag + st.h, alle = plaene(), p = alle[k], jetzt = Math.floor(Date.now() / 1000);
    if (p && jetzt - p.t < PLAN_S) return fertig(null, p.s);
    einmal('p' + k, function (cb) { get('plan/' + eva + '/' + st.tag + '/' + st.h, cb); }, function (f, xml) {
      if (f) return fertig(f);
      var s = {};
      zuege(xml).forEach(function (z) {
        var tl = z.tl || {}, ar = z.ar || {}, dp = z.dp || {};
        s[z.id] = [tl.n || '', tl.c || '', ar.pt || '', ar.pp || '', ar.l || '', dp.pt || '', dp.pp || '', dp.l || ''];
      });
      alle = plaene();
      alle[k] = { t: jetzt, s: s };
      Object.keys(alle).sort(function (a, b) { return alle[b].t - alle[a].t; }).slice(PLAN_MAX).forEach(function (x) { delete alle[x]; });
      try { hilfe.speicher.setItem('dbPlan', JSON.stringify(alle)); } catch (e) { try { hilfe.speicher.setItem('dbPlan', '{}'); } catch (e2) {} }
      fertig(null, s);
    });
  }
  // Änderungen eines Bahnhofs: { id: { ar: {ct, cp, cs, clt, cpth}, dp: {...} } }
  var fchgPuffer = {};
  function aenderungen(eva, fertig) {
    var p = fchgPuffer[eva], jetzt = Math.floor(Date.now() / 1000);
    if (p && jetzt - p.t < FCHG_S) return fertig(null, p.s);
    einmal('f' + eva, function (cb) { get('fchg/' + eva, cb); }, function (f, xml) {
      if (f) return fertig(f);
      var s = {};
      zuege(xml).forEach(function (z) { s[z.id] = { ar: z.ar || null, dp: z.dp || null }; });
      fchgPuffer[eva] = { t: jetzt, s: s };
      fertig(null, s);
    });
  }

  // ---------- Zug suchen ----------
  function norm(x) { return String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function nummer(x) { return String(x || '').replace(/\D/g, '').replace(/^0+/, ''); }
  function suchen(s, a) {              // Kennung des Zugs im Plan s, der zur Anfrage a passt, sonst null
    var L = norm(a.linie), zn = nummer(a.zn), o = a.art === 'ar' ? 2 : 5, treffer = null;
    Object.keys(s).forEach(function (id) {
      if (treffer) return;
      var z = s[id], pt = utc(z[o]);
      if (!pt || Math.abs(pt - a.t) > 60) return;
      var linie = norm(z[o + 2]), cn = norm(z[1] + z[0]);
      if ((zn && nummer(z[0]) === zn) || (L && (L === linie || L === cn))) treffer = id;
    });
    return treffer;
  }

  // Eine Anfrage: fertig(null | { t, plan, del, steig, steigPlan, aus, eva })
  function ereignis(a, fertig) {
    var st = stunde(a.t), kandidaten = [];
    nahe(a.lat, a.lon).forEach(function (b) { b.evas.forEach(function (e) { kandidaten.push(e); }); });
    var stunden = [st];
    if (st.min < 10) stunden.push(stunde(a.t - 3600));
    else if (st.min >= 50) stunden.push(stunde(a.t + 3600));
    var i = 0, j = 0;
    (function weiter() {
      if (i >= kandidaten.length) return fertig(null);
      if (j >= stunden.length) { i++; j = 0; return weiter(); }
      var eva = kandidaten[i];
      plan(eva, stunden[j++], function (f, s) {
        if (f === 'aus' || f === 'schluessel' || f === 'voll') return fertig(null);
        var id = !f && s ? suchen(s, a) : null;
        if (!id) return weiter();
        var z = s[id], o = a.art === 'ar' ? 2 : 5, pt = utc(z[o]);
        aenderungen(eva, function (f2, ch) {
          // Änderungen nicht abrufbar: nichts liefern, sonst überschriebe der reine Plan die Echtzeit von RMV/Transitous
          if (f2) return fertig(null);
          var c = ch && ch[id] && ch[id][a.art];
          var t = (c && c.ct) ? utc(c.ct) : pt;
          // Gleis ohne Abschnitt: "18 D-E" -> "18"
          function gleis(g) { return String(g || '').trim().split(/\s+/)[0]; }
          fertig({ t: t, plan: pt, del: Math.round((t - pt) / 60), steig: gleis((c && c.cp) || z[o + 1]), steigPlan: gleis(z[o + 1]),
                   aus: !!(c && c.cs === 'c'), eva: eva, live: true });
        });
      });
    })();
  }

  // Mehrere Anfragen auf einmal; fertig(ergebnisse) in derselben Reihenfolge (null = nichts gefunden).
  // Höchstens max_ms warten: was bis dahin fehlt, bleibt null.
  function anreichern(anfragen, fertig, maxMs) {
    var erg = anfragen.map(function () { return null; }), offen = anfragen.length, erledigt = false;
    function ende() { if (!erledigt) { erledigt = true; fertig(erg); } }
    if (!offen || !aktiv()) return ende();
    setTimeout(ende, maxMs || 8000);
    anfragen.forEach(function (a, k) {
      ereignis(a, function (r) { erg[k] = r; if (--offen === 0) ende(); });
    });
  }

  function aktiv() { return !!hilfe.schluessel() && !gesperrt; }

  return { anreichern: anreichern, ereignis: ereignis, nahe: nahe, stunde: stunde, utc: utc, aktiv: aktiv, zuege: zuege };
}
module.exports = DB;

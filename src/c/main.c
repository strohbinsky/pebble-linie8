// Linie 8 — Uhr-Teil. LED-Haltestellenanzeige: 66 x 76 Punkte im Raster 3 px, Punkt 2 x 2 px.
// Bis zu 8 Strecken (Haltestellenpaare), eingerichtet am Handy oder im Uhr-Menü. Alle Zeiten kommen als
// Unix-Sekunden (UTC); Anzeige immer in deutscher Zeit, unabhängig von der Zeitzone der Uhr.
// Hoch/Runter = Strecke wechseln, Select = neu laden, Select lang = Menü, Zurück = beenden.
// Drei Ansichten: LED-Haltestellenanzeige (Standard), „Klar“ (weiß, Systemschrift, 3.1) und „Phosphor“ (Radar-Grün,
// Pixelschrift wie das Watchface Phosphor, 3.4), umschaltbar am Handy (Einstellungsseite) oder an der Uhr
// (Menü > Einstellungen > Ansicht). Seit 3.4 je Abfahrt die Fahrtdauer zum Ziel; Minuten überall mit Strich (13').
// Uhr-Menü (Version 3.0): Hauptmenü und "Fahrt ändern" kennt die Uhr selbst; alle weiteren Listen
// (Haltestellen, Linien, Ziele, Rückfahrt) rechnet das Handy und schickt sie in Blöcken zu 10.
#include <pebble.h>
#include "led_font.h"

#define PITCH 3
#define DOT   2
#define COLS  66
#define ROWS  76
#define MAXD  3            // muss zu HIN[3] / RUECK[3] in package.json passen
#define MAXS  8            // muss zu NAME_A[8] / NAME_B[8] passen
#define NAMELEN 32
#define LINLEN  6
#define STEIGLEN 4
#define TIMEOUT_MS 20000
#define AUSFALL 9999       // Verspätungswert vom Handy für eine ausgefallene Fahrt
#define LAUF_MS 120        // Lauftext: ein LED-Punkt weiter je 120 ms
#define LAUF_DAUER_MS 60000 // nach 1 min ohne Tastendruck anhalten (Akku), Namensanfang bleibt stehen
#define LAUF_LUECKE 16     // Abstand zwischen Ende und neuem Anfang, in Punkten
#define MAXL  300          // Listeneinträge vom Handy (Ziele am Hbf mit allen Linien), muss zu MAXL in index.js passen
#define LTXT  32           // Zeichen je Listeneintrag
#define LBLOCK 10          // muss zu L_TEXT[10] passen
#define LZEILEN 8          // sichtbare Listenzeilen
#define LZ_Y0 9            // erste Listenzeile
#define LZ_H  7            // Zeilenabstand in Punkten
#define LADE_MS 30000      // ohne Antwort vom Handy: "KEINE ANTWORT"
#define PK_LAYOUT 1        // persist-Schlüssel: Ansicht, damit sie schon vor der Antwort des Handys stimmt
#define PK_UMKREIS 2       // persist-Schlüssel: Umkreis um den Start für die Rückfahrt-Suche (Meter)

enum { ST_LEER = -2, ST_LADE = -1, ST_SOLL = 0, ST_LIVE = 1, ST_NETZ = 2, ST_FEHLER = 3 };
enum { M_ANZEIGE, M_LISTE, M_LADE };                       // was die Uhr gerade zeigt
enum { L_HANDY, L_MENUE, L_AENDERN, L_EINST, L_ANSICHT, L_UMKREIS };  // woher die Liste stammt
enum { LAYOUT_LED = 0, LAYOUT_KLAR = 1, LAYOUT_PHOSPHOR = 2 };
enum { A_UNTERMENUE = 0, A_NEU = 1, A_AENDERN_RUECK = 2, A_AENDERN_START = 3, A_LOESCHEN = 4,
       A_WAHL = 5, A_ZURUECK = 6, A_LAYOUT = 7, A_UMKREIS = 8,
       A_EINST = -1, A_ANSICHT = -2, A_SET_LED = -3, A_SET_KLAR = -4,
       A_UMK = -5, A_SET_U500 = -6, A_SET_U1000 = -7, A_SET_U2000 = -8, A_SET_PHOSPHOR = -9 };   // negative: nur auf der Uhr                        // AKTION an das Handy, wie in index.js

static Window *s_window;
static Layer *s_layer;
static AppTimer *s_timeout;
typedef struct {
  char name[2][NAMELEN];            // 0 = Start, 1 = Rückfahrt-Haltestelle — LED-Schreibweise
  char klar[2][NAMELEN];            // dieselben für die Ansicht Klar, mit Umlauten (UTF-8)
  int32_t dep[2][MAXD];             // 0 = hin ab Start, 1 = zurück ab Ziel
  char lin[2][MAXD][LINLEN];
  int16_t del[2][MAXD];             // Verspätung in Minuten (negativ = zu früh), AUSFALL = fällt aus
  char steig[2][MAXD][STEIGLEN];
  int16_t dur[2][MAXD];             // Fahrtdauer bis zum Ziel in Minuten (Ankunft − Abfahrt, mit Echtzeit), 0 = unbekannt           // Steig der Abfahrt ("B"), leer = keine Angabe
  int32_t stand;
  int status;
  char quelle[8];                   // "RMV" oder "TRANS" (Transitous), steht vor der Uhrzeit des Stands
} Strecke;

static Strecke s_str[MAXS];
static int s_anzahl = -1;           // -1 = noch keine Einrichtung vom Handy erhalten
static int s_seite = 0;
static int s_status_start = ST_LADE; // Status, solange keine Strecke da ist
static AppTimer *s_lauf;
static int s_lauf_off;
static uint32_t s_lauf_rest;
static uint8_t s_lit[ROWS][(COLS + 7) / 8];
static uint8_t s_dim[ROWS];         // 1 = Zeile leuchtet gedimmt (Listen: nicht gewählte Einträge)
static uint8_t s_dimpx[ROWS][(COLS + 7) / 8];   // einzelne Punkte gedimmt (Steig hinter der Linie)
static bool s_dim_zeichnen;         // solange true, setzt lit_set die Punkte gedimmt

// Uhr-Menü
static int s_modus = M_ANZEIGE;
static int s_lart;                  // L_HANDY, L_MENUE oder L_AENDERN
static char s_ltitel[LTXT];
static char s_ltext[MAXL][LTXT];    // 300 x 32 = 9,6 KB
static int8_t s_lakt[6];            // Aktion je Eintrag der Uhr-eigenen Menüs
static int s_layout = LAYOUT_LED;
static int s_umkreis = 1000;      // Meter; das Handy führt den Wert, die Uhr zeigt und ändert ihn
#define T(led, klar) (s_layout == LAYOUT_KLAR ? (klar) : (led))   // Menütexte je Ansicht
static int s_lanz, s_lsel, s_loben;
static char s_ladetext[LTXT];
static AppTimer *s_ladetimer;
static bool s_lade_abgelaufen;
static int s_offen_aktion = -1, s_offen_wahl, s_offen_versuche;   // Senden wiederholen, falls Ausgang belegt
static AppTimer *s_sendetimer;

// ---------- Zeit: UTC -> Wiesbaden (MEZ/MESZ nach EU-Regel) ----------
static int32_t days_from_civil(int y, int m, int d) {     // Howard Hinnant, proleptisch gregorianisch
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const int yoe = y - era * 400;
  const int doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

static int year_from_days(int32_t z) {
  z += 719468;
  const int era = (z >= 0 ? z : z - 146096) / 146097;
  const int doe = z - era * 146097;
  const int yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const int doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const int mp = (5 * doy + 2) / 153;
  const int m = mp + (mp < 10 ? 3 : -9);
  return yoe + era * 400 + (m <= 2);
}

static time_t last_sunday_0100_utc(int y, int m) {          // letzter Sonntag im Monat, 01:00 UTC
  const int32_t last = days_from_civil(m == 12 ? y + 1 : y, m == 12 ? 1 : m + 1, 1) - 1;
  const int wd = (int)((last + 4) % 7);                    // 0 = Sonntag (1970-01-01 war Donnerstag)
  return (time_t)(last - wd) * 86400 + 3600;
}

static int berlin_offset(time_t utc) {
  const int y = year_from_days((int32_t)(utc / 86400));
  return (utc >= last_sunday_0100_utc(y, 3) && utc < last_sunday_0100_utc(y, 10)) ? 7200 : 3600;
}

static void berlin_hm(time_t utc, int *h, int *m) {
  const int s = (int)((utc + berlin_offset(utc)) % 86400);
  *h = s / 3600;
  *m = (s / 60) % 60;
}

static void berlin_datum(time_t utc, int *wtag, int *tag, int *monat) {   // wtag 0 = Sonntag
  const int32_t z0 = (int32_t)((utc + berlin_offset(utc)) / 86400);
  *wtag = (int)((z0 + 4) % 7);
  const int32_t z = z0 + 719468;
  const int era = (z >= 0 ? z : z - 146096) / 146097;
  const int doe = z - era * 146097;
  const int yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const int doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const int mp = (5 * doy + 2) / 153;
  *tag = doy - (153 * mp + 2) / 5 + 1;
  *monat = mp + (mp < 10 ? 3 : -9);
}

// ---------- Punktraster ----------
static void lit_set(int x, int y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  s_lit[y][x >> 3] |= 1 << (x & 7);
  if (s_dim_zeichnen) s_dimpx[y][x >> 3] |= 1 << (x & 7);
}

static bool dim_get(int x, int y) { return s_dim[y] || (s_dimpx[y][x >> 3] & (1 << (x & 7))); }

static bool lit_get(int x, int y) { return s_lit[y][x >> 3] & (1 << (x & 7)); }

static const Glyph *glyph(const Glyph *f, int n, char c) {
  for (int i = 0; i < n; i++) if (f[i].c == c) return &f[i];
  return NULL;
}

static int text_w(const Glyph *f, int n, const char *s, int sc) {
  int w = 0;
  for (; *s; s++) { const Glyph *g = glyph(f, n, *s); w += ((g ? g->w : 2) + 1) * sc; }
  return w > 0 ? w - sc : 0;
}

static void text(const Glyph *f, int n, int h, const char *s, int x, int y, int sc) {
  for (; *s; s++) {
    const Glyph *g = glyph(f, n, *s);
    if (!g) { x += 3 * sc; continue; }
    for (int gy = 0; gy < h; gy++)
      for (int gx = 0; gx < g->w; gx++)
        if (g->rows[gy] & (1 << (g->w - 1 - gx)))
          for (int sy = 0; sy < sc; sy++)
            for (int sx = 0; sx < sc; sx++) lit_set(x + gx * sc + sx, y + gy * sc + sy);
    x += (g->w + 1) * sc;
  }
}

// Kleine Schrift, nur ganze Zeichen bis einschließlich Spalte maxx (Listenzeilen, die nicht laufen)
static void klein_bis(const char *s, int x, int y, int maxx) {
  char eins[2] = { 0, 0 };
  for (; *s; s++) {
    const Glyph *g = glyph(F35, F35_N, *s);
    const int w = g ? g->w : 2;
    if (x + w - 1 > maxx) return;
    eins[0] = *s;
    text(F35, F35_N, F35_H, eins, x, y, 1);
    x += w + 1;
  }
}

// Listen: gewählte Zeile hell mit Pfeil links, übrige Zeilen gedimmt (Spalten 0-2 frei für den Pfeil)
static void zeilen_dimmen(int y0, int y1) { for (int y = y0; y <= y1; y++) if (y >= 0 && y < ROWS) s_dim[y] = 1; }

static void pfeil(int y) {
  for (int yy = y; yy < y + 5; yy++)
    for (int x = 0; x < 3; x++) s_lit[yy][0] &= ~(1 << x);   // Lauftext unter dem Pfeil löschen
  lit_set(0, y + 1); lit_set(0, y + 2); lit_set(0, y + 3); lit_set(1, y + 2);
}

#define GROSS(s, x, y, sc) text(F57, F57_N, F57_H, s, x, y, sc)
#define KLEIN(s, x, y)     text(F35, F35_N, F35_H, s, x, y, 1)
#define MITTE_GROSS(s, sc) ((COLS - text_w(F57, F57_N, s, sc)) / 2)
#define MITTE_KLEIN(s)     ((COLS - text_w(F35, F35_N, s, 1)) / 2)

static bool gross_moeglich(const char *l) {     // nur ein- und zweistellige Ziffern in 5x7
  const int n = strlen(l);
  if (n == 0 || n > 2) return false;
  for (int i = 0; i < n; i++) if (l[i] < '0' || l[i] > '9') return false;
  return true;
}

static int linie_w(const char *l) {
  return gross_moeglich(l) ? text_w(F57, F57_N, l, 1) : text_w(F35, F35_N, l, 1);
}

static void linie(const char *l, int x, int y) {
  if (gross_moeglich(l)) GROSS(l, x, y, 1);
  else KLEIN(l, x, y + 1);
}

// Indizes der nächsten zwei noch nicht abgefahrenen Busse einer Richtung.
static int naechste(const Strecke *s, int r, time_t now, int idx[2]) {
  int n = 0;
  for (int i = 0; i < MAXD && n < 2; i++)
    if (s->dep[r][i] != 0 && s->dep[r][i] >= now) idx[n++] = i;
  return n;
}

// Zeitspalte für die ganze Seite gleich, damit oben und unten bündig stehen.
static int steig_w(const char *st) { return st[0] ? 1 + text_w(F35, F35_N, st, 1) : 0; }   // klein hinter der Linie

static int zeitspalte(const Strecke *s, time_t now) {
  int lw = 5, idx[2];
  bool steig = false;
  for (int r = 0; r < 2; r++) {
    const int n = naechste(s, r, now, idx);
    for (int k = 0; k < n; k++) {
      const int w = linie_w(s->lin[r][idx[k]]) + steig_w(s->steig[r][idx[k]]);
      if (w > lw) lw = w;
      if (s->steig[r][idx[k]][0]) steig = true;
    }
  }
  const int x = 1 + lw + (steig ? 2 : 4);             // gedimmter Steig darf näher an die Zeit: kostet kaum Platz
  return x < 13 ? 13 : x;
}

static void richtung(const Strecke *s, int r, int y, time_t now, int xt) {
  int idx[2];
  const int n = naechste(s, r, now, idx);
  for (int k = 0; k < n; k++) {
    const int i = idx[k], yy = y + k * 9, v = s->del[r][i];
    int h, m;
    char zeit[32], rechts[16], vs[16];
    linie(s->lin[r][i], 1, yy);
    if (s->steig[r][i][0]) {                             // Steig klein und gedimmt hinter der Linie, damit "8 B" nicht als Linie 8B gelesen wird
      s_dim_zeichnen = true;
      KLEIN(s->steig[r][i], 1 + linie_w(s->lin[r][i]) + 1, yy + 2);
      s_dim_zeichnen = false;
    }
    if (v == AUSFALL) { KLEIN("FAELLT AUS", xt, yy + 2); continue; }
    berlin_hm(s->dep[r][i] - v * 60, &h, &m);          // vorne die Fahrplanzeit
    snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    GROSS(zeit, xt, yy, 1);
    const int min = (s->dep[r][i] - now) / 60;           // Restminuten mit Verspätung
    rechts[0] = '\0';
    if (min < 100) snprintf(rechts, sizeof(rechts), "%d'", min);
    bool rgross = true;
    int rand = rechts[0] ? COLS - 1 - text_w(F57, F57_N, rechts, 1) : COLS;   // linke Kante der Restminuten
    int x = xt + text_w(F57, F57_N, zeit, 1) + 2;        // hinter der Zeit: Verspätung hell, dann Fahrtdauer gedimmt
    if (rechts[0] && x + 1 > rand) {                     // breite Linie + Steig: schon die Zeit stößt an die Restminuten
      rgross = false;
      rand = COLS - 1 - text_w(F35, F35_N, rechts, 1);
      if (x + 1 > rand) { rechts[0] = '\0'; rand = COLS; }
    }
    if (v != 0) {
      snprintf(vs, sizeof(vs), "%+d'", v);
      const int vende = x + text_w(F35, F35_N, vs, 1);
      if (rechts[0] && rgross && vende + 3 > rand) {               // zu eng: Restminuten klein, passt auch das nicht, weglassen
        rgross = false;
        rand = COLS - 1 - text_w(F35, F35_N, rechts, 1);
        if (vende + 3 > rand) { rechts[0] = '\0'; rand = COLS; }
      } else if (rechts[0] && vende + 3 > rand) { rechts[0] = '\0'; rand = COLS; }
      KLEIN(vs, x, yy + 2);
      x = vende + 2;
    }
    if (s->dur[r][i] > 0) {                              // Fahrtdauer nur, wenn sie ohne Verdrängen passt
      char ds[8];
      snprintf(ds, sizeof(ds), "%d'", s->dur[r][i]);
      if (x + text_w(F35, F35_N, ds, 1) + 3 <= rand) {
        s_dim_zeichnen = true; KLEIN(ds, x, yy + 2); s_dim_zeichnen = false;
      }
    }
    if (rechts[0]) { if (rgross) GROSS(rechts, rand, yy, 1); else KLEIN(rechts, rand, yy + 2); }
  }
  if (n == 0) GROSS("--:--", 13, y, 1);
}

static bool zu_lang(const char *name) { return text_w(F35, F35_N, name, 1) > COLS - 2; }

// Haltestellenname: passt er, steht er mittig; sonst läuft er von rechts nach links durch (Lauftext).
static void kopf(const char *name, int y) {
  const int w = text_w(F35, F35_N, name, 1);
  if (w <= COLS - 2) { KLEIN(name, (COLS - w) / 2, y); return; }
  const int periode = w + LAUF_LUECKE;
  const int x = 1 - (s_lauf_off % periode);
  KLEIN(name, x, y);
  KLEIN(name, x + periode, y);
}

static bool zeile_zu_lang(const char *t) { return text_w(F35, F35_N, t, 1) > COLS - 4; }   // Text ab Spalte 3

// Uhrzeit rechts unten, links z. B. die Position in der Liste
static void fusszeile(const char *links) {
  int h, m;
  char buf[16];
  berlin_hm(time(NULL), &h, &m);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  KLEIN(links, 1, 70);
  KLEIN(buf, COLS - 1 - text_w(F35, F35_N, buf, 1), 70);
}

static void menue_fuellen(void) {
  char buf[32];
  klein_bis(s_ltitel, text_w(F35, F35_N, s_ltitel, 1) > COLS - 2 ? 1 : MITTE_KLEIN(s_ltitel), 1, COLS - 1);
  if (s_modus == M_LADE) {
    text(F35, F35_N, F35_H, "LADE", (COLS - text_w(F35, F35_N, "LADE", 2)) / 2, 26, 2);   // große Schrift hat keine Buchstaben
    KLEIN(s_ladetext, MITTE_KLEIN(s_ladetext), 42);
    fusszeile("");
    return;
  }
  for (int k = 0; k < LZEILEN && s_loben + k < s_lanz; k++) {
    const int i = s_loben + k, y = LZ_Y0 + k * LZ_H;
    const char *t = s_ltext[i][0] ? s_ltext[i] : "...";
    if (i != s_lsel) { klein_bis(t, 3, y, COLS - 2); zeilen_dimmen(y, y + 4); continue; }
    if (zeile_zu_lang(t)) {                            // nur die gewählte Zeile läuft
      const int periode = text_w(F35, F35_N, t, 1) + LAUF_LUECKE;
      const int x = 3 - (s_lauf_off % periode);
      KLEIN(t, x, y);
      KLEIN(t, x + periode, y);
    } else {
      KLEIN(t, 3, y);
    }
    pfeil(y);
  }
  if (s_lanz > LZEILEN) snprintf(buf, sizeof(buf), "%d/%d", s_lsel + 1, s_lanz);
  else buf[0] = '\0';
  fusszeile(buf);
}

static void raster_fuellen(void) {
  memset(s_lit, 0, sizeof(s_lit));
  memset(s_dim, 0, sizeof(s_dim));
  memset(s_dimpx, 0, sizeof(s_dimpx));
  if (s_modus != M_ANZEIGE) { menue_fuellen(); return; }
  const time_t now = time(NULL);
  int h, m;
  char buf[32];

  berlin_hm(now, &h, &m);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  GROSS(buf, MITTE_GROSS(buf, 2), 1, 2);                 // Zeilen 1-14

  int status = s_status_start;
  if (s_anzahl > 0) {
    const Strecke *s = &s_str[s_seite];
    const int xt = zeitspalte(s, now);
    kopf(s->name[0], 17);
    richtung(s, 0, 24, now, xt);                         // Zeilen 24-39
    kopf(s->name[1], 43);
    richtung(s, 1, 50, now, xt);                         // Zeilen 50-65
    status = s->status;
  } else if (s_anzahl == 0) {
    kopf("KEINE STRECKE", 17);
    kopf("SELECT LANG:", 43);
    kopf("NEUE FAHRT", 52);
  }

  // Statuszeile 70-74: Quelle und Stand links; rechts "WI" (Uhr nicht auf deutscher Zeit) und Seite
  if (s_anzahl == 0) status = ST_LEER;
  switch (status) {
    case ST_LADE:   snprintf(buf, sizeof(buf), "LADE"); break;
    case ST_NETZ:   snprintf(buf, sizeof(buf), "KEIN NETZ"); break;
    case ST_FEHLER: snprintf(buf, sizeof(buf), "FEHLER"); break;
    case ST_SOLL: case ST_LIVE: {
      int sh, sm;
      berlin_hm(s_str[s_seite].stand, &sh, &sm);
      const char *q = s_str[s_seite].quelle[0] ? s_str[s_seite].quelle : "STAND";
      snprintf(buf, sizeof(buf), "%s %02d:%02d", q, sh, sm);
      break;
    }
    default: buf[0] = '\0';
  }
  KLEIN(buf, 1, 70);
  char re[32] = "";
  const struct tm *lokal = localtime(&now);
  const bool fremd = lokal->tm_hour != h || lokal->tm_min != m;
  if (s_anzahl > 1) snprintf(re, sizeof(re), "%s%d/%d", fremd ? "WI" : "", s_seite + 1, s_anzahl);
  else if (fremd) snprintf(re, sizeof(re), "WI");
  KLEIN(re, COLS - 1 - text_w(F35, F35_N, re, 1), 70);
}

// ---------- Ansicht „Klar“: weiß, Systemschrift (Entwurf linie8-skin-klar-entwurf.svg) ----------
#define K_ROT    GColorFromHEX(0xAA0000)
#define K_ORANGE GColorFromHEX(0xFF5500)
#define K_GRAU   GColorFromHEX(0xAAAAAA)
#define K_DUNKEL GColorFromHEX(0x555555)
#define K_ZEILE  22        // Listen: Zeilenhöhe in px
#define K_Y0     28        // Listen: erste Zeile unter dem Titelbalken
static GFont s_f_uhr, s_f14, s_f14b, s_f18, s_f18b, s_f24b, s_f28b;

static void k_text(GContext *ctx, const char *t, GFont f, GRect r, GTextAlignment a, GColor c) {
  graphics_context_set_text_color(ctx, c);
  graphics_draw_text(ctx, t, f, r, GTextOverflowModeTrailingEllipsis, a, NULL);
}

static int k_breite(const char *t, GFont f) {
  return graphics_text_layout_get_content_size(t, f, GRect(0, 0, 1000, 40), GTextOverflowModeFill, GTextAlignmentLeft).w;
}

static void k_flaeche(GContext *ctx, GRect r, GColor c) {
  graphics_context_set_fill_color(ctx, c);
  graphics_fill_rect(ctx, r, 0, GCornerNone);
}

static bool k_zu_lang(const char *t) { return k_breite(t, s_f18b) > 188; }

// Fußbalken: links Text (optional mit farbigem Punkt), rechts optional die Uhrzeit
static void k_fuss(GContext *ctx, const char *links, bool punkt, GColor farbe, bool uhr) {
  k_flaeche(ctx, GRect(0, 210, 200, 18), GColorBlack);
  int x = 6;
  if (punkt) {
    graphics_context_set_fill_color(ctx, farbe);
    graphics_fill_circle(ctx, GPoint(11, 219), 3);
    x = 19;
  }
  k_text(ctx, links, s_f14, GRect(x, 209, 150, 18), GTextAlignmentLeft, GColorWhite);
  if (uhr) {
    char buf[8];
    int h, m;
    berlin_hm(time(NULL), &h, &m);
    snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
    k_text(ctx, buf, s_f14b, GRect(140, 209, 54, 18), GTextAlignmentRight, GColorWhite);
  }
}

static void k_richtung(GContext *ctx, const Strecke *s, int r, int y, time_t now) {
  k_text(ctx, "ab", s_f14, GRect(8, y, 20, 18), GTextAlignmentLeft, K_DUNKEL);
  k_text(ctx, s->klar[r][0] ? s->klar[r] : s->name[r], s_f18b, GRect(26, y - 4, 166, 24), GTextAlignmentLeft, GColorBlack);
  int idx[2];
  const int n = naechste(s, r, now, idx);
  for (int k = 0; k < 2; k++) {
    const int yy = y + 22 + k * 29;
    graphics_context_set_stroke_color(ctx, K_GRAU);
    graphics_draw_line(ctx, GPoint(8, yy), GPoint(192, yy));
    if (k >= n) {
      if (k == 0) k_text(ctx, "keine Fahrt", s_f18, GRect(8, yy + 2, 184, 24), GTextAlignmentLeft, K_DUNKEL);
      continue;
    }
    const int i = idx[k], v = s->del[r][i];
    const char *lin = s->lin[r][i];
    int bw = k_breite(lin, s_f18b) + 10;
    if (bw < 26) bw = 26;
    graphics_context_set_fill_color(ctx, K_ROT);
    graphics_fill_rect(ctx, GRect(8, yy + 5, bw, 20), 4, GCornersAll);
    k_text(ctx, lin, s_f18b, GRect(8, yy + 1, bw, 22), GTextAlignmentCenter, GColorWhite);
    char zeit[16], buf[16];
    int h, m;
    berlin_hm(s->dep[r][i] - (v == AUSFALL ? 0 : v * 60), &h, &m);   // vorne die Fahrplanzeit
    snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    const int xt = 8 + bw + 7;
    k_text(ctx, zeit, s_f28b, GRect(xt, yy - 5, 80, 34), GTextAlignmentLeft, v == AUSFALL ? K_GRAU : GColorBlack);
    if (v == AUSFALL) {
      k_text(ctx, "fällt aus", s_f18b, GRect(100, yy + 2, 92, 24), GTextAlignmentRight, K_ROT);
      continue;
    }
    const int xz = xt + k_breite(zeit, s_f28b) + 2;                 // rechts neben der Zeit: oben Verspätung, unten Steig + Fahrtdauer
    int oben = xz, unten = xz;                                       // rechte Kanten der beiden kleinen Zeilen
    if (v != 0) {
      snprintf(buf, sizeof(buf), "%+d'", v);
      k_text(ctx, buf, s_f14b, GRect(xz, yy - 1, 40, 18), GTextAlignmentLeft, K_ORANGE);
      oben = xz + k_breite(buf, s_f14b);
    }
    if (s->steig[r][i][0]) {
      int sw = k_breite(s->steig[r][i], s_f14b) + 6;
      if (sw < 13) sw = 13;
      graphics_context_set_fill_color(ctx, K_DUNKEL);
      graphics_fill_rect(ctx, GRect(xz, yy + 15, sw, 13), 2, GCornersAll);
      k_text(ctx, s->steig[r][i], s_f14b, GRect(xz, yy + 11, sw, 16), GTextAlignmentCenter, GColorWhite);
      unten = xz + sw + 4;
    }
    char ds[8] = "", rs[8] = "";
    if (s->dur[r][i] > 0) snprintf(ds, sizeof(ds), "%d'", s->dur[r][i]);
    const int min = (s->dep[r][i] - now) / 60;                       // Restminuten mit Verspätung
    if (min < 100) snprintf(rs, sizeof(rs), "%d'", min);
    GFont rf = s_f28b;
    int rand = rs[0] ? 192 - k_breite(rs, rf) : 200;
    const int dende = ds[0] ? unten + k_breite(ds, s_f14) : unten;
    if (ds[0] && (dende > oben ? dende : oben) + 6 > rand) ds[0] = '\0';   // zu eng: erst die Fahrtdauer weg ...
    const int links = (unten > oben ? unten : oben);
    if (rs[0] && links + 6 > rand) { rf = s_f18b; rand = 192 - k_breite(rs, rf); }   // ... dann Restminuten klein
    if (rs[0] && links + 6 > rand) rs[0] = '\0';
    if (ds[0]) k_text(ctx, ds, s_f14, GRect(unten, yy + 11, 40, 18), GTextAlignmentLeft, K_DUNKEL);
    if (rs[0]) {
      if (rf == s_f28b) k_text(ctx, rs, rf, GRect(100, yy - 5, 92, 34), GTextAlignmentRight, GColorBlack);
      else k_text(ctx, rs, rf, GRect(100, yy + 3, 92, 24), GTextAlignmentRight, GColorBlack);
    }
  }
}

static void k_anzeige(GContext *ctx) {
  const time_t now = time(NULL);
  char buf[48];
  int h, m;
  k_flaeche(ctx, GRect(0, 0, 200, 228), GColorWhite);
  k_flaeche(ctx, GRect(0, 0, 200, 40), GColorBlack);
  berlin_hm(now, &h, &m);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  k_text(ctx, buf, s_f_uhr, GRect(7, 1, 130, 40), GTextAlignmentLeft, GColorWhite);
  if (s_anzahl > 1) {
    snprintf(buf, sizeof(buf), "%d/%d", s_seite + 1, s_anzahl);
    k_text(ctx, buf, s_f14b, GRect(110, 1, 84, 18), GTextAlignmentRight, K_GRAU);
  }
  k_text(ctx, "Wiesbaden", s_f14, GRect(100, 18, 94, 18), GTextAlignmentRight, K_GRAU);

  int status = s_status_start;
  if (s_anzahl > 0) {
    const Strecke *s = &s_str[s_seite];
    k_richtung(ctx, s, 0, 44, now);
    k_richtung(ctx, s, 1, 126, now);
    status = s->status;
  } else if (s_anzahl == 0) {
    k_text(ctx, "Keine Strecke", s_f24b, GRect(0, 74, 200, 30), GTextAlignmentCenter, GColorBlack);
    graphics_context_set_text_color(ctx, K_DUNKEL);
    graphics_draw_text(ctx, "Select lang öffnet das Menü: Neue Fahrt", s_f18, GRect(16, 108, 168, 50),
                       GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
    status = ST_LEER;
  }

  GColor farbe = K_GRAU;
  switch (status) {
    case ST_LADE:   snprintf(buf, sizeof(buf), "Lade ..."); break;
    case ST_NETZ:   snprintf(buf, sizeof(buf), "Kein Netz"); farbe = GColorRed; break;
    case ST_FEHLER: snprintf(buf, sizeof(buf), "Fehler"); farbe = GColorRed; break;
    case ST_SOLL: case ST_LIVE: {
      const Strecke *s = &s_str[s_seite];
      const bool rmv = !strcmp(s->quelle, "RMV");
      int sh, sm;
      berlin_hm(s->stand, &sh, &sm);
      snprintf(buf, sizeof(buf), "%s %s · Stand %02d:%02d", rmv ? "RMV" : "Transitous",
               status == ST_LIVE ? "live" : "Fahrplan", sh, sm);
      farbe = status == ST_LIVE ? GColorFromHEX(0x55FF00) : GColorFromHEX(0xFFAA00);
      break;
    }
    default: buf[0] = '\0';
  }
  k_fuss(ctx, buf, buf[0] != '\0', farbe, false);
}

static void k_liste(GContext *ctx) {
  char buf[32];
  k_flaeche(ctx, GRect(0, 0, 200, 228), GColorWhite);
  k_flaeche(ctx, GRect(0, 0, 200, 26), GColorBlack);
  k_text(ctx, s_ltitel, s_f18b, GRect(6, -1, 188, 24), GTextAlignmentLeft, GColorWhite);
  if (s_modus == M_LADE) {
    k_text(ctx, "Lade ...", s_f28b, GRect(0, 70, 200, 34), GTextAlignmentCenter, GColorBlack);
    k_text(ctx, s_ladetext, s_f18, GRect(0, 108, 200, 24), GTextAlignmentCenter, K_DUNKEL);
    k_fuss(ctx, "", false, GColorBlack, true);
    return;
  }
  for (int k = 0; k < LZEILEN && s_loben + k < s_lanz; k++) {
    const int i = s_loben + k, y = K_Y0 + k * K_ZEILE;
    const char *t = s_ltext[i][0] ? s_ltext[i] : "...";
    if (i != s_lsel) {
      k_text(ctx, t, s_f18, GRect(6, y - 3, 188, 24), GTextAlignmentLeft, GColorBlack);
      graphics_context_set_stroke_color(ctx, K_GRAU);
      graphics_draw_line(ctx, GPoint(6, y + K_ZEILE - 1), GPoint(194, y + K_ZEILE - 1));
      continue;
    }
    k_flaeche(ctx, GRect(0, y, 200, K_ZEILE), GColorBlack);           // gewählte Zeile: schwarz, fett
    if (k_zu_lang(t)) {                                               // läuft durch, 3 px je Schritt
      const int w = k_breite(t, s_f18b), periode = w + 40, x = 6 - (s_lauf_off * 3) % periode;
      graphics_context_set_text_color(ctx, GColorWhite);
      graphics_draw_text(ctx, t, s_f18b, GRect(x, y - 3, w + 4, 24), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
      graphics_draw_text(ctx, t, s_f18b, GRect(x + periode, y - 3, w + 4, 24), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
    } else {
      k_text(ctx, t, s_f18b, GRect(6, y - 3, 188, 24), GTextAlignmentLeft, GColorWhite);
    }
  }
  if (s_lanz > LZEILEN) snprintf(buf, sizeof(buf), "%d/%d", s_lsel + 1, s_lanz);
  else buf[0] = '\0';
  k_fuss(ctx, buf, false, GColorBlack, true);
}

// ---------- Ansicht „Phosphor“: Radar-Grün auf Schwarz, Pixelschrift (Entwurf linie8-skin-phosphor-dauer.png) ----------
// Farben wie das Watchface Phosphor. Schrift: die LED-Glyphen, 2- bis 4-fach als Pixelblöcke gezeichnet.
#define P_TEXT   GColorFromHEX(0x55FF55)
#define P_GRAU   GColorFromHEX(0x00AA55)
#define P_GITTER GColorFromHEX(0x005500)
#define P_HELL   GColorFromHEX(0xAAFFAA)
#define P_CYAN   GColorFromHEX(0x00FFFF)
#define P_WARN   GColorFromHEX(0xFFFF00)
#define P_ZEILE  22        // Listen: Zeilenhöhe in px
#define P_Y0     26        // Listen: erste Zeile
#define P_W(s, sc)  text_w(F35, F35_N, s, sc)
#define P_GW(s, sc) text_w(F57, F57_N, s, sc)

// Pixeltext; Pixel rechts von maxx bzw. links von minx werden nicht gezeichnet (Lauftext, Spalten)
static void p_text(GContext *ctx, const Glyph *f, int n, int h, const char *s, int x, int y, int sc, GColor c, int minx, int maxx) {
  graphics_context_set_fill_color(ctx, c);
  for (; *s; s++) {
    const Glyph *g = glyph(f, n, *s);
    if (!g) { x += 3 * sc; continue; }
    for (int gy = 0; gy < h; gy++)
      for (int gx = 0; gx < g->w; gx++)
        if (g->rows[gy] & (1 << (g->w - 1 - gx))) {
          const int px = x + gx * sc;
          if (px >= minx && px + sc <= maxx) graphics_fill_rect(ctx, GRect(px, y + gy * sc, sc, sc), 0, GCornerNone);
        }
    x += (g->w + 1) * sc;
  }
}
#define P_KLEIN(s, x, y, c)        p_text(ctx, F35, F35_N, F35_H, s, x, y, 2, c, 0, 200)
#define P_GROSS(s, x, y, sc, c)    p_text(ctx, F57, F57_N, F57_H, s, x, y, sc, c, 0, 200)

static void p_punktlinie(GContext *ctx, int y) {
  graphics_context_set_fill_color(ctx, P_GITTER);
  for (int x = 0; x < 200; x += 2) graphics_fill_rect(ctx, GRect(x, y, 1, 1), 0, GCornerNone);
}

static bool p_zu_lang(const char *t) { return P_W(t, 2) > 188; }
#define P_NAME_X 30        // Haltestellenname hinter "AB"
static bool p_name_zu_lang(const char *t) { return P_W(t, 2) > 196 - P_NAME_X; }

// Name hinter "AB": passt er, steht er; sonst läuft er wie bei LED (2 px je Schritt)
static void p_name(GContext *ctx, const char *name, int y) {
  P_KLEIN("AB", 4, y, P_GRAU);
  const int w = P_W(name, 2);
  if (w <= 196 - P_NAME_X) { P_KLEIN(name, P_NAME_X, y, P_HELL); return; }
  const int periode = w + LAUF_LUECKE * 2, x = P_NAME_X - (s_lauf_off * 2) % periode;
  p_text(ctx, F35, F35_N, F35_H, name, x, y, 2, P_HELL, P_NAME_X, 196);
  p_text(ctx, F35, F35_N, F35_H, name, x + periode, y, 2, P_HELL, P_NAME_X, 196);
}

static void p_richtung(GContext *ctx, const Strecke *s, int r, int y, time_t now) {
  p_name(ctx, s->name[r], y);
  int idx[2];
  const int n = naechste(s, r, now, idx);
  if (n == 0) P_KLEIN("KEINE FAHRT", 4, y + 22, P_GRAU);
  for (int k = 0; k < n; k++) {
    const int i = idx[k], yy = y + 16 + k * 30, v = s->del[r][i];
    const bool ausfall = v == AUSFALL;
    const char *lin = s->lin[r][i];
    // Linie invers: grünes Kästchen, schwarze Schrift; Steig als dunkle Lasche dahinter
    const bool gross = gross_moeglich(lin);
    const int lw = (gross ? P_GW(lin, 2) : P_W(lin, 2)) + 8;
    graphics_context_set_fill_color(ctx, ausfall ? P_GRAU : P_TEXT);
    graphics_fill_rect(ctx, GRect(4, yy, lw, 21), 0, GCornerNone);
    if (gross) P_GROSS(lin, 8, yy + 4, 2, GColorBlack);
    else P_KLEIN(lin, 8, yy + 6, GColorBlack);
    int x = 4 + lw;
    if (s->steig[r][i][0]) {
      const int sw = P_W(s->steig[r][i], 2) + 6;
      graphics_context_set_fill_color(ctx, P_GITTER);
      graphics_fill_rect(ctx, GRect(x + 1, yy, sw, 21), 0, GCornerNone);
      P_KLEIN(s->steig[r][i], x + 4, yy + 6, P_HELL);
      x += 1 + sw;
    }
    x += 5;
    char zeit[8], buf[12], ds[8] = "", rs[8] = "";
    int h, m;
    berlin_hm(s->dep[r][i] - (ausfall ? 0 : v * 60), &h, &m);   // vorne die Fahrplanzeit
    snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    if (ausfall) {
      P_GROSS(zeit, x, yy, 3, P_GRAU);
      P_KLEIN("FAELLT AUS", 196 - P_W("FAELLT AUS", 2), yy + 6, P_WARN);
      continue;
    }
    P_GROSS(zeit, x, yy, 3, P_TEXT);
    const int xz = x + P_GW(zeit, 3) + 3;                          // Spalte: oben Verspätung, unten Fahrtdauer
    int oben = xz;
    if (v != 0) {
      snprintf(buf, sizeof(buf), "%+d'", v);
      P_KLEIN(buf, xz, yy, P_WARN);
      oben = xz + P_W(buf, 2);
    }
    if (s->dur[r][i] > 0) snprintf(ds, sizeof(ds), "%d'", s->dur[r][i]);
    const int min = (s->dep[r][i] - now) / 60;                     // Restminuten mit Verspätung
    if (min < 100) snprintf(rs, sizeof(rs), "%d'", min);
    int rsc = 3, rand = rs[0] ? 196 - P_GW(rs, 3) : 200;
    const int dende = ds[0] ? xz + P_W(ds, 2) : xz;
    if (ds[0] && (dende > oben ? dende : oben) + 4 > rand) ds[0] = '\0';   // zu eng: erst die Fahrtdauer weg ...
    if (rs[0] && oben + 4 > rand) { rsc = 2; rand = 196 - P_GW(rs, 2); }   // ... dann Restminuten klein ...
    if (rs[0] && oben + 4 > rand) rs[0] = '\0';                            // ... notfalls ohne
    if (ds[0]) P_KLEIN(ds, xz, yy + 11, P_GRAU);
    if (rs[0]) P_GROSS(rs, rand, rsc == 3 ? yy : yy + 7, rsc, P_TEXT);
  }
}

static void p_anzeige(GContext *ctx) {
  const time_t now = time(NULL);
  char buf[32], re[16] = "";
  int h, m, wt, tag, mon;
  k_flaeche(ctx, GRect(0, 0, 200, 228), GColorBlack);
  static const char *const WT[] = { "SO", "MO", "DI", "MI", "DO", "FR", "SA" };
  berlin_datum(now, &wt, &tag, &mon);
  snprintf(buf, sizeof(buf), "%s %02d.%02d.", WT[wt], tag, mon);
  P_KLEIN(buf, 4, 4, P_GRAU);
  berlin_hm(now, &h, &m);
  const struct tm *lokal = localtime(&now);
  const bool fremd = lokal->tm_hour != h || lokal->tm_min != m;
  if (s_anzahl > 1) snprintf(re, sizeof(re), "%s%d/%d", fremd ? "WI" : "", s_seite + 1, s_anzahl);
  else if (fremd) snprintf(re, sizeof(re), "WI");
  P_KLEIN(re, 196 - P_W(re, 2), 4, P_GRAU);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  P_GROSS(buf, 4, 18, 4, P_TEXT);

  // rechts neben der Uhrzeit: Punkt (cyan = Echtzeit, grün = Fahrplan, gelb = Fehler), Quelle, Stand
  int status = s_anzahl > 0 ? s_str[s_seite].status : s_status_start;
  if (s_anzahl == 0) status = ST_LEER;
  GColor punkt = P_GITTER;
  const char *z1 = "", *z2 = "";
  char stand[8] = "";
  switch (status) {
    case ST_LADE:   z1 = "LADE"; break;
    case ST_NETZ:   z1 = "KEIN"; z2 = "NETZ"; punkt = P_WARN; break;
    case ST_FEHLER: z1 = "FEHLER"; punkt = P_WARN; break;
    case ST_SOLL: case ST_LIVE: {
      const Strecke *s = &s_str[s_seite];
      int sh, sm;
      berlin_hm(s->stand, &sh, &sm);
      snprintf(stand, sizeof(stand), "%02d:%02d", sh, sm);
      z1 = s->quelle[0] ? s->quelle : "STAND";
      z2 = stand;
      punkt = status == ST_LIVE ? P_CYAN : P_GRAU;
      break;
    }
    default: break;
  }
  if (z1[0]) {
    graphics_context_set_fill_color(ctx, punkt);
    graphics_fill_rect(ctx, GRect(124, 21, 6, 6), 0, GCornerNone);
    P_KLEIN(z1, 134, 20, (status == ST_NETZ || status == ST_FEHLER) ? P_WARN : P_TEXT);
    P_KLEIN(z2, 134, 34, (status == ST_NETZ) ? P_WARN : P_GRAU);
  }
  p_punktlinie(ctx, 51);

  if (s_anzahl > 0) {
    const Strecke *s = &s_str[s_seite];
    p_richtung(ctx, s, 0, 60, now);
    p_punktlinie(ctx, 135);
    p_richtung(ctx, s, 1, 145, now);
    p_punktlinie(ctx, 220);
  } else if (s_anzahl == 0) {
    P_KLEIN("KEINE STRECKE", 100 - P_W("KEINE STRECKE", 2) / 2, 90, P_TEXT);
    P_KLEIN("SELECT LANG:", 100 - P_W("SELECT LANG:", 2) / 2, 120, P_GRAU);
    P_KLEIN("NEUE FAHRT", 100 - P_W("NEUE FAHRT", 2) / 2, 136, P_GRAU);
  }
}

static void p_liste(GContext *ctx) {
  char buf[32];
  int h, m;
  k_flaeche(ctx, GRect(0, 0, 200, 228), GColorBlack);
  p_text(ctx, F35, F35_N, F35_H, s_ltitel, 4, 6, 2, P_GRAU, 0, 196);
  p_punktlinie(ctx, 20);
  if (s_modus == M_LADE) {
    p_text(ctx, F35, F35_N, F35_H, "LADE", 100 - P_W("LADE", 4) / 2, 80, 4, P_TEXT, 0, 200);
    P_KLEIN(s_ladetext, 100 - P_W(s_ladetext, 2) / 2, 112, P_GRAU);
  } else {
    for (int k = 0; k < LZEILEN && s_loben + k < s_lanz; k++) {
      const int i = s_loben + k, y = P_Y0 + k * P_ZEILE;
      const char *t = s_ltext[i][0] ? s_ltext[i] : "...";
      if (i != s_lsel) { p_text(ctx, F35, F35_N, F35_H, t, 6, y + 6, 2, P_TEXT, 0, 194); continue; }
      graphics_context_set_fill_color(ctx, P_TEXT);                  // gewählte Zeile invers
      graphics_fill_rect(ctx, GRect(0, y + 1, 200, P_ZEILE - 2), 0, GCornerNone);
      if (p_zu_lang(t)) {                                            // läuft durch, 2 px je Schritt
        const int periode = P_W(t, 2) + 40, x = 6 - (s_lauf_off * 2) % periode;
        p_text(ctx, F35, F35_N, F35_H, t, x, y + 6, 2, GColorBlack, 4, 196);
        p_text(ctx, F35, F35_N, F35_H, t, x + periode, y + 6, 2, GColorBlack, 4, 196);
      } else {
        P_KLEIN(t, 6, y + 6, GColorBlack);
      }
    }
  }
  p_punktlinie(ctx, 207);
  buf[0] = '\0';
  if (s_modus == M_LISTE && s_lanz > LZEILEN) snprintf(buf, sizeof(buf), "%d/%d", s_lsel + 1, s_lanz);
  P_KLEIN(buf, 4, 213, P_GRAU);
  berlin_hm(time(NULL), &h, &m);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  P_KLEIN(buf, 196 - P_W(buf, 2), 213, P_GRAU);
}

static void zeichnen(Layer *layer, GContext *ctx) {
  if (s_layout == LAYOUT_KLAR) { if (s_modus == M_ANZEIGE) k_anzeige(ctx); else k_liste(ctx); return; }
  if (s_layout == LAYOUT_PHOSPHOR) { if (s_modus == M_ANZEIGE) p_anzeige(ctx); else p_liste(ctx); return; }
  const GRect b = layer_get_bounds(layer);
  const int ox = (b.size.w - COLS * PITCH) / 2 + 1;
  const int oy = (b.size.h - ROWS * PITCH) / 2 + 1;
  raster_fuellen();

  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, b, 0, GCornerNone);

  graphics_context_set_stroke_color(ctx, GColorFromHEX(0x550000));   // unbeleuchtete LED: 1 px
  for (int y = 0; y < ROWS; y++)
    for (int x = 0; x < COLS; x++)
      if (!lit_get(x, y)) graphics_draw_pixel(ctx, GPoint(ox + x * PITCH, oy + y * PITCH));

  for (int hell = 0; hell < 2; hell++) {                            // leuchtende LED: 2 x 2 px, gedimmt oder hell
    graphics_context_set_fill_color(ctx, GColorFromHEX(hell ? 0xFFAA00 : 0xAA5500));
    for (int y = 0; y < ROWS; y++)
      for (int x = 0; x < COLS; x++)
        if (lit_get(x, y) && dim_get(x, y) != hell)
          graphics_fill_rect(ctx, GRect(ox + x * PITCH, oy + y * PITCH, DOT, DOT), 0, GCornerNone);
  }
}

// ---------- Lauftext ----------
static bool lauf_noetig(void) {
  if (s_modus == M_LISTE)
    return s_lanz > 0 && (s_layout == LAYOUT_KLAR ? k_zu_lang(s_ltext[s_lsel]) :
                          s_layout == LAYOUT_PHOSPHOR ? p_zu_lang(s_ltext[s_lsel]) : zeile_zu_lang(s_ltext[s_lsel]));
  if (s_modus != M_ANZEIGE || s_anzahl <= 0 || s_layout == LAYOUT_KLAR) return false;
  const Strecke *s = &s_str[s_seite];
  if (s_layout == LAYOUT_PHOSPHOR) return p_name_zu_lang(s->name[0]) || p_name_zu_lang(s->name[1]);
  return zu_lang(s->name[0]) || zu_lang(s->name[1]);
}

static void lauf_cb(void *data) {
  s_lauf = NULL;
  if (!lauf_noetig() || s_lauf_rest < LAUF_MS) { s_lauf_off = 0; layer_mark_dirty(s_layer); return; }
  s_lauf_rest -= LAUF_MS;
  s_lauf_off++;
  layer_mark_dirty(s_layer);
  s_lauf = app_timer_register(LAUF_MS, lauf_cb, NULL);
}

static void lauf_starten(void) {
  s_lauf_rest = LAUF_DAUER_MS;
  if (!s_lauf && lauf_noetig()) s_lauf = app_timer_register(LAUF_MS, lauf_cb, NULL);
}

// ---------- Kommunikation ----------
static void anzeige_zeigen(void);
static bool menue_empfangen(DictionaryIterator *it);
static int *aktueller_status(void) {
  return s_anzahl > 0 ? &s_str[s_seite].status : &s_status_start;
}

static void timeout_cb(void *data) {
  s_timeout = NULL;
  int *st = aktueller_status();
  if (*st == ST_LADE) { *st = ST_NETZ; layer_mark_dirty(s_layer); }
}

static void warten_starten(void) {
  *aktueller_status() = ST_LADE;
  if (s_timeout) app_timer_cancel(s_timeout);
  s_timeout = app_timer_register(TIMEOUT_MS, timeout_cb, NULL);
  layer_mark_dirty(s_layer);
}

static void anfordern(void) {
  if (s_anzahl == 0) return;
  DictionaryIterator *it;
  if (app_message_outbox_begin(&it) == APP_MSG_OK) {
    dict_write_int32(it, MESSAGE_KEY_REQUEST, s_seite);
    app_message_outbox_send();
  }
  warten_starten();
}

static int begrenzen(int32_t v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : (int)v; }

static void text_kopieren(char *ziel, int len, Tuple *t) {
  if (!t) return;
  strncpy(ziel, t->value->cstring, len - 1);
  ziel[len - 1] = '\0';
}

// ---------- Uhr-Menü ----------
static void lade_stoppen(void) {
  if (s_ladetimer) { app_timer_cancel(s_ladetimer); s_ladetimer = NULL; }
}

static void lade_cb(void *data) {
  s_ladetimer = NULL;
  s_lade_abgelaufen = true;
  snprintf(s_ladetext, sizeof(s_ladetext), "KEINE ANTWORT");
  layer_mark_dirty(s_layer);
}

static void lade_zeigen(void) {
  s_modus = M_LADE;
  s_ladetext[0] = '\0';
  s_lade_abgelaufen = false;
  lade_stoppen();
  s_ladetimer = app_timer_register(LADE_MS, lade_cb, NULL);
  layer_mark_dirty(s_layer);
}

static void liste_beginnen(int art, const char *titel) {
  lade_stoppen();
  s_modus = M_LISTE;
  s_lart = art;
  s_lanz = s_lsel = s_loben = 0;
  strncpy(s_ltitel, titel, LTXT - 1);
  s_ltitel[LTXT - 1] = '\0';
  s_lauf_off = 0;
}

static void eintrag(const char *t, int aktion) {
  if (s_lanz >= (int)sizeof(s_lakt)) return;
  strncpy(s_ltext[s_lanz], t, LTXT - 1);
  s_ltext[s_lanz][LTXT - 1] = '\0';
  s_lakt[s_lanz++] = aktion;
}

static void anzeige_zeigen(void) {
  lade_stoppen();
  s_modus = M_ANZEIGE;
  s_lauf_off = 0;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static void menue_zeigen(void) {                       // Hauptmenü, kennt die Uhr selbst
  char buf[LTXT], nr[16] = "";
  if (s_anzahl > 1) snprintf(nr, sizeof(nr), " %d", s_seite + 1);
  liste_beginnen(L_MENUE, T("MENUE", "Menü"));
  if (s_anzahl < MAXS) eintrag(T("NEUE FAHRT", "Neue Fahrt"), A_NEU);
  if (s_anzahl > 0) {
    snprintf(buf, sizeof(buf), T("FAHRT%s AENDERN", "Fahrt%s ändern"), nr);  eintrag(buf, A_UNTERMENUE);
    snprintf(buf, sizeof(buf), T("FAHRT%s LOESCHEN", "Fahrt%s löschen"), nr); eintrag(buf, A_LOESCHEN);
  }
  eintrag(T("EINSTELLUNGEN", "Einstellungen"), A_EINST);
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static void aendern_zeigen(void) {                     // Fahrt ändern: Rückfahrt (vorausgewählt) oder Start
  char buf[LTXT];
  if (s_anzahl > 1) snprintf(buf, sizeof(buf), T("FAHRT %d AENDERN", "Fahrt %d ändern"), s_seite + 1);
  else snprintf(buf, sizeof(buf), T("FAHRT AENDERN", "Fahrt ändern"));
  liste_beginnen(L_AENDERN, buf);
  eintrag(T("RUECKFAHRT", "Rückfahrt"), A_AENDERN_RUECK);
  eintrag(T("START", "Start"), A_AENDERN_START);
  layer_mark_dirty(s_layer);
}

static void umkreis_text(char *buf, size_t n, const char *vor, int m) {   // "UMKREIS 1KM" / "Umkreis: 1 km"
  if (m >= 1000) snprintf(buf, n, T("%s%dKM", "%s%d km"), vor, m / 1000);
  else snprintf(buf, n, T("%s%dM", "%s%d m"), vor, m);
}

static void einstellungen_zeigen(void) {               // Menü > Einstellungen, kennt die Uhr selbst
  char buf[LTXT];
  liste_beginnen(L_EINST, T("EINSTELLUNGEN", "Einstellungen"));
  eintrag(s_layout == LAYOUT_KLAR ? "Ansicht: Klar" : s_layout == LAYOUT_PHOSPHOR ? "ANSICHT: PHOSPHOR" : "ANSICHT: LED", A_ANSICHT);
  umkreis_text(buf, sizeof(buf), T("UMKREIS ", "Umkreis: "), s_umkreis);
  eintrag(buf, A_UMK);
  layer_mark_dirty(s_layer);
}

static void umkreis_zeigen(void) {                     // Umkreis um den Start für die Rückfahrt, aktueller vorausgewählt
  char buf[LTXT];
  liste_beginnen(L_UMKREIS, T("UMKREIS UM START", "Umkreis um Start"));
  umkreis_text(buf, sizeof(buf), "", 500);  eintrag(buf, A_SET_U500);
  umkreis_text(buf, sizeof(buf), "", 1000); eintrag(buf, A_SET_U1000);
  umkreis_text(buf, sizeof(buf), "", 2000); eintrag(buf, A_SET_U2000);
  s_lsel = s_umkreis == 500 ? 0 : s_umkreis == 2000 ? 2 : 1;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static void ansicht_zeigen(void) {                     // Auswahl der Ansicht, die aktuelle vorausgewählt
  liste_beginnen(L_ANSICHT, T("ANSICHT", "Ansicht"));
  eintrag("LED", A_SET_LED);
  eintrag(T("KLAR", "Klar"), A_SET_KLAR);
  eintrag(T("PHOSPHOR", "Phosphor"), A_SET_PHOSPHOR);
  s_lsel = s_layout;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static bool aktion_schreiben(void) {
  DictionaryIterator *it;
  if (app_message_outbox_begin(&it) != APP_MSG_OK) return false;
  dict_write_int32(it, MESSAGE_KEY_AKTION, s_offen_aktion);
  dict_write_int32(it, MESSAGE_KEY_WAHL, s_offen_wahl);
  return app_message_outbox_send() == APP_MSG_OK;
}

static void sende_cb(void *data) {                     // Ausgang war belegt: bis zu 10-mal nachfassen
  s_sendetimer = NULL;
  if (s_offen_aktion < 0) return;
  if (aktion_schreiben() || ++s_offen_versuche >= 10) { s_offen_aktion = -1; return; }
  s_sendetimer = app_timer_register(200, sende_cb, NULL);
}

static void aktion_abschicken(int aktion, int wahl) {
  s_offen_aktion = aktion;
  s_offen_wahl = wahl;
  s_offen_versuche = 0;
  if (s_sendetimer) { app_timer_cancel(s_sendetimer); s_sendetimer = NULL; }
  if (aktion_schreiben()) s_offen_aktion = -1;
  else s_sendetimer = app_timer_register(200, sende_cb, NULL);
}

static void aktion_senden(int aktion, int wahl) {      // mit Antwort vom Handy: LADE zeigen
  aktion_abschicken(aktion, wahl);
  lade_zeigen();
}

static void layout_setzen(int v) {
  s_layout = (v == LAYOUT_KLAR || v == LAYOUT_PHOSPHOR) ? v : LAYOUT_LED;
  persist_write_int(PK_LAYOUT, s_layout);
}

static void umkreis_setzen(int m) {
  s_umkreis = (m == 500 || m == 2000) ? m : 1000;
  persist_write_int(PK_UMKREIS, s_umkreis);
}

static void umkreis_waehlen(int m) {                   // an der Uhr gewählt: merken, Handy Bescheid geben
  umkreis_setzen(m);
  aktion_abschicken(A_UMKREIS, s_umkreis);
  einstellungen_zeigen();
  s_lsel = 1;                                          // zurück auf dem Eintrag Umkreis
}

static void layout_waehlen(int v) {                    // an der Uhr umgeschaltet: merken, Handy Bescheid geben
  layout_setzen(v);
  aktion_abschicken(A_LAYOUT, s_layout);
  anzeige_zeigen();
}

// Listen und Fortschritt vom Handy. true = Nachricht gehörte zum Menü.
static bool menue_empfangen(DictionaryIterator *it) {
  Tuple *t;
  bool menue = false;
  if ((t = dict_find(it, MESSAGE_KEY_L_ANZAHL))) {
    menue = true;
    if (t->value->int32 < 0) menue_zeigen();             // Ablauf am Handy beendet: zurück ins Uhr-Menü
    else {
      Tuple *ti = dict_find(it, MESSAGE_KEY_L_TITEL);
      liste_beginnen(L_HANDY, ti ? ti->value->cstring : "");
      s_lanz = begrenzen(t->value->int32, 0, MAXL);
      for (int i = 0; i < s_lanz; i++) s_ltext[i][0] = '\0';
      lauf_starten();
    }
  }
  if ((t = dict_find(it, MESSAGE_KEY_L_AB))) {
    menue = true;
    const int ab = t->value->int32;
    if (s_modus == M_LISTE && s_lart == L_HANDY)
      for (int j = 0; j < LBLOCK; j++)
        if (ab + j >= 0 && ab + j < s_lanz) text_kopieren(s_ltext[ab + j], LTXT, dict_find(it, MESSAGE_KEY_L_TEXT + j));
    if (ab <= s_lsel && s_lsel < ab + LBLOCK) lauf_starten();
  }
  if ((t = dict_find(it, MESSAGE_KEY_L_LADE))) {
    menue = true;
    if (s_modus == M_LADE) {                             // Fortschritt: Zeitlimit neu
      text_kopieren(s_ladetext, LTXT, t);
      lade_stoppen();
      s_lade_abgelaufen = false;
      s_ladetimer = app_timer_register(LADE_MS, lade_cb, NULL);
    }
  }
  return menue;
}

static void liste_bewegen(int d) {
  if (s_lanz <= 0) return;
  s_lsel = (s_lsel + d + s_lanz) % s_lanz;             // am Ende wieder oben
  if (s_lsel < s_loben) s_loben = s_lsel;
  if (s_lsel >= s_loben + LZEILEN) s_loben = s_lsel - LZEILEN + 1;
  s_lauf_off = 0;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static void liste_waehlen(void) {
  if (s_lanz <= 0) return;
  if (s_lart == L_HANDY) {
    if (s_ltext[s_lsel][0]) aktion_senden(A_WAHL, s_lsel);   // noch nicht angekommen: nichts tun
    return;
  }
  const int a = s_lakt[s_lsel];
  if (a == A_UNTERMENUE) aendern_zeigen();
  else if (a == A_EINST) einstellungen_zeigen();
  else if (a == A_ANSICHT) ansicht_zeigen();
  else if (a == A_SET_LED) layout_waehlen(LAYOUT_LED);
  else if (a == A_SET_KLAR) layout_waehlen(LAYOUT_KLAR);
  else if (a == A_SET_PHOSPHOR) layout_waehlen(LAYOUT_PHOSPHOR);
  else if (a == A_UMK) umkreis_zeigen();
  else if (a == A_SET_U500) umkreis_waehlen(500);
  else if (a == A_SET_U1000) umkreis_waehlen(1000);
  else if (a == A_SET_U2000) umkreis_waehlen(2000);
  else aktion_senden(a, s_seite);                      // Löschen ohne Rückfrage: eine neue Fahrt ist schnell angelegt
}

static void zurueck(void) {
  switch (s_modus) {
    case M_ANZEIGE: window_stack_pop(true); break;     // App beenden
    case M_LISTE:
      if (s_lart == L_AENDERN || s_lart == L_EINST) menue_zeigen();
      else if (s_lart == L_ANSICHT || s_lart == L_UMKREIS) einstellungen_zeigen();
      else if (s_lart == L_MENUE) anzeige_zeigen();
      else aktion_senden(A_ZURUECK, 0);
      break;
    case M_LADE:
      if (s_lade_abgelaufen) menue_zeigen();           // Handy antwortet nicht: lokal zurück
      else aktion_senden(A_ZURUECK, 0);                // Handy bricht ab und zeigt die vorige Liste
      break;
  }
}

static void empfangen(DictionaryIterator *it, void *ctx) {
  if (menue_empfangen(it)) { layer_mark_dirty(s_layer); return; }
  Tuple *t = dict_find(it, MESSAGE_KEY_ANZAHL);
  if (t) {                                               // Einrichtung: Anzahl, Namen, aktive Seite
    s_anzahl = begrenzen(t->value->int32, 0, MAXS);
    for (int i = 0; i < MAXS; i++) {
      char a[NAMELEN], b[NAMELEN];
      strncpy(a, s_str[i].name[0], NAMELEN); strncpy(b, s_str[i].name[1], NAMELEN);
      if (i >= s_anzahl) s_str[i].name[0][0] = s_str[i].name[1][0] = '\0';
      text_kopieren(s_str[i].name[0], NAMELEN, dict_find(it, MESSAGE_KEY_NAME_A + i));
      text_kopieren(s_str[i].name[1], NAMELEN, dict_find(it, MESSAGE_KEY_NAME_B + i));
      if (i >= s_anzahl) s_str[i].klar[0][0] = s_str[i].klar[1][0] = '\0';
      text_kopieren(s_str[i].klar[0], NAMELEN, dict_find(it, MESSAGE_KEY_KLAR_A + i));
      text_kopieren(s_str[i].klar[1], NAMELEN, dict_find(it, MESSAGE_KEY_KLAR_B + i));
      if (strcmp(a, s_str[i].name[0]) || strcmp(b, s_str[i].name[1])) {   // Strecke neu, geändert oder aufgerückt
        memset(s_str[i].dep, 0, sizeof(s_str[i].dep));
        s_str[i].stand = 0;
        s_str[i].status = ST_LADE;
      }
    }
    t = dict_find(it, MESSAGE_KEY_SEITE);
    if (t) s_seite = begrenzen(t->value->int32, 0, s_anzahl > 0 ? s_anzahl - 1 : 0);
    if ((t = dict_find(it, MESSAGE_KEY_LAYOUT))) layout_setzen(t->value->int32);   // Handy führt die Einstellung
    if ((t = dict_find(it, MESSAGE_KEY_UMKREIS))) umkreis_setzen(t->value->int32);
    if (s_anzahl == 0 && s_timeout) { app_timer_cancel(s_timeout); s_timeout = NULL; }
    if (s_modus != M_ANZEIGE) {                          // Menü-Ablauf fertig (gespeichert, gelöscht)
      anzeige_zeigen();
      if (s_anzahl > 0 && s_str[s_seite].stand == 0) warten_starten();
    }
    if (s_anzahl > 0 && s_str[s_seite].stand == 0) s_str[s_seite].status = ST_LADE;
    s_lauf_off = 0;
    lauf_starten();
  } else if ((t = dict_find(it, MESSAGE_KEY_SEITE))) {   // Abfahrten einer Strecke
    const int i = begrenzen(t->value->int32, 0, MAXS - 1);
    Strecke *s = &s_str[i];
    for (int j = 0; j < MAXD; j++) {
      Tuple *x;
      if ((x = dict_find(it, MESSAGE_KEY_HIN + j))) s->dep[0][j] = x->value->int32;
      if ((x = dict_find(it, MESSAGE_KEY_RUECK + j))) s->dep[1][j] = x->value->int32;
      text_kopieren(s->lin[0][j], LINLEN, dict_find(it, MESSAGE_KEY_HIN_L + j));
      text_kopieren(s->lin[1][j], LINLEN, dict_find(it, MESSAGE_KEY_RUECK_L + j));
      if ((x = dict_find(it, MESSAGE_KEY_HIN_D + j))) s->del[0][j] = x->value->int32;
      if ((x = dict_find(it, MESSAGE_KEY_RUECK_D + j))) s->del[1][j] = x->value->int32;
      if ((x = dict_find(it, MESSAGE_KEY_HIN_F + j))) s->dur[0][j] = x->value->int32;
      if ((x = dict_find(it, MESSAGE_KEY_RUECK_F + j))) s->dur[1][j] = x->value->int32;
      text_kopieren(s->steig[0][j], STEIGLEN, dict_find(it, MESSAGE_KEY_HIN_S + j));
      text_kopieren(s->steig[1][j], STEIGLEN, dict_find(it, MESSAGE_KEY_RUECK_S + j));
    }
    if ((t = dict_find(it, MESSAGE_KEY_STAND))) s->stand = t->value->int32;
    text_kopieren(s->quelle, sizeof(s->quelle), dict_find(it, MESSAGE_KEY_QUELLE));
    if ((t = dict_find(it, MESSAGE_KEY_STATUS))) s->status = (int)t->value->int32;
    if (i == s_seite && s_timeout) { app_timer_cancel(s_timeout); s_timeout = NULL; }
  }
  layer_mark_dirty(s_layer);
}

static void blaettern(int d) {
  if (s_anzahl < 2) return;
  s_seite = (s_seite + d + s_anzahl) % s_anzahl;
  s_lauf_off = 0;
  lauf_starten();
  anfordern();
}

static void select_click(ClickRecognizerRef r, void *ctx) {
  if (s_modus == M_ANZEIGE) { lauf_starten(); anfordern(); }
  else if (s_modus == M_LISTE) liste_waehlen();
}
static void select_lang(ClickRecognizerRef r, void *ctx) { if (s_modus == M_ANZEIGE) menue_zeigen(); }
static void hoch_runter(ClickRecognizerRef r, int d) {
  if (s_modus == M_LISTE) liste_bewegen(d);            // in Listen mit Wiederholung beim Halten
  else if (s_modus == M_ANZEIGE && !click_recognizer_is_repeating(r)) blaettern(d);
}
static void up_click(ClickRecognizerRef r, void *ctx) { hoch_runter(r, -1); }
static void down_click(ClickRecognizerRef r, void *ctx) { hoch_runter(r, 1); }
static void back_click(ClickRecognizerRef r, void *ctx) { zurueck(); }
static void clicks(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click);
  window_long_click_subscribe(BUTTON_ID_SELECT, 500, select_lang, NULL);
  window_single_repeating_click_subscribe(BUTTON_ID_UP, 150, up_click);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, 150, down_click);
  window_single_click_subscribe(BUTTON_ID_BACK, back_click);
}
static void tick(struct tm *t, TimeUnits u) { layer_mark_dirty(s_layer); }

// ---------- Lebenszyklus ----------
static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, zeichnen);
  layer_add_child(root, s_layer);
  s_f_uhr = fonts_get_system_font(FONT_KEY_LECO_32_BOLD_NUMBERS);
  s_f14 = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  s_f14b = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  s_f18 = fonts_get_system_font(FONT_KEY_GOTHIC_18);
  s_f18b = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  s_f24b = fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
  s_f28b = fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
}

static void window_unload(Window *w) { layer_destroy(s_layer); }

static void init(void) {
  app_message_register_inbox_received(empfangen);
  // Einrichtung mit 8 Strecken und Namen in zwei Schreibweisen braucht mehr als 1 KB
  const uint32_t ein = app_message_inbox_size_maximum();
  app_message_open(ein < 2048 ? ein : 2048, 64);
  if (persist_exists(PK_LAYOUT)) {
    const int v = persist_read_int(PK_LAYOUT);
    s_layout = (v == LAYOUT_KLAR || v == LAYOUT_PHOSPHOR) ? v : LAYOUT_LED;
  }
  if (persist_exists(PK_UMKREIS)) umkreis_setzen(persist_read_int(PK_UMKREIS));

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_click_config_provider(s_window, clicks);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);

  tick_timer_service_subscribe(MINUTE_UNIT, tick);
  warten_starten();   // das Handy lädt beim Start von selbst ('ready'), hier nur auf Antwort warten
}

static void deinit(void) {
  if (s_lauf) app_timer_cancel(s_lauf);
  lade_stoppen();
  if (s_sendetimer) app_timer_cancel(s_sendetimer);
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
  return 0;
}

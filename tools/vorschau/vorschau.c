// Rendert das Display von main.c in eine Rohdatei (200x228 RGB) und prüft die Zeitumrechnung.
// Ansicht: LAYOUT=1 (Klar, ohne Text, Standard), 2 (Phosphor), 4 (Phosphor weiß); +8 invertiert, +16 hoher Kontrast. Fahrtdauer: DAUER="14,12,0", DAUERAUS=1 blendet sie aus.
// Abfahrtszeit: ABFAHRT=1 = aktuell (mit Verspätung), sonst Fahrplan. Seit 0.50 eine Richtung je Seite.
// Uhr-Menü: MODUS=menue|einst|liste|lade (einst: SEL0 = vorausgewählter Eintrag), dazu TITEL, EINTRAEGE="A|B|C", SEL (Index), LAUF (Lauftext-Versatz), LADETEXT
#define main pebble_main
#include "../../src/c/main.c"
#undef main
uint8_t FB[228][200][3];
time_t FAKE_NOW;
int main(int argc, char **argv) {
  // Sommerzeit-Grenzen 2026: 29.03. 01:00 UTC und 25.10. 01:00 UTC
  struct { time_t t; int off; } p[] = { {1774745999, 3600}, {1774746000, 7200}, {1792890000 - 1, 7200}, {1792890000, 3600},
                                         {1767225600, 3600}, {1782864000, 7200} };
  for (unsigned i = 0; i < sizeof p / sizeof *p; i++)
    printf("t=%ld offset=%d erwartet=%d %s\n", (long)p[i].t, berlin_offset(p[i].t), p[i].off, berlin_offset(p[i].t) == p[i].off ? "ok" : "FEHLER");
  // Aufruf: vorschau <jetzt> <status> <anzahl> <seite> <ab1..3> <frei frei frei> <datei> [linien 1..3] [frei frei frei] [nameA nameB]
  // nameB "" = Seite ohne Ziel (0.50), HIER=10 = Abfahrten hier (0.51); Endziele dann per ENDZIEL="EIGENHEIM|NERO TAL|" (Klar-Schreibweise gleich).
  puffer_anlegen();                             // wie init() auf der Uhr
  FAKE_NOW = atol(argv[1]);
  s_anzahl = atoi(argv[3]);
  s_seite = atoi(argv[4]);
  Strecke *s = &s_str[s_seite];
  s->status = atoi(argv[2]);
  s_status_start = atoi(argv[2]);
  s->stand = FAKE_NOW - 30;
  for (int i = 0; i < MAXD; i++) {
    s->dep[i] = atol(argv[5 + i]);
    strcpy(s->lin[i], argc > 12 + i ? argv[12 + i] : "8");
  }
  strcpy(s->quelle, getenv("QUELLE") ? getenv("QUELLE") : "RMV");
  if (getenv("STEIG")) {                       // STEIG="B,B,A": Steig je Abfahrt (leer = keiner)
    const char *p = getenv("STEIG");
    for (int i = 0; i < MAXD && p; i++) {
      const char *k = strchr(p, ',');
      const int n = k ? (int)(k - p) : (int)strlen(p);
      snprintf(s->steig[i], STEIGLEN, "%.*s", n, p);
      p = k ? k + 1 : NULL;
    }
  }
  if (getenv("ENDZIEL")) {                     // ENDZIEL="EIGENHEIM|NEROTAL|": Endziel je Abfahrt
    const char *p = getenv("ENDZIEL");
    for (int i = 0; i < MAXD && p; i++) {
      const char *k = strchr(p, '|');
      const int n = k ? (int)(k - p) : (int)strlen(p);
      snprintf(s->end[i], NAMELEN, "%.*s", n, p);
      snprintf(s->endk[i], NAMELEN, "%.*s", n, p);
      p = k ? k + 1 : NULL;
    }
  }
  if (getenv("VERSP")) {                       // VERSP="2,0,9999": Verspätung je Abfahrt
    char tmp[64]; strncpy(tmp, getenv("VERSP"), 63); tmp[63] = 0;
    char *tok = strtok(tmp, ",");
    for (int i = 0; i < MAXD && tok; i++, tok = strtok(NULL, ",")) s->del[i] = atoi(tok);
  }
  if (getenv("DAUER")) {                       // DAUER="14,12,0": Fahrtdauer je Abfahrt
    char tmp[64]; strncpy(tmp, getenv("DAUER"), 63); tmp[63] = 0;
    char *tok = strtok(tmp, ",");
    for (int i = 0; i < MAXD && tok; i++, tok = strtok(NULL, ",")) s->dur[i] = atoi(tok);
  }
  strcpy(s->name[0], argc > 18 ? argv[18] : "HAUPTBAHNHOF");
  strcpy(s->name[1], argc > 19 ? argv[19] : "LUISENPLATZ");
  if (getenv("HIER")) {                        // HIER=10: „Abfahrten hier“, erste von 10 Haltestellen (0.51)
    s_str[HIER] = *s; s_hier = true; s_hier_nr = 0; s_hier_n = atoi(getenv("HIER"));
  }
  layout_setzen(getenv("LAYOUT") ? atoi(getenv("LAYOUT")) : 2);   // seit 0.9.1 mit Farben: +8 invertiert, +16 hoher Kontrast, 4 Phosphor weiß
  if (getenv("ABFAHRT")) s_abfahrt = atoi(getenv("ABFAHRT"));   // 1 = aktuell (Zeit mit Verspätung)
  if (getenv("DAUERAUS")) s_dauer = false;                       // Fahrtdauer ausgeblendet
  const char *mod = getenv("MODUS");
  if (mod) {
    if (!strcmp(mod, "menue")) menue_zeigen();
    else if (!strcmp(mod, "einst")) einstellungen_zeigen(getenv("SEL0") ? atoi(getenv("SEL0")) : 0);
    else if (!strcmp(mod, "detail") || !strcmp(mod, "suche")) {}
    else {
      liste_beginnen(L_HANDY, getenv("TITEL") ? getenv("TITEL") : "");
      char tmp[4096]; strncpy(tmp, getenv("EINTRAEGE") ? getenv("EINTRAEGE") : "", sizeof tmp - 1); tmp[sizeof tmp - 1] = 0;
      for (char *tok = strtok(tmp, "|"); tok && s_lanz < MAXL; tok = strtok(NULL, "|")) strcpy(s_ltext[s_lanz++], tok);
      if (getenv("LEER")) for (int i = atoi(getenv("LEER")); i < s_lanz; i++) s_ltext[i][0] = 0;   // Blöcke noch unterwegs
      if (!strcmp(mod, "lade")) { lade_zeigen(); if (getenv("LADETEXT")) strcpy(s_ladetext, getenv("LADETEXT")); }
    }
    for (int i = 0; getenv("SEL") && i < atoi(getenv("SEL")); i++) liste_bewegen(1);
    if (getenv("LAUF")) s_lauf_off = atoi(getenv("LAUF"));
  }
  // 0.6.1 — Strecken: RUBRIK=1, ZIEL, VON (leer = ab Standort), ROUTE="min,dauer,umst,versp,flag;…" (Losgehen in min ab
  // jetzt), KETTE="8 > S1|4|…". Details: MODUS=detail, ZEILEN="art,min,text,zus,re;…" (min = Zeit ab jetzt, leer = keine),
  // DNR, DOBEN. Suche: MODUS=suche, SUCH, BUCHST, TREFFER="A|B|C". Name der Rubrik eingeblendet: RUBRIK_EIN=1.
  if (getenv("RUBRIK")) s_rubrik = atoi(getenv("RUBRIK"));
  if (s_rubrik == 1) {
    s_ranzahl = s_anzahl; s_rseite = s_seite;
    Route *r = &s_rt[s_rseite];
    snprintf(r->name, NAMELEN, "%s", getenv("ZIEL") ? getenv("ZIEL") : "KURHAUS");
    snprintf(r->klar, NAMELEN, "%s", r->name);
    snprintf(r->von, NAMELEN, "%s", getenv("VON") ? getenv("VON") : "");
    snprintf(r->vonk, NAMELEN, "%s", r->von);
    r->status = atoi(argv[2]); r->stand = FAKE_NOW - 30; strcpy(r->quelle, getenv("QUELLE") ? getenv("QUELLE") : "RMV");
    char tmp[256]; snprintf(tmp, sizeof tmp, "%s", getenv("ROUTE") ? getenv("ROUTE") : "");
    char *sp1, *sp2;
    for (char *v = strtok_r(tmp, ";", &sp1); v && r->n < MAXD; v = strtok_r(NULL, ";", &sp1)) {
      int f[5] = { 0 }, k = 0;
      for (char *x = strtok_r(v, ",", &sp2); x && k < 5; x = strtok_r(NULL, ",", &sp2)) f[k++] = atoi(x);
      r->los[r->n] = FAKE_NOW + f[0] * 60; r->an[r->n] = r->los[r->n] + f[1] * 60;
      r->um[r->n] = f[2]; r->del[r->n] = f[3]; r->flag[r->n] = f[4]; r->n++;
    }
    snprintf(tmp, sizeof tmp, "%s", getenv("KETTE") ? getenv("KETTE") : "");
    int k = 0;
    for (char *x = strtok_r(tmp, "|", &sp1); x && k < MAXD; x = strtok_r(NULL, "|", &sp1)) snprintf(r->kette[k++], NAMELEN, "%s", x);
  }
  if (mod && !strcmp(mod, "detail")) {
    s_modus = M_DETAIL; s_dn = 0; s_dnr = getenv("DNR") ? atoi(getenv("DNR")) : 0;
    static char tmp[2048]; snprintf(tmp, sizeof tmp, "%s", getenv("ZEILEN") ? getenv("ZEILEN") : "");
    char *sp1, *sp2;
    for (char *v = strtok_r(tmp, ";", &sp1); v && s_dn < DMAX; v = strtok_r(NULL, ";", &sp1)) {
      Zeile *z = &s_dz[s_dn++];
      char *f[5] = { "", "", "", "", "" }; int k = 0;
      for (char *x = v; k < 5; k++) { f[k] = x; char *c = strchr(x, ','); if (!c) { k++; break; } *c = 0; x = c + 1; }
      (void)sp2;
      z->art = atoi(f[0]); z->t = f[1][0] ? FAKE_NOW + atoi(f[1]) * 60 : 0;
      snprintf(z->text, DTXT, "%s", f[2]); snprintf(z->zus, DTXT, "%s", f[3]); snprintf(z->re, 4, "%s", f[4]);
    }
    bild_bauen();
    if (getenv("DOBEN")) s_doben = atoi(getenv("DOBEN")); else d_zum_jetzt();
  }
  if (mod && !strcmp(mod, "suche")) {
    s_modus = M_SUCHE;
    snprintf(s_ltitel, LTXT, "%s", getenv("TITEL") ? getenv("TITEL") : "ADRESSE, ORT");
    snprintf(s_such, sizeof s_such, "%s", getenv("SUCH") ? getenv("SUCH") : "");
    snprintf(s_treffer, sizeof s_treffer, "%s", getenv("TREFFER") ? getenv("TREFFER") : "");
    s_buchst = getenv("BUCHST") ? atoi(getenv("BUCHST")) : 0;
  }
  // 0.7.0 — Fahrtkarte: MODUS=karte KARTE=<datei> (aus tools/test/karte_test.js), VERLAUF=1 zeigt den Verlauf statt der Karte
  if (mod && !strcmp(mod, "karte")) {
    s_modus = M_DETAIL; s_fahrt = true; s_karte = !getenv("VERLAUF"); s_dn = 0;
    snprintf(s_ftitel, NAMELEN, "%s", "MAINZ HBF");
    FILE *kf = fopen(getenv("KARTE"), "r");
    char zl[300];
    while (kf && fgets(zl, sizeof zl, kf)) {
      zl[strcspn(zl, "\n")] = 0;
      char *eq = strchr(zl, '=');
      if (!eq) continue;
      *eq = 0;
      const char *k = zl, *v = eq + 1;
      #define KS(feld) else if (!strcmp(k, #feld)) snprintf(s_k->feld, sizeof s_k->feld, "%s", v)
      if (!strcmp(k, "phase")) s_k->phase = atoi(v);
      else if (!strcmp(k, "zeit")) s_k->zeit = atol(v);
      else if (!strcmp(k, "halte")) s_k->halte = atoi(v);
      else if (!strcmp(k, "rf")) s_k->rf = atoi(v);
      else if (!strcmp(k, "jetzt")) FAKE_NOW = atol(v);
      else if (!strcmp(k, "akt")) s_dakt = atoi(v);
      KS(kopf); KS(kopfr); KS(zeitl); KS(r1); KS(r2); KS(label); KS(name); KS(steig); KS(fuss);
      else if (k[0] == 'z' && k[1] >= '0' && k[1] <= '5') {
        const int i = k[1] - '0';
        char *teil[5] = { "", "", "", "", "0" }; int n = 0; char *x = (char *)v;
        while (n < 5) { teil[n++] = x; char *c = strchr(x, '|'); if (!c) break; *c = 0; x = c + 1; }
        snprintf(s_k->l[i], sizeof s_k->l[i], "%s", teil[0]); snprintf(s_k->w[i], sizeof s_k->w[i], "%s", teil[1]);
        snprintf(s_k->r[i], sizeof s_k->r[i], "%s", teil[2]); snprintf(s_k->s[i], sizeof s_k->s[i], "%s", teil[3]);
        s_k->f[i] = (uint8_t)atoi(teil[4]);
      }
    }
    if (kf) fclose(kf);
  }
  // 0.8.0 — Vorschlag FRUEHER DA: VTEXT="FRUEHER DA -12'|6 > S1 AN 10:34" (gilt für die gezeigte Seite).
  // Bestätigungsseite: MODUS=frage, FKOPF, FTEXT. Stand der Details: DSTAND=<min alt>.
  if (getenv("VTEXT")) { snprintf(s_vtext, LTXT, "%s", getenv("VTEXT")); s_vrub = s_rubrik; s_vseite = s_rubrik == 1 ? s_rseite : s_seite; }
  if (getenv("DSTAND")) s_dstand = FAKE_NOW - atoi(getenv("DSTAND")) * 60;
  if (mod && !strcmp(mod, "frage")) frage_zeigen(getenv("FKOPF") ? getenv("FKOPF") : "ABFAHRTEN", getenv("FTEXT") ? getenv("FTEXT") : "LOESCHEN: HAUPTBAHNHOF > LUISENPLATZ", A_LOESCHEN, 0);
  if (mod && !strcmp(mod, "menue")) menue_zeigen();     // erst hier: Vorschlag und Rubrik stehen fest
  if (getenv("RUBRIK_EIN")) s_rubrik_timer = (AppTimer *)1;
  zeichnen(NULL, NULL);
  FILE *f = fopen(argv[11], "wb"); fwrite(FB, 1, sizeof FB, f); fclose(f);
  return 0;
}

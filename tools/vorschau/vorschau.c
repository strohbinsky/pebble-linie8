// Rendert das Display von main.c in eine Rohdatei (200x228 RGB) und prüft die Zeitumrechnung.
// Ansicht: LAYOUT=0 (LED), 1 (Klar, ohne Text), 2 (Phosphor). Fahrtdauer: DAUER="14,12,0", DAUERAUS=1 blendet sie aus.
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
  if (getenv("LAYOUT")) s_layout = atoi(getenv("LAYOUT"));
  if (getenv("ABFAHRT")) s_abfahrt = atoi(getenv("ABFAHRT"));   // 1 = aktuell (Zeit mit Verspätung)
  if (getenv("DAUERAUS")) s_dauer = false;                       // Fahrtdauer ausgeblendet
  const char *mod = getenv("MODUS");
  if (mod) {
    if (!strcmp(mod, "menue")) menue_zeigen();
    else if (!strcmp(mod, "einst")) einstellungen_zeigen(getenv("SEL0") ? atoi(getenv("SEL0")) : 0);
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
  zeichnen(NULL, NULL);
  FILE *f = fopen(argv[11], "wb"); fwrite(FB, 1, sizeof FB, f); fclose(f);
  return 0;
}

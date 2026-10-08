// Rendert das Display von main.c in eine Rohdatei (200x228 RGB) und prüft die Zeitumrechnung.
// Ansicht: LAYOUT=0 (LED), 1 (Klar, ohne Text), 2 (Phosphor). Fahrtdauer: DAUER="14,12,0,13,0,0".
// Uhr-Menü: MODUS=menue|aendern|liste|lade, dazu TITEL, EINTRAEGE="A|B|C", SEL (Index), LAUF (Lauftext-Versatz), LADETEXT
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
  // Aufruf: vorschau <jetzt> <status> <anzahl> <seite> <hin1..3> <rück1..3> <datei> [linien hin1..3 rück1..3] [nameA nameB]
  FAKE_NOW = atol(argv[1]);
  s_anzahl = atoi(argv[3]);
  s_seite = atoi(argv[4]);
  Strecke *s = &s_str[s_seite];
  s->status = atoi(argv[2]);
  s_status_start = atoi(argv[2]);
  s->stand = FAKE_NOW - 30;
  for (int i = 0; i < MAXD; i++) {
    s->dep[0][i] = atol(argv[5 + i]); s->dep[1][i] = atol(argv[8 + i]);
    strcpy(s->lin[0][i], argc > 12 + i ? argv[12 + i] : "8");
    strcpy(s->lin[1][i], argc > 15 + i ? argv[15 + i] : "8");
  }
  strcpy(s->quelle, getenv("QUELLE") ? getenv("QUELLE") : "RMV");
  if (getenv("STEIG")) {                       // STEIG="B,B,A,C,,": Steig hin1..3, rück1..3 (leer = keiner)
    const char *p = getenv("STEIG");
    for (int i = 0; i < 6 && p; i++) {
      const char *k = strchr(p, ',');
      const int n = k ? (int)(k - p) : (int)strlen(p);
      snprintf(s->steig[i / 3][i % 3], STEIGLEN, "%.*s", n, p);
      p = k ? k + 1 : NULL;
    }
  }
  if (getenv("VERSP")) {                       // VERSP="2,0,0,12,9999,0": Verspätung hin1..3, rück1..3
    char tmp[64]; strncpy(tmp, getenv("VERSP"), 63); tmp[63] = 0;
    char *tok = strtok(tmp, ","); 
    for (int i = 0; i < 6 && tok; i++, tok = strtok(NULL, ",")) s->del[i / 3][i % 3] = atoi(tok);
  }
  if (getenv("DAUER")) {                       // DAUER="14,12,0,13,0,0": Fahrtdauer hin1..3, rück1..3
    char tmp[64]; strncpy(tmp, getenv("DAUER"), 63); tmp[63] = 0;
    char *tok = strtok(tmp, ",");
    for (int i = 0; i < 6 && tok; i++, tok = strtok(NULL, ",")) s->dur[i / 3][i % 3] = atoi(tok);
  }
  strcpy(s->name[0], argc > 18 ? argv[18] : "HAUPTBAHNHOF");
  strcpy(s->name[1], argc > 19 ? argv[19] : "LUISENPLATZ");
  if (getenv("LAYOUT")) s_layout = atoi(getenv("LAYOUT"));
  const char *mod = getenv("MODUS");
  if (mod) {
    if (!strcmp(mod, "menue")) menue_zeigen();
    else if (!strcmp(mod, "aendern")) aendern_zeigen();
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

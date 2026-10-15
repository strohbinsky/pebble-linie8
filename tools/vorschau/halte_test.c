// 0.15.0: Halte zählt die Uhr selbst — Zahl und nächster Halt der Karte, Balken im Verlauf, vorbei ab Abfahrt. Ohne SDK
// gegen den pebble.h-Nachbau übersetzt. Aufruf (im App-Ordner):
//   cc -w -I tools/vorschau -I src/c -o /tmp/halte_test tools/vorschau/halte_test.c && /tmp/halte_test
#define main pebble_main
#include "../../src/c/main.c"
#undef main
uint8_t FB[228][200][3];
time_t FAKE_NOW;
static int fehler;
static void pruefe(bool ok, const char *t) { printf("%s %s\n", ok ? "ok    " : "FEHLER", t); if (!ok) fehler++; }
static void zeile(int i, int art, int32_t t, const char *text) { s_dz[i].art = art; s_dz[i].t = t; snprintf(s_dz[i].text, DTXT, "%s", text); }

int main(void) {
  puffer_anlegen();
  const int32_t t = 1792130400;
  FAKE_NOW = t;
  s_fahrt = true;
  // Karte im Bus: vier Zwischenhalte und der Ausstieg; die nächsten drei mit Abfahrt und Namen
  s_k->phase = 4; s_k->halte = 5;
  strcpy(s_k->r2, "Rheinstr."); strcpy(s_k->name, "Kurhaus/Theater");
  s_k->ht[0] = t + 50; s_k->ht[1] = t + 120; s_k->ht[2] = t + 240;
  strcpy(s_k->hn[0], "Rheinstr."); strcpy(s_k->hn[1], "Wilhelmstr."); strcpy(s_k->hn[2], "Friedrichstr.");
  pruefe(karte_halte() == 5 && !strcmp(karte_r2(), "Rheinstr."), "vor dem ersten Halt: 5 Halte, nächster Rheinstr.");
  FAKE_NOW = t + 49;
  pruefe(karte_halte() == 5, "eine Sekunde vor der Abfahrt: noch 5");
  FAKE_NOW = t + 50;
  pruefe(karte_halte() == 4 && !strcmp(karte_r2(), "Wilhelmstr."), "ab der Abfahrt: 4 Halte, nächster Wilhelmstr.");
  FAKE_NOW = t + 121;
  pruefe(karte_halte() == 3 && !strcmp(karte_r2(), "Friedrichstr."), "zweiter vorbei: 3 Halte, nächster Friedrichstr.");
  char zahl[8]; const char *einheit; bool warn;
  karte_zahl(zahl, sizeof zahl, &einheit, &warn);
  pruefe(!strcmp(zahl, "3") && warn, "Karte zeigt die 3 groß");
  FAKE_NOW = t + 250;
  pruefe(karte_halte() == 2 && !strcmp(karte_r2(), "..."), "dritter vorbei, Namen aufgebraucht: ... (das Handy wird gefragt)");
  s_k->halte = 2; s_k->ht[0] = t + 300; s_k->ht[1] = s_k->ht[2] = 0;   // neue Antwort: ein Zwischenhalt, dann der Ausstieg
  strcpy(s_k->hn[0], "Luisenplatz"); s_k->hn[1][0] = s_k->hn[2][0] = 0; strcpy(s_k->r2, "Luisenplatz");
  pruefe(karte_halte() == 2 && !strcmp(karte_r2(), "Luisenplatz"), "neue Antwort gilt sofort");
  FAKE_NOW = t + 301;
  pruefe(karte_halte() == 1 && !strcmp(karte_r2(), "Kurhaus/Theater"), "letzter Zwischenhalt vorbei: nur noch der Ausstieg");
  s_k->halte = 0; memset(s_k->ht, 0, sizeof s_k->ht);
  karte_zahl(zahl, sizeof zahl, &einheit, &warn);
  pruefe(!warn, "ohne Halte-Angabe: Minuten wie bisher");

  // Verlauf: Start, Fahrt, drei Zwischenhalte (einer ohne Zeit = "+ 2 weitere"), Halt (Umstieg), Umstieg, Halt, Fahrt, Ziel
  FAKE_NOW = t;
  zeile(0, Z_START, t - 120, "Hauptbahnhof");
  zeile(1, Z_FAHRT, 0, "8 > Eigenheim");
  zeile(2, Z_ZWISCHEN, t + 50, "Rheinstr.");
  zeile(3, Z_ZWISCHEN, t + 120, "Wilhelmstr.");
  zeile(4, Z_ZWISCHEN, 0, "+ 2 weitere");
  zeile(5, Z_HALT, t + 600, "Kurhaus/Theater");
  zeile(6, Z_UMSTIEG, 0, "Umstieg 4'");
  zeile(7, Z_HALT, t + 840, "Kurhaus/Theater");
  zeile(8, Z_FAHRT, 0, "1 > Nerotal");
  zeile(9, Z_ZIEL, t + 1200, "Nerotal");
  s_dn = 10; s_dakt = 2;
  pruefe(!d_akt_nachziehen(t + 10) && s_dakt == 2, "Balken bleibt vor der Abfahrt");
  pruefe(d_akt_nachziehen(t + 50) && s_dakt == 3, "ab der Abfahrt: Balken auf dem nächsten Halt");
  pruefe(d_akt_nachziehen(t + 130) && s_dakt == 5, "über „+ 2 weitere“ (ohne Zeit) hinweg zum Ausstieg");
  pruefe(!d_akt_nachziehen(t + 700) && s_dakt == 5, "Ausstieg: Balken bleibt (Umstieg rechnet das Handy)");
  s_dakt = 2;
  pruefe(d_akt_nachziehen(t + 200) && s_dakt == 5, "mehrere auf einmal vorbei: gleich zum Ausstieg");
  pruefe(zeile_vorbei(2, t + 50) && !zeile_vorbei(2, t + 49), "Zeile vorbei ab ihrer Zeit, nicht erst 30 s danach");
  s_fahrt = false; s_dakt = 2;
  pruefe(!d_akt_nachziehen(t + 200) && s_dakt == 2, "nur in der aktiven Fahrt");
  printf(fehler ? "%d Fehler\n" : "alles grün\n", fehler);
  return fehler ? 1 : 0;
}

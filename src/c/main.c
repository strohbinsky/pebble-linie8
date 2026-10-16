// Linie 8 — Uhr-Teil. Ansichten Klar und Papier (Systemschrift) sowie Phosphor grün und weiß (Pixelschrift).
// Die LED-Haltestellenanzeige (66 x 76 Punkte) gab es bis 0.11.0; seit 0.12.0 entfernt, schlecht lesbar (Seb 2026-10-13).
// Bis zu 8 Seiten, eingerichtet am Handy oder im Uhr-Menü. Seit 0.50 ist eine Seite eine Richtung: Haltestelle, klein
// darunter das Ziel und drei Abfahrten; ohne Ziel alle Abfahrten der Haltestelle mit Endziel. Die Rückfahrt ist eine
// eigene Seite (Menü > Rückfahrt). Beim Öffnen springt die App auf die Seite mit dem nächsten Start. Seit 0.51
// Menü > Abfahrten hier: nächste Haltestelle ohne gespeicherte Seite, hoch/runter = nächstnähere. Alle Zeiten kommen als
// Unix-Sekunden (UTC); Anzeige immer in deutscher Zeit, unabhängig von der Zeitzone der Uhr.
// Hoch/Runter = Seite wechseln, Select = neu laden, Select lang = Menü, Zurück = beenden.
// Ansichten: „Klar“ (Standard seit 0.12.0, Systemschrift, 0.31) und „Phosphor“ (Radar-Grün,
// Pixelschrift wie das Watchface Phosphor, 0.34), umschaltbar am Handy (Einstellungsseite) oder an der Uhr
// (Menü > Einstellungen > Ansicht). Seit 0.34 je Abfahrt die Fahrtdauer zum Ziel; Minuten überall mit Strich (13').
// Seit 0.35 einstellbar: Abfahrtszeit Fahrplan (Standard, Verspätung als +2') oder aktuell (Zeit mit Verspätung,
// in Klar/Phosphor farbig), Fahrtdauer an (Standard) oder aus, Quelle Auto / nur RMV / nur Transitous.
// Uhr-Menü (Version 0.30): Hauptmenü und Einstellungen kennt die Uhr selbst; alle weiteren Listen
// (Haltestellen, Linien, Ziele, Rückfahrt) rechnet das Handy und schickt sie in Blöcken zu 10.
//
// Seit 0.6.1 zwei Rubriken: HALTESTELLEN (die Seiten von bisher) und STRECKEN (von hier oder einem festen Ort zu einem
// Ziel, mit Umstieg und Fußwegen). Hoch/Runter lang wechselt die Rubrik, ihr Name steht 1 s groß im Bild.
// Select öffnet die Details der ersten Abfahrt bzw. Verbindung (Zeitachse von oben nach unten), Select dort: die
// nächste, Zurück: wieder die Seite; Zurück auf der Seite: Watchface. Seite und Details laden sich jede Minute neu,
// bis 5 min nach dem letzten Tastendruck. Touch: Wischen wie Hoch/Runter, Tippen wie Select (auf eine Abfahrt: deren
// Details). Suchen an der Uhr: Buchstabenrad A-Z oder Diktat.
//
// 0.8.0 (mit Seb 2026-10-10 festgelegt): Rubrik HALTESTELLEN heißt ABFAHRTEN. Zurück geht eine Ebene nach oben, aus
// dem Menü dorthin, wo es geöffnet wurde (auch in die Fahrt); in der Fahrt Verlauf -> Karte -> App verlassen.
// Select lang = Menü dessen, was man sieht (Seite, Sofort-Ansicht, Fahrt); das Untermenü der Seite ist aufgelöst.
// Löschen, Ersetzen und Fahrt beenden gehen über eine Bestätigungsseite: nur die obere Taste bestätigt. Uhrzeit überall
// oben rechts, Stand im Fuß (ab 2 min gelb bzw. hell). Tippen tut in Details, Fahrt und Bestätigung nichts.
//
// 0.13.0 (Seb 2026-10-13): nur noch zwei Ansichten, Papier (Standard) und Phosphor weiß; Klar und Phosphor grün entfallen.
// Lauftext an einer Stelle (lauf_k / lauf_p): jeder Text, der nicht in seinen Platz passt, läuft durch — Seite, Details,
// Fahrt, Karte, Kopf, gewählte Listenzeile. In der Fahrt steht ein Balken auf dem nächsten Halt (wie die Auswahl im Menü),
// Strecken zeigen ihre Zwischenhalte. Menü der Seite: WEITERE FAHRTEN — frühere und spätere Abfahrten bzw. Verbindungen
// als Liste, Select öffnet deren Details wie auf der Seite.
//
// 0.15.0 (Seb 2026-10-15): STARTSEITE (Schalter, Standard aus) — beim Öffnen die nächste Haltestelle wie ABFAHRTEN HIER,
// Hoch = Abfahrten, Runter = Strecken, Zurück auf einer Seite = Startseite. EINSTELLUNGEN nach Rubriken, jede Einstellung
// zweizeilig mit Werteliste; AKTUALISIEREN: regelmäßig, nach Abfahrt (sofort neu laden, sobald die oberste weg ist),
// ohne Taste (ersetzt APP SCHLIESSEN und die feste Ladepause). In der Fahrt zählt die Uhr die Halte selbst weiter,
// vorbei ab ihrer Abfahrt. Ansicht Signal entfernt, Zeiten als int32_t (keine 64-Bit-Division mehr).
//
// 0.17.0 (Seb 2026-10-16): Cartoon zeigt das Verkehrsmittel (Bus auf der Straße, Tram und Zug auf dem Gleis, vom Handy
// in AB_H Bit 2–3), Straße und Gleis bis zum Rand, die Haltestelle davor; Cartoon zeichnet alle 5 s neu.
// Gleichlauf: die Front berührt den Mast genau, wenn die Uhr auf die Abfahrtsminute springt (Minutentakt zeichnet neu).
// STARTSEITE und Ansicht Cartoon jetzt Standard.
// 0.16.0 (Seb 2026-10-16): Einstellungen „wählen und bleiben“ — jede Einstellung öffnet ihre Werteliste, Select übernimmt
// sofort, die Liste bleibt offen (schon in der neuen Ansicht), ein Kreis rechts zeigt den aktuellen Wert. HEIMATHALTESTELLE
// aus dem Menü einer Haltestelle: Abfahrten, die später dort halten, tragen ein volles Haus, die in ihrem Umkreis ein
// leeres. Dritte Ansicht Cartoon (Entwurf linie8-einfahrt-entwurf.png): je Abfahrt eine Straße, der Bus fährt ein.
#include <pebble.h>
#include "led_font.h"

#define MAXD  3            // muss zu AB[3] in package.json passen
#define MAXS  8            // muss zu NAME_A[8] / NAME_B[8] passen
#define NAMELEN 32
#define LINLEN  6
#define STEIGLEN 4
#define TIMEOUT_MS 20000
#define AUSFALL 9999       // Verspätungswert vom Handy für eine ausgefallene Fahrt
#define LAUF_MS 120        // Lauftext: ein Schritt je 120 ms
#define LAUF_DAUER_MS 60000 // nach 1 min ohne Tastendruck anhalten (Akku), Textanfang bleibt stehen
#define LAUF_LUECKE 32     // Abstand zwischen Ende und neuem Anfang, in Punkten
#define LAUF_PX 3          // Punkte je Schritt, für beide Ansichten gleich (0.13.0)
#define LAUF_PAUSE 8       // so viele Schritte (1 s) steht der Anfang, bevor er losläuft
#define MAXL  300          // Listeneinträge vom Handy (Ziele am Hbf mit allen Linien), muss zu MAXL in index.js passen
#define LTXT  48           // Zeichen je Listeneintrag; vom Handy kommen höchstens 31, Einstellungen "NAME|Wert" (0.15.0, bis 0.14.0 32)
#define VTXT  64           // Vorschlag FRUEHER DA "vorn|hinten" (0.12.0; bis 0.11.0 LTXT, die Ankunft wurde abgeschnitten)
#define VORSCHLAG MAXD     // DETAIL-Nummer des Vorschlags FRUEHER DA (0.8.0)
#define LISTE (MAXD + 1)   // DETAIL-Nummer einer Fahrt aus WEITERE FAHRTEN (0.13.0), wie LISTE in index.js
#define ALT_S 120          // Stand älter als 2 min: gelb bzw. hell (0.8.0)
#define LBLOCK 10          // muss zu L_TEXT[10] passen
#define LZEILEN 8          // sichtbare Listenzeilen
#define LADE_MS 30000      // ohne Antwort vom Handy: "KEINE ANTWORT"
#define PK_LAYOUT 1        // persist-Schlüssel: Ansicht, damit sie schon vor der Antwort des Handys stimmt
#define PK_UMKREIS 2       // persist-Schlüssel: Umkreis um den Start für die Rückfahrt-Suche (Meter)
#define PK_QUELLE 3        // persist-Schlüssel: Quelle der Abfahrten (QUELLE_AUTO/RMV/TRANS), seit 0.35
#define PK_ABFAHRT 4       // persist-Schlüssel: Abfahrtszeit Fahrplan (0) oder aktuell mit Verspätung (1), seit 0.35
#define PK_DAUER 5         // persist-Schlüssel: Fahrtdauer zeigen (1) oder nicht (0), seit 0.35
#define PK_RUBRIK 6        // persist: zuletzt genutzte Rubrik (0 Haltestellen, 1 Strecken), seit 0.6.1
#define PK_UMSTIEGE 7      // persist: Strecken mit höchstens so vielen Umstiegen (9 = beliebig)
#define PK_FUSSWEG 8       // persist: Fußweg am Anfang und Ende höchstens (min)
#define PK_UMSTZEIT 9      // persist: Umstiegszeit mindestens (min)
#define PK_AKTU 10         // persist: Startseite und Aktualisieren (AKTU, 0.15.0)
#define DMAX 40            // Detailzeilen, muss zu DMAX in index.js passen (0.13.0: 24 -> 40, Strecken mit Zwischenhalten)
#define DBLOCK 8           // muss zu D_ART[8] in package.json passen
#define DTXT 48            // Zeichen je Detailtext (Handy kürzt auf 47 Bytes; bis 0.12.0 28, lange Halte kamen gekürzt an)
#define LANG_MS 500        // Hoch/Runter so lange halten: Rubrik wechseln (Seite) bzw. schnell blättern (Listen)
#define RUBRIK_MS 1000     // Name der Rubrik so lange groß einblenden

enum { ST_LEER = -2, ST_LADE = -1, ST_SOLL = 0, ST_LIVE = 1, ST_NETZ = 2, ST_FEHLER = 3, ST_STANDORT = 4 };
enum { M_ANZEIGE, M_LISTE, M_LADE, M_DETAIL, M_SUCHE, M_FRAGE };   // was die Uhr gerade zeigt (M_FRAGE: Bestätigung, 0.8.0)
// Woher die Liste stammt. Seit 0.15.0 EINSTELLUNGEN nach Rubriken: L_ANZEIGE bis L_DATEN zeigen je Einstellung zwei
// Zeilen (Name, Wert), L_WERTE die Werteliste einer Einstellung, L_ZAHL die eigene Angabe (1–60 min)
enum { L_HANDY, L_MENUE, L_EINST, L_DMENUE, L_ANZEIGE, L_AKTU, L_EABF, L_ESTR, L_SUCHE, L_DATEN, L_WERTE, L_ZAHL, L_HEIM };
enum { QUELLE_AUTO = 0, QUELLE_RMV = 1, QUELLE_TRANS = 2 };                     // wie QUELLEN in index.js
enum { ABF_PLAN = 0, ABF_AKTUELL = 1 };                                          // Abfahrtszeit: Fahrplan oder mit Verspätung
// Einstellungen (0.15.0), Reihenfolge wie in den Rubriken; Tabelle EINST bei den Menüs
enum { S_STARTSEITE, S_ANSICHT, S_INVERS, S_KONTRAST, S_ABFAHRT, S_DAUER, S_REGEL, S_NACHAB, S_OHNE,
       S_UMKREIS, S_UMSTIEGE, S_FUSSWEG, S_UMSTZEIT, S_QUELLE, S_N };
// Zwei Ansichten seit 0.13.0. LAYOUT vom Handy: 5 Papier, 4 Phosphor weiß; alte Werte 0-3 (LED, Klar, Phosphor grün,
// LED invers) werden beim Lesen umgesetzt: Phosphor grün -> Phosphor weiß, alles andere -> Papier.
// Die dritte Ansicht Signal (LAYOUT 6, 0.14.0) ist seit 0.15.0 wieder entfernt (Seb 2026-10-15: noch Fehler, Platz für
// Cartoon); gespeichertes Signal wird Papier. Code: dateien/signal-0.14.0-main.c, Zweig signal im Git-Repo.
// 0.16.0: dritte Ansicht Cartoon (LAYOUT 7, Seb 2026-10-15/16), Farben und Schrift Fredoka wie Water im Timer.
enum { LAYOUT_PAPIER = 1, LAYOUT_PHOSPHOR = 2, LAYOUT_CARTOON = 3 };
#define KLAR_ART (s_layout != LAYOUT_PHOSPHOR)   // Papier und Cartoon: Systemschrift bzw. Fredoka, Umlaute
#define CARTOON (s_layout == LAYOUT_CARTOON)
#define C_NAVY    GColorFromHEX(0x000055)        // Cartoon: Schrift
#define C_HIMMEL  GColorFromHEX(0xAAFFFF)        // Grund
#define C_ROSA    GColorFromHEX(0xFF55AA)        // Auswahl, Kopf, Linienschild
#define C_ORANGE  GColorFromHEX(0xFF5500)        // Verspätung, Ausfall
#define C_STRASSE GColorFromHEX(0x555555)
#define C_HELL    GColorFromHEX(0xAAAAAA)        // Straßenrand, ausgefallene Bahn
// LAYOUT (Nachricht, Speicher) seit 0.9.1: Grundansicht (0 LED, 1 Klar, 2 Phosphor grün, 4 Phosphor weiß, 5 Papier,
// 6 Signal; 3 = LED invers bis 0.9.0) + 8 invertiert + 16 hoher Kontrast; + 32 App schließen nur bis 0.14.0
#define LW_INVERS 8
#define LW_KONTRAST 16
#define LW_SCHLIESSEN 32   // bis 0.14.0 App nach 10 s schließen, seit 0.15.0 OHNE TASTE (s_ohne); nur noch beim Umstieg gelesen
#define LW_SCHALTER (LW_INVERS | LW_KONTRAST)
enum { A_NEU = 1, A_RUECKFAHRT = 2, A_AENDERN = 3, A_LOESCHEN = 4,       // AKTION an das Handy, wie in index.js
       A_WAHL = 5, A_ZURUECK = 6, A_LAYOUT = 7, A_UMKREIS = 8, A_QUELLE = 9, A_ABFAHRT = 10, A_DAUER = 11,
       A_HIER = 13,
       A_R_NEU = 20, A_R_LOESCHEN = 21, A_R_RUECK = 22, A_SOFORT = 23, A_SOFORT_NR = 24, A_FAVORITEN = 25,
       A_TIPP = 26, A_SUCHTEXT = 27, A_UMSTIEGE = 28, A_FUSSWEG = 29, A_UMSTZEIT = 30,
       A_FAHRT_START = 31, A_FAHRT_ENDE = 32, A_VERPASST = 33,
       A_ALLE_LOESCHEN = 34, A_FAV_SEITE = 35, A_SOFORT_SPEICHERN = 36,          // 0.8.0
       A_R_ANKUNFT = 37,                                                       // 0.11.0
       A_FAHRTEN = 38,                                                         // 0.13.0: WEITERE FAHRTEN
       A_AKTU = 39,                                                            // 0.15.0: Startseite und Aktualisieren (AKTU)
       A_HEIM = 40,                                                            // 0.16.0: Heimathaltestelle (Seite, -1 = löschen)
       // negative: nur auf der Uhr
       A_EINST = -1, A_HIER_START = -18, A_R_AENDERN = -28, A_FAHRT_ZEIGEN = -29,   // -30 NAECHSTE FAHRT bis 0.13.0
       A_ZU_ABF = -32, A_ZU_STR = -33, A_FAV_A = -34, A_FAV_B = -35, A_FRUEHER = -36,   // 0.8.0
       A_F_LOESCHEN = -37, A_F_BEENDEN = -38, A_F_ALLE_ABF = -39, A_F_ALLE_STR = -40,
       A_RUB = -41, A_EINST_S = -42, A_WERT = -43,                     // 0.15.0: Rubrik, Einstellung, Wert (bis 0.14.0 je Wert eine Aktion)
       A_HEIM_SEITE = -44, A_HEIM_E = -45, A_HEIM_WEG = -46 };         // 0.16.0: Heimathaltestelle im Menü, in den Einstellungen

static Window *s_window;
static Layer *s_layer;
static AppTimer *s_timeout;
typedef struct {
  char name[2][NAMELEN];            // 0 = Haltestelle, 1 = Ziel (leer: Seite ohne Ziel) — LED-Schreibweise
  char klar[2][NAMELEN];            // dieselben für die Ansicht Klar, mit Umlauten (UTF-8)
  int32_t dep[MAXD];                // Abfahrt (UTC, mit Verspätung), 0 = keine
  char lin[MAXD][LINLEN];
  int16_t del[MAXD];                // Verspätung in Minuten (negativ = zu früh), AUSFALL = fällt aus
  char steig[MAXD][STEIGLEN];       // Steig der Abfahrt ("B"), leer = keine Angabe
  int16_t dur[MAXD];                // Fahrtdauer bis zum Ziel in Minuten (Ankunft − Abfahrt, mit Echtzeit), 0 = unbekannt
  char end[MAXD][NAMELEN];          // Endziel der Fahrt (nur ohne Ziel), LED-Schreibweise
  char endk[MAXD][NAMELEN];         // dasselbe für Klar
  int32_t stand;
  int status;
  char quelle[8];                   // "RMV" oder "TRANS" (Transitous), steht vor der Uhrzeit des Stands
  uint8_t heim[MAXD];               // Heimathaltestelle (0.16.0): 2 = hält später dort, 1 = in ihrem Umkreis, 0 = nichts
  uint8_t mi[MAXD];                 // Verkehrsmittel (0.17.0): 0 Bus, 1 Tram, 2 Zug, 3 Fähre
  bool ist_heim;                    // die Haltestelle der Seite ist die Heimathaltestelle (Menüeintrag fehlt)
} Strecke;

#define HIER MAXS          // Platz für „Abfahrten hier“ hinter den Seiten, wie HIER in index.js
static Strecke *s_str;              // MAXS + 1 Plätze, seit 0.8.0 auf dem Heap (3,5 KB; App lag an der 64-KB-Grenze)

// Strecke (seit 0.6.1): von einem festen Ort oder dem Standort zu einem Ziel, bis zu drei Verbindungen
typedef struct {
  char name[NAMELEN], klar[NAMELEN];  // Ziel (LED, Klar)
  char von[NAMELEN], vonk[NAMELEN];   // fester Start, leer = ab Standort
  int n;                              // Verbindungen vom Handy (0 = keine)
  int32_t los[MAXD], an[MAXD];        // Losgehen und Ankunft (UTC, mit Echtzeit)
  int16_t del[MAXD];                  // Verspätung der ersten Fahrt in Minuten, AUSFALL = fällt aus
  uint8_t um[MAXD], flag[MAXD];       // Umstiege, Merker R_…
  char kette[MAXD][NAMELEN];          // Linien "8 > S1"
  int32_t stand;
  int status;
  char quelle[8];
} Route;
#define R_KNAPP 1          // ein Umstieg kürzer als die eingestellte Umstiegszeit
#define R_WEG 2            // ein Anschluss ist schon weg (Verspätung)
#define R_AUSFALL 8
static Route *s_rt;                 // MAXS + 1 Einträge, [HIER] = Sofort-Strecke (VON HIER NACH); Heap, puffer_anlegen()
static int s_ranzahl = -1, s_rseite;
static bool s_sofort;               // Sofort-Strecke wird gezeigt statt Seite s_rseite
static int s_sofort_nr, s_sofort_n;
static int s_rubrik;                // 0 Abfahrten, 1 Strecken
// Vorschlag FRUEHER DA (0.8.0): ersetzt die dritte Zeile. Nur einer gespeichert (der zuletzt gesendeten Seite), spart
// gegenüber einem je Seite gut 0,5 KB — die App liegt knapp an der 64-KB-Grenze.
static char s_vtext[VTXT];
static int s_vrub = -1, s_vseite = -1;
static const char *vt_str(const Strecke *s) { return s_vrub == 0 && s_vseite == (int)(s - s_str) ? s_vtext : ""; }
static const char *vt_rt(const Route *r) { return s_vrub == 1 && s_vseite == (int)(r - s_rt) ? s_vtext : ""; }

// Detailansicht: Zeilen vom Handy, Bildzeilen (Abschnitte mit Zusatz belegen zwei)
typedef struct { uint8_t art; int32_t t; char text[DTXT], zus[DTXT], re[4]; } Zeile;
enum { Z_START = 1, Z_HALT = 2, Z_ZIEL = 3, Z_ZWISCHEN = 4, Z_FUSS = 10, Z_FAHRT = 11, Z_UMSTIEG = 12 };
#define Z_ART(a)  ((a) & 31)
#define Z_WARN(a) ((a) & 32)
static Zeile *s_dz;                 // DMAX Zeilen, Heap
static int s_dn = -1;               // Anzahl Zeilen, -1 = lädt
static int s_dnr;                   // Nummer der Abfahrt bzw. Verbindung (0-2)
static int s_doben;                 // oberste sichtbare Bildzeile
static bool s_dfrisch;              // gerade geöffnet: beim Eintreffen zum aktuellen Schritt rollen
static bool s_dfolgen;              // Fahrt: der Balken ist weitergerückt, beim Eintreffen mitrollen (0.13.0)
static uint8_t s_bz[DMAX * 2];      // Bildzeile -> Zeile, Bit 7 = zweite Teilzeile (Zusatz)
static int s_bn;

// Suche: Buchstabenrad A-Z ("_" = Leerzeichen, dann Ziffern) und Diktat. Bis 0.6.1 nach Häufigkeit (ENISRAT…):
// spart Drücke, war aber nicht vorhersehbar — A-Z auf Wunsch Seb 2026-10-09
static const char RAD[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789-.";
#define RAD_N ((int)sizeof(RAD) - 1)
static char s_such[48], s_treffer[124];
static int s_buchst;
static DictationSession *s_diktat;

static int s_umstiege = 2, s_fussweg = 15, s_umstzeit = 2;
static int32_t s_taste;             // letzter Tastendruck (neu laden bis OHNE TASTE danach)
static int32_t s_lade_t;            // letzte Anfrage der Seite (REGELMAESSIG zählt ab hier)
static int s_ohne = 5;              // OHNE TASTE (0.15.0): -1 nach 10 s schließen, 0 immer weiter laden, sonst nach so vielen
                                    // Minuten nicht mehr laden (ersetzt APP SCHLIESSEN und die feste Ladepause AKTIV_S)
static int s_regel = 1;             // REGELMAESSIG: alle so viele Minuten neu laden, 0 = nur beim Öffnen
static bool s_nachab = true;        // NACH ABFAHRT: neu laden, sobald die oberste Abfahrt bzw. Verbindung aus der Liste fällt
static bool s_startseite = true;    // STARTSEITE (Standard an seit 0.17.0): beim Öffnen die nächste Haltestelle
static bool s_start;                // die Startseite wird gezeigt (Platz HIER mit Nummer 0)
static bool s_hier_start;           // ABFAHRTEN HIER kam von der Startseite: Zurück führt dorthin
static int16_t s_hier_m;            // Entfernung zur Haltestelle von ABFAHRTEN HIER bzw. Startseite (m), 0 = unbekannt
static bool s_hier0;                // Platz HIER hält die nächste Haltestelle (Nummer 0): Startseite kann ihn gleich zeigen
static bool s_lzwei;                // Liste mit zwei Zeilen je Eintrag (Einstellungen: "NAME|Wert")
static AppTimer *s_rubrik_timer;    // solange gesetzt: Name der Rubrik eingeblendet
static AppTimer *s_lang_timer;      // Hoch/Runter wird gehalten
static int s_lang_d;
static bool s_lang_fertig;
static bool s_aus_einst;            // Ablauf am Handy (Favoriten) kam aus den Einstellungen: dorthin zurück
static int16_t s_lwert[12];         // Wert je Eintrag der Uhr-eigenen Auswahllisten (Umstiege, Fußweg …)
static bool s_hier;                 // „Abfahrten hier“ wird gezeigt statt der Seite s_seite
static int s_hier_nr, s_hier_n;     // Nummer der Haltestelle in der Liste vom Handy, Länge der Liste (0 = noch unbekannt)
static int s_anzahl = -1;           // -1 = noch keine Einrichtung vom Handy erhalten
static int s_seite = 0;
static int s_status_start = ST_LADE; // Status, solange keine Strecke da ist
static bool s_beruehrt;             // Taste gedrückt seit dem Start: kein Sprung nach Standort mehr
// Aktive Fahrt (0.6.6): eigene Detailansicht einer festen Fahrt, gegenüber dem Handy Rubrik 2
#define RUBRIK_FAHRT 2
#define RUBRIK_START 3     // SPRUNG vom Handy: Startseite zeigen (0.15.0)
static bool s_fahrt;                // die Detailansicht zeigt die aktive Fahrt
static int32_t s_fahrt_ende;        // Ende der aktiven Fahrt (UTC), 0 = keine
static char s_ftitel[NAMELEN];
// Ruhe (0.6.6, Wunsch Seb): RUHE_MS ohne Tastendruck -> zurück zum Watchface, seit 0.9.2 nur mit Einstellung
// APP SCHLIESSEN (Standard: nie von selbst). Ausgesetzt beim Laden, Diktat und
// solange die Einstellungsseite am Handy offen ist (höchstens KONFIG_S)
#define RUHE_MS 10000
#define KONFIG_S 600
static AppTimer *s_ruhe;
static int32_t s_konfig;
static bool s_diktat_an;
// Fahrtkarte (0.7.0): der aktuelle Schritt der aktiven Fahrt bildschirmfüllend, vom Handy fertig formuliert
#define KZ 6               // Zeilen unter dem Haltestellennamen, wie K_L[6] in package.json
typedef struct {
  int phase, halte, rf;               // phase 0 = keine Karte; halte 1-3: große Zahl zählt Halte; rf: rechts oben Fuß (1) / nächster Halt (0)
  int32_t zeit;                       // Ziel des Countdowns (UTC)
  char kopf[NAMELEN], kopfr[16], zeitl[24], r1[16], r2[20], label[16], name[NAMELEN], steig[4], fuss[28];
  char l[KZ][8], w[KZ][28], r[KZ][16], s[KZ][4];
  uint8_t f[KZ];                      // 1 rechts Warnung, 2 rechts hell, 4 ganze Zeile, 8 Trennlinie davor, 16/32/64 Wert gelb/grau/hell, 128 belegt
  int32_t ht[3];                      // im Fahrzeug: Abfahrt der nächsten drei Halte bis zum Ausstieg (0.15.0), 0 = keiner
  char hn[3][13];                     // ihre Namen (wie r2)
} Karte;
static Karte *s_k;                  // Heap
static bool s_karte;                // Karte zeigen (sonst der Verlauf)
static int s_dakt = -1;             // markierte Detailzeile im Verlauf der Fahrt
static char s_linfo[128];           // Info-Zeilen über einer Liste vom Handy, '|' getrennt (Vorschlag)
static char s_heim[2][NAMELEN];     // Heimathaltestelle (0.16.0): Phosphor- und Papier-Schreibweise vom Handy, leer = keine
static Strecke *aktuelle(void) { return &s_str[s_hier ? HIER : s_seite]; }
static bool zeigt_seite(void) { return s_hier || s_anzahl > 0; }
static Route *aktuelle_route(void) { return &s_rt[s_sofort ? HIER : s_rseite]; }
static bool zeigt_route(void) { return s_sofort || s_ranzahl > 0; }
// Rechts unten bzw. oben: Rubrik und Seite (seit 0.6.1, Buchstaben seit 0.8.0): Abfahrten "A2/5", Strecken "S2/3",
// die beiden Sofort-Ansichten (Abfahrten hier, Strecke ab hier) "H1/10"; davor "WI", wenn die Uhr nicht deutsche Zeit hat.
static void seitenzeichen(char *re, size_t n, bool fremd) {
  const char *wi = fremd ? "WI" : "";
  char z = 'A';
  int nr = s_seite, von = s_anzahl;
  if (s_rubrik == 1) { z = s_sofort ? 'H' : 'S'; nr = s_sofort ? s_sofort_nr : s_rseite; von = s_sofort ? s_sofort_n : s_ranzahl; }
  else if (s_hier) { z = 'H'; nr = s_hier_nr; von = s_hier_n; }
  if (von > 0) snprintf(re, n, "%s%c%d/%d", wi, z, nr + 1, von);
  else snprintf(re, n, "%s%c", wi, z);
}
// ---------- Lauftext (0.13.0): eine Regel für alle Ansichten und Seiten ----------
// Passt ein Text nicht in seinen Platz, läuft er durch: 1 s steht der Anfang, dann LAUF_PX je LAUF_MS, Ende und neuer
// Anfang mit LAUF_LUECKE Abstand. 1 min nach der letzten Taste hält er wieder am Anfang (Papier mit „…“).
// Wer zeichnet, meldet den Bedarf über lauf_versatz(); zeichnen() stellt danach den Zeitgeber. Es gibt keine Liste
// der Stellen, die laufen dürfen — neue Seiten bekommen den Lauftext, indem sie lauf_k bzw. lauf_p benutzen.
static AppTimer *s_lauf;
static int s_lauf_off;
static uint32_t s_lauf_rest;
static bool s_lauf_bedarf;          // beim Zeichnen gesetzt: mindestens ein Text war zu lang
static int lauf_versatz(int w) {    // um so viele Punkte ist ein Text der Breite w gerade nach links gerückt
  s_lauf_bedarf = true;
  const int schritt = s_lauf_off - LAUF_PAUSE;
  return schritt > 0 ? (schritt * LAUF_PX) % (w + LAUF_LUECKE) : 0;
}

// Uhr-Menü
static int s_modus = M_ANZEIGE;
static int s_lart;                  // L_HANDY, L_MENUE oder L_AENDERN
static char s_ltitel[LTXT];
// 300 x 32 = 9,6 KB, seit 0.7.0 auf dem Heap: fest im Programm überschritt die App die 64 KB (text+data+bss), die Pebble lädt
static char (*s_ltext)[LTXT];
static int8_t s_lakt[12];           // Aktion je Eintrag der Uhr-eigenen Menüs
static uint32_t s_lfrage;           // Liste vom Handy: Bit k = Eintrag k braucht die Bestätigung (0.8.0)
static bool s_menue_detail;         // Menü wurde aus den Details bzw. der Fahrt geöffnet (Zurück führt dorthin)
// Bestätigungsseite (0.8.0): Frage groß, Titel der Liste klein, Pfeil zur oberen Taste. Zurück: wieder die Liste.
static char s_ftext[2 * NAMELEN + 16], s_fkopf[LTXT];   // Frage: ganzer Name (Liste kürzt auf 31 Zeichen)
static int s_faktion, s_fwahl;
static int32_t s_hfav, s_rfav, s_sfav;   // Bits: Ort ist schon Favorit (Seite i: 2i Start, 2i+1 Ziel; Sofort: 0 Halt, 1 Ziel)
static int32_t s_dstand;            // Stand der Details bzw. der Fahrt (UTC), 0 = unbekannt
static int s_layout = LAYOUT_CARTOON;         // Cartoon (Standard seit 0.17.0, vorher Papier): Systemschrift fett, kein Grau, Ziffern in Roboto Bold
static bool s_invers, s_kontrast;             // Farben invertiert; hoher Kontrast (keine graue Schrift, wirkt in Phosphor)
typedef struct { GColor k_papier, k_tinte, k_rot, k_orange, k_grau, k_dunkel, k_lgrau,
                 p_hg, p_text, p_grau, p_gitter, p_schwach, p_hell, p_cyan, p_warn; } Palette;
static Palette s_pal;
static GColor hex(uint32_t v) { return GColorFromHEX(v); }
static GFont s_f_uhr, s_f14, s_f14b, s_f18, s_f18b, s_f24b, s_f28b;
static GFont s_roboto32;
static GFont s_cf12, s_cf15, s_cf18, s_cf22;   // Cartoon: Fredoka 12/15/18 halbfett, 22 fett — erst bei Bedarf geladen
static void schriften_setzen(void) {           // Papier: fette Systemschrift, Ziffern aus Roboto (erst bei Bedarf geladen)
  if (CARTOON) {                               // Cartoon (0.16.0): alles in Fredoka, der Aufbau von Papier bleibt
    if (!s_cf12) {
      s_cf12 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FREDOKA_12));
      s_cf15 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FREDOKA_15));
      s_cf18 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FREDOKA_18));
      s_cf22 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FREDOKA_BOLD_22));
    }
    s_f14 = s_f14b = s_cf15; s_f18 = s_f18b = s_cf18; s_f24b = s_f28b = s_f_uhr = s_cf22;
    return;
  }
  if (KLAR_ART && !s_roboto32) s_roboto32 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_ROBOTO_BOLD_32));
  s_f_uhr = s_roboto32;
  s_f14 = s_f14b = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  s_f18 = s_f18b = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  s_f24b = fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
  s_f28b = fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
}
static void farben_setzen(void) {              // setzt auch die Schriften, die hängen an der Ansicht
  schriften_setzen();
  const bool i = s_invers;
  s_pal.k_papier = i ? GColorBlack : GColorWhite;
  s_pal.k_tinte  = i ? GColorWhite : GColorBlack;
  s_pal.k_rot    = hex(i ? 0xFF0000 : 0xAA0000);
  s_pal.k_orange = hex(i ? 0xFFAA00 : 0xFF5500);
  s_pal.k_grau   = hex(i ? 0x555555 : 0xAAAAAA);
  s_pal.k_dunkel = hex(i ? 0xAAAAAA : 0x555555);
  s_pal.k_lgrau  = s_pal.k_grau;                       // Grau auf Kopf- und Fußleiste (Leiste in Tintenfarbe)
  // Phosphor weiß (grün entfällt seit 0.13.0)
  s_pal.p_hg = i ? GColorWhite : GColorBlack;
  s_pal.p_text = s_pal.p_hell = i ? GColorBlack : GColorWhite;
  s_pal.p_grau = hex(i ? 0x555555 : 0xAAAAAA);
  s_pal.p_gitter = hex(i ? 0xAAAAAA : 0x555555);
  s_pal.p_cyan = hex(i ? 0x0055AA : 0x55FFFF); s_pal.p_warn = hex(i ? 0xAA5500 : 0xFFFF00);
  s_pal.p_schwach = s_pal.p_gitter;
  // Papier: nie Grau (Seb 2026-10-12). Phosphor: nur mit hohem Kontrast. Linien, Raster, Farbhinweise bleiben
  s_pal.k_grau = s_pal.k_dunkel = s_pal.k_tinte;
  s_pal.k_lgrau = s_pal.k_papier;
  if (s_kontrast) s_pal.p_grau = s_pal.p_hell = s_pal.p_schwach = s_pal.p_text;
  if (CARTOON) {                                       // Cartoon (0.16.0): Himmel, Nachtblau, Rosa; Invertiert gilt hier nicht
    s_pal.k_papier = C_HIMMEL;
    s_pal.k_tinte = s_pal.k_grau = C_NAVY;
    s_pal.k_dunkel = GColorFromHEX(0x0055AA);
    s_pal.k_rot = C_ROSA;
    s_pal.k_orange = C_ORANGE;
    s_pal.k_lgrau = GColorFromHEX(0x55AAAA);
  }
}
// Balken (0.13.0): eine Zeile wie die gewählte Menüzeile — Grund in Schriftfarbe, alles darin in der Grundfarbe.
// In der Fahrt steht er auf dem nächsten Halt bzw. dem aktuellen Schritt. Danach mit der gemerkten Palette zurück.
static Palette pal_balken(void) {
  const Palette alt = s_pal;
  s_pal.k_papier = CARTOON ? alt.k_rot : alt.k_tinte;  // Cartoon: rosa Balken, Schrift nachtblau (0.16.0)
  s_pal.k_tinte = s_pal.k_grau = s_pal.k_dunkel = s_pal.k_rot = CARTOON ? alt.k_tinte : alt.k_papier;
  s_pal.p_hg = alt.p_text;
  s_pal.p_text = s_pal.p_grau = s_pal.p_hell = s_pal.p_schwach = s_pal.p_gitter = alt.p_hg;
  return alt;
}
static int layout_wert(void) {
  return (s_layout == LAYOUT_PHOSPHOR ? 4 : CARTOON ? 7 : 5) | (s_invers ? LW_INVERS : 0) | (s_kontrast ? LW_KONTRAST : 0);
}
static int s_umkreis = 1000;      // Meter; das Handy führt den Wert, die Uhr zeigt und ändert ihn
static int s_quelle = QUELLE_AUTO; // Quelle der Abfahrten; das Handy führt den Wert, wie beim Umkreis
static int s_abfahrt = ABF_PLAN;   // vorne die Fahrplanzeit (Standard) oder die aktuelle mit Verspätung
static bool s_dauer = true;        // Fahrtdauer zum Ziel zeigen (Standard an)
// Menütexte je Ansicht. Seit 0.16.0 ein Literal "PHOSPHOR\0Papier", tx() wählt den Teil: halb so viel Code wie der
// Vergleich an jeder der gut 100 Stellen (das Abbild darf höchstens 64 KB groß sein). TV für Texte aus Variablen
__attribute__((noinline)) static const char *tx(const char *s) { return KLAR_ART ? s + strlen(s) + 1 : s; }
#define T(led, klar) tx(led "\0" klar)
#define TV(led, klar) (KLAR_ART ? (klar) : (led))
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

// Zeiten seit 0.15.0 als int32_t: time_t ist auf der Pebble 64 Bit breit, Teilen zog die Software-Division
// __aeabi_ldivmod/__udivmoddi4 ins Programm (0,85 KB). Die int32_t-Felder setzen die Grenze 2038 ohnehin.
static int32_t jetzt(void) { return (int32_t)time(NULL); }
static int32_t last_sunday_0100_utc(int y, int m) {         // letzter Sonntag im Monat, 01:00 UTC
  const int32_t last = days_from_civil(m == 12 ? y + 1 : y, m == 12 ? 1 : m + 1, 1) - 1;
  const int wd = (int)((last + 4) % 7);                    // 0 = Sonntag (1970-01-01 war Donnerstag)
  return (last - wd) * 86400 + 3600;
}

static int berlin_offset(int32_t utc) {
  const int y = year_from_days(utc / 86400);
  return (utc >= last_sunday_0100_utc(y, 3) && utc < last_sunday_0100_utc(y, 10)) ? 7200 : 3600;
}

static void berlin_hm(int32_t utc, int *h, int *m) {
  const int s = (int)((utc + berlin_offset(utc)) % 86400);
  *h = s / 3600;
  *m = (s / 60) % 60;
}

static void berlin_datum(int32_t utc, int *wtag, int *tag, int *monat) {   // wtag 0 = Sonntag
  const int32_t z0 = (utc + berlin_offset(utc)) / 86400;
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


static const Glyph *glyph(const Glyph *f, int n, char c) {
  for (int i = 0; i < n; i++) if (f[i].c == c) return &f[i];
  return NULL;
}

static int text_w(const Glyph *f, int n, const char *s, int sc) {
  int w = 0;
  for (; *s; s++) { const Glyph *g = glyph(f, n, *s); w += ((g ? g->w : 2) + 1) * sc; }
  return w > 0 ? w - sc : 0;
}


static bool gross_moeglich(const char *l) {     // nur ein- und zweistellige Ziffern in 5x7
  const int n = strlen(l);
  if (n == 0 || n > 2) return false;
  for (int i = 0; i < n; i++) if (l[i] < '0' || l[i] > '9') return false;
  return true;
}


// Indizes der nächsten (bis zu MAXD) noch nicht abgefahrenen Fahrten.
static int naechste(const Strecke *s, int32_t now, int idx[MAXD]) {
  int n = 0;
  for (int i = 0; i < MAXD; i++)
    if (s->dep[i] != 0 && s->dep[i] >= now) idx[n++] = i;
  return n;
}

static bool hat_ziel(const Strecke *s) { return s->name[1][0] != '\0'; }

// Zeitspalte für die ganze Seite gleich, damit die Zeiten bündig stehen.
   // klein hinter der Linie


// Eine Abfahrt, 7 Punkte hoch ab Zeile yy: Linie, Steig gedimmt, Zeit, Verspätung, Fahrtdauer gedimmt, Restminuten.

// Abfahrten ab Zeile y. Mit Ziel drei Zeilen im Abstand 11; ohne Ziel je Fahrt das Endziel klein und gedimmt
// darunter, unter der Zeitspalte (Abstand 15).
// Vorschlag FRUEHER DA (0.8.0) an Stelle der dritten Zeile: vorn hell ("FRUEHER DA -12'"), hinter '|' gedimmt
static void vorschlag_teil(const char *vt, int teil, char *buf, size_t n) {
  const char *bar = strchr(vt, '|');
  if (teil == 0) snprintf(buf, n, "%.*s", bar ? (int)(bar - vt) : (int)strlen(vt), vt);
  else snprintf(buf, n, "%s", bar ? bar + 1 : "");
}

// Ziel klein unter der Haltestelle: "> LUISENPLATZ"


// Haltestellenname: passt er, steht er mittig; sonst läuft er von rechts nach links durch (Lauftext).

   // Text ab Spalte 3 bis 65

static void uhr_text(char *buf, size_t n) { int h, m; berlin_hm(jetzt(), &h, &m); snprintf(buf, n, "%02d:%02d", h, m); }
static bool stand_alt(int32_t st) { return st > 0 && jetzt() - st > ALT_S; }

// 0.8.0: Uhrzeit überall oben rechts (hell), links der Titel gedimmt; Fuß links und rechts ohne Uhr


// ---------- Seitenübergreifend (0.6.1): Status, Strecken, Detailzeilen ----------
// Status, Stand und Quelle der gezeigten Seite (Haltestelle oder Strecke); ST_LEER, wenn keine da ist
static int seiten_status(int32_t *stand, const char **quelle) {
  if (s_rubrik == 1) {
    if (!zeigt_route()) return ST_LEER;
    const Route *r = aktuelle_route();
    *stand = r->stand; *quelle = r->quelle;
    return r->status;
  }
  if (!zeigt_seite()) return ST_LEER;
  const Strecke *s = aktuelle();
  *stand = s->stand; *quelle = s->quelle;
  return s->status;
}

// Verbindungen, die noch nicht vorbei sind (Losgehen höchstens 1 min her)
static int route_naechste(const Route *r, int32_t now, int idx[MAXD]) {
  int n = 0;
  for (int i = 0; i < r->n && i < MAXD; i++) if (r->los[i] && r->los[i] >= now - 60) idx[n++] = i;
  return n;
}
static int rest_min(int32_t t, int32_t now) { const int m = (t - now) / 60; return m < 0 ? 0 : m; }
static const char *route_warnung(const Route *r, int k, bool klar) {
  if (r->del[k] == AUSFALL || (r->flag[k] & R_AUSFALL)) return klar ? "fällt aus" : "FAELLT AUS";
  if (r->flag[k] & R_WEG) return klar ? "Anschluss weg" : "WEG";
  if (r->flag[k] & R_KNAPP) return klar ? "knapp" : "KNAPP";
  return "";
}



// ---------- Detailansicht ----------
// Seit 0.6.5 größer (Wunsch Seb 2026-10-10): Halte mit Zeit und Name in großer Schrift, Achse ganz links. Passt der
// Name nicht neben die Zeit, bekommt er eine zweite Bildzeile über die volle Breite (Bit 7, wie der Zusatz der Abschnitte).
static bool punkt_einzeilig(const Zeile *z);           // je Ansicht, steht bei den Ansichten
static void bild_bauen(void) {
  s_bn = 0;
  for (int i = 0; i < s_dn && i < DMAX; i++) {
    const int a = Z_ART(s_dz[i].art);
    s_bz[s_bn++] = i;
    if (a >= Z_FUSS ? s_dz[i].zus[0] != '\0' : (a != Z_ZWISCHEN && !punkt_einzeilig(&s_dz[i]))) s_bz[s_bn++] = i | 0x80;
  }
}
static bool karte_moeglich(void) { return s_fahrt && s_k->phase > 0; }
static bool karte_zeigen(void) { return s_karte && karte_moeglich(); }
static bool d_markiert(int b) { return s_fahrt && s_dakt >= 0 && (s_bz[b] & 0x7F) == s_dakt; }
static bool d_umbruch(int b) { return b + 1 < s_bn && s_bz[b + 1] == ((s_bz[b] & 0x7F) | 0x80); }
#define KD_Y0 28           // Klar
#define KD_H  25
#define PD_Y0 25           // Phosphor
#define PD_H  22
static int d_sichtbar(void) { return s_layout == LAYOUT_PHOSPHOR ? 8 : 7; }
// Zeile vorbei: Punkt mit Zeit bis jetzt; Abschnitt: der nächste Punkt danach ist vorbei. Seit 0.15.0 gilt ein Halt ab
// seiner Abfahrt als vorbei (das Handy schickt bei Zwischenhalten die Abfahrt), bis 0.14.0 erst 30 s nach der Ankunft
static bool zeile_vorbei(int i, int32_t now) {
  for (int j = i; j < s_dn; j++) if (s_dz[j].t) return s_dz[j].t <= now;
  return false;
}
static void d_zum_akt(void);
static void d_zum_jetzt(void) {                        // zum ersten noch kommenden Schritt rollen (eine Zeile Vorlauf)
  const int32_t now = jetzt();
  int j = 0;
  while (j < s_bn && zeile_vorbei(s_bz[j] & 0x7F, now)) j++;
  if (j >= s_bn) j = 0;
  s_doben = j > 1 ? j - 1 : 0;
  if (s_doben > s_bn - d_sichtbar()) s_doben = s_bn - d_sichtbar();
  if (s_doben < 0) s_doben = 0;
}
// Wie viele Abfahrten bzw. Verbindungen gibt es (Select in den Details blättert durch)
static int detail_anzahl(void) {
  if (s_rubrik == 1) { int idx[MAXD]; return route_naechste(aktuelle_route(), jetzt(), idx); }
  int idx[MAXD];
  return naechste(aktuelle(), jetzt(), idx);
}
static int32_t detail_ankunft(void) {                  // Zeit der Zielzeile (letzte Zeile mit Zeit)
  for (int i = s_dn - 1; i >= 0; i--) if (s_dz[i].t) return s_dz[i].t;
  return 0;
}
static void detail_kopftext(char *links, size_t nl, char *rechts, size_t nr, bool klar) {
  const int n = s_fahrt ? 1 : detail_anzahl();
  if (s_fahrt) snprintf(links, nl, "%s", klar ? "Fahrt" : "FAHRT");
  else if (s_dnr == VORSCHLAG) snprintf(links, nl, "%s", klar ? "früher da" : "FRUEHER DA");
  else if (s_dnr == LISTE) links[0] = '\0';           // aus WEITERE FAHRTEN: keine Nummer
  else if (n > 1) snprintf(links, nl, "%d/%d", s_dnr + 1, n); else links[0] = '\0';
  const int32_t an = detail_ankunft();
  rechts[0] = '\0';
  if (an) { int h, m; berlin_hm(an, &h, &m); snprintf(rechts, nr, klar ? "an %02d:%02d" : "AN %02d:%02d", h, m); }
}


// Stand als Text ("STAND 14:32"), leer wenn unbekannt
static void stand_text(char *buf, size_t n, int32_t st, bool klar) {
  if (st <= 0) { buf[0] = '\0'; return; }
  int h, m;
  berlin_hm(st, &h, &m);
  snprintf(buf, n, klar ? "Stand %02d:%02d" : "STAND %02d:%02d", h, m);
}

// ---------- Suche: Buchstabenrad ----------
static void such_anzeige(char *buf, size_t n) {        // eingegebener Text, das Leerzeichen als "_"
  snprintf(buf, n, "%s", s_such);
  for (char *c = buf; *c; c++) if (*c == ' ') *c = '_';
}
static int treffer_zeile(int k, char *buf, size_t n) { // k-te Zeile der Live-Treffer ('|' getrennt)
  const char *p = s_treffer;
  for (int i = 0; i < k && p; i++) { p = strchr(p, '|'); if (p) p++; }
  if (!p || !*p) { buf[0] = '\0'; return 0; }
  const char *e = strchr(p, '|');
  const int l = e ? (int)(e - p) : (int)strlen(p);
  snprintf(buf, n, "%.*s", l, p);
  return 1;
}
static char rad_zeichen(int d) { return RAD[((s_buchst + d) % RAD_N + RAD_N) % RAD_N]; }


// Name der Rubrik groß über dem Bild, solange s_rubrik_timer läuft

// Zeilenumbruch nach Wörtern: so viele Zeichen von p, wie in maxw passen (ein zu langes Wort allein)
static int umbruch_teil(const char *p, int maxw, int (*breite)(const char *)) {
  char z[2 * LTXT];
  int best = 0, e = 0;
  for (;;) {
    while (p[e] && p[e] != ' ') e++;
    snprintf(z, sizeof(z), "%.*s", e, p);
    if (best && breite(z) > maxw) break;
    best = e;
    if (!p[e]) break;
    e++;
  }
  return best;
}

// Bestätigungsseite (0.8.0): Titel gedimmt, rechts auf Höhe der oberen Taste "HIER >" / "BESTAETIGEN",
// in der Mitte die Frage, unten "ZURUECK: NEIN". Keine Uhrzeit: oben rechts steht der Pfeil zur Taste.


// ---------- Ansicht „Klar“: weiß, Systemschrift (Entwurf linie8-skin-klar-entwurf.svg) ----------
// Farben zur Laufzeit (farben_setzen): normal schwarz auf Weiß, invertiert weiß auf Schwarz
#define K_PAPIER s_pal.k_papier
#define K_TINTE  s_pal.k_tinte
#define K_ROT    s_pal.k_rot
#define K_ORANGE s_pal.k_orange
#define K_GRAU   s_pal.k_grau
#define K_DUNKEL s_pal.k_dunkel
#define K_LGRAU  s_pal.k_lgrau    // Grau auf Kopf- und Fußleiste
#define K_LORANGE GColorFromHEX(0xFF5500)   // Orange auf der Leiste: dunkel genug für die weiße Leiste (invertiert)
#define K_BALKEN  (CARTOON ? K_ROT : K_TINTE)    // gewählte Zeile: Papier Tinte, Cartoon rosa mit Nachtblau (0.16.0)
#define K_BALKENT (CARTOON ? K_TINTE : K_PAPIER)
#define K_ZEILE  22        // Listen: Zeilenhöhe in px
#define K_Y0     28        // Listen: erste Zeile unter dem Titelbalken
#define K_ZEILE2 40        // Einstellungen: zwei Zeilen je Eintrag (0.15.0); Phosphor P_ZEILE2
#define P_ZEILE2 30
static int l_zeilen(void) { return !s_lzwei ? LZEILEN : KLAR_ART ? 4 : 6; }      // sichtbare Einträge
static bool trenner(int i) { return !strncmp(s_ltext[i], "-- ", 3); }   // Zwischenüberschrift bzw. Erklärzeile
static int l_hoehe(void) { return s_lzwei ? (KLAR_ART ? K_ZEILE2 : P_ZEILE2) : K_ZEILE; }   // P_ZEILE = K_ZEILE

// noinline (0.16.0): über 150 Aufrufe, als eigene Funktion gut 1 KB kleiner — das Abbild darf höchstens 64 KB groß sein
__attribute__((noinline)) static void k_text(GContext *ctx, const char *t, GFont f, GRect r, GTextAlignment a, GColor c) {
  graphics_context_set_text_color(ctx, c);
  graphics_draw_text(ctx, t, f, r, GTextOverflowModeTrailingEllipsis, a, NULL);
}

__attribute__((noinline)) static int k_breite(const char *t, GFont f) {
  return graphics_text_layout_get_content_size(t, f, GRect(0, 0, 1000, 40), GTextOverflowModeFill, GTextAlignmentLeft).w;
}

__attribute__((noinline)) static void k_flaeche(GContext *ctx, GRect r, GColor c) {
  graphics_context_set_fill_color(ctx, c);
  graphics_fill_rect(ctx, r, 0, GCornerNone);
}

// Heimathaltestelle (0.16.0): Haus 11 x 10 px vor dem Endziel. art 2 = die Fahrt hält später an der Heimathaltestelle
// (voll, mit Tür), 1 = in deren Umkreis (nur Umriss, „nicht so deutlich“ — Wunsch Seb 2026-10-16). bg: Grund für die Tür
static void haus(GContext *ctx, int x, int y, int art, GColor c, GColor bg) {
  graphics_context_set_stroke_color(ctx, c);
  for (int i = 0; i < 5; i++) {                        // Dach, unten so breit wie das Haus
    if (art == 2) graphics_draw_line(ctx, GPoint(x + 5 - i, y + i), GPoint(x + 5 + i, y + i));
    else { graphics_draw_pixel(ctx, GPoint(x + 5 - i, y + i)); graphics_draw_pixel(ctx, GPoint(x + 5 + i, y + i)); }
  }
  if (art != 2) { graphics_draw_rect(ctx, GRect(x + 1, y + 5, 9, 5)); return; }
  k_flaeche(ctx, GRect(x + 1, y + 5, 9, 5), c);
  k_flaeche(ctx, GRect(x + 4, y + 7, 3, 3), bg);
}
// Auswahlkreis rechts in Wertelisten (0.16.0): voll = aktueller Wert. Select übernimmt, die Liste bleibt offen
static void l_kreis(GContext *ctx, int x, int y, int voll, GColor c) {
  graphics_context_set_stroke_color(ctx, c);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_circle(ctx, GPoint(x, y), 6);
  graphics_context_set_stroke_width(ctx, 1);
  if (voll) { graphics_context_set_fill_color(ctx, c); graphics_fill_circle(ctx, GPoint(x, y), 3); }
}

// Papier: Text t im Rahmen r; zu lang -> läuft (Regel oben). Systemschrift lässt sich nicht beschneiden: links und
// rechts von r wird die Zeile zy..zy+zh mit bg übermalt. Deshalb zeichnet jede Zeile ihren Lauftext zuerst.
static void lauf_k(GContext *ctx, const char *t, GFont f, GRect r, GColor c, GColor bg, int zy, int zh) {
  const int w = k_breite(t, f);
  const int v = w > r.size.w ? lauf_versatz(w) : 0;
  if (!v) { k_text(ctx, t, f, r, GTextAlignmentLeft, c); return; }
  const int x = r.origin.x - v, x1 = r.origin.x + r.size.w;
  graphics_context_set_text_color(ctx, c);
  graphics_draw_text(ctx, t, f, GRect(x, r.origin.y, w + 4, r.size.h), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  graphics_draw_text(ctx, t, f, GRect(x + w + LAUF_LUECKE, r.origin.y, w + 4, r.size.h), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  k_flaeche(ctx, GRect(0, zy, r.origin.x, zh), bg);
  k_flaeche(ctx, GRect(x1, zy, 200 - x1, zh), bg);
}

// Cartoon (0.16.0): Pille aus Rechteck und zwei Kreisen (Ecken von graphics_fill_rect höchstens 8 px), Rasen als Fuß,
// Kopf mit dem Titel in einer rosa Pille und der Uhrzeit rechts — wie Water im Timer
static void c_pille(GContext *ctx, int x, int y, int w, int h, GColor c) {
  const int r = h / 2;
  k_flaeche(ctx, GRect(x + r, y, w - 2 * r, h), c);
  graphics_fill_circle(ctx, GPoint(x + r, y + r), r);
  graphics_fill_circle(ctx, GPoint(x + w - 1 - r, y + r), r);
}
static void c_rasen(GContext *ctx, int y, const char *links, GColor lc, const char *rechts) {
  k_flaeche(ctx, GRect(0, y, 200, 228 - y), GColorFromHEX(0xAAFFAA));
  k_flaeche(ctx, GRect(0, y, 200, 2), GColorFromHEX(0x55AA55));
  const int b = y + (228 - y) / 2 - 7, rw = rechts[0] ? k_breite(rechts, s_cf15) : 0;   // Fredoka 15, Grundlinie mittig
  k_text(ctx, links, s_cf15, GRect(6, b, 186 - rw, 20), GTextAlignmentLeft, lc);
  if (rw) k_text(ctx, rechts, s_cf15, GRect(190 - rw, b, rw + 4, 20), GTextAlignmentRight, C_NAVY);
}
static void c_kopf(GContext *ctx, const char *titel) {
  char uhr[8];
  uhr_text(uhr, sizeof(uhr));
  const int uw = k_breite(uhr, s_cf18);
  int tw = k_breite(titel, s_cf15);
  if (tw > 164 - uw) tw = 164 - uw;
  k_flaeche(ctx, GRect(0, 0, 200, 28), C_HIMMEL);
  c_pille(ctx, 4, 3, tw + 20, 21, C_ROSA);
  k_text(ctx, titel, s_cf15, GRect(14, 3, tw + 2, 20), GTextAlignmentLeft, C_NAVY);   // Grundlinie 18
  k_text(ctx, uhr, s_cf18, GRect(192 - uw, 1, uw + 4, 24), GTextAlignmentRight, C_NAVY);
}

// Fußbalken: links Text (optional mit farbigem Punkt), rechts der Stand (grau, ab 2 min orange). Seit 0.8.0 ohne Uhr.
static void k_fuss(GContext *ctx, const char *links, bool punkt, GColor farbe, int32_t stand) {
  if (CARTOON) {                                       // Cartoon: Rasen, Stand rechts (alt: Text links orange)
    char st[16];
    stand_text(st, sizeof(st), stand, true);
    c_rasen(ctx, 204, links, stand_alt(stand) ? C_ORANGE : C_NAVY, st);
    return;
  }
  const GColor schrift = K_PAPIER;
  k_flaeche(ctx, GRect(0, 210, 200, 18), K_TINTE);
  int x = 6;
  if (punkt) {
    graphics_context_set_fill_color(ctx, farbe);
    graphics_fill_circle(ctx, GPoint(11, 219), 3);
    x = 19;
  }
  char st[16];
  stand_text(st, sizeof(st), stand, true);
  const int sw = st[0] ? k_breite(st, s_f14b) + 4 : 0;
  // Papier: fett, nur wenn es in die Zeile passt — sonst normal statt abgeschnitten
  const GFont fl = k_breite(links, s_f14) > 194 - sw - x ? fonts_get_system_font(FONT_KEY_GOTHIC_14) : s_f14;
  k_text(ctx, links, fl, GRect(x, 209, 194 - sw - x, 18), GTextAlignmentLeft, schrift);
  if (st[0]) k_text(ctx, st, s_f14b, GRect(194 - sw, 209, sw, 18), GTextAlignmentRight, stand_alt(stand) ? K_LORANGE : K_LGRAU);
}
// Kopfbalken (0.8.0): links der Titel, rechts die Uhrzeit fett
static void k_kopf(GContext *ctx, const char *titel, GColor farbe) {
  if (CARTOON) { c_kopf(ctx, titel); return; }
  char uhr[8];
  uhr_text(uhr, sizeof(uhr));
  const int uw = k_breite(uhr, s_f18b) + 8;
  k_flaeche(ctx, GRect(0, 0, 200, 26), K_TINTE);
  lauf_k(ctx, titel, s_f18b, GRect(6, -1, 188 - uw, 24), farbe, K_TINTE, 0, 26);
  k_text(ctx, uhr, s_f18b, GRect(194 - uw, -1, uw, 24), GTextAlignmentRight, K_PAPIER);
}

// Vorschlag FRUEHER DA (0.8.0) an Stelle der dritten Zeile: oben orange fett, darunter Linien und Ankunft
static void k_vorschlag(GContext *ctx, const char *vt, int yy) {
  char a[VTXT], b[VTXT];
  vorschlag_teil(vt, 0, a, sizeof(a)); vorschlag_teil(vt, 1, b, sizeof(b));
  lauf_k(ctx, b, s_f14b, GRect(8, yy + 20, 184, 18), K_DUNKEL, K_PAPIER, yy + 22, 16);
  k_text(ctx, a, s_f18b, GRect(8, yy + 1, 184, 24), GTextAlignmentLeft, K_ORANGE);
}
// Name hinter "ab" bzw. "nach": Lauftext, die Bezeichnung links bleibt stehen
#define K_NAME_R 194
static void k_name(GContext *ctx, const char *vor, GRect vr, const char *name, GFont f, GRect r, GColor c) {
  lauf_k(ctx, name, f, GRect(r.origin.x, r.origin.y, K_NAME_R - r.origin.x, r.size.h), c, K_PAPIER, r.origin.y, r.size.h);
  k_text(ctx, vor, s_f14, vr, GTextAlignmentLeft, K_DUNKEL);
}
static const char *k_name0(const Strecke *s) { return s->klar[0][0] ? s->klar[0] : s->name[0]; }
static const char *k_name1(const Strecke *s) { return s->klar[1][0] ? s->klar[1] : s->name[1]; }
static const char *k_rziel(const Route *r) { return r->klar[0] ? r->klar : r->name; }
static const char *k_rvon(const Route *r) { return r->von[0] ? (r->vonk[0] ? r->vonk : r->von) : "Standort"; }

// Seite in Klar (0.50): "ab" Haltestelle groß, darunter "nach" Ziel; drei Abfahrten mit Zeit in LECO 32.
// Ohne Ziel steht unter jeder Zeit das Endziel der Fahrt.
static void k_seite(GContext *ctx, const Strecke *s, int32_t now) {
  const bool ziel = hat_ziel(s);
  k_name(ctx, "ab", GRect(8, 50, 24, 18), k_name0(s), s_f24b, GRect(28, 40, 166, 30), K_TINTE);
  if (ziel) k_name(ctx, "nach", GRect(8, 70, 30, 18), k_name1(s), s_f18, GRect(38, 66, 156, 24), K_DUNKEL);
  const int y0 = ziel ? 92 : 72, dy = ziel ? 39 : 45;
  int idx[MAXD];
  const int n = naechste(s, now, idx);
  for (int k = 0; k < MAXD; k++) {
    const int yy = y0 + k * dy;
    graphics_context_set_stroke_color(ctx, K_GRAU);
    graphics_draw_line(ctx, GPoint(8, yy), GPoint(192, yy));
    if (vt_str(s)[0] && k == MAXD - 1) { k_vorschlag(ctx, vt_str(s), yy); continue; }
    if (k >= n) {
      if (k == 0) k_text(ctx, "keine Fahrt", s_f18, GRect(8, yy + 6, 184, 24), GTextAlignmentLeft, K_DUNKEL);
      continue;
    }
    const int i = idx[k], v = s->del[i];
    const char *lin = s->lin[i];
    int bw = k_breite(lin, s_f24b) + 12;
    if (bw < 32) bw = 32;
    const int xt = 8 + bw + 6;
    const int hx = !ziel && s->heim[i] ? 15 : 0;                       // Heimathaltestelle: Haus vor dem Endziel (0.16.0)
    if (!ziel && s->endk[i][0])                                        // Endziel unter der Zeit, zuerst (Lauftext)
      lauf_k(ctx, s->endk[i], s_f14b, GRect(xt + hx, yy + 28, 192 - xt - hx, 18), K_DUNKEL, K_PAPIER, yy + 33, 12);
    if (hx) haus(ctx, xt, yy + 33, s->heim[i], K_TINTE, K_PAPIER);
    graphics_context_set_fill_color(ctx, K_ROT);
    graphics_fill_rect(ctx, GRect(8, yy + 6, bw, 27), 4, GCornersAll);
    k_text(ctx, lin, s_f24b, GRect(8, yy + 1, bw, 30), GTextAlignmentCenter, GColorWhite);
    char zeit[16], buf[16];
    int h, m;
    const int vz = (v == AUSFALL || s_abfahrt == ABF_AKTUELL) ? 0 : v;   // aktuell: Zeit mit Verspätung, orange
    berlin_hm(s->dep[i] - vz * 60, &h, &m);                          // vorne die Fahrplanzeit (oder die aktuelle)
    snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    k_text(ctx, zeit, s_f_uhr, GRect(xt, yy - 1, 100, 40), GTextAlignmentLeft,
           v == AUSFALL ? K_GRAU : (v != vz ? K_ORANGE : K_TINTE));
    if (v == AUSFALL) {
      k_text(ctx, "fällt aus", s_f18b, GRect(100, yy + 8, 92, 24), GTextAlignmentRight, K_ROT);
      continue;
    }
    const int xz = xt + k_breite(zeit, s_f_uhr) + 3;                 // rechts neben der Zeit: oben Verspätung, unten Steig + Fahrtdauer
    int oben = xz, unten = xz;                                       // rechte Kanten der beiden kleinen Zeilen
    if (vz != 0) {
      snprintf(buf, sizeof(buf), "%+d'", vz);
      k_text(ctx, buf, s_f14b, GRect(xz, yy + 1, 40, 18), GTextAlignmentLeft, K_ORANGE);
      oben = xz + k_breite(buf, s_f14b);
    }
    if (s->steig[i][0]) {
      int sw = k_breite(s->steig[i], s_f14b) + 6;
      if (sw < 13) sw = 13;
      graphics_context_set_fill_color(ctx, K_DUNKEL);
      graphics_fill_rect(ctx, GRect(xz, yy + 20, sw, 13), 2, GCornersAll);
      k_text(ctx, s->steig[i], s_f14b, GRect(xz, yy + 16, sw, 16), GTextAlignmentCenter, K_PAPIER);
      unten = xz + sw + 3;
    }
    char ds[8] = "", rs[8] = "";
    if (s_dauer && s->dur[i] > 0) snprintf(ds, sizeof(ds), "%d'", s->dur[i]);
    const int min = (s->dep[i] - now) / 60;                          // Restminuten mit Verspätung
    if (min < 100) snprintf(rs, sizeof(rs), "%d'", min);
    GFont rf = s_f28b;
    int rand = rs[0] ? 192 - k_breite(rs, rf) : 200;
    const int dende = ds[0] ? unten + k_breite(ds, s_f14) : unten;
    if (ds[0] && (dende > oben ? dende : oben) + 5 > rand) ds[0] = '\0';   // zu eng: erst die Fahrtdauer weg ...
    const int links = (unten > oben ? unten : oben);
    if (rs[0] && links + 5 > rand) { rf = s_f18b; rand = 192 - k_breite(rs, rf); }   // ... dann Restminuten klein
    if (rs[0] && links + 5 > rand) rs[0] = '\0';
    if (ds[0]) k_text(ctx, ds, s_f14, GRect(unten, yy + 16, 40, 18), GTextAlignmentLeft, K_DUNKEL);
    if (rs[0]) {
      if (rf == s_f28b) k_text(ctx, rs, rf, GRect(100, yy + 1, 92, 34), GTextAlignmentRight, K_TINTE);
      else k_text(ctx, rs, rf, GRect(100, yy + 9, 92, 24), GTextAlignmentRight, K_TINTE);
    }
  }
}

// Klar: Strecke (0.6.1) — "nach" Ziel groß, "ab" Start; je Verbindung Losgehzeit groß, daneben oben Ankunft und
// Umstiege bzw. Warnung (rot), unten die Linienkette; rechts die Minuten bis zum Losgehen.
static void k_route(GContext *ctx, const Route *r, int32_t now) {
  k_name(ctx, "nach", GRect(8, 50, 30, 18), k_rziel(r), s_f24b, GRect(40, 40, 154, 30), K_TINTE);
  k_name(ctx, "ab", GRect(8, 70, 24, 18), k_rvon(r), s_f18, GRect(28, 66, 166, 24), K_DUNKEL);
  int idx[MAXD];
  const int n = route_naechste(r, now, idx);
  for (int k = 0; k < MAXD; k++) {
    const int yy = 92 + k * 39;
    graphics_context_set_stroke_color(ctx, K_GRAU);
    graphics_draw_line(ctx, GPoint(8, yy), GPoint(192, yy));
    if (vt_rt(r)[0] && k == MAXD - 1) { k_vorschlag(ctx, vt_rt(r), yy); continue; }
    if (k >= n) {
      if (k == 0 && r->status != ST_LADE)
        k_text(ctx, r->status == ST_STANDORT ? "kein Standort" : "keine Verbindung", s_f18, GRect(8, yy + 6, 184, 24), GTextAlignmentLeft, K_DUNKEL);
      continue;
    }
    const int i = idx[k];
    char zeit[8], an[24], rs[8], buf[12];
    int h, m;
    const bool ausfall = r->del[i] == AUSFALL;
    berlin_hm(r->los[i], &h, &m); snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    const int xz = 8 + k_breite(zeit, s_f_uhr) + 6;
    rs[0] = '\0';
    const int min = rest_min(r->los[i], now);
    if (min < 100) snprintf(rs, sizeof(rs), "%d'", min);
    const int rand = rs[0] ? 192 - k_breite(rs, s_f28b) - 4 : 192;
    // Lauftexte zuerst: unten die Linienkette, oben Ankunft und Umstiege (hinter einer Verspätung)
    int x = xz;
    if (r->del[i] > 0 && !ausfall) { snprintf(buf, sizeof(buf), "+%d'", r->del[i]); x += k_breite(buf, s_f14b) + 4; }
    berlin_hm(r->an[i], &h, &m);
    const char *warn = route_warnung(r, i, true);
    if (warn[0]) snprintf(an, sizeof(an), "an %02d:%02d", h, m);
    else if (r->um[i]) snprintf(an, sizeof(an), "an %02d:%02d · %d Umst.", h, m, r->um[i]);   // "×" fehlt in Gothic
    else snprintf(an, sizeof(an), "an %02d:%02d · direkt", h, m);
    lauf_k(ctx, r->kette[i], s_f14b, GRect(xz, yy + 17, rand - xz, 18), K_TINTE, K_PAPIER, yy + 21, 14);
    lauf_k(ctx, an, s_f14b, GRect(x, yy + 1, rand - x, 18), K_DUNKEL, K_PAPIER, yy + 4, 16);
    k_text(ctx, zeit, s_f_uhr, GRect(8, yy - 1, 100, 40), GTextAlignmentLeft, ausfall ? K_GRAU : K_TINTE);
    if (rs[0]) k_text(ctx, rs, s_f28b, GRect(100, yy + 1, 92, 34), GTextAlignmentRight, K_TINTE);
    if (x > xz) k_text(ctx, buf, s_f14b, GRect(xz, yy + 1, 40, 18), GTextAlignmentLeft, K_ORANGE);
    if (warn[0]) {
      const int wx = x + k_breite(an, s_f14b) + 4;
      if (wx < rand) k_text(ctx, warn, s_f14b, GRect(wx, yy + 1, rand - wx, 18), GTextAlignmentLeft, K_ROT);
    }
  }
}

// Klar: Zeitachse bei x=12 — Fahrt rot durchgezogen, Fußweg und Umstieg grau gepunktet; Kreise für Start/Ziel
// (voll), Halt (Ring), Zwischenhalt (klein). Halt: Zeit und Name in Gothic 24 fett, Steig als dunkles Kästchen rechts.
// Zwischenhalte und Abschnitte in Gothic 18 (bis 0.6.4: 18 und 14, Achse bei x=52).
#define K_AX 12
#define KD_X 26
static bool d_fahrt(int i) { return i >= 0 && i < s_dn && (Z_ART(s_dz[i].art) == Z_FAHRT || Z_ART(s_dz[i].art) == Z_ZWISCHEN); }
static void k_achse(GContext *ctx, int y0, int y1, bool fahrt, bool vorbei) {
  if (fahrt) { k_flaeche(ctx, GRect(K_AX - 1, y0, 3, y1 - y0), vorbei ? K_GRAU : K_ROT); return; }
  for (int y = y0; y < y1; y += 4) k_flaeche(ctx, GRect(K_AX - 1, y, 3, 2), K_GRAU);
}
static int k_steig_w(const char *re) { const int w = k_breite(re, s_f18b) + 8; return w < 18 ? 18 : w; }
static int k_name_x(void) { return KD_X + k_breite("00:00", s_f24b) + 6; }
static bool klar_einzeilig(const Zeile *z) {
  if (!s_f24b) return true;
  const int rand = 196 - (z->re[0] ? k_steig_w(z->re) + 4 : 0);
  return k_name_x() + k_breite(z->text, s_f24b) <= rand;
}
// Jede Zeile zeichnet ihren Text zuerst (Lauftext übermalt links und rechts), dann Achse, Punkt, Zeit und Steig
static void k_d_zeile(GContext *ctx, int b, int y, int32_t now) {
  const int i = s_bz[b] & 0x7F;
  const bool zweite = s_bz[b] & 0x80;
  const Zeile *z = &s_dz[i];
  const int a = Z_ART(z->art), mitte = y + 12;
  const bool vorbei = zeile_vorbei(i, now);
  const GColor haupt = vorbei ? K_GRAU : K_TINTE, neben = vorbei ? K_GRAU : K_DUNKEL;
  if (a >= Z_FUSS) {
    const GColor c = (Z_WARN(z->art) && (zweite || a == Z_UMSTIEG)) ? K_ROT : (zweite ? neben : haupt);
    lauf_k(ctx, zweite ? z->zus : z->text, zweite ? s_f18 : s_f18b, GRect(KD_X, y - 1, 196 - KD_X, 24), c, K_PAPIER, y, KD_H);
    k_achse(ctx, y, y + KD_H, a == Z_FAHRT, vorbei);
    return;
  }
  if (zweite) {                                        // Name des Halts in eigener Zeile
    lauf_k(ctx, z->text, s_f24b, GRect(KD_X, y - 6, 196 - KD_X, 30), haupt, K_PAPIER, y, KD_H);
    if (a != Z_ZIEL) k_achse(ctx, y, y + KD_H, d_fahrt(i + 1), vorbei);
    return;
  }
  char zeit[8] = "";
  if (z->t) { int h, m; berlin_hm(z->t, &h, &m); snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m); }
  if (a == Z_ZWISCHEN) {
    const int x = KD_X + k_breite("00:00", s_f18) + 6;
    lauf_k(ctx, z->text, s_f18, GRect(x, y - 1, 196 - x, 24), neben, K_PAPIER, y, KD_H);
  } else {
    int rand = 196;
    if (z->re[0]) rand = 196 - k_steig_w(z->re) - 4;
    if (!d_umbruch(b)) lauf_k(ctx, z->text, s_f24b, GRect(k_name_x(), y - 6, rand - k_name_x(), 30), haupt, K_PAPIER, y, KD_H);
  }
  if (a != Z_START) k_achse(ctx, y, mitte, d_fahrt(i - 1) || a == Z_ZWISCHEN, vorbei);
  if (a != Z_ZIEL) k_achse(ctx, mitte, y + KD_H, d_fahrt(i + 1) || a == Z_ZWISCHEN, vorbei);
  if (a == Z_ZWISCHEN) {
    graphics_context_set_fill_color(ctx, vorbei ? K_GRAU : K_ROT);
    graphics_fill_circle(ctx, GPoint(K_AX, mitte), 3);
    if (zeit[0]) k_text(ctx, zeit, s_f18, GRect(KD_X, y - 1, 60, 24), GTextAlignmentLeft, neben);
    return;
  }
  graphics_context_set_fill_color(ctx, a == Z_HALT ? K_PAPIER : haupt);
  graphics_fill_circle(ctx, GPoint(K_AX, mitte), 6);
  graphics_context_set_stroke_color(ctx, haupt);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_circle(ctx, GPoint(K_AX, mitte), 6);
  graphics_context_set_stroke_width(ctx, 1);
  if (zeit[0]) k_text(ctx, zeit, s_f24b, GRect(KD_X, y - 6, 80, 30), GTextAlignmentLeft, haupt);
  if (z->re[0]) {
    const int sw = k_steig_w(z->re);
    k_flaeche(ctx, GRect(196 - sw, y + 2, sw, 20), neben);
    k_text(ctx, z->re, s_f18b, GRect(196 - sw, y - 2, sw, 24), GTextAlignmentCenter, K_PAPIER);
  }
}
static const char *seiten_titel(bool klar) {           // Titel der Details: Ziel der Strecke bzw. Haltestelle
  if (s_fahrt) return s_ftitel;
  if (s_rubrik == 1) { const Route *r = aktuelle_route(); return klar && r->klar[0] ? r->klar : r->name; }
  const Strecke *s = aktuelle();
  return klar && s->klar[0][0] ? s->klar[0] : s->name[0];
}
static void k_detail(GContext *ctx) {
  const int32_t now = jetzt();
  char li[16], re[16], fuss[40];
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  detail_kopftext(li, sizeof(li), re, sizeof(re), true);
  k_kopf(ctx, seiten_titel(true), K_PAPIER);
  if (s_dn < 0) k_text(ctx, "Lade ...", s_f28b, GRect(0, 80, 200, 34), GTextAlignmentCenter, K_TINTE);
  else if (s_dn == 0) k_text(ctx, s_rubrik == 1 ? "keine Verbindung" : "keine Fahrt", s_f24b, GRect(0, 84, 200, 30), GTextAlignmentCenter, K_DUNKEL);
  else for (int k = 0; k < d_sichtbar() && s_doben + k < s_bn; k++) {
    const int b = s_doben + k, y = KD_Y0 + k * KD_H;
    if (!d_markiert(b)) { k_d_zeile(ctx, b, y, now); continue; }
    k_flaeche(ctx, GRect(0, y, 200, KD_H), K_TINTE);   // aktueller Schritt der Fahrt: Balken wie im Menü (0.13.0)
    const Palette alt = pal_balken();
    k_d_zeile(ctx, b, y, now);
    s_pal = alt;
  }
  snprintf(fuss, sizeof(fuss), "%s%s%s", re, re[0] && li[0] ? " · " : "", li);   // "an 10:41 · 1/3"
  k_fuss(ctx, fuss, false, K_TINTE, s_dstand);
}

// Klar: Buchstabenrad — eingegebener Text, darunter die Buchstaben (Mitte schwarz hinterlegt), dann die Treffer
static void k_suche(GContext *ctx) {
  char buf[40], eins[2] = { 0, 0 };
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  k_kopf(ctx, s_ltitel, K_PAPIER);
  graphics_context_set_stroke_color(ctx, K_DUNKEL);
  graphics_draw_round_rect(ctx, GRect(6, 32, 188, 32), 4);
  such_anzeige(buf, sizeof(buf));
  int w = k_breite(buf, s_f24b), x = 12;
  if (w > 160) x = 172 - w;
  k_text(ctx, buf, s_f24b, GRect(x, 32, 400, 30), GTextAlignmentLeft, K_TINTE);
  eins[0] = rad_zeichen(0);
  k_text(ctx, eins, s_f24b, GRect(x + w + 2, 32, 30, 30), GTextAlignmentLeft, K_GRAU);
  k_flaeche(ctx, GRect(0, 33, 6, 30), K_PAPIER);
  graphics_context_set_fill_color(ctx, K_TINTE);
  graphics_fill_rect(ctx, GRect(80, 72, 40, 42), 6, GCornersAll);
  k_text(ctx, eins, s_f28b, GRect(80, 74, 40, 34), GTextAlignmentCenter, K_PAPIER);
  for (int d = -2; d <= 2; d++) {
    if (!d) continue;
    eins[0] = rad_zeichen(d);
    k_text(ctx, eins, s_f24b, GRect(100 + d * 38 - 15, 78, 30, 30), GTextAlignmentCenter, d == -1 || d == 1 ? K_DUNKEL : K_GRAU);
  }
  for (int k = 0; k < 3; k++) if (treffer_zeile(k, buf, sizeof(buf))) {
    k_text(ctx, buf, s_f18, GRect(8, 122 + k * 26, 184, 24), GTextAlignmentLeft, K_DUNKEL);
    graphics_context_set_stroke_color(ctx, K_GRAU);
    graphics_draw_line(ctx, GPoint(8, 146 + k * 26), GPoint(192, 146 + k * 26));
  }
  k_fuss(ctx, s_such[0] ? "Select lang: suchen" : "", false, K_TINTE, 0);
}

static void k_rubrik(GContext *ctx) {
  if (!s_rubrik_timer) return;
  graphics_context_set_fill_color(ctx, K_TINTE);
  graphics_fill_rect(ctx, GRect(16, 92, 168, 44), 8, GCornersAll);
  k_text(ctx, s_rubrik ? "Strecken" : "Abfahrten", s_f24b, GRect(16, 98, 168, 30), GTextAlignmentCenter, K_PAPIER);
}

// Fuß der Anzeige: Quelle und Zustand links mit Punkt, Stand rechts (Papier und Signal)
static void k_anzeige_fuss(GContext *ctx) {
  char buf[48];
  int32_t stand = 0;
  const char *quelle = "";
  const int status = seiten_status(&stand, &quelle);
  GColor farbe = K_GRAU;
  switch (status) {
    case ST_LADE:   snprintf(buf, sizeof(buf), "Lade ..."); break;
    case ST_NETZ:   snprintf(buf, sizeof(buf), "Kein Netz"); farbe = GColorRed; break;
    case ST_FEHLER: snprintf(buf, sizeof(buf), "Fehler"); farbe = GColorRed; break;
    case ST_STANDORT: snprintf(buf, sizeof(buf), "Kein Standort"); farbe = GColorRed; break;
    case ST_SOLL: case ST_LIVE: {
      const bool rmv = !strncmp(quelle, "RMV", 3), db = strchr(quelle, '+') != NULL;   // "RMV+DB" / "TR+DB" seit 0.9.0; strchr statt strstr spart 0,8 KB (0.16.0)
      if (!strncmp(quelle, "AN", 2)) snprintf(buf, sizeof(buf), "Ankunft bis %s", quelle + 2);   // Ankommen um (0.11.0)
      else snprintf(buf, sizeof(buf), "%s%s %s", rmv ? "RMV" : "Transitous", db ? " + DB" : "", status == ST_LIVE ? "live" : "Fahrplan");
      farbe = status == ST_LIVE ? GColorFromHEX(0x55FF00) : GColorFromHEX(0xFFAA00);
      break;
    }
    default: buf[0] = '\0';
  }
  k_fuss(ctx, buf, buf[0] != '\0', farbe, (status == ST_SOLL || status == ST_LIVE) ? stand : 0);   // Stand rechts
}

static void meter_text(char *buf, size_t n, int m) {   // "120 m", ab 1 km "1,2 km" (Phosphor: "120M", "1.2KM")
  if (m >= 1000) snprintf(buf, n, T("%d.%dKM", "%d,%d km"), m / 1000, (m % 1000) / 100);
  else snprintf(buf, n, T("%dM", "%d m"), m);
}
static void k_anzeige(GContext *ctx) {
  const int32_t now = jetzt();
  char buf[48];
  int h, m;
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  k_flaeche(ctx, GRect(0, 0, 200, 40), K_TINTE);
  berlin_hm(now, &h, &m);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  k_text(ctx, buf, s_f_uhr, GRect(64, 1, 130, 40), GTextAlignmentRight, K_PAPIER);   // 0.8.0: Uhrzeit rechts
  seitenzeichen(buf, sizeof(buf), false);                // Rubrik und Seite: "A2/5", "S1/3"
  k_text(ctx, buf, s_f14b, GRect(7, 1, 84, 18), GTextAlignmentLeft, K_LGRAU);
  const char *rub = s_rubrik == 1 ? (s_sofort ? "Strecke ab hier" : "Strecken") : (s_hier ? "Abfahrten hier" : "Abfahrten");
  if (s_rubrik == 0 && s_hier && s_hier_m > 0) {       // Abfahrten hier: mit Entfernung zur Haltestelle (0.15.0)
    char m[16];
    meter_text(m, sizeof(m), s_hier_m);
    snprintf(buf, sizeof(buf), "%s · %s", rub, m);
    rub = buf;
  }
  k_text(ctx, rub, s_f14, GRect(7, 18, 110, 18), GTextAlignmentLeft, K_LGRAU);

  if (s_rubrik == 1) {
    if (zeigt_route()) k_route(ctx, aktuelle_route(), now);
    else if (s_ranzahl == 0) {
      k_text(ctx, "Keine Strecken", s_f24b, GRect(0, 74, 200, 30), GTextAlignmentCenter, K_TINTE);
      graphics_context_set_text_color(ctx, K_DUNKEL);
      graphics_draw_text(ctx, "Select lang öffnet das Menü: Neu anlegen", s_f18, GRect(16, 108, 168, 50),
                         GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
    }
  } else if (zeigt_seite()) {
    k_seite(ctx, aktuelle(), now);
  } else if (s_anzahl == 0) {
    k_text(ctx, "Keine Abfahrten", s_f24b, GRect(0, 74, 200, 30), GTextAlignmentCenter, K_TINTE);
    graphics_context_set_text_color(ctx, K_DUNKEL);
    graphics_draw_text(ctx, "Select lang öffnet das Menü: Neu anlegen", s_f18, GRect(16, 108, 168, 50),
                       GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  }

  k_anzeige_fuss(ctx);
  k_rubrik(ctx);
}

// ---------- Startseite (0.15.0, Schalter STARTSEITE, Standard aus) ----------
// Abfahrten der nächsten Haltestelle wie ABFAHRTEN HIER (Platz HIER, Nummer 0) und zwei Schilder wie auf der
// Bestätigungsseite: oben Hoch = Rubrik Abfahrten, unten Runter = Rubrik Strecken. Kopf: Name der Haltestelle und
// Uhrzeit, links neben dem oberen Schild die Entfernung. Je Abfahrt Linie, Endziel, darunter Zeit, Verspätung, Steig.
#define ST_Y0 62           // erste Abfahrt (beide Ansichten)
#define ST_DY 36
#define ST_SCHILD1 30      // oberes und unteres Schild (y)
#define ST_SCHILD2 178
static void k_schild(GContext *ctx, int y, const char *t) {   // Schild mit Spitze zur Taste rechts, 24 px hoch
  const int w = k_breite(t, s_f18b) + 14;
  graphics_context_set_fill_color(ctx, K_TINTE);
  graphics_fill_rect(ctx, GRect(188 - w, y, w, 24), 5, GCornersLeft);
  for (int i = 0; i <= 11; i++) graphics_fill_rect(ctx, GRect(188 + i, y + i, 1, 24 - 2 * i), 0, GCornerNone);
  k_text(ctx, t, s_f18b, GRect(188 - w, y - 2, w - 4, 24), GTextAlignmentRight, K_PAPIER);
}
static void k_start_zeile(GContext *ctx, const Strecke *s, int i, int yy, int32_t now) {
  const int v = s->del[i];
  int bw = k_breite(s->lin[i], s_f18b) + 10;
  if (bw < 28) bw = 28;
  const int xt = 6 + bw + 6;
  char zeit[8], buf[12], rs[8] = "";
  int h, m;
  const int vz = (v == AUSFALL || s_abfahrt == ABF_AKTUELL) ? 0 : v;   // aktuell: Zeit mit Verspätung, orange
  berlin_hm(s->dep[i] - vz * 60, &h, &m);
  snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
  if (v != AUSFALL) { const int min = (s->dep[i] - now) / 60; if (min < 100) snprintf(rs, sizeof(rs), "%d'", min); }
  const int rand = rs[0] ? 194 - k_breite(rs, s_f28b) - 6 : 194;
  const int hx = s->heim[i] ? 15 : 0;                                // Heimathaltestelle: Haus vor dem Endziel (0.16.0)
  lauf_k(ctx, s->endk[i][0] ? s->endk[i] : s->end[i], s_f18b, GRect(xt + hx, yy - 4, rand - xt - hx, 24), K_TINTE, K_PAPIER, yy, 18);   // zuerst
  if (hx) haus(ctx, xt, yy + 5, s->heim[i], K_TINTE, K_PAPIER);
  graphics_context_set_stroke_color(ctx, K_GRAU);
  graphics_draw_line(ctx, GPoint(6, yy - 3), GPoint(194, yy - 3));
  graphics_context_set_fill_color(ctx, v == AUSFALL ? K_GRAU : K_ROT);
  graphics_fill_rect(ctx, GRect(6, yy + 3, bw, 24), 4, GCornersAll);
  k_text(ctx, s->lin[i], s_f18b, GRect(6, yy + 1, bw, 24), GTextAlignmentCenter, GColorWhite);
  int x = xt;
  k_text(ctx, zeit, s_f14b, GRect(x, yy + 15, 60, 18), GTextAlignmentLeft, v == AUSFALL ? K_GRAU : (v != vz ? K_ORANGE : K_TINTE));
  x += k_breite(zeit, s_f14b) + 4;
  if (v == AUSFALL) k_text(ctx, "fällt aus", s_f14b, GRect(x, yy + 15, 90, 18), GTextAlignmentLeft, K_ROT);
  else {
    if (vz) { snprintf(buf, sizeof(buf), "%+d'", vz); k_text(ctx, buf, s_f14b, GRect(x, yy + 15, 40, 18), GTextAlignmentLeft, K_ORANGE); x += k_breite(buf, s_f14b) + 4; }
    if (s->steig[i][0]) {
      int sw = k_breite(s->steig[i], s_f14b) + 6;
      if (sw < 13) sw = 13;
      graphics_context_set_fill_color(ctx, K_DUNKEL);
      graphics_fill_rect(ctx, GRect(x, yy + 19, sw, 13), 2, GCornersAll);
      k_text(ctx, s->steig[i], s_f14b, GRect(x, yy + 15, sw, 16), GTextAlignmentCenter, K_PAPIER);
    }
  }
  if (rs[0]) k_text(ctx, rs, s_f28b, GRect(100, yy - 3, 94, 34), GTextAlignmentRight, K_TINTE);
}
static void k_start(GContext *ctx) {
  const int32_t now = jetzt();
  const Strecke *s = &s_str[HIER];
  char buf[16];
  int idx[MAXD];
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  const int n = naechste(s, now, idx);
  for (int k = 0; k < n; k++) k_start_zeile(ctx, s, idx[k], ST_Y0 + k * ST_DY, now);
  if (!n && s->status != ST_LADE)
    k_text(ctx, s->status == ST_STANDORT ? "kein Standort" : "keine Fahrt", s_f18b, GRect(6, ST_Y0 + 4, 188, 24), GTextAlignmentLeft, K_DUNKEL);
  k_kopf(ctx, k_name0(s), K_PAPIER);
  if (s_hier_m > 0) { meter_text(buf, sizeof(buf), s_hier_m); k_text(ctx, buf, s_f18b, GRect(6, ST_SCHILD1 - 2, 80, 24), GTextAlignmentLeft, K_TINTE); }
  k_schild(ctx, ST_SCHILD1, "Abfahrten");
  k_schild(ctx, ST_SCHILD2, "Strecken");
  k_anzeige_fuss(ctx);
}

// Info-Zeilen über einer Liste (0.7.0, Vorschlag nach verpasstem Anschluss); nur Klar und Phosphor
static int info_n(void) { int n = s_linfo[0] ? 1 : 0; for (const char *c = s_linfo; *c; c++) n += *c == '|'; return n > 4 ? 4 : n; }
static void info_zeile(int k, char *buf, size_t n) {
  const char *c = s_linfo;
  for (int i = 0; i < k && c; i++) { c = strchr(c, '|'); if (c) c++; }
  size_t j = 0;
  while (c && *c && *c != '|' && j + 1 < n) buf[j++] = *c++;
  buf[j] = '\0';
}
static int liste_versatz(void) {
  const int n = info_n();
  if (!n || s_modus != M_LISTE) return 0;
  return s_layout == LAYOUT_PHOSPHOR ? n * 16 + 6 : n * 20 + 4;
}
// Listen (0.16.0): \x01/\x02 vorn (vom Handy, WEITERE FAHRTEN) = Haus rechts wie auf der Seite. Werteliste, Zahl und
// Heimathaltestelle: Auswahlkreis rechts, voll = aktueller Wert (-1 = kein Kreis). Ein Wert gilt sofort beim Wählen,
// die Liste bleibt offen, damit man die Folge sieht und gleich wieder ändern kann (Wunsch Seb 2026-10-16)
static int l_haus(const char *t) { return t[0] == 1 || t[0] == 2 ? t[0] : 0; }
static int einst_wert(int s);
static int s_lset;                 // Einstellung der offenen Werteliste
#define EIGEN 99           // OHNE TASTE: Eintrag „nach … min“ der Werteliste öffnet die Zahl (1–60 min)
static int l_marke(int i) {
  if (s_lart == L_ZAHL) return i > 0 ? i == s_ohne : -1;
  if (s_lart == L_HEIM) return i == 0 ? -1 : (s_lakt[i] == A_HEIM_WEG) != (s_heim[0][0] != '\0');
  if (s_lart != L_WERTE || trenner(i)) return -1;
  const int w = s_lwert[i], v = einst_wert(s_lset);
  return s_lset == S_OHNE && w == EIGEN ? (v > 0 && v != 5) : w == v;
}
// Einstellung (0.15.0): oben der Name, darunter der Wert als Satzteil; gewählt: Balken, der Wert läuft, wenn zu lang
static void k_zeile2(GContext *ctx, const char *t, int y, bool gew) {
  char name[LTXT];
  const char *bar = strchr(t, '|');
  snprintf(name, sizeof(name), "%.*s", bar ? (int)(bar - t) : (int)strlen(t), t);
  const char *wert = bar ? bar + 1 : "";
  const GColor bg = gew ? K_BALKEN : K_PAPIER, fg = gew ? K_BALKENT : K_TINTE;
  if (gew) {
    k_flaeche(ctx, GRect(0, y, 200, K_ZEILE2), bg);
    lauf_k(ctx, wert, s_f14b, GRect(6, y + 16, 188, 20), fg, bg, y + 19, 18);
  } else {
    k_text(ctx, wert, s_f14b, GRect(6, y + 16, 188, 20), GTextAlignmentLeft, fg);
    graphics_context_set_stroke_color(ctx, K_GRAU);
    graphics_draw_line(ctx, GPoint(6, y + K_ZEILE2 - 1), GPoint(194, y + K_ZEILE2 - 1));
  }
  k_text(ctx, name, s_f18b, GRect(6, y - 3, 188, 24), GTextAlignmentLeft, fg);
}
static void k_liste(GContext *ctx) {
  char buf[32];
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  k_kopf(ctx, s_ltitel, K_PAPIER);
  if (s_modus == M_LADE) {
    k_text(ctx, "Lade ...", s_f28b, GRect(0, 70, 200, 34), GTextAlignmentCenter, K_TINTE);
    k_text(ctx, s_ladetext, s_f18, GRect(0, 108, 200, 24), GTextAlignmentCenter, K_DUNKEL);
    k_fuss(ctx, "", false, K_TINTE, 0);
    return;
  }
  const int kv = liste_versatz();
  for (int k = 0; k < info_n(); k++) {
    char z[48];
    info_zeile(k, z, sizeof(z));
    k_text(ctx, z, k == 1 ? s_f18b : s_f18, GRect(6, K_Y0 - 3 + k * 20, 188, 24), GTextAlignmentLeft, k == 1 ? K_TINTE : K_DUNKEL);
  }
  if (kv) k_flaeche(ctx, GRect(6, K_Y0 + kv - 3, 188, 1), K_GRAU);
  for (int k = 0; k < l_zeilen() && s_loben + k < s_lanz; k++) {
    const int i = s_loben + k, y = K_Y0 + kv + k * l_hoehe();
    if (y + l_hoehe() > 208) break;
    const char *t = s_ltext[i][0] ? s_ltext[i] : "...";
    if (s_lzwei) { k_zeile2(ctx, t, y, i == s_lsel); continue; }
    const int hs = l_haus(t), mk = l_marke(i), w = (hs || mk >= 0) ? 168 : 188;   // rechts Haus bzw. Kreis (0.16.0)
    if (hs) t++;
    const bool gew = i == s_lsel;
    const GColor fg = gew ? K_BALKENT : K_TINTE, bg = gew ? K_BALKEN : K_PAPIER;
    if (gew) {                                                     // gewählte Zeile: Balken, Lauftext
      k_flaeche(ctx, GRect(0, y, 200, K_ZEILE), bg);
      lauf_k(ctx, t, s_f18b, GRect(6, y - 3, w, 24), fg, bg, y, K_ZEILE);
    } else {
      if (trenner(i)) lauf_k(ctx, t, s_f18, GRect(6, y - 3, w, 24), fg, bg, y, K_ZEILE);   // Erklärzeile läuft (0.15.0)
      else k_text(ctx, t, s_f18, GRect(6, y - 3, w, 24), GTextAlignmentLeft, fg);
      graphics_context_set_stroke_color(ctx, K_GRAU);
      graphics_draw_line(ctx, GPoint(6, y + K_ZEILE - 1), GPoint(194, y + K_ZEILE - 1));
    }
    if (hs) haus(ctx, 181, y + 6, hs, fg, bg);
    if (mk >= 0) l_kreis(ctx, 185, y + 11, mk, fg);
  }
  if (s_lanz > l_zeilen()) snprintf(buf, sizeof(buf), "%d/%d", s_lsel + 1, s_lanz);
  else buf[0] = '\0';
  k_fuss(ctx, buf, false, K_TINTE, 0);
}

// Klar: Bestätigungsseite (0.8.0). Rechts auf Höhe der oberen Taste ein schwarzes Schild mit Pfeil.
static void k_frage(GContext *ctx) {
  char q[sizeof(s_ftext) + 2];
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  k_flaeche(ctx, GRect(0, 0, 200, 26), K_TINTE);
  k_text(ctx, s_fkopf, s_f18b, GRect(6, -1, 188, 24), GTextAlignmentLeft, K_PAPIER);
  graphics_context_set_fill_color(ctx, K_TINTE);
  graphics_fill_rect(ctx, GRect(84, 34, 104, 40), 6, GCornersLeft);
  for (int i = 0; i <= 11; i++) graphics_fill_rect(ctx, GRect(188 + i, 34 + i * 20 / 11, 1, 40 - 2 * (i * 20 / 11)), 0, GCornerNone);   // Spitze
  k_text(ctx, "Hier", s_f18b, GRect(90, 33, 96, 22), GTextAlignmentRight, K_PAPIER);
  k_text(ctx, "bestätigen", s_f18b, GRect(84, 51, 102, 22), GTextAlignmentRight, K_PAPIER);
  snprintf(q, sizeof(q), "%s?", s_ftext);
  graphics_context_set_text_color(ctx, K_TINTE);
  graphics_draw_text(ctx, q, s_f24b, GRect(8, 88, 184, 110), GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
  k_fuss(ctx, "Zurück: nein", false, K_TINTE, 0);
}

// ---------- Ansicht „Phosphor“: Radar-Grün auf Schwarz, Pixelschrift (Entwurf linie8-skin-phosphor-dauer.png) ----------
// Farben wie das Watchface Phosphor. Schrift: die LED-Glyphen, 2- bis 4-fach als Pixelblöcke gezeichnet.
// Farben zur Laufzeit (farben_setzen): grün oder weiß, normal oder invertiert (heller Grund)
#define P_HG     s_pal.p_hg
#define P_TEXT   s_pal.p_text
#define P_GRAU   s_pal.p_grau
#define P_GITTER s_pal.p_gitter
#define P_SCHWACH s_pal.p_schwach  // Gitterfarbe als Schrift (vorbei, Rad); bei hohem Kontrast volle Schrift
#define P_HELL   s_pal.p_hell
#define P_CYAN   s_pal.p_cyan
#define P_WARN   s_pal.p_warn
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
// Phosphor: Pixeltext zwischen x0 und x1 (Faktor sc); zu lang -> läuft (Regel bei lauf_versatz). Pixel lassen sich
// beschneiden, die Reihenfolge in der Zeile ist hier egal.
static void lauf_p(GContext *ctx, const char *t, int x0, int x1, int y, int sc, GColor c) {
  const int w = P_W(t, sc);
  const int v = w > x1 - x0 ? lauf_versatz(w) : 0;
  p_text(ctx, F35, F35_N, F35_H, t, x0 - v, y, sc, c, x0, x1);
  if (v) p_text(ctx, F35, F35_N, F35_H, t, x0 - v + w + LAUF_LUECKE, y, sc, c, x0, x1);
}
#define P_KLEIN(s, x, y, c)        p_text(ctx, F35, F35_N, F35_H, s, x, y, 2, c, 0, 200)
#define P_GROSS(s, x, y, sc, c)    p_text(ctx, F57, F57_N, F57_H, s, x, y, sc, c, 0, 200)

static void p_punktlinie(GContext *ctx, int y) {
  graphics_context_set_fill_color(ctx, P_GITTER);
  for (int x = 0; x < 200; x += 2) graphics_fill_rect(ctx, GRect(x, y, 1, 1), 0, GCornerNone);
}
// Kopf (0.8.0): links der Titel, rechts die Uhrzeit hell; Fuß: links Text, rechts der Stand (grau, ab 2 min gelb)
static void p_kopf(GContext *ctx, const char *titel, GColor farbe) {
  char uhr[8];
  uhr_text(uhr, sizeof(uhr));
  const int ux = 196 - P_W(uhr, 2);
  P_KLEIN(uhr, ux, 6, P_HELL);
  lauf_p(ctx, titel, 4, ux - 8, 6, 2, farbe);
  p_punktlinie(ctx, 20);
}
static void p_fuss(GContext *ctx, const char *links, int32_t stand) {
  char st[16];
  stand_text(st, sizeof(st), stand, false);
  const int sx = st[0] ? 196 - P_W(st, 2) : 200;
  p_punktlinie(ctx, 207);
  p_text(ctx, F35, F35_N, F35_H, links, 4, 213, 2, P_GRAU, 0, sx - 8);
  if (st[0]) P_KLEIN(st, sx, 213, stand_alt(stand) ? P_WARN : P_GRAU);
}
// Vorschlag FRUEHER DA (0.8.0) an Stelle der dritten Zeile
static void p_vorschlag(GContext *ctx, const char *vt, int yy) {
  char a[VTXT], b[VTXT];
  vorschlag_teil(vt, 0, a, sizeof(a)); vorschlag_teil(vt, 1, b, sizeof(b));
  p_text(ctx, F35, F35_N, F35_H, a, 4, yy + 2, 2, P_WARN, 0, 196);
  lauf_p(ctx, b, 4, 196, yy + 17, 2, P_GRAU);
}

#define P_NAME_X 42        // Haltestellenname hinter "AB", Ziel hinter "NACH"
static void p_name(GContext *ctx, const char *vor, const char *name, int y, GColor c) {   // Name läuft, "AB" steht
  P_KLEIN(vor, 4, y, P_GRAU);
  lauf_p(ctx, name, P_NAME_X, 196, y, 2, c);
}

// Seite in Phosphor (0.50): AB Haltestelle, NACH Ziel; drei Abfahrten. Ohne Ziel je Fahrt das Endziel darunter.
static void p_seite(GContext *ctx, const Strecke *s, int32_t now) {
  const bool ziel = hat_ziel(s);
  p_name(ctx, "AB", s->name[0], 59, P_HELL);
  if (ziel) p_name(ctx, "NACH", s->name[1], 75, P_GRAU);
  p_punktlinie(ctx, ziel ? 92 : 76);
  const int y = ziel ? 101 : 84, dy = ziel ? 38 : 43;
  int idx[MAXD];
  int n = naechste(s, now, idx);
  if (vt_str(s)[0] && n > MAXD - 1) n = MAXD - 1;
  if (vt_str(s)[0]) p_vorschlag(ctx, vt_str(s), y + (MAXD - 1) * dy);
  if (n == 0) P_KLEIN("KEINE FAHRT", 4, y + 6, P_GRAU);
  for (int k = 0; k < n; k++) {
    const int i = idx[k], yy = y + k * dy, v = s->del[i];
    const bool ausfall = v == AUSFALL;
    const char *lin = s->lin[i];
    const int hx = !ziel && s->heim[i] ? 15 : 0;                  // Heimathaltestelle: Haus vor dem Endziel (0.16.0)
    if (!ziel && s->end[i][0]) lauf_p(ctx, s->end[i], 4 + hx, 196, yy + 25, 2, P_GRAU);
    if (hx) haus(ctx, 4, yy + 25, s->heim[i], s->heim[i] == 2 ? P_TEXT : P_GRAU, P_HG);
    // Linie invers: grünes Kästchen, schwarze Schrift; Steig als dunkle Lasche dahinter
    const bool gross = gross_moeglich(lin);
    const int lw = (gross ? P_GW(lin, 2) : P_W(lin, 2)) + 8;
    graphics_context_set_fill_color(ctx, ausfall ? P_GRAU : P_TEXT);
    graphics_fill_rect(ctx, GRect(4, yy, lw, 21), 0, GCornerNone);
    if (gross) P_GROSS(lin, 8, yy + 4, 2, P_HG);
    else P_KLEIN(lin, 8, yy + 6, P_HG);
    int x = 4 + lw;
    if (s->steig[i][0]) {
      const int sw = P_W(s->steig[i], 2) + 6;
      graphics_context_set_fill_color(ctx, P_GITTER);
      graphics_fill_rect(ctx, GRect(x + 1, yy, sw, 21), 0, GCornerNone);
      P_KLEIN(s->steig[i], x + 4, yy + 6, P_HELL);
      x += 1 + sw;
    }
    x += 5;
    char zeit[8], buf[12], ds[8] = "", rs[8] = "";
    int h, m;
    const int vz = (ausfall || s_abfahrt == ABF_AKTUELL) ? 0 : v;   // aktuell: Zeit mit Verspätung, gelb
    berlin_hm(s->dep[i] - vz * 60, &h, &m);                     // vorne die Fahrplanzeit (oder die aktuelle)
    snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    if (ausfall) {
      P_GROSS(zeit, x, yy, 3, P_GRAU);
      P_KLEIN("FAELLT AUS", 196 - P_W("FAELLT AUS", 2), yy + 6, P_WARN);
      continue;
    }
    P_GROSS(zeit, x, yy, 3, v != vz ? P_WARN : P_TEXT);
    const int xz = x + P_GW(zeit, 3) + 3;                          // Spalte: oben Verspätung, unten Fahrtdauer
    int oben = xz;
    if (vz != 0) {
      snprintf(buf, sizeof(buf), "%+d'", vz);
      P_KLEIN(buf, xz, yy, P_WARN);
      oben = xz + P_W(buf, 2);
    }
    if (s_dauer && s->dur[i] > 0) snprintf(ds, sizeof(ds), "%d'", s->dur[i]);
    const int min = (s->dep[i] - now) / 60;                        // Restminuten mit Verspätung
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

// Phosphor: Strecke (0.6.1) — NACH Ziel, AB Start; je Verbindung Losgehzeit groß, oben Ankunft, unten Linien
static void p_route(GContext *ctx, const Route *r, int32_t now) {
  p_name(ctx, "NACH", r->name, 59, P_HELL);
  p_name(ctx, "AB", r->von[0] ? r->von : "HIER", 75, P_GRAU);
  p_punktlinie(ctx, 92);
  int idx[MAXD];
  int n = route_naechste(r, now, idx);
  if (vt_rt(r)[0] && n > MAXD - 1) n = MAXD - 1;
  if (vt_rt(r)[0]) p_vorschlag(ctx, vt_rt(r), 101 + (MAXD - 1) * 38);
  if (n == 0 && r->status != ST_LADE) P_KLEIN(r->status == ST_STANDORT ? "KEIN STANDORT" : "KEINE VERBINDUNG", 4, 107, P_GRAU);
  for (int k = 0; k < n; k++) {
    const int i = idx[k], yy = 101 + k * 38;
    char zeit[8], an[16], rs[8], buf[12];
    int h, m;
    const bool ausfall = r->del[i] == AUSFALL;
    berlin_hm(r->los[i], &h, &m); snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
    P_GROSS(zeit, 4, yy, 3, ausfall ? P_GRAU : P_TEXT);
    const int xz = 4 + P_GW(zeit, 3) + 6;
    rs[0] = '\0';
    const int min = rest_min(r->los[i], now);
    if (min < 100) snprintf(rs, sizeof(rs), "%d'", min);
    int rsc = 3, rand = rs[0] ? 196 - P_GW(rs, 3) : 200;
    if (rs[0] && xz + P_W("AN 00:00", 2) + 4 > rand) { rsc = 2; rand = 196 - P_GW(rs, 2); }
    if (rs[0]) P_GROSS(rs, rand, rsc == 3 ? yy : yy + 7, rsc, P_TEXT);
    int x = xz;
    if (r->del[i] > 0 && !ausfall) { snprintf(buf, sizeof(buf), "+%d'", r->del[i]); P_KLEIN(buf, x, yy, P_WARN); x += P_W(buf, 2) + 6; }
    berlin_hm(r->an[i], &h, &m); snprintf(an, sizeof(an), "AN %02d:%02d", h, m);
    p_text(ctx, F35, F35_N, F35_H, an, x, yy, 2, P_GRAU, 0, rand - 4);
    const char *warn = route_warnung(r, i, false);
    char un[48];
    if (warn[0]) snprintf(un, sizeof(un), "%s", warn);
    else if (r->um[i]) snprintf(un, sizeof(un), "%s %dX", r->kette[i], r->um[i]);
    else snprintf(un, sizeof(un), "%s", r->kette[i]);
    lauf_p(ctx, un, xz, rand - 4, yy + 12, 2, warn[0] ? P_WARN : P_TEXT);
  }
}

// Phosphor: Zeitachse bei x=10 — Fahrt grün durchgezogen, Fußweg gepunktet; Quadrate statt Kreise (Pixel-Stil).
// Halt: Zeit und Name in Pixelschrift dreifach (bis 0.6.4 zweifach), Zwischenhalte und Abschnitte zweifach.
#define P_AX 10
#define PD_X 22
#define PD_NAME_X (PD_X + P_W("00:00", 3) + 9)
static void p_achse(GContext *ctx, int y0, int y1, bool fahrt, bool vorbei) {
  graphics_context_set_fill_color(ctx, fahrt ? (vorbei ? P_GITTER : P_TEXT) : P_GRAU);
  if (fahrt) { graphics_fill_rect(ctx, GRect(P_AX - 1, y0, 2, y1 - y0), 0, GCornerNone); return; }
  for (int y = y0; y < y1; y += 4) graphics_fill_rect(ctx, GRect(P_AX - 1, y, 2, 2), 0, GCornerNone);
}
static bool phosphor_einzeilig(const Zeile *z) {
  const int rand = 196 - (z->re[0] ? P_W(z->re, 2) + 6 + 4 : 0);
  return PD_NAME_X + P_W(z->text, 3) <= rand;
}
static void p_d_zeile(GContext *ctx, int b, int y, int32_t now) {
  const int i = s_bz[b] & 0x7F;
  const bool zweite = s_bz[b] & 0x80;
  const Zeile *z = &s_dz[i];
  const int a = Z_ART(z->art), mitte = y + 11;
  const bool vorbei = zeile_vorbei(i, now);
  const GColor haupt = vorbei ? P_GRAU : P_TEXT, neben = vorbei ? P_SCHWACH : P_GRAU;
  if (a >= Z_FUSS) {
    p_achse(ctx, y, y + PD_H, a == Z_FAHRT, vorbei);
    const GColor c = (Z_WARN(z->art) && (zweite || a == Z_UMSTIEG)) ? P_WARN : (zweite ? neben : (a == Z_FAHRT ? P_HELL : haupt));
    lauf_p(ctx, zweite ? z->zus : z->text, PD_X, 196, y + 6, 2, c);
    return;
  }
  if (zweite) {                                        // Name des Halts in eigener Zeile
    if (a != Z_ZIEL) p_achse(ctx, y, y + PD_H, d_fahrt(i + 1), vorbei);
    lauf_p(ctx, z->text, PD_X, 196, y + 4, 3, haupt);
    return;
  }
  if (a != Z_START) p_achse(ctx, y, mitte, d_fahrt(i - 1) || a == Z_ZWISCHEN, vorbei);
  if (a != Z_ZIEL) p_achse(ctx, mitte, y + PD_H, d_fahrt(i + 1) || a == Z_ZWISCHEN, vorbei);
  char zeit[8] = "";
  if (z->t) { int h, m; berlin_hm(z->t, &h, &m); snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m); }
  if (a == Z_ZWISCHEN) {
    graphics_context_set_fill_color(ctx, neben);
    graphics_fill_rect(ctx, GRect(P_AX - 2, mitte - 2, 4, 4), 0, GCornerNone);
    const int x = PD_X + P_W("00:00", 2) + 8;
    if (zeit[0]) P_KLEIN(zeit, PD_X, y + 6, neben);
    lauf_p(ctx, z->text, x, 196, y + 6, 2, neben);
    return;
  }
  graphics_context_set_fill_color(ctx, haupt);
  graphics_fill_rect(ctx, GRect(P_AX - 4, mitte - 4, 8, 8), 0, GCornerNone);
  if (a == Z_HALT) { graphics_context_set_fill_color(ctx, P_HG); graphics_fill_rect(ctx, GRect(P_AX - 2, mitte - 2, 4, 4), 0, GCornerNone); }
  if (zeit[0]) p_text(ctx, F35, F35_N, F35_H, zeit, PD_X, y + 4, 3, haupt, 0, 200);
  int rand = 196;
  if (z->re[0]) {                                     // Steig invers wie die Linie auf der Seite (0.13.0, passt in den Balken)
    const int sw = P_W(z->re, 2) + 6;
    rand = 196 - sw;
    graphics_context_set_fill_color(ctx, P_TEXT);
    graphics_fill_rect(ctx, GRect(rand, y + 3, sw, 16), 0, GCornerNone);
    P_KLEIN(z->re, rand + 3, y + 6, P_HG);
    rand -= 4;
  }
  if (!d_umbruch(b)) lauf_p(ctx, z->text, PD_NAME_X, rand, y + 4, 3, haupt);
}
static bool punkt_einzeilig(const Zeile *z) {
  return KLAR_ART ? klar_einzeilig(z) : phosphor_einzeilig(z);
}
static void p_detail(GContext *ctx) {
  const int32_t now = jetzt();
  char li[16], re[16], fuss[40];
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  detail_kopftext(li, sizeof(li), re, sizeof(re), false);
  p_kopf(ctx, seiten_titel(false), P_TEXT);
  if (s_dn < 0) p_text(ctx, F35, F35_N, F35_H, "LADE", 100 - P_W("LADE", 4) / 2, 90, 4, P_TEXT, 0, 200);
  else if (s_dn == 0) { const char *t = s_rubrik == 1 ? "KEINE VERBINDUNG" : "KEINE FAHRT"; P_KLEIN(t, 100 - P_W(t, 2) / 2, 100, P_GRAU); }
  else for (int k = 0; k < d_sichtbar() && s_doben + k < s_bn; k++) {
    const int b = s_doben + k, y = PD_Y0 + k * PD_H;
    if (!d_markiert(b)) { p_d_zeile(ctx, b, y, now); continue; }
    k_flaeche(ctx, GRect(0, y, 200, PD_H), P_TEXT);    // aktueller Schritt der Fahrt: Balken wie im Menü (0.13.0)
    const Palette alt = pal_balken();
    p_d_zeile(ctx, b, y, now);
    s_pal = alt;
  }
  if (s_fahrt) li[0] = '\0';                           // Phosphor: "AN 10:41 FAHRT" + Stand passt nicht in 192 px
  snprintf(fuss, sizeof(fuss), "%s%s%s", re, re[0] && li[0] ? " " : "", li);   // "AN 10:41 1/3"
  p_fuss(ctx, fuss, s_dstand);
}

// Phosphor: Buchstabenrad
static void p_suche(GContext *ctx) {
  char buf[40], eins[2] = { 0, 0 };
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  p_kopf(ctx, s_ltitel, P_GRAU);
  such_anzeige(buf, sizeof(buf));
  int w = P_W(buf, 3), x = 6;
  if (w > 170) x = 176 - w;
  p_text(ctx, F35, F35_N, F35_H, buf, x, 30, 3, P_TEXT, 4, 196);
  eins[0] = rad_zeichen(0);
  p_text(ctx, F35, F35_N, F35_H, eins, x + w + (buf[0] ? 4 : 0), 30, 3, P_GRAU, 4, 196);
  p_punktlinie(ctx, 52);
  graphics_context_set_fill_color(ctx, P_TEXT);
  graphics_fill_rect(ctx, GRect(80, 62, 40, 40), 0, GCornerNone);
  p_text(ctx, F35, F35_N, F35_H, eins, 100 - P_W(eins, 5) / 2, 70, 5, P_HG, 0, 200);
  for (int d = -2; d <= 2; d++) {
    if (!d) continue;
    eins[0] = rad_zeichen(d);
    p_text(ctx, F35, F35_N, F35_H, eins, 100 + d * 36 - P_W(eins, 3) / 2, 75, 3, d == -1 || d == 1 ? P_GRAU : P_SCHWACH, 0, 200);
  }
  for (int k = 0; k < 3; k++) if (treffer_zeile(k, buf, sizeof(buf))) p_text(ctx, F35, F35_N, F35_H, buf, 4, 118 + k * 22, 2, P_GRAU, 0, 196);
  p_fuss(ctx, s_such[0] ? "LANG: SUCHEN" : "", 0);
}

static void p_rubrik(GContext *ctx) {
  if (!s_rubrik_timer) return;
  const char *t = s_rubrik ? "STRECKEN" : "ABFAHRTEN";
  graphics_context_set_fill_color(ctx, P_TEXT);
  graphics_fill_rect(ctx, GRect(10, 94, 180, 40), 0, GCornerNone);
  p_text(ctx, F35, F35_N, F35_H, t, 100 - P_W(t, 2) / 2, 109, 2, P_HG, 0, 200);
}

static void p_anzeige_fuss(GContext *ctx);
static void p_anzeige(GContext *ctx) {
  const time_t jt = time(NULL);                        // localtime braucht time_t
  const int32_t now = (int32_t)jt;
  char buf[32], re[16] = "";
  int h, m, wt, tag, mon;
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  static const char *const WT[] = { "SO", "MO", "DI", "MI", "DO", "FR", "SA" };
  berlin_datum(now, &wt, &tag, &mon);
  snprintf(buf, sizeof(buf), "%s %02d.%02d.", WT[wt], tag, mon);
  P_KLEIN(buf, 4, 4, P_GRAU);
  berlin_hm(now, &h, &m);
  const struct tm *lokal = localtime(&jt);
  const bool fremd = lokal->tm_hour != h || lokal->tm_min != m;
  seitenzeichen(re, sizeof(re), fremd);
  P_KLEIN(re, 196 - P_W(re, 2), 4, P_GRAU);
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  const int ux = 196 - P_GW(buf, 4);                   // 0.8.0: Uhrzeit rechts, links daneben die Rubrik
  P_GROSS(buf, ux, 18, 4, P_TEXT);
  const char *rub = s_rubrik == 1 ? (s_sofort ? "AB HIER" : "STRECKEN") : (s_hier ? "HIER" : "ABFAHRTEN");
  if (s_rubrik == 0 && s_hier && s_hier_m > 0) {       // mit Entfernung zur Haltestelle (0.15.0)
    char mt[12];
    meter_text(mt, sizeof(mt), s_hier_m);
    snprintf(re, sizeof(re), "HIER %s", mt);
    rub = re;
  }
  p_text(ctx, F35, F35_N, F35_H, rub, 4, 26, 2, P_GRAU, 0, ux - 6);
  p_punktlinie(ctx, 51);

  if (s_rubrik == 1) {
    if (zeigt_route()) p_route(ctx, aktuelle_route(), now);
    else if (s_ranzahl == 0) {
      P_KLEIN("KEINE STRECKEN", 100 - P_W("KEINE STRECKEN", 2) / 2, 90, P_TEXT);
      P_KLEIN("SELECT LANG:", 100 - P_W("SELECT LANG:", 2) / 2, 120, P_GRAU);
      P_KLEIN("NEU ANLEGEN", 100 - P_W("NEU ANLEGEN", 2) / 2, 136, P_GRAU);
    }
  } else if (zeigt_seite()) {
    p_seite(ctx, aktuelle(), now);
  } else if (s_anzahl == 0) {
    P_KLEIN("KEINE ABFAHRTEN", 100 - P_W("KEINE ABFAHRTEN", 2) / 2, 90, P_TEXT);
    P_KLEIN("SELECT LANG:", 100 - P_W("SELECT LANG:", 2) / 2, 120, P_GRAU);
    P_KLEIN("NEU ANLEGEN", 100 - P_W("NEU ANLEGEN", 2) / 2, 136, P_GRAU);
  }

  p_anzeige_fuss(ctx);
  p_rubrik(ctx);
}
// Fuß (0.8.0, wie in den anderen Ansichten): links Punkt und Quelle (cyan = Echtzeit), rechts der Stand
static void p_anzeige_fuss(GContext *ctx) {
  char buf[32];
  int32_t stand_t = 0;
  const char *quelle = "";
  const int status = seiten_status(&stand_t, &quelle);
  GColor punkt = P_GITTER;
  bool warn = false;
  switch (status) {
    case ST_LADE:   snprintf(buf, sizeof(buf), "LADE"); break;
    case ST_NETZ:   snprintf(buf, sizeof(buf), "KEIN NETZ"); punkt = P_WARN; warn = true; break;
    case ST_FEHLER: snprintf(buf, sizeof(buf), "FEHLER"); punkt = P_WARN; warn = true; break;
    case ST_STANDORT: snprintf(buf, sizeof(buf), "KEIN GPS"); punkt = P_WARN; warn = true; break;
    case ST_SOLL: case ST_LIVE:
      snprintf(buf, sizeof(buf), "%s %s", quelle[0] ? quelle : "", status == ST_LIVE ? "LIVE" : "PLAN");
      punkt = status == ST_LIVE ? P_CYAN : P_GRAU;
      break;
    default: buf[0] = '\0';
  }
  if (status == ST_SOLL || status == ST_LIVE) p_fuss(ctx, "", stand_t); else p_fuss(ctx, "", 0);
  if (buf[0]) {
    graphics_context_set_fill_color(ctx, punkt);
    graphics_fill_rect(ctx, GRect(4, 215, 6, 6), 0, GCornerNone);
    P_KLEIN(buf, 14, 213, warn ? P_WARN : P_TEXT);
  }
}
static void p_schild(GContext *ctx, int y, const char *t) {   // Schild wie auf der Bestätigungsseite, 22 px hoch
  const int w = P_W(t, 2) + 12;
  graphics_context_set_fill_color(ctx, P_TEXT);
  graphics_fill_rect(ctx, GRect(188 - w, y, w, 22), 0, GCornerNone);
  for (int i = 0; i <= 10; i++) graphics_fill_rect(ctx, GRect(188 + i, y + i, 1, 22 - 2 * i), 0, GCornerNone);
  P_KLEIN(t, 182 - P_W(t, 2), y + 6, P_HG);
}
static void p_start_zeile(GContext *ctx, const Strecke *s, int i, int yy, int32_t now) {
  const int v = s->del[i];
  const bool ausfall = v == AUSFALL;
  const char *lin = s->lin[i];
  const bool gross = gross_moeglich(lin);
  const int lw = (gross ? P_GW(lin, 2) : P_W(lin, 2)) + 8;
  graphics_context_set_fill_color(ctx, ausfall ? P_GRAU : P_TEXT);   // Linie invers wie auf der Seite
  graphics_fill_rect(ctx, GRect(4, yy + 3, lw, 21), 0, GCornerNone);
  if (gross) P_GROSS(lin, 8, yy + 6, 2, P_HG); else P_KLEIN(lin, 8, yy + 9, P_HG);
  const int xt = 4 + lw + 6;
  char zeit[8], buf[12], rs[8] = "";
  int h, m;
  const int vz = (ausfall || s_abfahrt == ABF_AKTUELL) ? 0 : v;   // aktuell: Zeit mit Verspätung, gelb
  berlin_hm(s->dep[i] - vz * 60, &h, &m);
  snprintf(zeit, sizeof(zeit), "%02d:%02d", h, m);
  if (!ausfall) { const int min = (s->dep[i] - now) / 60; if (min < 100) snprintf(rs, sizeof(rs), "%d'", min); }
  int rand = 196;
  if (rs[0]) { rand = 196 - P_GW(rs, 3); P_GROSS(rs, rand, yy + 3, 3, P_TEXT); rand -= 6; }
  const int hx = s->heim[i] ? 15 : 0;                              // Heimathaltestelle (0.16.0)
  lauf_p(ctx, s->end[i], xt + hx, rand, yy + 2, 2, P_TEXT);
  if (hx) haus(ctx, xt, yy + 2, s->heim[i], s->heim[i] == 2 ? P_TEXT : P_GRAU, P_HG);
  int x = xt;
  P_KLEIN(zeit, x, yy + 15, ausfall ? P_GRAU : (v != vz ? P_WARN : P_GRAU));
  x += P_W(zeit, 2) + 6;
  if (ausfall) { P_KLEIN("FAELLT AUS", x, yy + 15, P_WARN); return; }
  if (vz) { snprintf(buf, sizeof(buf), "%+d'", vz); P_KLEIN(buf, x, yy + 15, P_WARN); x += P_W(buf, 2) + 6; }
  if (s->steig[i][0]) {
    const int sw = P_W(s->steig[i], 2) + 6;
    graphics_context_set_fill_color(ctx, P_GITTER);
    graphics_fill_rect(ctx, GRect(x, yy + 13, sw, 14), 0, GCornerNone);
    P_KLEIN(s->steig[i], x + 3, yy + 15, P_HELL);
  }
}
static void p_start(GContext *ctx) {
  const int32_t now = jetzt();
  const Strecke *s = &s_str[HIER];
  char buf[16];
  int idx[MAXD];
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  p_kopf(ctx, s->name[0], P_TEXT);
  if (s_hier_m > 0) { meter_text(buf, sizeof(buf), s_hier_m); P_KLEIN(buf, 4, ST_SCHILD1 + 6, P_GRAU); }
  p_schild(ctx, ST_SCHILD1, "ABFAHRTEN");
  const int n = naechste(s, now, idx);
  for (int k = 0; k < n; k++) p_start_zeile(ctx, s, idx[k], ST_Y0 + k * ST_DY, now);
  if (!n && s->status != ST_LADE) P_KLEIN(s->status == ST_STANDORT ? "KEIN STANDORT" : "KEINE FAHRT", 4, ST_Y0 + 8, P_GRAU);
  p_schild(ctx, ST_SCHILD2, "STRECKEN");
  p_anzeige_fuss(ctx);
}

static void p_zeile2(GContext *ctx, const char *t, int y, bool gew) {   // Einstellung: Name, darunter grau der Wert
  char name[LTXT];
  const char *bar = strchr(t, '|');
  snprintf(name, sizeof(name), "%.*s", bar ? (int)(bar - t) : (int)strlen(t), t);
  const char *wert = bar ? bar + 1 : "";
  if (gew) { graphics_context_set_fill_color(ctx, P_TEXT); graphics_fill_rect(ctx, GRect(0, y + 1, 200, P_ZEILE2 - 2), 0, GCornerNone); }
  p_text(ctx, F35, F35_N, F35_H, name, 6, y + 4, 2, gew ? P_HG : P_TEXT, 0, 194);
  if (gew) lauf_p(ctx, wert, 6, 194, y + 17, 2, P_HG);
  else p_text(ctx, F35, F35_N, F35_H, wert, 6, y + 17, 2, P_GRAU, 0, 194);
}
static void p_liste(GContext *ctx) {
  char buf[32];
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  p_kopf(ctx, s_ltitel, P_GRAU);
  if (s_modus == M_LADE) {
    p_text(ctx, F35, F35_N, F35_H, "LADE", 100 - P_W("LADE", 4) / 2, 80, 4, P_TEXT, 0, 200);
    P_KLEIN(s_ladetext, 100 - P_W(s_ladetext, 2) / 2, 112, P_GRAU);
  } else {
    const int pv = liste_versatz();
    for (int k = 0; k < info_n(); k++) {
      char z[48];
      info_zeile(k, z, sizeof(z));
      P_KLEIN(z, 4, P_Y0 + 4 + k * 16, k == 1 ? P_HELL : k == 2 ? P_TEXT : P_GRAU);
    }
    if (pv) p_punktlinie(ctx, P_Y0 + pv - 2);
    for (int k = 0; k < l_zeilen() && s_loben + k < s_lanz; k++) {
      const int i = s_loben + k, y = P_Y0 + pv + k * l_hoehe();
      if (y + l_hoehe() > 207) break;
      const char *t = s_ltext[i][0] ? s_ltext[i] : "...";
      if (s_lzwei) { p_zeile2(ctx, t, y, i == s_lsel); continue; }
      const int hs = l_haus(t), mk = l_marke(i), x1 = (hs || mk >= 0) ? 174 : 194;   // rechts Haus bzw. Kreis (0.16.0)
      if (hs) t++;
      const bool gew = i == s_lsel;
      const GColor fg = gew ? P_HG : P_TEXT;
      if (gew) {                                                     // gewählte Zeile invers
        graphics_context_set_fill_color(ctx, P_TEXT);
        graphics_fill_rect(ctx, GRect(0, y + 1, 200, P_ZEILE - 2), 0, GCornerNone);
        lauf_p(ctx, t, 6, x1, y + 6, 2, fg);
      } else if (trenner(i)) lauf_p(ctx, t, 6, x1, y + 6, 2, fg);    // Erklärzeile läuft, wenn zu lang (0.15.0)
      else p_text(ctx, F35, F35_N, F35_H, t, 6, y + 6, 2, fg, 0, x1);
      if (hs) haus(ctx, 181, y + 6, hs, fg, gew ? P_TEXT : P_HG);
      if (mk >= 0) l_kreis(ctx, 185, y + 11, mk, fg);
    }
  }
  buf[0] = '\0';
  if (s_modus == M_LISTE && s_lanz > l_zeilen()) snprintf(buf, sizeof(buf), "%d/%d", s_lsel + 1, s_lanz);
  p_fuss(ctx, buf, 0);
}

// Phosphor: Bestätigungsseite (0.8.0). Rechts auf Höhe der oberen Taste ein grünes Schild mit Pfeil.
static int p_breite3(const char *t) { return P_W(t, 3); }
static void p_frage(GContext *ctx) {
  char q[sizeof(s_ftext) + 2], z[LTXT + 2];
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  p_text(ctx, F35, F35_N, F35_H, s_fkopf, 4, 6, 2, P_GRAU, 0, 196);
  p_punktlinie(ctx, 20);
  graphics_context_set_fill_color(ctx, P_TEXT);
  graphics_fill_rect(ctx, GRect(76, 34, 112, 40), 0, GCornerNone);
  for (int i = 0; i <= 11; i++) graphics_fill_rect(ctx, GRect(188 + i, 34 + i * 20 / 11, 1, 40 - 2 * (i * 20 / 11)), 0, GCornerNone);
  P_KLEIN("HIER", 184 - P_W("HIER", 2), 40, P_HG);
  P_KLEIN("BESTAETIGEN", 184 - P_W("BESTAETIGEN", 2), 56, P_HG);
  snprintf(q, sizeof(q), "%s?", s_ftext);
  const char *p = q;
  for (int k = 0, y = 92; k < 4 && *p; k++, y += 24) {
    const int n = umbruch_teil(p, 192, p_breite3);
    snprintf(z, sizeof(z), "%.*s", n, p);
    p_text(ctx, F35, F35_N, F35_H, z, 4, y, 3, P_HELL, 0, 196);
    p += n;
    while (*p == ' ') p++;
  }
  p_fuss(ctx, "ZURUECK: NEIN", 0);
}

// ---------- Fahrtkarte (0.7.0) ----------
// Halte zählt die Uhr selbst weiter (0.15.0, Seb 2026-10-15 im Bus: „noch n Halte“ und der nächste Halt hingen nach).
// Mit der Karte kommen die Abfahrtszeiten der nächsten drei Halte bis zum Ausstieg (K_HT) und ihre Namen (K_HN). Ab
// seiner Abfahrtszeit gilt ein Halt als vorbei: Zahl, nächster Halt und Balken im Verlauf rücken sofort weiter, ohne
// auf das Handy zu warten. Kommt eine neue Antwort mit anderen Zeiten, gelten die neuen. Für alle Ansichten an einer Stelle.
static int karte_vorbei(void) {                        // so viele der gemeldeten Halte sind schon vorbei
  const int32_t now = jetzt();
  int p = 0;
  while (p < 3 && s_k->ht[p] && s_k->ht[p] <= now) p++;
  return p;
}
static int karte_halte(void) {                         // Halte bis zum Ausstieg (mit ihm), 0 = keine Angabe
  if (s_k->halte <= 0) return 0;
  const int h = s_k->halte - karte_vorbei();
  return h < 1 ? 1 : h;
}
static const char *karte_r2(void) {                    // rechts oben: nächster Halt (vom Handy oder weitergezählt)
  const int p = karte_vorbei();
  if (!p) return s_k->r2;
  if (p >= s_k->halte - 1) return s_k->name;           // nur noch der Ausstieg
  return p < 3 && s_k->hn[p][0] ? s_k->hn[p] : "...";  // Namen aufgebraucht: das Handy wird gefragt (halt_cb)
}
static void karte_zahl(char *zahl, size_t nz, const char **einheit, bool *warn) {
  const int halte = karte_halte();
  if (halte >= 1 && halte <= 3) { snprintf(zahl, nz, "%d", halte); *einheit = TV("HALTE", halte == 1 ? "Halt" : "Halte"); *warn = true; return; }
  int m = (s_k->zeit - jetzt() + 59) / 60;
  if (m < 0) m = 0;
  if (m > 999) m = 999;
  snprintf(zahl, nz, "%d", m);
  *einheit = T("MIN", "min"); *warn = false;
}
static void karte_unter(char *buf, size_t n) {
  int h, m;
  berlin_hm(s_k->zeit, &h, &m);
  snprintf(buf, n, "%s %02d:%02d", s_k->zeitl, h, m);
}
static void p_steig(GContext *ctx, const char *st, int y) {   // Kästchen rechtsbündig, Text Pixelschrift
  const int w = P_W(st, 2) + 6;
  graphics_context_set_fill_color(ctx, P_GITTER);
  graphics_fill_rect(ctx, GRect(196 - w, y - 3, w, 16), 0, GCornerNone);
  P_KLEIN(st, 196 - w + 3, y, P_HELL);
}
static void p_karte(GContext *ctx) {
  char zahl[8], buf[48];
  const char *einheit;
  bool warn;
  k_flaeche(ctx, GRect(0, 0, 200, 228), P_HG);
  p_kopf(ctx, s_k->kopf, P_CYAN);                       // 0.8.0: rechts die Uhrzeit, die Ankunft steht im Fuß
  karte_zahl(zahl, sizeof(zahl), &einheit, &warn);
  P_GROSS(zahl, 4, 28, 4, warn ? P_WARN : P_TEXT);
  P_KLEIN(einheit, 4 + P_GW(zahl, 4) + 4, 42, warn ? P_WARN : P_TEXT);
  karte_unter(buf, sizeof(buf));
  P_KLEIN(buf, 4, 62, P_GRAU);
  if (s_k->r1[0]) P_KLEIN(s_k->r1, 196 - P_W(s_k->r1, 2), 30, s_k->rf ? P_HELL : P_GRAU);
  const char *r2 = karte_r2();
  if (r2[0] && P_W(r2, 2) <= 110) P_KLEIN(r2, 196 - P_W(r2, 2), 46, s_k->rf ? P_GRAU : P_HELL);
  else if (r2[0]) lauf_p(ctx, r2, 86, 196, 46, 2, s_k->rf ? P_GRAU : P_HELL);   // zu lang: Lauftext
  p_punktlinie(ctx, 78);
  P_KLEIN(s_k->label, 4, 88, P_GRAU);
  if (s_k->steig[0]) p_steig(ctx, s_k->steig, 88);
  if (P_W(s_k->name, 3) <= 192) p_text(ctx, F35, F35_N, F35_H, s_k->name, 4, 102, 3, P_HELL, 0, 200);
  else lauf_p(ctx, s_k->name, 4, 196, 104, 2, P_HELL);   // zu lang: kleinere Schrift, notfalls Lauftext
  int y = 128;
  for (int i = 0; i < KZ; i++) {
    const uint8_t f = s_k->f[i];
    if (!(f & 128)) continue;
    if (f & 8) { p_punktlinie(ctx, y - 1); y += 4; }
    if (y > 192) break;
    const GColor wc = (f & 16) ? P_WARN : (f & 32) ? P_GRAU : (f & 64) ? P_HELL : P_TEXT;
    if (f & 4) { lauf_p(ctx, s_k->w[i], 4, 196, y, 2, wc); y += 15; continue; }
    P_KLEIN(s_k->l[i], 4, y, P_GRAU);
    int rand = 196;
    if (s_k->s[i][0]) { p_steig(ctx, s_k->s[i], y); rand = 196 - P_W(s_k->s[i], 2) - 10; }
    else if (s_k->r[i][0]) {
      P_KLEIN(s_k->r[i], 196 - P_W(s_k->r[i], 2), y, (f & 1) ? P_WARN : (f & 2) ? P_HELL : P_GRAU);
      rand = 196 - P_W(s_k->r[i], 2) - 8;
    }
    lauf_p(ctx, s_k->w[i], 46, rand, y, 2, wc);
    y += 15;
  }
  p_fuss(ctx, s_k->fuss, s_dstand);
}
static GFont s_rf_font(bool fett) { return fett ? s_f18b : s_f18; }
static void k_steig_box(GContext *ctx, const char *st, int y) {
  const int sw = k_steig_w(st);
  k_flaeche(ctx, GRect(196 - sw, y, sw, 20), K_DUNKEL);
  k_text(ctx, st, s_f18b, GRect(196 - sw, y - 4, sw, 24), GTextAlignmentCenter, K_PAPIER);
}
static void k_karte(GContext *ctx) {
  char zahl[8], buf[48];
  const char *einheit;
  bool warn;
  k_flaeche(ctx, GRect(0, 0, 200, 228), K_PAPIER);
  k_kopf(ctx, s_k->kopf, K_PAPIER);                   // 0.8.0: rechts die Uhrzeit, die Ankunft steht im Fuß
  const char *r2 = karte_r2();
  if (r2[0]) {                                         // rechts: nächster Halt bzw. Fußweg, zu lang: Lauftext (zuerst)
    const GFont f2 = s_rf_font(!s_k->rf);
    const GColor c2 = s_k->rf ? K_DUNKEL : K_TINTE;
    if (k_breite(r2, f2) <= 114) k_text(ctx, r2, f2, GRect(80, 44, 114, 24), GTextAlignmentRight, c2);
    else lauf_k(ctx, r2, f2, GRect(80, 44, 114, 24), c2, K_PAPIER, 49, 16);
  }
  karte_zahl(zahl, sizeof(zahl), &einheit, &warn);
  const GColor zc = warn ? K_ROT : K_TINTE;
  k_text(ctx, zahl, s_f_uhr, GRect(6, 22, 100, 40), GTextAlignmentLeft, zc);
  k_text(ctx, einheit, s_f18b, GRect(10 + k_breite(zahl, s_f_uhr), 36, 60, 24), GTextAlignmentLeft, zc);
  karte_unter(buf, sizeof(buf));
  k_text(ctx, buf, s_f18, GRect(6, 58, 188, 24), GTextAlignmentLeft, K_DUNKEL);
  if (s_k->r1[0]) k_text(ctx, s_k->r1, s_rf_font(s_k->rf), GRect(100, 26, 94, 24), GTextAlignmentRight, s_k->rf ? K_TINTE : K_DUNKEL);
  k_flaeche(ctx, GRect(6, 84, 188, 1), K_GRAU);
  const int nr = s_k->steig[0] ? 196 - k_steig_w(s_k->steig) - 4 : 194;    // Name zuerst (Lauftext), dann der Steig
  lauf_k(ctx, s_k->name, k_breite(s_k->name, s_f24b) <= nr - 6 ? s_f24b : s_f18b, GRect(6, 96, nr - 6, 30), K_TINTE, K_PAPIER, 104, 22);
  k_text(ctx, s_k->label, s_f14, GRect(6, 84, 140, 18), GTextAlignmentLeft, K_DUNKEL);
  if (s_k->steig[0]) k_steig_box(ctx, s_k->steig, 88);
  int y = 128;
  for (int i = 0; i < KZ; i++) {
    const uint8_t f = s_k->f[i];
    if (!(f & 128)) continue;
    if (f & 8) { k_flaeche(ctx, GRect(6, y, 188, 1), K_GRAU); y += 3; }
    if (y > 192) break;
    const GColor wc = (f & 16) ? K_ROT : (f & 32) ? K_DUNKEL : K_TINTE;
    const GFont wf = (f & 64) ? s_f18b : s_f18;
    if (f & 4) { lauf_k(ctx, s_k->w[i], (f & 16) ? s_f18b : wf, GRect(6, y - 3, 188, 24), wc, K_PAPIER, y + 1, 16); y += 17; continue; }
    int rand = 194, rw = 0;
    if (s_k->s[i][0]) rand = 196 - k_steig_w(s_k->s[i]) - 4;
    else if (s_k->r[i][0]) { rw = k_breite(s_k->r[i], s_f18b); rand = 194 - rw - 6; }
    lauf_k(ctx, s_k->w[i], wf, GRect(44, y - 3, rand - 44, 24), wc, K_PAPIER, y + 1, 16);   // zuerst (Lauftext)
    k_text(ctx, s_k->l[i], s_f14, GRect(6, y, 40, 18), GTextAlignmentLeft, K_DUNKEL);
    if (s_k->s[i][0]) k_steig_box(ctx, s_k->s[i], y);
    else if (rw) k_text(ctx, s_k->r[i], s_f18b, GRect(194 - rw, y - 3, rw + 2, 24), GTextAlignmentRight, (f & 1) ? K_ROT : K_TINTE);
    y += 17;
  }
  k_fuss(ctx, s_k->fuss, false, K_TINTE, s_dstand);
}

// ---------- Ansicht Cartoon (0.16.0) ----------
// Entwurf linie8-einfahrt-entwurf.png (Seb 2026-10-15): jede Abfahrt eine Straße, der Bus fährt bei 10 min links ins
// Bild, seine Front an der Haltestelle ist 0 min (linear, 15,2 px/min). Rechts der Mast mit H, das Schild mit Steig bzw.
// Gleis, darunter die Abfahrtszeit. Verspätung: Schweißtropfen und ein schwerer Anhänger mit +n, Namenszeile orange.
// Ausfall: graue Bahn, Bus mit Panne und Rauch, Zeit durchgestrichen. Abgefahren: der Bus fährt hinter die
// Haltestelle (bis die nächste Aktualisierung die Fahrt streicht). In der Fahrt die Zielansicht mit Tafel, ab 5 min vor
// dem Ausstieg fährt der Bus aufs Ziel zu, die Halte davor stehen an der Straße. Menüs, Listen, Details, Startseite,
// Strecken nehmen den Aufbau von Papier mit den Cartoon-Farben und Fredoka.
#define C_STOP 159         // Front bei 0 min berührt den Mast (x 159); 0.17.0, vorher 152 (7 px davor)
#define C_BH 56            // Bahn: Namenszeile, darunter die Straße (28 px)
#define C_Y0 32            // erste Bahn
static int s_cart_ms;              // beim Zeichnen gesetzt: so oft neu zeichnen, solange ein Bus fährt (0 = jede Minute)
static AppTimer *s_cart_timer;
static int32_t s_raus;             // Ausstieg, für den schon vibriert wurde
static GColor c_farbe(const char *l) {                 // Fahrzeugfarbe je Linie, fest über eine Prüfsumme
  static const uint32_t F[] = { 0xFFFF55, 0x55AAFF, 0xAAFF55, 0xFFAA55, 0xAAAAFF };
  unsigned h = 0;
  while (*l) h = h * 31 + (uint8_t)*l++;
  return GColorFromHEX(F[h % 5]);
}
// Straße (Bus) bzw. Gleis (Tram, Zug) über die ganze Breite, die Haltestelle steht davor (0.17.0)
static void c_strasse(GContext *ctx, int y, bool gleis) {
  if (gleis) {                                         // Schotter, Schwellen, Schiene unter den Rädern
    k_flaeche(ctx, GRect(0, y + 24, 200, 4), C_STRASSE);
    for (int k = 0; k < 17; k++) k_flaeche(ctx, GRect(3 + k * 12, y + 25, 6, 3), GColorFromHEX(0xAA5500));
    k_flaeche(ctx, GRect(0, y + 23, 200, 2), C_NAVY);
    return;
  }
  k_flaeche(ctx, GRect(0, y, 200, 28), C_STRASSE);
  k_flaeche(ctx, GRect(0, y, 200, 2), C_HELL);
  for (int k = 0; k < 8; k++) k_flaeche(ctx, GRect(6 + k * 26, y + 14, 12, 2), GColorWhite);
}
static void c_kreis(GContext *ctx, int x, int y, int r, GColor f, GColor rand) {
  graphics_context_set_fill_color(ctx, f);
  graphics_fill_circle(ctx, GPoint(x, y), r);
  graphics_context_set_stroke_color(ctx, rand);
  graphics_draw_circle(ctx, GPoint(x, y), r);
}
// Fahrzeug mit der Front bei fx, Oberkante y, w breit, 20 hoch. f: 1 Fahrgäste, 2 Schweißtropfen, 4 Panne mit Rauch,
// 8 Stromabnehmer (Tram, Zug), 16 Gelenk (Tram). Bus 54, Tram 62, Zug 72 px: ein Fenster je 16 px
static void c_bus(GContext *ctx, int fx, int y, int w, const char *nr, GColor farbe, int f) {
  int nw = k_breite(nr, s_cf12) + 5;
  if (nw < 11) nw = 11;
  const int x = fx - w, nf = w / 16, fw = (w - nw - 9) / nf;
  graphics_context_set_fill_color(ctx, farbe);
  graphics_fill_rect(ctx, GRect(x, y, w, 20), 4, GCornersAll);
  graphics_context_set_stroke_color(ctx, C_NAVY);
  graphics_draw_round_rect(ctx, GRect(x, y, w, 20), 4);
  for (int k = 0; k < nf; k++) {                       // Fenster, in der gewählten Bahn mit Fahrgästen
    const int wx = x + 3 + k * (fw + 1);
    k_flaeche(ctx, GRect(wx, y + 3, fw, 8), C_HIMMEL);
    graphics_context_set_stroke_color(ctx, C_NAVY);
    graphics_draw_rect(ctx, GRect(wx, y + 3, fw, 8));
    if ((f & 1) && k < 2) c_kreis(ctx, wx + fw / 2, y + 8, 2, GColorFromHEX(0xFFAAAA), C_NAVY);
  }
  graphics_context_set_fill_color(ctx, C_ROSA);        // Linienschild vorn
  graphics_fill_rect(ctx, GRect(fx - nw - 2, y + 2, nw, 12), 2, GCornersAll);
  k_text(ctx, nr, s_cf12, GRect(fx - nw - 2, y, nw, 16), GTextAlignmentCenter, GColorWhite);
  for (int k = 0; k < 2; k++) { const int rx = k ? fx - w / 5 : x + w / 5; c_kreis(ctx, rx, y + 20, 3, C_NAVY, C_NAVY); k_flaeche(ctx, GRect(rx, y + 20, 1, 1), C_HELL); }
  if (f & 8) {                                         // Stromabnehmer auf dem Dach
    const int px = x + w / 3;
    graphics_context_set_stroke_color(ctx, C_NAVY);
    graphics_draw_line(ctx, GPoint(px - 3, y), GPoint(px + 1, y - 4));
    graphics_draw_line(ctx, GPoint(px + 1, y - 4), GPoint(px + 4, y));
    k_flaeche(ctx, GRect(px - 4, y - 5, 11, 1), C_NAVY);
  }
  if (f & 16) k_flaeche(ctx, GRect(x + (w - nw) / 2, y + 1, 2, 18), C_NAVY);   // Gelenk
  if (f & 2)                                           // Schweiß: drei Tropfen über der Front
    for (int k = 0; k < 3; k++) c_kreis(ctx, fx + 2 - k * 5, y - 2 - (k == 1) * 3, 2, GColorFromHEX(0x55AAFF), C_NAVY);
  if (f & 4)                                           // Panne: Rauch über der Front
    for (int k = 0; k < 4; k++) c_kreis(ctx, fx - 10 + k * 5, y - 1 - k * 3, 4 - (k == 3), C_HELL, C_STRASSE);
}
static void c_anhaenger(GContext *ctx, int x, int y, const char *t) {   // schweres Gewicht, Deichsel bei x (Heck des Busses)
  GPoint p[4] = { { x - 34, y + 17 }, { x - 29, y + 1 }, { x - 13, y + 1 }, { x - 8, y + 17 } };
  GPath g = { .num_points = 4, .points = p, .rotation = 0, .offset = GPointZero };
  k_flaeche(ctx, GRect(x - 9, y + 10, 9, 2), C_NAVY);
  k_flaeche(ctx, GRect(x - 24, y - 3, 6, 4), C_STRASSE);
  graphics_context_set_fill_color(ctx, C_STRASSE);
  gpath_draw_filled(ctx, &g);
  graphics_context_set_stroke_color(ctx, C_NAVY);
  gpath_draw_outline(ctx, &g);
  k_text(ctx, t, s_cf12, GRect(x - 34, y, 26, 16), GTextAlignmentCenter, C_ORANGE);
  c_kreis(ctx, x - 28, y + 19, 3, C_NAVY, C_NAVY);
  c_kreis(ctx, x - 14, y + 19, 3, C_NAVY, C_NAVY);
}
// Haltestelle rechts der Straße, y = Oberkante der Bahn: Mast mit H, Schild mit Steig bzw. Gleis, darunter die Zeit
static void c_halt(GContext *ctx, int y, const char *steig, const char *zeit, GColor zc, bool aus) {
  k_flaeche(ctx, GRect(159, y + 10, 3, C_BH - 10), C_NAVY);
  graphics_context_set_stroke_width(ctx, 2);
  c_kreis(ctx, 160, y + 12, 7, GColorFromHEX(0xFFFF00), GColorFromHEX(0x00AA55));
  graphics_context_set_stroke_width(ctx, 1);
  k_text(ctx, "H", s_cf12, GRect(154, y + 2, 13, 16), GTextAlignmentCenter, GColorFromHEX(0x00AA55));
  if (steig[0]) {
    graphics_context_set_fill_color(ctx, C_NAVY);
    graphics_fill_rect(ctx, GRect(169, y + 4, 30, 19), 5, GCornersAll);
    k_text(ctx, steig, strlen(steig) > 2 ? s_cf12 : s_cf15, GRect(169, y + (strlen(steig) > 2 ? 4 : 2), 30, 20), GTextAlignmentCenter, GColorWhite);
  }
  graphics_context_set_fill_color(ctx, GColorWhite);   // Zeit auf einem Schild, Straße bzw. Gleis laufen dahinter durch
  graphics_fill_rect(ctx, GRect(166, y + 29, 32, 14), 3, GCornersAll);
  k_text(ctx, zeit, s_cf12, GRect(164, y + 26, 36, 16), GTextAlignmentCenter, zc);
  if (aus) k_flaeche(ctx, GRect(168, y + 34, 30, 2), C_ORANGE);
}
static void c_steppe(GContext *ctx, int x, int y) {    // Steppenläufer auf der leeren Straße
  const GColor b = GColorFromHEX(0xAA5500);
  graphics_context_set_stroke_color(ctx, b);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_circle(ctx, GPoint(x, y), 8);
  graphics_context_set_stroke_width(ctx, 1);
  graphics_draw_circle(ctx, GPoint(x + 1, y - 1), 4);
  graphics_draw_line(ctx, GPoint(x - 6, y + 3), GPoint(x + 6, y - 4));
  for (int k = 0; k < 2; k++) graphics_draw_line(ctx, GPoint(x - 18 - k * 3, y - 2 + k * 4), GPoint(x - 11, y - 2 + k * 4));
}
static void c_zeit(char *buf, size_t n, int32_t t) { int h, m; berlin_hm(t, &h, &m); snprintf(buf, n, "%02d:%02d", h, m); }
static void c_fuss(GContext *ctx) {                    // Fuß der Seite: Stand und live bzw. Zustand, rechts A1/4
  char links[32], re[12];
  int32_t stand = 0;
  const char *q = "";
  const int st = seiten_status(&stand, &q);
  c_zeit(re, sizeof(re), stand);
  snprintf(links, sizeof(links), st == ST_LIVE || st == ST_SOLL ? (st == ST_LIVE ? "Stand %s · live" : "Stand %s · Fahrplan")
           : st == ST_LADE ? "Lade …" : st == ST_NETZ ? "Kein Netz" : st == ST_STANDORT ? "Kein Standort" : st == ST_FEHLER ? "Fehler" : "", re);
  seitenzeichen(re, sizeof(re), false);
  c_rasen(ctx, 200, links, (st == ST_LIVE || st == ST_SOLL) && stand_alt(stand) ? C_ORANGE : C_NAVY, re);
}
static void cart_anzeige(GContext *ctx) {
  if (s_rubrik == 1 || !zeigt_seite()) { k_anzeige(ctx); return; }   // Strecken und leere Rubrik: Aufbau von Papier
  const int32_t now = jetzt();
  const Strecke *s = aktuelle();
  const bool ziel = hat_ziel(s);
  const char *vt = vt_str(s);
  char buf[2 * NAMELEN + 8], re[24], zeit[8], st[8];
  int idx[MAXD];
  int n = naechste(s, now - 60, idx);                  // abgefahrene bleiben 1 min stehen: der Bus fährt weg
  if (vt[0] && n > MAXD - 1) n = MAXD - 1;
  k_flaeche(ctx, GRect(0, 0, 200, 228), C_HIMMEL);
  bool gewaehlt = false;
  for (int k = 0; k < n; k++) {
    const int i = idx[k], y = C_Y0 + k * C_BH, v = s->del[i], dt = s->dep[i] - now, ry = y + 23;
    const bool aus = v == AUSFALL, gew = !gewaehlt && dt >= 0, zug = s->mi[i] == 2, gleis = zug || s->mi[i] == 1;
    gewaehlt = gewaehlt || gew;
    const GColor bg = gew ? C_ROSA : aus ? C_HELL : C_HIMMEL;
    k_flaeche(ctx, GRect(0, y, 200, C_BH), bg);
    if (!gew) k_flaeche(ctx, GRect(0, y + C_BH - 1, 200, 1), GColorWhite);
    if (aus) snprintf(re, sizeof(re), "fällt aus");
    else if (dt < 0) snprintf(re, sizeof(re), "fährt ab");
    else if (dt < 60) snprintf(re, sizeof(re), "jetzt");
    else if (v > 0) snprintf(re, sizeof(re), "+%d · %d min", v, (int)(dt / 60));
    else snprintf(re, sizeof(re), "%d min", (int)(dt / 60));
    const int rw = k_breite(re, s_cf15), hx = !ziel && s->heim[i] ? 15 : 0;
    snprintf(buf, sizeof(buf), "%s %s", s->lin[i], ziel ? k_name1(s) : s->endk[i]);
    lauf_k(ctx, buf, s_cf15, GRect(6 + hx, y + 1, 140 - rw - hx, 20), C_NAVY, bg, y + 1, 21);   // zuerst (Lauftext)
    if (hx) haus(ctx, 6, y + 7, s->heim[i], C_NAVY, bg);
    k_text(ctx, re, s_cf15, GRect(148 - rw, y + 1, rw + 4, 20), GTextAlignmentRight, aus || v > 0 ? C_ORANGE : C_NAVY);
    c_strasse(ctx, ry, gleis);
    const int bw = zug ? 72 : gleis ? 62 : 54, fx = C_STOP - (s->dep[i] / 60 * 60 - now) * C_STOP / 600;   // auf die volle Minute:
                                                     // die Front erreicht den Mast, wenn die Uhr auf die Abfahrtszeit springt
    if (fx > 0) {
      if (v > 0 && !aus) { snprintf(st, sizeof(st), "+%d", v); c_anhaenger(ctx, fx - bw, ry + 1, st); }
      c_bus(ctx, fx, ry + 2, bw, s->lin[i], aus ? C_HELL : c_farbe(s->lin[i]), (gew ? 1 : 0) | (v > 0 && !aus ? 2 : 0) | (aus ? 4 : 0) | (gleis ? 8 : 0) | (gleis && !zug ? 16 : 0));
      s_cart_ms = 5000;                                // 0.17.0: alle 5 s, solange ein Fahrzeug im Bild ist
    }
    const int vz = (aus || s_abfahrt == ABF_AKTUELL) ? 0 : v;   // vorne die Fahrplanzeit (oder die aktuelle, orange)
    c_zeit(zeit, sizeof(zeit), s->dep[i] - vz * 60);
    snprintf(st, sizeof(st), zug && s->steig[i][0] ? "Gl %s" : "%s", s->steig[i]);
    c_halt(ctx, y, st, zeit, aus ? C_STRASSE : v != vz ? C_ORANGE : C_NAVY, aus);
  }
  if (vt[0]) k_vorschlag(ctx, vt, C_Y0 + (MAXD - 1) * C_BH + 4);   // FRUEHER DA statt der dritten Bahn
  if (!n) k_text(ctx, s->status == ST_LADE ? "Lade …" : s->status == ST_STANDORT ? "Kein Standort" : "Keine Fahrt", s_cf18,
                 GRect(6, C_Y0 + 4, 188, 24), GTextAlignmentLeft, C_NAVY);
  c_kopf(ctx, k_name0(s));
  c_fuss(ctx);
  k_rubrik(ctx);
}
// Fahrt im Fahrzeug (Phase 2 und 4): Ausstieg groß, Tafel mit Minuten und Halten, unten die Straße zum Ausstieg.
// Mehr als 5 min: leere Straße mit Steppenläufer. Ab 5 min fährt der Bus aufs Ziel zu (5 min = linker Rand),
// die nächsten Halte stehen an der Straße. Letzte Minute: JETZT RAUS!, die Uhr vibriert einmal.
static void cart_karte(GContext *ctx) {
  const int32_t now = jetzt(), dt = s_k->zeit - now;
  char buf[48], lin[LINLEN], zeit[8];
  const bool raus = dt <= 60;
  k_flaeche(ctx, GRect(0, 0, 200, 228), C_HIMMEL);
  k_text(ctx, "Ausstieg", s_cf12, GRect(0, 30, 200, 16), GTextAlignmentCenter, C_NAVY);
  const GFont nf = k_breite(s_k->name, s_cf22) <= 192 ? s_cf22 : s_cf18;
  lauf_k(ctx, s_k->name, nf, GRect(k_breite(s_k->name, nf) < 192 ? 100 - k_breite(s_k->name, nf) / 2 : 4, 42, 192, 28), C_NAVY, C_HIMMEL, 44, 26);
  c_zeit(zeit, sizeof(zeit), s_k->zeit);
  snprintf(buf, sizeof(buf), s_k->steig[0] ? "an %s · Steig %s" : "an %s", zeit, s_k->steig);
  k_text(ctx, buf, s_cf12, GRect(0, 67, 200, 16), GTextAlignmentCenter, C_STRASSE);
  graphics_context_set_fill_color(ctx, C_ROSA);        // Tafel: rosa Rand, nachtblau (Ausstieg: ganz rosa)
  graphics_fill_rect(ctx, GRect(28, 86, 144, 52), 8, GCornersAll);
  graphics_context_set_fill_color(ctx, raus ? C_ROSA : C_NAVY);
  graphics_fill_rect(ctx, GRect(31, 89, 138, 46), 6, GCornersAll);
  const GColor tc = raus ? GColorWhite : GColorFromHEX(0xFFFF00);
  k_text(ctx, raus ? "JETZT" : "NOCH", s_cf12, GRect(31, 88, 138, 16), GTextAlignmentCenter, tc);
  const int halte = karte_halte();
  if (raus) snprintf(buf, sizeof(buf), "RAUS!");
  else snprintf(buf, sizeof(buf), "%d min", (int)((dt + 59) / 60));
  k_text(ctx, buf, s_cf22, GRect(31, 96, 138, 28), GTextAlignmentCenter, tc);
  if (halte > 0 && !raus) {
    snprintf(buf, sizeof(buf), halte == 1 ? "nächster Halt: Ausstieg" : dt <= 300 ? "%d Halte bis zum Ausstieg" : "%d Halte", halte);
    k_text(ctx, buf, s_cf12, GRect(31, 119, 138, 16), GTextAlignmentCenter, tc);
  }
  const char *g = strchr(s_k->kopf, '>'), *a = g && g > s_k->kopf + 1 ? g - 1 : NULL;   // Linie: "Im Bus 8 > Luisenplatz"
  while (a && a > s_k->kopf && a[-1] != ' ') a--;
  snprintf(lin, sizeof(lin), "%.*s", a ? (int)(g - 1 - a) : 0, a ? a : "");
  const int ry = 170, m = s_k->kopf[3] | 32;        // Verkehrsmittel aus dem Kopf: "Im Bus", "In Tram", "Im Zug"
  const bool zug = m == 'z', gleis = zug || m == 't';
  c_strasse(ctx, ry, gleis);
  s_cart_ms = 5000;                                    // 0.17.0: alle 5 s
  if (dt > 300) c_steppe(ctx, 30 + (int)((now / 5) % 6) * 18, ry + 13);   // gähnende Leere
  else {
    for (int k = 0; k < 3; k++) {                      // die nächsten Halte vor dem Ausstieg, Abstand nach Fahrzeit
      const int32_t t = s_k->ht[k];
      if (!t || t <= now || s_k->zeit - t > 300) continue;
      const int x = C_STOP - (s_k->zeit - t) * C_STOP / 300;
      k_flaeche(ctx, GRect(x - 1, ry - 10, 2, 11), C_NAVY);
      c_kreis(ctx, x, ry - 11, 4, GColorFromHEX(0xFFFF00), C_NAVY);
      k_text(ctx, s_k->hn[k], s_cf12, GRect(x - 40, ry - 36 + (k & 1) * 10, 80, 16), GTextAlignmentCenter, C_NAVY);
    }
    const int32_t db = s_k->zeit / 60 * 60 - now;     // wie bei den Abfahrten: am Ziel, wenn die Uhr auf die Ankunft springt
    c_bus(ctx, C_STOP - (db > 0 ? db : 0) * C_STOP / 300, ry + 2, zug ? 72 : gleis ? 62 : 54, lin, c_farbe(lin),
          1 | (gleis ? 8 : 0) | (gleis && !zug ? 16 : 0));
  }
  snprintf(lin, sizeof(lin), zug && s_k->steig[0] ? "Gl %s" : "%s", s_k->steig);
  c_halt(ctx, ry - 23, lin, zeit, C_NAVY, false);
  stand_text(buf, sizeof(buf), s_dstand, true);
  c_rasen(ctx, 200, s_k->fuss, C_NAVY, buf);
  c_kopf(ctx, a ? a : s_k->kopf);                      // Kopf ab der Linie: "8 > Luisenplatz" (wie im Entwurf)
  if (raus && s_k->zeit - s_raus > 300) { s_raus = s_k->zeit; vibes_double_pulse(); }   // einmal je Ausstieg
}
static void cart_cb(void *data) { s_cart_timer = NULL; layer_mark_dirty(s_layer); }

static void lauf_cb(void *data);
static void ab_planen(void);
static void zeichnen(Layer *layer, GContext *ctx) {
  s_lauf_bedarf = false;                               // die Seiten melden beim Zeichnen, ob ein Text laufen muss
  s_cart_ms = 0;                                       // Cartoon: der Bus meldet, ob er fährt
  if (KLAR_ART) {
    if (s_modus == M_ANZEIGE) { if (s_start) k_start(ctx); else if (CARTOON) cart_anzeige(ctx); else k_anzeige(ctx); }
    else if (s_modus == M_DETAIL) {
      if (!karte_zeigen()) k_detail(ctx);
      else if (CARTOON && (s_k->phase == 2 || s_k->phase == 4)) cart_karte(ctx);   // im Fahrzeug
      else k_karte(ctx);
    }
    else if (s_modus == M_SUCHE) k_suche(ctx); else if (s_modus == M_FRAGE) k_frage(ctx); else k_liste(ctx);
  } else {
    if (s_modus == M_ANZEIGE) { if (s_start) p_start(ctx); else p_anzeige(ctx); } else if (s_modus == M_DETAIL) { if (karte_zeigen()) p_karte(ctx); else p_detail(ctx); }
    else if (s_modus == M_SUCHE) p_suche(ctx); else if (s_modus == M_FRAGE) p_frage(ctx); else p_liste(ctx);
  }
  if (s_lauf_bedarf && !s_lauf && s_lauf_rest >= LAUF_MS) s_lauf = app_timer_register(LAUF_MS, lauf_cb, NULL);
  if (s_cart_ms && !s_cart_timer) s_cart_timer = app_timer_register(s_cart_ms, cart_cb, NULL);
  if (s_modus == M_ANZEIGE) ab_planen();
}

// ---------- Lauftext: Zeitgeber ----------
static void lauf_cb(void *data) {
  s_lauf = NULL;
  if (!s_lauf_bedarf || s_lauf_rest < LAUF_MS) {       // nichts läuft mehr bzw. 1 min um: Anfang zeigen
    if (s_lauf_off) { s_lauf_off = 0; layer_mark_dirty(s_layer); }
    return;
  }
  s_lauf_rest -= LAUF_MS;
  s_lauf_off++;
  layer_mark_dirty(s_layer);                           // zeichnen() stellt den nächsten Schritt
}
// Neue Anzeige oder Taste: Lauftext von vorn, eine Minute lang
static void lauf_starten(void) {
  s_lauf_rest = LAUF_DAUER_MS;
  s_lauf_off = 0;
  if (s_layer) layer_mark_dirty(s_layer);
}

// ---------- Kommunikation ----------
static void anzeige_zeigen(void);
static bool menue_empfangen(DictionaryIterator *it);
static void detail_oeffnen(int nr);
static int *aktueller_status(void) {
  if (s_rubrik == 1) return zeigt_route() ? &aktuelle_route()->status : &s_status_start;
  return zeigt_seite() ? &aktuelle()->status : &s_status_start;
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

// Jede Nachricht an das Handy trägt die Rubrik und die Nummer der offenen Detailansicht (-1 = keine).
// A_REQUEST: Seite anfordern (REQUEST), sonst AKTION + WAHL, bei der Suche dazu TEXT. Ist der Ausgang belegt,
// wird bis zu 10-mal nachgefasst.
#define A_REQUEST 0
static char s_offen_text[48];
static bool s_neu, s_offen_neu;     // NEU (0.15.0): Anfrage nach einer Abfahrt, das Handy umgeht seinen Puffer
static int detail_nr(void) { return s_modus == M_DETAIL ? s_dnr : -1; }
static bool aktion_schreiben(void) {
  DictionaryIterator *it;
  if (app_message_outbox_begin(&it) != APP_MSG_OK) return false;
  if (s_offen_aktion == A_REQUEST) dict_write_int32(it, MESSAGE_KEY_REQUEST, s_offen_wahl);
  else {
    dict_write_int32(it, MESSAGE_KEY_AKTION, s_offen_aktion);
    dict_write_int32(it, MESSAGE_KEY_WAHL, s_offen_wahl);
  }
  dict_write_int32(it, MESSAGE_KEY_RUBRIK, s_fahrt && s_modus == M_DETAIL ? RUBRIK_FAHRT : s_rubrik);
  dict_write_int32(it, MESSAGE_KEY_DETAIL, detail_nr());
  if (s_offen_text[0]) dict_write_cstring(it, MESSAGE_KEY_TEXT, s_offen_text);
  if (s_offen_neu) dict_write_int32(it, MESSAGE_KEY_NEU, 1);
  return app_message_outbox_send() == APP_MSG_OK;
}

static void sende_cb(void *data) {
  s_sendetimer = NULL;
  if (s_offen_aktion < 0) return;
  if (aktion_schreiben() || ++s_offen_versuche >= 10) { s_offen_aktion = -1; return; }
  s_sendetimer = app_timer_register(200, sende_cb, NULL);
}

static void abschicken(int aktion, int wahl, const char *text) {
  s_offen_aktion = aktion;
  s_offen_wahl = wahl;
  s_offen_neu = s_neu;
  s_offen_versuche = 0;
  snprintf(s_offen_text, sizeof(s_offen_text), "%s", text ? text : "");
  if (s_sendetimer) { app_timer_cancel(s_sendetimer); s_sendetimer = NULL; }
  if (aktion_schreiben()) s_offen_aktion = -1;
  else s_sendetimer = app_timer_register(200, sende_cb, NULL);
}
static void aktion_abschicken(int aktion, int wahl) { abschicken(aktion, wahl, NULL); }

// Gezeigte Seite (und offene Details) beim Handy anfordern. still: Statuszeile bleibt (automatisch jede Minute)
static bool s_ab_faellig;          // NACH ABFAHRT: oberste Abfahrt weg, Seite noch nicht neu angefragt (bei ab_planen)
static void anfordern_mit(bool still) {
  s_lade_t = jetzt();
  s_ab_faellig = false;                                // jede Antwort bringt die Liste ohnehin neu (nur kommende, 0.15.0)
  if (s_fahrt && s_modus == M_DETAIL) { abschicken(A_REQUEST, 0, NULL); return; }
  if (s_rubrik == 0 && s_hier) abschicken(A_HIER, s_hier_nr, NULL);
  else if (s_rubrik == 1 && s_sofort) abschicken(A_SOFORT_NR, s_sofort_nr, NULL);
  else abschicken(A_REQUEST, s_rubrik == 1 ? s_rseite : s_seite, NULL);
  if (!still && (s_rubrik == 1 ? zeigt_route() : zeigt_seite())) warten_starten();
}
static void anfordern(void) { anfordern_mit(false); }
static void anfordern_neu(void) { s_neu = true; anfordern_mit(true); s_neu = false; }   // nach einer Abfahrt, ohne Puffer

static int begrenzen(int32_t v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : (int)v; }

static void text_kopieren(char *ziel, int len, Tuple *t) {
  if (!t) return;
  strncpy(ziel, t->value->cstring, len - 1);
  ziel[len - 1] = '\0';
}

static void ruhe_cb(void *data);
static void ruhe_neu(void) {
  if (s_ruhe) app_timer_cancel(s_ruhe);
  s_ruhe = app_timer_register(RUHE_MS, ruhe_cb, NULL);
}
static void ruhe_cb(void *data) {
  s_ruhe = NULL;
  if (s_ohne >= 0) return;                           // Standard: bleibt offen; nächste Taste stellt die Zeit neu
  const bool konfig = s_konfig && jetzt() - s_konfig < KONFIG_S;
  // 0.7.1: in der aktiven Fahrt (Karte, Verlauf, ihre Menüs) keine Ruhe-Zeit — raus nur mit Zurück (Wunsch Seb)
  if ((s_modus == M_LADE && !s_lade_abgelaufen) || konfig || s_diktat_an || s_fahrt) { ruhe_neu(); return; }
  exit_reason_set(APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY);   // direkt zum Watchface, nicht ins App-Menü
  window_stack_pop_all(true);
}
static void taste(void) { s_taste = jetzt(); s_beruehrt = true; ruhe_neu(); lauf_starten(); }   // jede Taste: Lauftext von vorn
static bool seite_da(void) { return s_rubrik == 1 ? zeigt_route() : zeigt_seite(); }
static bool laden_erlaubt(void) {                      // OHNE TASTE: 0 immer, sonst bis so viele Minuten nach der letzten Taste
  return s_ohne == 0 || jetzt() - s_taste < (s_ohne > 0 ? s_ohne : 5) * 60;   // „nach 10 s schließen“: höchstens 5 min
}
// NACH ABFAHRT (0.15.0): Zeitgeber auf den Moment, in dem die oberste Abfahrt bzw. Verbindung aus der Liste fällt; dann
// neu laden, am Handy am Puffer vorbei (bis 0.14.0 standen bis zum nächsten Laden nur zwei da). Gestellt beim Zeichnen.
// Fährt sie ab, während Details oder Menü offen sind, lädt die Seite beim Zurückkommen (s_ab_faellig).
static AppTimer *s_ab_timer;
static int32_t s_ab_ziel;
static int32_t oberste_weg(void) {
  int idx[MAXD];
  const int32_t now = jetzt();
  if (s_rubrik == 1) { const Route *r = aktuelle_route(); return route_naechste(r, now, idx) ? r->los[idx[0]] + 61 : 0; }
  const Strecke *s = aktuelle();
  return naechste(s, now, idx) ? s->dep[idx[0]] + 1 : 0;
}
static void ab_cb(void *data) {
  s_ab_timer = NULL;
  s_ab_faellig = true;
  layer_mark_dirty(s_layer);                           // zeichnen() lädt (auf der Seite) und stellt den nächsten Zeitgeber
}
static void ab_planen(void) {                          // nur auf der Seite (zeichnen, M_ANZEIGE)
  if (s_ab_faellig) {
    s_ab_faellig = false;
    if (s_nachab && seite_da() && laden_erlaubt()) anfordern_neu();
  }
  const int32_t t = s_nachab && seite_da() ? oberste_weg() : 0;
  if (t == s_ab_ziel && (s_ab_timer || !t)) return;
  if (s_ab_timer) { app_timer_cancel(s_ab_timer); s_ab_timer = NULL; }
  s_ab_ziel = t;
  const int32_t dt = t - jetzt();
  if (t && dt < 3600) s_ab_timer = app_timer_register(dt > 0 ? dt * 1000 : 100, ab_cb, NULL);
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
  s_linfo[0] = '\0';
  s_lfrage = 0;
  s_lzwei = false;
  strncpy(s_ltitel, titel, LTXT - 1);
  s_ltitel[LTXT - 1] = '\0';
}

static void eintrag(const char *t, int aktion) {
  if (s_lanz >= (int)sizeof(s_lakt)) return;
  strncpy(s_ltext[s_lanz], t, LTXT - 1);
  s_ltext[s_lanz][LTXT - 1] = '\0';
  s_lakt[s_lanz++] = aktion;
}

static void liste_fertig(int sel) {
  s_lsel = sel < s_lanz ? sel : 0;
  if (s_lsel >= l_zeilen()) s_loben = s_lsel - l_zeilen() + 1;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static void anzeige_zeigen(void) {
  lade_stoppen();
  s_fahrt = false;
  s_modus = M_ANZEIGE;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

// ---------- Menüs (0.8.0) ----------
// Select lang öffnet das Menü dessen, was man sieht: gespeicherte Seite, Sofort-Ansicht oder Fahrt. Das Untermenü der
// Seite (bis 0.7.1 "HALTESTELLE 3 >") ist aufgelöst. Einträge, die nicht passen, fehlen; Einträge mit Gegenstand nennen
// ihn ("FAVORIT: KURHAUS", "LOESCHEN: HBF > KURHAUS"). Zurück führt dorthin, wo das Menü geöffnet wurde.
static void bit_name(char *buf, size_t n, const char *vor, const char *led, const char *klar) {
  snprintf(buf, n, "%s%s", vor, KLAR_ART && klar[0] ? klar : led);
}
static void seiten_name(char *buf, size_t n) {          // "HBF > KURHAUS" bzw. "HBF" (Abfahrten), "> KURHAUS" (Strecke ab Standort)
  const bool k = KLAR_ART;
  if (s_rubrik == 1) {
    const Route *r = aktuelle_route();
    const char *nach = k && r->klar[0] ? r->klar : r->name, *von = k && r->vonk[0] ? r->vonk : r->von;
    if (von[0]) snprintf(buf, n, "%s > %s", von, nach); else snprintf(buf, n, "> %s", nach);
    return;
  }
  const Strecke *s = aktuelle();
  const char *a = k && s->klar[0][0] ? s->klar[0] : s->name[0], *b = k && s->klar[1][0] ? s->klar[1] : s->name[1];
  if (b[0]) snprintf(buf, n, "%s > %s", a, b); else snprintf(buf, n, "%s", a);
}
static bool ist_fav(int32_t maske, int bit) { return bit >= 0 && bit < 31 && ((maske >> bit) & 1); }

// Heimathaltestelle (0.16.0, Wunsch Seb): im Menü jeder Abfahrten-Seite, von Abfahrten hier und der Startseite. Die
// Haltestelle der Seite wird Heimat; gibt es schon eine, heißt der Eintrag … AENDERN (mit Bestätigung). Fehlt, wenn sie es ist
static void heim_eintrag(const Strecke *s) {
  if (!s->ist_heim) eintrag(s_heim[0][0] ? T("HEIMATHALTESTELLE AENDERN", "Heimathaltestelle ändern") : T("HEIMATHALTESTELLE", "Heimathaltestelle"), A_HEIM_SEITE);
}
static void menue_zeigen(void) {
  char buf[2 * NAMELEN + 16], name[2 * NAMELEN + 4];
  s_aus_einst = false;
  const bool fahrt = s_fahrt_ende > jetzt();
  if (s_rubrik == 1) {
    if (s_sofort) {                                      // Strecke ab hier
      const Route *r = &s_rt[HIER];
      liste_beginnen(L_MENUE, T("STRECKE AB HIER", "Strecke ab hier"));
      if (fahrt) eintrag(T("AKTIVE FAHRT", "Aktive Fahrt"), A_FAHRT_ZEIGEN);
      if (r->n > 0) eintrag(T("WEITERE FAHRTEN", "Weitere Fahrten"), A_FAHRTEN);
      eintrag(T("NEU ANLEGEN", "Neu anlegen"), A_R_NEU);
      eintrag(T("STRECKE SPEICHERN", "Strecke speichern"), A_SOFORT_SPEICHERN);
      if (!ist_fav(s_sfav, 1)) { bit_name(buf, sizeof(buf), T("FAVORIT: ", "Favorit: "), r->name, r->klar); eintrag(buf, A_FAV_B); }
    } else {
      const bool da = s_ranzahl > 0;
      const Route *r = aktuelle_route();
      if (da) seiten_name(name, sizeof(name)); else snprintf(name, sizeof(name), "%s", T("STRECKEN", "Strecken"));
      liste_beginnen(L_MENUE, name);
      if (da && vt_rt(r)[0]) { vorschlag_teil(vt_rt(r), 0, buf, sizeof(buf)); eintrag(buf, A_FRUEHER); }
      if (fahrt) eintrag(T("AKTIVE FAHRT", "Aktive Fahrt"), A_FAHRT_ZEIGEN);
      if (da) eintrag(T("WEITERE FAHRTEN", "Weitere Fahrten"), A_FAHRTEN);
      eintrag(T("STRECKE AB HIER", "Strecke ab hier"), A_SOFORT);
      eintrag(T("NEU ANLEGEN", "Neu anlegen"), A_R_NEU);
      if (da) {
        eintrag(T("ANKOMMEN UM", "Ankommen um"), A_R_ANKUNFT);
        if (r->von[0]) eintrag(T("RUECKFAHRT", "Rückfahrt"), A_R_RUECK);
        eintrag(T("AENDERN", "Ändern"), A_R_AENDERN);
        if (r->von[0] && !ist_fav(s_rfav, 2 * s_rseite)) { bit_name(buf, sizeof(buf), T("FAVORIT: ", "Favorit: "), r->von, r->vonk); eintrag(buf, A_FAV_A); }
        if (!ist_fav(s_rfav, 2 * s_rseite + 1)) { bit_name(buf, sizeof(buf), T("FAVORIT: ", "Favorit: "), r->name, r->klar); eintrag(buf, A_FAV_B); }
      }
    }
  } else {
    if (s_hier) {                                        // Abfahrten hier
      const Strecke *s = &s_str[HIER];
      liste_beginnen(L_MENUE, s_start ? T("STARTSEITE", "Startseite") : T("ABFAHRTEN HIER", "Abfahrten hier"));
      if (fahrt) eintrag(T("AKTIVE FAHRT", "Aktive Fahrt"), A_FAHRT_ZEIGEN);
      if (s_hier_n > 0) eintrag(T("WEITERE FAHRTEN", "Weitere Fahrten"), A_FAHRTEN);
      if (s_start) eintrag(T("ABFAHRTEN HIER", "Abfahrten hier"), A_HIER_START);   // die 10 nächsten, hoch/runter
      eintrag(T("NEU ANLEGEN", "Neu anlegen"), A_NEU);
      if (s_hier_n > 0) eintrag(T("ABFAHRT SPEICHERN", "Abfahrt speichern"), A_SOFORT_SPEICHERN);
      if (s_hier_n > 0 && !ist_fav(s_sfav, 0)) { bit_name(buf, sizeof(buf), T("FAVORIT: ", "Favorit: "), s->name[0], s->klar[0]); eintrag(buf, A_FAV_A); }
      if (s_hier_n > 0) heim_eintrag(s);
    } else {
      const bool da = s_anzahl > 0;
      const Strecke *s = aktuelle();
      if (da) seiten_name(name, sizeof(name)); else snprintf(name, sizeof(name), "%s", T("ABFAHRTEN", "Abfahrten"));
      liste_beginnen(L_MENUE, name);
      if (da && vt_str(s)[0]) { vorschlag_teil(vt_str(s), 0, buf, sizeof(buf)); eintrag(buf, A_FRUEHER); }
      if (fahrt) eintrag(T("AKTIVE FAHRT", "Aktive Fahrt"), A_FAHRT_ZEIGEN);
      if (da) eintrag(T("WEITERE FAHRTEN", "Weitere Fahrten"), A_FAHRTEN);
      eintrag(T("ABFAHRTEN HIER", "Abfahrten hier"), A_HIER_START);
      eintrag(T("NEU ANLEGEN", "Neu anlegen"), A_NEU);
      if (da) {
        if (hat_ziel(s)) eintrag(T("RUECKFAHRT", "Rückfahrt"), A_RUECKFAHRT);
        eintrag(T("AENDERN", "Ändern"), A_AENDERN);
        if (!ist_fav(s_hfav, 2 * s_seite)) { bit_name(buf, sizeof(buf), T("FAVORIT: ", "Favorit: "), s->name[0], s->klar[0]); eintrag(buf, A_FAV_A); }
        if (hat_ziel(s) && !ist_fav(s_hfav, 2 * s_seite + 1)) { bit_name(buf, sizeof(buf), T("FAVORIT: ", "Favorit: "), s->name[1], s->klar[1]); eintrag(buf, A_FAV_B); }
        heim_eintrag(s);
      }
    }
  }
  eintrag(T("EINSTELLUNGEN >", "Einstellungen >"), A_EINST);
  if (!s_hier && !s_sofort && (s_rubrik == 1 ? s_ranzahl : s_anzahl) > 0) {
    seiten_name(name, sizeof(name));
    snprintf(buf, sizeof(buf), "%s%s", T("LOESCHEN: ", "Löschen: "), name);
    eintrag(buf, A_F_LOESCHEN);
  }
  liste_fertig(0);
}

// Menü der aktiven Fahrt: Select und Select lang öffnen dasselbe (die Fahrt ist ein einziges Element)
static void fahrt_menue_zeigen(void) {
  s_aus_einst = false;
  liste_beginnen(L_MENUE, T("FAHRT", "Fahrt"));
  eintrag(T("ANDERE FAHRT SUCHEN", "Andere Fahrt suchen"), A_VERPASST);
  eintrag(T("ABFAHRTEN", "Abfahrten"), A_ZU_ABF);
  eintrag(T("STRECKEN", "Strecken"), A_ZU_STR);
  eintrag(T("EINSTELLUNGEN >", "Einstellungen >"), A_EINST);
  eintrag(T("FAHRT BEENDEN", "Fahrt beenden"), A_F_BEENDEN);
  liste_fertig(0);
}
static void menue_oeffnen(void) {                      // aus Seite, Sofort-Ansicht, Details oder Fahrt
  s_menue_detail = s_modus == M_DETAIL;
  if (s_fahrt && s_modus == M_DETAIL) fahrt_menue_zeigen(); else menue_zeigen();
}
static void menue_wieder(void) {                       // aus Einstellungen und Abläufen zurück ins Menü
  if (s_menue_detail && s_fahrt) fahrt_menue_zeigen(); else menue_zeigen();
}
static void details_wieder(void);
static void menue_verlassen(void) {                    // Zurück aus dem Menü: dorthin, wo es geöffnet wurde
  if (s_menue_detail) { details_wieder(); if (s_fahrt) anfordern_mit(true); }
  else anzeige_zeigen();
}

// Bestätigungsseite (0.8.0): nur die obere Taste bestätigt (Select drückt man ohnehin dauernd), Zurück = nein
static void frage_zeigen(const char *kopf, const char *text, int aktion, int wahl) {
  snprintf(s_fkopf, sizeof(s_fkopf), "%s", kopf);
  snprintf(s_ftext, sizeof(s_ftext), "%s", text);
  s_faktion = aktion; s_fwahl = wahl;
  s_modus = M_FRAGE;
  layer_mark_dirty(s_layer);
}
static void aktion_senden(int aktion, int wahl);
static void heim_werte_zeigen(void);
static void frage_ja(void) {
  if (s_faktion == A_HEIM && s_fwahl < 0) {            // Heimathaltestelle löschen (0.16.0): sofort, zurück in ihre Liste
    s_heim[0][0] = s_heim[1][0] = '\0';
    for (int i = 0; i <= MAXS; i++) memset(s_str[i].heim, 0, MAXD);
    aktion_abschicken(A_HEIM, -1);
    heim_werte_zeigen();
    return;
  }
  aktion_senden(s_faktion, s_fwahl);
}
static void frage_nein(void) { s_modus = M_LISTE; lauf_starten(); layer_mark_dirty(s_layer); }   // die Liste ist noch da

static void umkreis_text(char *buf, size_t n, const char *vor, int m) {   // "UMKREIS 1KM" / "Umkreis: 1 km"
  if (m >= 1000) snprintf(buf, n, T("%s%dKM", "%s%d km"), vor, m / 1000);
  else snprintf(buf, n, T("%s%dM", "%s%d m"), vor, m);
}

// ---------- Einstellungen (0.15.0): oben nur Rubriken, darunter je Einstellung zwei Zeilen ----------
// Wunsch Seb 2026-10-15: EINSTELLUNGEN zeigt nur noch Rubriken (Anzeige, Aktualisieren, Abfahrten, Strecken, Favoriten,
// Suche, Daten). In einer Rubrik steht jede Einstellung mit Namen und darunter dem Wert als Satzteil. Select: zwei Werte
// schalten direkt um, mehr öffnen die Werteliste — oben eine Erklärzeile wie -- FAVORITEN --, die Auswahl steht auf dem
// aktuellen Wert. Danach zurück in die Rubrik. Bis 0.14.0 einzeilig, Quelle und Umkreis lose in EINSTELLUNGEN.
typedef struct { uint8_t rub, n; const char *name, *namek, *erkl, *erklk; int16_t w[5]; } Einst;
static const Einst EINST[S_N] = {
  [S_STARTSEITE] = { L_ANZEIGE, 2, "STARTSEITE", "Startseite", NULL, NULL, { 0, 1 } },
  [S_ANSICHT]    = { L_ANZEIGE, 3, "ANSICHT", "Ansicht", "-- SO SIEHT DIE APP AUS --", "-- So sieht die App aus --", { LAYOUT_PAPIER, LAYOUT_PHOSPHOR, LAYOUT_CARTOON } },
  [S_INVERS]     = { L_ANZEIGE, 2, "INVERTIERT", "Invertiert", NULL, NULL, { 0, 1 } },
  [S_KONTRAST]   = { L_ANZEIGE, 2, "HOHER KONTRAST", "Hoher Kontrast", NULL, NULL, { 0, 1 } },
  [S_ABFAHRT]    = { L_ANZEIGE, 2, "ABFAHRTSZEIT", "Abfahrtszeit", NULL, NULL, { ABF_PLAN, ABF_AKTUELL } },
  [S_DAUER]      = { L_ANZEIGE, 2, "FAHRTDAUER", "Fahrtdauer", NULL, NULL, { 1, 0 } },
  [S_REGEL]      = { L_AKTU, 4, "REGELMAESSIG", "Regelmäßig", "-- SEITE VON SELBST NEU LADEN --", "-- Seite von selbst neu laden --", { 1, 2, 5, 0 } },
  [S_NACHAB]     = { L_AKTU, 2, "NACH ABFAHRT", "Nach Abfahrt", NULL, NULL, { 1, 0 } },
  [S_OHNE]       = { L_AKTU, 4, "OHNE TASTE", "Ohne Taste", "-- WENN KEINE TASTE GEDRUECKT WIRD --", "-- Wenn keine Taste gedrückt wird --", { -1, 5, EIGEN, 0 } },
  [S_UMKREIS]    = { L_SUCHE, 3, "UMKREIS", "Umkreis", "-- SO WEIT LAEUFST DU HOECHSTENS --", "-- So weit läufst du höchstens --", { 500, 1000, 2000 } },
  [S_UMSTIEGE]   = { L_SUCHE, 5, "UMSTIEGE", "Umstiege", "-- SO OFT UMSTEIGEN HOECHSTENS --", "-- So oft umsteigen höchstens --", { 0, 1, 2, 3, 9 } },
  [S_FUSSWEG]    = { L_SUCHE, 4, "FUSSWEG", "Fußweg", "-- ZU FUSS AM ANFANG UND ENDE --", "-- Zu Fuß am Anfang und Ende --", { 5, 10, 15, 20 } },
  [S_UMSTZEIT]   = { L_SUCHE, 3, "UMSTIEGSZEIT", "Umstiegszeit", "-- ZEIT ZUM UMSTEIGEN --", "-- Zeit zum Umsteigen --", { 2, 5, 10 } },
  [S_QUELLE]     = { L_DATEN, 3, "QUELLE", "Quelle", "-- WOHER DIE ABFAHRTEN KOMMEN --", "-- Woher die Abfahrten kommen --", { QUELLE_AUTO, QUELLE_RMV, QUELLE_TRANS } },
};
// Wert als Satzteil: zweite Zeile in der Rubrik und Eintrag der Werteliste
static void wert_text(int s, int v, char *b, size_t n) {
  const char *t = "";
  switch (s) {
    case S_STARTSEITE: t = v ? T("AN, HALTESTELLE IN DER NAEHE", "an: Haltestelle in der Nähe") : T("AUS", "aus"); break;
    case S_ANSICHT: t = v == LAYOUT_PHOSPHOR ? T("PHOSPHOR", "Phosphor") : v == LAYOUT_CARTOON ? T("CARTOON", "Cartoon") : T("PAPIER", "Papier"); break;
    case S_INVERS: t = v ? T("AN, SCHWARZ AUF WEISS", "an: weiß auf Schwarz") : T("AUS", "aus"); break;
    case S_KONTRAST: t = v ? T("AN, KEINE GRAUE SCHRIFT", "an: keine graue Schrift") : T("AUS", "aus"); break;
    case S_ABFAHRT: t = v == ABF_AKTUELL ? T("AKTUELL, MIT VERSPAETUNG", "aktuell, mit Verspätung") : T("FAHRPLAN, VERSPAETUNG DAHINTER", "Fahrplan, Verspätung dahinter"); break;
    case S_DAUER: t = v ? T("AN", "an") : T("AUS", "aus"); break;
    case S_REGEL:
      if (v > 1) { snprintf(b, n, T("ALLE %d MIN", "alle %d min"), v); return; }
      t = v ? T("JEDE MINUTE", "jede Minute") : T("NUR BEIM OEFFNEN", "nur beim Öffnen");
      break;
    case S_NACHAB: t = v ? T("JA, GLEICH NEU LADEN", "ja, gleich neu laden") : T("NEIN", "nein"); break;
    case S_OHNE:
      if (v > 0 && v != EIGEN) { snprintf(b, n, T("NACH %d MIN NICHT MEHR LADEN", "nach %d min nicht mehr laden"), v); return; }
      t = v < 0 ? T("NACH 10 S SCHLIESSEN", "nach 10 s schließen") : v ? T("NACH ... MIN NICHT MEHR LADEN", "nach … min nicht mehr laden")
                : T("IMMER WEITER LADEN", "immer weiter laden");
      break;
    case S_UMKREIS: umkreis_text(b, n, "", v); return;
    case S_UMSTIEGE:
      if (v > 0 && v < 9) { snprintf(b, n, T("HOECHSTENS %d", "höchstens %d"), v); return; }
      t = v ? T("BELIEBIG", "beliebig") : T("KEINE, NUR DIREKT", "keine, nur direkt");
      break;
    case S_FUSSWEG: snprintf(b, n, T("HOECHSTENS %d MIN", "höchstens %d min"), v); return;
    case S_UMSTZEIT: snprintf(b, n, T("MINDESTENS %d MIN", "mindestens %d min"), v); return;
    case S_QUELLE: t = v == QUELLE_RMV ? T("NUR RMV", "nur RMV") : v == QUELLE_TRANS ? T("NUR TRANSITOUS", "nur Transitous")
                                       : T("AUTO: RMV, SONST TRANSITOUS", "Auto: RMV, sonst Transitous"); break;
  }
  snprintf(b, n, "%s", t);
}
static int einst_wert(int s) {
  switch (s) {
    case S_STARTSEITE: return s_startseite;
    case S_ANSICHT: return s_layout;
    case S_INVERS: return s_invers;
    case S_KONTRAST: return s_kontrast;
    case S_ABFAHRT: return s_abfahrt;
    case S_DAUER: return s_dauer;
    case S_REGEL: return s_regel;
    case S_NACHAB: return s_nachab;
    case S_OHNE: return s_ohne;
    case S_UMKREIS: return s_umkreis;
    case S_UMSTIEGE: return s_umstiege;
    case S_FUSSWEG: return s_fussweg;
    case S_UMSTZEIT: return s_umstzeit;
    default: return s_quelle;
  }
}
static const char *heim_name(void) { return KLAR_ART && s_heim[1][0] ? s_heim[1] : s_heim[0]; }
static const char *rub_name(int art) {
  switch (art) {
    case L_ANZEIGE: return T("ANZEIGE", "Anzeige");
    case L_AKTU: return T("AKTUALISIEREN", "Aktualisieren");
    case L_EABF: return T("ABFAHRTEN", "Abfahrten");
    case L_ESTR: return T("STRECKEN", "Strecken");
    case L_SUCHE: return T("SUCHE", "Suche");
    case L_DATEN: return T("DATEN", "Daten");
    default: return T("FAVORITEN", "Favoriten");
  }
}
// Reihenfolge der Rubriken; Favoriten ist eine Liste vom Handy (L_HANDY steht hier nur als Kennung)
static const uint8_t E_RUB[] = { L_ANZEIGE, L_AKTU, L_EABF, L_ESTR, L_HANDY, L_SUCHE, L_DATEN };
static void einstellungen_zeigen(int art) {            // art: Rubrik, auf der die Auswahl steht
  char buf[LTXT];
  int k = 0;
  s_aus_einst = false;                                 // Favoriten-Ablauf ist vorbei (setzt A_FAVORITEN neu)
  liste_beginnen(L_EINST, T("EINSTELLUNGEN", "Einstellungen"));
  for (unsigned i = 0; i < sizeof(E_RUB); i++) {
    if (E_RUB[i] == art) k = i;
    snprintf(buf, sizeof(buf), "%s >", rub_name(E_RUB[i]));
    s_lwert[s_lanz] = E_RUB[i];
    eintrag(buf, E_RUB[i] == L_HANDY ? A_FAVORITEN : A_RUB);
  }
  liste_fertig(k);
}
static void alle_text(char *buf, size_t n, int anzahl) {   // "ALLE 8 LOESCHEN"
  snprintf(buf, n, T("ALLE %d LOESCHEN", "Alle %d löschen"), anzahl);
}
static void rubrik_zeigen(int art, int sel) {          // eine Rubrik; sel: Einstellung, auf der die Auswahl steht
  char buf[LTXT], w[LTXT];
  int k = 0;
  liste_beginnen(art, rub_name(art));
  if (art == L_EABF || art == L_ESTR) {                // Abfahrten: Heimathaltestelle (0.16.0); beide: alle löschen (Bestätigung)
    const int n = art == L_EABF ? s_anzahl : s_ranzahl;
    s_lzwei = true;                                    // seit 0.16.0 zweizeilig wie die übrigen Rubriken
    if (art == L_EABF) {
      snprintf(buf, sizeof(buf), "%s|%s", T("HEIMATHALTESTELLE", "Heimathaltestelle"),
               s_heim[0][0] ? heim_name() : T("KEINE, IM MENUE EINER HALTESTELLE", "keine, im Menü einer Haltestelle"));
      eintrag(buf, A_HEIM_E);
    }
    if (n > 0) snprintf(w, sizeof(w), T("%d GESPEICHERT", "%d gespeichert"), n);
    snprintf(buf, sizeof(buf), "%s|%s", T("ALLE LOESCHEN", "Alle löschen"), n > 0 ? w : T("KEINE GESPEICHERT", "keine gespeichert"));
    eintrag(buf, n > 0 ? (art == L_EABF ? A_F_ALLE_ABF : A_F_ALLE_STR) : 0);
  } else {
    s_lzwei = true;
    for (int s = 0; s < S_N; s++) {
      if (EINST[s].rub != art || (s == S_KONTRAST && s_layout != LAYOUT_PHOSPHOR) || (s == S_INVERS && CARTOON)) continue;   // Papier hat nie Grau, Cartoon kein Invertiert
      wert_text(s, einst_wert(s), w, sizeof(w));
      snprintf(buf, sizeof(buf), "%s|%s", TV(EINST[s].name, EINST[s].namek), w);
      if (s == sel) k = s_lanz;
      s_lwert[s_lanz] = s;
      eintrag(buf, A_EINST_S);
    }
  }
  liste_fertig(k);
}
static void werte_zeigen(int s) {
  char buf[LTXT];
  const Einst *e = &EINST[s];
  const int v = einst_wert(s);
  int k = e->erkl ? 1 : 0;
  s_lset = s;
  liste_beginnen(L_WERTE, TV(e->name, e->namek));
  if (e->erkl) eintrag(TV(e->erkl, e->erklk), 0);      // Erklärzeile, nicht wählbar (Umschalter haben keine, 0.16.0)
  for (int i = 0; i < e->n; i++) {
    const int w = e->w[i];
    const bool eigen = s == S_OHNE && w == EIGEN, akt = eigen ? (v > 0 && v != 5) : w == v;   // eigene Angabe: n ≠ 5
    wert_text(s, eigen && akt ? v : w, buf, sizeof(buf));
    if (akt) k = s_lanz;
    s_lwert[s_lanz] = w;
    eintrag(buf, A_WERT);
  }
  liste_fertig(k);
}
static void zahl_zeigen(void) {                        // OHNE TASTE, eigene Angabe: 1–60 min, hoch/runter, Select übernimmt
  liste_beginnen(L_ZAHL, T("OHNE TASTE", "Ohne Taste"));
  snprintf(s_ltext[0], LTXT, "%s", T("-- NACH SO VIELEN MINUTEN --", "-- Nach so vielen Minuten --"));
  for (int i = 1; i <= 60; i++) snprintf(s_ltext[i], LTXT, T("%d MIN", "%d min"), i);
  s_lanz = 61;
  liste_fertig(s_ohne > 0 ? s_ohne : 10);
}

static void aktion_senden(int aktion, int wahl) {      // mit Antwort vom Handy: LADE zeigen
  aktion_abschicken(aktion, wahl);
  lade_zeigen();
}

static void layout_setzen(int v) {
  const int b = v & 7;
  s_layout = (b == 2 || b == 4) ? LAYOUT_PHOSPHOR : b == 7 ? LAYOUT_CARTOON : LAYOUT_PAPIER;   // grün -> weiß; LED, Klar, Signal -> Papier
  s_invers = b != 0 && b != 3 && (v & LW_INVERS);      // LED invertiert war dunkel auf hell; Cartoon zeigt es nicht, behält es
  s_kontrast = (v & LW_KONTRAST) != 0;
  farben_setzen();
  persist_write_int(PK_LAYOUT, layout_wert());
  if (s_dn > 0) {                                      // Umbruch der Halte hängt an der Schrift der Ansicht
    bild_bauen();
    if (s_doben > s_bn - d_sichtbar()) s_doben = s_bn - d_sichtbar() > 0 ? s_bn - d_sichtbar() : 0;
  }
}

static void umkreis_setzen(int m) {
  s_umkreis = (m == 500 || m == 2000) ? m : 1000;
  persist_write_int(PK_UMKREIS, s_umkreis);
}

static void abfahrt_setzen(int v) {
  s_abfahrt = v == ABF_AKTUELL ? ABF_AKTUELL : ABF_PLAN;
  persist_write_int(PK_ABFAHRT, s_abfahrt);
}

static void dauer_setzen(int v) {
  s_dauer = v != 0;
  persist_write_int(PK_DAUER, s_dauer ? 1 : 0);
}

static void strecken_setzen(int umst, int fuss, int uzeit) {   // Werte der Verbindungssuche, ungültige -> Standard
  s_umstiege = (umst >= 0 && umst <= 3) || umst == 9 ? umst : 2;
  s_fussweg = (fuss == 5 || fuss == 10 || fuss == 15 || fuss == 20) ? fuss : 15;
  s_umstzeit = (uzeit == 2 || uzeit == 5 || uzeit == 10) ? uzeit : 2;
  persist_write_int(PK_UMSTIEGE, s_umstiege);
  persist_write_int(PK_FUSSWEG, s_fussweg);
  persist_write_int(PK_UMSTZEIT, s_umstzeit);
}

static void quelle_setzen(int v) {
  s_quelle = (v == QUELLE_RMV || v == QUELLE_TRANS) ? v : QUELLE_AUTO;
  persist_write_int(PK_QUELLE, s_quelle);
}

// AKTU (Nachricht und Speicher, 0.15.0): Bit 0–3 Minuten REGELMAESSIG (0 = nur beim Öffnen), Bit 4 NACH ABFAHRT,
// Bit 5 STARTSEITE, Bit 8–15 OHNE TASTE + 1 (0 = nach 10 s schließen, 1 = immer weiter laden, sonst Minuten + 1)
static int aktu_wert(void) { return s_regel | (s_nachab ? 16 : 0) | (s_startseite ? 32 : 0) | ((s_ohne + 1) << 8); }
static void aktu_setzen(int v) {
  const int r = v & 15, o = ((v >> 8) & 255) - 1;
  s_regel = (r == 0 || r == 1 || r == 2 || r == 5) ? r : 1;
  s_nachab = (v & 16) != 0;
  s_startseite = (v & 32) != 0;
  s_ohne = (o >= -1 && o <= 60) ? o : 5;
  persist_write_int(PK_AKTU, aktu_wert());
}

// An der Uhr gewählt: sofort wirksam und gespeichert, das Handy merkt es sich für Seite und Einrichtung (lädt bei Bedarf neu)
static void einst_setzen(int s, int v) {
  switch (s) {
    case S_ANSICHT: case S_INVERS: case S_KONTRAST: {
      int w = layout_wert();
      const int bit = s == S_INVERS ? LW_INVERS : LW_KONTRAST;
      if (s == S_ANSICHT) w = (w & LW_SCHALTER) | (v == LAYOUT_PHOSPHOR ? 4 : v == LAYOUT_CARTOON ? 7 : 5);
      else w = v ? (w | bit) : (w & ~bit);
      layout_setzen(w);
      aktion_abschicken(A_LAYOUT, layout_wert());
      return;
    }
    case S_ABFAHRT: abfahrt_setzen(v); aktion_abschicken(A_ABFAHRT, s_abfahrt); return;
    case S_DAUER: dauer_setzen(v); aktion_abschicken(A_DAUER, s_dauer ? 1 : 0); return;
    case S_UMKREIS: umkreis_setzen(v); aktion_abschicken(A_UMKREIS, s_umkreis); return;
    case S_UMSTIEGE: strecken_setzen(v, s_fussweg, s_umstzeit); aktion_abschicken(A_UMSTIEGE, s_umstiege); return;
    case S_FUSSWEG: strecken_setzen(s_umstiege, v, s_umstzeit); aktion_abschicken(A_FUSSWEG, s_fussweg); return;
    case S_UMSTZEIT: strecken_setzen(s_umstiege, s_fussweg, v); aktion_abschicken(A_UMSTZEIT, s_umstzeit); return;
    case S_QUELLE: quelle_setzen(v); aktion_abschicken(A_QUELLE, s_quelle); return;
    default:                                           // Startseite und Aktualisieren: ein Wert für alle
      if (s == S_STARTSEITE) s_startseite = v; else if (s == S_REGEL) s_regel = v; else if (s == S_NACHAB) s_nachab = v; else s_ohne = v;
      aktu_setzen(aktu_wert());
      aktion_abschicken(A_AKTU, aktu_wert());
  }
}
// 0.16.0 (Seb 2026-10-16): jede Einstellung öffnet ihre Werteliste, auch bei zwei Werten (bis 0.15.0 schalteten die direkt
// um, die übrigen kehrten nach der Wahl in die Rubrik zurück). Select übernimmt den Wert sofort, die Liste bleibt offen —
// gezeichnet schon in der neuen Ansicht, der Kreis rechts steht auf dem neuen Wert. Zurück führt in die Rubrik.
static void einst_waehlen(int s) { werte_zeigen(s); }   // Select auf eine Einstellung
static void wert_waehlen(int v) {                      // in der Werteliste gewählt
  if (s_lset == S_OHNE && v == EIGEN) { zahl_zeigen(); return; }
  einst_setzen(s_lset, v);
  werte_zeigen(s_lset);
}
// Heimathaltestelle (0.16.0): gewählt wird sie im Menü einer Haltestelle; hier steht sie mit „keine“ zum Löschen
static void heim_werte_zeigen(void) {
  liste_beginnen(L_HEIM, T("HEIMATHALTESTELLE", "Heimathaltestelle"));
  eintrag(T("-- WAEHLEN IM MENUE EINER HALTESTELLE --", "-- Wählen im Menü einer Haltestelle --"), 0);
  if (s_heim[0][0]) eintrag(heim_name(), 0);
  eintrag(T("KEINE", "keine"), A_HEIM_WEG);
  liste_fertig(1);
}

// ---------- Suche: Buchstabenrad und Diktat (0.6.1) ----------
// Das Handy öffnet das Rad (L_ANZAHL -3) bzw. das Diktat (-4). Ab 3 Zeichen schickt die Uhr den Text (A_TIPP) und
// zeigt die drei besten Treffer; Select lang sucht (A_SUCHTEXT), Zurück löscht ein Zeichen, im leeren Rad: zurück.
static void rad_starten(const char *titel) {
  lade_stoppen();
  s_modus = M_SUCHE;
  snprintf(s_ltitel, sizeof(s_ltitel), "%s", titel);
  s_such[0] = s_treffer[0] = '\0';
  s_buchst = 0;
  layer_mark_dirty(s_layer);
}
static void rad_drehen(int d) { s_buchst = ((s_buchst + d) % RAD_N + RAD_N) % RAD_N; layer_mark_dirty(s_layer); }
static void rad_waehlen(void) {
  const size_t n = strlen(s_such);
  if (n + 1 >= sizeof(s_such)) return;
  s_such[n] = RAD[s_buchst] == '_' ? ' ' : RAD[s_buchst];
  s_such[n + 1] = '\0';
  s_buchst = 0;                                        // wieder bei A
  if (n + 1 >= 3) abschicken(A_TIPP, 0, s_such);
  layer_mark_dirty(s_layer);
}
static void rad_fertig(void) {
  if (!s_such[0]) return;
  abschicken(A_SUCHTEXT, 0, s_such);
  lade_zeigen();
}
static void rad_zurueck(void) {
  const size_t n = strlen(s_such);
  if (!n) { aktion_senden(A_ZURUECK, 0); return; }     // leer: das Handy zeigt wieder SUCHEN
  s_such[n - 1] = '\0';
  if (n - 1 >= 3) abschicken(A_TIPP, 0, s_such); else s_treffer[0] = '\0';
  layer_mark_dirty(s_layer);
}

static void diktat_cb(DictationSession *ds, DictationSessionStatus st, char *text, void *ctx) {
  s_diktat_an = false;
  ruhe_neu();
  if (st == DictationSessionStatusSuccess && text && text[0]) {
    size_t n = strlen(text);
    if (n >= sizeof(s_such)) {                          // auf ganze UTF-8-Zeichen kürzen
      n = sizeof(s_such) - 1;
      while (n > 0 && (text[n] & 0xC0) == 0x80) n--;
    }
    memcpy(s_such, text, n);
    s_such[n] = '\0';
    abschicken(A_SUCHTEXT, 0, s_such);
    lade_zeigen();
    snprintf(s_ladetext, sizeof(s_ladetext), "%s", s_such);
  } else {
    aktion_senden(A_ZURUECK, 0);                       // abgebrochen oder nicht verfügbar: wieder SUCHEN
  }
}
static void diktat_starten(void) {
  if (!s_diktat) s_diktat = dictation_session_create(160, diktat_cb, NULL);
  s_diktat_an = s_diktat != NULL;
  lade_zeigen();
  snprintf(s_ladetext, sizeof(s_ladetext), "%s", T("SPRECHEN", "Sprechen"));
  if (!s_diktat || dictation_session_start(s_diktat) != DictationSessionStatusSuccess) aktion_senden(A_ZURUECK, 0);
}

// ---------- Sofort-Ansichten: Nächste Haltestelle, Von hier nach ----------
static void hier_starten(void) {                       // Haltestellen: Platz HIER, Handy holt Standort
  Strecke *s = &s_str[HIER];
  memset(s, 0, sizeof(*s));
  strcpy(s->name[0], "STANDORT");
  strcpy(s->klar[0], "Standort ...");
  s_hier_start = s_start;                              // von der Startseite: Zurück führt dorthin (0.15.0)
  s_start = false;
  s_rubrik = 0; s_hier = true; s_sofort = false;
  s_hier_nr = s_hier_n = s_hier_m = 0;
  s_hier0 = false;
  anzeige_zeigen();
  anfordern();
}
static void hier_beenden(void) {
  s_hier = false;
  lauf_starten();
  if (s_anzahl > 0) anfordern();
  layer_mark_dirty(s_layer);
}
static void sofort_starten(int k) {                    // Strecken: Platz HIER, Ziel Nummer k der Liste am Handy
  Route *r = &s_rt[HIER];
  memset(r, 0, sizeof(*r));
  strcpy(r->name, "...");
  strcpy(r->klar, "...");
  s_rubrik = 1; s_sofort = true; s_hier = s_start = false;
  s_sofort_nr = k; s_sofort_n = 0;
  anzeige_zeigen();
  warten_starten();                                    // das Handy lädt schon von selbst
}
static void sofort_beenden(void) {
  s_sofort = false;
  lauf_starten();
  if (s_ranzahl > 0) anfordern();
  layer_mark_dirty(s_layer);
}

// ---------- Startseite (0.15.0) ----------
// Inhalt und Menü wie ABFAHRTEN HIER (Platz HIER, Nummer 0). Hoch = Rubrik Abfahrten, Runter = Rubrik Strecken, jeweils
// mit der Seite, die das Handy nach Standort wählt (E1); Zurück auf einer Seite = Startseite, auf der Startseite = App
// verlassen. Ohne Standort beim Öffnen oder mit Schalter aus: wie bisher die letzte Rubrik. Die aktive Fahrt geht vor.
static void rubrik_cb(void *data);
static void start_zeigen(bool anfragen) {
  Strecke *s = &s_str[HIER];
  if (!s_hier0 || !s->name[0][0]) {                   // anderer Inhalt im Platz HIER: leeren, bis das Handy antwortet
    memset(s, 0, sizeof(*s));
    strcpy(s->name[0], "STANDORT");
    strcpy(s->klar[0], "Standort ...");
    s->status = ST_LADE;
    s_hier_m = 0;
  }
  s_start = s_hier = true; s_rubrik = 0; s_sofort = false; s_hier_nr = 0;
  anzeige_zeigen();
  if (anfragen) anfordern();
}
static void start_verlassen(int rub) {                 // Hoch/Runter: zur Rubrik, ihr Name 1 s groß
  s_start = s_hier = false;
  s_rubrik = rub;
  persist_write_int(PK_RUBRIK, rub);
  if (s_rubrik_timer) app_timer_cancel(s_rubrik_timer);
  s_rubrik_timer = app_timer_register(RUBRIK_MS, rubrik_cb, NULL);
  lauf_starten();
  if (seite_da()) anfordern();
  layer_mark_dirty(s_layer);
}
static void start_abbrechen(void) {                    // Startseite geht nicht: wie bisher die zuletzt genutzte Rubrik
  s_start = s_hier = false;
  s_rubrik = persist_exists(PK_RUBRIK) && persist_read_int(PK_RUBRIK) == 1 ? 1 : 0;
  lauf_starten();
  if (seite_da()) anfordern();
  layer_mark_dirty(s_layer);
}

// ---------- Aktive Fahrt (0.6.6) ----------
static void fahrt_oeffnen(void) {
  lade_stoppen();
  s_fahrt = true;
  s_karte = true;                                      // erst die Karte, runter: Verlauf
  s_k->phase = 0;
  s_dakt = -1;
  s_modus = M_DETAIL;
  s_dnr = 0;
  s_dn = -1;
  s_bn = s_doben = 0;
  s_dfrisch = true;                                    // beim Eintreffen zum relevanten Abschnitt rollen
  layer_mark_dirty(s_layer);
  anfordern_mit(true);
}
static void fahrt_schliessen(void) {                  // zurück zur Seite der Rubrik
  anzeige_zeigen();
  if (seite_da()) anfordern_mit(true);
}
// Select in den Details: Menü der gezeigten Fahrt (0.8.0 ohne ZURUECK-Eintrag, dafür ist die Zurück-Taste da).
// NAECHSTE FAHRT entfällt seit 0.13.0 (Seb): WEITERE FAHRTEN im Menü der Seite kann dasselbe und mehr.
static void detail_menue_zeigen(void) {
  liste_beginnen(L_DMENUE, T("DETAILS", "Details"));
  if (s_dn > 0) eintrag(T("FAHRT STARTEN", "Fahrt starten"), A_FAHRT_START);
  if (!s_lanz) { details_wieder(); return; }          // nichts anzubieten (lädt noch, keine Fahrt): Details bleiben
  liste_fertig(0);
}
static void details_wieder(void) { s_modus = M_DETAIL; layer_mark_dirty(s_layer); }   // Zeilen sind noch da
// Uhr weckt sich zur Frage nach einem knappen Anschluss (Handy schickt die Zeit)
static void wecken_setzen(int32_t t) {
  wakeup_cancel_all();
  if (t > time(NULL) + 60) {
    const WakeupId id = wakeup_schedule(t, 1, true);
    if (id < 0) APP_LOG(APP_LOG_LEVEL_WARNING, "Wecken nicht gesetzt: %d", (int)id);
  }
}
static void fahrt_empfangen(DictionaryIterator *it, int32_t ende) {
  s_fahrt_ende = ende;
  text_kopieren(s_ftitel, NAMELEN, dict_find(it, MESSAGE_KEY_F_TITEL));
  Tuple *w = dict_find(it, MESSAGE_KEY_WECKEN);
  wecken_setzen(w ? w->value->int32 : 0);
  if (!ende && s_fahrt && s_modus == M_DETAIL) fahrt_schliessen();
}
static void geweckt(WakeupId id, int32_t cookie) {   // App läuft schon: Anschluss gleich prüfen lassen
  vibes_double_pulse();
  ruhe_neu();
  if (s_fahrt_ende) fahrt_oeffnen();
}

// Listen und Fortschritt vom Handy. true = Nachricht gehörte zum Menü.
static bool menue_empfangen(DictionaryIterator *it) {
  Tuple *t;
  bool menue = false;
  if ((t = dict_find(it, MESSAGE_KEY_L_ANZAHL))) {
    menue = true;
    const int n = t->value->int32;
    Tuple *ti = dict_find(it, MESSAGE_KEY_L_TITEL);
    if (n == -2) {                                       // Ablauf beendet, gleich zur Anzeige (Favorit, Fahrt beendet)
      anzeige_zeigen();                                  // 0.15.0: und die Seite neu anfragen (Startseite nach der Fahrt leer)
      if (seite_da()) anfordern_mit(!s_start || s_hier0);
    }
    else if (n == -6) fahrt_oeffnen();                   // aktive Fahrt zeigen (gestartet, Frage beantwortet)
    else if (n == -7) detail_oeffnen(LISTE);             // in WEITERE FAHRTEN gewählt: deren Details (0.13.0)
    else if (n == -3) rad_starten(ti ? ti->value->cstring : "");
    else if (n == -4) diktat_starten();
    else if (n == -5) { Tuple *w = dict_find(it, MESSAGE_KEY_WAHL); sofort_starten(w ? w->value->int32 : 0); }
    else if (n < 0) { if (s_aus_einst) einstellungen_zeigen(L_HANDY); else menue_wieder(); }   // Ablauf am Handy beendet (Favoriten: L_HANDY)
    else {
      liste_beginnen(L_HANDY, ti ? ti->value->cstring : "");
      text_kopieren(s_linfo, sizeof(s_linfo), dict_find(it, MESSAGE_KEY_L_INFO));
      Tuple *fr = dict_find(it, MESSAGE_KEY_L_FRAGE);
      s_lfrage = fr ? (uint32_t)fr->value->int32 : 0;
      if (dict_find(it, MESSAGE_KEY_L_SUMMEN)) vibes_short_pulse();   // Vorschlag in der Fahrt
      s_lanz = begrenzen(n, 0, MAXL);
      for (int i = 0; i < s_lanz; i++) s_ltext[i][0] = '\0';
      Tuple *w = dict_find(it, MESSAGE_KEY_WAHL);        // Auswahl vorgegeben (WEITERE FAHRTEN: die erste kommende)
      if (w && s_lanz > 0) {
        s_lsel = begrenzen(w->value->int32, 0, s_lanz - 1);
        s_loben = s_lsel > 1 ? s_lsel - 1 : 0;
        if (s_loben > s_lanz - LZEILEN) s_loben = s_lanz - LZEILEN > 0 ? s_lanz - LZEILEN : 0;
      }
      lauf_starten();
    }
  }
  if ((t = dict_find(it, MESSAGE_KEY_L_AB))) {
    menue = true;
    const int ab = t->value->int32;
    if (s_modus == M_LISTE && s_lart == L_HANDY)
      for (int j = 0; j < LBLOCK; j++)
        if (ab + j >= 0 && ab + j < s_lanz) text_kopieren(s_ltext[ab + j], LTXT, dict_find(it, MESSAGE_KEY_L_TEXT + j));
    if (ab == 0 && s_lsel == 0 && s_modus == M_LISTE && trenner(0) && s_lanz > 1) s_lsel = 1;   // nicht auf der Überschrift beginnen
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
  if ((t = dict_find(it, MESSAGE_KEY_TREFFER))) {        // Live-Treffer unter dem Buchstabenrad
    menue = true;
    text_kopieren(s_treffer, sizeof(s_treffer), t);
  }
  return menue;
}

static void liste_bewegen(int d) {
  if (s_lanz <= 0) return;
  s_lsel = (s_lsel + d + s_lanz) % s_lanz;             // am Ende wieder oben
  for (int n = 0; n < s_lanz && trenner(s_lsel); n++) s_lsel = (s_lsel + d + s_lanz) % s_lanz;   // Überschriften überspringen
  if (s_lsel < s_loben) s_loben = s_lsel;
  if (s_lsel >= s_loben + l_zeilen()) s_loben = s_lsel - l_zeilen() + 1;
  lauf_starten();
  layer_mark_dirty(s_layer);
}

static void liste_waehlen(void) {
  if (s_lanz <= 0) return;
  if (s_lart == L_HANDY) {
    if (!s_ltext[s_lsel][0] || trenner(s_lsel)) return;   // noch unterwegs bzw. Zwischenüberschrift
    if (s_lsel < 31 && ((s_lfrage >> s_lsel) & 1)) { frage_zeigen(s_ltitel, s_ltext[s_lsel], A_WAHL, s_lsel); return; }   // Ersetzen, Löschen
    aktion_senden(A_WAHL, s_lsel);
    return;
  }
  if (s_lart == L_ZAHL) {                              // OHNE TASTE, eigene Angabe: Eintrag k = k Minuten; Liste bleibt (0.16.0)
    if (s_lsel > 0) { const int k = s_lsel, o = s_loben; einst_setzen(S_OHNE, k); zahl_zeigen(); s_loben = o; layer_mark_dirty(s_layer); }
    return;
  }
  const int a = s_lakt[s_lsel];
  const int seite = s_rubrik == 1 ? (s_sofort ? HIER : s_rseite) : (s_hier ? HIER : s_seite);
  char buf[LTXT];
  switch (a) {
    case A_FAHRT_START: aktion_senden(A_FAHRT_START, s_rubrik); break;
    case A_VERPASST: aktion_senden(A_VERPASST, 0); break;
    case A_FAHRT_ZEIGEN: fahrt_oeffnen(); break;
    case A_FAHRTEN: aktion_senden(A_FAHRTEN, seite); break;   // Liste rechnet das Handy (0.13.0)
    case A_HIER_START: hier_starten(); break;
    case 0: break;                                     // Erklärzeile, „Keine gespeichert“: nichts zu wählen
    case A_EINST: einstellungen_zeigen(L_ANZEIGE); break;
    case A_RUB: rubrik_zeigen(s_lwert[s_lsel], -1); break;
    case A_EINST_S: einst_waehlen(s_lwert[s_lsel]); break;
    case A_WERT: wert_waehlen(s_lwert[s_lsel]); break;
    case A_FRUEHER: detail_oeffnen(VORSCHLAG); break;
    case A_ZU_ABF: case A_ZU_STR:                      // aus der Fahrt zu den Seiten, die Fahrt läuft weiter
      s_rubrik = a == A_ZU_STR ? 1 : 0; s_hier = s_sofort = s_start = false;
      persist_write_int(PK_RUBRIK, s_rubrik);
      anzeige_zeigen();
      if (seite_da()) anfordern();
      break;
    case A_FAV_A: case A_FAV_B: aktion_senden(A_FAV_SEITE, seite * 2 + (a == A_FAV_B ? 1 : 0)); break;
    case A_SOFORT_SPEICHERN: aktion_senden(A_SOFORT_SPEICHERN, s_rubrik == 1 ? s_sofort_nr : s_hier_nr); break;
    case A_F_LOESCHEN: {
      char name[2 * NAMELEN + 4], frage[2 * NAMELEN + 16];
      seiten_name(name, sizeof(name));
      snprintf(frage, sizeof(frage), "%s%s", T("LOESCHEN: ", "Löschen: "), name);
      frage_zeigen(s_rubrik == 1 ? T("STRECKEN", "Strecken") : T("ABFAHRTEN", "Abfahrten"), frage,
                   s_rubrik == 1 ? A_R_LOESCHEN : A_LOESCHEN, seite);
      break;
    }
    case A_F_BEENDEN: frage_zeigen(T("FAHRT", "Fahrt"), T("FAHRT BEENDEN", "Fahrt beenden"), A_FAHRT_ENDE, 0); break;
    case A_HEIM_SEITE: case A_HEIM_WEG: {              // Heimat setzen (ersetzt sie eine andere: Bestätigung) bzw. löschen
      char frage[2 * NAMELEN + 16];
      if (!s_heim[0][0]) { if (a == A_HEIM_SEITE) aktion_senden(A_HEIM, seite); break; }
      if (a == A_HEIM_WEG) snprintf(frage, sizeof(frage), "%s%s", T("LOESCHEN: ", "Löschen: "), heim_name());
      else {
        bit_name(buf, sizeof(buf), "", aktuelle()->name[0], aktuelle()->klar[0]);
        snprintf(frage, sizeof(frage), T("HEIMAT: %s STATT %s", "Heimat: %s statt %s"), buf, heim_name());
      }
      frage_zeigen(T("HEIMATHALTESTELLE", "Heimathaltestelle"), frage, A_HEIM, a == A_HEIM_WEG ? -1 : seite);
      break;
    }
    case A_HEIM_E: heim_werte_zeigen(); break;
    case A_F_ALLE_ABF: alle_text(buf, sizeof(buf), s_anzahl); frage_zeigen(T("ABFAHRTEN", "Abfahrten"), buf, A_ALLE_LOESCHEN, 0); break;
    case A_F_ALLE_STR: alle_text(buf, sizeof(buf), s_ranzahl); frage_zeigen(T("STRECKEN", "Strecken"), buf, A_ALLE_LOESCHEN, 1); break;
    case A_FAVORITEN: s_aus_einst = true; aktion_senden(A_FAVORITEN, 0); break;
    case A_SOFORT: aktion_senden(A_SOFORT, 0); break;
    case A_R_NEU: aktion_senden(A_R_NEU, -1); break;
    case A_R_AENDERN: aktion_senden(A_R_NEU, s_rseite); break;
    case A_R_RUECK: case A_R_LOESCHEN: case A_R_ANKUNFT: aktion_senden(a, s_rseite); break;
    default: aktion_senden(a, s_seite);                // Abfahrten: neu, ändern, Rückfahrt
  }
}

// ---------- Detailansicht ----------
static void detail_oeffnen(int nr) {
  s_fahrt = false;
  s_modus = M_DETAIL;
  s_dnr = nr;
  s_dn = -1;
  s_bn = s_doben = 0;
  s_dfrisch = true;
  layer_mark_dirty(s_layer);
  anfordern_mit(true);                                 // Details zeigen selbst LADE, die Seite behält ihren Status
}
static void detail_scrollen(int d) {
  if (karte_zeigen()) {                                // runter: in den Verlauf, beim aktuellen Schritt
    if (d > 0 && s_dn > 0) { s_karte = false; d_zum_akt(); layer_mark_dirty(s_layer); }
    return;
  }
  if (d < 0 && s_doben == 0 && karte_moeglich()) { s_karte = true; layer_mark_dirty(s_layer); return; }   // oben: zurück zur Karte
  const int max = s_bn - d_sichtbar();
  s_doben += d;
  if (s_doben > max) s_doben = max;
  if (s_doben < 0) s_doben = 0;
  layer_mark_dirty(s_layer);
}
static void d_zum_akt(void) {                          // markierten Schritt als zweite Zeile zeigen
  int j = -1;
  for (int b = 0; b < s_bn && j < 0; b++) if ((s_bz[b] & 0x7F) == s_dakt) j = b;
  if (j < 0) { d_zum_jetzt(); return; }
  s_doben = j > 1 ? j - 1 : 0;
  if (s_doben > s_bn - d_sichtbar()) s_doben = s_bn - d_sichtbar();
  if (s_doben < 0) s_doben = 0;
}
// Balken im Verlauf der Fahrt (0.15.0): steht er auf einem Zwischenhalt, dessen Abfahrt vorbei ist, rückt er zum nächsten
// Halt desselben Abschnitts weiter („+ 3 weitere“ ohne Zeit wird übersprungen). Zeile des Ausstiegs: bleibt stehen.
static bool d_akt_nachziehen(int32_t now) {
  if (!s_fahrt || s_dakt < 0 || s_dakt >= s_dn) return false;
  int a = s_dakt;
  while (Z_ART(s_dz[a].art) == Z_ZWISCHEN && s_dz[a].t && s_dz[a].t <= now) {
    int j = a + 1;
    while (j < s_dn && Z_ART(s_dz[j].art) == Z_ZWISCHEN && !s_dz[j].t) j++;
    if (j >= s_dn) break;
    const int aj = Z_ART(s_dz[j].art);
    if (aj != Z_ZWISCHEN && aj != Z_HALT && aj != Z_ZIEL) break;
    a = j;
  }
  if (a == s_dakt) return false;
  s_dakt = a;
  return true;
}
// Zeitgeber genau auf die nächste Halt-Zeit (Karte oder Balken), statt auf die nächste Antwort vom Handy zu warten
static AppTimer *s_halt_timer;
static bool s_halt_gefragt;        // Namen der Halte aufgebraucht, das Handy ist schon gefragt
static void halt_cb(void *data);
static void halt_planen(void) {
  if (s_halt_timer) { app_timer_cancel(s_halt_timer); s_halt_timer = NULL; }
  if (!s_fahrt) return;
  const int32_t now = jetzt();
  int32_t t = 0;
  for (int p = 0; p < 3 && !t; p++) if (s_k->ht[p] > now) t = s_k->ht[p];
  if (s_dakt >= 0 && s_dakt < s_dn && Z_ART(s_dz[s_dakt].art) == Z_ZWISCHEN && s_dz[s_dakt].t > now && (!t || s_dz[s_dakt].t < t))
    t = s_dz[s_dakt].t;
  if (t && t - now < 3600) s_halt_timer = app_timer_register((t - now) * 1000 + 300, halt_cb, NULL);
}
static void halt_cb(void *data) {
  s_halt_timer = NULL;
  if (!s_fahrt) return;
  if (d_akt_nachziehen(jetzt()) && !s_karte && jetzt() - s_taste > 20) d_zum_akt();   // mitrollen, wie beim Handy (0.13.0)
  if (!s_halt_gefragt && karte_vorbei() == 3 && s_k->halte - 1 > 3 && s_modus == M_DETAIL) { s_halt_gefragt = true; anfordern_mit(true); }
  layer_mark_dirty(s_layer);
  halt_planen();
}
static void karte_empfangen(DictionaryIterator *it, int phase) {
  Tuple *t;
  s_k->phase = phase;
  if ((t = dict_find(it, MESSAGE_KEY_K_ZEIT))) s_k->zeit = t->value->int32;
  if ((t = dict_find(it, MESSAGE_KEY_K_HALTE))) s_k->halte = t->value->int32;
  if ((t = dict_find(it, MESSAGE_KEY_K_RF))) s_k->rf = t->value->int32;
  text_kopieren(s_k->kopf, sizeof(s_k->kopf), dict_find(it, MESSAGE_KEY_K_KOPF));
  text_kopieren(s_k->kopfr, sizeof(s_k->kopfr), dict_find(it, MESSAGE_KEY_K_KOPFR));
  text_kopieren(s_k->zeitl, sizeof(s_k->zeitl), dict_find(it, MESSAGE_KEY_K_ZEITL));
  text_kopieren(s_k->r1, sizeof(s_k->r1), dict_find(it, MESSAGE_KEY_K_R1));
  text_kopieren(s_k->r2, sizeof(s_k->r2), dict_find(it, MESSAGE_KEY_K_R2));
  text_kopieren(s_k->label, sizeof(s_k->label), dict_find(it, MESSAGE_KEY_K_LABEL));
  text_kopieren(s_k->name, sizeof(s_k->name), dict_find(it, MESSAGE_KEY_K_NAME));
  text_kopieren(s_k->steig, sizeof(s_k->steig), dict_find(it, MESSAGE_KEY_K_STEIG));
  text_kopieren(s_k->fuss, sizeof(s_k->fuss), dict_find(it, MESSAGE_KEY_K_FUSS));
  for (int i = 0; i < KZ; i++) {
    text_kopieren(s_k->l[i], sizeof(s_k->l[i]), dict_find(it, MESSAGE_KEY_K_L + i));
    text_kopieren(s_k->w[i], sizeof(s_k->w[i]), dict_find(it, MESSAGE_KEY_K_W + i));
    text_kopieren(s_k->r[i], sizeof(s_k->r[i]), dict_find(it, MESSAGE_KEY_K_R + i));
    text_kopieren(s_k->s[i], sizeof(s_k->s[i]), dict_find(it, MESSAGE_KEY_K_S + i));
    s_k->f[i] = (t = dict_find(it, MESSAGE_KEY_K_F + i)) ? (uint8_t)t->value->int32 : 0;
  }
  for (int i = 0; i < 3; i++) {                        // nächste Halte im Fahrzeug (0.15.0)
    s_k->ht[i] = (t = dict_find(it, MESSAGE_KEY_K_HT + i)) ? t->value->int32 : 0;
    s_k->hn[i][0] = '\0';
    text_kopieren(s_k->hn[i], sizeof(s_k->hn[i]), dict_find(it, MESSAGE_KEY_K_HN + i));
  }
  s_halt_gefragt = false;
  halt_planen();
}
static void detail_empfangen(DictionaryIterator *it, int ab) {
  Tuple *ru = dict_find(it, MESSAGE_KEY_RUBRIK), *se = dict_find(it, MESSAGE_KEY_SEITE), *t;
  const int rub = ru ? (int)ru->value->int32 : 0, seite = se ? (int)se->value->int32 : -1;
  const int erwartet = rub == 1 ? (s_sofort ? HIER : s_rseite) : (s_hier ? HIER : s_seite);
  if (s_modus != M_DETAIL) return;
  if (rub == RUBRIK_FAHRT ? !s_fahrt : (s_fahrt || rub != s_rubrik || seite != erwartet)) return;   // nicht (mehr) gefragt
  if (ab == 0) {
    memset(s_dz, 0, DMAX * sizeof *s_dz);
    if ((t = dict_find(it, MESSAGE_KEY_D_N))) s_dn = begrenzen(t->value->int32, 0, DMAX);
    if ((t = dict_find(it, MESSAGE_KEY_D_NR))) s_dnr = begrenzen(t->value->int32, 0, LISTE);
    if ((t = dict_find(it, MESSAGE_KEY_D_AKT))) {
      // Balken rückt weiter (nächster Halt): mitrollen, wenn seit 20 s keine Taste gedrückt wurde (0.13.0)
      if (s_fahrt && t->value->int32 != s_dakt && jetzt() - s_taste > 20) s_dfolgen = true;
      s_dakt = t->value->int32;
    }
    s_dstand = (t = dict_find(it, MESSAGE_KEY_D_STAND)) ? t->value->int32 : 0;
  }
  for (int j = 0; j < DBLOCK; j++) {
    const int i = ab + j;
    if (i < 0 || i >= DMAX || !(t = dict_find(it, MESSAGE_KEY_D_ART + j))) continue;
    Zeile *z = &s_dz[i];
    z->art = t->value->int32;
    if ((t = dict_find(it, MESSAGE_KEY_D_ZEIT + j))) z->t = t->value->int32;
    text_kopieren(z->text, DTXT, dict_find(it, MESSAGE_KEY_D_TEXT + j));
    text_kopieren(z->zus, DTXT, dict_find(it, MESSAGE_KEY_D_ZUS + j));
    text_kopieren(z->re, sizeof(z->re), dict_find(it, MESSAGE_KEY_D_RE + j));
  }
  bild_bauen();
  if (s_fahrt && ab + DBLOCK >= s_dn) {                // Antwort eben erst gerechnet: Balken gleich auf den Stand der Uhr
    if (d_akt_nachziehen(jetzt()) && jetzt() - s_taste > 20) s_dfolgen = true;
    halt_planen();
  }
  if ((s_dfrisch || s_dfolgen) && ab + DBLOCK >= s_dn) { s_dfrisch = s_dfolgen = false; if (s_fahrt) d_zum_akt(); else d_zum_jetzt(); }
  else if (s_doben > s_bn - d_sichtbar()) s_doben = s_bn - d_sichtbar() > 0 ? s_bn - d_sichtbar() : 0;
}

// ---------- Empfang ----------
static void vorschlag_empfangen(DictionaryIterator *it, int rub, int i) {   // jede Seiten-Nachricht setzt oder löscht ihn
  Tuple *t = dict_find(it, MESSAGE_KEY_V_TEXT);
  if (t && t->length > 1) { text_kopieren(s_vtext, VTXT, t); s_vrub = rub; s_vseite = i; }   // length zählt die Null mit
  else if (s_vrub == rub && s_vseite == i) s_vrub = s_vseite = -1;
}
static void routen_einrichtung(DictionaryIterator *it, int n) {   // Strecken: Anzahl, Namen, aktive Seite, Werte
  Tuple *t;
  s_ranzahl = begrenzen(n, 0, MAXS);
  for (int i = 0; i < MAXS; i++) {
    Route *r = &s_rt[i];
    char a[NAMELEN], b[NAMELEN];
    strncpy(a, r->name, NAMELEN); strncpy(b, r->von, NAMELEN);
    if (i >= s_ranzahl) r->name[0] = r->klar[0] = r->von[0] = r->vonk[0] = '\0';
    text_kopieren(r->name, NAMELEN, dict_find(it, MESSAGE_KEY_R_NAME + i));
    text_kopieren(r->klar, NAMELEN, dict_find(it, MESSAGE_KEY_R_KLAR + i));
    text_kopieren(r->von, NAMELEN, dict_find(it, MESSAGE_KEY_R_VON + i));
    text_kopieren(r->vonk, NAMELEN, dict_find(it, MESSAGE_KEY_R_VONK + i));
    if (strcmp(a, r->name) || strcmp(b, r->von)) { r->n = 0; r->stand = 0; r->status = ST_LADE; }   // neu, geändert, aufgerückt
  }
  if ((t = dict_find(it, MESSAGE_KEY_R_SEITE))) s_rseite = begrenzen(t->value->int32, 0, s_ranzahl > 0 ? s_ranzahl - 1 : 0);
  Tuple *u = dict_find(it, MESSAGE_KEY_UMSTIEGE), *f = dict_find(it, MESSAGE_KEY_FUSSWEG), *z = dict_find(it, MESSAGE_KEY_UMSTZEIT);
  if (u && f && z) strecken_setzen(u->value->int32, f->value->int32, z->value->int32);
  if (s_modus != M_ANZEIGE && s_modus != M_DETAIL && !s_aus_einst) {   // Ablauf fertig (gespeichert, gelöscht): Strecken zeigen
    // (nicht in Einstellungen > Favoriten: dort schickt das Handy nach dem Umbenennen nur die Namen nach)
    s_rubrik = 1; s_sofort = s_start = false;
    persist_write_int(PK_RUBRIK, s_rubrik);
    anzeige_zeigen();
    if (s_ranzahl > 0 && s_rt[s_rseite].stand == 0) warten_starten();
  }
  lauf_starten();
}

static void route_empfangen(DictionaryIterator *it, int i) {     // Verbindungen einer Strecke
  Tuple *x;
  i = begrenzen(i, 0, HIER);
  Route *r = &s_rt[i];
  if (i == HIER) {
    text_kopieren(r->name, NAMELEN, dict_find(it, MESSAGE_KEY_HIER_NAME));
    text_kopieren(r->klar, NAMELEN, dict_find(it, MESSAGE_KEY_HIER_KLAR));
    if ((x = dict_find(it, MESSAGE_KEY_HIER_NR))) s_sofort_nr = x->value->int32;
    if ((x = dict_find(it, MESSAGE_KEY_HIER_N))) s_sofort_n = x->value->int32;
    lauf_starten();
  }
  if ((x = dict_find(it, MESSAGE_KEY_R_N))) r->n = begrenzen(x->value->int32, 0, MAXD);
  for (int j = 0; j < MAXD; j++) {
    if ((x = dict_find(it, MESSAGE_KEY_R_LOS + j))) r->los[j] = x->value->int32;
    if ((x = dict_find(it, MESSAGE_KEY_R_AN + j))) r->an[j] = x->value->int32;
    if ((x = dict_find(it, MESSAGE_KEY_R_UM + j))) r->um[j] = x->value->int32;
    if ((x = dict_find(it, MESSAGE_KEY_R_DEL + j))) r->del[j] = x->value->int32;
    if ((x = dict_find(it, MESSAGE_KEY_R_FLAG + j))) r->flag[j] = x->value->int32;
    text_kopieren(r->kette[j], NAMELEN, dict_find(it, MESSAGE_KEY_R_KETTE + j));
  }
  if ((x = dict_find(it, MESSAGE_KEY_STAND))) r->stand = x->value->int32;
  text_kopieren(r->quelle, sizeof(r->quelle), dict_find(it, MESSAGE_KEY_QUELLE));
  vorschlag_empfangen(it, 1, i);
  if ((x = dict_find(it, MESSAGE_KEY_STATUS))) r->status = (int)x->value->int32;
  if (s_rubrik == 1 && r == aktuelle_route() && s_timeout) { app_timer_cancel(s_timeout); s_timeout = NULL; }
}

// Sprung vom Handy: Startseite nach Standort oder laufende Fahrt (mit DETAIL). Nur, solange nichts gedrückt wurde.
static void sprung(DictionaryIterator *it, int seite) {
  Tuple *ru = dict_find(it, MESSAGE_KEY_RUBRIK), *de = dict_find(it, MESSAGE_KEY_DETAIL);
  const int rub = ru ? (int)ru->value->int32 : 0, n = rub == 1 ? s_ranzahl : s_anzahl;
  if (s_start && rub != RUBRIK_FAHRT && rub != RUBRIK_START) {   // Startseite: nur die Seite für Hoch bzw. Runter (E1)
    if (n > 0) { if (rub == 1) s_rseite = begrenzen(seite, 0, n - 1); else s_seite = begrenzen(seite, 0, n - 1); }
    return;
  }
  if (s_beruehrt || (s_hier && !s_start) || s_sofort || s_modus != M_ANZEIGE) return;
  if (rub == RUBRIK_FAHRT) { if (s_fahrt_ende > jetzt()) fahrt_oeffnen(); return; }
  if (rub == RUBRIK_START) { if (!s_start) start_zeigen(false); return; }   // das Handy lädt die Startseite schon
  if (n <= 0) return;
  s_rubrik = rub;
  persist_write_int(PK_RUBRIK, s_rubrik);
  if (rub == 1) s_rseite = begrenzen(seite, 0, n - 1); else s_seite = begrenzen(seite, 0, n - 1);
  lauf_starten();
  if (de && de->value->int32 >= 0) detail_oeffnen(de->value->int32);
  else anfordern();                                    // Handy merkt sich die Seite und lädt sie
}

static void empfangen(DictionaryIterator *it, void *ctx) {
  Tuple *t;
  ruhe_neu();                                          // was Neues auf dem Schirm: wieder 10 s zum Lesen
  if ((t = dict_find(it, MESSAGE_KEY_KONFIG))) { s_konfig = t->value->int32 ? jetzt() : 0; return; }
  if ((t = dict_find(it, MESSAGE_KEY_H_FAV))) s_hfav = t->value->int32;   // welche Orte schon Favorit sind (0.8.0)
  if ((t = dict_find(it, MESSAGE_KEY_R_FAV))) s_rfav = t->value->int32;
  if ((t = dict_find(it, MESSAGE_KEY_S_FAV))) s_sfav = t->value->int32;
  if ((t = dict_find(it, MESSAGE_KEY_HEIM_N))) {       // Heimathaltestelle (0.16.0), leer = keine
    text_kopieren(s_heim[0], NAMELEN, t);
    text_kopieren(s_heim[1], NAMELEN, dict_find(it, MESSAGE_KEY_HEIM_K));
  }
  if ((t = dict_find(it, MESSAGE_KEY_FAHRT))) { fahrt_empfangen(it, t->value->int32); layer_mark_dirty(s_layer); return; }
  if ((t = dict_find(it, MESSAGE_KEY_K_PHASE))) { if (s_fahrt) karte_empfangen(it, t->value->int32); layer_mark_dirty(s_layer); return; }
  if (menue_empfangen(it)) { layer_mark_dirty(s_layer); return; }
  if ((t = dict_find(it, MESSAGE_KEY_SPRUNG))) { sprung(it, t->value->int32); layer_mark_dirty(s_layer); return; }
  if ((t = dict_find(it, MESSAGE_KEY_D_AB))) { detail_empfangen(it, t->value->int32); layer_mark_dirty(s_layer); return; }
  if ((t = dict_find(it, MESSAGE_KEY_R_ANZAHL))) { routen_einrichtung(it, t->value->int32); layer_mark_dirty(s_layer); return; }
  t = dict_find(it, MESSAGE_KEY_ANZAHL);
  if (t) {                                               // Einrichtung Haltestellen: Anzahl, Namen, aktive Seite
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
      if (strcmp(a, s_str[i].name[0]) || strcmp(b, s_str[i].name[1])) {   // Seite neu, geändert oder aufgerückt
        memset(s_str[i].dep, 0, sizeof(s_str[i].dep));
        s_str[i].stand = 0;
        s_str[i].status = ST_LADE;
      }
    }
    t = dict_find(it, MESSAGE_KEY_SEITE);
    if (t) s_seite = begrenzen(t->value->int32, 0, s_anzahl > 0 ? s_anzahl - 1 : 0);
    if ((t = dict_find(it, MESSAGE_KEY_LAYOUT))) layout_setzen(t->value->int32);   // Handy führt die Einstellung
    if ((t = dict_find(it, MESSAGE_KEY_UMKREIS))) umkreis_setzen(t->value->int32);
    if ((t = dict_find(it, MESSAGE_KEY_QUELLWAHL))) quelle_setzen(t->value->int32);
    if ((t = dict_find(it, MESSAGE_KEY_ABFAHRT))) abfahrt_setzen(t->value->int32);
    if ((t = dict_find(it, MESSAGE_KEY_DAUER))) dauer_setzen(t->value->int32);
    if (s_anzahl == 0 && s_timeout && s_rubrik == 0) { app_timer_cancel(s_timeout); s_timeout = NULL; }
    if (s_modus != M_ANZEIGE && s_modus != M_DETAIL && !s_aus_einst) {   // Menü-Ablauf fertig (gespeichert, gelöscht): Abfahrten zeigen
      s_rubrik = 0; s_hier = s_start = false;
      persist_write_int(PK_RUBRIK, s_rubrik);
      anzeige_zeigen();
      if (s_anzahl > 0 && s_str[s_seite].stand == 0) warten_starten();
    }
    if (s_anzahl > 0 && s_str[s_seite].stand == 0) s_str[s_seite].status = ST_LADE;
    if ((t = dict_find(it, MESSAGE_KEY_AKTU))) {         // Startseite und Aktualisieren (0.15.0), das Handy führt sie
      const bool vorher = s_startseite;
      aktu_setzen(t->value->int32);
      if (s_startseite != vorher && !s_beruehrt && s_modus == M_ANZEIGE) {   // beim Öffnen: wie am Handy eingestellt
        if (!s_startseite && s_start) start_abbrechen();
        else if (s_startseite && !s_start && !s_hier && !s_sofort) start_zeigen(false);
      }
    }
    lauf_starten();
  } else if ((t = dict_find(it, MESSAGE_KEY_SEITE))) {   // Abfahrten einer Haltestellen-Seite oder Verbindungen einer Strecke
    Tuple *ru = dict_find(it, MESSAGE_KEY_RUBRIK);
    if (ru && ru->value->int32 == 1) { route_empfangen(it, t->value->int32); layer_mark_dirty(s_layer); return; }
    const int i = begrenzen(t->value->int32, 0, HIER);
    Strecke *s = &s_str[i];
    if (i == HIER) {                                     // Nächste Haltestelle: Name und Nummer der Haltestelle
      text_kopieren(s->name[0], NAMELEN, dict_find(it, MESSAGE_KEY_HIER_NAME));
      text_kopieren(s->klar[0], NAMELEN, dict_find(it, MESSAGE_KEY_HIER_KLAR));
      Tuple *x;
      if ((x = dict_find(it, MESSAGE_KEY_HIER_NR))) s_hier_nr = x->value->int32;
      if ((x = dict_find(it, MESSAGE_KEY_HIER_N))) s_hier_n = x->value->int32;
      s_hier_m = (x = dict_find(it, MESSAGE_KEY_HIER_M)) ? x->value->int32 : 0;
      s_hier0 = s_hier_nr == 0;
      lauf_starten();
    }
    for (int j = 0; j < MAXD; j++) {
      Tuple *x;
      if ((x = dict_find(it, MESSAGE_KEY_AB + j))) s->dep[j] = x->value->int32;
      text_kopieren(s->lin[j], LINLEN, dict_find(it, MESSAGE_KEY_AB_L + j));
      if ((x = dict_find(it, MESSAGE_KEY_AB_D + j))) s->del[j] = x->value->int32;
      if ((x = dict_find(it, MESSAGE_KEY_AB_F + j))) s->dur[j] = x->value->int32;
      text_kopieren(s->steig[j], STEIGLEN, dict_find(it, MESSAGE_KEY_AB_S + j));
      text_kopieren(s->end[j], NAMELEN, dict_find(it, MESSAGE_KEY_AB_Z + j));
      text_kopieren(s->endk[j], NAMELEN, dict_find(it, MESSAGE_KEY_AB_ZK + j));
      if ((x = dict_find(it, MESSAGE_KEY_AB_H + j))) { s->heim[j] = x->value->int32 & 3; s->mi[j] = x->value->int32 >> 2; }
    }
    if ((t = dict_find(it, MESSAGE_KEY_HEIM_S))) s->ist_heim = t->value->int32 != 0;
    if ((t = dict_find(it, MESSAGE_KEY_STAND))) s->stand = t->value->int32;
    text_kopieren(s->quelle, sizeof(s->quelle), dict_find(it, MESSAGE_KEY_QUELLE));
    vorschlag_empfangen(it, 0, i);
    if ((t = dict_find(it, MESSAGE_KEY_STATUS))) s->status = (int)t->value->int32;
    if (s_rubrik == 0 && s == aktuelle() && s_timeout) { app_timer_cancel(s_timeout); s_timeout = NULL; }
    // Startseite beim Öffnen ohne Standort: wie bisher die letzte Rubrik (0.15.0); später bleibt „kein Standort“ stehen
    if (i == HIER && s_start && s->status == ST_STANDORT && !s_beruehrt && s_modus == M_ANZEIGE) start_abbrechen();
  }
  layer_mark_dirty(s_layer);
}

// ---------- Bedienung ----------
static void blaettern(int d) {                         // Hoch/Runter auf der Seite
  if (s_start) { start_verlassen(d < 0 ? 0 : 1); return; }   // Startseite: Hoch = Abfahrten, Runter = Strecken
  if (s_rubrik == 1) {
    if (s_sofort) {                                    // Von hier nach: nächstes Ziel der Liste
      s_sofort_nr += d;
      if (s_sofort_n > 0) s_sofort_nr = (s_sofort_nr + s_sofort_n) % s_sofort_n;
      s_rt[HIER].n = 0;
      strcpy(s_rt[HIER].name, "...");
      strcpy(s_rt[HIER].klar, "...");
      anfordern();
      return;
    }
    if (s_ranzahl < 2) return;
    s_rseite = (s_rseite + d + s_ranzahl) % s_ranzahl;
  } else {
    if (s_hier) {                                      // Nächste Haltestelle: nächstnähere bzw. vorige
      s_hier_nr += d;
      if (s_hier_n > 0) s_hier_nr = (s_hier_nr + s_hier_n) % s_hier_n;
      memset(s_str[HIER].dep, 0, sizeof(s_str[HIER].dep));
      s_hier0 = false;
      strcpy(s_str[HIER].name[0], "...");
      strcpy(s_str[HIER].klar[0], "...");
      anfordern();
      return;
    }
    if (s_anzahl < 2) return;
    s_seite = (s_seite + d + s_anzahl) % s_anzahl;
  }
  lauf_starten();
  anfordern();
}

static void rubrik_cb(void *data) { s_rubrik_timer = NULL; layer_mark_dirty(s_layer); }
static void rubrik_wechseln(void) {                    // Hoch/Runter lang: Haltestellen <-> Strecken
  s_rubrik = !s_rubrik;
  s_hier = s_sofort = false;
  persist_write_int(PK_RUBRIK, s_rubrik);
  if (s_rubrik_timer) app_timer_cancel(s_rubrik_timer);
  s_rubrik_timer = app_timer_register(RUBRIK_MS, rubrik_cb, NULL);
  lauf_starten();
  anfordern();                                         // Handy merkt sich die Rubrik und lädt die Seite
  layer_mark_dirty(s_layer);
}

static void schritt(int d) {                           // Hoch/Runter außerhalb der Seite
  if (s_modus == M_LISTE) liste_bewegen(d);
  else if (s_modus == M_DETAIL) detail_scrollen(d);
  else if (s_modus == M_SUCHE) rad_drehen(d);
}

// Hoch/Runter roh: auf der Seite wirkt der kurze Druck beim Loslassen (blättern), gehalten wechselt die Rubrik.
// In Listen, Details und im Rad wirkt der Druck sofort, gehalten läuft es schnell weiter.
static void lang_cb(void *data) {
  s_lang_timer = NULL;
  s_lang_fertig = true;
  if (s_modus == M_ANZEIGE) { if (s_start) start_verlassen(s_lang_d < 0 ? 0 : 1); else rubrik_wechseln(); return; }
  schritt(s_lang_d);
  s_lang_timer = app_timer_register(120, lang_cb, NULL);
}
static void hr_runter(ClickRecognizerRef r, void *ctx) {
  taste();
  if (s_modus == M_FRAGE) { if ((int)(intptr_t)ctx < 0) frage_ja(); return; }   // nur die obere Taste bestätigt
  s_lang_d = (int)(intptr_t)ctx;
  s_lang_fertig = false;
  if (s_lang_timer) app_timer_cancel(s_lang_timer);
  if (s_modus != M_ANZEIGE) schritt(s_lang_d);
  s_lang_timer = app_timer_register(s_modus == M_ANZEIGE ? LANG_MS : 400, lang_cb, NULL);
}
static void hr_hoch(ClickRecognizerRef r, void *ctx) {
  if (s_lang_timer) { app_timer_cancel(s_lang_timer); s_lang_timer = NULL; }
  if (!s_lang_fertig && s_modus == M_ANZEIGE) blaettern(s_lang_d);
  s_lang_fertig = true;
}

static void zurueck(void) {
  taste();
  switch (s_modus) {
    case M_ANZEIGE:
      if (s_start) { exit_reason_set(APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY); window_stack_pop(true); }   // Startseite: raus
      else if (s_rubrik == 0 && s_hier) { if (s_hier_start && s_startseite) start_zeigen(true); else hier_beenden(); }
      else if (s_rubrik == 1 && s_sofort) sofort_beenden();
      else if (s_startseite) start_zeigen(true);     // 0.15.0: von einer Seite eine Ebene hoch zur Startseite
      else { exit_reason_set(APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY); window_stack_pop(true); }   // direkt zum Watchface
      break;
    case M_DETAIL:
      // 0.8.0: in der Fahrt Verlauf -> Karte -> App verlassen (beim Öffnen wieder die Fahrt)
      if (s_fahrt && !s_karte && karte_moeglich()) { s_karte = true; layer_mark_dirty(s_layer); }
      else if (s_fahrt) { exit_reason_set(APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY); window_stack_pop_all(true); }
      else if (s_dnr == LISTE) aktion_senden(A_FAHRTEN, -1);   // zurück in WEITERE FAHRTEN (0.13.0)
      else anzeige_zeigen();
      break;
    case M_SUCHE: rad_zurueck(); break;
    case M_FRAGE: frage_nein(); break;
    case M_LISTE:
      switch (s_lart) {
        case L_EINST: menue_wieder(); break;
        case L_ANZEIGE: case L_AKTU: case L_EABF: case L_ESTR: case L_SUCHE: case L_DATEN: einstellungen_zeigen(s_lart); break;
        case L_WERTE: rubrik_zeigen(EINST[s_lset].rub, s_lset); break;
        case L_ZAHL: werte_zeigen(S_OHNE); break;
        case L_HEIM: rubrik_zeigen(L_EABF, -1); break;
        case L_MENUE: menue_verlassen(); break;
        case L_DMENUE: details_wieder(); break;
        default: aktion_senden(A_ZURUECK, 0);
      }
      break;
    case M_LADE:
      if (!s_lade_abgelaufen) aktion_senden(A_ZURUECK, 0);   // Handy bricht ab und zeigt die vorige Liste
      else if (s_aus_einst) einstellungen_zeigen(L_HANDY);
      else menue_wieder();                             // Handy antwortet nicht: lokal zurück
      break;
  }
}

// Select = das gewählte Element (Seite: Details öffnen; Details: ihr Menü). Die Fahrt ist ein einziges Element:
// Select und Select lang öffnen dort dasselbe Fahrt-Menü. Auf der Bestätigungsseite tut Select nichts (0.8.0).
static void select_click(ClickRecognizerRef r, void *ctx) {
  taste();
  if (s_modus == M_ANZEIGE) { if (seite_da()) detail_oeffnen(0); }
  else if (s_modus == M_DETAIL) { if (s_fahrt) menue_oeffnen(); else detail_menue_zeigen(); }
  else if (s_modus == M_LISTE) liste_waehlen();
  else if (s_modus == M_SUCHE) rad_waehlen();
}
static void select_lang(ClickRecognizerRef r, void *ctx) {
  taste();
  if (s_modus == M_ANZEIGE || s_modus == M_DETAIL) menue_oeffnen();   // Menü dessen, was man sieht
  else if (s_modus == M_SUCHE) rad_fertig();
}
static void back_click(ClickRecognizerRef r, void *ctx) { zurueck(); }
static void clicks(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click);
  window_long_click_subscribe(BUTTON_ID_SELECT, 500, select_lang, NULL);
  window_raw_click_subscribe(BUTTON_ID_UP, hr_runter, hr_hoch, (void *)(intptr_t)-1);
  window_raw_click_subscribe(BUTTON_ID_DOWN, hr_runter, hr_hoch, (void *)(intptr_t)1);
  window_single_click_subscribe(BUTTON_ID_BACK, back_click);
}

// ---------- Touch (0.6.1): Wischen wie Hoch/Runter, Tippen wählt (auf eine Abfahrt: deren Details) ----------
#define BETRAG(v) ((v) < 0 ? -(v) : (v))
static int16_t s_tx0, s_ty0, s_tx, s_ty;
static bool s_tan;
static int block_bei(int y) {                          // Nummer der Abfahrt bzw. Verbindung unter dem Finger, -1 = keine
  int y0, dy;
  if (s_start) { y0 = ST_Y0 - 4; dy = ST_DY; }
  else if (s_rubrik == 1) { y0 = s_layout == LAYOUT_PAPIER ? 92 : 101; dy = s_layout == LAYOUT_PAPIER ? 39 : 38; }
  else {
    const bool ziel = hat_ziel(aktuelle());
    if (s_layout == LAYOUT_PAPIER) { y0 = ziel ? 92 : 72; dy = ziel ? 39 : 45; }
    else { y0 = ziel ? 101 : 84; dy = ziel ? 38 : 43; }
  }
  if (y < y0) return -1;
  const int k = (y - y0) / dy;
  return k < MAXD ? k : -1;
}
// Tippen wählt, was man antippt. Wo es nichts zu wählen gibt (Details, Fahrt, Bestätigung), tut es nichts (0.8.0;
// 0.6.5 bis 0.7.1 schloss Tippen die Details, in der Fahrt führte es zur Seite — ungewollt raus aus der Fahrt).
static void antippen(int x, int y) {
  if (s_modus == M_ANZEIGE) {
    if (!seite_da()) return;
    int idx[MAXD], n, k = block_bei(y);
    const char *vt = s_rubrik == 1 ? vt_rt(aktuelle_route()) : vt_str(aktuelle());
    if (vt[0] && k == MAXD - 1) { detail_oeffnen(VORSCHLAG); return; }   // dritte Zeile: Vorschlag FRUEHER DA
    n = s_rubrik == 1 ? route_naechste(aktuelle_route(), jetzt(), idx) : naechste(aktuelle(), jetzt(), idx);
    detail_oeffnen(k >= 0 && k < n ? k : 0);   // Platz in der gezeigten Liste, wie das Handy zählt (0.15.0)
  } else if (s_modus == M_LISTE) {
    const int k = (y - (KLAR_ART ? K_Y0 : P_Y0) - liste_versatz()) / l_hoehe();
    if (k >= 0 && k < l_zeilen() && s_loben + k < s_lanz) { s_lsel = s_loben + k; liste_waehlen(); }
  } else if (s_modus == M_SUCHE) rad_waehlen();
}
static void beruehrt(const TouchEvent *e, void *ctx) {
  if (e->type == TouchEvent_Touchdown) { s_tx0 = s_tx = e->x; s_ty0 = s_ty = e->y; s_tan = !e->non_navigational; return; }
  if (e->type == TouchEvent_PositionUpdate) { s_tx = e->x; s_ty = e->y; return; }
  if (!s_tan) return;                                  // Liftoff
  s_tan = false;
  if (e->x || e->y) { s_tx = e->x; s_ty = e->y; }
  const int dx = s_tx - s_tx0, dy = s_ty - s_ty0;
  taste();
  if (BETRAG(dy) >= 30 && BETRAG(dy) > BETRAG(dx)) {   // Wischen nach oben = weiter (wie Runter)
    const int d = dy < 0 ? 1 : -1;
    if (s_modus == M_ANZEIGE) blaettern(d); else schritt(d);
  } else if (BETRAG(dx) < 20 && BETRAG(dy) < 20) antippen(s_tx0, s_ty0);
}

// Jede Minute neu zeichnen. Neu laden (0.15.0, AKTUALISIEREN): Seite und Details alle s_regel Minuten (0 = nur beim
// Öffnen), solange OHNE TASTE es erlaubt (Standard bis 5 min nach der letzten Taste); die aktive Fahrt jede Minute.
// Bis 0.14.0 fest jede Minute bis 5 min nach der letzten Taste (AKTIV_S). NACH ABFAHRT stellt ab_planen().
static void tick(struct tm *t, TimeUnits u) {
  layer_mark_dirty(s_layer);
  if (s_fahrt_ende && jetzt() > s_fahrt_ende) {        // Fahrt vorbei (Ankunft): zurück zur Seite
    s_fahrt_ende = 0;
    if (s_fahrt && s_modus == M_DETAIL) { fahrt_schliessen(); return; }
  }
  if (s_fahrt && s_modus == M_DETAIL) anfordern_mit(true);   // Fahrt bleibt offen: jede Minute neu (Phase, Echtzeit)
  else if ((s_modus == M_ANZEIGE || s_modus == M_DETAIL) && seite_da() && s_regel && laden_erlaubt() &&
           jetzt() - s_lade_t >= s_regel * 60 - 30) anfordern_mit(true);
}

// ---------- Lebenszyklus ----------
static void window_load(Window *w) {
  Layer *root = window_get_root_layer(w);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, zeichnen);
  layer_add_child(root, s_layer);
  schriften_setzen();
  touch_service_subscribe(beruehrt, NULL);
}

static void window_unload(Window *w) { touch_service_unsubscribe(); layer_destroy(s_layer); }

// Große Puffer auf dem Heap statt fest im App-Abbild: das darf höchstens 64 KB groß sein (text + data + bss),
// der Heap hat auf der PT2 gut 50 KB frei. Listen seit 0.7.0, Routen, Details, Karte, Raster seit 0.8.2.
// Der Mac-Nachbau tools/vorschau ruft dieselbe Funktion.
static void puffer_anlegen(void) {
  s_ltext = calloc(MAXL, LTXT);
  s_str = calloc(MAXS + 1, sizeof(Strecke));
  s_rt = calloc(MAXS + 1, sizeof(Route));
  s_dz = calloc(DMAX, sizeof(Zeile));
  s_k = calloc(1, sizeof(Karte));
}

static void init(void) {
  puffer_anlegen();
  app_message_register_inbox_received(empfangen);
  // Einrichtung mit 8 Seiten und Namen in zwei Schreibweisen braucht mehr als 1 KB; Ausgang mit Suchtext 256
  const uint32_t ein = app_message_inbox_size_maximum();
  app_message_open(ein < 2048 ? ein : 2048, 256);
  const int lw = persist_exists(PK_LAYOUT) ? persist_read_int(PK_LAYOUT) : -1;
  if (lw >= 0) layout_setzen(lw); else farben_setzen();
  if (persist_exists(PK_AKTU)) aktu_setzen(persist_read_int(PK_AKTU));
  else if (lw >= 0 && (lw & LW_SCHLIESSEN)) s_ohne = -1;   // APP SCHLIESSEN bis 0.14.0 -> OHNE TASTE: nach 10 s schließen
  if (persist_exists(PK_UMKREIS)) umkreis_setzen(persist_read_int(PK_UMKREIS));
  if (persist_exists(PK_QUELLE)) quelle_setzen(persist_read_int(PK_QUELLE));
  if (persist_exists(PK_ABFAHRT)) abfahrt_setzen(persist_read_int(PK_ABFAHRT));
  if (persist_exists(PK_DAUER)) dauer_setzen(persist_read_int(PK_DAUER));
  if (persist_exists(PK_RUBRIK)) s_rubrik = persist_read_int(PK_RUBRIK) == 1 ? 1 : 0;
  if (persist_exists(PK_UMSTIEGE))
    strecken_setzen(persist_read_int(PK_UMSTIEGE), persist_read_int(PK_FUSSWEG), persist_read_int(PK_UMSTZEIT));
  s_taste = jetzt();
  if (s_startseite) {                                  // Startseite gleich zeigen; ohne Standort schaltet das Handy zurück
    s_start = s_hier = true; s_rubrik = 0;
    strcpy(s_str[HIER].name[0], "STANDORT");
    strcpy(s_str[HIER].klar[0], "Standort ...");
  }

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_click_config_provider(s_window, clicks);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);

  tick_timer_service_subscribe(MINUTE_UNIT, tick);
  wakeup_service_subscribe(geweckt);
  if (launch_reason() == APP_LAUNCH_WAKEUP) vibes_double_pulse();   // geweckt für die Frage nach dem Anschluss
  ruhe_neu();
  warten_starten();   // das Handy lädt beim Start von selbst ('ready'), hier nur auf Antwort warten
}

static void deinit(void) {
  if (s_lauf) app_timer_cancel(s_lauf);
  lade_stoppen();
  if (s_sendetimer) app_timer_cancel(s_sendetimer);
  if (s_lang_timer) app_timer_cancel(s_lang_timer);
  if (s_rubrik_timer) app_timer_cancel(s_rubrik_timer);
  if (s_ruhe) app_timer_cancel(s_ruhe);
  if (s_ab_timer) app_timer_cancel(s_ab_timer);
  if (s_halt_timer) app_timer_cancel(s_halt_timer);
  if (s_cart_timer) app_timer_cancel(s_cart_timer);
  if (s_diktat) dictation_session_destroy(s_diktat);
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
  free(s_ltext); free(s_str); free(s_rt); free(s_dz); free(s_k);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
  return 0;
}

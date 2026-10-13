// Minimal-Nachbau der Pebble-API, nur um main.c auf dem Mac zu übersetzen und das Display zu rendern.
#pragma once
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <time.h>
#include <stdlib.h>
typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
typedef struct { uint8_t r, g, b; } GColor;
typedef struct GContext GContext;
typedef struct Layer Layer; typedef struct Window Window; typedef struct AppTimer AppTimer;
typedef struct DictionaryIterator DictionaryIterator;
typedef struct { int32_t int32; char cstring[32]; } TupleValue;
typedef struct { TupleValue *value; uint16_t length; } Tuple;
typedef void *ClickRecognizerRef;
typedef int TimeUnits; typedef int GCornerMask;
typedef struct { void (*load)(Window *); void (*unload)(Window *); } WindowHandlers;
typedef void (*LayerUpdateProc)(Layer *, GContext *);
enum { MINUTE_UNIT = 2, BUTTON_ID_BACK = 0, BUTTON_ID_UP = 1, BUTTON_ID_SELECT = 2, BUTTON_ID_DOWN = 3, APP_MSG_OK = 0, GCornerNone = 0 };
enum { MESSAGE_KEY_REQUEST = 1, MESSAGE_KEY_STATUS, MESSAGE_KEY_STAND, MESSAGE_KEY_SEITE, MESSAGE_KEY_ANZAHL, MESSAGE_KEY_QUELLE,
       MESSAGE_KEY_AB = 10, MESSAGE_KEY_AB_L = 20, MESSAGE_KEY_AB_D = 30, MESSAGE_KEY_AB_S = 40, MESSAGE_KEY_AB_F = 50,
       MESSAGE_KEY_AB_Z = 60, MESSAGE_KEY_AB_ZK = 70, MESSAGE_KEY_NAME_A = 80, MESSAGE_KEY_NAME_B = 90,
       MESSAGE_KEY_KLAR_A = 100, MESSAGE_KEY_KLAR_B = 110,
       MESSAGE_KEY_AKTION = 120, MESSAGE_KEY_WAHL, MESSAGE_KEY_L_TITEL, MESSAGE_KEY_L_ANZAHL, MESSAGE_KEY_L_AB, MESSAGE_KEY_L_LADE,
       MESSAGE_KEY_L_TEXT = 130, MESSAGE_KEY_LAYOUT = 140, MESSAGE_KEY_UMKREIS,
       MESSAGE_KEY_QUELLWAHL, MESSAGE_KEY_ABFAHRT, MESSAGE_KEY_DAUER, MESSAGE_KEY_SPRUNG,
       MESSAGE_KEY_HIER_NAME, MESSAGE_KEY_HIER_KLAR, MESSAGE_KEY_HIER_NR, MESSAGE_KEY_HIER_N,
       // 0.6.1: Rubriken, Strecken, Details, Suche
       MESSAGE_KEY_RUBRIK = 200, MESSAGE_KEY_DETAIL, MESSAGE_KEY_R_ANZAHL, MESSAGE_KEY_R_SEITE, MESSAGE_KEY_R_N,
       MESSAGE_KEY_D_N, MESSAGE_KEY_D_NR, MESSAGE_KEY_D_AB, MESSAGE_KEY_TEXT, MESSAGE_KEY_TREFFER,
       MESSAGE_KEY_UMSTIEGE, MESSAGE_KEY_FUSSWEG, MESSAGE_KEY_UMSTZEIT,
       MESSAGE_KEY_FAHRT, MESSAGE_KEY_F_TITEL, MESSAGE_KEY_WECKEN, MESSAGE_KEY_KONFIG,
       MESSAGE_KEY_K_PHASE, MESSAGE_KEY_K_KOPF, MESSAGE_KEY_K_KOPFR, MESSAGE_KEY_K_ZEIT, MESSAGE_KEY_K_ZEITL, MESSAGE_KEY_K_HALTE,
       MESSAGE_KEY_K_RF, MESSAGE_KEY_K_R1, MESSAGE_KEY_K_R2, MESSAGE_KEY_K_LABEL, MESSAGE_KEY_K_NAME, MESSAGE_KEY_K_STEIG,
       MESSAGE_KEY_K_L, MESSAGE_KEY_K_W = MESSAGE_KEY_K_L + 6, MESSAGE_KEY_K_R = MESSAGE_KEY_K_W + 6, MESSAGE_KEY_K_S = MESSAGE_KEY_K_R + 6,
       MESSAGE_KEY_K_F = MESSAGE_KEY_K_S + 6, MESSAGE_KEY_K_FUSS = MESSAGE_KEY_K_F + 6, MESSAGE_KEY_D_AKT, MESSAGE_KEY_L_INFO, MESSAGE_KEY_L_FRAGE, MESSAGE_KEY_L_SUMMEN, MESSAGE_KEY_H_FAV, MESSAGE_KEY_R_FAV, MESSAGE_KEY_S_FAV, MESSAGE_KEY_D_STAND, MESSAGE_KEY_K_STAND, MESSAGE_KEY_V_TEXT,
       MESSAGE_KEY_R_NAME = 300, MESSAGE_KEY_R_KLAR = 310, MESSAGE_KEY_R_VON = 320, MESSAGE_KEY_R_VONK = 330,
       MESSAGE_KEY_R_LOS = 340, MESSAGE_KEY_R_AN = 350, MESSAGE_KEY_R_UM = 360, MESSAGE_KEY_R_DEL = 370,
       MESSAGE_KEY_R_KETTE = 380, MESSAGE_KEY_R_FLAG = 390,
       MESSAGE_KEY_D_ART = 400, MESSAGE_KEY_D_ZEIT = 410, MESSAGE_KEY_D_TEXT = 420, MESSAGE_KEY_D_ZUS = 430, MESSAGE_KEY_D_RE = 440 };
#define GRect(x, y, w, h) ((GRect){{(x), (y)}, {(w), (h)}})
#define GPoint(x, y) ((GPoint){(x), (y)})
#define GColorFromHEX(v) ((GColor){((v) >> 16) & 255, ((v) >> 8) & 255, (v) & 255})
#define GColorBlack ((GColor){0, 0, 0})
extern uint8_t FB[228][200][3];
// Ansicht Klar: Systemschriften gibt es hier nicht — Text wird nicht gezeichnet, nur Flächen (Klar im Emulator prüfen)
typedef void *GFont;
typedef enum { GTextOverflowModeWordWrap, GTextOverflowModeTrailingEllipsis, GTextOverflowModeFill } GTextOverflowMode;
typedef enum { GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight } GTextAlignment;
enum { GCornersAll = 15, GCornersLeft = 5 };
#define GColorWhite ((GColor){255, 255, 255})
#define GColorRed ((GColor){255, 0, 0})
#define FONT_KEY_LECO_32_BOLD_NUMBERS "leco32" 
#define FONT_KEY_GOTHIC_14 "g14"
#define FONT_KEY_GOTHIC_14_BOLD "g14b"
#define FONT_KEY_GOTHIC_18 "g18"
#define FONT_KEY_GOTHIC_18_BOLD "g18b"
#define FONT_KEY_GOTHIC_24_BOLD "g24b"
#define FONT_KEY_GOTHIC_28_BOLD "g28b"
static inline GFont fonts_get_system_font(const char *k) { return NULL; }
static inline void *resource_get_handle(int id) { return NULL; }
static inline GFont fonts_load_custom_font(void *h) { return NULL; }
#define RESOURCE_ID_ROBOTO_BOLD_32 1
static inline void graphics_context_set_text_color(GContext *c, GColor k) {}
static inline void graphics_draw_text(GContext *c, const char *t, GFont f, GRect r, int o, int a, void *x) {}
static inline GSize graphics_text_layout_get_content_size(const char *t, GFont f, GRect r, int o, int a) { return (GSize){ (int16_t)(strlen(t) * 9), 18 }; }
static inline void graphics_draw_line(GContext *c, GPoint a, GPoint b) {}
static inline void graphics_fill_circle(GContext *c, GPoint p, int r);
static inline void graphics_draw_circle(GContext *c, GPoint p, int r);
static inline void graphics_draw_round_rect(GContext *c, GRect r, int rad) {}
static inline void graphics_context_set_stroke_width(GContext *c, int w) {}
static inline bool persist_exists(uint32_t k) { return false; }
static inline int32_t persist_read_int(uint32_t k) { return 0; }
static inline int persist_write_int(uint32_t k, int32_t v) { return 0; }
static inline uint32_t app_message_inbox_size_maximum(void) { return 8200; }
static GColor s_fill, s_stroke;
static inline GRect layer_get_bounds(Layer *l) { return GRect(0, 0, 200, 228); }
static inline void graphics_context_set_fill_color(GContext *c, GColor k) { s_fill = k; }
static inline void graphics_context_set_stroke_color(GContext *c, GColor k) { s_stroke = k; }
static inline void px(int x, int y, GColor k) { if (x >= 0 && y >= 0 && x < 200 && y < 228) { FB[y][x][0] = k.r; FB[y][x][1] = k.g; FB[y][x][2] = k.b; } }
static inline void graphics_fill_rect(GContext *c, GRect r, int rad, int m) { for (int y = 0; y < r.size.h; y++) for (int x = 0; x < r.size.w; x++) px(r.origin.x + x, r.origin.y + y, s_fill); }
static inline void graphics_draw_pixel(GContext *c, GPoint p) { px(p.x, p.y, s_stroke); }
static inline void graphics_fill_circle(GContext *c, GPoint p, int r) {
  for (int y = -r; y <= r; y++) for (int x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(p.x + x, p.y + y, s_fill);
}
static inline void graphics_draw_circle(GContext *c, GPoint p, int r) {
  for (int y = -r; y <= r; y++) for (int x = -r; x <= r; x++) { const int d = x * x + y * y; if (d <= r * r && d > (r - 1) * (r - 1)) px(p.x + x, p.y + y, s_stroke); }
}
// 0.6.1: Tasten roh, Touch, Diktat, Beenden zum Watchface
static inline void window_raw_click_subscribe(int b, void (*d)(ClickRecognizerRef, void *), void (*u)(ClickRecognizerRef, void *), void *ctx) {}
typedef enum { TouchEvent_Touchdown, TouchEvent_Liftoff, TouchEvent_PositionUpdate } TouchEventType;
typedef struct { TouchEventType type; bool non_navigational; int16_t x, y; } TouchEvent;
static inline void touch_service_subscribe(void (*h)(const TouchEvent *, void *), void *c) {}
static inline void touch_service_unsubscribe(void) {}
typedef struct DictationSession DictationSession;
typedef enum { DictationSessionStatusSuccess, DictationSessionStatusFailureTranscriptionRejected } DictationSessionStatus;
static inline DictationSession *dictation_session_create(uint32_t n, void (*cb)(DictationSession *, DictationSessionStatus, char *, void *), void *c) { return NULL; }
static inline DictationSessionStatus dictation_session_start(DictationSession *d) { return DictationSessionStatusFailureTranscriptionRejected; }
static inline void dictation_session_destroy(DictationSession *d) {}
enum { APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY = 1 };
static inline void exit_reason_set(int r) {}
// 0.6.6: Ruhe, Wecken, Vibration
static inline void window_stack_pop_all(bool a) {}
typedef int32_t WakeupId;
typedef void (*WakeupHandler)(WakeupId id, int32_t cookie);
static inline void wakeup_cancel_all(void) {}
static inline WakeupId wakeup_schedule(time_t t, int32_t c, bool n) { return 1; }
static inline void wakeup_service_subscribe(WakeupHandler h) {}
enum { APP_LAUNCH_USER = 1, APP_LAUNCH_WAKEUP = 3, APP_LOG_LEVEL_WARNING = 2 };
static inline int launch_reason(void) { return APP_LAUNCH_USER; }
static inline void vibes_double_pulse(void) {}
static inline void vibes_short_pulse(void) {}
#define APP_LOG(lvl, ...) ((void)0)
static inline void dict_write_cstring(DictionaryIterator *it, int k, const char *v) {}
static inline void layer_mark_dirty(Layer *l) {}
static inline void app_timer_cancel(AppTimer *t) {}
static inline AppTimer *app_timer_register(uint32_t ms, void (*cb)(void *), void *d) { return NULL; }
static inline int app_message_outbox_begin(DictionaryIterator **it) { return 1; }
static inline void dict_write_int32(DictionaryIterator *it, int k, int32_t v) {}
static inline int app_message_outbox_send(void) { return APP_MSG_OK; }
static inline Tuple *dict_find(DictionaryIterator *it, int k) { return NULL; }
static inline void window_single_click_subscribe(int b, void (*h)(ClickRecognizerRef, void *)) {}
static inline void window_single_repeating_click_subscribe(int b, int ms, void (*h)(ClickRecognizerRef, void *)) {}
static inline void window_long_click_subscribe(int b, int ms, void (*d)(ClickRecognizerRef, void *), void (*u)(ClickRecognizerRef, void *)) {}
static inline bool click_recognizer_is_repeating(ClickRecognizerRef r) { return false; }
static inline void window_stack_pop(bool a) {}
static inline Layer *window_get_root_layer(Window *w) { return NULL; }
static inline Layer *layer_create(GRect r) { return NULL; }
static inline void layer_set_update_proc(Layer *l, LayerUpdateProc p) {}
static inline void layer_add_child(Layer *a, Layer *b) {}
static inline void layer_destroy(Layer *l) {}
static inline void app_message_register_inbox_received(void (*h)(DictionaryIterator *, void *)) {}
static inline void app_message_open(int a, int b) {}
static inline Window *window_create(void) { return NULL; }
static inline void window_set_background_color(Window *w, GColor c) {}
static inline void window_set_click_config_provider(Window *w, void (*p)(void *)) {}
static inline void window_set_window_handlers(Window *w, WindowHandlers h) {}
static inline void window_stack_push(Window *w, bool a) {}
static inline void tick_timer_service_subscribe(int u, void (*h)(struct tm *, TimeUnits)) {}
static inline void tick_timer_service_unsubscribe(void) {}
static inline void window_destroy(Window *w) {}
static inline void app_event_loop(void) {}
extern time_t FAKE_NOW;
#define time(x) (FAKE_NOW)

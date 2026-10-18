// MaxBand — MaxHospital smart wristband firmware (ESP32-C3).
//
// What it does
//   * Clock, steps, water and "stand up" reminders (works without internet and without a plan).
//   * Medication reminders from the site: vibrates, shows the medicine, A = "taken", B = "later".
//   * Pulse, SpO2, HRV (stress) from MAX30102; sleep and falls from MPU6050.
//   * SOS: hold A for 3 s. Fall: 30 s countdown, then SOS goes out automatically.
//   * Hold B for 3 s: "contact a doctor" request on the site.
//   * QR emergency card on the screen (B cycles screens).
//   * Everything is buffered while offline (about 1500 samples) and sent when Wi-Fi is back.
//
// Server protocol: see supabase/functions/device-api/index.ts. The band keeps a random secret
// token in flash; the server only stores its hash. Pairing: the screen shows a 6-digit code,
// the owner types it on the MaxBand page of the site.
//
// Not a medical device: readings are estimates for trends and alerts only.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Wire.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"
#include "qrcodegen.h"
#include "config.h"
#include "root_ca.h"

// ---------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MAX30105 ppg;
Preferences prefs;

bool hasDisplay = false, hasPpg = false, hasImu = false;
char token[65] = {0};
char serial[24] = {0};

enum Mode { MODE_PAIRING, MODE_RUN };
Mode mode = MODE_PAIRING;
char pairCode[8] = "------";
bool pairBlocked = false;  // claimed by another account: remove it on the site first

// Time (from the server)
bool timeSynced = false;
uint32_t serverEpoch = 0;
uint32_t serverMillis = 0;
int tzOffsetMin = 300;

uint32_t epochNow() { return timeSynced ? serverEpoch + (millis() - serverMillis) / 1000 : 0; }
int localMinutes() {  // minutes since local midnight
  uint32_t t = epochNow() + tzOffsetMin * 60;
  return (t % 86400) / 60;
}

// Plan features and settings (defaults until the first sync)
struct Settings {
  int hrHigh = 130, hrLow = 40, spo2Low = 90;
  bool fallDetection = true;
  int waterMin = 120, sedentaryMin = 60, stepsGoal = 6000;
  int quietFrom = 22 * 60, quietTo = 7 * 60;
} settings;
bool featSync = false, featReminders = false, featQr = false, featConsult = false;
bool liveMode = false;
char planName[10] = "";
char wearer[24] = "";
char qrUrl[120] = "";
uint32_t nextSyncMs = 0;
uint32_t syncEveryMs = 300000;

// Buffered readings
struct Reading { uint32_t t; float v; char k; };
const int MAX_READINGS = 1500;
Reading readings[MAX_READINGS];
int readingCount = 0;

void pushReading(char k, float v) {
  if (!timeSynced) return;
  if (readingCount >= MAX_READINGS) {  // drop the oldest
    memmove(readings, readings + 1, sizeof(Reading) * (MAX_READINGS - 1));
    readingCount--;
  }
  readings[readingCount++] = { epochNow(), v, k };
}

const char* kindName(char k) {
  switch (k) {
    case 'h': return "hr";
    case 'o': return "spo2";
    case 'v': return "hrv";
    case 's': return "steps";
    default: return "sleep";
  }
}

// Buttons (declared here: Arduino puts function prototypes above the first function)
struct Button { int pin; bool down; uint32_t since; bool longFired; };

// Medication reminders
struct Reminder { char id[37]; uint32_t at; char name[21]; char dose[21]; bool done; uint32_t snoozeUntil; };
Reminder reminders[20];
int reminderCount = 0;
int alerting = -1;  // index of the reminder on screen
struct Ack { char id[37]; bool taken; };
Ack acks[20];
int ackCount = 0;

// Pending event (SOS / fall / consult) retried until it reaches the server
char pendingEvent[20] = "";
uint32_t pendingSince = 0, pendingRetryMs = 0;

// UI
int screen = 0;  // 0 main, 1 health, 2 QR, 3 medicines
uint32_t lastInteraction = 0;
bool displayOn = true;
char toast[22] = "";
uint32_t toastUntil = 0;
int fallCountdown = -1;
uint32_t fallTickMs = 0;
bool confirmConsult = false;

// Sensors
int lastHr = 0, lastSpo2 = 0;
uint32_t stepsToday = 0, stepsWindow = 0;
int lastDay = -1;
uint32_t lastStepMs = 0, lastActiveMs = 0, lastWaterMs = 0;
uint16_t moveWindow = 0;
float prevMag = 1.0f, smoothMag = 1.0f;
bool stepHigh = false;
uint32_t freefallStart = 0, impactMs = 0;
uint32_t windowStartMs = 0, spo2DueMs = 0, hrvDueMs = 0, liveHrDueMs = 0;

// Beat intervals for pulse and HRV (RMSSD)
const int MAX_BEATS = 400;
uint16_t beatIntervals[MAX_BEATS];
int beatCount = 0;
uint32_t lastBeatMs = 0;

// Raw PPG window for SpO2 (4 s at 25 samples/s)
const int PPG_LEN = 100;
uint32_t irBuf[PPG_LEN], redBuf[PPG_LEN];
int ppgIdx = 0, ppgFilled = 0;
bool skinContact = false;

// ---------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------
void vibrate(int pulses, int onMs = 250, int offMs = 150) {
  for (int i = 0; i < pulses; i++) {
    digitalWrite(PIN_VIBRO, HIGH);
    delay(onMs);
    digitalWrite(PIN_VIBRO, LOW);
    if (i < pulses - 1) delay(offMs);
  }
}

void showToast(const char* msg, uint32_t ms = 4000) {
  strncpy(toast, msg, sizeof(toast) - 1);
  toast[sizeof(toast) - 1] = 0;
  toastUntil = millis() + ms;
  lastInteraction = millis();
}

bool inQuietHours() {
  if (!timeSynced) return false;
  int m = localMinutes();
  return settings.quietFrom <= settings.quietTo ? (m >= settings.quietFrom && m < settings.quietTo)
                                                : (m >= settings.quietFrom || m < settings.quietTo);
}

bool isNight() {
  if (!timeSynced) return false;
  int m = localMinutes();
  return m >= 21 * 60 || m < 11 * 60;
}

int batteryPercent() {
  uint32_t mv = analogReadMilliVolts(PIN_BAT) * 2;  // 100k/100k divider
  if (mv < 1000) return -1;                         // not connected (USB only)
  int p = (int)((mv - 3300) * 100 / (4200 - 3300));
  return constrain(p, 0, 100);
}

int parseHHMM(const char* s, int def) {
  if (!s || strlen(s) != 5 || s[2] != ':') return def;
  return atoi(s) * 60 + atoi(s + 3);
}

void makeIdentity() {
  prefs.begin("maxband", false);
  String saved = prefs.getString("token", "");
  if (saved.length() == 64) {
    strncpy(token, saved.c_str(), 64);
  } else {
    for (int i = 0; i < 32; i++) sprintf(token + i * 2, "%02x", (uint8_t)(esp_random() & 0xFF));
    token[64] = 0;
    prefs.putString("token", token);
  }
  prefs.end();
  uint64_t mac = ESP.getEfuseMac();
  snprintf(serial, sizeof(serial), "MXB-%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
}

// ---------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------
int postJson(JsonDocument& req, JsonDocument& res) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  WiFiClientSecure client;
#ifdef MAXBAND_INSECURE_TLS
  client.setInsecure();
#else
  client.setCACert(ROOT_CA);
#endif
  HTTPClient http;
  if (!http.begin(client, SERVER_URL)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", token);
  http.setTimeout(15000);
  String body;
  serializeJson(req, body);
  int code = http.POST(body);
  if (code > 0) {
    String payload = http.getString();
    if (deserializeJson(res, payload) != DeserializationError::Ok) res.clear();
  }
  http.end();
  return code;
}

void setTime(JsonDocument& res) {
  if (res["server_time"].is<uint32_t>()) {
    serverEpoch = res["server_time"].as<uint32_t>();
    serverMillis = millis();
    timeSynced = true;
  }
  if (res["tz_offset_min"].is<int>()) tzOffsetMin = res["tz_offset_min"].as<int>();
}

void pairStart() {
  JsonDocument req, res;
  req["action"] = "pair_start";
  req["serial"] = serial;
  req["firmware"] = FIRMWARE_VERSION;
  int code = postJson(req, res);
  if (code == 409) {
    pairBlocked = true;
    return;
  }
  pairBlocked = false;
  if (code == 200 && res["claimed"].as<bool>()) {
    mode = MODE_RUN;
    nextSyncMs = millis();
  } else if (code == 200 && res["pair_code"].is<const char*>()) {
    strncpy(pairCode, res["pair_code"].as<const char*>(), sizeof(pairCode) - 1);
    mode = MODE_PAIRING;
  }
}

void applySync(JsonDocument& res) {
  setTime(res);
  strncpy(planName, res["plan"] | "", sizeof(planName) - 1);
  strncpy(wearer, res["wearer"] | "", sizeof(wearer) - 1);
  strncpy(qrUrl, res["qr_url"] | "", sizeof(qrUrl) - 1);
  featSync = res["features"]["sync"] | false;
  featReminders = res["features"]["reminders"] | false;
  featQr = res["features"]["qr"] | false;
  featConsult = res["features"]["consult"] | false;
  liveMode = res["live"] | false;
  syncEveryMs = (uint32_t)(res["next_sync_s"] | 300) * 1000UL;

  JsonObject s = res["settings"];
  if (!s.isNull()) {
    settings.hrHigh = s["hr_high"] | 130;
    settings.hrLow = s["hr_low"] | 40;
    settings.spo2Low = s["spo2_low"] | 90;
    settings.fallDetection = s["fall_detection"] | true;
    settings.waterMin = s["water_interval_min"] | 120;
    settings.sedentaryMin = s["sedentary_min"] | 60;
    settings.stepsGoal = s["steps_goal"] | 6000;
    settings.quietFrom = parseHHMM(s["quiet_from"] | "22:00", 22 * 60);
    settings.quietTo = parseHHMM(s["quiet_to"] | "07:00", 7 * 60);
  }

  // Keep "done" / snooze state for reminders we already know.
  Reminder fresh[20];
  int n = 0;
  for (JsonObject r : res["reminders"].as<JsonArray>()) {
    if (n >= 20) break;
    Reminder& x = fresh[n];
    memset(&x, 0, sizeof(x));
    strncpy(x.id, r["id"] | "", 36);
    x.at = r["at"] | 0;
    strncpy(x.name, r["name"] | "", 20);
    strncpy(x.dose, r["dose"] | "", 20);
    for (int i = 0; i < reminderCount; i++) {
      if (strcmp(reminders[i].id, x.id) == 0) { x.done = reminders[i].done; x.snoozeUntil = reminders[i].snoozeUntil; }
    }
    n++;
  }
  memcpy(reminders, fresh, sizeof(Reminder) * n);
  reminderCount = n;
  if (alerting >= reminderCount) alerting = -1;
}

void doSync() {
  if (WiFi.status() != WL_CONNECTED) return;
  JsonDocument req, res;
  req["action"] = "sync";
  req["firmware"] = FIRMWARE_VERSION;
  int bat = batteryPercent();
  if (bat >= 0) req["battery"] = bat;
  int send = min(readingCount, 500);
  JsonArray arr = req["readings"].to<JsonArray>();
  for (int i = 0; i < send; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["k"] = kindName(readings[i].k);
    o["v"] = readings[i].v;
    o["t"] = readings[i].t;
  }
  int sentAcks = ackCount;
  JsonArray ja = req["acks"].to<JsonArray>();
  for (int i = 0; i < sentAcks; i++) {
    JsonObject o = ja.add<JsonObject>();
    o["id"] = acks[i].id;
    o["s"] = acks[i].taken ? "taken" : "skipped";
  }

  int code = postJson(req, res);
  if (code == 401) { mode = MODE_PAIRING; pairStart(); return; }  // removed on the site
  if (code != 200) { nextSyncMs = millis() + 60000; return; }      // offline: retry in a minute
  if (!(res["claimed"] | false)) {
    mode = MODE_PAIRING;
    if (res["pair_code"].is<const char*>()) strncpy(pairCode, res["pair_code"].as<const char*>(), sizeof(pairCode) - 1);
    else pairStart();
    return;
  }
  mode = MODE_RUN;
  // Sent successfully: drop what the server has now.
  memmove(readings, readings + send, sizeof(Reading) * (readingCount - send));
  readingCount -= send;
  memmove(acks, acks + sentAcks, sizeof(Ack) * (ackCount - sentAcks));
  ackCount -= sentAcks;
  applySync(res);
  nextSyncMs = millis() + (readingCount > 0 ? 5000 : syncEveryMs);
}

void queueEvent(const char* kind) {
  strncpy(pendingEvent, kind, sizeof(pendingEvent) - 1);
  pendingSince = millis();
  pendingRetryMs = 0;
}

void sendPendingEvent() {
  if (!pendingEvent[0] || millis() < pendingRetryMs) return;
  if (millis() - pendingSince > 10UL * 60 * 1000) { pendingEvent[0] = 0; showToast("Yuborilmadi"); return; }
  JsonDocument req, res;
  req["action"] = "event";
  req["kind"] = pendingEvent;
  int code = postJson(req, res);
  if (code == 200) {
    showToast(strcmp(pendingEvent, "consult_request") == 0 ? "Murojaat yuborildi" : "SOS yuborildi", 8000);
    vibrate(1, 600);
    pendingEvent[0] = 0;
  } else if (code == 403) {
    showToast("Pro tarif kerak");
    pendingEvent[0] = 0;
  } else {
    pendingRetryMs = millis() + 10000;  // no network yet
  }
}

// ---------------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------------
void imuBegin() {
  Wire.beginTransmission(0x68);
  Wire.write(0x6B); Wire.write(0x00);  // wake up
  if (Wire.endTransmission() != 0) return;
  Wire.beginTransmission(0x68);
  Wire.write(0x1C); Wire.write(0x08);  // +-4 g
  Wire.endTransmission();
  Wire.beginTransmission(0x68);
  Wire.write(0x1A); Wire.write(0x03);  // low-pass ~44 Hz
  Wire.endTransmission();
  hasImu = true;
}

float imuMagnitude() {
  Wire.beginTransmission(0x68);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return 1.0f;
  if (Wire.requestFrom(0x68, 6) != 6) return 1.0f;
  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  float x = ax / 8192.0f, y = ay / 8192.0f, z = az / 8192.0f;
  return sqrtf(x * x + y * y + z * z);
}

void startFallCountdown() {
  if (fallCountdown >= 0 || !settings.fallDetection) return;
  fallCountdown = 30;
  fallTickMs = millis();
  lastInteraction = millis();
  vibrate(3, 400, 200);
}

void processImu() {
  static uint32_t lastSample = 0;
  if (!hasImu || millis() - lastSample < 20) return;  // 50 Hz
  lastSample = millis();
  float mag = imuMagnitude();

  // Movement for sleep / sedentary
  if (fabsf(mag - prevMag) > 0.08f) { moveWindow++; }
  prevMag = mag;

  // Steps: peaks of the smoothed magnitude, at most ~3 per second
  smoothMag = smoothMag * 0.75f + mag * 0.25f;
  if (!stepHigh && smoothMag > 1.15f && millis() - lastStepMs > 300) {
    stepHigh = true;
    lastStepMs = millis();
    stepsToday++;
    stepsWindow++;
    lastActiveMs = millis();
  } else if (stepHigh && smoothMag < 1.02f) {
    stepHigh = false;
  }

  // Fall: free fall (< 0.4 g for 60 ms), then impact (> 2.5 g within 1 s), then 2 s lying still
  if (mag < 0.4f) {
    if (!freefallStart) freefallStart = millis();
  } else {
    if (freefallStart && millis() - freefallStart >= 60 && mag > 2.5f) impactMs = millis();
    if (mag > 0.6f && freefallStart && millis() - freefallStart > 1000) freefallStart = 0;
  }
  static uint16_t movesAtImpact = 0;
  if (impactMs) {
    if (millis() - impactMs < 50) movesAtImpact = moveWindow;
    if (millis() - impactMs > 2500) {
      if (moveWindow - movesAtImpact < 25) startFallCountdown();  // little movement after the impact
      impactMs = 0;
      freefallStart = 0;
    }
  }
}

void ppgBegin() {
  if (!ppg.begin(Wire, I2C_SPEED_FAST)) return;
  // LED 0x1F (~6 mA), average 4, red+IR, 100 Hz -> 25 samples/s, 411 us, 4096 nA
  ppg.setup(0x1F, 4, 2, 100, 411, 4096);
  hasPpg = true;
}

void processPpg() {
  if (!hasPpg) return;
  ppg.check();
  while (ppg.available()) {
    uint32_t red = ppg.getFIFORed();
    uint32_t ir = ppg.getFIFOIR();
    ppg.nextSample();
    skinContact = ir > 50000;
    if (!skinContact) { ppgFilled = 0; continue; }
    irBuf[ppgIdx] = ir;
    redBuf[ppgIdx] = red;
    ppgIdx = (ppgIdx + 1) % PPG_LEN;
    if (ppgFilled < PPG_LEN) ppgFilled++;
    if (checkForBeat(ir)) {
      uint32_t now = millis();
      uint32_t delta = now - lastBeatMs;
      lastBeatMs = now;
      if (delta > 270 && delta < 2000 && beatCount < MAX_BEATS) beatIntervals[beatCount++] = delta;  // 30–220 bpm
    }
  }
}

// Average pulse of the beats collected since the last call; 0 if too few.
int takePulse(int minBeats) {
  if (beatCount < minBeats) return 0;
  uint32_t sum = 0;
  for (int i = 0; i < beatCount; i++) sum += beatIntervals[i];
  return (int)(60000UL * beatCount / sum);
}

// RMSSD of successive beat intervals (ms); 0 if too few.
float takeHrv() {
  if (beatCount < 30) return 0;
  double acc = 0;
  int n = 0;
  for (int i = 1; i < beatCount; i++) {
    int d = (int)beatIntervals[i] - (int)beatIntervals[i - 1];
    if (abs(d) > 300) continue;  // artefact
    acc += (double)d * d;
    n++;
  }
  return n > 20 ? sqrt(acc / n) : 0;
}

void measureSpo2() {
  if (ppgFilled < PPG_LEN) return;
  uint32_t ir[PPG_LEN], red[PPG_LEN];
  for (int i = 0; i < PPG_LEN; i++) {  // oldest first
    ir[i] = irBuf[(ppgIdx + i) % PPG_LEN];
    red[i] = redBuf[(ppgIdx + i) % PPG_LEN];
  }
  int32_t spo2, hr;
  int8_t spo2Valid, hrValid;
  maxim_heart_rate_and_oxygen_saturation(ir, PPG_LEN, red, &spo2, &spo2Valid, &hr, &hrValid);
  if (spo2Valid && spo2 >= 70 && spo2 <= 100) {
    lastSpo2 = spo2;
    pushReading('o', spo2);
  }
}

// Every 5 minutes (15 s in live mode): pulse, steps, sleep; HRV every 30 min; SpO2 every 30 min (1 min live)
void periodicReadings() {
  uint32_t now = millis();
  uint32_t windowMs = liveMode ? 15000UL : 300000UL;
  if (now - windowStartMs >= windowMs) {
    int bpm = takePulse(liveMode ? 5 : 20);
    if (bpm > 0) { lastHr = bpm; pushReading('h', bpm); }
    if (now >= hrvDueMs) {
      float hrv = takeHrv();
      if (hrv > 0) { pushReading('v', hrv); hrvDueMs = now + 30UL * 60 * 1000; }
    }
    if (!liveMode || now - windowStartMs >= 300000UL) {
      if (stepsWindow) pushReading('s', stepsWindow);
      stepsWindow = 0;
      if (isNight()) {
        // Actigraphy: very little movement in 5 minutes = asleep
        int asleep = moveWindow < 40 ? 5 : moveWindow < 120 ? 2 : 0;
        if (!skinContact) asleep = 0;  // band not worn
        pushReading('z', asleep);
      }
      moveWindow = 0;
    }
    beatCount = 0;
    windowStartMs = now;
  }
  if (now >= spo2DueMs) {
    measureSpo2();
    spo2DueMs = now + (liveMode ? 60000UL : 30UL * 60 * 1000);
  }

  // Local alerts (the server also alerts the family)
  if (lastHr && (lastHr >= settings.hrHigh || lastHr <= settings.hrLow) && now - liveHrDueMs > 10UL * 60 * 1000) {
    liveHrDueMs = now;
    showToast(lastHr >= settings.hrHigh ? "Puls yuqori!" : "Puls past!", 8000);
    vibrate(2, 500);
  }

  // New day: reset steps
  if (timeSynced) {
    int day = (epochNow() + tzOffsetMin * 60) / 86400;
    if (lastDay != day) { lastDay = day; stepsToday = 0; }
  }

  // Water and "stand up" reminders (day time only)
  if (timeSynced && !inQuietHours() && !isNight()) {
    if (settings.waterMin > 0 && now - lastWaterMs > (uint32_t)settings.waterMin * 60000UL) {
      lastWaterMs = now;
      showToast("Suv iching", 8000);
      vibrate(1, 300);
    }
    if (settings.sedentaryMin > 0 && now - lastActiveMs > (uint32_t)settings.sedentaryMin * 60000UL) {
      lastActiveMs = now;
      showToast("Turing, yuring", 8000);
      vibrate(2, 200);
    }
  }
}

void checkReminders() {
  if (!featReminders || !timeSynced || alerting >= 0) return;
  uint32_t t = epochNow();
  for (int i = 0; i < reminderCount; i++) {
    Reminder& r = reminders[i];
    if (r.done || r.at > t || t - r.at > 30 * 60) continue;  // the server marks it missed after 30 min
    if (r.snoozeUntil && t < r.snoozeUntil) continue;
    alerting = i;
    lastInteraction = millis();
    vibrate(3, 400, 250);
    return;
  }
}

void answerReminder(bool taken) {
  if (alerting < 0) return;
  Reminder& r = reminders[alerting];
  if (taken) {
    r.done = true;
    if (ackCount < 20) { strncpy(acks[ackCount].id, r.id, 37); acks[ackCount].taken = true; ackCount++; }
    showToast("Ichildi");
    nextSyncMs = millis() + 2000;
  } else {
    r.snoozeUntil = epochNow() + 10 * 60;
    showToast("10 daqiqadan keyin");
  }
  alerting = -1;
}

// ---------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------
Button btnA = { PIN_BTN_A, false, 0, false };
Button btnB = { PIN_BTN_B, false, 0, false };

void onShort(char which) {
  lastInteraction = millis();
  if (!displayOn) { displayOn = true; display.ssd1306_command(SSD1306_DISPLAYON); return; }
  if (fallCountdown >= 0) { fallCountdown = -1; showToast("Bekor qilindi"); return; }
  if (alerting >= 0) { answerReminder(which == 'A'); return; }
  if (confirmConsult) {
    confirmConsult = false;
    if (which == 'A') queueEvent("consult_request");
    return;
  }
  if (which == 'B') {
    screen = (screen + 1) % 4;
    if (screen == 2 && (!featQr || !qrUrl[0])) screen = 3;
  }
}

void onLong(char which) {
  lastInteraction = millis();
  if (which == 'A') {
    vibrate(1, 800);
    queueEvent("sos");
    showToast("SOS yuborilmoqda", 10000);
  } else if (featConsult) {
    confirmConsult = true;
  } else {
    showToast("Pro tarif kerak");
  }
}

void pollButton(Button& b, char which) {
  bool down = digitalRead(b.pin) == LOW;
  uint32_t now = millis();
  if (down && !b.down) { b.down = true; b.since = now; b.longFired = false; }
  if (down && b.down && !b.longFired && now - b.since > 3000) { b.longFired = true; onLong(which); }
  if (!down && b.down) {
    b.down = false;
    if (!b.longFired && now - b.since > 40) onShort(which);
  }
}

// ---------------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------------
void drawQr(const char* text) {
  static uint8_t qr[qrcodegen_BUFFER_LEN_FOR_VERSION(6)];
  static uint8_t tmp[qrcodegen_BUFFER_LEN_FOR_VERSION(6)];
  if (!qrcodegen_encodeText(text, tmp, qr, qrcodegen_Ecc_LOW, 1, 6, qrcodegen_Mask_AUTO, true)) return;
  int size = qrcodegen_getSize(qr);
  int scale = size * 2 + 4 <= 64 ? 2 : 1;
  int ox = (128 - size * scale) / 2, oy = (64 - size * scale) / 2;
  display.fillRect(ox - 2, oy - 2, size * scale + 4, size * scale + 4, SSD1306_WHITE);
  for (int y = 0; y < size; y++)
    for (int x = 0; x < size; x++)
      if (qrcodegen_getModule(qr, x, y)) display.fillRect(ox + x * scale, oy + y * scale, scale, scale, SSD1306_BLACK);
}

void printTime(int minutes) {
  char buf[6];
  snprintf(buf, sizeof(buf), "%02d:%02d", minutes / 60, minutes % 60);
  display.print(buf);
}

void render() {
  static uint32_t last = 0;
  if (!hasDisplay || millis() - last < 250) return;
  last = millis();

  bool urgent = fallCountdown >= 0 || alerting >= 0 || pendingEvent[0] || confirmConsult || millis() < toastUntil;
  if (!urgent && millis() - lastInteraction > 15000) {
    if (displayOn) { display.ssd1306_command(SSD1306_DISPLAYOFF); displayOn = false; }
    return;
  }
  if (!displayOn) { display.ssd1306_command(SSD1306_DISPLAYON); displayOn = true; }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);

  if (mode == MODE_PAIRING) {
    display.println(WiFi.status() == WL_CONNECTED ? "Saytda MaxBand" : "Wi-Fi yo'q");
    display.println(WiFi.status() == WL_CONNECTED ? "sahifasiga kiriting:" : SETUP_AP_NAME);
    if (pairBlocked) {
      display.println();
      display.println("Avval saytda eski");
      display.println("akkauntdan o'chiring");
    } else {
      display.setTextSize(2);
      display.setCursor(28, 30);
      display.print(pairCode);
    }
  } else if (fallCountdown >= 0) {
    display.println("YIQILDINGIZMI?");
    display.setTextSize(3);
    display.setCursor(48, 18);
    display.print(fallCountdown);
    display.setTextSize(1);
    display.setCursor(0, 54);
    display.print("Tugma = bekor qilish");
  } else if (alerting >= 0) {
    Reminder& r = reminders[alerting];
    display.println("DORI ICHISH VAQTI");
    display.setTextSize(2);
    display.println(r.name);
    display.setTextSize(1);
    display.println(r.dose);
    display.setCursor(0, 56);
    display.print("A=Ichdim  B=Keyin");
  } else if (confirmConsult) {
    display.println("Shifokorga");
    display.println("murojaat yuborilsinmi?");
    display.setCursor(0, 56);
    display.print("A=Ha  B=Yo'q");
  } else if (millis() < toastUntil || pendingEvent[0]) {
    display.setTextSize(2);
    display.setCursor(0, 20);
    display.print(pendingEvent[0] && millis() >= toastUntil ? "Yuborilmoqda" : toast);
  } else if (screen == 2) {
    drawQr(qrUrl);
  } else if (screen == 3) {
    display.println("Bugungi dorilar:");
    int shown = 0;
    for (int i = 0; i < reminderCount && shown < 5; i++) {
      if (reminders[i].done) continue;
      int m = ((reminders[i].at + tzOffsetMin * 60) % 86400) / 60;
      printTime(m);
      display.print(" ");
      display.println(reminders[i].name);
      shown++;
    }
    if (!shown) display.println(featReminders ? "yo'q" : "Pro tarifda");
  } else if (screen == 1) {
    display.print("Puls: "); display.println(lastHr ? String(lastHr) : String("--"));
    display.print("SpO2: "); display.println(lastSpo2 ? String(lastSpo2) + "%" : String("--"));
    display.print("Qadam: "); display.print(stepsToday); display.print("/"); display.println(settings.stepsGoal);
    display.print("Tarif: "); display.println(planName[0] ? planName : "-");
    display.println(wearer);
  } else {
    // Main: status line, clock, pulse and steps, next medicine
    int bat = batteryPercent();
    display.print(WiFi.status() == WL_CONNECTED ? (liveMode ? "LIVE" : "WiFi") : "offline");
    display.setCursor(98, 0);
    if (bat >= 0) { display.print(bat); display.print("%"); }
    display.setTextSize(3);
    display.setCursor(18, 14);
    if (timeSynced) printTime(localMinutes()); else display.print("--:--");
    display.setTextSize(1);
    display.setCursor(0, 42);
    display.print("<3 "); display.print(lastHr ? String(lastHr) : String("--"));
    display.setCursor(64, 42);
    display.print(stepsToday); display.print(" qadam");
    display.setCursor(0, 54);
    uint32_t t = epochNow();
    for (int i = 0; i < reminderCount; i++) {
      if (reminders[i].done || reminders[i].at + 30 * 60 < t) continue;
      printTime(((reminders[i].at + tzOffsetMin * 60) % 86400) / 60);
      display.print(" ");
      display.print(reminders[i].name);
      break;
    }
  }
  display.display();
}

// ---------------------------------------------------------------------------------
// Setup / loop
// ---------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN_A, INPUT_PULLUP);
  pinMode(PIN_BTN_B, INPUT_PULLUP);
  pinMode(PIN_VIBRO, OUTPUT);
  digitalWrite(PIN_VIBRO, LOW);
  analogReadResolution(12);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  hasDisplay = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (hasDisplay) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(16, 12);
    display.print("MaxBand");
    display.setTextSize(1);
    display.setCursor(16, 40);
    display.print("Wi-Fi ulanmoqda...");
    display.display();
  }
  imuBegin();
  ppgBegin();
  makeIdentity();
  Serial.printf("MaxBand %s serial %s imu=%d ppg=%d oled=%d\n", FIRMWARE_VERSION, serial, hasImu, hasPpg, hasDisplay);

  // Both buttons held at power-on: forget Wi-Fi (and after 10 s also the pairing token).
  WiFiManager wm;
  if (digitalRead(PIN_BTN_A) == LOW && digitalRead(PIN_BTN_B) == LOW) {
    wm.resetSettings();
    uint32_t start = millis();
    while (digitalRead(PIN_BTN_A) == LOW && digitalRead(PIN_BTN_B) == LOW) {
      if (millis() - start > 10000) {
        prefs.begin("maxband", false);
        prefs.clear();
        prefs.end();
        vibrate(3);
        ESP.restart();
      }
      delay(50);
    }
  }
  if (hasDisplay) {
    display.setCursor(0, 54);
    display.print("Sozlash: ");
    display.print(SETUP_AP_NAME);
    display.display();
  }
  wm.setConfigPortalTimeout(180);  // without Wi-Fi it still works as a watch
  wm.autoConnect(SETUP_AP_NAME);
  WiFi.setAutoReconnect(true);

  lastInteraction = lastActiveMs = lastWaterMs = windowStartMs = millis();
  spo2DueMs = millis() + 60000;
  hrvDueMs = millis() + 10UL * 60 * 1000;
  pairStart();
}

void loop() {
  pollButton(btnA, 'A');
  pollButton(btnB, 'B');
  processImu();
  processPpg();

  if (mode == MODE_PAIRING) {
    static uint32_t poll = 0;
    if (millis() - poll > 5000) {  // wait until the owner types the code on the site
      poll = millis();
      if (pairBlocked) pairStart(); else doSync();
    }
    render();
    return;
  }

  periodicReadings();
  checkReminders();

  if (fallCountdown >= 0 && millis() - fallTickMs >= 1000) {
    fallTickMs = millis();
    if (--fallCountdown <= 0) {
      fallCountdown = -1;
      queueEvent("fall");
      showToast("Yordam chaqirildi", 10000);
    } else if (fallCountdown % 5 == 0) {
      vibrate(1, 300);
    }
  }

  sendPendingEvent();
  if (millis() >= nextSyncMs) doSync();
  render();
}

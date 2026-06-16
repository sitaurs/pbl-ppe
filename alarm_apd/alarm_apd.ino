// =============================================================================
// alarm_apd/alarm_apd.ino
// ESP32 Production Firmware — APD Alarm Node
//
// Fitur:
//   - WiFi STA + MQTT TLS (HiveMQ Cloud) dengan root CA verify
//   - AES-128-CBC decrypt payload alarm (mbedtls)
//   - Audio alarm dari SPIFFS (ESP8266Audio / ESP32Audio)
//   - Sensor gas MQ-135 + telemetri terenkripsi
//   - LED state machine (WiFi / MQTT / Standby / Alarm)
//   - Tombol BOOT (GPIO0) untuk test alarm lokal
//
// Requirements: 1.1, 1.2, 4.5, 6.1
// =============================================================================

// ─── INCLUDES ────────────────────────────────────────────────────────────────
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "mbedtls/aes.h"
#include "mbedtls/base64.h"
#include <ArduinoJson.h>
#include <SPIFFS.h>
#include "AudioFileSourceHTTPStream.h"
#include "AudioFileSourceBuffer.h"
#include "AudioGeneratorMP3.h"
#include "AudioOutputI2S.h"
#include <time.h>

// ─── KONFIGURASI (edit per device) ───────────────────────────────────────────
const int   MY_NODE_ID  = 1;
const char* WIFI_SSID   = "server";
const char* WIFI_PASS   = "asdasdasd";
const char* MQTT_HOST   = "f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud";
const int   MQTT_PORT   = 8883;
const char* MQTT_USER   = "pblsehat";
const char* MQTT_PASS   = "Polinema2026";

// AES key: 32 hex chars = 16 bytes (harus sama dengan AES_KEY di .env Python)
const char* AES_KEY_HEX = "5ac913a003ce4c948c2138435d2d86d7";

// Sensor & alarm
const int   GAS_THRESHOLD = 2200;          // 0..4095 (ADC 12-bit)
const int   GAS_PIN       = 34;            // ADC1_CH6, input-only
const int   LED_GAS       = 13;            // LED merah indikator gas
// const int   BUZZER     = 27;            // Tidak dipakai (pakai speaker MAX98357A)
const char* ALARM_URL     = "http://157.245.206.36/audio/jokowi.mp3";       // URL audio alarm APD violation
const char* GAS_ALARM_URL = "http://157.245.206.36/audio/alarm_gas.mp3";    // URL audio alarm gas

// ─── PIN MAP ──────────────────────────────────────────────────────────────────
#define I2S_BCLK    26   // I2S Bit Clock
#define I2S_LRC     25   // I2S Left/Right Clock
#define I2S_DOUT    22   // I2S Data Out → MAX98357A
#define LED_STATUS   2   // Built-in LED (active-high di kebanyakan ESP32)
#define BTN_BOOT     0   // Tombol BOOT (active-low)

// ─── MQTT TOPICS (diinisialisasi di setup) ────────────────────────────────────
String alarmTopic;      // "apd/alarm/<MY_NODE_ID>"
String controlTopic;    // "apd/control"
String gasTopic;        // "apd/telemetry/gas/<MY_NODE_ID>"
String heartbeatTopic;  // "apd/heartbeat/<MY_NODE_ID>"

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
enum SystemState {
  WIFI_CONNECTING,
  MQTT_CONNECTING,
  STANDBY,
  ALARM_ACTIVE
};

volatile SystemState systemState = WIFI_CONNECTING;

// ─── ROOT CA (Let's Encrypt R13 — intermediate yang signing HiveMQ Cloud) ───
// Sumber: openssl s_client ke f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud:8883
// Issuer: ISRG Root X1, Subject: R13 (RSA 2048-bit)
// Valid: Mar 13 2024 → Mar 12 2027
//
// Catatan: Kami pakai intermediate cert sebagai trust anchor (bukan root X1)
// karena ESP32 mbedtls tidak bisa parse public key 4096-bit di ISRG Root X1
// (error -15202: "PK - The pubkey tag or value is invalid"). R13 pakai
// RSA 2048-bit yang fully supported. Kalau Let's Encrypt rotasi intermediate
// (mis. ke R14), cert ini perlu di-update.
const char* HIVEMQ_ROOT_CA = R"(-----BEGIN CERTIFICATE-----
MIIFBTCCAu2gAwIBAgIQWgDyEtjUtIDzkkFX6imDBTANBgkqhkiG9w0BAQsFADBP
MQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFy
Y2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMTAeFw0yNDAzMTMwMDAwMDBa
Fw0yNzAzMTIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBF
bmNyeXB0MQwwCgYDVQQDEwNSMTMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQClZ3CN0FaBZBUXYc25BtStGZCMJlA3mBZjklTb2cyEBZPs0+wIG6BgUUNI
fSvHSJaetC3ancgnO1ehn6vw1g7UDjDKb5ux0daknTI+WE41b0VYaHEX/D7YXYKg
L7JRbLAaXbhZzjVlyIuhrxA3/+OcXcJJFzT/jCuLjfC8cSyTDB0FxLrHzarJXnzR
yQH3nAP2/Apd9Np75tt2QnDr9E0i2gB3b9bJXxf92nUupVcM9upctuBzpWjPoXTi
dYJ+EJ/B9aLrAek4sQpEzNPCifVJNYIKNLMc6YjCR06CDgo28EdPivEpBHXazeGa
XP9enZiVuppD0EqiFwUBBDDTMrOPAgMBAAGjgfgwgfUwDgYDVR0PAQH/BAQDAgGG
MB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATASBgNVHRMBAf8ECDAGAQH/
AgEAMB0GA1UdDgQWBBTnq58PLDOgU9NeT3jIsoQOO9aSMzAfBgNVHSMEGDAWgBR5
tFnme7bl5AFzgAiIyBpY9umbbjAyBggrBgEFBQcBAQQmMCQwIgYIKwYBBQUHMAKG
Fmh0dHA6Ly94MS5pLmxlbmNyLm9yZy8wEwYDVR0gBAwwCjAIBgZngQwBAgEwJwYD
VR0fBCAwHjAcoBqgGIYWaHR0cDovL3gxLmMubGVuY3Iub3JnLzANBgkqhkiG9w0B
AQsFAAOCAgEAUTdYUqEimzW7TbrOypLqCfL7VOwYf/Q79OH5cHLCZeggfQhDconl
k7Kgh8b0vi+/XuWu7CN8n/UPeg1vo3G+taXirrytthQinAHGwc/UdbOygJa9zuBc
VyqoH3CXTXDInT+8a+c3aEVMJ2St+pSn4ed+WkDp8ijsijvEyFwE47hulW0Ltzjg
9fOV5Pmrg/zxWbRuL+k0DBDHEJennCsAen7c35Pmx7jpmJ/HtgRhcnz0yjSBvyIw
6L1QIupkCv2SBODT/xDD3gfQQyKv6roV4G2EhfEyAsWpmojxjCUCGiyg97FvDtm/
NK2LSc9lybKxB73I2+P2G3CaWpvvpAiHCVu30jW8GCxKdfhsXtnIy2imskQqVZ2m
0Pmxobb28Tucr7xBK7CtwvPrb79os7u2XP3O5f9b/H66GNyRrglRXlrYjI1oGYL/
f4I1n/Sgusda6WvA6C190kxjU15Y12mHU4+BxyR9cx2hhGS9fAjMZKJss28qxvz6
Axu4CaDmRNZpK/pQrXF17yXCXkmEWgvSOEZy6Z9pcbLIVEGckV/iVeq0AOo2pkg9
p4QRIy0tK2diRENLSF2KysFwbY6B26BFeFs3v1sYVRhFW9nLkOrQVporCS0KyZmf
wVD89qSTlnctLcZnIavjKsKUu1nA1iU0yYMdYepKR7lWbnwhdx3ewok=
-----END CERTIFICATE-----)";

// ─── OBJEK GLOBAL ─────────────────────────────────────────────────────────────
WiFiClientSecure  espClient;
PubSubClient      mqttClient(espClient);

// Audio objects (ESP8266Audio — HTTP Stream seperti referensi)
AudioGeneratorMP3*         mp3      = nullptr;
AudioFileSourceHTTPStream* httpFile = nullptr;
AudioFileSourceBuffer*     audioBuf = nullptr;
AudioOutputI2S*            i2sOut   = nullptr;

// Audio buffer size (32KB seperti referensi yang berhasil)
const int AUDIO_BUFFER_SIZE = 32768;

// URL audio yang sedang aktif (ALARM_URL untuk APD, GAS_ALARM_URL untuk gas).
// Dipakai oleh handleAudioLoop() supaya saat re-stream untuk putaran berikutnya
// memakai URL yang sama dengan saat startAlarm() / handleGasAlert() dipanggil.
const char* currentAudioUrl = nullptr;

// AES key binary (16 bytes, decoded dari AES_KEY_HEX di setup)
uint8_t aesKey[16];

// Gas sampling — ring buffer untuk moving average
static int    gasRingBuf[5] = {0, 0, 0, 0, 0};
static uint8_t gasRingIdx   = 0;

// Timing
static unsigned long lastGasSampleMs  = 0;
static unsigned long lastHeartbeatMs  = 0;
static unsigned long lastMqttRetryMs  = 0;
static unsigned long mqttRetryDelayMs = 1000;  // backoff: 1s, 2s, 4s, ... 30s

// Tombol BOOT
static unsigned long lastBtnPressMs   = 0;

// Alarm play count
static int   alarmPlayCount     = 0;
static const int ALARM_PLAY_MAX     = 4;   // putaran APD (existing)
static const int GAS_ALARM_PLAY_MAX = 4;   // BARU — putaran audio gas alarm
// BARU — flag yang menandai sesi audio aktif adalah gas alarm (bukan APD).
// Dipakai oleh handleAudioLoop() untuk memilih playMax dinamis
// (ALARM_PLAY_MAX vs GAS_ALARM_PLAY_MAX). Diset di handleGasAlert() saat
// memulai sesi gas, di-reset di stopAlarm() dan defensif di awal startAlarm().
static bool currentAlarmIsGas       = false;

// Quiet window setelah alarm sebelumnya selesai. Selama window ini,
// event apd_violation / apd_test akan diabaikan oleh mqttCallback().
static const unsigned long QUIET_WINDOW_MS = 10000;  // 10 detik

// Timestamp millis() saat alarm terakhir selesai. 0 = belum pernah.
// Diset di stopAlarm() dan di natural-end branch handleAudioLoop().
static unsigned long lastAlarmEndedAt = 0;

// ─── FORWARD DECLARATIONS ─────────────────────────────────────────────────────

// 4.3 — WiFi + MQTT connection
void connectWiFi();
bool connectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void ensureConnected();

// 4.4 — AES-128-CBC decrypt (mbedtls)
bool aesDecrypt(const uint8_t* iv, const uint8_t* ct, size_t ctLen,
                char* out, size_t* outLen);

// 4.5 — Base64 decode + AES decrypt + JSON parse + validate
bool decryptAndParse(const byte* payload, unsigned int len, JsonDocument& doc);

// 4.6 — Timestamp replay protection
bool isTimestampFresh(const char* isoTimestamp, int maxAgeSeconds = 300);

// 4.7 — Audio playback dari SPIFFS
void setupAudio();
void startAlarm();
void stopAlarm();
void handleAudioLoop();

// Pure helper untuk gating alarm berdasarkan jeda sejak alarm terakhir.
// PBT-able karena tidak mengakses global. Lihat task 6.2 di tasks.md.
bool shouldStartAlarm(unsigned long now,
                      unsigned long lastEndedAt,
                      unsigned long quietMs);

// 4.8 — LED state machine
void updateLED();

// 4.9 — Tombol BOOT test alarm
void checkBootButton();

// 4.10 — MQ-135 sampling + telemetry publish
void sampleGas();
int  calcGasAverage();

// 4.11 — Gas alert local indicator (LED only, no buzzer)
void handleGasAlert(bool alert);

// 4.12 — Encrypt + publish helper
bool encryptAndPublish(const char* topic, const JsonDocument& doc);
void publishGasTelemetry(int rawValue, bool alert);

// ─── SETUP ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(20);
  delay(500);

  // CPU speed + Bluetooth off (hemat daya, stabil audio)
  btStop();
  setCpuFrequencyMhz(240);

  Serial.println("\n[boot] alarm_apd firmware starting...");

  // GPIO init
  pinMode(LED_STATUS, OUTPUT);
  pinMode(LED_GAS,    OUTPUT);
  pinMode(BTN_BOOT,   INPUT_PULLUP);  // active-low
  digitalWrite(LED_STATUS, LOW);
  digitalWrite(LED_GAS,    LOW);

  // Decode AES key dari hex string
  for (int i = 0; i < 16; i++) {
    char h[3] = {AES_KEY_HEX[i * 2], AES_KEY_HEX[i * 2 + 1], '\0'};
    aesKey[i] = (uint8_t)strtoul(h, nullptr, 16);
  }
  Serial.println("[crypto] AES key loaded.");

  // SPIFFS mount
  if (!SPIFFS.begin(true)) {
    Serial.println("[spiffs] WARN: SPIFFS mount gagal — fallback ke buzzer.");
  } else {
    Serial.println("[spiffs] OK");
  }

  // Build MQTT topic strings
  alarmTopic     = "apd/alarm/"           + String(MY_NODE_ID);
  controlTopic   = "apd/control";
  gasTopic       = "apd/telemetry/gas/"   + String(MY_NODE_ID);
  heartbeatTopic = "apd/heartbeat/"       + String(MY_NODE_ID);

  Serial.printf("[config] node_id=%d  alarm_topic=%s\n",
                MY_NODE_ID, alarmTopic.c_str());

  // Audio I2S output init
  setupAudio();

  // WiFi + MQTT connect (blocking sampai tersambung pertama kali)
  systemState = WIFI_CONNECTING;
  connectWiFi();

  // NTP sync (untuk timestamp replay protection, task 4.6)
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");  // UTC (cocok dengan timestamp MQTT)
  Serial.print("[ntp] syncing");
  struct tm ti;
  for (int i = 0; i < 30 && !getLocalTime(&ti); i++) {
    Serial.print(".");
    delay(500);
  }
  Serial.println(getLocalTime(&ti) ? " OK" : " WARN: timeout");

  systemState = MQTT_CONNECTING;
  connectMQTT();

  systemState = STANDBY;
  Serial.println("[boot] setup selesai. sistem standby.");
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
void loop() {
  // Jaga koneksi WiFi + MQTT
  ensureConnected();

  // MQTT client pump
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  // Update LED sesuai state
  updateLED();

  // Audio pump (non-blocking)
  handleAudioLoop();

  // Tombol BOOT — test alarm lokal
  checkBootButton();

  // Sampling gas MQ-135 + publish telemetry
  sampleGas();

  yield();
}

// =============================================================================
// TASK 4.3 — WiFi + MQTT TLS dengan setCACert
// Requirements: 1.2, 1.3, 1.9, 6.2, 6.3
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// connectWiFi()
//   Blocking: terus loop sampai WiFi tersambung.
//   Indikator: LED_STATUS kedip cepat 50ms selama proses.
// ─────────────────────────────────────────────────────────────────────────────
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[wifi] connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // Blink cepat selama connecting (Requirements 1.8)
  bool ledState = false;
  while (WiFi.status() != WL_CONNECTED) {
    ledState = !ledState;
    digitalWrite(LED_STATUS, ledState ? HIGH : LOW);
    delay(50);
    Serial.print(".");
  }

  digitalWrite(LED_STATUS, HIGH);  // solid ON saat tersambung
  Serial.printf("\n[wifi] connected. IP: %s  RSSI: %d dBm\n",
                WiFi.localIP().toString().c_str(),
                WiFi.RSSI());
}

// ─────────────────────────────────────────────────────────────────────────────
// connectMQTT()
//   Non-blocking saat dipanggil dari ensureConnected() (sudah ada backoff di
//   sana). Saat dipanggil dari setup() bersifat satu kali attempt + return.
//
//   Konfigurasi TLS: setCACert (BUKAN setInsecure) — Requirements 6.2
//   Subscribe ke 2 topik: alarmTopic dan controlTopic  — Requirements 1.3
//   Jika cert mismatch/expired → connect() gagal dan error di-log — Req 6.3
// ─────────────────────────────────────────────────────────────────────────────
bool connectMQTT() {
  if (mqttClient.connected()) return true;

  // ── TLS dengan verifikasi Root CA (Requirements 6.2) ─────────────────────
  // Verifikasi penuh: ESP32 cek bahwa cert server di-sign oleh ISRG Root X1
  // (Let's Encrypt), valid, dan hostname cocok. Tahan terhadap MITM attack.
  // NTP sync wajib sudah jalan sebelum ini (lihat setup() — configTime()).
  // Jika error -15202 muncul di handshake, kemungkinan:
  //   1. NTP belum sync → cert dianggap "not yet valid" / "expired"
  //   2. PEM string corrupt → reformat dari https://letsencrypt.org/certs/isrgrootx1.pem
  //   3. Heap fragmentation → pastikan setCACert dipanggil sekali (bukan tiap reconnect)
  static bool caConfigured = false;
  if (!caConfigured) {
    espClient.setCACert(HIVEMQ_ROOT_CA);
    caConfigured = true;
    Serial.println("[tls] root CA verified (Let's Encrypt R13)");
  }

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  // Buffer besar untuk payload terenkripsi (base64)
  mqttClient.setBufferSize(2048);
  // Keep-alive 60 detik
  mqttClient.setKeepAlive(60);

  // Build client ID unik berbasis node ID + MAC
  char clientId[40];
  snprintf(clientId, sizeof(clientId),
           "apd-node-%d-%llx", MY_NODE_ID,
           (unsigned long long)ESP.getEfuseMac());

  Serial.printf("[mqtt] connecting to %s:%d as '%s'...\n",
                MQTT_HOST, MQTT_PORT, clientId);
  systemState = MQTT_CONNECTING;

  bool ok = mqttClient.connect(clientId, MQTT_USER, MQTT_PASS);

  if (!ok) {
    // Log eksplisit jika TLS/cert gagal (Requirements 6.3)
    int state = mqttClient.state();
    Serial.printf("[mqtt] FAILED. state=%d (", state);
    switch (state) {
      case -4: Serial.print("TIMEOUT");          break;
      case -3: Serial.print("CONN_LOST");        break;
      case -2: Serial.print("CONN_FAILED / TLS cert error?"); break;
      case -1: Serial.print("DISCONNECTED");     break;
      case  1: Serial.print("BAD_PROTOCOL");     break;
      case  2: Serial.print("BAD_CLIENT_ID");    break;
      case  3: Serial.print("UNAVAILABLE");      break;
      case  4: Serial.print("BAD_CREDENTIALS");  break;
      case  5: Serial.print("UNAUTHORIZED");     break;
      default: Serial.print("UNKNOWN");          break;
    }
    Serial.println(")");
    return false;
  }

  Serial.println("[mqtt] connected.");

  // Subscribe ke topik alarm node-specific + topik kontrol global (Req 1.3)
  bool subAlarm   = mqttClient.subscribe(alarmTopic.c_str(),   1);
  bool subControl = mqttClient.subscribe(controlTopic.c_str(), 1);

  Serial.printf("[mqtt] subscribe '%s' -> %s\n",
                alarmTopic.c_str(), subAlarm ? "OK" : "FAIL");
  Serial.printf("[mqtt] subscribe '%s' -> %s\n",
                controlTopic.c_str(), subControl ? "OK" : "FAIL");

  // Reset backoff setelah connect berhasil
  mqttRetryDelayMs = 1000;

  systemState = STANDBY;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// mqttCallback()
//   Dipanggil oleh PubSubClient saat pesan masuk pada topik yang di-subscribe.
//   Routing berdasarkan topik — decrypt dan validasi dilakukan di task 4.5.
//   Di sini kita log topik dan forward ke handler yang sesuai.
// ─────────────────────────────────────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[mqtt] msg on '%s' (%u bytes)\n", topic, length);

  String topicStr(topic);

  if (topicStr == alarmTopic) {
    // Alarm node-specific — decrypt + parse + trigger alarm (task 4.5)
    StaticJsonDocument<512> doc;
    if (decryptAndParse(payload, length, doc)) {
      // Verifikasi nodeId (defense-in-depth, Requirements 3.4)
      int msgNodeId = doc["nodeId"] | -1;
      if (msgNodeId != MY_NODE_ID) {
        Serial.printf("[mqtt] WARN: nodeId mismatch (%d vs %d), abaikan.\n",
                      msgNodeId, MY_NODE_ID);
        return;
      }
      const char* event = doc["event"] | "";
      Serial.printf("[mqtt] alarm event='%s' dari node %d\n", event, msgNodeId);
      if (strcmp(event, "apd_violation") == 0 || strcmp(event, "apd_test") == 0) {
        // Bug 4 (firmware) — gating quiet window 10 detik setelah alarm
        // sebelumnya selesai. Mencegah audio APD retrigger tepat setelah
        // alarm gas / APD selesai (lihat design.md Bug 4 Sisi B).
        if (!shouldStartAlarm(millis(), lastAlarmEndedAt, QUIET_WINDOW_MS)) {
          Serial.println("[alarm] skip — quiet window aktif");
          return;
        }
        // Bug 4 exception: jika gas alarm sedang ALARM_ACTIVE, biarkan selesai.
        if (systemState == ALARM_ACTIVE && currentAlarmIsGas) {
          Serial.println("[alarm] skip — gas alarm sedang aktif");
          return;
        }
        startAlarm();
      } else if (strcmp(event, "apd_stop") == 0) {
        stopAlarm();   // TIDAK di-gate (klausa 3.6)
      } else if (strcmp(event, "gas_test") == 0) {
        // Demo gas alarm via MQTT (tanpa harus tiup sensor MQ-135 fisik).
        // Force handleGasAlert(true) sekali, lalu reset state agar setelah
        // alarm selesai bisa di-trigger lagi.
        Serial.println("[mqtt] gas_test → simulate gas threshold breach");
        handleGasAlert(true);   // TIDAK di-gate (out of scope spec ini)
      }
    } else {
      Serial.println("[mqtt] WARN: decrypt/parse gagal — pesan diabaikan.");
    }

  } else if (topicStr == controlTopic) {
    // Topik kontrol global — broadcast untuk semua node (e.g., stop all alarms)
    StaticJsonDocument<256> doc;
    if (decryptAndParse(payload, length, doc)) {
      const char* event = doc["event"] | "";
      Serial.printf("[mqtt] control event='%s'\n", event);
      if (strcmp(event, "apd_stop") == 0) {
        stopAlarm();
      } else if (strcmp(event, "reboot") == 0) {
        Serial.println("[mqtt] reboot command received. restarting...");
        delay(200);
        ESP.restart();
      }
    } else {
      Serial.println("[mqtt] WARN: control decrypt gagal — abaikan.");
    }

  } else {
    Serial.printf("[mqtt] WARN: topik tidak dikenal '%s'\n", topic);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureConnected()
//   Dipanggil setiap loop(). Non-blocking — hanya mencoba reconnect saat
//   interval backoff sudah lewat.
//
//   Backoff: 1s → 2s → 4s → 8s → 16s → 30s (max) — Requirements 1.9
//   Tidak pernah reset / restart perangkat — Requirements 1.9
// ─────────────────────────────────────────────────────────────────────────────
void ensureConnected() {
  // ── WiFi check ───────────────────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    // WiFi terputus — reconnect blocking (state sudah LED kedip cepat)
    if (systemState != WIFI_CONNECTING) {
      Serial.println("[wifi] disconnected — reconnecting...");
      systemState = WIFI_CONNECTING;
    }
    connectWiFi();
    // Setelah WiFi tersambung kembali, paksa MQTT reconnect juga
    lastMqttRetryMs  = 0;
    mqttRetryDelayMs = 1000;
    return;
  }

  // ── MQTT check ───────────────────────────────────────────────────────────
  if (mqttClient.connected()) {
    // Semua baik — pastikan state STANDBY (kecuali sedang ALARM_ACTIVE)
    if (systemState == MQTT_CONNECTING) {
      systemState = STANDBY;
    }
    return;
  }

  // MQTT terputus — tunggu backoff lalu coba reconnect
  if (systemState != MQTT_CONNECTING) {
    Serial.printf("[mqtt] disconnected — retry dalam %lums...\n",
                  mqttRetryDelayMs);
    systemState = MQTT_CONNECTING;
  }

  unsigned long now = millis();
  if (now - lastMqttRetryMs < mqttRetryDelayMs) {
    // Belum waktunya — blink 300ms (Requirements 1.8)
    return;
  }

  lastMqttRetryMs = now;

  bool ok = connectMQTT();

  if (!ok) {
    // Hitung backoff: dobel tiap kali gagal, max 30 detik (Requirements 1.9)
    mqttRetryDelayMs = mqttRetryDelayMs * 2;
    if (mqttRetryDelayMs > 30000) {
      mqttRetryDelayMs = 30000;
    }
    Serial.printf("[mqtt] retry berikutnya dalam %lums\n", mqttRetryDelayMs);
  }
  // Jika ok, mqttRetryDelayMs sudah di-reset ke 1000 di dalam connectMQTT()
}

// =============================================================================
// TASK 4.4 — AES-128-CBC Decrypt
// Requirements: 4.3, 4.5
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// aesDecrypt()
//
// Dekripsi satu blok ciphertext AES-128-CBC menggunakan mbedtls.
//
// Parameter:
//   iv     — pointer ke 16 byte IV (diambil dari payload, bukan rahasia)
//   ct     — pointer ke ciphertext (harus kelipatan 16 byte)
//   ctLen  — panjang ciphertext dalam byte (harus > 0 dan kelipatan 16)
//   out    — buffer output untuk plaintext hasil dekripsi + null-terminator
//            caller wajib sediakan minimal ctLen + 1 byte
//   outLen — [out] panjang plaintext setelah PKCS7 padding di-strip
//
// Return:
//   true  — dekripsi sukses, out berisi string JSON null-terminated
//   false — gagal: ctLen bukan kelipatan 16, PKCS7 padding invalid,
//            atau mbedtls error
//
// Catatan:
//   - Pakai global aesKey[16] yang sudah di-decode di setup()
//   - Mode CBC: setiap blok XOR dengan blok sebelumnya (atau IV untuk blok 1)
//   - PKCS7: padding byte terakhir = jumlah padding bytes (1..16)
//     semua padding bytes harus bernilai sama
// ─────────────────────────────────────────────────────────────────────────────
bool aesDecrypt(const uint8_t* iv, const uint8_t* ct, size_t ctLen,
                char* out, size_t* outLen) {

  // ── 1. Validasi panjang ciphertext ──────────────────────────────────────
  // CBC bekerja pada blok 16 byte; panjang harus > 0 dan kelipatan 16
  if (ctLen == 0 || ctLen % 16 != 0) {
    Serial.printf("[aes] ERROR: ctLen=%u bukan kelipatan 16\n",
                  (unsigned)ctLen);
    return false;
  }

  // ── 2. Init konteks AES ─────────────────────────────────────────────────
  mbedtls_aes_context aesCtx;
  mbedtls_aes_init(&aesCtx);

  // Set decrypt key: 128-bit (Requirements 4.5 — mbedtls built-in ESP32)
  int ret = mbedtls_aes_setkey_dec(&aesCtx, aesKey, 128);
  if (ret != 0) {
    Serial.printf("[aes] ERROR: setkey_dec gagal ret=%d\n", ret);
    mbedtls_aes_free(&aesCtx);
    return false;
  }

  // ── 3. Dekripsi CBC ─────────────────────────────────────────────────────
  // mbedtls_aes_crypt_cbc() memodifikasi iv_buf (mutable copy wajib)
  // Kita tidak mau merusak pointer iv dari caller, jadi copy dulu.
  uint8_t ivBuf[16];
  memcpy(ivBuf, iv, 16);

  // Output buffer: gunakan out langsung (caller sudah sediakan ctLen+1 byte)
  ret = mbedtls_aes_crypt_cbc(&aesCtx,
                               MBEDTLS_AES_DECRYPT,
                               ctLen,
                               ivBuf,
                               ct,
                               (uint8_t*)out);
  mbedtls_aes_free(&aesCtx);

  if (ret != 0) {
    Serial.printf("[aes] ERROR: crypt_cbc gagal ret=%d\n", ret);
    return false;
  }

  // ── 4. Strip PKCS7 padding ──────────────────────────────────────────────
  // Byte terakhir plaintext = jumlah padding bytes (1..16)
  uint8_t padLen = (uint8_t)out[ctLen - 1];

  // Validasi: padLen harus dalam range 1..16
  if (padLen == 0 || padLen > 16) {
    Serial.printf("[aes] ERROR: PKCS7 padLen=%u tidak valid\n", padLen);
    return false;
  }

  // Validasi: semua padding bytes harus bernilai padLen
  for (size_t i = ctLen - padLen; i < ctLen; i++) {
    if ((uint8_t)out[i] != padLen) {
      Serial.printf("[aes] ERROR: PKCS7 byte[%u]=%u != padLen=%u\n",
                    (unsigned)i, (uint8_t)out[i], padLen);
      return false;
    }
  }

  // Hitung panjang plaintext sebenarnya (tanpa padding)
  *outLen = ctLen - padLen;

  // Null-terminate supaya bisa dipakai sebagai C-string langsung
  out[*outLen] = '\0';

  Serial.printf("[aes] decrypt OK: %u bytes ciphertext -> %u bytes plaintext\n",
                (unsigned)ctLen, (unsigned)*outLen);
  return true;
}

// =============================================================================
// TASK 4.5 — Decrypt + JSON Validation
// Requirements: 1.4, 1.5, 3.4, 4.4
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// decryptAndParse()
//
// Pipeline lengkap untuk memproses payload MQTT terenkripsi:
//   1. Base64 decode payload (mbedtls_base64_decode)
//   2. Split: 16 byte pertama = IV, sisanya = ciphertext
//   3. AES-128-CBC decrypt (via aesDecrypt)
//   4. ArduinoJson deserialize plaintext → doc
//   5. Validasi field wajib: event, nodeId, sektorId, violations, timestamp
//   6. Validasi event ∈ {"apd_violation", "apd_test", "apd_stop"}
//   7. Validasi nodeId == MY_NODE_ID (defense-in-depth, Requirements 3.4)
//
// Parameter:
//   payload — pointer ke bytes MQTT payload (base64 string)
//   len     — panjang payload dalam byte
//   doc     — [out] JsonDocument yang akan diisi hasil parsing
//             (caller wajib sediakan, mis. StaticJsonDocument<512>)
//
// Return:
//   true  — semua langkah sukses, doc sudah berisi payload yang valid
//   false — gagal di salah satu langkah; log warning di Serial, doc tidak valid
//
// Catatan keamanan:
//   - Requirements 1.5: jika APAPUN gagal, return false tanpa trigger alarm
//   - Payload yang tidak bisa di-decode/decrypt HARUS diabaikan sepenuhnya
//   - nodeId check adalah defense-in-depth di atas routing per-topik (Req 3.4)
// ─────────────────────────────────────────────────────────────────────────────
bool decryptAndParse(const byte* payload, unsigned int len, JsonDocument& doc) {

  // ── Langkah 1: Base64 decode ─────────────────────────────────────────────
  // Hitung ukuran output base64 decode: ≈ (len * 3 / 4) + slack
  // Buffer dialokasikan di stack; base64 payload ~400 byte max untuk 256-byte CT
  const size_t B64_MAX_OUT = 512;
  uint8_t decodedBuf[B64_MAX_OUT];
  size_t  decodedLen = 0;

  int b64ret = mbedtls_base64_decode(
      decodedBuf,      // output buffer
      B64_MAX_OUT,     // output buffer size
      &decodedLen,     // actual decoded bytes written
      payload,         // input (base64 string)
      (size_t)len      // input length
  );

  if (b64ret != 0) {
    Serial.printf("[parse] ERROR: base64 decode gagal, ret=%d\n", b64ret);
    return false;
  }

  // Minimum: 16 byte IV + 16 byte ciphertext (1 blok AES)
  if (decodedLen < 32) {
    Serial.printf("[parse] ERROR: decoded terlalu pendek (%u byte), min 32\n",
                  (unsigned)decodedLen);
    return false;
  }

  // ── Langkah 2: Split IV dan ciphertext ───────────────────────────────────
  // Layout binary: [IV 16 bytes][ciphertext N bytes] (Requirements 4.3, 4.2)
  const uint8_t* iv = decodedBuf;            // pointer ke 16 byte pertama
  const uint8_t* ct = decodedBuf + 16;       // pointer ke ciphertext
  size_t         ctLen = decodedLen - 16;    // panjang ciphertext

  // Ciphertext harus kelipatan 16 (AES block size)
  if (ctLen % 16 != 0) {
    Serial.printf("[parse] ERROR: ctLen=%u bukan kelipatan 16\n",
                  (unsigned)ctLen);
    return false;
  }

  // ── Langkah 3: AES-128-CBC decrypt ───────────────────────────────────────
  // Buffer plaintext: ctLen byte data + 1 null terminator
  // Gunakan stack buffer; ctLen ≤ 480 byte untuk payload alarm normal
  const size_t PLAIN_MAX = 512;
  if (ctLen + 1 > PLAIN_MAX) {
    Serial.printf("[parse] ERROR: ctLen=%u terlalu besar untuk buffer\n",
                  (unsigned)ctLen);
    return false;
  }

  char   plainBuf[PLAIN_MAX];
  size_t plainLen = 0;

  if (!aesDecrypt(iv, ct, ctLen, plainBuf, &plainLen)) {
    // aesDecrypt sudah print error detail
    Serial.println("[parse] ERROR: AES decrypt gagal");
    return false;
  }

  // ── Langkah 4: ArduinoJson deserialize ───────────────────────────────────
  // Cast ke const char* agar ArduinoJson COPY string ke doc
  // (tanpa cast, string jadi dangling pointer setelah function return)
  DeserializationError jsonErr = deserializeJson(doc, (const char*)plainBuf, plainLen);
  if (jsonErr) {
    Serial.printf("[parse] ERROR: JSON parse gagal: %s\n",
                  jsonErr.c_str());
    return false;
  }

  // ── Langkah 5: Validasi field wajib ──────────────────────────────────────
  // Semua field berikut harus ada (tidak null/missing) — Requirements 4.4
  if (!doc["event"].is<const char*>()) {
    Serial.println("[parse] ERROR: field 'event' missing atau bukan string");
    return false;
  }
  if (!doc["nodeId"].is<int>()) {
    Serial.println("[parse] ERROR: field 'nodeId' missing atau bukan int");
    return false;
  }
  if (doc["sektorId"].isNull()) {
    Serial.println("[parse] ERROR: field 'sektorId' missing");
    return false;
  }
  if (doc["violations"].isNull()) {
    Serial.println("[parse] ERROR: field 'violations' missing");
    return false;
  }
  if (!doc["timestamp"].is<const char*>()) {
    Serial.println("[parse] ERROR: field 'timestamp' missing atau bukan string");
    return false;
  }

  // ── Langkah 6: Validasi nilai event ──────────────────────────────────────
  // Event yang diizinkan: "apd_violation", "apd_test", "apd_stop", "gas_test"
  // Payload selain ini dianggap tidak valid / bukan untuk firmware ini
  const char* event = doc["event"];
  if (strcmp(event, "apd_violation") != 0 &&
      strcmp(event, "apd_test")      != 0 &&
      strcmp(event, "apd_stop")      != 0 &&
      strcmp(event, "gas_test")      != 0) {
    Serial.printf("[parse] ERROR: event '%s' tidak dikenal\n", event);
    return false;
  }

  // ── Langkah 7: Validasi nodeId == MY_NODE_ID (defense-in-depth) ──────────
  // Meskipun sudah routing per-topik, validasi ini memastikan pesan benar-benar
  // ditujukan untuk node ini — mencegah cross-node injection (Requirements 3.4)
  int msgNodeId = doc["nodeId"].as<int>();
  if (msgNodeId != MY_NODE_ID) {
    Serial.printf("[parse] ERROR: nodeId mismatch (payload=%d, lokal=%d) — abaikan\n",
                  msgNodeId, MY_NODE_ID);
    return false;
  }

  // ── Langkah 8: Timestamp replay protection (task 4.6, Requirements 4.4) ──
  // Validasi timestamp payload tidak lebih dari 5 menit di masa lalu/depan.
  // Tolak jika NTP belum sync atau timestamp di luar jendela toleransi.
  const char* ts = doc["timestamp"] | "";
  if (!isTimestampFresh(ts)) {
    Serial.println("[parse] ERROR: timestamp replay protection — pesan ditolak");
    return false;
  }

  // Semua validasi lulus
  Serial.printf("[parse] OK  event='%s'  node=%d  sektor=%s\n",
                event, msgNodeId,
                doc["sektorId"] | "?");
  return true;
}

// =============================================================================
// TASK 4.7 — Audio Playback dari SPIFFS
// Requirements: 1.6, 9.1, 9.4
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// setupAudio()
//
// Inisialisasi I2S output (AudioOutputI2S) dengan pin map yang sudah ditentukan.
// Dipanggil sekali dari setup() sebelum WiFi/MQTT connect.
//
// Globals yang dipakai:
//   i2sOut          — AudioOutputI2S* (alokasi di sini, tetap hidup selamanya)
//   I2S_BCLK/LRC/DOUT — pin konstanta dari #define di atas
//
// Catatan:
//   - Mode mono lebih hemat CPU dan cocok untuk MAX98357A (mono amp)
//   - Gain 0.9 = ~90% output, cukup keras tanpa distorsi pada speaker 3W
//   - AudioFileSourceSPIFFS, AudioGeneratorMP3, AudioFileSourceBuffer
//     dialokasikan saat startAlarm() dipanggil, bukan di sini
// ─────────────────────────────────────────────────────────────────────────────
void setupAudio() {
  Serial.println("[audio] init I2S output...");

  // Buat objek AudioOutputI2S permanen (tidak pernah di-delete)
  i2sOut = new AudioOutputI2S();

  // Set pin: BCLK, LRC (WS), DOUT — sesuai wiring MAX98357A ke GPIO26/25/22
  i2sOut->SetPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);

  // Mode mono: MAX98357A adalah mono amplifier
  i2sOut->SetOutputModeMono(true);

  // Gain: 0.9 memberikan volume yang cukup tanpa distorsi pada speaker 3W
  i2sOut->SetGain(0.90f);

  Serial.printf("[audio] I2S OK. pins: BCLK=%d LRC=%d DOUT=%d gain=0.90\n",
                I2S_BCLK, I2S_LRC, I2S_DOUT);
}

// ─────────────────────────────────────────────────────────────────────────────
// startAlarm()
//
// Memulai alarm audio: set state ke ALARM_ACTIVE, buka file MP3 dari SPIFFS,
// dan mulai memutar audio. Jika file SPIFFS tidak ditemukan, fallback ke
// pola buzzer sebagai gantinya.
//
// Alur:
//   1. Set systemState = ALARM_ACTIVE
//   2. Stop dan bersihkan audio lama (jika ada)
//   3. Cek SPIFFS.exists(AUDIO_FILE)
//      a. Jika ada → buka AudioFileSourceSPIFFS → bungkus dengan
//         AudioFileSourceBuffer (8KB buffer) → buat AudioGeneratorMP3 →
//         panggil mp3->begin(audioBuf, i2sOut)
//      b. Jika tidak ada → fallback buzzer: 3x beep 200ms
//   4. Reset alarmPlayCount ke 1 (sedang memutar putaran pertama)
//
// Globals yang dimodifikasi:
//   systemState, mp3, spiffsFile, audioBuf, alarmPlayCount
//
// Dipanggil dari: mqttCallback() saat event "apd_violation" / "apd_test",
//                 checkBootButton() untuk test lokal.
// ─────────────────────────────────────────────────────────────────────────────
void startAlarm() {
  Serial.println("[alarm] startAlarm() dipanggil.");

  // Transisi state ke ALARM_ACTIVE
  systemState = ALARM_ACTIVE;

  // ── Bersihkan audio lama (jika ada sesi yang masih berjalan) ────────────
  if (mp3) {
    if (mp3->isRunning()) {
      mp3->stop();
      Serial.println("[alarm] audio lama dihentikan.");
    }
    delete mp3;
    mp3 = nullptr;
  }
  if (audioBuf) {
    delete audioBuf;
    audioBuf = nullptr;
  }
  if (httpFile) {
    delete httpFile;
    httpFile = nullptr;
  }

  // ── Stream audio dari URL (seperti referensi yang berhasil) ─────────────
  // Defensif: pastikan flag gas di-clear agar sesi APD memakai
  // ALARM_PLAY_MAX (bukan GAS_ALARM_PLAY_MAX) di handleAudioLoop().
  currentAlarmIsGas = false;
  alarmPlayCount = 1;
  currentAudioUrl = ALARM_URL;  // tandai URL aktif untuk handleAudioLoop()
  Serial.printf("[alarm] memutar alarm ke-%d/%d dari URL\n",
                alarmPlayCount, ALARM_PLAY_MAX);
  Serial.printf("[alarm] URL: %s\n", ALARM_URL);

  httpFile = new AudioFileSourceHTTPStream(ALARM_URL);
  audioBuf = new AudioFileSourceBuffer(httpFile, AUDIO_BUFFER_SIZE);
  mp3      = new AudioGeneratorMP3();

  bool ok = mp3->begin(audioBuf, i2sOut);
  if (!ok) {
    Serial.println("[alarm] ERROR: mp3->begin() gagal.");
    delete mp3;      mp3      = nullptr;
    delete audioBuf; audioBuf = nullptr;
    delete httpFile; httpFile = nullptr;
    alarmPlayCount = 0;
    systemState    = STANDBY;
    return;
  }

  Serial.printf("[alarm] MP3 mulai diputar. Free heap: %u\n",
                ESP.getFreeHeap());
}

// ─────────────────────────────────────────────────────────────────────────────
// stopAlarm()
//
// Hentikan semua audio yang sedang berjalan, bebaskan semua objek audio,
// matikan LED_GAS dan BUZZER, kembalikan state ke STANDBY.
//
// Dipanggil dari:
//   - mqttCallback() saat event "apd_stop"
//   - Setelah ALARM_PLAY_MAX selesai di handleAudioLoop()
//   - Sebelum startAlarm() untuk bersihkan sesi lama
// ─────────────────────────────────────────────────────────────────────────────
void stopAlarm() {
  Serial.println("[alarm] stopAlarm() dipanggil.");

  // Hentikan generator MP3 jika masih berjalan
  if (mp3) {
    if (mp3->isRunning()) {
      mp3->stop();
    }
    delete mp3;
    mp3 = nullptr;
  }

  // Bebaskan buffer
  if (audioBuf) {
    delete audioBuf;
    audioBuf = nullptr;
  }

  // Bebaskan HTTP stream
  if (httpFile) {
    delete httpFile;
    httpFile = nullptr;
  }

  // Reset play counter
  alarmPlayCount = 0;
  currentAudioUrl = nullptr;
  // Reset flag gas-vs-APD agar sesi berikutnya start dari state bersih.
  currentAlarmIsGas = false;
  // Catat timestamp alarm selesai untuk gating quiet window di mqttCallback().
  lastAlarmEndedAt = millis();

  // Matikan LED gas alert
  digitalWrite(LED_GAS, LOW);

  // Kembali ke state normal
  systemState = STANDBY;

  Serial.println("[alarm] audio dihentikan. sistem kembali ke STANDBY.");
}

// ─────────────────────────────────────────────────────────────────────────────
// handleAudioLoop()
//
// Audio pump non-blocking — wajib dipanggil setiap iterasi loop().
// Memanggil mp3->loop() untuk mendorong data audio ke I2S satu chunk per call.
//
// Logika pengulangan (looping):
//   - Selama mp3->isRunning() == true  → panggil mp3->loop() sekali.
//   - Saat mp3->isRunning() == false   → satu putaran selesai.
//       jika alarmPlayCount < ALARM_PLAY_MAX → restart untuk putaran berikutnya
//       jika alarmPlayCount >= ALARM_PLAY_MAX → panggil stopAlarm()
//
// Restart dilakukan dengan membuat ulang AudioFileSourceSPIFFS dan
// AudioFileSourceBuffer (AudioGeneratorMP3 di-reuse dengan mp3->begin() baru).
// Ini diperlukan karena SPIFFS source tidak dapat di-rewind.
//
// Globals yang dibaca/dimodifikasi:
//   mp3, spiffsFile, audioBuf, i2sOut, alarmPlayCount, ALARM_PLAY_MAX
// ─────────────────────────────────────────────────────────────────────────────
void handleAudioLoop() {
  // Tidak ada audio yang diinisialisasi — tidak ada yang perlu dilakukan
  if (mp3 == nullptr) return;

  if (mp3->isRunning()) {
    // Pump data audio ke I2S (non-blocking, satu chunk per call)
    if (!mp3->loop()) {
      // Pilih playMax dinamis berdasarkan jenis sesi audio aktif:
      //   - Gas alarm → GAS_ALARM_PLAY_MAX
      //   - APD alarm → ALARM_PLAY_MAX
      // Keduanya saat ini bernilai 4, tetapi dipisah agar tunable mandiri.
      const int playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX;

      // Satu putaran selesai
      Serial.printf("[audio] putaran %d/%d selesai.\n",
                    alarmPlayCount, playMax);

      // Bersihkan audio objects
      mp3->stop();
      delete mp3;      mp3      = nullptr;
      delete audioBuf; audioBuf = nullptr;
      delete httpFile; httpFile = nullptr;

      alarmPlayCount++;

      if (alarmPlayCount <= playMax) {
        // ── Masih ada putaran — stream ulang dari URL aktif ────────────
        Serial.printf("[audio] memulai putaran %d/%d (URL: %s)...\n",
                      alarmPlayCount, playMax,
                      currentAudioUrl ? currentAudioUrl : "(null)");
        delay(500);  // Jeda antar putaran

        const char* url = currentAudioUrl ? currentAudioUrl : ALARM_URL;
        httpFile = new AudioFileSourceHTTPStream(url);
        audioBuf = new AudioFileSourceBuffer(httpFile, AUDIO_BUFFER_SIZE);
        mp3      = new AudioGeneratorMP3();

        bool ok = mp3->begin(audioBuf, i2sOut);
        if (!ok) {
          Serial.println("[audio] ERROR: mp3->begin() gagal saat loop.");
          stopAlarm();
        }
      } else {
        // ── Sudah playMax kali diputar — selesai ──────────────
        Serial.printf("[audio] alarm selesai diputar %d kali.\n",
                      playMax);
        // Catat timestamp natural-end (tidak lewat stopAlarm()) untuk
        // gating quiet window di mqttCallback().
        lastAlarmEndedAt = millis();
        alarmPlayCount = 0;
        systemState = STANDBY;
        Serial.println("[alarm] kembali ke STANDBY.");
      }
    }
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// shouldStartAlarm()
//
// Pure function — return true jika alarm baru boleh dimulai berdasarkan
// jeda sejak alarm sebelumnya selesai. Tidak mengakses global apa pun.
// PBT-able lewat alarm_apd/test/test_should_start_alarm/ (Property 8, 9
// di design.md).
//
// Edge cases:
//   - lastEndedAt == 0  → belum pernah ada alarm → return true.
//   - now < lastEndedAt → millis() overflow setelah ~49.7 hari →
//                          conservative: return true.
// ─────────────────────────────────────────────────────────────────────────────
bool shouldStartAlarm(unsigned long now,
                      unsigned long lastEndedAt,
                      unsigned long quietMs) {
  if (lastEndedAt == 0) return true;
  if (now < lastEndedAt) return true;          // overflow safety
  return (now - lastEndedAt) >= quietMs;
}

// =============================================================================
// TASK 4.6 — Timestamp Replay Protection
// Requirements: 4.4
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// isTimestampFresh()
//
// Memvalidasi apakah timestamp ISO 8601 dari payload MQTT masih "segar"
// (belum kadaluarsa dan bukan dari masa depan), dibandingkan dengan waktu
// NTP yang sudah disync saat setup().
//
// Tujuan: mencegah replay attack — penyerang yang merekam dan memutar ulang
// pesan lama tidak bisa memicu alarm karena timestamp-nya sudah basi.
//
// Parameter:
//   isoTimestamp  — string ISO 8601 UTC, format: "2026-06-05T10:23:45.000Z"
//                   atau  "2026-06-05T10:23:45Z"  (tanpa millisecond)
//   maxAgeSeconds — toleransi maksimum selisih waktu dalam detik
//                   default 300 = 5 menit (sesuai spec design.md §3.4)
//
// Return:
//   true  — timestamp dalam jendela toleransi: |now - msgTime| ≤ maxAgeSeconds
//   false — NTP belum sync, format timestamp invalid, atau pesan terlalu
//           lama/terlalu jauh di masa depan; detail di-log via Serial
//
// Catatan:
//   - Fungsi ini hanya pakai stdlib C (<time.h>), tidak tambah dependency baru
//   - getLocalTime() mengembalikan false jika NTP belum pernah sync → tolak
//   - Format yang diterima: YYYY-MM-DDTHH:MM:SS[.mmm]Z  (Z = UTC/offset)
//     sscanf dipakai untuk parsing karena strptime tidak tersedia di ESP32 SDK
//   - Waktu NTP di-setup dengan UTC+7 (WIB) di setup(), tapi timestamp payload
//     adalah UTC — mktime() dikompensasi dengan menambah TZ offset saat konversi
// ─────────────────────────────────────────────────────────────────────────────
bool isTimestampFresh(const char* isoTimestamp, int maxAgeSeconds) {

  // ── Langkah 1: Ambil waktu sekarang via NTP ──────────────────────────────
  // getLocalTime() mengembalikan false jika RTC belum terisi dari NTP
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("[ts] WARN: NTP belum sync — timestamp replay check dilewati (tolak)");
    return false;
  }

  // Konversi waktu lokal (WIB UTC+7) ke epoch UTC
  // mktime() mengasumsikan struct tm dalam timezone lokal (WIB), jadi
  // kurangi 7 jam (7*3600) untuk mendapatkan epoch UTC yang benar.
  time_t nowEpoch = mktime(&timeinfo) - (7 * 3600);

  // Sanity check: jika epoch < 2024-01-01, NTP belum sync dengan benar
  // (nilai 1704067200 = Unix epoch untuk 2024-01-01T00:00:00Z)
  if (nowEpoch < 1704067200L) {
    Serial.printf("[ts] WARN: NTP epoch=%ld tampak tidak valid — tolak\n",
                  (long)nowEpoch);
    return false;
  }

  // ── Langkah 2: Parse ISO 8601 timestamp dari payload ─────────────────────
  // Format yang dihasilkan Python backend:
  //   "2026-06-05T10:23:45.000Z"  — dengan millisecond
  //   "2026-06-05T10:23:45Z"      — tanpa millisecond (fallback)
  //
  // Kita coba parse dengan millisecond dulu, lalu tanpa (sscanf returnvalue).
  // Variabel ms tidak dipakai untuk epoch (resolusi detik cukup).
  struct tm msgTm;
  memset(&msgTm, 0, sizeof(msgTm));
  int ms = 0;

  int parsed = sscanf(isoTimestamp,
                      "%4d-%2d-%2dT%2d:%2d:%2d.%dZ",
                      &msgTm.tm_year,
                      &msgTm.tm_mon,
                      &msgTm.tm_mday,
                      &msgTm.tm_hour,
                      &msgTm.tm_min,
                      &msgTm.tm_sec,
                      &ms);

  if (parsed < 6) {
    // Coba tanpa millisecond ("2026-06-05T10:23:45Z")
    parsed = sscanf(isoTimestamp,
                    "%4d-%2d-%2dT%2d:%2d:%2dZ",
                    &msgTm.tm_year,
                    &msgTm.tm_mon,
                    &msgTm.tm_mday,
                    &msgTm.tm_hour,
                    &msgTm.tm_min,
                    &msgTm.tm_sec);

    if (parsed < 6) {
      Serial.printf("[ts] ERROR: format timestamp tidak dikenal: '%s'\n",
                    isoTimestamp);
      return false;
    }
  }

  // Sesuaikan nilai struct tm:
  //   - tm_year: tahun sejak 1900  (mis. 2026 → 126)
  //   - tm_mon:  bulan 0-based     (mis. Juni=6 → 5)
  //   - tm_isdst = -1 → mktime tentukan sendiri DST (tidak berlaku di WIB)
  msgTm.tm_year -= 1900;
  msgTm.tm_mon  -= 1;
  msgTm.tm_isdst = -1;

  // ── Langkah 3: Konversi ke epoch UTC ─────────────────────────────────────
  // Timestamp payload sudah UTC (trailing 'Z').
  // mktime() mengasumsikan input dalam timezone lokal (WIB = UTC+7), jadi
  // kurangi 7 jam untuk mendapatkan epoch UTC murni — konsisten dengan nowEpoch.
  time_t msgEpoch = mktime(&msgTm) - (7 * 3600);

  if (msgEpoch < 0) {
    Serial.printf("[ts] ERROR: konversi epoch gagal untuk '%s'\n",
                  isoTimestamp);
    return false;
  }

  // ── Langkah 4: Bandingkan selisih ────────────────────────────────────────
  // Gunakan nilai absolut supaya tolak pesan dari masa depan juga
  // (mis. clocks skewed, atau crafted payload)
  long diff = (long)nowEpoch - (long)msgEpoch;
  long absDiff = diff < 0 ? -diff : diff;

  Serial.printf("[ts] now=%ld  msg=%ld  diff=%lds  maxAge=%ds\n",
                (long)nowEpoch, (long)msgEpoch, diff, maxAgeSeconds);

  if (absDiff > (long)maxAgeSeconds) {
    if (diff > 0) {
      Serial.printf("[ts] REJECT: pesan terlalu lama (%.1f menit yang lalu)\n",
                    (float)diff / 60.0f);
    } else {
      Serial.printf("[ts] REJECT: timestamp dari masa depan (%lds ke depan)\n",
                    -diff);
    }
    return false;
  }

  Serial.printf("[ts] OK: timestamp segar (selisih %lds)\n", diff);
  return true;
}

// =============================================================================
// TASK 4.8 — LED State Machine
// Requirements: 1.8
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// updateLED()
//
// Non-blocking LED state machine untuk built-in LED (LED_STATUS = GPIO2).
// Dipanggil setiap iterasi loop() — TIDAK boleh memanggil delay().
// Semua timing menggunakan millis() + static timestamp lokal.
//
// State behaviour (Requirements 1.8):
//
//   WIFI_CONNECTING  — Fast blink 50ms: toggle setiap 50ms
//                      Sinyal: WiFi sedang mencoba koneksi
//
//   MQTT_CONNECTING  — Medium blink 300ms: toggle setiap 300ms
//                      Sinyal: WiFi OK, MQTT TLS sedang connect/reconnect
//
//   STANDBY          — Solid ON: LED menyala terus, tidak berkedip
//                      Sinyal: sistem normal, siap menerima pesan
//
//   ALARM_ACTIVE     — Double-blink pattern kemudian pause:
//                      Fase 0 (0–100ms):   ON   (blink 1, nyala)
//                      Fase 1 (100–200ms): OFF  (blink 1, padam)
//                      Fase 2 (200–300ms): ON   (blink 2, nyala)
//                      Fase 3 (300–600ms): OFF  (300ms pause)
//                      Total siklus = 600ms, lalu ulang.
//                      Sinyal: alarm aktif, audio sedang diputar
//
// Catatan implementasi:
//   - State disimpan di global `volatile SystemState systemState`.
//   - Perubahan state di-handle oleh event handler lain
//     (connectWiFi, connectMQTT, startAlarm, stopAlarm, ensureConnected).
//   - Saat state berubah, variabel timing reset otomatis karena setiap
//     state menyimpan `stateEnteredAt` yang di-reset saat state mismatch.
// ─────────────────────────────────────────────────────────────────────────────
void updateLED() {
  unsigned long now = millis();

  // Statik variabel: persist antar pemanggilan, tapi hanya visible di sini.
  // ledLastToggleMs : kapan terakhir LED di-toggle (untuk blink mode)
  // lastKnownState  : track perubahan state supaya timing bisa di-reset
  static unsigned long  ledLastToggleMs = 0;
  static bool           ledOn           = false;
  static SystemState    lastKnownState  = WIFI_CONNECTING;

  // ── Reset timing saat state berubah ──────────────────────────────────────
  // Supaya pola baru dimulai dari awal (bukan mid-pattern dari state lama).
  if (systemState != lastKnownState) {
    ledLastToggleMs = now;
    ledOn           = false;
    lastKnownState  = systemState;

    // Paksa LED LOW saat transisi (kecuali ke STANDBY yang langsung HIGH)
    if (systemState != STANDBY) {
      digitalWrite(LED_STATUS, LOW);
    }
  }

  // ── State machine ─────────────────────────────────────────────────────────
  switch (systemState) {

    // ── WIFI_CONNECTING: fast blink 50ms ────────────────────────────────────
    // Toggle setiap 50ms → full cycle 100ms, ~10 Hz.
    // Terlihat sebagai kedip sangat cepat (nyaris seperti cahaya terus).
    case WIFI_CONNECTING:
      if (now - ledLastToggleMs >= 50UL) {
        ledOn = !ledOn;
        digitalWrite(LED_STATUS, ledOn ? HIGH : LOW);
        ledLastToggleMs = now;
      }
      break;

    // ── MQTT_CONNECTING: medium blink 300ms ─────────────────────────────────
    // Toggle setiap 300ms → full cycle 600ms, ~1.67 Hz.
    // Terlihat sebagai kedip lambat — jelas berbeda dari WiFi connecting.
    case MQTT_CONNECTING:
      if (now - ledLastToggleMs >= 300UL) {
        ledOn = !ledOn;
        digitalWrite(LED_STATUS, ledOn ? HIGH : LOW);
        ledLastToggleMs = now;
      }
      break;

    // ── STANDBY: solid ON ────────────────────────────────────────────────────
    // LED menyala terus. Tulis HIGH setiap loop supaya tidak terpengaruh
    // jika kode lain sempat mematikan LED secara tidak sengaja.
    case STANDBY:
      digitalWrite(LED_STATUS, HIGH);
      ledOn = true;
      break;

    // ── ALARM_ACTIVE: double-blink pattern ──────────────────────────────────
    // Siklus 600ms yang terbagi menjadi 4 fase:
    //   [  0ms –  100ms ]  ON   ← blink pertama, nyala
    //   [100ms –  200ms ]  OFF  ← blink pertama, padam
    //   [200ms –  300ms ]  ON   ← blink kedua,   nyala
    //   [300ms –  600ms ]  OFF  ← pause 300ms
    //
    // Posisi dalam siklus dihitung dari selisih `now - ledLastToggleMs`,
    // di-modulo 600 → tidak perlu counter tambahan, otomatis wrap-around.
    case ALARM_ACTIVE: {
      unsigned long elapsed = (now - ledLastToggleMs) % 600UL;
      bool wantOn;

      if (elapsed < 100UL) {
        wantOn = true;   // blink 1: ON
      } else if (elapsed < 200UL) {
        wantOn = false;  // blink 1: OFF
      } else if (elapsed < 300UL) {
        wantOn = true;   // blink 2: ON
      } else {
        wantOn = false;  // pause 300ms: OFF
      }

      // Hanya tulis ke GPIO jika perlu berubah (mengurangi SPI bus traffic)
      if (wantOn != ledOn) {
        ledOn = wantOn;
        digitalWrite(LED_STATUS, ledOn ? HIGH : LOW);
      }
      break;
    }

    // ── Default safety: LED OFF ───────────────────────────────────────────
    // Menangani kemungkinan enum value di luar yang dikenal.
    default:
      digitalWrite(LED_STATUS, LOW);
      ledOn = false;
      break;
  }
}

// =============================================================================
// TASK 4.9 — Tombol BOOT untuk Test Alarm Lokal
// Requirements: 1.7
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// checkBootButton()
//
// Deteksi penekanan tombol BOOT (GPIO0, active-low, INPUT_PULLUP) dan trigger
// satu putaran alarm test tanpa melalui MQTT — sesuai Requirement 1.7.
//
// Debounce:
//   Deteksi falling edge (HIGH → LOW) hanya diterima jika selisih dari
//   penekanan terakhir ≥ 300ms. Ini mencegah bouncing fisik tombol
//   meng-trigger alarm berkali-kali dalam satu tekanan.
//
// Logika "1 loop" (fix bug PLAY_COUNT save/restore):
//   startAlarm() normal menetapkan alarmPlayCount = 1 dan membiarkan
//   handleAudioLoop() mengulangi sampai ALARM_PLAY_MAX (default 4×).
//   Untuk test mode, setelah startAlarm() selesai mengatur sesi audio,
//   kita set alarmPlayCount = ALARM_PLAY_MAX. Dengan demikian saat putaran
//   pertama selesai, handleAudioLoop() melihat alarmPlayCount >= ALARM_PLAY_MAX
//   dan langsung memanggil stopAlarm() — total hanya 1 putaran.
//
//   Penting: nilai ini di-set SETELAH startAlarm() karena startAlarm() sendiri
//   yang mereset alarmPlayCount ke 1 (sebagai bagian inisialisasi sesi baru).
//   Jika di-set sebelumnya, startAlarm() akan menimpanya.
//
// Guard state:
//   Hanya trigger ketika systemState == STANDBY. Saat alarm sudah berjalan,
//   MQTT connecting, atau WiFi connecting, tombol diabaikan.
//
// Globals yang dibaca: BTN_BOOT, lastBtnPressMs, systemState
// Globals yang dimodifikasi: lastBtnPressMs, alarmPlayCount (via startAlarm)
// ─────────────────────────────────────────────────────────────────────────────
void checkBootButton() {
  static bool prevBtnState = HIGH;  // Track previous state for edge detection
  int btnState = digitalRead(BTN_BOOT);

  // Falling edge only: trigger saat transisi HIGH → LOW (baru ditekan)
  if (btnState == LOW && prevBtnState == HIGH) {
    prevBtnState = LOW;

    if (systemState != STANDBY) return;

    unsigned long now = millis();
    // Debounce: abaikan jika belum 3 detik sejak tekanan terakhir
    if ((now - lastBtnPressMs) < 3000UL) return;
    lastBtnPressMs = now;

    Serial.println("[btn] BOOT button ditekan — trigger alarm test (1 loop).");
    startAlarm();

    // Paksa hanya 1 loop
    alarmPlayCount = ALARM_PLAY_MAX;
    Serial.printf("[btn] alarm test dimulai (alarmPlayCount=%d/%d — berhenti setelah 1 loop).\n",
                  alarmPlayCount, ALARM_PLAY_MAX);
  } else if (btnState == HIGH) {
    prevBtnState = HIGH;
  }
}

// =============================================================================
// TASK 4.11 — Gas Alert Local Indicator
// Requirements: 2.5
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// handleGasAlert()
//
// Mengelola indikator lokal untuk kondisi gas alert:
//   - LED_GAS (GPIO13) menyala saat alert=true, mati saat alert=false
//   - Buzzer beep 200ms HANYA saat transisi false→true (deteksi pertama)
//   - Selama alert masih berlanjut (alert=true & prev=true): LED tetap ON,
//     buzzer TIDAK berbunyi lagi (debounce: 1x beep per sustained alert)
//   - Saat alert berakhir (alert=false): LED OFF, noTone, prev di-reset
//
// Parameter:
//   alert — true jika nilai ADC rata-rata MQ-135 melebihi GAS_THRESHOLD,
//            false jika dalam batas normal
//
// Logika state transition:
//   alert=true  + prev=false → LED ON + beep 200ms + set prev=true
//   alert=true  + prev=true  → LED ON (tetap), tidak ada beep baru
//   alert=false + prev=any   → LED OFF + noTone + set prev=false
//
// Dipanggil oleh: sampleGas() setiap 2 detik dengan nilai alert terkini.
//
// Globals yang dibaca: LED_GAS, BUZZER
// Static variables:   prevGasAlert (track state sebelumnya, persistent)
// ─────────────────────────────────────────────────────────────────────────────
void handleGasAlert(bool alert) {
  static bool prevGasAlert = false;

  if (alert) {
    digitalWrite(LED_GAS, HIGH);
    if (!prevGasAlert) {
      Serial.println("[gas] ALERT: gas melebihi threshold! LED ON + playing alarm.");
      prevGasAlert = true;
      // Play gas alarm audio jika tidak sedang putar alarm lain
      if (systemState != ALARM_ACTIVE) {
        // ── Bersihkan dulu (cleanup audio sebelumnya kalau ada) ──
        stopAlarm();

        // ── Setup sesi audio gas alarm baru ──
        Serial.printf("[gas-alarm] memutar alarm gas (%d putaran)...\n",
                      GAS_ALARM_PLAY_MAX);
        Serial.printf("[gas-alarm] URL: %s\n", GAS_ALARM_URL);
        systemState = ALARM_ACTIVE;
        currentAudioUrl = GAS_ALARM_URL;  // tandai URL aktif

        httpFile = new AudioFileSourceHTTPStream(GAS_ALARM_URL);
        if (!httpFile) {
          Serial.println("[gas-alarm] ERROR: gagal buat HTTP stream!");
          systemState = STANDBY;
          alarmPlayCount = 0;
          return;
        }
        audioBuf = new AudioFileSourceBuffer(httpFile, AUDIO_BUFFER_SIZE);
        mp3      = new AudioGeneratorMP3();

        if (mp3 && mp3->begin(audioBuf, i2sOut)) {
          Serial.printf("[gas-alarm] MP3 mulai diputar. Free heap: %u\n",
                        ESP.getFreeHeap());
          // Gas alarm berbunyi GAS_ALARM_PLAY_MAX putaran (default 4),
          // analog dengan startAlarm() APD. Set counter ke 1 dan tandai
          // sesi sebagai gas alarm sehingga handleAudioLoop() memakai
          // GAS_ALARM_PLAY_MAX saat mengevaluasi batas putaran.
          alarmPlayCount = 1;
          currentAlarmIsGas = true;
        } else {
          Serial.println("[gas-alarm] ERROR: mp3->begin() gagal!");
          stopAlarm();
        }
      } else {
        Serial.println("[gas-alarm] skip — alarm APD sedang diputar.");
      }
    }
  } else {
    digitalWrite(LED_GAS, LOW);
    if (prevGasAlert) {
      Serial.println("[gas] alert cleared: LED OFF.");
    }
    prevGasAlert = false;
  }
}


// =============================================================================
// TASK 4.10 — MQ-135 Sampling + Telemetry
// Requirements: 2.1, 2.2, 2.3, 2.4
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// calcGasAverage()
//
// Hitung moving average dari ring buffer 5 elemen gasRingBuf[].
// Semua 5 elemen dijumlahkan dan dibagi 5.
//
// Catatan:
//   - Ring buffer diisi bertahap; elemen yang belum pernah diisi bernilai 0
//     (diinisialisasi di deklarasi global: int gasRingBuf[5] = {0,...}).
//     Pada awal startup (< 5 sampel), rata-rata akan sedikit lebih rendah
//     dari nilai sebenarnya, namun ini tidak masalah secara operasional
//     karena threshold 2200 jauh di atas 0 — false alert tidak mungkin terjadi.
//   - Divisi integer (bukan float) sudah cukup untuk perbandingan threshold.
//
// Return:
//   int — rata-rata ADC (0..4095) dari 5 sampel terakhir
//
// Requirements: 2.2
// ─────────────────────────────────────────────────────────────────────────────
int calcGasAverage() {
  int sum = 0;
  for (int i = 0; i < 5; i++) {
    sum += gasRingBuf[i];
  }
  return sum / 5;
}

// ─────────────────────────────────────────────────────────────────────────────
// sampleGas()
//
// Sampling sensor MQ-135 dan manajemen telemetri gas.
// Dipanggil setiap iterasi loop() — non-blocking (timing via millis()).
//
// Alur eksekusi setiap 2 detik (Requirements 2.1):
//   1. analogRead(GAS_PIN) → nilai ADC 12-bit (0..4095)
//   2. Simpan ke gasRingBuf[gasRingIdx], increment gasRingIdx modulo 5
//   3. Hitung moving average 5 sampel: calcGasAverage()
//   4. Bandingkan rata-rata dengan GAS_THRESHOLD (default 2200)
//   5. Panggil handleGasAlert(alert) untuk indikator lokal (LED + buzzer)
//   6. Jika MQTT connected:
//      a. Jika avg > GAS_THRESHOLD → publishGasTelemetry(raw, alert=true)  (Req 2.3)
//      b. Setiap 60 detik → publishGasTelemetry(raw, alert=false sebagai heartbeat) (Req 2.4)
//         (heartbeat dikirim terlepas dari alert state — untuk monitoring ketersediaan sensor)
//
// Timing:
//   - GAS_SAMPLE_INTERVAL_MS = 2000ms (setiap 2 detik) — Requirements 2.1
//   - GAS_HEARTBEAT_INTERVAL_MS = 60000ms (setiap 60 detik) — Requirements 2.4
//
// Globals yang dibaca:
//   GAS_PIN, GAS_THRESHOLD, gasRingBuf, gasRingIdx, gasTopic,
//   lastGasSampleMs, lastHeartbeatMs, mqttClient
//
// Globals yang dimodifikasi:
//   gasRingBuf, gasRingIdx, lastGasSampleMs, lastHeartbeatMs
//
// Catatan:
//   - encryptAndPublish() (task 4.12, forward declared) dipakai via
//     publishGasTelemetry() — bukan dipanggil langsung di sini.
//   - handleGasAlert() (task 4.11, forward declared) menangani LED + buzzer
//     lokal — terpisah dari MQTT alarm APD.
//   - MQTT heartbeat selalu dikirim dengan alert=false untuk memberi sinyal
//     ke backend bahwa sensor berjalan normal — Requirements 2.4.
//     Jika saat heartbeat sedang dalam kondisi alert, publish telemetri alert
//     sudah dikirim sebelumnya (setiap 2s saat di atas threshold).
// ─────────────────────────────────────────────────────────────────────────────
void sampleGas() {
  const unsigned long GAS_SAMPLE_INTERVAL_MS    = 2000UL;   // 2 detik (Req 2.1)
  const unsigned long GAS_HEARTBEAT_INTERVAL_MS = 60000UL;  // 60 detik (Req 2.4)

  unsigned long now = millis();

  // ── Sampling setiap 2 detik ───────────────────────────────────────────────
  if (now - lastGasSampleMs < GAS_SAMPLE_INTERVAL_MS) {
    return;  // Belum waktunya — kembalikan ke loop()
  }
  lastGasSampleMs = now;

  // ── 1. Baca sensor MQ-135 (ADC 12-bit, 0..4095) ──────────────────────────
  // GPIO34 adalah ADC1_CH6, input-only, tanpa pull-up — sesuai spec (Req 2.1)
  int rawValue = analogRead(GAS_PIN);

  // ── 2. Push ke ring buffer (circular, 5 elemen) ───────────────────────────
  // gasRingIdx selalu dalam range 0..4 (uint8_t modulo 5)
  gasRingBuf[gasRingIdx] = rawValue;
  gasRingIdx = (gasRingIdx + 1) % 5;

  // ── 3. Hitung moving average 5 sampel terakhir (Req 2.2) ─────────────────
  int avg = calcGasAverage();

  // ── 4. Tentukan status alert ──────────────────────────────────────────────
  // alert = true jika rata-rata melebihi threshold (Req 2.3)
  bool alert = (avg > GAS_THRESHOLD);

  Serial.printf("[gas] raw=%d  avg=%d  threshold=%d  alert=%s\n",
                rawValue, avg, GAS_THRESHOLD, alert ? "TRUE" : "false");

  // ── 5. Indikator lokal: LED merah + buzzer beep (task 4.11) ──────────────
  // handleGasAlert() mengelola LED_GAS dan BUZZER secara debounced
  handleGasAlert(alert);

  // ── 6. MQTT publish (hanya jika terkoneksi) ───────────────────────────────
  if (!mqttClient.connected()) {
    Serial.println("[gas] MQTT tidak terhubung — skip publish telemetri.");
    return;
  }

  // 6a. Publish alert telemetri jika di atas threshold (Req 2.3)
  if (alert) {
    Serial.printf("[gas] ALERT: avg=%d > threshold=%d — publish telemetri alert\n",
                  avg, GAS_THRESHOLD);
    publishGasTelemetry(rawValue, true);
  }

  // 6b. Heartbeat setiap 60 detik, terlepas dari alert state (Req 2.4)
  // Heartbeat dikirim dengan alert=false sebagai sinyal sensor aktif/normal.
  // Catatan: jika saat ini sedang alert, telemetri alert (6a) sudah dikirim;
  // heartbeat tetap dikirim untuk memastikan backend menerima sinyal periodik.
  if (now - lastHeartbeatMs >= GAS_HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    Serial.printf("[gas] heartbeat (60s) — publish reguler (alert=false, raw=%d)\n",
                  rawValue);
    publishGasTelemetry(rawValue, false);
  }
}

// =============================================================================
// TASK 4.12 — encryptAndPublish + publishGasTelemetry
// Requirements: 4.2, 4.6
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// encryptAndPublish()
//
// Helper generik untuk mengenkripsi payload JSON dan mempublish ke topik MQTT.
//
// Pipeline:
//   1. Serialize JsonDocument → JSON string (char buffer, stack-allocated)
//   2. Generate IV 16 byte acak via esp_fill_random() (ESP32 hardware RNG)
//      → IV baru tiap pemanggilan → memenuhi Requirements 4.2 dan 4.6
//   3. PKCS7 pad plaintext ke kelipatan 16 byte (AES block size)
//   4. AES-128-CBC encrypt menggunakan mbedtls_aes_setkey_enc +
//      mbedtls_aes_crypt_cbc dengan global aesKey[16]
//   5. Susun binary: [IV 16 bytes][ciphertext N bytes]
//   6. Base64 encode seluruh buffer menggunakan mbedtls_base64_encode
//   7. Publish base64 string via mqttClient.publish(topic, buf, len)
//      dengan QoS 0 (fire-and-forget untuk telemetri frekuensi tinggi)
//
// Parameter:
//   topic — topik MQTT tujuan (null-terminated C-string)
//   doc   — JsonDocument yang sudah diisi oleh caller sebelum dipanggil
//
// Return:
//   true  — serialize, encrypt, dan publish semuanya berhasil
//   false — salah satu langkah gagal; detail di-log ke Serial
//
// Buffer sizes (stack):
//   JSON_BUF_SIZE = 256 byte  — cukup untuk payload gas telemetri
//   PADDED_MAX    = 272 byte  — JSON_BUF_SIZE + 16 byte slack PKCS7
//   CONCAT_MAX    = 288 byte  — 16 byte IV + 272 byte ciphertext maks
//   B64_OUT_MAX   = 400 byte  — base64 overhead ~4/3 dari 288 byte
//
// Catatan keamanan:
//   - IV tidak rahasia — dikirim bersama ciphertext (Requirements 4.2)
//   - Random IV mencegah ciphertext sama walaupun plaintext sama (Req 4.6)
//   - Seluruh operasi kriptografi menggunakan mbedtls (built-in ESP32 core)
//     tanpa dependency eksternal tambahan (Requirements 4.5)
// ─────────────────────────────────────────────────────────────────────────────
bool encryptAndPublish(const char* topic, const JsonDocument& doc) {

  // ── Langkah 1: Serialize JSON ke char buffer ─────────────────────────────
  const size_t JSON_BUF_SIZE = 256;
  char jsonBuf[JSON_BUF_SIZE];
  size_t jsonLen = serializeJson(doc, jsonBuf, JSON_BUF_SIZE);

  if (jsonLen == 0 || jsonLen >= JSON_BUF_SIZE) {
    Serial.printf("[enc] ERROR: serializeJson gagal atau overflow (%u/%u)\n",
                  (unsigned)jsonLen, (unsigned)JSON_BUF_SIZE);
    return false;
  }

  Serial.printf("[enc] JSON (%u bytes): %s\n", (unsigned)jsonLen, jsonBuf);

  // ── Langkah 2: Generate random IV (16 byte, ESP32 hardware RNG) ──────────
  // esp_fill_random() menggunakan hardware RNG bawaan ESP32 (RF noise based).
  // Ini lebih kuat dari software PRNG — sesuai Requirements 4.2 dan 4.6.
  uint8_t iv[16];
  esp_fill_random(iv, 16);

  // ── Langkah 3: PKCS7 padding ─────────────────────────────────────────────
  // Hitung panjang setelah padding: ceil(jsonLen / 16) * 16
  // Tambah satu blok penuh jika jsonLen sudah kelipatan 16 (PKCS7 mandates this)
  size_t paddedLen = ((jsonLen / 16) + 1) * 16;

  const size_t PADDED_MAX = JSON_BUF_SIZE + 16;  // slack: 1 blok AES extra
  if (paddedLen > PADDED_MAX) {
    Serial.printf("[enc] ERROR: paddedLen=%u melebihi PADDED_MAX=%u\n",
                  (unsigned)paddedLen, (unsigned)PADDED_MAX);
    return false;
  }

  // Salin JSON ke buffer padded dan isi padding bytes
  uint8_t paddedBuf[PADDED_MAX];
  memcpy(paddedBuf, jsonBuf, jsonLen);

  uint8_t padByte = (uint8_t)(paddedLen - jsonLen);  // nilai padding (1..16)
  for (size_t i = jsonLen; i < paddedLen; i++) {
    paddedBuf[i] = padByte;
  }

  Serial.printf("[enc] plaintext %u bytes → padded %u bytes (pad=%u)\n",
                (unsigned)jsonLen, (unsigned)paddedLen, (unsigned)padByte);

  // ── Langkah 4: AES-128-CBC encrypt ───────────────────────────────────────
  // Alokasi buffer ciphertext (sama besar dengan padded plaintext)
  uint8_t cipherBuf[PADDED_MAX];

  mbedtls_aes_context aesCtx;
  mbedtls_aes_init(&aesCtx);

  int ret = mbedtls_aes_setkey_enc(&aesCtx, aesKey, 128);
  if (ret != 0) {
    Serial.printf("[enc] ERROR: setkey_enc gagal ret=%d\n", ret);
    mbedtls_aes_free(&aesCtx);
    return false;
  }

  // mbedtls_aes_crypt_cbc() memodifikasi iv — buat mutable copy
  uint8_t ivBuf[16];
  memcpy(ivBuf, iv, 16);

  ret = mbedtls_aes_crypt_cbc(&aesCtx,
                               MBEDTLS_AES_ENCRYPT,
                               paddedLen,
                               ivBuf,
                               paddedBuf,
                               cipherBuf);
  mbedtls_aes_free(&aesCtx);

  if (ret != 0) {
    Serial.printf("[enc] ERROR: crypt_cbc gagal ret=%d\n", ret);
    return false;
  }

  // ── Langkah 5: Susun [IV 16 bytes][ciphertext paddedLen bytes] ───────────
  // Layout: sama dengan yang dihasilkan Python backend dan diterima aesDecrypt()
  const size_t CONCAT_MAX = 16 + PADDED_MAX;
  uint8_t concatBuf[CONCAT_MAX];
  memcpy(concatBuf,      iv,         16);
  memcpy(concatBuf + 16, cipherBuf,  paddedLen);
  size_t concatLen = 16 + paddedLen;

  // ── Langkah 6: Base64 encode ──────────────────────────────────────────────
  // Base64 output: ceil(concatLen / 3) * 4 byte + 1 null terminator
  const size_t B64_OUT_MAX = 400;
  unsigned char b64Buf[B64_OUT_MAX];
  size_t b64Len = 0;

  ret = mbedtls_base64_encode(b64Buf, B64_OUT_MAX, &b64Len,
                               concatBuf, concatLen);
  if (ret != 0) {
    Serial.printf("[enc] ERROR: base64_encode gagal ret=%d\n", ret);
    return false;
  }

  Serial.printf("[enc] encrypt OK → %u bytes base64 → publish ke '%s'\n",
                (unsigned)b64Len, topic);

  // ── Langkah 7: Publish via MQTT ───────────────────────────────────────────
  // mqttClient.publish(topic, payload, length) — overload dengan panjang eksplisit
  // QoS 0 (at most once) sesuai untuk telemetri frekuensi tinggi.
  // b64Buf adalah unsigned char* — cast ke const uint8_t* untuk PubSubClient.
  bool ok = mqttClient.publish(topic,
                                (const uint8_t*)b64Buf,
                                (unsigned int)b64Len);
  if (!ok) {
    Serial.printf("[enc] WARN: publish ke '%s' gagal (buffer penuh / disconnected?)\n",
                  topic);
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// publishGasTelemetry()
//
// Helper tingkat tinggi untuk publish satu telemetri sensor MQ-135.
// Dipakai oleh sampleGas() (task 4.10) untuk mengirim data ke
// topik gasTopic ("apd/telemetry/gas/<nodeId>").
//
// JSON yang dikirim (format per design.md §3.3):
//   {
//     "event":    "gas_telemetry",
//     "nodeId":   MY_NODE_ID,
//     "sektorId": "<sektorId>",   // diisi MY_NODE_ID sebagai string (tanpa DB)
//     "raw":      <rawValue>,
//     "alert":    <true|false>,
//     "timestamp": "2026-06-05T17:23:45Z"   // ISO 8601 UTC dari NTP
//   }
//
// Timestamp:
//   getLocalTime(&ti) mengambil waktu NTP lokal (WIB UTC+7).
//   Format yang dihasilkan strftime adalah ISO 8601 local time,
//   tapi backend Python dan ESP32 menggunakan konvensi UTC, sehingga
//   kita format sebagai UTC dengan mengurangi 7 jam secara manual
//   menggunakan mktime() + gmtime_r() untuk mendapatkan UTC yang benar.
//
// Parameter:
//   rawValue — ADC reading langsung dari analogRead(GAS_PIN) (0..4095)
//   alert    — true jika rata-rata moving average melebihi GAS_THRESHOLD
//
// Catatan:
//   - sektorId disisi dengan "S-" + MY_NODE_ID sebagai placeholder sederhana.
//     Di deployment nyata, sektorId bisa disimpan di konstanta per-device.
//   - Fungsi ini tidak melakukan validasi state MQTT — caller (sampleGas)
//     sudah memastikan mqttClient.connected() sebelum memanggil ini.
//   - encryptAndPublish() (definisi di atas) menangani encrypt + base64 + pub.
//
// Requirements: 2.3, 2.4, 4.2 (via encryptAndPublish)
// ─────────────────────────────────────────────────────────────────────────────
void publishGasTelemetry(int rawValue, bool alert) {

  // ── Build timestamp UTC dari NTP ─────────────────────────────────────────
  // getLocalTime() mengisi struct tm dalam timezone lokal (WIB = UTC+7)
  struct tm ti;
  char tsStr[32] = "1970-01-01T00:00:00Z";  // fallback jika NTP belum sync

  if (getLocalTime(&ti)) {
    // Konversi dari WIB ke UTC: kurangi 7 jam dari epoch lokal
    time_t localEpoch  = mktime(&ti);
    time_t utcEpoch    = localEpoch - (7 * 3600);

    // gmtime_r() konversi epoch UTC ke struct tm UTC (thread-safe)
    struct tm utcTm;
    gmtime_r(&utcEpoch, &utcTm);

    // Format ISO 8601 UTC: "2026-06-05T10:23:45Z"
    strftime(tsStr, sizeof(tsStr), "%Y-%m-%dT%H:%M:%SZ", &utcTm);
  } else {
    Serial.println("[gas-pub] WARN: NTP belum sync — timestamp menggunakan fallback epoch.");
  }

  // ── Susun sektorId sederhana berbasis node ID ─────────────────────────────
  // Format "S-<nodeId>" cocok dengan konvensi yang terlihat di design.md §3.3.
  // Bisa diganti konstanta per-device jika perlu.
  char sektorId[16];
  snprintf(sektorId, sizeof(sektorId), "S-%d", MY_NODE_ID);

  // ── Build JSON payload ────────────────────────────────────────────────────
  // StaticJsonDocument: ukuran 256 byte cukup untuk payload gas telemetri.
  // Field sesuai design.md §3.3 dan Requirements 2.3, 2.6.
  StaticJsonDocument<256> doc;
  doc["event"]     = "gas_telemetry";
  doc["nodeId"]    = MY_NODE_ID;
  doc["sektorId"]  = sektorId;
  doc["raw"]          = rawValue;
  doc["alert"]        = alert;
  doc["gasThreshold"] = GAS_THRESHOLD;  // Req 2.6: include threshold for dashboard context
  doc["timestamp"]    = tsStr;

  Serial.printf("[gas-pub] publish telemetri: raw=%d  alert=%s  ts=%s  topic=%s\n",
                rawValue,
                alert ? "true" : "false",
                tsStr,
                gasTopic.c_str());

  // ── Enkripsi + publish via helper ────────────────────────────────────────
  bool ok = encryptAndPublish(gasTopic.c_str(), doc);

  if (ok) {
    Serial.printf("[gas-pub] OK: telemetri berhasil dikirim ke '%s'\n",
                  gasTopic.c_str());
  } else {
    Serial.printf("[gas-pub] WARN: gagal publish telemetri ke '%s'\n",
                  gasTopic.c_str());
  }
}

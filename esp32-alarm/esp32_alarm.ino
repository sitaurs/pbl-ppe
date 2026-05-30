/*
 * ESP32 APD Violation Alarm
 * 
 * Fungsi: Subscribe MQTT topik "APD_Violation", saat ada pelanggaran
 *          download dan play audio MP3 dari URL via DAC internal.
 * 
 * Hardware:
 *   ESP32 GPIO25 (DAC1) → Kapasitor 100uF (+) → Speaker (+)
 *   ESP32 GND           → Speaker (-)
 *   Kapasitor 100uF (-) → GND
 * 
 *   Nanti kalau PAM8403 sudah ada:
 *   ESP32 GPIO25 (DAC1) → PAM8403 Input L
 *   ESP32 GND           → PAM8403 GND
 *   PAM8403 Output      → Speaker
 * 
 * Library yang dibutuhkan (install via Arduino Library Manager):
 *   - ESP8266Audio (by Earle Philhower) 
 *   - PubSubClient (by Nick O'Leary)
 * 
 * Board: ESP32 Dev Module
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <AudioFileSourceHTTPStream.h>
#include <AudioFileSourceBuffer.h>
#include <AudioGeneratorMP3.h>
#include <AudioOutputI2SNoDAC.h>

// ═══════════════════════════════════════════
// KONFIGURASI — Sesuaikan dengan setup kamu
// ═══════════════════════════════════════════

// WiFi
const char* WIFI_SSID     = "NAMA_WIFI";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";

// MQTT Broker (Lokal — Mosquitto di laptop)
const char* MQTT_HOST     = "192.168.88.11";  // IP laptop di jaringan MikroTik
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "";  // Anonymous, tanpa auth
const char* MQTT_PASS     = "";
const char* MQTT_TOPIC    = "APD_Violation";

// Audio
const char* AUDIO_URL     = "http://157.245.206.36/audio/jokowi.mp3";
int PLAY_COUNT            = 4;  // Berapa kali loop audio saat alarm aktif

// Pin
const int LED_PIN         = 2;  // LED built-in untuk indikator

// ═══════════════════════════════════════════
// GLOBAL OBJECTS
// ═══════════════════════════════════════════

WiFiClient espClient;
PubSubClient mqtt(espClient);

AudioGeneratorMP3 *mp3 = nullptr;
AudioFileSourceHTTPStream *file = nullptr;
AudioFileSourceBuffer *buff = nullptr;
AudioOutputI2SNoDAC *out = nullptr;

volatile bool alarmTriggered = false;
int currentPlayCount = 0;
bool isPlaying = false;
unsigned long lastAlarmTime = 0;
const unsigned long ALARM_COOLDOWN = 5000; // 5 detik cooldown antar alarm

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== ESP32 APD Alarm ===");
  
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Connect WiFi
  connectWiFi();
  
  // Setup MQTT (lokal, tanpa TLS)
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);
  
  connectMQTT();
  
  Serial.println("✓ Ready. Menunggu alarm dari MQTT...");
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════

void loop() {
  // Maintain MQTT connection
  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();
  
  // Handle alarm trigger
  if (alarmTriggered && !isPlaying) {
    unsigned long now = millis();
    if (now - lastAlarmTime > ALARM_COOLDOWN) {
      Serial.println("🚨 ALARM AKTIF — Memulai playback audio");
      currentPlayCount = 0;
      startAudio();
      lastAlarmTime = now;
      alarmTriggered = false;
    } else {
      alarmTriggered = false; // Cooldown belum selesai, skip
    }
  }
  
  // Handle audio playback
  if (isPlaying && mp3) {
    if (mp3->isRunning()) {
      if (!mp3->loop()) {
        // Track selesai
        mp3->stop();
        currentPlayCount++;
        Serial.printf("  Audio selesai (%d/%d)\n", currentPlayCount, PLAY_COUNT);
        
        if (currentPlayCount < PLAY_COUNT) {
          // Play lagi
          delay(500);
          stopAudio();
          startAudio();
        } else {
          // Selesai semua loop
          stopAudio();
          Serial.println("✓ Alarm selesai");
          digitalWrite(LED_PIN, LOW);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
// WIFI
// ═══════════════════════════════════════════

void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✓ WiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n✗ WiFi GAGAL. Restart...");
    ESP.restart();
  }
}

// ═══════════════════════════════════════════
// MQTT
// ═══════════════════════════════════════════

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connecting MQTT...");
    
    String clientId = "esp32_alarm_" + String(random(0xFFFF), HEX);
    
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println(" ✓ Connected");
      mqtt.subscribe(MQTT_TOPIC);
      Serial.printf("  Subscribed: %s\n", MQTT_TOPIC);
    } else {
      Serial.printf(" ✗ Failed (rc=%d). Retry in 3s...\n", mqtt.state());
      delay(3000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("📩 MQTT message on [%s]: %d bytes\n", topic, length);
  
  // Pesan dari backend terenkripsi AES — tapi kita cukup tahu bahwa
  // ada pesan masuk di topik APD_Violation = ada pelanggaran
  // Tidak perlu decrypt di ESP32, cukup trigger alarm
  
  if (String(topic) == MQTT_TOPIC) {
    alarmTriggered = true;
    digitalWrite(LED_PIN, HIGH);
    Serial.println("  → Alarm triggered!");
  }
}

// ═══════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════

void startAudio() {
  stopAudio(); // Clean up dulu
  
  file = new AudioFileSourceHTTPStream(AUDIO_URL);
  buff = new AudioFileSourceBuffer(file, 4096);
  out = new AudioOutputI2SNoDAC(); // Output via internal DAC (GPIO25/26)
  mp3 = new AudioGeneratorMP3();
  
  if (mp3->begin(buff, out)) {
    isPlaying = true;
    Serial.printf("  ▶ Playing audio (loop %d/%d)\n", currentPlayCount + 1, PLAY_COUNT);
  } else {
    Serial.println("  ✗ Gagal memulai audio!");
    stopAudio();
  }
}

void stopAudio() {
  if (mp3) {
    if (mp3->isRunning()) mp3->stop();
    delete mp3; mp3 = nullptr;
  }
  if (buff) { delete buff; buff = nullptr; }
  if (file) { delete file; file = nullptr; }
  if (out) { delete out; out = nullptr; }
  isPlaying = false;
}

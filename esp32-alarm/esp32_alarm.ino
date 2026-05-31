/*
 * ESP32 APD Violation Alarm — HiveMQ Cloud + MP3 via HTTP
 * 
 * Fitur:
 *   - Connect WiFi + MQTT (HiveMQ TLS)
 *   - Subscribe topik "APD_Violation"
 *   - Play MP3 dari URL saat alarm trigger (loop N kali)
 *   - Tombol BOOT (GPIO0) untuk test suara manual
 *   - LED built-in sebagai indikator status:
 *       • Kedip cepat (50ms)  = Connecting WiFi
 *       • Kedip sedang (300ms) = Connecting MQTT
 *       • Nyala solid         = MQTT terhubung, standby
 *       • Kedip 2x cepat      = Menerima alarm / playing audio
 *   - Volume DAC dimaksimalkan
 * 
 * Hardware:
 *   ESP32 GPIO25 (DAC1) → Kapasitor 100uF (+) → Speaker (+)
 *   ESP32 GND           → Kapasitor 100uF (-) → Speaker (-)
 *   
 *   Nanti dengan PAM8403:
 *   ESP32 GPIO25 → PAM8403 IN_L → Speaker
 * 
 * Library (install via Library Manager):
 *   - ESP8266Audio (Earle Philhower)
 *   - PubSubClient (Nick O'Leary)
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "AudioFileSourceHTTPStream.h"
#include "AudioFileSourceBuffer.h"
#include "AudioGeneratorMP3.h"
#include "AudioOutputI2SNoDAC.h"

// ═══════════════════════════════════════════
// KONFIGURASI
// ═══════════════════════════════════════════

// WiFi
const char *WIFI_SSID     = "ss";
const char *WIFI_PASSWORD = "12341234";

// MQTT — HiveMQ Cloud (TLS)
const char *MQTT_HOST     = "f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud";
const uint16_t MQTT_PORT  = 8883;
const char *MQTT_USERNAME = "pblsehat";
const char *MQTT_PASSWORD = "Polinema2026";
const char *MQTT_TOPIC    = "APD_Violation";

// Audio
const char *AUDIO_URL     = "http://157.245.206.36/audio/jokowi.mp3";
int PLAY_COUNT            = 4;   // Loop berapa kali

// Pin
const int LED_PIN         = 2;   // Built-in LED
const int BTN_PIN         = 0;   // BOOT button (GPIO0) — test suara

// ═══════════════════════════════════════════
// STATUS LED
// ═══════════════════════════════════════════
enum SystemState {
  STATE_WIFI_CONNECTING,   // Kedip sangat cepat
  STATE_MQTT_CONNECTING,   // Kedip sedang
  STATE_STANDBY,           // Nyala solid
  STATE_ALARM_ACTIVE       // Kedip 2x cepat
};

SystemState currentState = STATE_WIFI_CONNECTING;
unsigned long ledLastToggle = 0;
bool ledOn = false;
int ledBlinkStep = 0;

// ═══════════════════════════════════════════
// GLOBAL
// ═══════════════════════════════════════════

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

AudioGeneratorMP3 *mp3 = nullptr;
AudioFileSourceHTTPStream *httpFile = nullptr;
AudioFileSourceBuffer *fileBuf = nullptr;
AudioOutputI2SNoDAC *audioOut = nullptr;

volatile bool alarmTriggered = false;
int currentLoop = 0;
bool isPlaying = false;
unsigned long lastAlarmTime = 0;
const unsigned long ALARM_COOLDOWN = 5000;

// Button debounce
bool lastBtnState = HIGH;
unsigned long lastBtnTime = 0;

// ═══════════════════════════════════════════
// LED INDICATOR
// ═══════════════════════════════════════════

void updateLED() {
  unsigned long now = millis();
  
  switch (currentState) {
    case STATE_WIFI_CONNECTING:
      // Kedip sangat cepat — 50ms on/off
      if (now - ledLastToggle > 50) {
        ledOn = !ledOn;
        digitalWrite(LED_PIN, ledOn);
        ledLastToggle = now;
      }
      break;
      
    case STATE_MQTT_CONNECTING:
      // Kedip sedang — 300ms on/off
      if (now - ledLastToggle > 300) {
        ledOn = !ledOn;
        digitalWrite(LED_PIN, ledOn);
        ledLastToggle = now;
      }
      break;
      
    case STATE_STANDBY:
      // Nyala terus
      digitalWrite(LED_PIN, HIGH);
      break;
      
    case STATE_ALARM_ACTIVE:
      // Double blink pattern: ON-OFF-ON-OFF----
      {
        int phase = (now / 100) % 10;
        if (phase == 0 || phase == 2) {
          digitalWrite(LED_PIN, HIGH);
        } else {
          digitalWrite(LED_PIN, LOW);
        }
      }
      break;
  }
}

// ═══════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  Serial.println("\n════════════════════════════");
  Serial.println("  ESP32 APD ALARM v2.0");
  Serial.println("════════════════════════════");
  
  pinMode(LED_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  
  // Connect WiFi
  currentState = STATE_WIFI_CONNECTING;
  connectWiFi();
  
  // MQTT setup — HiveMQ Cloud requires TLS
  espClient.setInsecure(); // Skip cert validation (simpel, cukup untuk PBL)
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(1024);
  
  // Connect MQTT
  currentState = STATE_MQTT_CONNECTING;
  connectMQTT();
  
  currentState = STATE_STANDBY;
  Serial.println("\n✓ READY — Menunggu alarm...");
  Serial.println("  Tekan tombol BOOT untuk test suara\n");
}

// ═══════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════

void loop() {
  // LED indicator update
  updateLED();
  
  // MQTT keep-alive
  if (!mqttClient.connected()) {
    currentState = STATE_MQTT_CONNECTING;
    connectMQTT();
    currentState = STATE_STANDBY;
  }
  mqttClient.loop();
  
  // Check BOOT button — test suara
  checkButton();
  
  // Handle alarm
  if (alarmTriggered && !isPlaying) {
    unsigned long now = millis();
    if (now - lastAlarmTime > ALARM_COOLDOWN) {
      Serial.println("🚨 ALARM AKTIF!");
      currentState = STATE_ALARM_ACTIVE;
      currentLoop = 0;
      startAudio();
      lastAlarmTime = now;
      alarmTriggered = false;
    } else {
      alarmTriggered = false;
    }
  }
  
  // Audio playback loop
  if (isPlaying && mp3) {
    if (mp3->isRunning()) {
      if (!mp3->loop()) {
        mp3->stop();
        currentLoop++;
        Serial.printf("  Audio loop %d/%d selesai\n", currentLoop, PLAY_COUNT);
        
        if (currentLoop < PLAY_COUNT) {
          delay(300);
          stopAudio();
          startAudio();
        } else {
          stopAudio();
          currentState = STATE_STANDBY;
          Serial.println("✓ Alarm selesai\n");
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
// BUTTON — Test suara
// ═══════════════════════════════════════════

void checkButton() {
  bool btnState = digitalRead(BTN_PIN);
  
  if (btnState == LOW && lastBtnState == HIGH && (millis() - lastBtnTime > 300)) {
    lastBtnTime = millis();
    Serial.println("🔘 Tombol ditekan — Test suara!");
    
    if (!isPlaying) {
      currentState = STATE_ALARM_ACTIVE;
      currentLoop = 0;
      // Test: play 1 kali saja
      int savedCount = PLAY_COUNT;
      PLAY_COUNT = 1;
      startAudio();
      PLAY_COUNT = savedCount;
    }
  }
  
  lastBtnState = btnState;
}

// ═══════════════════════════════════════════
// WIFI
// ═══════════════════════════════════════════

void connectWiFi() {
  Serial.printf("WiFi: Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(250);
    Serial.print(".");
    updateLED();
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✓ WiFi OK — IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Gateway: %s\n", WiFi.gatewayIP().toString().c_str());
    Serial.printf("  DNS: %s\n", WiFi.dnsIP().toString().c_str());
  } else {
    Serial.println("\n✗ WiFi GAGAL! Restart in 5s...");
    delay(5000);
    ESP.restart();
  }
}

// ═══════════════════════════════════════════
// MQTT
// ═══════════════════════════════════════════

void connectMQTT() {
  int retry = 0;
  while (!mqttClient.connected() && retry < 5) {
    Serial.printf("MQTT: Connecting to %s:%d...", MQTT_HOST, MQTT_PORT);
    updateLED();
    
    String clientId = "esp32_alarm_" + String(random(0xFFFF), HEX);
    
    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println(" ✓ Connected!");
      mqttClient.subscribe(MQTT_TOPIC, 1);
      Serial.printf("  Subscribed: %s\n", MQTT_TOPIC);
      return;
    } else {
      Serial.printf(" ✗ Failed (rc=%d)\n", mqttClient.state());
      retry++;
      delay(3000);
    }
  }
  
  if (!mqttClient.connected()) {
    Serial.println("MQTT: Gagal setelah 5 percobaan. Restart...");
    delay(5000);
    ESP.restart();
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("📩 MQTT [%s] — %d bytes\n", topic, length);
  
  if (String(topic) == MQTT_TOPIC) {
    alarmTriggered = true;
    Serial.println("  → Alarm triggered dari server!");
  }
}

// ═══════════════════════════════════════════
// AUDIO — Volume MAX
// ═══════════════════════════════════════════

void startAudio() {
  stopAudio();
  
  Serial.printf("  Downloading: %s\n", AUDIO_URL);
  
  httpFile = new AudioFileSourceHTTPStream(AUDIO_URL);
  if (!httpFile) {
    Serial.println("  ✗ Gagal buat HTTP stream!");
    return;
  }
  
  fileBuf = new AudioFileSourceBuffer(httpFile, 4096);
  audioOut = new AudioOutputI2SNoDAC();
  audioOut->SetGain(4.0);
  mp3 = new AudioGeneratorMP3();
  
  if (mp3->begin(fileBuf, audioOut)) {
    isPlaying = true;
    Serial.printf("  ▶ Playing (loop %d/%d)\n", currentLoop + 1, PLAY_COUNT);
  } else {
    Serial.println("  ✗ Gagal play! Cek: internet aktif? URL valid?");
    stopAudio();
  }
}

void stopAudio() {
  if (mp3) {
    if (mp3->isRunning()) mp3->stop();
    delete mp3; mp3 = nullptr;
  }
  if (fileBuf) { delete fileBuf; fileBuf = nullptr; }
  if (httpFile) { delete httpFile; httpFile = nullptr; }
  if (audioOut) { delete audioOut; audioOut = nullptr; }
  isPlaying = false;
}

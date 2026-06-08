# Infrastructure Configs

Konfigurasi service eksternal yang dipakai project.

## Isi

| File | Fungsi |
|---|---|
| `mosquitto_local.conf` | Config Mosquitto MQTT broker untuk development lokal (kalau tidak pakai HiveMQ Cloud). |

## Mosquitto Local (Optional)

Default project memakai HiveMQ Cloud (TLS, port 8883). Untuk development tanpa internet, bisa pakai Mosquitto lokal:

```bash
# Install Mosquitto
choco install mosquitto       # Windows
sudo apt install mosquitto    # Linux

# Run dengan config
mosquitto -c infra/mosquitto_local.conf -v
```

Lalu update `.env`:

```ini
MQTT_HOSTNAME=127.0.0.1
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

⚠️ Mode lokal tanpa TLS — **hanya untuk development**. Production wajib pakai broker dengan TLS (HiveMQ Cloud).

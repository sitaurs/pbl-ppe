"""
trigger_alarm.py - Trigger alarm ke ESP32 via MQTT (TLS + AES-128-CBC).

Mengirim payload terenkripsi AES-128-CBC dengan random IV per pesan ke topik
`apd/alarm/<NODE_ID>`. Firmware ESP32 akan decrypt, validate, lalu eksekusi
event yang dikirim.

Usage:
    python trigger_alarm.py                # APD violation (helm + rompi)
    python trigger_alarm.py --test         # APD test (1 putaran alarm saja)
    python trigger_alarm.py --gas          # Gas threshold breach (LED merah + alarm gas)
    python trigger_alarm.py --all          # APD + GAS berurutan (untuk demo)
    python trigger_alarm.py --stop         # Hentikan alarm yang sedang berbunyi
    python trigger_alarm.py --help         # Tampilkan bantuan ini

Format payload yang dikirim (sebelum di-encrypt):
    {
      "event"     : "apd_violation" | "apd_test" | "gas_test" | "apd_stop",
      "nodeId"    : 1,
      "sektorId"  : "A1",
      "violations": ["no_helmet", "no_vest"],   # hanya untuk APD events
      "timestamp" : "2026-06-07T14:30:00Z"
    }

Format ciphertext: base64(IV[16] || ciphertext_PKCS7).
"""
import base64
import json
import os
import ssl
import sys
import time
from datetime import datetime, timezone

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import paho.mqtt.client as mqtt

# ── Config (sinkronkan dengan .env dan firmware ESP32) ──────────────────────
MQTT_HOST = "f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "pblsehat"
MQTT_PASS = "Polinema2026"
AES_KEY   = bytes.fromhex("5ac913a003ce4c948c2138435d2d86d7")

NODE_ID  = 1
SEKTOR   = "A1"
TOPIC    = f"apd/alarm/{NODE_ID}"

# ── Mapping event → label & payload extras ──────────────────────────────────
EVENTS = {
    "apd_violation": {
        "label"     : "APD VIOLATION (helm + rompi tidak dipakai)",
        "violations": ["no_helmet", "no_vest"],
    },
    "apd_test": {
        "label"     : "APD TEST (1 putaran alarm)",
        "violations": ["no_helmet"],
    },
    "gas_test": {
        "label"     : "GAS ALARM (simulasi gas melebihi threshold)",
        "violations": [],
    },
    "apd_stop": {
        "label"     : "STOP (hentikan alarm yang sedang aktif)",
        "violations": [],
    },
}


def encrypt_payload(payload_dict: dict) -> str:
    """AES-128-CBC dengan random IV per pesan; output base64(IV || ciphertext)."""
    plaintext = json.dumps(payload_dict, separators=(",", ":")).encode("utf-8")
    iv = os.urandom(16)
    cipher = AES.new(AES_KEY, AES.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(plaintext, 16))
    return base64.b64encode(iv + ciphertext).decode("utf-8")


def build_payload(event: str) -> dict:
    """Susun payload sesuai jenis event."""
    spec = EVENTS.get(event)
    if not spec:
        raise ValueError(f"Event tidak dikenal: {event}")

    payload = {
        "event"     : event,
        "nodeId"    : NODE_ID,
        "sektorId"  : SEKTOR,
        "violations": spec["violations"],
        "timestamp" : datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    return payload


def send_alarm(event: str = "apd_violation") -> int:
    """Kirim event terenkripsi ke ESP32 via MQTT TLS. Return 0 kalau sukses."""
    spec = EVENTS.get(event)
    if not spec:
        print(f"[error] event '{event}' tidak dikenal. Pilihan: {', '.join(EVENTS)}")
        return 2

    payload = build_payload(event)
    encrypted = encrypt_payload(payload)

    print(f"[trigger] Event   : {event}  ({spec['label']})")
    print(f"[trigger] Topic   : {TOPIC}")
    print(f"[trigger] Payload : {json.dumps(payload, separators=(',', ':'))}")
    print(f"[trigger] Cipher  : {encrypted[:48]}...  ({len(encrypted)} chars base64)")

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"trigger-{int(time.time())}",
    )
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.tls_set(tls_version=ssl.PROTOCOL_TLSv1_2)
    client.tls_insecure_set(True)

    print(f"[mqtt] Connecting to {MQTT_HOST}:{MQTT_PORT} (TLS)...")
    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
    except Exception as e:
        print(f"[mqtt] Connect failed: {e}")
        return 1

    client.loop_start()
    time.sleep(2)  # wait for handshake + auth

    result = client.publish(TOPIC, encrypted, qos=1)
    try:
        result.wait_for_publish(timeout=5)
        print(f"[mqtt] Published to {TOPIC} OK")
        rc = 0
    except Exception as e:
        print(f"[mqtt] Publish failed: {e}")
        rc = 1

    client.loop_stop()
    client.disconnect()
    print("[mqtt] Done.")
    return rc


def print_help() -> None:
    print(__doc__)


def main() -> int:
    args = sys.argv[1:]

    if "--help" in args or "-h" in args:
        print_help()
        return 0

    if "--stop" in args:
        return send_alarm("apd_stop")
    if "--test" in args:
        return send_alarm("apd_test")
    if "--gas" in args:
        return send_alarm("gas_test")
    if "--all" in args:
        # Demo dua jenis alarm berurutan: APD test (1 putaran) lalu GAS.
        # Tunggu jeda agar audio APD selesai sebelum gas alarm dipicu.
        print("=" * 60)
        print("  STAGE 1 of 2 — APD ALARM")
        print("=" * 60)
        rc1 = send_alarm("apd_test")
        if rc1 != 0:
            return rc1
        wait_sec = 12
        print()
        print(f"[wait] Tunggu {wait_sec} detik agar audio APD selesai...")
        time.sleep(wait_sec)
        print()
        print("=" * 60)
        print("  STAGE 2 of 2 — GAS ALARM")
        print("=" * 60)
        return send_alarm("gas_test")
    return send_alarm("apd_violation")


if __name__ == "__main__":
    sys.exit(main())

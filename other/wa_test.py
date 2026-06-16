"""Tes koneksi GoWA: kirim 1 pesan teks ke nomor tujuan.
Pakai config dari .env (lewat config.py). Tidak mencetak password."""
import sys, requests
sys.path.insert(0, "..")
import config

TARGET = "6281358959349"  # 081358959349 -> format internasional

url = (config.WA_API_URL or "").strip()
print(f"[cfg] WA_API_URL  = {url or '<kosong>'}")
print(f"[cfg] WA_DEVICE_ID= {config.WA_DEVICE_ID or '<kosong>'}")
print(f"[cfg] WA_API_USER = {config.WA_API_USER or '<kosong>'}")
print(f"[cfg] WA_API_PASS = {'<terisi>' if config.WA_API_PASS else '<kosong>'}")
print(f"[cfg] tujuan      = {TARGET}\n")

if not (url and config.WA_DEVICE_ID and config.WA_API_USER and config.WA_API_PASS):
    print("[hasil] ❌ Config GoWA belum lengkap di .env — tidak bisa tes.")
    sys.exit(1)

phone_jid = f"{TARGET}@s.whatsapp.net"
payload = {"phone": phone_jid, "message": "Tes koneksi GoWA dari SafeGuard APD. Jika pesan ini masuk, gateway WA berfungsi."}
headers = {"X-Device-Id": config.WA_DEVICE_ID, "Content-Type": "application/json"}
auth = (config.WA_API_USER, config.WA_API_PASS)

print(f"[req] POST {url}/send/message ...")
try:
    resp = requests.post(f"{url}/send/message", auth=auth, headers=headers, json=payload, timeout=15)
    print(f"[resp] HTTP {resp.status_code}")
    print(f"[resp] body: {resp.text[:500]}")
    if resp.status_code == 200:
        print("\n[hasil] ✅ GoWA OK — pesan terkirim (cek HP tujuan).")
    else:
        print("\n[hasil] ⚠️  GoWA reachable tapi gagal kirim. Lihat body di atas (auth/device/nomor?).")
except requests.exceptions.ConnectTimeout:
    print("\n[hasil] ❌ Timeout konek ke GoWA — server VPS mati / tidak reachable / firewall.")
except Exception as e:
    print(f"\n[hasil] ❌ Error: {type(e).__name__}: {e}")

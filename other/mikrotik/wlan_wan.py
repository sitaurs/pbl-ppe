"""
Arahkan WAN-WiFi (wlan1 mode station) ke jaringan WiFi di lokasi sekarang.
Berguna saat pindah-pindah lokasi uji: SSID/password upstream tinggal diganti
lewat satu perintah, tanpa buka Winbox.

Usage:
    python wlan_wan.py "<SSID>" "<PASSWORD>"
    python wlan_wan.py "<SSID>"               # untuk WiFi tanpa password (open)
    python wlan_wan.py --scan                 # scan WiFi di sekitar dulu
    python wlan_wan.py --status               # lihat status koneksi WAN-WiFi

Setelah dijalankan, wlan1 akan reconnect ke SSID baru dan ambil IP via DHCP.
"""
import sys
from librouteros import connect

HOST, USER, PASS, PORT = "192.168.88.1", "admin", "1234", 8728
SEC_PROFILE = "wan-sec"   # security profile khusus untuk WAN-WiFi


def get_api():
    return connect(username=USER, password=PASS, host=HOST, port=PORT)


def do_scan(api):
    print("[scan] memindai WiFi di sekitar (durasi ~5 detik)...")
    try:
        res = api("/interface/wireless/scan", **{".id": "wlan1", "duration": "5"})
        for r in res:
            print(f"  {r.get('ssid','<hidden>'):<28} ch={r.get('channel','')}  signal={r.get('signal-strength','')}")
    except Exception as e:
        print(f"[scan] gagal: {e}  (coba lewat Winbox: Wireless > Scan)")


def _ping(api, target, count=3):
    """Ping dari sisi router. Return (received, jitter_ms_avg) atau (0, None)."""
    received = 0
    try:
        for r in api("/ping", address=target, count=str(count)):
            # field 'received' berisi akumulasi; ambil nilai terakhir
            if "received" in r:
                received = int(r["received"])
    except Exception:
        pass
    return received


def do_status(api):
    ssid = running = None
    for w in api.path("interface", "wireless"):
        if w.get("name") == "wlan1":
            ssid, running = w.get("ssid"), w.get("running")
            print(f"wlan1 : ssid={ssid}  mode={w.get('mode')}  disabled={w.get('disabled')}  running={running}")
    dhcp_ok = False
    for c in api.path("ip", "dhcp-client"):
        if c.get("interface") == "wlan1":
            dhcp_ok = (c.get("status") == "bound")
            print(f"dhcp  : status={c.get('status')}  address={c.get('address')}  gateway={c.get('gateway')}")

    print("\n--- cek internet (ping dari router) ---")
    if not running or not dhcp_ok:
        print("HASIL : ❌ wlan1 belum siap (belum connect / belum dapat IP). Internet tidak dites.")
        return

    ip_ok  = _ping(api, "8.8.8.8") > 0          # jalur keluar ke internet
    dns_ok = _ping(api, "google.com") > 0       # resolusi DNS

    print(f"ping 8.8.8.8    : {'OK' if ip_ok else 'GAGAL'}   (jalur internet)")
    print(f"ping google.com : {'OK' if dns_ok else 'GAGAL'}  (DNS)")

    print("\nHASIL :", end=" ")
    if ip_ok and dns_ok:
        print("✅ TERHUBUNG INTERNET — DNS jalan, siap dipakai.")
    elif ip_ok and not dns_ok:
        print("⚠️  Internet jalan TAPI DNS bermasalah. Cek setting DNS router.")
    else:
        print("❌ DAPAT IP tapi TIDAK ada internet. "
              "Kemungkinan WiFi-nya butuh login portal, kuota habis, atau memang tanpa internet.")


def set_wifi(api, ssid, password):
    # 1) update / buat security profile
    profiles = list(api.path("interface", "wireless", "security-profiles"))
    pid = next((p[".id"] for p in profiles if p.get("name") == SEC_PROFILE), None)
    if password:
        attrs = {"name": SEC_PROFILE, "mode": "dynamic-keys",
                 "authentication-types": "wpa2-psk",
                 "wpa2-pre-shared-key": password}
    else:
        attrs = {"name": SEC_PROFILE, "mode": "none"}
    sp = api.path("interface", "wireless", "security-profiles")
    if pid:
        sp.update(**{**attrs, ".id": pid})
    else:
        sp.add(**attrs)

    # 2) arahkan wlan1 ke SSID + profile, aktifkan
    wl = api.path("interface", "wireless")
    wid = next(w[".id"] for w in wl if w.get("name") == "wlan1")
    wl.update(**{".id": wid, "ssid": ssid, "mode": "station",
                 "security-profile": SEC_PROFILE, "disabled": False})
    print(f"[ok] wlan1 diarahkan ke SSID '{ssid}'. Tunggu ~10 detik untuk konek + dapat IP.")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__); return 0
    api = get_api()
    try:
        if args[0] == "--scan":
            do_scan(api)
        elif args[0] == "--status":
            do_status(api)
        else:
            ssid = args[0]
            password = args[1] if len(args) > 1 else ""
            set_wifi(api, ssid, password)
    finally:
        api.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

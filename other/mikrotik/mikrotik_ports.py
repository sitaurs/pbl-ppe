"""READ-ONLY: petakan MAC -> port fisik (bridge host) + ARP, untuk tahu
perangkat mana nyolok di port mana. Tidak mengubah apa pun."""
from librouteros import connect

HOST, USER, PASS, PORT = "192.168.88.1", "admin", "1234", 8728
api = connect(username=USER, password=PASS, host=HOST, port=PORT)

print("=== BRIDGE HOST (MAC -> port) ===")
for h in api.path("interface", "bridge", "host"):
    if not h.get("local"):
        print(f"  mac={h.get('mac-address')}  on-iface={h.get('on-interface')}  bridge={h.get('bridge')}")

print("\n=== ARP (IP <-> MAC <-> iface) ===")
for a in api.path("ip", "arp"):
    print(f"  ip={a.get('address'):<16} mac={a.get('mac-address')}  iface={a.get('interface')}")

print("\n=== WIRELESS REGISTRATION (klien wifi yg terkoneksi ke wlan1) ===")
try:
    regs = list(api.path("interface", "wireless", "registration-table"))
    if not regs:
        print("  (kosong - wlan1 tidak melayani klien / OFF)")
    for r in regs:
        print(f"  mac={r.get('mac-address')}  iface={r.get('interface')}  signal={r.get('signal-strength')}")
except Exception as e:
    print(f"  (n/a: {e})")

api.close()

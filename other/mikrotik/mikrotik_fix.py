"""Perbaiki: enable DHCP client WAN + aktifkan NTP + set identity (generator dikonsumsi)."""
from librouteros import connect

HOST, USER, PASS, PORT = "192.168.88.1", "admin", "1234", 8728
api = connect(username=USER, password=PASS, host=HOST, port=PORT)

# 1. Enable dhcp-client wlan1 & ether1
dc = api.path("ip", "dhcp-client")
for d in list(dc):
    if d.get("interface") in ("wlan1", "ether1"):
        dc.update(**{".id": d[".id"], "disabled": False})
        print(f"[dhcp] enabled dhcp-client {d.get('interface')}")

# 2. NTP client ON (generator HARUS dikonsumsi -> tuple())
tuple(api("/system/ntp/client/set", enabled="yes", **{"server-dns-names": "pool.ntp.org"}))
print("[ntp] enabled + server pool.ntp.org")

# 3. Identity
tuple(api("/system/identity/set", name="PBL-Router"))
print("[identity] set -> PBL-Router")

# Verifikasi singkat
print("\n--- verifikasi ---")
for c in api.path("ip", "dhcp-client"):
    print(f"dhcp-client {c.get('interface'):<7} disabled={c.get('disabled')} status={c.get('status')}")
for n in api.path("system", "ntp", "client"):
    print(f"ntp enabled={n.get('enabled')} servers={n.get('server-dns-names')}")
for i in api.path("system", "identity"):
    print(f"identity={i.get('name')}")

api.close()

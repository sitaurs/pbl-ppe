"""
Dump konfigurasi MikroTik secara READ-ONLY via RouterOS API (port 8728).
Tidak mengubah apa pun. Membaca semua section penting dan mencetaknya rapi.
"""
import sys
from librouteros import connect

HOST, USER, PASS, PORT = "192.168.88.1", "admin", "1234", 8728

# (judul, path tuple, daftar field yang ditampilkan; [] = semua field)
SECTIONS = [
    ("SYSTEM IDENTITY",        ("system", "identity"), []),
    ("SYSTEM RESOURCE",        ("system", "resource"), []),
    ("SYSTEM ROUTERBOARD",     ("system", "routerboard"), []),
    ("SYSTEM CLOCK",           ("system", "clock"), []),
    ("SYSTEM NTP CLIENT",      ("system", "ntp", "client"), []),
    ("USERS",                  ("user",), ["name", "group", "last-logged-in", "disabled"]),
    ("USER ACTIVE (sesi)",     ("user", "active"), ["name", "address", "via", "when"]),
    ("INTERFACES",             ("interface",), ["name", "type", "running", "disabled", "mac-address"]),
    ("INTERFACE ETHERNET",     ("interface", "ethernet"), ["name", "speed", "running"]),
    ("WIRELESS (wlan)",        ("interface", "wireless"), ["name", "ssid", "band", "frequency", "disabled"]),
    ("BRIDGE",                 ("interface", "bridge"), ["name", "protocol-mode"]),
    ("BRIDGE PORTS",           ("interface", "bridge", "port"), ["interface", "bridge", "pvid"]),
    ("IP ADDRESS",             ("ip", "address"), ["address", "network", "interface", "disabled"]),
    ("IP DHCP-CLIENT",         ("ip", "dhcp-client"), ["interface", "address", "status", "disabled"]),
    ("IP DHCP-SERVER",         ("ip", "dhcp-server"), ["name", "interface", "address-pool", "disabled"]),
    ("DHCP-SERVER NETWORK",    ("ip", "dhcp-server", "network"), ["address", "gateway", "dns-server"]),
    ("DHCP LEASES",            ("ip", "dhcp-server", "lease"), ["address", "mac-address", "host-name", "status"]),
    ("IP POOL",                ("ip", "pool"), ["name", "ranges"]),
    ("IP ROUTE",               ("ip", "route"), ["dst-address", "gateway", "distance", "active"]),
    ("IP DNS",                 ("ip", "dns"), ["servers", "dynamic-servers", "allow-remote-requests"]),
    ("FIREWALL FILTER",        ("ip", "firewall", "filter"), ["chain", "action", "src-address", "dst-address", "protocol", "disabled", "comment"]),
    ("FIREWALL NAT",           ("ip", "firewall", "nat"), ["chain", "action", "src-address", "out-interface", "to-addresses", "disabled", "comment"]),
    ("FIREWALL ADDRESS-LIST",  ("ip", "firewall", "address-list"), ["list", "address", "disabled"]),
    ("IP SERVICE (akses)",     ("ip", "service"), ["name", "port", "disabled", "address"]),
    ("DNS STATIC",             ("ip", "dns", "static"), ["name", "address", "disabled"]),
]


def fmt(v):
    return "" if v is None else str(v)


def main() -> int:
    try:
        api = connect(username=USER, password=PASS, host=HOST, port=PORT)
    except Exception as e:
        print(f"[login] GAGAL: {type(e).__name__}: {e}")
        return 1
    print(f"[login] OK — {HOST}:{PORT}\n")

    for title, path, fields in SECTIONS:
        print("=" * 70)
        print(title)
        print("=" * 70)
        try:
            rows = list(api.path(*path))
        except Exception as e:
            print(f"  (tidak tersedia: {type(e).__name__}: {e})\n")
            continue
        if not rows:
            print("  (kosong)\n")
            continue
        for idx, row in enumerate(rows):
            keys = fields if fields else list(row.keys())
            parts = []
            for k in keys:
                if k in row:
                    parts.append(f"{k}={fmt(row[k])}")
            print(f"  [{idx}] " + "  ".join(parts))
        print()

    api.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

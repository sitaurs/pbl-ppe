"""
Apply perubahan topologi MikroTik via RouterOS API (port 8728).

Target:
  WAN  : wlan1 (WiFi station, prioritas 1) + ether1 (kabel, prioritas 2)  -> DHCP client
  LAN  : bridge1 (ether2/3/4), tetap 192.168.88.1/24, DHCP server tetap
  NAT  : masquerade ke out-interface-list=WAN
  FW   : baseline firewall (accept LAN+established DULU, baru drop)
  Lain : NTP on, identity=PBL-Router, telnet/ftp off, api dibatasi ke LAN

CATATAN KESELAMATAN:
  - Session API ini dari 192.168.88.11 (ether2/LAN). Skrip MENJAGA:
      * 192.168.88.1/24 tetap di bridge1
      * ether2/3/4 tetap di bridge1
      * service api TIDAK dimatikan (hanya dibatasi ke 192.168.88.0/24)
      * rule firewall accept LAN + established ditambBAH SEBELUM rule drop
  - Backup 'pre-topology.backup' sudah dibuat. Rollback:
      /system backup load name=pre-topology
"""
from librouteros import connect

HOST, USER, PASS, PORT = "192.168.88.1", "admin", "1234", 8728


def ids_where(path_obj, **match):
    out = []
    for row in path_obj:
        if all(str(row.get(k, "")) == str(v) or (isinstance(v, str) and v in str(row.get(k, ""))) for k, v in match.items()):
            out.append(row[".id"])
    return out


def step(n, msg):
    print(f"\n[{n}] {msg}")


def main():
    api = connect(username=USER, password=PASS, host=HOST, port=PORT)
    print("[login] OK\n" + "=" * 60)

    # ── 1. Interface list WAN/LAN + member ───────────────────────────────────
    step(1, "Interface list WAN/LAN + member")
    ilist = api.path("interface", "list")
    existing = {r["name"]: r[".id"] for r in ilist}
    for nm in ("WAN", "LAN"):
        if nm not in existing:
            ilist.add(name=nm)
            print(f"   + list {nm}")
    member = api.path("interface", "list", "member")
    cur_members = [(m.get("list"), m.get("interface")) for m in member]
    for lst, iface in (("LAN", "bridge1"), ("WAN", "wlan1"), ("WAN", "ether1")):
        if (lst, iface) not in cur_members:
            member.add(list=lst, interface=iface)
            print(f"   + {iface} -> {lst}")

    # ── 2. Firewall ACCEPT rules DULU (lindungi session) ─────────────────────
    step(2, "Firewall ACCEPT (established + LAN) -- ditambah sebelum DROP")
    fw = api.path("ip", "firewall", "filter")
    existing_comments = [r.get("comment", "") for r in fw]

    def add_fw(**kw):
        if kw.get("comment") in existing_comments:
            print(f"   = sudah ada: {kw.get('comment')}")
            return
        fw.add(**kw)
        print(f"   + {kw.get('comment')}")

    add_fw(chain="input", **{"connection-state": "established,related"}, action="accept", comment="in-est-rel")
    add_fw(chain="input", **{"in-interface": "bridge1"}, action="accept", comment="in-lan-accept")
    add_fw(chain="forward", **{"connection-state": "established,related"}, action="accept", comment="fwd-est-rel")
    add_fw(chain="forward", **{"connection-state": "invalid"}, action="drop", comment="fwd-invalid")
    add_fw(chain="forward", **{"in-interface": "bridge1"}, action="accept", comment="fwd-lan-out")

    # ── 3. wlan1 -> station mode ─────────────────────────────────────────────
    step(3, "wlan1 -> mode station")
    wl = api.path("interface", "wireless")
    wid = next(w[".id"] for w in wl if w.get("name") == "wlan1")
    wl.update(**{".id": wid, "mode": "station"})
    print("   wlan1 mode=station (SSID diisi lewat wlan_wan.py)")

    # ── 4. Lepas wlan1 dari bridge ───────────────────────────────────────────
    step(4, "Lepas wlan1 dari bridge1")
    bport = api.path("interface", "bridge", "port")
    rem = ids_where(bport, interface="wlan1")
    if rem:
        bport.remove(*rem)
        print(f"   - bridge port wlan1 dihapus ({len(rem)})")
    else:
        print("   = wlan1 sudah tidak di bridge")

    # ── 5. DHCP client di WAN ────────────────────────────────────────────────
    step(5, "DHCP client WAN (wlan1 dist=1, ether1 dist=2)")
    dc = api.path("ip", "dhcp-client")
    dc_ifaces = [d.get("interface") for d in dc]
    if "wlan1" not in dc_ifaces:
        dc.add(interface="wlan1", **{"add-default-route": "yes", "default-route-distance": "1", "use-peer-dns": "yes"})
        print("   + dhcp-client wlan1")
    if "ether1" not in dc_ifaces:
        dc.add(interface="ether1", **{"add-default-route": "yes", "default-route-distance": "2", "use-peer-dns": "yes"})
        print("   + dhcp-client ether1")

    # ── 6. NAT masquerade -> out-interface-list=WAN ──────────────────────────
    step(6, "NAT masquerade ke list WAN")
    nat = api.path("ip", "firewall", "nat")
    old = [r[".id"] for r in nat]
    if old:
        nat.remove(*old)
        print(f"   - {len(old)} rule NAT lama dihapus")
    nat.add(chain="srcnat", **{"out-interface-list": "WAN"}, action="masquerade", comment="wan-masquerade")
    print("   + srcnat masquerade out-interface-list=WAN")

    # ── 7. Bersihkan sisa uplink lama (192.168.137.x) ────────────────────────
    step(7, "Hapus address 192.168.137.x + default route lama")
    addr = api.path("ip", "address")
    rem_addr = ids_where(addr, address="192.168.137")
    if rem_addr:
        addr.remove(*rem_addr)
        print(f"   - {len(rem_addr)} address 192.168.137.x dihapus")
    route = api.path("ip", "route")
    rem_rt = [r[".id"] for r in route
              if str(r.get("dst-address")) == "0.0.0.0/0" and "192.168.137.1" in str(r.get("gateway", ""))]
    if rem_rt:
        route.remove(*rem_rt)
        print(f"   - {len(rem_rt)} default route lama dihapus")

    # ── 8. Firewall DROP rules (terakhir) ────────────────────────────────────
    step(8, "Firewall DROP (input drop + drop WAN->LAN)")
    add_fw(chain="input", **{"in-interface-list": "WAN"}, action="drop", comment="in-wan-drop")
    add_fw(chain="forward", **{"in-interface-list": "WAN", "connection-state": "new"}, action="drop", comment="fwd-wan-drop")

    # ── 9. Hardening ringan + jam ────────────────────────────────────────────
    step(9, "NTP on, identity, telnet/ftp off, api dibatasi ke LAN")
    api("/system/ntp/client/set", enabled="yes", **{"server-dns-names": "pool.ntp.org"})
    api("/system/identity/set", name="PBL-Router")
    svc = api.path("ip", "service")
    for s in svc:
        nm = s.get("name")
        if nm in ("telnet", "ftp"):
            svc.update(**{".id": s[".id"], "disabled": True})
            print(f"   disabled service {nm}")
        if nm == "api":
            svc.update(**{".id": s[".id"], "address": "192.168.88.0/24"})
            print("   api dibatasi ke 192.168.88.0/24")

    print("\n" + "=" * 60 + "\n[done] Struktur topologi diterapkan.")
    print("Langkah berikut: python wlan_wan.py \"<SSID>\" \"<password>\"  untuk konek internet.")
    api.close()


if __name__ == "__main__":
    main()

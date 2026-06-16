# Skrip MikroTik (hAP lite — PBL-Router)

Kumpulan skrip Python untuk mengelola router MikroTik hAP lite via RouterOS API
(port 8728, `librouteros`). Target: `192.168.88.1`, user `admin`.

> Install dependency sekali: `pip install librouteros`
> Jalankan dari folder ini, mis: `python wlan_wan.py --status`

## Operasional (sering dipakai)

| Skrip | Fungsi |
|---|---|
| `wlan_wan.py` | **Pilih WiFi sumber internet** (wlan1 station). Untuk pindah-pindah lokasi. |

```powershell
python wlan_wan.py --scan                 # lihat WiFi di sekitar
python wlan_wan.py "SSID" "password"      # konek ke WiFi (kutip jika ada spasi)
python wlan_wan.py "SSID"                 # WiFi tanpa password (open)
python wlan_wan.py --status               # cek IP + tes internet (ping 8.8.8.8 & DNS)
```

## Diagnostik (read-only, aman)

| Skrip | Fungsi |
|---|---|
| `mikrotik_probe.py` | Cek koneksi + identitas + interface ringkas |
| `mikrotik_audit.py` | Dump konfigurasi lengkap (semua section) |
| `mikrotik_ports.py` | Peta MAC → port fisik (bridge host) + ARP |
| `mikrotik_backup.py` | Buat backup biner + daftar file di router |
| `mikrotik_dump.txt` | Hasil dump audit (output, bukan skrip) |

## Perubahan konfigurasi (one-time, sudah dijalankan)

| Skrip | Fungsi |
|---|---|
| `mikrotik_apply_topology.py` | Setup topologi: WAN=wlan1+ether1, LAN=ether2/3/4, NAT, firewall, hardening |
| `mikrotik_fix.py` | Perbaikan: enable DHCP client WAN + NTP + identity |

## Topologi saat ini

```
WAN : wlan1 (WiFi station, prioritas 1) + ether1 (kabel, prioritas 2)  -> DHCP client
LAN : bridge1 (ether2/3/4)  192.168.88.1/24, DHCP server 88.10-254
NAT : masquerade ke out-interface-list=WAN
```

## Rollback

Backup `pre-topology.backup` tersimpan di router. Untuk kembali ke konfigurasi
sebelum perubahan topologi (lewat Winbox/terminal RouterOS):

```
/system backup load name=pre-topology
```

"""Buat backup biner + export teks konfigurasi MikroTik (aman, tidak mengubah config)."""
from librouteros import connect

HOST, USER, PASS, PORT = "192.168.88.1", "admin", "1234", 8728
api = connect(username=USER, password=PASS, host=HOST, port=PORT)

try:
    print("[backup] membuat backup biner 'pre-topology'...")
    list(api("/system/backup/save", name="pre-topology"))
    print("[backup] OK -> file 'pre-topology.backup' tersimpan di router (Files)")
except Exception as e:
    print(f"[backup] gagal: {e}")

print("\n[files] daftar file di router:")
for f in api.path("file"):
    print(f"  {f.get('name'):<28} size={f.get('size')}  type={f.get('type')}")

api.close()

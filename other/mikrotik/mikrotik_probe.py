"""Quick connectivity + identity probe untuk MikroTik via RouterOS API (port 8728)."""
import sys
from librouteros import connect

HOST = "192.168.88.1"
USER = "admin"
PASS = "1234"
PORT = 8728


def main() -> int:
    try:
        api = connect(username=USER, password=PASS, host=HOST, port=PORT)
    except Exception as e:
        print(f"[login] GAGAL: {type(e).__name__}: {e}")
        return 1

    print("[login] OK — terhubung ke RouterOS API\n")

    # Identitas
    for row in api.path("system", "identity"):
        print(f"identity   : {row.get('name')}")

    # Resource / versi board
    for r in api.path("system", "resource"):
        print(f"board-name : {r.get('board-name')}")
        print(f"version    : {r.get('version')}")
        print(f"uptime     : {r.get('uptime')}")
        print(f"cpu-load   : {r.get('cpu-load')}%")
        print(f"free-mem   : {r.get('free-memory')} / {r.get('total-memory')} bytes")

    # Interface ringkas
    print("\ninterfaces :")
    for i in api.path("interface"):
        print(f"  - {i.get('name'):<14} type={i.get('type'):<10} running={i.get('running')} disabled={i.get('disabled')}")

    api.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

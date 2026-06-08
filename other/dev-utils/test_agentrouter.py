"""
Test koneksi AgentRouter API
Usage: python test_agentrouter.py
"""

import os
import json
import urllib.request
import urllib.error

# ─── KONFIGURASI ────────────────────────────────────────────────────────────
API_KEY   = os.environ.get("AR_KEY", "sk-XxpNqTeU06FsIh3UCU7v0GgHo59fRnohbrJkxzoiZoK0K1Kl")
BASE_URL  = "https://agentrouter.org/v1"

# Daftar model yang ada di akun AgentRouter (coba satu per satu)
MODELS_TO_TEST = [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5",
    "glm-4.5",
    "deepseek-v3.1",
    "deepseek-v4-flash",
]
# ────────────────────────────────────────────────────────────────────────────


def test_model(model: str) -> dict:
    """Kirim satu request ke AgentRouter, return dict hasil."""
    url = f"{BASE_URL}/chat/completions"
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly one word: OK"}],
        "stream": False,
        "max_tokens": 10,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode())
            content = body["choices"][0]["message"]["content"]
            return {"status": "[OK]", "model": model, "reply": content.strip()}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            err_json = json.loads(err_body)
            msg = err_json.get("error", {}).get("message", err_body)
        except Exception:
            msg = err_body
        return {"status": f"[HTTP {e.code}]", "model": model, "reply": msg}
    except urllib.error.URLError as e:
        return {"status": "[Network]", "model": model, "reply": str(e.reason)}
    except Exception as e:
        return {"status": "[Error]", "model": model, "reply": str(e)}


def test_models_list() -> None:
    """Coba ambil daftar model dari /v1/models (kalau endpoint tersedia)."""
    url = f"{BASE_URL}/models"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {API_KEY}"},
        method="GET",
    )
    print("\n[List] Coba ambil daftar model dari /v1/models ...")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode())
            models = [m.get("id", "?") for m in body.get("data", [])]
            if models:
                print(f"   Model tersedia: {', '.join(models)}")
            else:
                print(f"   Response: {body}")
    except urllib.error.HTTPError as e:
        print(f"   Endpoint /v1/models tidak tersedia (HTTP {e.code}) — normal untuk beberapa provider")
    except Exception as e:
        print(f"   Error: {e}")


def main():
    print("=" * 60)
    print("  AgentRouter API Tester")
    print("=" * 60)

    # Validasi token
    if API_KEY.startswith("sk-GANTI"):
        print("\n[!] API Key belum diisi!")
        print("   Set environment variable dulu:")
        print("   PowerShell : $env:AR_KEY = 'sk-xxx'")
        print("   Linux/macOS: export AR_KEY='sk-xxx'")
        print("   Atau edit baris API_KEY di bagian KONFIGURASI script ini.")
        return

    print(f"\nToken  : {API_KEY[:8]}...{API_KEY[-4:]}")
    print(f"Base URL: {BASE_URL}")

    # Coba endpoint /v1/models
    test_models_list()

    # Test chat/completions per model
    print("\n[Test] Test chat/completions ...\n")
    success_count = 0
    for model in MODELS_TO_TEST:
        result = test_model(model)
        status = result["status"]
        reply  = result["reply"]
        print(f"  {status}  [{model}]")
        if "OK" in status:
            print(f"           Reply : {reply}")
            success_count += 1
        else:
            # Tampilkan error singkat (maks 120 karakter)
            print(f"           Error : {reply[:120]}")
        print()

    print("=" * 60)
    print(f"  Hasil: {success_count}/{len(MODELS_TO_TEST)} model berhasil")
    if success_count == 0:
        print("\n  [Tips]:")
        print("     - Pastikan token sudah di-revoke lama & ganti token baru")
        print("     - Cek quota di https://agentrouter.org/console")
        print("     - Join Discord AgentRouter: https://discord.gg/mvjP2U3cY2")
    print("=" * 60)


if __name__ == "__main__":
    main()

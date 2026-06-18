# AGENTS.md — SafeGuard APD

Two-process system: **Next.js dashboard** (`web-dashboard/`, port 3000) + **Python YOLO backend** (`ServiceAPDBackend.py`, WebSocket 8765, MJPEG 8766). Hardware loop is via ESP32 firmware in `alarm_apd/` over MQTT TLS.

Project docs and code comments are in Indonesian; that's intentional, not a bug. Keep replies and new docs in the user's language.

## Critical invariants

- **Startup order matters.** Next.js must be running before Python — the Python service fetches the node list from `GET /api/nodes` at boot. The `tui.py` manager and `docs/SETUP.md` enforce this order.
- **Two `.env` files, one shared secret.** Root `.env` (Python) and `web-dashboard/.env.local` (Node) are separate, but `APD_SERVICE_TOKEN` MUST be identical in both. Rotation is done from the dashboard `/settings/integrations` UI; the new value must then be copied into root `.env`.
- **`AES_KEY` in root `.env` must be exactly 32 hex chars (16 bytes).** `config.py` raises on anything else. Generate with `python -c "import secrets; print(secrets.token_hex(16))"`. The IV is randomized per message and prepended to ciphertext — do not store an IV anywhere.
- **`web-dashboard/AGENTS.md` is authoritative for the Next.js side.** Read it before touching anything under `web-dashboard/`. Highlights:
  - Adding a route under `src/app/api/**/route.ts` REQUIRES a matching entry in `src/lib/rbac/permission-map.ts`. A property test walks every route and fails the build if not registered (deny-by-default middleware).
  - The `audit_log` table is append-only. Never call `prisma.auditLog.update` / `prisma.auditLog.delete` — a property test enforces this.
  - Routes reachable from `ServiceAPDBackend.py` also need the `serviceTokenAllowed` flag in the permission map.
  - Next.js is 16.2.6 with breaking changes vs older training data; consult `node_modules/next/dist/docs/` rather than guessing.

## Commands

Working directory has a space (`D:\vscode-chat\pycham pbl\pycham pbl`). Always quote paths in shell.

Python (run from repo root):
```
python ServiceAPDBackend.py        # main detection service
python tui.py                      # interactive control center (Windows only — uses msvcrt)
pytest tests                       # Python unit tests
pytest tests/test_aes_roundtrip.py # single test file
```

Web dashboard (run from `web-dashboard/`):
```
npm install
npm run setup:env          # generates .env.local + tokens (idempotent)
npx prisma migrate deploy  # apply schema
npm run seed               # idempotent — 5 default roles + admin user (password printed once)
npm run dev                # development
npm run build && npm start # production
npm test                   # vitest --run (unit + property tests)
npx tsc --noEmit           # type check (run before declaring done)
npm run lint               # ESLint
```

Recovery / ops:
```
npm run reset:admin        # rotate admin password
npm run migrate:json-to-db # one-shot import from legacy JSON store
npm run restore:backup -- --backup-dir data/backup/{timestamp}
```

## Environment quirks

- **PyTorch is not in `requirements.txt`** — install separately matching the local CUDA, e.g. `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126`. `requirements.txt` says so at the top.
- **Python venv is `.venv/`**, not `venv/`. `tui.py` checks `venv/Scripts/python.exe` and falls back to `sys.executable`, so it still works, but if you create one prefer `.venv` to match what's already present.
- **Model weights live in `models/`** (`yolov8n.pt`, `ppe_best.pt`). They are gitignored (`*.pt`). Do not commit retrained weights — regenerate via `python training/2_train_ppe.py` or pull from release. `models/README.md` is the documented exception.
- **Datasets under `CHV-YOLOv8/{train,valid,test}/` are gitignored.** Download via `python training/1_download_dataset.py` (needs `ROBOFLOW_API_KEY`).
- **`web-dashboard/data/*.db` is gitignored.** SQLite WAL files (`*.db-wal`, `*.db-shm`) too. Backups land in `web-dashboard/data/backup/{timestamp}/`.
- **Cloudflare credential JSONs and `_export_bundle*` are gitignored** — they contain secrets even if encrypted.

## Architecture quick map

- `ServiceAPDBackend.py` — entry point: YOLO inference, WebSocket frame stream (`:8765`), MQTT publish, WhatsApp via GoWA, reports to Next.js via loopback `http://127.0.0.1:3000` with `Bearer APD_SERVICE_TOKEN`.
- `config.py` — single source of truth for Python env (loads root `.env` via python-dotenv).
- `tui.py` — Rich + msvcrt control center: prerequisite check, start/stop services, run setup steps, Cloudflare tunnel helpers. Windows only.
- `web-dashboard/` — Next.js 16 (App Router) + React 19 + Prisma 7 + SQLite + Argon2id. Owns ALL persistence and auth.
- `alarm_apd/` — ESP32 firmware (Arduino IDE / PlatformIO). MQTT subscriber + MQ-135 sensor + I2S audio. AES-128-CBC decrypt with mbedtls.
- `training/` — numbered ML pipeline: `1_download_dataset.py` → `3_prepare_chv_dataset.py` → `2_train_ppe.py`.
- `tests/` — Python unit + property tests (pytest). Web dashboard tests live under `web-dashboard/src/**/__tests__/`.
- `legacy/`, `other/` — explicitly parking-lot folders. Don't add new work here.
- `.kiro/specs/` — active specs (Kiro IDE format). Useful background; check `tasks.md` files before large refactors.
- `ARSITEKTUR.md` — detailed architecture in Indonesian, with per-feature file/line mapping table at the bottom (very useful for navigation).

## Verification rule

After any code change, run the relevant verification before declaring done:
- Python edits: `pytest tests` (and `python -c "import config"` if `.env` shape changed).
- Dashboard edits: `npx tsc --noEmit && npm run lint && npm test` from `web-dashboard/`.
- Cross-cutting (changed env vars, ports, service token shape): also smoke-test by booting Next.js then Python and watching logs for the node-list fetch.

## Safety

`.env`, `web-dashboard/.env.local`, `*-credentials.json`, `_export_bundle*`, and `web-dashboard/data/*.db` contain secrets or production-shaped data. Never echo their contents back in responses, never commit them, and prefer redacting values when discussing them.

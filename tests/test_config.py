"""
Bug 4 (Post-alarm retrigger / backend cooldown) — exploration tests.

Validates:
  - Requirements 1.8 (Current Behavior — backend mem-publish setiap 2 detik).
  - Property 10 di design.md (Fix: load_config'(env).COOLDOWN_SECONDS == 20 saat unset).

Property (Property 10):

    FOR ALL env WHERE env.COOLDOWN_SECONDS IS UNSET:
        load_config'(env).COOLDOWN_SECONDS == 20

EXPECTED OUTCOME pada UNFIXED code:
    Test FAILS — `config.py` masih memuat default literal `"2"`
    (`os.getenv("COOLDOWN_SECONDS", "2")`), sehingga
    `config.COOLDOWN_SECONDS == 2` (bukan 20). Counterexample mengkonfirmasi
    sisi backend Bug 4 (lihat bugfix.md klausa 1.8).

Setelah fix (task 6.1), default berubah menjadi `"20"` dan test PASS.
"""

import importlib
import os
import sys

import pytest


# Tambahkan project root ke sys.path agar `import config` berhasil.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def _reload_config():
    """Reload modul `config` agar pembacaan os.getenv terjadi ulang."""
    import config  # noqa: PLC0415
    return importlib.reload(config)


# ────────────────────────────────────────────────────────────────────────────
# Property 10 (Fix Checking): default COOLDOWN_SECONDS == 20 saat env unset
# ────────────────────────────────────────────────────────────────────────────

class TestCooldownDefaultExploration:
    """Exploration test — EXPECTED TO FAIL pada UNFIXED code."""

    def test_cooldown_seconds_default_is_20_when_env_unset(self, monkeypatch):
        """
        Validates: Requirements 1.8, 2.8 (Property 10).

        Counterexample pada UNFIXED code: default literal di config.py masih `"2"`,
        sehingga `config.COOLDOWN_SECONDS == 2` ≠ 20.
        """
        monkeypatch.delenv("COOLDOWN_SECONDS", raising=False)
        config = _reload_config()
        assert config.COOLDOWN_SECONDS == 20, (
            f"Default COOLDOWN_SECONDS harus 20 saat env unset, "
            f"tetapi config.COOLDOWN_SECONDS == {config.COOLDOWN_SECONDS} "
            f"(counterexample Bug 4 backend)."
        )


# ────────────────────────────────────────────────────────────────────────────
# Property 11 (Preservation Checking): env override dihormati
#
# Test ini adalah preservation property — sudah PASS pada UNFIXED code dan
# harus tetap PASS setelah fix. Disertakan agar generator pytest -k cooldown
# memvalidasi kedua sisi properti.
# ────────────────────────────────────────────────────────────────────────────

class TestCooldownEnvOverridePreservation:
    """Preservation test — harus PASS pada UNFIXED dan FIXED code."""

    @pytest.mark.parametrize("override_value", ["1", "5", "10", "60"])
    def test_cooldown_seconds_respects_env_override(self, monkeypatch, override_value):
        """
        Property 11 (sisi backend): env override dihormati pada nilai apa pun.

        Pada UNFIXED dan FIXED code keduanya, set env COOLDOWN_SECONDS=N → config.COOLDOWN_SECONDS == N.
        """
        monkeypatch.setenv("COOLDOWN_SECONDS", override_value)
        config = _reload_config()
        assert config.COOLDOWN_SECONDS == int(override_value), (
            f"Env COOLDOWN_SECONDS={override_value} harus dihormati, "
            f"tetapi config.COOLDOWN_SECONDS == {config.COOLDOWN_SECONDS}."
        )

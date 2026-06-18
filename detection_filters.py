"""
detection_filters.py — Pure helpers untuk filter deteksi YOLO.

Modul ini berisi fungsi murni (tanpa side-effect, tanpa I/O, tanpa import
cv2/torch/ultralytics) supaya bisa di-pytest tanpa mock berat. Lihat
docs/plans/detection-quality-fix.md dan docs/plans/detection-quality-fix.tasks.md
untuk konteks.

Tiga komponen:

1. ``is_full_body_bbox`` — gate apakah bbox person cukup utuh untuk
   menjustifikasi default-violation (lihat ServiceAPDBackend.py:670-672).
2. ``should_publish_violation`` — temporal smoothing gate, mencegah
   flicker satu-frame langsung men-trigger publish MQTT/WA.
3. ``AdaptiveSkip`` — kontroler frame-skip adaptif berdasarkan rolling
   average inference latency (line ~809 di ServiceAPDBackend.py
   dulu pakai static ``DETECT_EVERY_N``).
"""

from __future__ import annotations

from collections import deque
from typing import Sequence


__all__ = [
    "is_full_body_bbox",
    "should_publish_violation",
    "AdaptiveSkip",
    "estimate_visibility",
    "evaluate_person",
    "ViolationWindow",
]


# ────────────────────────────────────────────────────────────────────────────
# 1. Bbox completeness filter
# ────────────────────────────────────────────────────────────────────────────

def is_full_body_bbox(
    person_bbox: Sequence[int],
    frame_shape: Sequence[int],
    min_height_ratio: float = 0.5,
    edge_margin_px: int = 40,
    max_aspect_ratio: float = 0.8,
) -> bool:
    """Return True kalau bbox person cukup utuh untuk dianggap full-body.

    Parameters
    ----------
    person_bbox
        Format ``[x1, y1, x2, y2]`` (sama dengan output ultralytics
        ``box.xyxy[0]`` di ServiceAPDBackend.py:639).
    frame_shape
        Tuple ``(h, w)`` atau ``(h, w, c)`` (cv2/numpy convention).
    min_height_ratio
        Minimum rasio tinggi bbox terhadap tinggi frame. Default 0.7
        (orang harus mengisi minimal 70% tinggi frame).
    edge_margin_px
        Maksimum jarak antara bottom bbox dan bottom frame dalam piksel.
        Tujuan: memastikan kaki kelihatan (vest harusnya juga visible).
    max_aspect_ratio
        Rasio ``width / height`` maksimum. Default 0.6.
        Orang berdiri tegak full-body biasanya 0.3–0.5.
        Close-up bust shot (kepala–bahu) biasanya 0.7–1.0.
        Filter ini menutup kasus model person mengextend bbox melewati
        visible area saat user close-up.

    Returns
    -------
    bool
        True kalau bbox memenuhi KETIGA kriteria. False kalau tidak,
        atau kalau bbox/frame_shape tidak valid.

    Raises
    ------
    ValueError
        Kalau ``frame_shape`` bukan tuple/list dengan minimal 2 elemen.

    Notes
    -----
    Pure function — tidak mengubah input, tidak ada I/O. Bisa dipanggil
    dari thread mana pun tanpa locking.

    Example
    -------
    >>> is_full_body_bbox([280, 50, 360, 470], (480, 640))
    True
    >>> is_full_body_bbox([100, 50, 540, 470], (480, 640))  # terlalu lebar
    False
    """
    if not isinstance(frame_shape, (tuple, list)) or len(frame_shape) < 2:
        raise ValueError(
            f"frame_shape harus tuple/list (h, w) atau (h, w, c), "
            f"dapat: {frame_shape!r}"
        )

    if len(person_bbox) < 4:
        return False

    x1, y1, x2, y2 = person_bbox[0], person_bbox[1], person_bbox[2], person_bbox[3]
    h = frame_shape[0]

    # Bbox invalid (titik atau terbalik)
    if y2 <= y1 or x2 <= x1:
        return False

    # Frame tidak valid
    if h <= 0:
        return False

    bbox_height = y2 - y1
    bbox_width = x2 - x1
    height_ratio = bbox_height / h
    bottom_gap = h - y2
    aspect_ratio = bbox_width / bbox_height

    return (
        height_ratio >= min_height_ratio
        and bottom_gap <= edge_margin_px
        and aspect_ratio <= max_aspect_ratio
    )



# ────────────────────────────────────────────────────────────────────────────
# 2. Temporal smoothing gate
# ────────────────────────────────────────────────────────────────────────────

def should_publish_violation(streak_count: int, min_streak: int = 5) -> bool:
    """Return True kalau streak pelanggaran sudah cukup panjang untuk publish.

    Parameters
    ----------
    streak_count
        Jumlah frame BERTURUT-TURUT dengan ``has_violation = True``.
        Increment hanya pada frame yang benar-benar di-inference (bukan
        carryover dari frame skip — lihat task 3.3).
    min_streak
        Threshold minimum. Default 5 frame (~0.25 detik di 20 FPS).

    Returns
    -------
    bool
        True kalau ``streak_count >= min_streak``. ``streak_count``
        negatif selalu False (defensive).

    Notes
    -----
    Pure trivial — kelihatan kayak ``>=`` biasa. Diekstrak supaya:

    1. Threshold mudah di-monkeypatch di test.
    2. Cooldown gate di publish path (ServiceAPDBackend.py:846)
       jadi self-documenting (``and should_publish_violation(...)``).

    Example
    -------
    >>> should_publish_violation(3)
    False
    >>> should_publish_violation(5)
    True
    >>> should_publish_violation(-1)
    False
    """
    if streak_count < 0:
        return False
    return streak_count >= min_streak


# ────────────────────────────────────────────────────────────────────────────
# 3. Adaptive frame-skip controller
# ────────────────────────────────────────────────────────────────────────────

class AdaptiveSkip:
    """Kontroler frame-skip adaptif berdasarkan rolling-average latency.

    Latar belakang
    --------------
    ServiceAPDBackend.py line 809 memakai static ``DETECT_EVERY_N``
    (1 di GPU, 3 di CPU) yang ditentukan sekali saat thread start.
    Kalau beban naik (resolusi tinggi, banyak orang, GPU diserobot),
    frame menumpuk dan stream jadi laggy. Kalau ringan, frame skip
    yang terlalu agresif bikin smoothing window jadi terlalu lama.

    Cara kerja
    ----------
    Tiap kali setelah inference, panggil ``record(latency_ms)``. Class
    akan track avg dari 30 sampel terakhir (configurable via ``window``).

    Lalu ``current_n()`` mengembalikan skip factor terkini dengan
    aturan:

    * avg > target          → naikkan n (max ``max_n``).
    * avg < target / 2      → turunkan n (min ``min_n``).
    * di antaranya          → tahan nilai sekarang.

    Update bertahap (1 step per panggil ``current_n()``) supaya tidak
    osilasi naik-turun setiap detik.

    Parameters
    ----------
    target_latency_ms
        Latency yang ingin dipertahankan. Default 50ms (~20 FPS).
    min_n, max_n
        Bound skip factor. Default ``[1, 5]``.
    window
        Ukuran rolling buffer untuk hitung avg.

    Notes
    -----
    Class bersifat stateful tapi tidak mengakses I/O — bisa di-pytest
    dengan deterministic input. Tidak thread-safe; satu instance per
    camera thread (tidak ada shared state antar thread).
    """

    def __init__(
        self,
        target_latency_ms: float = 50.0,
        min_n: int = 1,
        max_n: int = 5,
        window: int = 30,
    ) -> None:
        if min_n < 1:
            raise ValueError(f"min_n harus >= 1, dapat {min_n}")
        if max_n < min_n:
            raise ValueError(f"max_n ({max_n}) harus >= min_n ({min_n})")
        if window < 1:
            raise ValueError(f"window harus >= 1, dapat {window}")
        if target_latency_ms <= 0:
            raise ValueError(
                f"target_latency_ms harus > 0, dapat {target_latency_ms}"
            )

        self.target_latency_ms = float(target_latency_ms)
        self.min_n = int(min_n)
        self.max_n = int(max_n)
        self._samples: deque[float] = deque(maxlen=int(window))
        self._n = self.min_n

    def record(self, latency_ms: float) -> None:
        """Tambahkan satu sampel latency ke rolling buffer."""
        if latency_ms < 0:
            # Defensive: clock skew / pengukuran error → abaikan.
            return
        self._samples.append(float(latency_ms))

    def current_n(self) -> int:
        """Hitung & return skip factor terkini.

        Belum cukup sampel (< 3) → return nilai sekarang tanpa update.
        """
        if len(self._samples) < 3:
            return self._n

        avg = sum(self._samples) / len(self._samples)
        if avg > self.target_latency_ms and self._n < self.max_n:
            self._n += 1
        elif avg < self.target_latency_ms / 2 and self._n > self.min_n:
            self._n -= 1
        # else: hold

        return self._n

    @property
    def avg_latency_ms(self) -> float:
        """Avg sampel terkini, 0.0 kalau belum ada sample."""
        if not self._samples:
            return 0.0
        return sum(self._samples) / len(self._samples)


# ────────────────────────────────────────────────────────────────────────────
# 4. Visibility gate (3-status: compliant / violation / unknown)
# ────────────────────────────────────────────────────────────────────────────

# Threshold default — boleh di-override via parameter saat dipanggil.
_VIS_TOO_SMALL = 0.25
_VIS_PARTIAL = 0.45
_VIS_TOO_CLOSE = 0.90
# Aspect ratio (width/height) > _VIS_UPPER_BODY_ASPECT = upper body only
# (head+shoulders close-up). Diturunkan dari 0.90 ke 0.80 setelah lapangan
# menemukan kasus head-only di mana model kasih bbox tinggi tapi visual
# cuma head+shoulders.
_VIS_UPPER_BODY_ASPECT = 0.80
# Kalau bbox menyentuh bottom frame DAN height_ratio < threshold ini,
# kemungkinan lower body (kaki) terpotong = waist-up view. Tidak cukup
# untuk evaluate APD karena tidak bisa konfirmasi vest dari posisi miring.
_VIS_LOWER_BODY_HEIGHT_RATIO = 0.85
_VIS_FRAME_EDGE_PX = 5


def estimate_visibility(person_bbox, frame_shape):
    """Klasifikasi apakah person bbox layak dievaluasi APD-nya.

    Returns
    -------
    dict
        ``{"evaluable": bool, "reason": str,
           "head_evaluable": bool, "torso_evaluable": bool}``.

        Reason vocabulary:

        * ``full_enough``     — lulus, head + torso evaluable.
        * ``person_too_small``— bbox < 25% tinggi frame.
        * ``person_cropped_or_too_close`` — > 90% tinggi atau menyentuh top+bottom.
        * ``partial_body``    — h_ratio < 0.45 (head visible tapi torso tidak).
        * ``upper_body_only`` — aspect ratio > 0.8 (lebar pendek).
        * ``lower_body_cropped`` — bottom touch + h_ratio < 0.85 (head+torso OK,
          kaki kepotong) — masih cukup untuk evaluate APD.
        * ``head_or_torso_only`` — fallback (jarang).

        ``head_evaluable`` / ``torso_evaluable`` per-zone independen:
        - head_evaluable True kalau kepala (top 35% bbox) ada di dalam frame.
        - torso_evaluable True kalau torso (25-90% bbox) ada di dalam frame.
        Kedua flag ini dipakai oleh ``evaluate_person`` untuk decision per-item
        (helmet vs vest), bukan all-or-nothing visibility gate.
    """
    if not isinstance(frame_shape, (tuple, list)) or len(frame_shape) < 2:
        return {
            "evaluable": False,
            "reason": "invalid_frame_shape",
            "head_evaluable": False,
            "torso_evaluable": False,
        }
    if len(person_bbox) < 4:
        return {
            "evaluable": False,
            "reason": "invalid_bbox",
            "head_evaluable": False,
            "torso_evaluable": False,
        }

    fh = frame_shape[0]
    fw = frame_shape[1]
    x1, y1, x2, y2 = person_bbox[0], person_bbox[1], person_bbox[2], person_bbox[3]

    if y2 <= y1 or x2 <= x1 or fh <= 0 or fw <= 0:
        return {
            "evaluable": False,
            "reason": "invalid_bbox",
            "head_evaluable": False,
            "torso_evaluable": False,
        }

    bh = y2 - y1
    bw = x2 - x1
    height_ratio = bh / fh
    aspect = bw / max(bh, 1)
    touches_top = y1 <= _VIS_FRAME_EDGE_PX
    touches_bottom = y2 >= fh - _VIS_FRAME_EDGE_PX

    # Per-zone evaluable check.
    # Head zone = top 35% of person bbox. Evaluable kalau bbox top tidak
    # menyentuh frame top (kepala kepotong) DAN person bbox cukup besar.
    head_evaluable = (not touches_top) and height_ratio >= 0.20
    # Torso zone = 25-90% of person bbox. Evaluable kalau cukup terlihat —
    # height_ratio >= 0.30 (cukup tinggi untuk berisi torso area).
    torso_evaluable = height_ratio >= 0.30

    # Decision logic untuk overall reason (legacy field).
    if height_ratio < _VIS_TOO_SMALL:
        return {
            "evaluable": False,
            "reason": "person_too_small",
            "head_evaluable": False,
            "torso_evaluable": False,
        }
    if (touches_top and touches_bottom) or height_ratio > _VIS_TOO_CLOSE:
        return {
            "evaluable": False,
            "reason": "person_cropped_or_too_close",
            "head_evaluable": False,
            "torso_evaluable": False,
        }
    if height_ratio < _VIS_PARTIAL:
        # Tubuh terlalu pendek — head mungkin OK, tapi torso belum tentu.
        # head_evaluable & torso_evaluable di atas masih bisa True.
        return {
            "evaluable": False,
            "reason": "partial_body",
            "head_evaluable": head_evaluable,
            "torso_evaluable": torso_evaluable and height_ratio >= 0.35,
        }
    if aspect > _VIS_UPPER_BODY_ASPECT:
        # Bbox lebar pendek (close-up bahu) — torso "terlihat" tapi mungkin
        # tidak dari pinggang. Tetap evaluable per zona.
        return {
            "evaluable": False,
            "reason": "upper_body_only",
            "head_evaluable": head_evaluable,
            "torso_evaluable": torso_evaluable,
        }
    if touches_bottom and height_ratio < _VIS_LOWER_BODY_HEIGHT_RATIO:
        # Kaki kepotong tapi head + torso terlihat → keduanya tetap evaluable.
        return {
            "evaluable": False,
            "reason": "lower_body_cropped",
            "head_evaluable": head_evaluable,
            "torso_evaluable": torso_evaluable,
        }

    return {
        "evaluable": True,
        "reason": "full_enough",
        "head_evaluable": True,
        "torso_evaluable": True,
    }


# ────────────────────────────────────────────────────────────────────────────
# 5. Spatial zone validator + evaluator (compliant / violation / unknown)
# ────────────────────────────────────────────────────────────────────────────

def _bbox_center(bbox):
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


def _in_head_zone(ppe_bbox, person_bbox):
    """True kalau center PPE bbox jatuh di top 35% person bbox (zona kepala)."""
    px1, py1, px2, py2 = person_bbox
    h = py2 - py1
    if h <= 0:
        return False
    head_top = py1
    head_bottom = py1 + 0.35 * h
    cx, cy = _bbox_center(ppe_bbox)
    return head_top <= cy <= head_bottom


def _in_torso_zone(ppe_bbox, person_bbox):
    """True kalau center PPE bbox jatuh di 25-90% person bbox (zona torso)."""
    px1, py1, px2, py2 = person_bbox
    h = py2 - py1
    if h <= 0:
        return False
    torso_top = py1 + 0.25 * h
    torso_bottom = py1 + 0.90 * h
    cx, cy = _bbox_center(ppe_bbox)
    return torso_top <= cy <= torso_bottom


def evaluate_person(person_bbox, ppe_detections, frame_shape):
    """Evaluasi APD untuk satu person bbox dengan zone validation + conflict resolver.

    Algoritma practical mode (revisi setelah field test):

    1. Ekstrak PPE valid per zone (helmet/no_helmet di head, vest/no_vest di torso).
    2. Conflict resolver: helmet valid menang atas no_helmet palsu di tempat yang sama.
    3. **Practical mode short-circuit**: kalau helmet+vest dua-duanya valid,
       langsung COMPLIANT tanpa visibility check. Operator tetap dapat
       feedback positif walau bbox-nya partial body (sering terjadi di
       webcam laptop close-up).
    4. Kalau ada explicit_no_helmet atau explicit_no_vest valid (di zona
       benar), langsung VIOLATION — model sudah confident orangnya
       tidak pakai PPE.
    5. Kalau salah satu missing tapi tidak ada explicit negative,
       gate visibility:
       * tidak evaluable (partial body, head-only, dll) → UNKNOWN.
       * full body evaluable → VIOLATION (default-violation logic).

    Aturan ini menutup 3 kasus problematik:
    - Head-only tanpa helm → tidak punya valid_helmet, tidak ada explicit
      no_helmet, visibility = partial_body → UNKNOWN ✅
    - Body tertutup full + tanpa helm → tidak punya valid_helmet, visibility
      = full_enough → VIOLATION ✅
    - Helm+vest terlihat di kepala+dada walau bahu close-up → punya
      valid_helmet+valid_vest → short-circuit COMPLIANT ✅

    Parameters
    ----------
    person_bbox : sequence of int
        ``[x1, y1, x2, y2]`` bbox person dari model person.
    ppe_detections : list of dict
        ``[{"class": str, "bbox": [x1,y1,x2,y2], "conf": float?}, ...]``
        sudah di-filter milik person ini (overlap >= 35% PPE area).
    frame_shape : tuple
        ``(h, w)`` atau ``(h, w, c)``.

    Returns
    -------
    dict
        ``{"status": "compliant"|"violation"|"unknown",
           "missing": list[str], "reason": str,
           "valid_ppe": list[dict], "ignored_ppe": list[dict]}``

        ``valid_ppe`` & ``ignored_ppe`` berguna untuk visualisasi/debug.

    Notes
    -----
    Pure function — tidak akses cv2/torch/IO. Bisa di-pytest tanpa mock.
    """
    valid_helmet = []
    valid_no_helmet = []
    valid_vest = []
    valid_no_vest = []
    ignored = []

    for ppe in ppe_detections:
        cls = ppe.get("class", "")
        bbox = ppe.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        if cls in ("helmet", "no_helmet"):
            if _in_head_zone(bbox, person_bbox):
                if cls == "helmet":
                    valid_helmet.append(ppe)
                else:
                    valid_no_helmet.append(ppe)
            else:
                ignored.append({**ppe, "ignored_reason": "outside_head"})
        elif cls in ("vest", "no_vest"):
            if _in_torso_zone(bbox, person_bbox):
                if cls == "vest":
                    valid_vest.append(ppe)
                else:
                    valid_no_vest.append(ppe)
            else:
                ignored.append({**ppe, "ignored_reason": "outside_torso"})
        else:
            ignored.append({**ppe, "ignored_reason": "unknown_class"})

    # Conflict resolver — kalau positive valid ditemukan, abaikan negative.
    if valid_helmet:
        for nh in valid_no_helmet:
            ignored.append({**nh, "ignored_reason": "overruled_by_helmet"})
        valid_no_helmet = []
    if valid_vest:
        for nv in valid_no_vest:
            ignored.append({**nv, "ignored_reason": "overruled_by_vest"})
        valid_no_vest = []

    valid_ppe = valid_helmet + valid_no_helmet + valid_vest + valid_no_vest

    # Practical mode short-circuit: kalau helmet+vest dua-duanya valid,
    # langsung COMPLIANT tanpa cek visibility. Operator dapat feedback
    # positif walau bbox-nya partial body.
    if valid_helmet and valid_vest:
        return {
            "status": "compliant",
            "missing": [],
            "reason": "ppe_complete",
            "valid_ppe": valid_ppe,
            "ignored_ppe": ignored,
        }

    # Kalau ada explicit no_helmet/no_vest valid, langsung VIOLATION —
    # model sudah confident dan posisinya benar (head/torso zone).
    explicit_missing = []
    if valid_no_helmet:
        explicit_missing.append("helmet")
    if valid_no_vest:
        explicit_missing.append("vest")
    if explicit_missing:
        return {
            "status": "violation",
            "missing": explicit_missing,
            "reason": "ppe_missing_explicit",
            "valid_ppe": valid_ppe,
            "ignored_ppe": ignored,
        }

    # Per-zone evaluation: cek visibility per item, bukan all-or-nothing.
    # Kalau head visible tapi tidak ada valid_helmet → missing helmet (real).
    # Kalau torso visible tapi tidak ada valid_vest → missing vest (real).
    # Kalau head/torso tidak visible → item itu unknown (skip dari decision).
    visibility = estimate_visibility(person_bbox, frame_shape)
    head_eval = visibility.get("head_evaluable", False)
    torso_eval = visibility.get("torso_evaluable", False)

    # Kalau dua-duanya tidak evaluable, return overall unknown.
    if not head_eval and not torso_eval:
        return {
            "status": "unknown",
            "missing": [],
            "reason": visibility["reason"],
            "valid_ppe": valid_ppe,
            "ignored_ppe": ignored,
        }

    missing = []
    unknown_items = []
    if head_eval:
        if not valid_helmet:
            missing.append("helmet")
    else:
        unknown_items.append("helmet")
    if torso_eval:
        if not valid_vest:
            missing.append("vest")
    else:
        unknown_items.append("vest")

    if missing:
        # Ada item missing yang real (head/torso terlihat tapi PPE tidak ada).
        # Jadi violation — gak peduli ada unknown_item atau tidak.
        reason = "ppe_missing"
        if unknown_items:
            reason = f"ppe_missing_partial:{','.join(unknown_items)}_unknown"
        return {
            "status": "violation",
            "missing": missing,
            "reason": reason,
            "valid_ppe": valid_ppe,
            "ignored_ppe": ignored,
        }

    # Tidak ada missing real. Tapi ada unknown_items → status unknown.
    if unknown_items:
        return {
            "status": "unknown",
            "missing": [],
            "reason": f"items_unknown:{','.join(unknown_items)}",
            "valid_ppe": valid_ppe,
            "ignored_ppe": ignored,
        }

    # Semua item ada (entah valid_helmet/valid_vest, atau zone tidak relevan).
    return {
        "status": "compliant",
        "missing": [],
        "reason": "ppe_complete",
        "valid_ppe": valid_ppe,
        "ignored_ppe": ignored,
    }


# ────────────────────────────────────────────────────────────────────────────
# 6. Sliding window untuk temporal smoothing (lebih tahan jitter)
# ────────────────────────────────────────────────────────────────────────────

class ViolationWindow:
    """Sliding window evaluator untuk confirmed violation.

    Beda dengan consecutive streak (counter yang reset di 1 false-negative),
    sliding window track N frame terakhir. Confirmed violation kalau minimal
    `confirm_count` dari `window_size` frame adalah violation dengan missing
    type yang sama.

    Lebih tahan jitter di kondisi CCTV nyata (motion blur, oklusi sebentar).

    Parameters
    ----------
    window_size : int
        Ukuran sliding window. Default 8 frame inference.
    confirm_count : int
        Minimum count untuk confirm violation. Default 6.

    State per-instance — satu instance per camera thread.
    """

    def __init__(self, window_size: int = 8, confirm_count: int = 6) -> None:
        if window_size < 1:
            raise ValueError(f"window_size harus >= 1, dapat {window_size}")
        if confirm_count < 1 or confirm_count > window_size:
            raise ValueError(
                f"confirm_count harus 1..{window_size}, dapat {confirm_count}"
            )
        self.window_size = window_size
        self.confirm_count = confirm_count
        # Setiap entry adalah tuple immutable dari missing types,
        # mis. ('helmet',) atau ('helmet','vest'). Empty tuple = no violation.
        self._buffer: deque = deque(maxlen=window_size)

    def push(self, missing) -> None:
        """Push hasil 1 frame ke window. ``missing`` = list[str] atau None."""
        if not missing:
            self._buffer.append(())
        else:
            # Sorted untuk kanonik — ('helmet','vest') == ('vest','helmet').
            self._buffer.append(tuple(sorted(missing)))

    def confirmed_missing(self):
        """Return tuple missing types kalau confirmed, else None.

        Algoritma:
        1. Hitung frequency tiap missing tuple di buffer.
        2. Kalau ada tuple non-empty dengan count >= confirm_count → confirmed.
        3. Pilih tuple yang paling sering muncul (tie → pilih yang lebih panjang).
        """
        if len(self._buffer) < self.confirm_count:
            return None

        counts: dict = {}
        for entry in self._buffer:
            if entry:  # skip frame compliant/unknown (empty tuple)
                counts[entry] = counts.get(entry, 0) + 1

        if not counts:
            return None

        best = max(counts.items(), key=lambda kv: (kv[1], len(kv[0])))
        if best[1] >= self.confirm_count:
            return best[0]
        return None

    def reset(self) -> None:
        """Kosongkan window — biasanya dipanggil setelah publish alarm."""
        self._buffer.clear()

    @property
    def buffer_snapshot(self):
        """Return list copy dari buffer (untuk debug log)."""
        return list(self._buffer)




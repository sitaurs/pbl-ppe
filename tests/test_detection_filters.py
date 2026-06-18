"""
Tests untuk detection_filters.py — pure helper functions.

Konteks:
- Plan: docs/plans/detection-quality-fix.md
- Tasks: docs/plans/detection-quality-fix.tasks.md (Wave 2)

Helper murni → tidak butuh mock cv2/torch/ultralytics. Pakai pytest +
parametrize untuk property-style cases (precedent: tests/test_config.py).
"""

import os
import sys

import pytest


# Tambahkan project root ke sys.path agar `import detection_filters` berhasil.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


from detection_filters import (  # noqa: E402
    AdaptiveSkip,
    ViolationWindow,
    estimate_visibility,
    evaluate_person,
    is_full_body_bbox,
    should_publish_violation,
)


# ────────────────────────────────────────────────────────────────────────────
# 2.2 — is_full_body_bbox
# ────────────────────────────────────────────────────────────────────────────

class TestIsFullBodyBbox:
    """Verifikasi gate full-body untuk default-violation logic."""

    def test_tall_bbox_with_bottom_near_frame_returns_true(self):
        # Bbox 80% tinggi (50..450 di frame h=480 = 83%), bottom 30px dari edge
        # → masih lulus karena edge_margin default 20? Coba bottom yang dekat.
        assert is_full_body_bbox([100, 50, 200, 470], (480, 640)) is True

    def test_short_bbox_returns_false(self):
        # Tinggi 30% (100..244 di h=480 = 30%), bottom dekat edge tapi tidak full.
        assert is_full_body_bbox([100, 100, 200, 244], (480, 640)) is False

    def test_tall_bbox_far_from_bottom_returns_false(self):
        # Tinggi 60% (50..338 di h=480 = 60%) tapi bottom 142px dari edge
        # → kaki tidak visible → False.
        assert is_full_body_bbox([100, 50, 200, 338], (480, 640)) is False

    def test_short_bbox_near_top_returns_false(self):
        # Bbox menyentuh top tapi pendek (0..100 di h=480 = 20%).
        assert is_full_body_bbox([100, 0, 200, 100], (480, 640)) is False

    def test_invalid_bbox_inverted_returns_false(self):
        # y2 < y1 → bbox invalid → False, no crash.
        assert is_full_body_bbox([100, 200, 200, 100], (480, 640)) is False

    def test_invalid_bbox_zero_area_returns_false(self):
        # y2 == y1 → tidak valid.
        assert is_full_body_bbox([100, 100, 200, 100], (480, 640)) is False
        # x2 == x1 → tidak valid.
        assert is_full_body_bbox([100, 100, 100, 200], (480, 640)) is False

    def test_short_bbox_returns_false_no_crash(self):
        # Bbox kurang dari 4 elemen.
        assert is_full_body_bbox([100, 100, 200], (480, 640)) is False
        assert is_full_body_bbox([], (480, 640)) is False

    def test_frame_shape_with_channel_dimension(self):
        # cv2 frame.shape biasanya (h, w, c) — harus tetap valid.
        assert is_full_body_bbox([100, 50, 200, 470], (480, 640, 3)) is True

    def test_invalid_frame_shape_raises(self):
        # frame_shape kurang dari 2 elemen.
        with pytest.raises(ValueError, match="frame_shape harus tuple"):
            is_full_body_bbox([100, 50, 200, 470], (480,))

        with pytest.raises(ValueError, match="frame_shape harus tuple"):
            is_full_body_bbox([100, 50, 200, 470], 480)

    def test_zero_height_frame_returns_false(self):
        # frame h == 0 → defensive False.
        assert is_full_body_bbox([100, 50, 200, 470], (0, 640)) is False

    @pytest.mark.parametrize(
        "min_height_ratio,bbox,expected",
        [
            (0.5, [100, 50, 200, 290], True),    # 50% tinggi, lulus (240/480=0.5, gap 190)
            (0.6, [100, 50, 200, 290], False),   # 50% tinggi, gagal min 60%
            (0.4, [100, 200, 200, 400], False),  # 41% tinggi, gap 80 — gagal margin
        ],
    )
    def test_min_height_ratio_parametrized(self, min_height_ratio, bbox, expected):
        # Edge margin default 20, frame h=480.
        # Test ini mengisolasi pengaruh min_height_ratio dengan bbox yang
        # bottom-nya dekat edge agar gap criteria lulus.
        assert is_full_body_bbox(
            bbox, (480, 640), min_height_ratio=min_height_ratio, edge_margin_px=200
        ) is (min_height_ratio <= (bbox[3] - bbox[1]) / 480)

    def test_custom_edge_margin(self):
        # Bottom 100px dari edge, default margin 20 → False (gagal di gap).
        # Bbox 50..380 di h=480 → height_ratio 0.6875 (lulus 0.6, tapi kalau
        # default 0.7 gagal — pakai explicit min_height_ratio=0.6).
        assert is_full_body_bbox(
            [100, 50, 200, 380], (480, 640), min_height_ratio=0.6
        ) is False
        # Margin diperbesar 100 → lulus.
        assert is_full_body_bbox(
            [100, 50, 200, 380], (480, 640),
            edge_margin_px=100,
            min_height_ratio=0.6,
        ) is True

    # ─── Aspect ratio (close-up bust shot detection) ───
    def test_wide_bbox_close_up_bust_shot_returns_false(self):
        # Bbox lebar (sampai bahu close-up) — aspect > 0.6 default.
        # width=300, height=300 → aspect 1.0, gagal aspect ratio meski
        # height & gap lulus.
        assert is_full_body_bbox([100, 100, 400, 470], (480, 640)) is False

    def test_narrow_full_body_bbox_returns_true(self):
        # Berdiri normal — width 80, height 420, aspect 0.19, lulus default.
        assert is_full_body_bbox([280, 50, 360, 470], (480, 640)) is True

    def test_custom_max_aspect_ratio(self):
        # Default 0.6 reject lebar bbox.
        assert is_full_body_bbox([100, 100, 400, 470], (480, 640)) is False
        # Override 1.5 → terima (kalau h-ratio lulus default 0.7).
        # height=370/480=0.77, aspect=300/370=0.81 < 1.5
        assert is_full_body_bbox(
            [100, 100, 400, 470], (480, 640), max_aspect_ratio=1.5
        ) is True


# ────────────────────────────────────────────────────────────────────────────
# 2.3 — should_publish_violation
# ────────────────────────────────────────────────────────────────────────────

class TestShouldPublishViolation:
    """Temporal smoothing gate."""

    @pytest.mark.parametrize(
        "streak,min_streak,expected",
        [
            (0, 5, False),
            (1, 5, False),
            (4, 5, False),
            (5, 5, True),    # threshold tepat
            (6, 5, True),
            (100, 5, True),
            (3, 3, True),    # min_streak custom
            (2, 3, False),
        ],
    )
    def test_streak_threshold(self, streak, min_streak, expected):
        assert should_publish_violation(streak, min_streak=min_streak) is expected

    def test_negative_streak_returns_false_defensive(self):
        # Defensive: streak negatif tidak boleh trigger publish meski
        # min_streak juga negatif (logic error di caller).
        assert should_publish_violation(-1) is False
        assert should_publish_violation(-100, min_streak=5) is False

    def test_default_min_streak_is_5(self):
        # Eksplisit lock default value, supaya kalau berubah test ketahuan.
        assert should_publish_violation(4) is False
        assert should_publish_violation(5) is True


# ────────────────────────────────────────────────────────────────────────────
# 2.4 — AdaptiveSkip
# ────────────────────────────────────────────────────────────────────────────

class TestAdaptiveSkip:
    """Adaptive frame-skip controller."""

    def test_initial_n_equals_min_n(self):
        s = AdaptiveSkip(min_n=1, max_n=5)
        assert s.current_n() == 1

        s2 = AdaptiveSkip(min_n=2, max_n=5)
        assert s2.current_n() == 2

    def test_high_latency_increases_n_up_to_max(self):
        s = AdaptiveSkip(target_latency_ms=50, min_n=1, max_n=5)
        # Push samples way above target → n harus naik bertahap, capped di max.
        for _ in range(50):
            s.record(200.0)
            s.current_n()
        assert s.current_n() == 5

    def test_low_latency_decreases_n_down_to_min(self):
        s = AdaptiveSkip(target_latency_ms=50, min_n=1, max_n=5)
        # Naikkan dulu ke max
        for _ in range(20):
            s.record(200.0)
            s.current_n()
        assert s.current_n() == 5

        # Reset deque tidak diperlukan — record terus dengan latency rendah.
        # Window default 30 — perlu sampel cukup banyak agar avg turun.
        for _ in range(50):
            s.record(10.0)
            s.current_n()
        assert s.current_n() == 1

    def test_n_increment_is_gradual(self):
        # 3 sample tinggi → naik 1 saja, bukan langsung lompat ke max.
        s = AdaptiveSkip(target_latency_ms=50, min_n=1, max_n=5)
        s.record(500.0)
        s.record(500.0)
        s.record(500.0)
        assert s.current_n() == 2  # bukan 5

    def test_below_3_samples_holds_value(self):
        s = AdaptiveSkip()
        s.record(500.0)
        # < 3 sample → tahan nilai.
        assert s.current_n() == 1
        s.record(500.0)
        assert s.current_n() == 1

    def test_no_oscillation_around_target(self):
        # Sampel bolak-balik di sekitar target → n tidak melonjak-lonjak.
        s = AdaptiveSkip(target_latency_ms=50, min_n=1, max_n=5)
        history = []
        latencies = [40, 60, 40, 60, 40, 60, 40, 60, 40, 60]
        for lat in latencies:
            s.record(lat)
            history.append(s.current_n())
        # Karena avg di antara target/2 (25) dan target (50), atau di sekitar
        # target, n boleh naik 1 atau tahan tapi tidak pernah turun di bawah 1.
        # Variance terbatas: max(history) - min(history) <= 1.
        assert max(history) - min(history) <= 1

    def test_negative_latency_ignored(self):
        s = AdaptiveSkip()
        s.record(-1.0)
        s.record(-100.0)
        # Negatif tidak masuk buffer → length tetap 0.
        assert s.avg_latency_ms == 0.0

    def test_constructor_validation(self):
        with pytest.raises(ValueError, match="min_n"):
            AdaptiveSkip(min_n=0)
        with pytest.raises(ValueError, match="max_n"):
            AdaptiveSkip(min_n=3, max_n=2)
        with pytest.raises(ValueError, match="window"):
            AdaptiveSkip(window=0)
        with pytest.raises(ValueError, match="target_latency_ms"):
            AdaptiveSkip(target_latency_ms=0)

    def test_avg_latency_property(self):
        s = AdaptiveSkip()
        assert s.avg_latency_ms == 0.0
        s.record(50.0)
        s.record(150.0)
        assert s.avg_latency_ms == 100.0


# ────────────────────────────────────────────────────────────────────────────
# 4. estimate_visibility — 3-status gate
# ────────────────────────────────────────────────────────────────────────────

class TestEstimateVisibility:
    """Visibility classifier: full_enough vs unknown reasons."""

    def test_full_body_bbox_evaluable(self):
        # Full body, height 80%, narrow aspect.
        r = estimate_visibility([280, 80, 360, 470], (480, 640))
        assert r["evaluable"] is True
        assert r["reason"] == "full_enough"

    def test_too_small_returns_not_evaluable(self):
        # height_ratio 100/480 = 0.21 < 0.25
        r = estimate_visibility([300, 100, 340, 200], (480, 640))
        assert r["evaluable"] is False
        assert r["reason"] == "person_too_small"

    def test_partial_body_returns_not_evaluable(self):
        # height_ratio 0.30 — between too_small and partial threshold.
        r = estimate_visibility([280, 100, 360, 244], (480, 640))
        assert r["evaluable"] is False
        assert r["reason"] == "partial_body"

    def test_too_close_cropped_returns_not_evaluable(self):
        # height_ratio > 0.90, touches frame top + bottom.
        r = estimate_visibility([280, 0, 360, 480], (480, 640))
        assert r["evaluable"] is False
        assert r["reason"] == "person_cropped_or_too_close"

    def test_upper_body_only_wide_aspect(self):
        # height 50% lulus, tapi aspect 1.0 → upper_body_only
        r = estimate_visibility([100, 100, 340, 340], (480, 640))
        assert r["evaluable"] is False
        assert r["reason"] == "upper_body_only"

    def test_invalid_bbox_returns_not_evaluable(self):
        r = estimate_visibility([], (480, 640))
        assert r["evaluable"] is False
        r = estimate_visibility([100, 200, 200, 100], (480, 640))
        assert r["evaluable"] is False

    def test_invalid_frame_shape_returns_not_evaluable(self):
        r = estimate_visibility([100, 50, 200, 470], (480,))
        assert r["evaluable"] is False
        assert r["reason"] == "invalid_frame_shape"


# ────────────────────────────────────────────────────────────────────────────
# 5. evaluate_person — orchestrator dengan zone validation + conflict resolver
# ────────────────────────────────────────────────────────────────────────────

class TestEvaluatePerson:
    """Tiga status output: compliant / violation / unknown."""

    def _full_body(self):
        # Bbox person yang lulus visibility check.
        return [280, 80, 360, 470]

    def test_compliant_helmet_in_head_vest_in_torso(self):
        # Person height = 390, head zone = 80..216.5, torso zone = 177.5..431
        ppe = [
            {"class": "helmet", "bbox": [285, 85, 355, 145]},   # head zone
            {"class": "vest", "bbox": [285, 230, 355, 380]},    # torso zone
        ]
        r = evaluate_person(self._full_body(), ppe, (480, 640))
        assert r["status"] == "compliant"
        assert r["missing"] == []
        assert len(r["valid_ppe"]) == 2
        assert len(r["ignored_ppe"]) == 0

    def test_violation_no_helmet_in_head(self):
        # no_helmet di kepala = violation valid.
        ppe = [
            {"class": "no_helmet", "bbox": [285, 85, 355, 145]},
            {"class": "vest", "bbox": [285, 230, 355, 380]},
        ]
        r = evaluate_person(self._full_body(), ppe, (480, 640))
        assert r["status"] == "violation"
        assert r["missing"] == ["helmet"]

    def test_no_helmet_at_chest_ignored(self):
        # no_helmet di torso → di-IGNORE (bukan kepala).
        # Tidak ada helmet valid → tetap missing helmet karena tidak ada
        # helmet positif sama sekali. Tapi alasan-nya bukan no_helmet palsu.
        ppe = [
            {"class": "no_helmet", "bbox": [285, 250, 355, 350]},  # at chest!
            {"class": "vest", "bbox": [285, 230, 355, 380]},
        ]
        r = evaluate_person(self._full_body(), ppe, (480, 640))
        assert r["status"] == "violation"
        assert r["missing"] == ["helmet"]
        # no_helmet harus masuk ignored_ppe dengan reason outside_head
        assert any(
            p.get("class") == "no_helmet" and p.get("ignored_reason") == "outside_head"
            for p in r["ignored_ppe"]
        )

    def test_helmet_overrules_false_no_helmet(self):
        # Helmet valid + no_helmet juga di kepala → conflict resolver:
        # helmet menang, no_helmet di-ignore.
        ppe = [
            {"class": "helmet", "bbox": [285, 85, 355, 145]},
            {"class": "no_helmet", "bbox": [285, 90, 355, 150]},  # also head zone
            {"class": "vest", "bbox": [285, 230, 355, 380]},
        ]
        r = evaluate_person(self._full_body(), ppe, (480, 640))
        assert r["status"] == "compliant"
        assert r["missing"] == []
        # no_helmet harus ditandai overruled
        assert any(
            p.get("class") == "no_helmet" and p.get("ignored_reason") == "overruled_by_helmet"
            for p in r["ignored_ppe"]
        )

    def test_no_vest_at_head_ignored(self):
        # no_vest yang muncul di kepala → ignored.
        ppe = [
            {"class": "helmet", "bbox": [285, 85, 355, 145]},
            {"class": "no_vest", "bbox": [285, 90, 355, 150]},  # at head, not torso
        ]
        r = evaluate_person(self._full_body(), ppe, (480, 640))
        assert r["status"] == "violation"
        assert r["missing"] == ["vest"]
        assert any(
            p.get("class") == "no_vest" and p.get("ignored_reason") == "outside_torso"
            for p in r["ignored_ppe"]
        )

    def test_partial_body_returns_unknown_not_compliant(self):
        # Person bbox kecil → torso_evaluable=False meski head_evaluable=True.
        # Helmet di kepala terdeteksi valid → no missing helmet.
        # Tapi vest tidak bisa dievaluasi → status unknown dengan
        # reason `items_unknown:vest`.
        partial = [280, 100, 360, 244]  # ratio 0.30 → partial_body
        ppe = [
            {"class": "helmet", "bbox": [285, 105, 355, 165]},
        ]
        r = evaluate_person(partial, ppe, (480, 640))
        assert r["status"] == "unknown"
        assert "vest" in r["reason"]  # vest unknown karena torso tidak terlihat
        assert r["missing"] == []

    def test_too_close_returns_unknown(self):
        too_close = [50, 0, 600, 480]  # touch top+bottom
        r = evaluate_person(too_close, [], (480, 640))
        assert r["status"] == "unknown"
        assert r["reason"] == "person_cropped_or_too_close"

    def test_no_ppe_at_all_full_body_returns_violation(self):
        # Full body person tapi tidak ada PPE detection sama sekali.
        # Dengan zone gating, ini = violation (tidak ada helmet/vest valid).
        r = evaluate_person(self._full_body(), [], (480, 640))
        assert r["status"] == "violation"
        assert "helmet" in r["missing"]
        assert "vest" in r["missing"]

    def test_unknown_class_goes_to_ignored(self):
        ppe = [{"class": "weird_class", "bbox": [285, 85, 355, 145]}]
        r = evaluate_person(self._full_body(), ppe, (480, 640))
        assert any(
            p.get("ignored_reason") == "unknown_class" for p in r["ignored_ppe"]
        )


# ────────────────────────────────────────────────────────────────────────────
# 6. ViolationWindow — sliding window untuk confirmed violation
# ────────────────────────────────────────────────────────────────────────────

class TestViolationWindow:
    """Sliding window 6/8: lebih tahan jitter daripada consecutive streak."""

    def test_initial_buffer_empty(self):
        w = ViolationWindow(8, 6)
        assert w.confirmed_missing() is None

    def test_under_window_size_returns_none(self):
        w = ViolationWindow(8, 6)
        for _ in range(5):
            w.push(["helmet"])
        assert w.confirmed_missing() is None

    def test_six_of_eight_violation_confirmed(self):
        w = ViolationWindow(8, 6)
        # 7 violation, 1 unknown → 7 >= 6 → confirmed.
        for _ in range(7):
            w.push(["helmet"])
        w.push([])  # unknown/compliant frame
        assert w.confirmed_missing() == ("helmet",)

    def test_five_of_eight_violation_not_confirmed(self):
        w = ViolationWindow(8, 6)
        for _ in range(5):
            w.push(["helmet"])
        for _ in range(3):
            w.push([])
        assert w.confirmed_missing() is None

    def test_window_tolerates_single_jitter(self):
        # 6 violation, 1 jitter, 1 violation → 7 violations / 8 → confirmed.
        # Ini case yang consecutive streak akan reset.
        w = ViolationWindow(8, 6)
        for _ in range(6):
            w.push(["helmet"])
        w.push([])  # jitter
        w.push(["helmet"])
        assert w.confirmed_missing() == ("helmet",)

    def test_mixed_missing_types_picks_most_frequent(self):
        # 4 missing helmet, 4 missing vest → tidak ada yg >= 6 → None.
        w = ViolationWindow(8, 6)
        for _ in range(4):
            w.push(["helmet"])
        for _ in range(4):
            w.push(["vest"])
        assert w.confirmed_missing() is None

    def test_consistent_helmet_vest_combo(self):
        # 6 missing helmet+vest dari 8 → confirmed.
        w = ViolationWindow(8, 6)
        for _ in range(6):
            w.push(["helmet", "vest"])
        for _ in range(2):
            w.push([])
        assert w.confirmed_missing() == ("helmet", "vest")

    def test_missing_order_canonicalized(self):
        # ('helmet', 'vest') == ('vest', 'helmet') after sort.
        w = ViolationWindow(8, 6)
        for _ in range(3):
            w.push(["helmet", "vest"])
        for _ in range(3):
            w.push(["vest", "helmet"])
        assert w.confirmed_missing() == ("helmet", "vest")

    def test_reset_clears_buffer(self):
        w = ViolationWindow(8, 6)
        for _ in range(7):
            w.push(["helmet"])
        assert w.confirmed_missing() == ("helmet",)
        w.reset()
        assert w.confirmed_missing() is None

    def test_constructor_validation(self):
        with pytest.raises(ValueError, match="window_size"):
            ViolationWindow(window_size=0, confirm_count=1)
        with pytest.raises(ValueError, match="confirm_count"):
            ViolationWindow(window_size=8, confirm_count=0)
        with pytest.raises(ValueError, match="confirm_count"):
            ViolationWindow(window_size=8, confirm_count=10)

    def test_buffer_snapshot_for_debug(self):
        w = ViolationWindow(4, 3)
        w.push(["helmet"])
        w.push([])
        w.push(["vest"])
        snap = w.buffer_snapshot
        assert snap == [("helmet",), (), ("vest",)]

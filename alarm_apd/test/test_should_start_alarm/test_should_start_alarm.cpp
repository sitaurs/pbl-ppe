// Bug 4 (Post-alarm retrigger) — exploration test untuk firmware quiet window.
//
// Validates: Requirements 1.7, 1.8 (Current Behavior — firmware tanpa quiet window).
//
// Property (Property 8, 9 di design.md):
//   Property 8: FOR ALL X WHERE isBugConditionPostAlarmRetrigger(X) DO
//                   shouldStartAlarm'(now, lastEnded, quietMs) == false
//   Property 9: WHEN (now - lastEnded) >= quietMs DO
//                   shouldStartAlarm'(now, lastEnded, quietMs) == true
//
// **EXPECTED OUTCOME pada UNFIXED code**: TEST GAGAL COMPILE — helper
// `shouldStartAlarm` belum ada di `alarm_apd.ino`. Compile error / missing
// symbol adalah counterexample yang dimaksud (helper belum diimplementasikan).
//
// Setelah fix (task 6.2) menambahkan helper, file ini akan compile dan PASS
// di PlatformIO native environment.
//
// Cara menjalankan (setelah fix):
//   pio test -e native -f test_should_start_alarm
//
// Catatan: file ini saat ini SENGAJA ditulis dengan asumsi helper sudah ada
// untuk men-trigger compile failure pada UNFIXED code. Forward declaration
// helper dilepas karena justru itulah counterexample-nya.

#include <unity.h>

// Forward declaration agar test ini compile melawan SUMBER UNFIXED code akan
// menghasilkan linker error: "undefined reference to `shouldStartAlarm`".
// Pada FIXED code (task 6.2), helper ini akan didefinisikan di file pure
// header `alarm_apd/lib/alarm_gating/alarm_gating.h` atau langsung di
// `alarm_apd.ino`, dan linker akan lulus.
extern bool shouldStartAlarm(unsigned long now,
                             unsigned long lastEndedAt,
                             unsigned long quietMs);

// ─── Property 8: dalam quiet window → shouldStartAlarm == false ───────────────

void test_within_quiet_window_returns_false(void) {
    // Counterexample konkret dari bugfix.md:
    //   t = 18000 ms (alarm gas selesai), incoming apd_violation di t = 19000 ms,
    //   quietWindowMs = 10000.
    //   (19000 - 18000) = 1000 ms < 10000 ms → harus FALSE.
    TEST_ASSERT_FALSE(shouldStartAlarm(19000UL, 18000UL, 10000UL));
}

void test_just_inside_quiet_window_returns_false(void) {
    // 1 ms sebelum window habis → masih harus FALSE.
    TEST_ASSERT_FALSE(shouldStartAlarm(19999UL, 10000UL, 10000UL));
}

// ─── Property 9: di luar quiet window → shouldStartAlarm == true ──────────────

void test_at_quiet_window_boundary_returns_true(void) {
    // Tepat di boundary: (now - lastEnded) == quietMs → harus TRUE.
    TEST_ASSERT_TRUE(shouldStartAlarm(20000UL, 10000UL, 10000UL));
}

void test_well_after_quiet_window_returns_true(void) {
    TEST_ASSERT_TRUE(shouldStartAlarm(100000UL, 10000UL, 10000UL));
}

// ─── Edge case: lastEndedAt == 0 (belum pernah alarm) → harus TRUE ────────────

void test_no_previous_alarm_returns_true(void) {
    TEST_ASSERT_TRUE(shouldStartAlarm(50000UL, 0UL, 10000UL));
}

// ─── Edge case: millis() overflow (now < lastEndedAt) → conservative TRUE ─────

void test_millis_overflow_returns_true(void) {
    // now wrapped around setelah ~49.7 hari → lastEndedAt > now.
    // Helper harus mengembalikan TRUE (jangan blokir setelah overflow).
    TEST_ASSERT_TRUE(shouldStartAlarm(100UL, 4294967200UL, 10000UL));
}

// ─── Test runner ──────────────────────────────────────────────────────────────

void setUp(void) {}
void tearDown(void) {}

int main(int argc, char **argv) {
    UNITY_BEGIN();
    RUN_TEST(test_within_quiet_window_returns_false);
    RUN_TEST(test_just_inside_quiet_window_returns_false);
    RUN_TEST(test_at_quiet_window_boundary_returns_true);
    RUN_TEST(test_well_after_quiet_window_returns_true);
    RUN_TEST(test_no_previous_alarm_returns_true);
    RUN_TEST(test_millis_overflow_returns_true);
    return UNITY_END();
}

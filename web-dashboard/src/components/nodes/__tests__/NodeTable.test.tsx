// Bug 1 (CSRF) — exploration test for `dashboard-and-alarm-quickfix` spec, task 1a.
//
// Validates: Requirements 1.1, 1.2 (Current Behavior — bug condition).
//
// Encoding `isBugConditionCsrf`:
//   X.page = '/nodes' AND X.button ∈ {TestCamera, TestMQTT}
//   AND X.method = 'POST' AND X.userAuthenticated = true
//   AND X.csrfHeaderPresent = false
//
// Property (Property 1 di design.md): untuk semua tombol Test Camera/MQTT,
// request POST /api/nodes/test-connection SHALL menyertakan header
// `X-CSRF-Token` non-empty (dengan memakai `useApiFetch()`).
//
// **EXPECTED OUTCOME pada UNFIXED code**: Test FAILS — `NodeTable.handleTestConnection`
// memanggil `fetch` mentah tanpa wrapper CSRF, sehingga middleware membalas 403
// `csrf_token_invalid`. Kegagalan ini mengkonfirmasi Bug 1.
//
// Catatan implementasi: workspace ini belum memuat React Testing Library, sehingga
// test ini melakukan **static-source verification** dengan membaca file
// `NodeTable.tsx`. Begitu fix diimplementasikan, source akan memakai `apiFetch`
// (yang otomatis attach `X-CSRF-Token` lewat `useApiFetch`), dan test berubah
// menjadi PASS. Pendekatan ini sesuai panduan "static-source verification"
// untuk environment tanpa RTL.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const NODE_TABLE_PATH = path.resolve(
  __dirname,
  '..',
  'NodeTable.tsx',
);

function readNodeTableSource(): string {
  return readFileSync(NODE_TABLE_PATH, 'utf8');
}

/**
 * Ekstrak isi function body `handleTestConnection` dari source string.
 * Mengembalikan string body (atau null jika tidak ditemukan).
 *
 * Pencarian dilakukan dengan menemukan deklarasi `handleTestConnection` lalu
 * menghitung kurung kurawal sampai seimbang.
 */
function extractHandleTestConnectionBody(source: string): string | null {
  const marker = 'handleTestConnection';
  const declIdx = source.indexOf(marker);
  if (declIdx === -1) return null;

  // Cari kurung kurawal pembuka pertama setelah marker.
  const openIdx = source.indexOf('{', declIdx);
  if (openIdx === -1) return null;

  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(openIdx, i + 1);
      }
    }
  }
  return null;
}

describe('Bug 1 (CSRF) exploration — NodeTable.handleTestConnection', () => {
  it('POST /api/nodes/test-connection harus melalui apiFetch (CSRF-aware), bukan fetch mentah', () => {
    const source = readNodeTableSource();
    const body = extractHandleTestConnectionBody(source);

    expect(body, '`handleTestConnection` tidak ditemukan di NodeTable.tsx').not.toBeNull();
    const fnBody = body!;

    // Body harus mengirim ke endpoint test-connection (sanity).
    expect(
      fnBody.includes('/api/nodes/test-connection'),
      '`handleTestConnection` harus memanggil endpoint /api/nodes/test-connection',
    ).toBe(true);

    // Property 1: harus memakai `apiFetch(` (wrapper CSRF) dan TIDAK boleh
    // memakai `fetch(` mentah untuk POST ini. Pada UNFIXED code, body memakai
    // `fetch(` mentah → assertion gagal → counterexample mengkonfirmasi Bug 1.
    const usesApiFetch = /\bapiFetch\s*\(/.test(fnBody);
    const usesRawFetch = /(?<![A-Za-z0-9_])fetch\s*\(\s*['"`]\/api\/nodes\/test-connection/.test(
      fnBody,
    );

    expect(
      usesApiFetch,
      'handleTestConnection harus memakai apiFetch (useApiFetch) untuk attach X-CSRF-Token',
    ).toBe(true);
    expect(
      usesRawFetch,
      'handleTestConnection TIDAK boleh memakai fetch() mentah untuk endpoint mutasi',
    ).toBe(false);
  });

  it('NodeTable harus mengimpor useApiFetch hook', () => {
    const source = readNodeTableSource();
    const importsApiFetch =
      /import\s*\{[^}]*\buseApiFetch\b[^}]*\}\s*from\s*['"]@\/hooks\/use-csrf-token['"]/.test(
        source,
      );

    expect(
      importsApiFetch,
      'NodeTable harus mengimpor useApiFetch dari @/hooks/use-csrf-token',
    ).toBe(true);
  });
});


// ─── Bug 1 (CSRF) — Preservation property tests (task 2a) ─────────────────────
//
// **Validates: Requirements 3.1, 3.3** (Unchanged Behavior — non-buggy paths).
//
// Property 2 (Preservation) di design.md:
//
//   FOR ALL X WHERE NOT isBugConditionCsrf(X):
//     simulate_handleTestConnection(X) === simulate_handleTestConnection'(X)
//
//   In other words: requests yang BUKAN POST /api/nodes/test-connection dari
//   tombol Test Camera/Test MQTT (mis. GET /api/nodes/{id}/status, atau tombol
//   Test internal NodeWizard yang sudah memakai useApiFetch) SHALL tidak
//   berubah perilakunya setelah fix.
//
// **EXPECTED OUTCOME pada UNFIXED code**: Tests PASS — encode baseline behavior.
//
// Catatan implementasi: workspace tidak punya React Testing Library, jadi
// test ini melakukan **static-source verification** sama seperti exploration
// test 1a. Yang dilock-in adalah karakteristik source code:
//
//   1) GET path `/api/nodes/{id}/status` di NodeTable.tsx tetap memakai
//      `fetch(` mentah (bukan `apiFetch(`) — middleware tidak memeriksa CSRF
//      untuk GET, jadi mengubahnya akan keluar dari scope dan berisiko regresi.
//   2) NodeWizard.tsx tetap mengimpor `useApiFetch` dari
//      `@/hooks/use-csrf-token` — tombol Test internal wizard yang sudah
//      ber-CSRF tidak boleh berubah (klausa 3.3).

const NODE_WIZARD_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'wizard',
  'NodeWizard.tsx',
);

function readNodeWizardSource(): string {
  return readFileSync(NODE_WIZARD_PATH, 'utf8');
}

describe('Bug 1 (CSRF) preservation — non-buggy paths SHALL tetap unchanged', () => {
  it('GET /api/nodes/{id}/status di NodeTable harus tetap memakai fetch() mentah (GET dikecualikan dari CSRF)', () => {
    const source = readNodeTableSource();

    // GET path `/api/nodes/${nodeId}/status` saat ini memakai `fetch(` mentah
    // — properti preservation: setelah fix, GET path SHALL tidak berubah.
    // Pattern: `fetch(`(backtick template)/api/nodes/${...}/status`...)` —
    // disederhanakan dengan mencari substring kunci di body file.
    const usesRawFetchForStatus =
      /\bfetch\s*\(\s*`\/api\/nodes\/\$\{[^}]+\}\/status`/.test(source);

    expect(
      usesRawFetchForStatus,
      'GET /api/nodes/{id}/status SHALL tetap memakai fetch() mentah (GET tidak butuh CSRF)',
    ).toBe(true);

    // Property tambahan: TIDAK boleh ada `apiFetch(` yang menargetkan
    // endpoint `/status` — itu akan menambah header CSRF yang tidak perlu.
    const apiFetchOnStatus =
      /\bapiFetch\s*\(\s*`\/api\/nodes\/\$\{[^}]+\}\/status`/.test(source);
    expect(
      apiFetchOnStatus,
      'GET /api/nodes/{id}/status TIDAK boleh memakai apiFetch (akan menambah CSRF header yang tidak perlu)',
    ).toBe(false);
  });

  it('NodeWizard masih mengimpor useApiFetch dari @/hooks/use-csrf-token (tombol Test internal wizard tidak terpengaruh fix)', () => {
    const wizardSource = readNodeWizardSource();

    const importsApiFetch =
      /import\s*\{[^}]*\buseApiFetch\b[^}]*\}\s*from\s*['"]@\/hooks\/use-csrf-token['"]/.test(
        wizardSource,
      );

    expect(
      importsApiFetch,
      'NodeWizard.tsx SHALL tetap mengimpor useApiFetch (klausa 3.3 — tombol Test internal wizard sudah ber-CSRF)',
    ).toBe(true);

    // Property tambahan: NodeWizard menggunakan `useApiFetch()` di body komponen.
    const usesApiFetch = /\buseApiFetch\s*\(\s*\)/.test(wizardSource);
    expect(
      usesApiFetch,
      'NodeWizard.tsx SHALL tetap memanggil useApiFetch() di body komponen',
    ).toBe(true);
  });

  it('NodeWizard internal Test buttons (Test Camera/Test MQTT) memakai apiFetch, bukan fetch mentah', () => {
    const wizardSource = readNodeWizardSource();

    // Cari blok handleTestCameraConnection dan handleTestMqtt — keduanya
    // SHALL memakai `apiFetch(` (bukan `fetch(` mentah) untuk endpoint
    // /api/nodes/test-connection.
    //
    // Static check: source harus mengandung minimal satu `apiFetch(` yang
    // menargetkan `/api/nodes/test-connection`.
    const apiFetchOnTestConnection =
      /\bapiFetch\s*\(\s*['"`]\/api\/nodes\/test-connection['"`]/.test(
        wizardSource,
      );

    expect(
      apiFetchOnTestConnection,
      'NodeWizard SHALL memakai apiFetch untuk POST /api/nodes/test-connection (tombol Test internal wizard, klausa 3.3)',
    ).toBe(true);

    // Property tambahan: tidak ada `fetch(` mentah ke endpoint test-connection
    // di NodeWizard (wizard sudah ber-CSRF; preservation = tidak berubah).
    const rawFetchOnTestConnection =
      /(?<![A-Za-z0-9_])fetch\s*\(\s*['"`]\/api\/nodes\/test-connection['"`]/.test(
        wizardSource,
      );
    expect(
      rawFetchOnTestConnection,
      'NodeWizard TIDAK boleh memakai fetch() mentah untuk /api/nodes/test-connection (wizard internal sudah ber-CSRF)',
    ).toBe(false);
  });
});

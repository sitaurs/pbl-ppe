/**
 * Audit log writer untuk SafeGuard APD Web Dashboard.
 *
 * Sesuai design.md §Audit Log Writer Contract dan Requirements 13.1, 13.2, 13.7.
 *
 * - Append-only: tidak ada API update/delete (di-enforce oleh property test
 *   P12 yang scan semua route handler).
 * - Error-swallow: kegagalan tulis Audit_Log TIDAK PERNAH boleh menghentikan
 *   business logic (Req 13.7). Error di-log ke stderr lewat `console.warn`.
 * - Truncate metadata ke 4 KB JSON-serialized agar tidak membengkak.
 */

import type { AuditAction } from "./action-types";

/**
 * Entri audit log baru. `userId` boleh berisi UUID user atau string khusus
 * `system:python-backend` saat dipicu oleh Service_Token. Field lain opsional
 * tapi sangat dianjurkan untuk forensic.
 */
export interface AuditEntry {
  userId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

const MAX_METADATA_BYTES = 4 * 1024;

function serializeMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  try {
    let json = JSON.stringify(metadata);
    if (Buffer.byteLength(json, "utf8") > MAX_METADATA_BYTES) {
      // Truncate: keep first MAX bytes and append marker. JSON validity is
      // not preserved by truncation — wrap in a sentinel object instead.
      const truncated = json.slice(0, MAX_METADATA_BYTES - 32);
      json = JSON.stringify({ truncated: true, head: truncated });
    }
    return json;
  } catch {
    return JSON.stringify({ error: "metadata_serialization_failed" });
  }
}

/**
 * Append a new audit log entry. Returns void; errors are swallowed and
 * logged to stderr only — caller business logic NEVER fails because of an
 * audit write (Req 13.7).
 */
export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: serializeMetadata(entry.metadata),
      },
    });
  } catch (err) {
    // Audit log writes must NEVER bubble up. Just warn and continue.
    console.warn("[audit-log] AuditLog write failure:", err);
  }
}

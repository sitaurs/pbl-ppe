/**
 * Audit action identifier union.
 *
 * Mirrors `design.md §Audit Log Writer Contract` and the action categories
 * referenced throughout Requirement 13. Every action that the audit log
 * writer (`appendAuditLog`) accepts MUST be listed here so that the union is
 * the single source of truth for type-checking call sites.
 *
 * The `ALL_AUDIT_ACTIONS` array preserves the union declaration order so the
 * `AUDITED_ACTIONS` set can be derived directly without missing entries.
 */

export type AuditAction =
  | "auth:login:success" | "auth:login:failure" | "auth:logout"
  | "auth:permission-denied" | "auth:account-lockout"
  | "auth:2fa:enabled" | "auth:2fa:disabled" | "auth:2fa:recovery-used"
  | "auth:sector-denied"
  | "node:create" | "node:update" | "node:delete" | "node:toggle"
  | "violation:acknowledge" | "violation:delete" | "violation:export"
  | "setting:update:branding" | "setting:update:notification" | "setting:update:system"
  | "user:create" | "user:update" | "user:delete" | "user:password-reset" | "user:unlock"
  | "role:create" | "role:update" | "role:delete"
  | "report:export" | "audit-log:export" | "audit-log:purge"
  | "service-token:rotate";

export const ALL_AUDIT_ACTIONS: AuditAction[] = [
  "auth:login:success", "auth:login:failure", "auth:logout",
  "auth:permission-denied", "auth:account-lockout",
  "auth:2fa:enabled", "auth:2fa:disabled", "auth:2fa:recovery-used",
  "auth:sector-denied",
  "node:create", "node:update", "node:delete", "node:toggle",
  "violation:acknowledge", "violation:delete", "violation:export",
  "setting:update:branding", "setting:update:notification", "setting:update:system",
  "user:create", "user:update", "user:delete", "user:password-reset", "user:unlock",
  "role:create", "role:update", "role:delete",
  "report:export", "audit-log:export", "audit-log:purge",
  "service-token:rotate",
];

/**
 * Subset of audit actions that the permission middleware MUST log. Currently
 * every action defined above is audited, but this set is the explicit
 * registration point that handlers consult before calling `appendAuditLog`.
 */
export const AUDITED_ACTIONS = new Set<AuditAction>(ALL_AUDIT_ACTIONS);

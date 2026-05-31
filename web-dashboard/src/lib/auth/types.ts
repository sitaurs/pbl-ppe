/**
 * Core type contracts untuk Auth + RBAC system.
 *
 * Sumber: `design.md §Core Type Contracts`. Dipakai oleh middleware,
 * route handlers, dan layer RBAC untuk berbagi shape `RequestContext`,
 * representasi user terautentikasi, dan request/response API auth.
 *
 * Catatan: `PermissionId` di-import dengan `import type` dari
 * `@/lib/rbac/permission-types` (dibuat di task 1.3). Karena task 1.2 dan
 * 1.3 berjalan paralel, file target import mungkin belum ada saat tsc
 * pertama kali dijalankan; structural typing tetap valid setelah task 1.3
 * selesai. JANGAN re-export `PermissionId` dari sini — kanonikalnya
 * tetap di `permission-types.ts`.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { PermissionId } from "@/lib/rbac/permission-types";

/** Status akun User pada tabel User.status */
export type UserStatus = "active" | "disabled" | "locked";

/**
 * User yang sudah terautentikasi via Session_Cookie.
 * Bukan representasi langsung baris DB; sudah di-flatten dengan
 * permissions dari Role + sectorIds dari SectorAssignment, siap dipakai
 * permission decision di middleware/handler.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: { id: string; name: string; permissions: PermissionId[] };
  sectorIds: string[]; // empty for non-scoped roles (Super_Admin/Admin_K3/Auditor)
  totpEnabled: boolean;
  mustChangePassword: boolean;
  status: UserStatus;
}

/**
 * Representasi baris Session yang relevan bagi middleware/handler.
 * Sub-set dari kolom `Session` di Prisma schema; password/secret tidak
 * pernah dimasukkan di sini.
 */
export interface SessionRow {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: Date;
  lastRefreshedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Konteks request yang dibangun oleh middleware dan dikonsumsi oleh
 * route handler via `getRequestContext(req)`.
 *
 * - `user` null untuk pemanggil Service_Token (Python backend).
 * - `sectorIds === null` berarti tidak terskop sektor (Super_Admin /
 *   Admin_K3 / Auditor / Service_Token); `[]` berarti terskop tapi
 *   tidak ada sektor ter-assign (Supervisor/PIC tanpa SectorAssignment).
 * - `clientIp` sudah melewati resolusi `Trusted_Proxy_IPs` (loopback
 *   atau CF-Connecting-IP dari Cloudflare edge yang valid).
 */
export interface RequestContext {
  user: AuthenticatedUser | null;
  serviceToken: boolean;
  sectorIds: string[] | null;
  csrfToken: string | null;
  clientIp: string;
}

// -----------------------------------------------------------------------------
// API request/response contracts dipakai oleh route /api/auth/*
// -----------------------------------------------------------------------------

/** Body POST /api/auth/login */
export interface LoginRequest {
  username: string;
  password: string;
  /** TOTP 6 digit atau recovery code; required jika user.totpEnabled === true */
  totp?: string;
}

/** Response 200 dari POST /api/auth/login */
export interface LoginResponse {
  csrfToken: string;
  /** Path tujuan redirect setelah login (default per role) */
  redirect: string;
  /** Hadir & true bila step 2FA dibutuhkan, login belum tuntas */
  needs2fa?: boolean;
}

/** Body POST /api/auth/change-password */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/** Response 200 dari POST /api/auth/2fa/setup */
export interface TwoFactorSetupResponse {
  /** Identifier ephemeral untuk mencocokkan setup → verify (TTL 10 menit) */
  setupId: string;
  /** URI `otpauth://totp/...` yang dapat dipasang di authenticator app */
  otpauthUri: string;
  /** Secret base32 untuk entry manual jika QR tidak terbaca */
  secretBase32: string;
}

/** Body POST /api/auth/2fa/verify */
export interface TwoFactorVerifyRequest {
  setupId: string;
  /** TOTP code 6 digit dari authenticator */
  code: string;
}

/** Response 200 dari POST /api/auth/2fa/verify */
export interface TwoFactorVerifyResponse {
  /** Recovery codes plaintext, ditampilkan SEKALI saja kepada user */
  recoveryCodes: string[];
}

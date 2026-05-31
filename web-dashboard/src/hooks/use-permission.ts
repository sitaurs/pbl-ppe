"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import type { PermissionId } from "@/lib/rbac/permission-types";

/**
 * Apakah user aktif memiliki permission tertentu? Kembalikan false jika
 * loading atau anonim.
 */
export function usePermission(permission: PermissionId | PermissionId[], mode: "any" | "all" = "any"): boolean {
  const { user } = useCurrentUser();
  if (!user) return false;
  const required = Array.isArray(permission) ? permission : [permission];
  if (required.length === 0) return true;
  if (mode === "all") return required.every((p) => user.role.permissions.includes(p));
  return required.some((p) => user.role.permissions.includes(p));
}

export function useSectorScope(): { sectorIds: string[] | null } {
  const { user } = useCurrentUser();
  if (!user) return { sectorIds: null };
  if (user.role.name === "Supervisor" || user.role.name === "PIC_Sektor") {
    return { sectorIds: user.sectorIds };
  }
  return { sectorIds: null };
}

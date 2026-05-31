"use client";

/**
 * PermissionGate — render `children` hanya jika user aktif memiliki
 * Permission tertentu. Sesuai design.md §Frontend Components & Pages dan
 * Req 14.4.
 *
 * Props:
 *  - permission: single PermissionId | PermissionId[]
 *  - mode: "any" (default) atau "all"
 *  - fallback: ReactNode | null (default null)
 */
import type { ReactNode } from "react";
import { usePermission } from "@/hooks/use-permission";
import type { PermissionId } from "@/lib/rbac/permission-types";

interface Props {
  permission: PermissionId | PermissionId[];
  mode?: "any" | "all";
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({
  permission,
  mode = "any",
  fallback = null,
  children,
}: Props) {
  const allowed = usePermission(permission, mode);
  return <>{allowed ? children : fallback}</>;
}

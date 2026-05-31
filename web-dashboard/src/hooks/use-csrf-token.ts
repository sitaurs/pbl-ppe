"use client";

import { useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

/**
 * Wrap fetch yang otomatis attach `X-CSRF-Token` untuk request mutasi.
 * Dipakai client component yang melakukan POST/PUT/PATCH/DELETE.
 *
 * PENTING: return value DIMEMOIZE dengan useCallback agar reference stabil
 * antar render. Tanpa ini, setiap render menghasilkan fungsi baru yang
 * memicu infinite loop pada `useEffect`/`useCallback` yang depend padanya.
 */
export function useApiFetch(): (path: string, init?: RequestInit) => Promise<Response> {
  const { csrfToken, refresh } = useCurrentUser();

  return useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const method = (init.method ?? "GET").toUpperCase();
      const headers = new Headers(init.headers);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        let token = csrfToken;
        if (!token) {
          // Lazy-load csrf token jika belum ada (e.g. setelah refresh).
          const res = await fetch("/api/auth/csrf", { credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as { csrfToken: string | null };
            token = data.csrfToken;
          }
        }
        if (token) headers.set("X-CSRF-Token", token);
      }
      headers.set("Accept", "application/json");
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(path, {
        ...init,
        credentials: "include",
        headers,
      });
      if (response.status === 401) {
        // Force re-auth by refreshing context (will redirect via middleware on next nav).
        await refresh();
      }
      return response;
    },
    [csrfToken, refresh],
  );
}

"use client";

/**
 * useCurrentUser + AuthContext.
 *
 * Sesuai design.md §Frontend Components & Pages dan Req 14.7.
 *
 * - Fetch /api/auth/me saat mount.
 * - Refresh on window focus.
 * - Auto re-fetch saat fetch lain return 401.
 *
 * Konsumen pakai `useCurrentUser()` untuk akses `{ user, csrfToken, refresh }`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { AuthenticatedUser } from "@/lib/auth/types";

interface AuthState {
  user: AuthenticatedUser | null;
  csrfToken: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  csrfToken: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          user: AuthenticatedUser;
          csrfToken: string | null;
        };
        setUser(data.user);
        setCsrfToken(data.csrfToken);
      } else {
        setUser(null);
        setCsrfToken(null);
      }
    } catch {
      setUser(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = (): void => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, csrfToken, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCurrentUser(): AuthState {
  return useContext(AuthContext);
}

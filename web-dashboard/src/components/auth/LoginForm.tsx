"use client";

/**
 * LoginForm — 2-step state machine: (1) username+password, (2) totp.
 *
 * Submit ke /api/auth/login; handle 401, 429, 503; redirect ke `redirect`
 * param atau response.redirect.
 */
import { useSearchParams } from "next/navigation";
import { useState } from "react";

type Step = "credentials" | "totp";

export function LoginForm({ migrationPending }: { migrationPending?: boolean }) {
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect") ?? null;

  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (migrationPending) {
      setError("Migrasi belum dijalankan. Eksekusi `npm run migrate:json-to-db`.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          username,
          password,
          totp: step === "totp" ? totp : undefined,
          redirect: redirectParam,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          needs2fa?: boolean;
          csrfToken?: string;
          redirect?: string;
        };
        if (data.needs2fa) {
          setStep("totp");
          setLoading(false);
          return;
        }
        const target = data.redirect ?? "/";
        // Use a full navigation so the freshly-set HttpOnly cookie is definitely
        // included on the next request, even when the dashboard is being
        // accessed through a tunnel / non-local dev origin.
        window.location.assign(target);
        return;
      }
      if (res.status === 429) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? "Terlalu banyak percobaan. Coba lagi nanti.");
      } else if (res.status === 401) {
        setError("Username atau password salah");
      } else if (res.status === 503) {
        setError("Sistem belum siap. Hubungi admin.");
      } else {
        setError("Login gagal");
      }
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="login-form">
      {/* Hidden h1 for accessibility / SEO */}
      <h1 className="sr-only">Masuk SafeGuard APD</h1>

      {migrationPending && (
        <div className="login-form__alert login-form__alert--warning">
          Migrasi data belum dijalankan. Eksekusi <code>npm run migrate:json-to-db</code> sebelum login.
        </div>
      )}
      {error && (
        <div role="alert" className="login-form__alert login-form__alert--error">
          {error}
        </div>
      )}

      {step === "credentials" && (
        <>
          <label className="login-form__label">
            <span className="login-form__label-text">Username</span>
            <div className="login-form__input-wrapper">
              <svg className="login-form__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                placeholder="Masukkan username"
                className="login-form__input"
              />
            </div>
          </label>
          <label className="login-form__label">
            <span className="login-form__label-text">Password</span>
            <div className="login-form__input-wrapper">
              <svg className="login-form__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Masukkan password"
                className="login-form__input"
              />
            </div>
          </label>
        </>
      )}

      {step === "totp" && (
        <label className="login-form__label">
          <span className="login-form__label-text">Kode 2FA (TOTP)</span>
          <div className="login-form__input-wrapper">
            <svg className="login-form__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6,10}"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              autoComplete="one-time-code"
              required
              placeholder="000000"
              className="login-form__input"
              style={{ textAlign: "center", letterSpacing: "0.2em", fontSize: "1.1rem" }}
            />
          </div>
          <span className="login-form__hint">
            Atau gunakan recovery code 10 karakter.
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={loading || migrationPending}
        className="login-form__submit"
      >
        {loading ? "Memproses..." : step === "totp" ? "Verifikasi" : "Masuk"}
      </button>
    </form>
  );
}

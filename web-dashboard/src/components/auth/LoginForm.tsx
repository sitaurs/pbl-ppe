"use client";

/**
 * LoginForm — 2-step state machine: (1) username+password, (2) totp.
 *
 * Submit ke /api/auth/login; handle 401, 429, 503; redirect ke `redirect`
 * param atau response.redirect.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Step = "credentials" | "totp";

export function LoginForm({ migrationPending }: { migrationPending?: boolean }) {
  const router = useRouter();
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
        router.push(target);
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
    <form onSubmit={submit} className="flex flex-col gap-4 w-full max-w-sm">
      <h1 className="text-xl font-bold">Masuk SafeGuard APD</h1>
      {migrationPending && (
        <div className="bg-yellow-100 border border-yellow-300 p-3 rounded text-sm text-yellow-800">
          Migrasi data belum dijalankan. Eksekusi <code>npm run migrate:json-to-db</code> sebelum login.
        </div>
      )}
      {error && (
        <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800">
          {error}
        </div>
      )}
      {step === "credentials" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="border rounded px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="border rounded px-3 py-2"
            />
          </label>
        </>
      )}
      {step === "totp" && (
        <label className="flex flex-col gap-1 text-sm">
          <span>Kode 2FA (TOTP)</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6,10}"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            autoComplete="one-time-code"
            required
            className="border rounded px-3 py-2"
          />
          <span className="text-xs text-gray-500">
            Atau gunakan recovery code 10 karakter.
          </span>
        </label>
      )}
      <button
        type="submit"
        disabled={loading || migrationPending}
        className="bg-orange-500 text-white py-2 rounded disabled:opacity-50"
      >
        {loading ? "Memproses..." : step === "totp" ? "Verifikasi" : "Masuk"}
      </button>
    </form>
  );
}

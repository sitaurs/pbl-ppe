"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { useApiFetch } from "@/hooks/use-csrf-token";

export default function ChangePasswordPage() {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("Konfirmasi password tidak cocok");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (res.ok) {
        router.push("/");
        return;
      }
      const data = (await res.json()) as { error?: string; rules?: string[] };
      if (data.rules && data.rules.length > 0) {
        setError(`Pelanggaran: ${data.rules.join(", ")}`);
      } else if (data.error === "invalid_old_password") {
        setError("Password lama salah");
      } else {
        setError(data.error ?? "Gagal mengganti password");
      }
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <form
        onSubmit={submit}
        className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md flex flex-col gap-4"
      >
        <h1 className="text-xl font-bold">Ganti Password</h1>
        {error && (
          <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800">
            {error}
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span>Password lama</span>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            className="border rounded px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Password baru</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="border rounded px-3 py-2"
          />
          <PasswordStrengthMeter password={newPassword} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Konfirmasi password baru</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="border rounded px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="bg-orange-500 text-white py-2 rounded disabled:opacity-50"
        >
          {loading ? "Memproses..." : "Simpan"}
        </button>
      </form>
    </main>
  );
}

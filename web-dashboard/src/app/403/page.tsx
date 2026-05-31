/**
 * /403 — forbidden page (Req 14.5).
 */
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-slate-50">
      <h1 className="text-2xl font-bold">403 — Akses Ditolak</h1>
      <p className="text-slate-600">
        Anda tidak memiliki izin untuk mengakses halaman ini.
      </p>
      <Link
        href="/"
        className="bg-orange-500 text-white px-4 py-2 rounded"
      >
        Kembali ke Dashboard
      </Link>
    </main>
  );
}

/**
 * /login — Login_Page (Req 14.2). No sidebar, premium glassmorphism theme.
 */
import { LoginForm } from "@/components/auth/LoginForm";
import { isMigrationPending } from "@/lib/migration-state";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const migrationPending = isMigrationPending();
  return (
    <main className="login-page">
      {/* Full-screen background image */}
      <Image
        src="/login-bg.png"
        alt=""
        fill
        priority
        className="login-page__bg"
      />
      {/* Dark overlay for readability */}
      <div className="login-page__overlay" />

      {/* Centered glass card */}
      <div className="login-page__container">
        <div className="login-page__card">
          {/* Logo & branding */}
          <div className="login-page__brand">
            <div className="login-page__logo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="login-page__title">SafeGuard APD</h1>
            <p className="login-page__subtitle">Masuk ke Dashboard Monitoring</p>
          </div>

          {/* Divider */}
          <div className="login-page__divider" />

          {/* Login form */}
          <LoginForm migrationPending={migrationPending} />

          {/* Footer inside card */}
          <p className="login-page__footer">
            Sistem Deteksi Pelanggaran K3 — Politeknik Negeri Malang
          </p>
        </div>
      </div>
    </main>
  );
}

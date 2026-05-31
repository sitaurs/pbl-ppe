/**
 * /login — Login_Page (Req 14.2). No sidebar, basic theme.
 */
import { LoginForm } from "@/components/auth/LoginForm";
import { isMigrationPending } from "@/lib/migration-state";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const migrationPending = isMigrationPending();
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
        <LoginForm migrationPending={migrationPending} />
      </div>
    </main>
  );
}

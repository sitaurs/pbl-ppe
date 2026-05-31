import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import '@/styles/node-tree-animations.css';
import Link from 'next/link';
import { LayoutDashboard, Monitor, AlertTriangle, Server, BarChart3 } from 'lucide-react';
import LayoutShell from '@/components/LayoutShell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SafeGuard APD — Monitoring Dashboard',
  description: 'Sistem Deteksi Pelanggaran APD Real-time — Proyek PBL',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <div className="flex min-h-screen md:p-3" style={{ background: 'var(--background-flat)' }}>
          {/* Desktop Sidebar + Main Content (client component) */}
          <LayoutShell>{children}</LayoutShell>

          {/* Bottom Navigation — mobile only (max 5 items for 375px) */}
          <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-white/10" style={{ background: 'var(--sidebar-bg)', boxShadow: '0 -4px 20px rgba(26,26,46,0.2)' }}>
            <Link href="/" className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center" style={{ color: 'var(--sidebar-text)' }}>
              <LayoutDashboard size={20} />
              <span className="text-[10px] font-medium">Home</span>
            </Link>
            <Link href="/monitor" className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center" style={{ color: 'var(--sidebar-text)' }}>
              <Monitor size={20} />
              <span className="text-[10px] font-medium">Monitor</span>
            </Link>
            <Link href="/violations" className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center" style={{ color: 'var(--sidebar-text)' }}>
              <AlertTriangle size={20} />
              <span className="text-[10px] font-medium">Log</span>
            </Link>
            <Link href="/nodes" className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center" style={{ color: 'var(--sidebar-text)' }}>
              <Server size={20} />
              <span className="text-[10px] font-medium">Node</span>
            </Link>
            <Link href="/reports" className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center" style={{ color: 'var(--sidebar-text)' }}>
              <BarChart3 size={20} />
              <span className="text-[10px] font-medium">Laporan</span>
            </Link>
          </nav>
        </div>
      </body>
    </html>
  );
}

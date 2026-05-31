'use client';

/**
 * /settings/integrations — rotate Service Token. Permission: setting:update:system.
 *
 * Sesuai Req 3.6. Token aktif tidak pernah ditampilkan; hanya placeholder
 * masked. Tombol "Generate Token Baru" memanggil POST endpoint dan
 * menampilkan token baru sekali.
 */
import { useState } from 'react';
import { Plug, KeyRound, Copy, Check } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { useApiFetch } from '@/hooks/use-csrf-token';

export default function IntegrationsPage(): React.ReactElement {
  const apiFetch = useApiFetch();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function rotateToken(): Promise<void> {
    if (!confirm('Generate token baru akan menggantikan token lama. Service Python akan kehilangan akses sampai .env.local di-reload. Lanjutkan?')) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await apiFetch('/api/settings/integrations/service-token', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { token: string };
        setNewToken(data.token);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Gagal generate token baru.');
      }
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToken(): Promise<void> {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available; user can select manually
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Plug size={20} /> Integrasi Service
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Rotasi token akses untuk <code>ServiceAPDBackend.py</code>.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800 mb-4">
          {error}
        </div>
      )}

      <div className="card p-6 stagger-item stagger-2 space-y-5">
        <div>
          <h2 className="text-base font-bold mb-1 flex items-center gap-2">
            <KeyRound size={16} /> Service Token
          </h2>
          <p className="text-sm text-slate-600">
            Token statis yang dipakai backend Python untuk POST pelanggaran dan
            GET node tanpa session pengguna. Token aktif disembunyikan dari UI.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Token aktif
          </label>
          <input
            type="text"
            value="•••• •••• •••• •••• •••• •••• •••• •••• ••••"
            readOnly
            disabled
            className="font-mono w-full"
            style={{ background: '#f8fafc', color: 'var(--text-muted)' }}
          />
        </div>

        <button
          type="button"
          onClick={rotateToken}
          disabled={submitting}
          className="btn-primary min-h-[44px] disabled:opacity-50"
        >
          {submitting ? 'Generating...' : 'Generate Token Baru'}
        </button>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded text-sm">
          <strong>Catatan:</strong> Setelah generate, perbarui konfigurasi
          <code className="mx-1 px-1 py-0.5 rounded bg-amber-100">APD_SERVICE_TOKEN</code>
          di <code className="mx-1 px-1 py-0.5 rounded bg-amber-100">ServiceAPDBackend.py</code>
          (atau env service Python) agar dapat kembali memanggil API.
        </div>
      </div>

      {newToken && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 my-auto">
            <h2 className="text-lg font-bold">Token Baru Berhasil Dibuat</h2>
            <p className="text-sm">
              Salin token berikut sekarang. <strong>Token ini tidak akan ditampilkan lagi.</strong>{' '}
              Simpan di tempat aman.
            </p>
            <pre className="bg-slate-100 rounded-lg p-3 font-mono text-sm select-all break-all">
              {newToken}
            </pre>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={copyToken}
                className="px-4 py-2 rounded-lg border min-h-[44px] flex items-center gap-2"
                style={{ borderColor: 'var(--border)' }}
              >
                {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewToken(null);
                  setCopied(false);
                }}
                className="btn-primary min-h-[44px]"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}

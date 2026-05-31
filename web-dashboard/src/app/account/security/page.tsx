'use client';

/**
 * /account/security — halaman keamanan akun.
 *
 * Fitur:
 *  - Info akun (username, email, nama, role)
 *  - Ganti password (link ke /change-password)
 *  - Aktifkan 2FA (setup → QR → verify → recovery codes) sesuai Req 12.1, 12.2
 *  - Nonaktifkan 2FA (password + TOTP) sesuai Req 12.6
 *
 * Jika kunci enkripsi belum dikonfigurasi (APD_ENCRYPTION_KEY), setup 2FA
 * mengembalikan 503 → tampilkan banner (Req 12.7).
 */
import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, KeyRound, Smartphone, AlertTriangle, Copy, Check } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useApiFetch } from '@/hooks/use-csrf-token';

type SetupStage = 'idle' | 'qr' | 'recovery';

export default function AccountSecurityPage(): React.ReactElement {
  const { user, refresh } = useCurrentUser();
  const apiFetch = useApiFetch();

  const [stage, setStage] = useState<SetupStage>('idle');
  const [setupId, setSetupId] = useState<string>('');
  const [otpauthUri, setOtpauthUri] = useState<string>('');
  const [secretBase32, setSecretBase32] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Disable 2FA form
  const [disablePassword, setDisablePassword] = useState('');
  const [disableTotp, setDisableTotp] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const qrSrc = otpauthUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`
    : '';

  async function startSetup(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/2fa/setup', { method: 'POST', body: '{}' });
      if (res.status === 503) {
        setError('Fitur 2FA tidak tersedia: kunci enkripsi (APD_ENCRYPTION_KEY) belum dikonfigurasi.');
        return;
      }
      if (!res.ok) {
        setError('Gagal memulai setup 2FA.');
        return;
      }
      const data = (await res.json()) as { setupId: string; otpauthUri: string; secretBase32: string };
      setSetupId(data.setupId);
      setOtpauthUri(data.otpauthUri);
      setSecretBase32(data.secretBase32);
      setStage('qr');
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ setupId, code }),
      });
      const data = (await res.json()) as { recoveryCodes?: string[]; error?: string };
      if (!res.ok) {
        setError(
          data.error === 'invalid_totp'
            ? 'Kode TOTP salah. Coba lagi.'
            : data.error === 'setup_expired'
              ? 'Sesi setup kedaluwarsa. Ulangi dari awal.'
              : 'Verifikasi gagal.',
        );
        return;
      }
      setRecoveryCodes(data.recoveryCodes ?? []);
      setStage('recovery');
      await refresh();
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  async function disable2fa(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePassword, totp: disableTotp }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(
          data.error === 'invalid_credentials'
            ? 'Password salah.'
            : data.error === 'invalid_totp'
              ? 'Kode TOTP salah.'
              : 'Gagal menonaktifkan 2FA.',
        );
        return;
      }
      setShowDisable(false);
      setDisablePassword('');
      setDisableTotp('');
      await refresh();
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  function copySecret(): void {
    navigator.clipboard.writeText(secretBase32).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function finishSetup(): void {
    setStage('idle');
    setSetupId('');
    setOtpauthUri('');
    setSecretBase32('');
    setCode('');
    setRecoveryCodes([]);
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 stagger-item stagger-1">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ShieldCheck size={24} style={{ color: 'var(--orange)' }} /> Keamanan Akun
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Kelola password dan autentikasi dua faktor (2FA) untuk akun Anda.
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Info Akun */}
        <div className="card p-5 mb-4 stagger-item stagger-2">
          <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Informasi Akun</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Username</dt>
              <dd className="font-medium">{user?.username ?? '—'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Nama Lengkap</dt>
              <dd className="font-medium">{user?.fullName ?? '—'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Email</dt>
              <dd className="font-medium">{user?.email ?? '—'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Role</dt>
              <dd className="font-medium">{user?.role.name.replace(/_/g, ' ') ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Ganti Password */}
        <div className="card p-5 mb-4 stagger-item stagger-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <KeyRound size={20} style={{ color: 'var(--accent)' }} className="mt-0.5" />
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Password</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Ganti password akun Anda secara berkala.
                </p>
              </div>
            </div>
            <Link href="/change-password" className="btn-primary whitespace-nowrap">
              Ganti Password
            </Link>
          </div>
        </div>

        {/* 2FA */}
        <div className="card p-5 stagger-item stagger-4">
          <div className="flex items-start gap-3 mb-4">
            <Smartphone size={20} style={{ color: 'var(--accent)' }} className="mt-0.5" />
            <div className="flex-1">
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                Autentikasi Dua Faktor (2FA)
                {user?.totpEnabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#e8f0ed', color: 'var(--success)' }}>
                    <Check size={10} /> Aktif
                  </span>
                )}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Tambahkan lapisan keamanan dengan aplikasi authenticator (Google Authenticator, Authy, dll).
              </p>
            </div>
          </div>

          {/* State: 2FA belum aktif & belum mulai setup */}
          {!user?.totpEnabled && stage === 'idle' && (
            <button type="button" onClick={startSetup} disabled={loading} className="btn-primary disabled:opacity-50">
              {loading ? 'Memuat...' : 'Aktifkan 2FA'}
            </button>
          )}

          {/* State: tampilkan QR + input kode */}
          {stage === 'qr' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                1. Scan QR code ini dengan aplikasi authenticator Anda:
              </p>
              {qrSrc && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc} alt="QR Code 2FA" width={200} height={200} className="border rounded-lg p-2 bg-white" />
                </div>
              )}
              <div className="text-sm">
                <p style={{ color: 'var(--text-secondary)' }}>Atau masukkan kode manual:</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 break-all bg-slate-100 px-3 py-2 rounded text-xs">{secretBase32}</code>
                  <button type="button" onClick={copySecret} className="p-2 rounded-lg hover:bg-slate-100" title="Salin">
                    {copied ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span>2. Masukkan 6 digit kode dari aplikasi:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="border rounded px-3 py-2 tracking-widest text-center text-lg"
                  placeholder="000000"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={verifyCode} disabled={loading || code.length !== 6} className="btn-primary disabled:opacity-50">
                  {loading ? 'Memverifikasi...' : 'Verifikasi & Aktifkan'}
                </button>
                <button type="button" onClick={finishSetup} className="px-4 py-2 rounded-lg border" style={{ color: 'var(--text-secondary)' }}>
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* State: tampilkan recovery codes */}
          {stage === 'recovery' && (
            <div className="flex flex-col gap-4">
              <div className="bg-yellow-50 border border-yellow-300 p-3 rounded text-sm text-yellow-800">
                <strong>Simpan kode pemulihan ini di tempat aman.</strong> Kode ini hanya ditampilkan sekali dan dapat dipakai untuk login jika perangkat 2FA hilang.
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {recoveryCodes.map((rc) => (
                  <code key={rc} className="bg-slate-100 px-3 py-2 rounded text-center">{rc}</code>
                ))}
              </div>
              <button type="button" onClick={finishSetup} className="btn-primary">
                Saya sudah menyimpan kode ini
              </button>
            </div>
          )}

          {/* State: 2FA aktif → tombol disable */}
          {user?.totpEnabled && stage === 'idle' && (
            <div>
              {!showDisable ? (
                <button type="button" onClick={() => setShowDisable(true)} className="btn-danger px-4 py-2">
                  Nonaktifkan 2FA
                </button>
              ) : (
                <div className="flex flex-col gap-3 border-t pt-4 mt-2">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Konfirmasi dengan password dan kode TOTP saat ini:
                  </p>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Password</span>
                    <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="border rounded px-3 py-2" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Kode TOTP</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={disableTotp}
                      onChange={(e) => setDisableTotp(e.target.value)}
                      className="border rounded px-3 py-2 tracking-widest"
                      placeholder="000000"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={disable2fa} disabled={loading} className="btn-danger px-4 py-2 disabled:opacity-50">
                      {loading ? 'Memproses...' : 'Konfirmasi Nonaktifkan'}
                    </button>
                    <button type="button" onClick={() => setShowDisable(false)} className="px-4 py-2 rounded-lg border" style={{ color: 'var(--text-secondary)' }}>
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

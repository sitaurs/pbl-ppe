'use client';

import { useState, useEffect } from 'react';
import { Palette, Bell, Cpu, Loader2, CheckCircle2, XCircle, Wifi } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

type Tab = 'branding' | 'notifikasi' | 'sistem';

interface BrandingSettings {
  appName: string;
  companyName: string;
  logoUrl: string;
  primaryColor: string;
}

interface WhatsAppSettings {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
  deviceId: string;
  cooldownSeconds: number;
}

interface MqttSettings {
  enabled: boolean;
  brokerUrl: string;
  port: number;
  username: string;
  password: string;
  topicViolation: string;
}

interface SystemSettings {
  websocketPort: number;
  confidenceThreshold: number;
  personConfidence: number;
}

interface AllSettings {
  branding: BrandingSettings;
  whatsapp: WhatsAppSettings;
  mqtt: MqttSettings;
  system: SystemSettings;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('branding');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const [branding, setBranding] = useState<BrandingSettings>({
    appName: 'SafeGuard APD',
    companyName: '',
    logoUrl: '',
    primaryColor: '#e8720b',
  });

  const [whatsapp, setWhatsapp] = useState<WhatsAppSettings>({
    enabled: true,
    serverUrl: 'http://157.245.206.36:3000',
    username: 'admin',
    password: '',
    deviceId: 'pbl-alarm',
    cooldownSeconds: 120,
  });

  const [mqtt, setMqtt] = useState<MqttSettings>({
    enabled: true,
    brokerUrl: 'f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud',
    port: 8883,
    username: 'aldis',
    password: '',
    topicViolation: 'APD_Violation',
  });

  const [system, setSystem] = useState<SystemSettings>({
    websocketPort: 8765,
    confidenceThreshold: 0.65,
    personConfidence: 0.60,
  });

  // Load settings on mount
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data: AllSettings) => {
        if (data.branding) setBranding(data.branding);
        if (data.whatsapp) setWhatsapp(data.whatsapp);
        if (data.mqtt) setMqtt(data.mqtt);
        if (data.system) setSystem(data.system);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-clear feedback
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  const handleSave = async (section: string, data: Record<string, unknown>) => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [section]: data }),
      });
      const result = await res.json();
      if (result.ok) {
        setFeedback({ type: 'success', message: 'Pengaturan berhasil disimpan!' });
      } else {
        setFeedback({ type: 'error', message: result.message || 'Gagal menyimpan' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Gagal menghubungi server' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestWA = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: whatsapp.serverUrl,
          username: whatsapp.username,
          password: whatsapp.password,
          deviceId: whatsapp.deviceId,
        }),
      });
      const result = await res.json();
      setTestResult({ ok: result.ok, message: result.message });
    } catch {
      setTestResult({ ok: false, message: 'Gagal menghubungi API' });
    } finally {
      setTesting(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'branding', label: 'Branding', icon: <Palette size={16} /> },
    { id: 'notifikasi', label: 'Notifikasi', icon: <Bell size={16} /> },
    { id: 'sistem', label: 'Sistem', icon: <Cpu size={16} /> },
  ];

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--orange)' }} />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Pengaturan
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Konfigurasi sistem monitoring
          </p>
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-medium animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {feedback.message}
        </div>
      )}

      {/* Tabs */}
      <div className="overflow-x-auto mb-6 stagger-item stagger-2 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#e5e7eb', display: 'inline-flex', minWidth: 'max-content' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px]"
              style={{
                background: activeTab === tab.id ? '#ffffff' : 'transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="card p-4 md:p-6 stagger-item stagger-3">
        {/* ═══ BRANDING TAB ═══ */}
        {activeTab === 'branding' && (
          <div className="space-y-5">
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Branding & Tampilan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Nama Aplikasi
                </label>
                <input
                  type="text"
                  value={branding.appName}
                  onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Nama Perusahaan
                </label>
                <input
                  type="text"
                  value={branding.companyName}
                  onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  URL Logo
                </label>
                <input
                  type="text"
                  value={branding.logoUrl}
                  onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Warna Primer
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                    className="w-10 h-10 p-1 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={() => handleSave('branding', branding as unknown as Record<string, unknown>)}
              disabled={saving}
              className="btn-primary mt-4 min-h-[44px] flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Simpan Branding
            </button>
          </div>
        )}

        {/* ═══ NOTIFIKASI TAB (GoWA) ═══ */}
        {activeTab === 'notifikasi' && (
          <div className="space-y-5">
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Notifikasi WhatsApp (GoWA)
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Konfigurasi koneksi ke server GoWA untuk pengiriman alert via WhatsApp.
            </p>

            <div className="space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={whatsapp.enabled}
                  onChange={(e) => setWhatsapp({ ...whatsapp, enabled: e.target.checked })}
                  className="w-4 h-4 cursor-pointer"
                  style={{ width: 'auto', padding: '0' }}
                />
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Aktifkan Notifikasi WA
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Server URL
                  </label>
                  <input
                    type="text"
                    value={whatsapp.serverUrl}
                    onChange={(e) => setWhatsapp({ ...whatsapp, serverUrl: e.target.value })}
                    placeholder="http://157.245.206.36:3000"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Device ID
                  </label>
                  <input
                    type="text"
                    value={whatsapp.deviceId}
                    onChange={(e) => setWhatsapp({ ...whatsapp, deviceId: e.target.value })}
                    placeholder="pbl-alarm"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Username (Basic Auth)
                  </label>
                  <input
                    type="text"
                    value={whatsapp.username}
                    onChange={(e) => setWhatsapp({ ...whatsapp, username: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Password (Basic Auth)
                  </label>
                  <input
                    type="password"
                    value={whatsapp.password}
                    onChange={(e) => setWhatsapp({ ...whatsapp, password: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Cooldown Antar Alert (detik)
                  </label>
                  <input
                    type="number"
                    value={whatsapp.cooldownSeconds}
                    onChange={(e) => setWhatsapp({ ...whatsapp, cooldownSeconds: Number(e.target.value) })}
                    min={0}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Test connection result */}
              {testResult && (
                <div
                  className={`px-4 py-3 rounded-lg flex items-center gap-2 text-sm animate-fade-in ${
                    testResult.ok
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {testResult.message}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={handleTestWA}
                  disabled={testing}
                  className="min-h-[44px] px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all border"
                  style={{
                    background: '#f0f9ff',
                    color: '#0369a1',
                    borderColor: '#bae6fd',
                  }}
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                  Test Koneksi
                </button>
                <button
                  onClick={() => handleSave('whatsapp', whatsapp as unknown as Record<string, unknown>)}
                  disabled={saving}
                  className="btn-primary min-h-[44px] flex items-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ SISTEM TAB ═══ */}
        {activeTab === 'sistem' && (
          <div className="space-y-6">
            {/* MQTT Section */}
            <div className="space-y-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                MQTT Broker
              </h3>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={mqtt.enabled}
                  onChange={(e) => setMqtt({ ...mqtt, enabled: e.target.checked })}
                  className="w-4 h-4 cursor-pointer"
                  style={{ width: 'auto', padding: '0' }}
                />
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  MQTT Aktif
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Broker URL
                  </label>
                  <input
                    type="text"
                    value={mqtt.brokerUrl}
                    onChange={(e) => setMqtt({ ...mqtt, brokerUrl: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Port
                  </label>
                  <input
                    type="number"
                    value={mqtt.port}
                    onChange={(e) => setMqtt({ ...mqtt, port: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={mqtt.username}
                    onChange={(e) => setMqtt({ ...mqtt, username: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={mqtt.password}
                    onChange={(e) => setMqtt({ ...mqtt, password: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Topic Violation
                  </label>
                  <input
                    type="text"
                    value={mqtt.topicViolation}
                    onChange={(e) => setMqtt({ ...mqtt, topicViolation: e.target.value })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* System Section */}
            <div className="space-y-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Konfigurasi Sistem
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    WebSocket Port
                  </label>
                  <input
                    type="number"
                    value={system.websocketPort}
                    onChange={(e) => setSystem({ ...system, websocketPort: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Detection Confidence ({(system.confidenceThreshold * 100).toFixed(0)}%)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={system.confidenceThreshold}
                      onChange={(e) =>
                        setSystem({ ...system, confidenceThreshold: parseFloat(e.target.value) })
                      }
                      className="flex-1 h-2 cursor-pointer"
                      style={{ padding: '0', border: 'none', background: 'transparent' }}
                    />
                    <span className="text-sm font-mono w-12 text-right" style={{ color: 'var(--text-primary)' }}>
                      {system.confidenceThreshold.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Person Confidence ({(system.personConfidence * 100).toFixed(0)}%)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={system.personConfidence}
                      onChange={(e) =>
                        setSystem({ ...system, personConfidence: parseFloat(e.target.value) })
                      }
                      className="flex-1 h-2 cursor-pointer"
                      style={{ padding: '0', border: 'none', background: 'transparent' }}
                    />
                    <span className="text-sm font-mono w-12 text-right" style={{ color: 'var(--text-primary)' }}>
                      {system.personConfidence.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={async () => {
                await handleSave('mqtt', mqtt as unknown as Record<string, unknown>);
                await handleSave('system', system as unknown as Record<string, unknown>);
              }}
              disabled={saving}
              className="btn-primary min-h-[44px] flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Simpan Konfigurasi
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

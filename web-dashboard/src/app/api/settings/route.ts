import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const settingsPath = path.join(process.cwd(), 'data', 'settings.json');

const defaultSettings = {
  branding: {
    appName: 'SafeGuard APD',
    companyName: '',
    logoUrl: '',
    primaryColor: '#e8720b',
  },
  whatsapp: {
    enabled: true,
    serverUrl: 'http://157.245.206.36:3000',
    username: 'admin',
    password: 'pbl_apd_2026!secure',
    deviceId: 'pbl-alarm',
    cooldownSeconds: 120,
  },
  mqtt: {
    enabled: true,
    brokerUrl: 'f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud',
    port: 8883,
    username: 'aldis',
    password: 'Polinema2026',
    topicViolation: 'APD_Violation',
  },
  system: {
    websocketPort: 8765,
    confidenceThreshold: 0.65,
    personConfidence: 0.60,
  },
};

function getSettings() {
  if (!fs.existsSync(settingsPath)) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
  try {
    const file = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(file);
  } catch {
    return defaultSettings;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export async function GET() {
  const settings = getSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const current = getSettings();
    const merged = deepMerge(current, body);
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    return NextResponse.json({ ok: true, data: merged });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: 'Gagal menyimpan pengaturan' },
      { status: 500 }
    );
  }
}

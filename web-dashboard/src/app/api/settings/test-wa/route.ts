import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { serverUrl, username, password, deviceId } = await req.json();

    if (!serverUrl || !username || !password) {
      return NextResponse.json(
        { ok: false, message: 'Server URL, username, dan password wajib diisi' },
        { status: 400 }
      );
    }

    // Build Basic Auth header
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const url = `${serverUrl.replace(/\/$/, '')}/app/devices`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        message: `Server merespon dengan status ${response.status}: ${response.statusText}`,
        devices: [],
      });
    }

    const data = await response.json();

    // Check if deviceId exists in the device list
    const devices = Array.isArray(data) ? data : data.devices || data.data || [];
    const deviceFound = devices.some(
      (d: { name?: string; id?: string }) => d.name === deviceId || d.id === deviceId
    );

    return NextResponse.json({
      ok: true,
      message: deviceFound
        ? `Koneksi berhasil! Device "${deviceId}" ditemukan.`
        : `Koneksi berhasil, tapi device "${deviceId}" tidak ditemukan di daftar.`,
      devices,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Koneksi timeout (10 detik). Pastikan server GoWA aktif dan URL benar.'
        : `Gagal menghubungi server: ${error instanceof Error ? error.message : 'Unknown error'}`;

    return NextResponse.json({ ok: false, message, devices: [] }, { status: 500 });
  }
}

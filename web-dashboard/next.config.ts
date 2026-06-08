import type { NextConfig } from "next";

function extractAllowedOriginHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

const allowedDevOrigins = Array.from(
  new Set(
    [
      "192.168.10.26",
      "192.168.137.1",
      extractAllowedOriginHost(process.env.NEXTAUTH_URL),
      extractAllowedOriginHost(process.env.NEXT_PUBLIC_APP_URL),
    ].filter((value): value is string => !!value),
  ),
);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;

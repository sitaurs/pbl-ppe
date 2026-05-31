import { isIPv4, isIPv6 } from "net";

// Source: https://www.cloudflare.com/ips-v4 (snapshot 2026-Q1)
export const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

export const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return 0;
  return ((parseInt(parts[0]) << 24) >>> 0) +
         ((parseInt(parts[1]) << 16) >>> 0) +
         ((parseInt(parts[2]) << 8) >>> 0) +
          parseInt(parts[3]);
}

export function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function ipv6ToBigInt(ip: string): bigint {
  // Expand ::
  const parts = ip.split("::");
  const head: string[] = parts[0] ? parts[0].split(":") : [];
  const tail: string[] = parts[1] ? parts[1].split(":") : [];
  const fillCount = 8 - head.length - tail.length;
  const middle = Array(fillCount).fill("0");
  const all = parts.length === 2 ? [...head, ...middle, ...tail] : head;
  if (all.length !== 8) return BigInt(0);
  let v = BigInt(0);
  const sixteen = BigInt(16);
  for (const part of all) {
    v = (v << sixteen) | BigInt(parseInt(part || "0", 16));
  }
  return v;
}

export function ipv6InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr);
  if (!Number.isFinite(bits) || bits < 0 || bits > 128) return false;
  const one = BigInt(1);
  const zero = BigInt(0);
  const mask = bits === 0
    ? zero
    : ((one << BigInt(128)) - one) ^ ((one << BigInt(128 - bits)) - one);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(base) & mask);
}

export function isCloudflareIp(ip: string): boolean {
  if (isIPv4(ip)) return CLOUDFLARE_IPV4_RANGES.some(cidr => ipv4InCidr(ip, cidr));
  if (isIPv6(ip)) return CLOUDFLARE_IPV6_RANGES.some(cidr => ipv6InCidr(ip, cidr));
  return false;
}

export function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * Resolves the effective client IP from the remote socket address and an
 * optional `CF-Connecting-IP` header, applying the Trusted Proxy rules from
 * `design.md §Trusted Proxy IP Validation`:
 *
 *  - When `behindProxy === "cloudflare"`:
 *      • If `remoteAddress` is neither loopback nor a Cloudflare IP, the
 *        request is rejected with `untrusted_proxy_origin` (HTTP 400 in
 *        the middleware) per Req 15.3.
 *      • If `remoteAddress` is loopback (Service_APD_Backend or local dev),
 *        the `CF-Connecting-IP` header is IGNORED — `clientIp = remoteAddress`.
 *        This prevents header spoofing on the loopback bypass path (Req 15.5).
 *      • Otherwise (`remoteAddress` is a Cloudflare edge IP), `clientIp` is
 *        taken from `CF-Connecting-IP` if present, else from `remoteAddress`.
 *
 *  - When `behindProxy` is anything else (undefined, "", "none", ...):
 *      • Headers like `X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP`
 *        are IGNORED unconditionally — `clientIp = remoteAddress` (Req 10.7).
 *
 * The function is pure and deterministic, which lets us test the trusted-proxy
 * decision tree directly without booting Next.js middleware.
 */
export type ResolveClientIpResult =
  | { ok: true; clientIp: string }
  | { ok: false; error: "untrusted_proxy_origin" };

export function resolveClientIp(opts: {
  remoteAddress: string;
  cfConnectingIp: string | null;
  behindProxy: string | undefined;
}): ResolveClientIpResult {
  const { remoteAddress, cfConnectingIp, behindProxy } = opts;
  if (behindProxy === "cloudflare") {
    if (!isLoopback(remoteAddress) && !isCloudflareIp(remoteAddress)) {
      return { ok: false, error: "untrusted_proxy_origin" };
    }
    const clientIp = isLoopback(remoteAddress)
      ? remoteAddress
      : (cfConnectingIp ?? remoteAddress);
    return { ok: true, clientIp };
  }
  return { ok: true, clientIp: remoteAddress };
}

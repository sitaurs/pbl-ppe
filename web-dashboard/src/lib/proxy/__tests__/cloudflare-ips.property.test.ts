/**
 * Property 13: Trusted proxy validation
 *
 * Validates: Requirements 10.7, 15.3, 15.5
 *
 * Statement (design.md §Correctness Properties — Property 13):
 *   For any HTTP request dengan `remoteAddress = R` dan env `BEHIND_PROXY=cloudflare`,
 *   middleware menerima request hanya jika `isLoopback(R) ∨ isCloudflareIp(R)`;
 *   selain itu, response 400 `untrusted_proxy_origin`. Tambahan:
 *     - Jika loopback, header CF-Connecting-IP DIABAIKAN, clientIp = R.
 *     - Jika cf-ip non-loopback, clientIp = CF-Connecting-IP atau R bila kosong.
 *     - Jika BEHIND_PROXY tidak diaktifkan, header proxy diabaikan
 *       unconditionally; clientIp = R.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  isCloudflareIp,
  isLoopback,
  resolveClientIp,
  CLOUDFLARE_IPV4_RANGES,
  CLOUDFLARE_IPV6_RANGES,
} from "@/lib/proxy/cloudflare-ips";

// --- Generators --------------------------------------------------------

const ipv4OctetArb = fc.integer({ min: 0, max: 255 });

/** Generic random IPv4 (highly likely outside Cloudflare ranges). */
const randomIpv4Arb = fc
  .tuple(ipv4OctetArb, ipv4OctetArb, ipv4OctetArb, ipv4OctetArb)
  .map((parts) => parts.join("."));

/**
 * Generator yang membangun IPv4 dari salah satu CIDR Cloudflare; kita gunakan
 * IP dasar (oct[0..2] dari range) plus oktet terakhir random agar tetap
 * berada di dalam range untuk semua mask /16, /17, /18, /20, /22.
 */
function ipv4FromCloudflareCidr(): fc.Arbitrary<string> {
  return fc.constantFrom(...CLOUDFLARE_IPV4_RANGES).chain((cidr) => {
    const [base, bitsStr] = cidr.split("/");
    const baseParts = base.split(".").map(Number);
    const bits = parseInt(bitsStr);
    return fc.tuple(ipv4OctetArb, ipv4OctetArb).map(([oct3, oct4]) => {
      // For the strictest mask (/13 - /22) we keep first 2 octets fixed and
      // randomize last 2 octets but mask them so they remain within the
      // network. To keep things simple and still strictly inside the CIDR,
      // generate from base (host bits = 0) + a small valid offset.
      // Implementation: emit base IP varying only the host portion below the mask.
      // We'll simply derive a host number ∈ [0, 2^(32-bits)).
      const host = ((oct3 * 256 + oct4) >>> 0) & ((1 << Math.max(0, 32 - bits)) - 1);
      const a = (((baseParts[0] << 24) >>> 0) +
        ((baseParts[1] << 16) >>> 0) +
        ((baseParts[2] << 8) >>> 0) +
        baseParts[3]) >>> 0;
      const out = (a + host) >>> 0;
      return [
        (out >>> 24) & 0xff,
        (out >>> 16) & 0xff,
        (out >>> 8) & 0xff,
        out & 0xff,
      ].join(".");
    });
  });
}

const cloudflareIpv4Arb = ipv4FromCloudflareCidr();

const loopbackIpArb = fc.constantFrom("127.0.0.1", "::1", "::ffff:127.0.0.1");

// --- Tests --------------------------------------------------------------

describe("Property 13: Trusted proxy validation (Requirements 10.7, 15.3, 15.5)", () => {
  // -- Building blocks: isLoopback, isCloudflareIp ---

  it("isLoopback() recognises 127.0.0.1, ::1, and IPv4-mapped loopback", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("10.0.0.1")).toBe(false);
    expect(isLoopback("8.8.8.8")).toBe(false);
  });

  it("isCloudflareIp() returns true for IPs synthesised from CLOUDFLARE_IPV4_RANGES", () => {
    fc.assert(
      fc.property(cloudflareIpv4Arb, (ip) => {
        expect(isCloudflareIp(ip)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("isCloudflareIp() returns true for IPv6 base prefixes from CLOUDFLARE_IPV6_RANGES", () => {
    for (const cidr of CLOUDFLARE_IPV6_RANGES) {
      const base = cidr.split("/")[0];
      // Use a representative IP under the prefix. The prefix base itself
      // should be in-range by definition.
      expect(isCloudflareIp(base)).toBe(true);
    }
  });

  it("isCloudflareIp() returns false for clearly non-CF IPv4 addresses", () => {
    const knownNonCf = ["8.8.8.8", "1.1.1.2", "10.0.0.1", "192.168.1.1", "172.16.0.1", "203.0.113.1"];
    for (const ip of knownNonCf) {
      expect(isCloudflareIp(ip)).toBe(false);
    }
  });

  // -- resolveClientIp behaviour ---

  it("BEHIND_PROXY=cloudflare + remote not loopback/CF → ok=false untrusted_proxy_origin", () => {
    fc.assert(
      fc.property(randomIpv4Arb, (remote) => {
        // Pre-condition: remote is genuinely outside Cloudflare ranges.
        fc.pre(!isCloudflareIp(remote) && !isLoopback(remote));
        const result = resolveClientIp({
          remoteAddress: remote,
          cfConnectingIp: "1.2.3.4",
          behindProxy: "cloudflare",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("untrusted_proxy_origin");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("BEHIND_PROXY=cloudflare + loopback → ignore CF-Connecting-IP, clientIp=remote", () => {
    fc.assert(
      fc.property(loopbackIpArb, fc.string(), (remote, cfHeader) => {
        const result = resolveClientIp({
          remoteAddress: remote,
          cfConnectingIp: cfHeader,
          behindProxy: "cloudflare",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.clientIp).toBe(remote);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("BEHIND_PROXY=cloudflare + CF IP + cfConnectingIp → clientIp = cfConnectingIp", () => {
    fc.assert(
      fc.property(cloudflareIpv4Arb, randomIpv4Arb, (cfRemote, clientHeader) => {
        const result = resolveClientIp({
          remoteAddress: cfRemote,
          cfConnectingIp: clientHeader,
          behindProxy: "cloudflare",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.clientIp).toBe(clientHeader);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("BEHIND_PROXY=cloudflare + CF IP + missing cfConnectingIp → clientIp = remote", () => {
    fc.assert(
      fc.property(cloudflareIpv4Arb, (cfRemote) => {
        const result = resolveClientIp({
          remoteAddress: cfRemote,
          cfConnectingIp: null,
          behindProxy: "cloudflare",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.clientIp).toBe(cfRemote);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("BEHIND_PROXY != cloudflare → header always ignored, clientIp = remote", () => {
    fc.assert(
      fc.property(
        fc.oneof(randomIpv4Arb, loopbackIpArb, cloudflareIpv4Arb),
        fc.option(fc.string({ minLength: 1, maxLength: 32 })),
        fc.constantFrom(undefined, "", "none", "false", "off"),
        (remote, header, behind) => {
          const result = resolveClientIp({
            remoteAddress: remote,
            cfConnectingIp: header ?? null,
            behindProxy: behind as string | undefined,
          });
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.clientIp).toBe(remote);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

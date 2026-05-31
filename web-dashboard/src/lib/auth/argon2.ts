import * as argon2 from "@node-rs/argon2";

/**
 * Argon2id parameters tuned per OWASP 2023 password storage guidance and
 * Requirement 9.1 of the Auth + RBAC spec.
 *
 * - `memoryCost`: 19_456 KiB (≈ 19 MiB) per hashing thread.
 * - `timeCost`: 2 passes (iterations).
 * - `parallelism`: 1 thread (single-laptop deploy, avoid contention).
 *
 * Salt is left at the library default (16 random bytes) and is encoded inside
 * the resulting PHC string returned by {@link hashPassword}.
 *
 * Any change to these constants triggers a rehash on the next successful
 * login via {@link needsRehash} (see Req 9.5 — Argon2id rehash invariant).
 */
export const ARGON2_PARAMS = {
  // `argon2.Algorithm.Argon2id` (=2) is declared as an ambient `const enum`
  // by `@node-rs/argon2`, which TypeScript refuses to inline under
  // `isolatedModules: true`. Use the numeric literal with a type cast to keep
  // the configuration identical to design.md §Argon2id Configuration.
  algorithm: 2 as argon2.Algorithm, // Algorithm.Argon2id
  memoryCost: 19_456, // KiB ≈ 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Public type alias mirroring {@link ARGON2_PARAMS} so callers (tests, route
 * handlers) can reference the parameter shape without re-declaring it.
 */
export type Argon2Params = typeof ARGON2_PARAMS;

/**
 * Hash a plaintext password using {@link ARGON2_PARAMS}.
 *
 * Returns the standard Argon2 PHC string
 * (`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`) suitable for storage in
 * `User.passwordHash`. The salt is generated automatically by the underlying
 * library; never reuse a salt or pre-supply one in production.
 *
 * @param plain - Plaintext password as provided by the user.
 * @returns Promise resolving to the PHC-encoded hash string.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_PARAMS);
}

/**
 * Verify a plaintext password against a stored Argon2 PHC hash in constant
 * time relative to the hash parameters.
 *
 * Any thrown error from the underlying library (malformed hash, unsupported
 * variant, ...) is swallowed and reported as a verification failure so the
 * caller cannot distinguish "wrong password" from "corrupt hash" — this
 * matches the generic login error contract in Req 4.3.
 *
 * @param hash - Stored PHC-encoded hash.
 * @param plain - Plaintext password supplied by the caller.
 * @returns Promise resolving to `true` only when the hash matches the
 *          plaintext; `false` otherwise.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try { return await argon2.verify(hash, plain); }
  catch { return false; }
}

/**
 * Decide whether a stored Argon2 hash should be rehashed using the current
 * {@link ARGON2_PARAMS}.
 *
 * Returns `true` when the encoded parameters are weaker than the current
 * configuration on any axis (`memoryCost`, `timeCost`, or `parallelism`) or
 * when the hash is in an unrecognised format. Callers should rehash with the
 * freshly verified plaintext on a successful login (Req 9.5).
 *
 * @param hash - PHC-encoded Argon2 hash, e.g. `$argon2id$v=19$m=19456,t=2,p=1$...`.
 * @returns `true` if `hash` was produced with weaker params than
 *          {@link ARGON2_PARAMS} (or could not be parsed); `false` otherwise.
 */
// Returns true if `hash` was produced with weaker params than ARGON2_PARAMS
export function needsRehash(hash: string): boolean {
  // PHC string format: $argon2id$v=19$m=19456,t=2,p=1$salt$hash
  const m = hash.match(/\$argon2id?\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!m) return true; // unknown format -> rehash
  const [, mem, t, p] = m;
  return Number(mem) < ARGON2_PARAMS.memoryCost
      || Number(t) < ARGON2_PARAMS.timeCost
      || Number(p) < ARGON2_PARAMS.parallelism;
}

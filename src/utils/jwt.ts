// ============================================================
// JWT helpers — read claims the login payload does not expose
// ============================================================
// ✅ verified live (2026-09-20): the AUTHORITATIVE permission list lives in the
// access token's `permissions` claim. The login payload's
// `user.permissions` can be EMPTY even when the token is fully populated —
// observed for a `warehouse_work_user` dock account:
//
//   user.permissions  → []                       (empty!)
//   JWT permissions   → ['return.read', 'return.receive', 'return.classify',
//                        'wms.scan', 'inbound_exception.create', …]
//
// So never trust `user.permissions` alone. Decode the token instead.
//
// NOTE: this only READS the payload for non-security-critical routing/UI
// decisions. Signature verification is the backend's job — never trust these
// claims for authorisation on their own.
// ============================================================

/** Decoded JWT payload, or `null` when the token is malformed. */
export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    // JWT payloads are base64url — `atob` needs standard base64 + padding.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    // `atob` exists in React Native (Hermes) and in browsers. Fall back to
    // Buffer for non-RN runtimes (tests, Node).
    const globalAtob = (globalThis as { atob?: (input: string) => string }).atob;
    const json =
      typeof globalAtob === 'function'
        ? globalAtob(padded)
        : Buffer.from(padded, 'base64').toString('binary');

    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Permission codes from the access token.
 * Returns `null` when the token is unreadable or carries no `permissions`
 * claim, so callers can distinguish "unknown" from "empty".
 */
export function getPermissionsFromToken(token: string | null | undefined): string[] | null {
  const payload = decodeJwtPayload(token);
  const permissions = payload?.permissions;
  return Array.isArray(permissions) ? permissions : null;
}

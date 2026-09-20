// ============================================================
// Permissions — returns-flow authorisation helpers (§6)
// ============================================================
// ✅ verified live (2026-09-20): `permissions` now ships on the login payload
// (`LoginUserResponse.permissions`) for every login flow — password, barcode,
// qr-code and worker — AND as a `permissions` claim in the access token. The
// dock account carries the `return.*` codes plus a `*.*` wildcard.
//
// Because the field is now always present, the gate is STRICT: a missing code
// hides the action. `UNKNOWN_PERMISSIONS_ALLOW` remains as the escape hatch if
// a future login shape drops the field.
// ============================================================
import { useAuthStore } from '@/store/authStore';

/**
 * Behaviour when the account's permission set cannot be read at all
 * (`undefined`). `false` = deny (strict, the shipped default).
 * Set to `true` only if a login flow is found that omits `permissions`.
 */
export const UNKNOWN_PERMISSIONS_ALLOW = false;

/** The codes the dock role is expected to hold (§6). */
export const RETURN_PERMISSIONS = {
  read: 'return.read',
  receive: 'return.receive',
  classify: 'return.classify',
  /** Reporting an unreadable label (§4.2). */
  createException: 'inbound_exception.create',
  /** Scans require this alongside `return.receive` (task 10.3). */
  wmsScan: 'wms.scan',
} as const;

/**
 * Does `granted` satisfy `code`?
 *
 * Supports the wildcards the backend issues:
 *   • `*.*`      → grants everything
 *   • `return.*` → grants any `return.<x>`
 *   • exact match otherwise
 */
export function permissionGranted(granted: string[] | null | undefined, code: string): boolean {
  if (!Array.isArray(granted)) return UNKNOWN_PERMISSIONS_ALLOW;
  if (granted.includes('*.*') || granted.includes('*')) return true;
  if (granted.includes(code)) return true;

  const dot = code.indexOf('.');
  if (dot > 0) {
    const namespace = code.slice(0, dot);
    if (granted.includes(`${namespace}.*`)) return true;
  }
  return false;
}

/**
 * Which permission set the current session exposes.
 *
 * Priority:
 *   1. `permissions` decoded from the ACCESS TOKEN at login / session restore —
 *      ⚠ this is the authoritative source. A `warehouse_work_user` payload can
 *      carry `permissions: []` while the token holds the real list, so the
 *      payload must NOT win.
 *   2. `Worker.permissions` / `User.permissions` (fallback for flows that do not
 *      decode the token).
 *
 * `null` means "not yet known".
 */
function currentPermissions(): string[] | null {
  const { worker, user, permissions } = useAuthStore.getState();
  if (Array.isArray(permissions)) return permissions;
  const fromSubject = worker?.permissions ?? user?.permissions;
  return Array.isArray(fromSubject) ? fromSubject : null;
}

/** True when the current account holds `code` (wildcards honoured). */
export function hasPermission(code: string): boolean {
  return permissionGranted(currentPermissions(), code);
}

/** Convenience: can this account see/open the Returns area at all? */
export function canReadReturns(): boolean {
  return hasPermission(RETURN_PERMISSIONS.read);
}

/** Hook form so a screen re-renders when the account changes. */
export function useReturnPermissions() {
  const { user, worker, permissions } = useAuthStore();
  const effective = Array.isArray(permissions)
    ? permissions
    : worker?.permissions ?? user?.permissions ?? null;
  const known = Array.isArray(effective);

  const check = (code: string) => permissionGranted(effective, code);

  return {
    known,
    canRead: check(RETURN_PERMISSIONS.read),
    canReceive: check(RETURN_PERMISSIONS.receive),
    canClassify: check(RETURN_PERMISSIONS.classify),
    canReportUnreadable: check(RETURN_PERMISSIONS.createException),
    canScan: check(RETURN_PERMISSIONS.wmsScan),
  };
}

// ============================================================
// Error utilities — extract human-readable messages from HTTP errors
// ============================================================
// Consolidates the error-extraction logic that was previously duplicated
// across inboundStore.ts, qsealStore.ts, and AssignBinScreen.tsx.
//
// The core-service (FastAPI) returns errors in several shapes:
//   - { detail: "string" }              → HTTPException
//   - { detail: { message, error } }   → nested error object
//   - { message: "string" }             → custom ValidationError
//   - { detail: [{ loc, msg, type }] } → FastAPI validation array
// This helper normalises all of them to a plain string.

/**
 * Extract the backend error message from an Axios/HTTP error.
 *
 * Checks (in priority order):
 *   1. `err.response.data.detail`  — FastAPI HTTPException (string, object,
 *      or array of `{ loc, msg, type }` validation errors)
 *   2. `err.response.data.message` — custom ValidationError
 *   3. `err.message`               — Axios / network error fallback
 *
 * Returns `''` when nothing is available so callers can supply their
 * own default via `|| 'default message'`.
 */
export function getBackendErrorMessage(err: any): string {
  const data = err?.response?.data;
  const detail = data?.detail;

  if (typeof detail === 'string' && detail.trim()) return detail;

  // FastAPI's default validation responses return `detail` as an array of
  // { loc, msg, type } entries. Surface each entry's human-readable `msg`
  // instead of JSON.stringify-ing the raw array.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') return '';
        if (typeof entry.msg === 'string' && entry.msg.trim()) return entry.msg;
        if (typeof entry.message === 'string' && entry.message.trim()) return entry.message;
        return '';
      })
      .filter((m: string) => m.trim());
    if (messages.length > 0) return messages.join('; ');
    return JSON.stringify(detail);
  }

  if (detail && typeof detail === 'object') {
    return detail.message || detail.error || JSON.stringify(detail);
  }
  if (data && typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return '';
}

/**
 * Structured view of a backend error for flows that must branch on the
 * `error` CODE while still showing the operator-facing `hint`.
 *
 * The returns flow uses the §7 envelope `{ error, message, hint, details }`:
 *   • `code`    — the machine code used for control flow (never rendered raw)
 *   • `hint`    — operator-facing copy, ALWAYS preferred for display
 *   • `message` — engineering-facing fallback
 *   • `status`  — HTTP status, for coarse branching (403 → hide the action)
 *
 * `message` is always a non-empty string (per error-handling conventions) so
 * callers can render it directly without a crash.
 */
export interface BackendErrorInfo {
  code: string | null;
  message: string;
  hint: string | null;
  status: number | null;
}

export function getBackendErrorInfo(err: any): BackendErrorInfo {
  const data = err?.response?.data;
  const code = typeof data?.error === 'string' && data.error.trim() ? data.error : null;
  const hint = typeof data?.hint === 'string' && data.hint.trim() ? data.hint : null;
  const status = typeof err?.response?.status === 'number' ? err.response.status : null;

  // Offline / timeout — there is no response body to read.
  if (err?.isAxiosError && !err?.response) {
    return {
      code: null,
      message: 'Cannot reach the server. Check your connection and try again.',
      hint: null,
      status: null,
    };
  }

  const message = getBackendErrorMessage(err);
  // `getBackendErrorMessage` falls back to Axios's generic text, which is never
  // user-facing copy. Prefer the hint, then the backend message, then a default.
  const isGeneric = !message || message === err?.message;
  return {
    code,
    message: (isGeneric ? null : message) || hint || 'Something went wrong. Please try again.',
    hint,
    status,
  };
}

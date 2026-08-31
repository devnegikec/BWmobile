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
//   - { detail: [...] }                → FastAPI validation array
// This helper normalises all of them to a plain string.

/**
 * Extract the backend error message from an Axios/HTTP error.
 *
 * Checks (in priority order):
 *   1. `err.response.data.detail`  — FastAPI HTTPException (string or object)
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
  if (detail && typeof detail === 'object') {
    return detail.message || detail.error || JSON.stringify(detail);
  }
  if (data && typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return '';
}

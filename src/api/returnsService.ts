// ============================================================
// Returns Service — Registrations, Sessions, Scans, Classification
// ============================================================
// Source of truth: docs/RETURNS_HANDHELD_INTEGRATION.md v1.0.
//
// ⚠ The `/returns/…` endpoints are NOT deployed yet (returns MVP R-01 → R-10).
// The two reused endpoints (unreadable label + reason picker) live in
// `inboundService.ts` and are exported from there.
//
// Timeouts: scans get a short, explicit timeout (mirrors `recordScan`) because
// a hung scan must surface a retry path rather than an endless spinner.
// ============================================================
import { coreClient } from '@/api/client';
import type {
  ReturnRegistration,
  ReturnRegistrationDetail,
  ReturnSession,
  StartReturnSessionRequest,
  RecordReturnScanRequest,
  ReturnScanResponse,
  ClassifyReturnItemRequest,
  ClassifyReturnItemsBulkRequest,
  ReturnClassifyResponse,
  ReturnClassifyBulkResponse,
  EndReturnSessionRequest,
  EndReturnSessionResponse,
  ReturnUnreadableReportRequest,
  UnreadableQrResponse,
} from '@/types';

/** Scans are latency-sensitive — fail fast so the operator can retry. */
const SCAN_TIMEOUT = 10000;

// ---------- List Return Registrations (§2) ----------
// Accepts either a bare array or a paginated envelope so a backend envelope
// choice does not break the list screen.
export async function listReturnRegistrations(params?: {
  status?: string;
  warehouse_id?: string;
  page?: number;
  page_size?: number;
}): Promise<ReturnRegistration[]> {
  const { data } = await coreClient.get<
    ReturnRegistration[] | { items?: ReturnRegistration[]; results?: ReturnRegistration[]; data?: ReturnRegistration[] }
  >('/returns/registrations', { params });

  if (Array.isArray(data)) return data;
  // Normalise the common envelope shapes, newest-first ordering per backend.
  return data?.items ?? data?.results ?? data?.data ?? [];
}

// ---------- Get Return Registration (§2) ----------
// ✅ live: nests `warehouse` / `party` and carries `return_reason_code`.
export async function getReturnRegistration(id: string): Promise<ReturnRegistrationDetail> {
  const { data } = await coreClient.get<ReturnRegistrationDetail>(
    `/returns/registrations/${id}`
  );
  return data;
}

// ---------- Open a Return Session (§3.1) ----------
export async function openReturnSession(
  registrationId: string,
  payload: StartReturnSessionRequest
): Promise<ReturnSession> {
  console.log('[API] POST /returns/registrations/*/sessions — payload:', JSON.stringify(payload));
  const { data } = await coreClient.post<ReturnSession>(
    `/returns/registrations/${registrationId}/sessions`,
    payload
  );
  return data;
}

// ---------- Get / Resume Return Session (§3.2) ----------
export async function getReturnSession(sessionId: string): Promise<ReturnSession> {
  const { data } = await coreClient.get<ReturnSession>(`/returns/sessions/${sessionId}`);
  return data;
}

// ---------- Record a Unit / Carton Scan (§3.3) ----------
export async function scanReturnUnit(
  sessionId: string,
  payload: RecordReturnScanRequest
): Promise<ReturnScanResponse> {
  const { data } = await coreClient.post<ReturnScanResponse>(
    `/returns/sessions/${sessionId}/scans`,
    payload,
    { timeout: SCAN_TIMEOUT }
  );
  return data;
}

// ---------- Classify One Unit (§3.4) ----------
export async function classifyReturnItem(
  sessionId: string,
  payload: ClassifyReturnItemRequest
): Promise<ReturnClassifyResponse> {
  const { data } = await coreClient.post<ReturnClassifyResponse>(
    `/returns/sessions/${sessionId}/classify`,
    payload
  );
  return data;
}

// ---------- Bulk Classify (§3.4) ----------
// ✅ live: the endpoint returns a BARE ARRAY of per-item results. Accept an
// `{ items }` envelope too so a future backend change cannot break the screen.
export async function classifyReturnItemsBulk(
  sessionId: string,
  payload: ClassifyReturnItemsBulkRequest
): Promise<ReturnClassifyBulkResponse> {
  const { data } = await coreClient.post<
    ReturnClassifyBulkResponse | { items: ReturnClassifyBulkResponse }
  >(`/returns/sessions/${sessionId}/classify/bulk`, payload);

  if (Array.isArray(data)) return data;
  return data?.items ?? [];
}

// ---------- Report an Unreadable Label (§4.2) ----------
// ✅ Returns-scoped endpoint — the session id is in the PATH. (The older
// `/inbound/exceptions/unreadable-qr` resolves `session_id` against the INBOUND
// scan-session table and 404s for a return session, so it must not be used here.)
export async function reportReturnUnreadable(
  sessionId: string,
  payload: ReturnUnreadableReportRequest
): Promise<UnreadableQrResponse> {
  console.log('[API] POST /returns/sessions/*/unreadable — payload:', JSON.stringify(payload));
  const { data } = await coreClient.post<UnreadableQrResponse>(
    `/returns/sessions/${sessionId}/unreadable`,
    payload
  );
  return data;
}

// ---------- End the Session (§3.5) ----------
export async function endReturnSession(
  sessionId: string,
  payload: EndReturnSessionRequest = {}
): Promise<EndReturnSessionResponse> {
  console.log('[API] POST /returns/sessions/*/end — payload:', JSON.stringify(payload));
  const { data } = await coreClient.post<EndReturnSessionResponse>(
    `/returns/sessions/${sessionId}/end`,
    payload
  );
  return data;
}

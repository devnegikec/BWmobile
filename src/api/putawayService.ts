// ============================================================
// Put-Away Service — Generate, List, Complete (QR-based dual-axis)
// ============================================================
import { coreClient } from '@/api/client';
import type {
  PutAwayList,
  PutAwayItem,
  PaginatedResponse,
  TrackingItem,
  CompletePutawayRequest,
  CompletePutawayResponse,
  CompletePutAwayItemsResponse,
  BulkPutAwayJobResponse,
  PutAwayBinSuggestResponse,
} from '@/types';

// ---------- Generate Put-Away List from Receiving Slip ----------
export async function generatePutAwayFromSlip(
  slipId: string,
  workerId?: string
): Promise<PutAwayList> {
  const { data } = await coreClient.post<PutAwayList>(
    `/put-away/generate-from-slip/${slipId}`,
    workerId ? { worker_id: workerId } : {},
    { timeout: 60000 } // 60 seconds — put-away generation can be slow
  );
  return data;
}

// ---------- List Put-Away Lists ----------
export async function getPutAwayLists(params?: {
  warehouse_id?: string;
  receiving_slip_id?: string;
  status?: 'pending' | 'completed';
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<PutAwayList>> {
  const { data } = await coreClient.get<PaginatedResponse<PutAwayList>>('/put-away', {
    params,
  });
  return data;
}

// ---------- Get Put-Away List Detail ----------
export async function getPutAwayList(listId: string): Promise<PutAwayList> {
  const { data } = await coreClient.get<PutAwayList>(`/put-away/${listId}`);
  return data;
}

// ---------- Suggest bins for a manual put-away line ----------
export async function suggestPutAwayBins(payload: {
  item_id: string;
  quantity: number;
  warehouse_id: string;
  worker_id: string;
  batch_number?: string | null;
  limit?: number;
}): Promise<PutAwayBinSuggestResponse['suggestions']> {
  const { data } = await coreClient.post<PutAwayBinSuggestResponse>(
    '/wms-3d/suggest',
    { task_type: 'put_away', ...payload },
  );
  return data.suggestions ?? [];
}

// ---------- Complete a Put-Away Item ----------
export async function completePutAwayItem(
  listId: string,
  itemId: string,
  binId?: string // optional override bin
): Promise<PutAwayItem> {
  const { data } = await coreClient.post<PutAwayItem>(
    `/put-away/${listId}/items/${itemId}/complete`,
    binId ? { bin_id: binId } : {}
  );
  return data;
}

// ---------- Bulk Complete Put-Away Items (Flow A) ----------
// Small batches complete synchronously in one call (200 + result). Larger
// batches are queued server-side and polled with exponential backoff.

// Client-side tunables — override via EXPO_PUBLIC_* env vars.
const BULK_PUTAWAY_POST_TIMEOUT =
  Number(process.env.EXPO_PUBLIC_BULK_PUTAWAY_POST_TIMEOUT) || 30000;
const BULK_PUTAWAY_POLL_DEADLINE =
  Number(process.env.EXPO_PUBLIC_BULK_PUTAWAY_POLL_DEADLINE) || 120000;
const BULK_PUTAWAY_POLL_INTERVAL =
  Number(process.env.EXPO_PUBLIC_BULK_PUTAWAY_POLL_INTERVAL) || 1000;
const BULK_PUTAWAY_POLL_MAX_INTERVAL =
  Number(process.env.EXPO_PUBLIC_BULK_PUTAWAY_POLL_MAX_INTERVAL) || 8000;

/** Raised when an async bulk job is still queued/processing after the deadline. */
export class PutAwayStillPendingError extends Error {
  readonly jobId: string;

  constructor(jobId: string, message = 'Put-away is still processing on the server') {
    super(message);
    this.name = 'PutAwayStillPendingError';
    this.jobId = jobId;
  }
}

/**
 * Extract the completed job's `{ completed, failed, summary }` result. The
 * backend contract nests it under `result`, but fall back to the top-level
 * fields in case a completed job is returned flattened.
 */
function extractBulkResult(job: BulkPutAwayJobResponse): CompletePutAwayItemsResponse {
  const source = job.result ?? (job as unknown as CompletePutAwayItemsResponse);
  return {
    completed: source.completed ?? [],
    failed: source.failed ?? [],
    summary: source.summary ?? {},
  };
}

/**
 * Poll an already-queued bulk put-away job until it completes or fails.
 * Throws `PutAwayStillPendingError` (carrying `jobId`) when the deadline
 * elapses so the caller can resume checking without re-submitting.
 */
export async function pollBulkPutAwayJob(jobId: string): Promise<CompletePutAwayItemsResponse> {
  const deadline = Date.now() + BULK_PUTAWAY_POLL_DEADLINE;
  let delayMs = BULK_PUTAWAY_POLL_INTERVAL;
  while (Date.now() < deadline) {
    const { data: job } = await coreClient.get<BulkPutAwayJobResponse>(
      `/put-away/bulk-jobs/${jobId}`
    );
    if (job.status === 'completed') {
      return extractBulkResult(job);
    }
    if (job.status === 'failed') {
      throw new Error(job.error ?? 'Bulk put-away failed');
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 2, BULK_PUTAWAY_POLL_MAX_INTERVAL);
  }
  throw new PutAwayStillPendingError(jobId);
}

export async function completePutAwayItems(
  listId: string,
  binId: string,
  itemIds: string[]
): Promise<CompletePutAwayItemsResponse> {
  const { data } = await coreClient.post<
    CompletePutAwayItemsResponse | { job_id: string; status: string }
  >(
    `/put-away/${listId}/complete`,
    { bin_id: binId, item_ids: itemIds },
    // Synchronous completion runs inline, so allow more headroom than the
    // 15s default; async enqueue returns in milliseconds regardless.
    { timeout: BULK_PUTAWAY_POST_TIMEOUT }
  );

  // Synchronous response carries the result directly — no polling needed.
  if (!('job_id' in data) || !data.job_id) {
    return data as CompletePutAwayItemsResponse;
  }

  // Async job: poll with exponential backoff.
  return pollBulkPutAwayJob(data.job_id);
}

// ---------- Skip a Put-Away Item ----------
export async function skipPutAwayItem(
  listId: string,
  itemId: string,
  reason?: string
): Promise<PutAwayItem> {
  const { data } = await coreClient.post<PutAwayItem>(
    `/put-away/${listId}/items/${itemId}/skip`,
    reason ? { reason } : {}
  );
  return data;
}

// ================================================================
// Dual-Axis: QR-based Put-Away (No slip/list context needed)
// ================================================================

// ---------- List items available for put-away ----------
export async function getAvailableForPutaway(params?: {
  warehouse_id?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<TrackingItem>> {
  console.log('[PutAway API] GET /put-away/available', JSON.stringify(params ?? {}));
  const { data } = await coreClient.get<PaginatedResponse<TrackingItem>>(
    '/put-away/available',
    { params, timeout: 10000 }
  );
  console.log('[PutAway API] GET /put-away/available RESPONSE', JSON.stringify(data));
  return data;
}

// ---------- Complete put-away by QR ----------
export async function completePutawayByQr(
  payload: CompletePutawayRequest
): Promise<CompletePutawayResponse> {
  console.log('[PutAway API] POST /put-away/complete payload=', JSON.stringify(payload));
  const { data } = await coreClient.post<CompletePutawayResponse>(
    '/put-away/complete',
    payload,
    { timeout: 10000 }
  );
  console.log('[PutAway API] POST /put-away/complete RESPONSE', JSON.stringify(data));
  return data;
}

// ---------- Scan item for direct put-away (creates tracking row if missing) ----------
export async function scanItemForPutaway(payload: {
  qr: string;
  warehouse_id: string;
}): Promise<TrackingItem> {
  console.log('[PutAway API] POST /put-away/scan payload=', JSON.stringify(payload));
  const { data } = await coreClient.post<TrackingItem>('/put-away/scan', payload, {
    timeout: 10000,
  });
  console.log('[PutAway API] POST /put-away/scan RESPONSE', JSON.stringify(data));
  return data;
}

// ---------- Create a direct put-away list ----------
export interface DirectPutAwayList {
  id: string;
  put_away_list_no: string;
  status: string;
}

export async function createDirectPutAwayList(
  warehouseId: string
): Promise<DirectPutAwayList> {
  console.log('[PutAway API] POST /put-away/lists warehouse_id=', warehouseId);
  const { data } = await coreClient.post<DirectPutAwayList>(
    '/put-away/lists',
    { warehouse_id: warehouseId },
    { timeout: 10000 }
  );
  console.log('[PutAway API] POST /put-away/lists RESPONSE', JSON.stringify(data));
  return data;
}

// ---------- Lookup tracking by QR ----------
export async function lookupTrackingByQr(qr: string): Promise<TrackingItem | null> {
  const url = `/put-away/lookup/${encodeURIComponent(qr)}`;
  console.log('[PutAway API] GET', url);
  try {
    const { data } = await coreClient.get<TrackingItem>(url, { timeout: 8000 });
    console.log('[PutAway API] GET', url, 'RESPONSE', JSON.stringify(data));
    return data;
  } catch (err: any) {
    console.log(
      '[PutAway API] GET', url, 'ERROR',
      err?.response?.status,
      JSON.stringify(err?.response?.data ?? err?.message)
    );
    // Only a genuine "not found" (404) means the tracking row doesn't exist.
    // Server / timeout / network errors must propagate so callers don't mistake
    // a transient failure for a missing record and create a duplicate row.
    if (err?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

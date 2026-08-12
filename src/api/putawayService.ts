// ============================================================
// Put-Away Service — Generate, List, Complete (QR-based dual-axis)
// ============================================================
import { coreClient } from './client';
import type {
  PutAwayList,
  PutAwayItem,
  PaginatedResponse,
  TrackingItem,
  CompletePutawayRequest,
  CompletePutawayResponse,
} from '../types';

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
  const { data } = await coreClient.get<PaginatedResponse<TrackingItem>>(
    '/put-away/available',
    { params, timeout: 10000 }
  );
  return data;
}

// ---------- Complete put-away by QR ----------
export async function completePutawayByQr(
  payload: CompletePutawayRequest
): Promise<CompletePutawayResponse> {
  const { data } = await coreClient.post<CompletePutawayResponse>(
    '/put-away/complete',
    payload,
    { timeout: 10000 }
  );
  return data;
}

// ---------- Lookup tracking by QR ----------
export async function lookupTrackingByQr(qr: string): Promise<TrackingItem | null> {
  try {
    const { data } = await coreClient.get<TrackingItem>(
      `/put-away/lookup/${encodeURIComponent(qr)}`,
      { timeout: 8000 }
    );
    return data;
  } catch {
    return null;
  }
}

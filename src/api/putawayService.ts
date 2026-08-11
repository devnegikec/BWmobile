// ============================================================
// Put-Away Service — Generate, List, Complete Put-Away Items
// ============================================================
import { coreClient } from './client';
import type { PutAwayList, PutAwayItem, PaginatedResponse } from '../types';

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

// ── Parallel Workflow: Direct Put-Away (NEW) ──────────────────────────────

/** Scanned items on dock, ready for put-away. */
export interface AvailableItem {
  qr_identifier: string;
  sku: string;
  item_id: string;
  batch_number: string | null;
  quantity: number;
  receiving_status: string;
  scanned_at: string;
}

export interface AvailableItemsResponse {
  items: AvailableItem[];
  total: number;
}

/** Items scanned but not yet binned. */
export async function getAvailableItems(warehouseId: string): Promise<AvailableItemsResponse> {
  const { data } = await coreClient.get<AvailableItemsResponse>(
    `/put-away/available?warehouse_id=${warehouseId}`
  );
  return data;
}

/** Direct put-away result. */
export interface DirectPutawayResult {
  qr_identifier: string;
  sku: string;
  bin_location_id: string;
  putaway_status: string;
  receiving_status: string;
  stock_entered: boolean;
  putaway_at: string | null;
}

/** Worker B scans QR → puts directly in bin. No put-away list needed. */
export async function directPutaway(
  qrIdentifier: string,
  binLocationId: string
): Promise<DirectPutawayResult> {
  const { data } = await coreClient.post<DirectPutawayResult>(
    '/put-away/direct',
    { qr_identifier: qrIdentifier, bin_location_id: binLocationId }
  );
  return data;
}

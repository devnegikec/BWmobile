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

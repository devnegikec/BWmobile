// ============================================================
// Bin Service — Bin stock operations for Assign Bin workflow
// ============================================================
import { coreClient } from './client';

// ---------- Types ----------
export interface BinStockItem {
  bin_location_id: string;
  bin_code: string;
  bin_name: string;
  warehouse_id: string;
  item_id: string;
  quantity_on_hand: number;
  batch_number: string;
  bin_capacity: number;
  available_capacity: number;
}

export interface AddBinStockRequest {
  bin_location_id: string;
  item_id: string;
  quantity: number;
  batch_number?: string;
  warehouse_id: string;
}

export interface BinStockResponse {
  id: string;
  bin_location_id: string;
  item_id: string;
  quantity: number;
  batch_number: string;
  created_at: string;
}

// ---------- Add Stock to Bin (Assign Item to Bin) ----------
export async function addStockToBin(payload: AddBinStockRequest): Promise<BinStockResponse> {
  const { data } = await coreClient.post<BinStockResponse>('/bin-stock/add', payload);
  return data;
}

// ---------- Get Bin Stock for an Item ----------
export async function getBinStockForItem(itemId: string): Promise<{ bins: BinStockItem[] }> {
  const { data } = await coreClient.get<{ bins: BinStockItem[] }>(
    `/bin-stock/item/${itemId}`
  );
  return data;
}

// ---------- Lookup Item by SKU ----------
export async function lookupItemBySku(
  sku: string,
  warehouseId: string
): Promise<{ item_id: string; sku: string; name: string } | null> {
  try {
    const { data } = await coreClient.get<{ items: Array<{ id: string; sku: string; name: string }> }>(
      '/stock-levels',
      { params: { search: sku, warehouse_id: warehouseId, page_size: 1 } }
    );
    const items = data.items || [];
    if (items.length > 0) {
      return { item_id: items[0].id, sku: items[0].sku, name: items[0].name };
    }
    return null;
  } catch {
    return null;
  }
}

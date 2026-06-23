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
  bin_id: string;
  item_id: string;
  quantity: number;
  batch_number?: string;
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

// ---------- Lookup Item by SKU (barcode / item_code) ----------
// Uses /items/by-sku/{sku} — direct lookup, works regardless of stock levels
export async function lookupItemBySku(
  sku: string,
  _warehouseId: string
): Promise<{ item_id: string; sku: string; name: string } | null> {
  try {
    const { data } = await coreClient.get<{
      id: string;
      item_code: string;
      item_name: string;
    }>(`/items/by-sku/${encodeURIComponent(sku)}`);
    return {
      item_id: data.id,
      sku: data.item_code,
      name: data.item_name,
    };
  } catch {
    return null;
  }
}

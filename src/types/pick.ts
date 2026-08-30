// ============================================================
// Pick list (outbound) types
// ============================================================
import type { Pagination } from '@/types/common';

export type PickListStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export interface PickSerialDetail {
  serial_number: string;
  sku?: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
}

export interface PickListItem {
  id: string;
  item_id: string;
  item_name?: string | null;
  sku?: string | null;
  qty: number;
  picked_qty: number;
  uom: string;
  per_case_qty?: number | null;
  case_qty?: number | null;
  loose_qty?: number | null;
  batch_no: string | null;
  bin_location_id: string | null;
  bin_location_path?: string | null;
  serials?: PickSerialDetail[];
}

export interface PickListProgress {
  total_items: number;
  picked_items: number;
  remaining_items: number;
  total_qty: number;
  picked_qty: number;
  remaining_qty: number;
  completion_percentage: number;
}

export interface PickListSummary {
  id: string;
  pick_list_no: string;
  warehouse_id: string;
  status: PickListStatus;
  invoice_reference?: string | null;
  assigned_to?: string | null;
  worker_name?: string | null;
  progress?: PickListProgress | null;
  created_at?: string | null;
}

export interface PickList {
  id: string;
  pick_list_no: string;
  warehouse_id: string;
  status: PickListStatus;
  invoice_reference?: string | null;
  assigned_to?: string | null;
  worker_name?: string | null;
  items: PickListItem[];
  progress?: PickListProgress | null;
  created_at?: string | null;
}

export interface PickScanResult {
  pick_list_id: string;
  pick_list_status: string;
  pick_list_item_id?: string;
  item_id?: string;
  sku: string;
  scanned_qty: number;
  picked_qty: number;
  required_qty: number;
  remaining_qty: number;
  batch: string | null;
}

export interface PickListListResponse {
  pick_lists: PickListSummary[];
  pagination: Pagination;
}

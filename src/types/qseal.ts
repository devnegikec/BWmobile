// ============================================================
// QSeal types
// ============================================================
import type { Pagination } from '@/types/common';

export interface QSealScanRequest {
  serial_number: string;
  device_type?: string;
  os?: string;
  browser?: string;
  ip_address?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
  extra_data?: Record<string, unknown>;
}

export interface QSealNode {
  node_id: string;
  serial_number: string;
  qseal_type: 'shipper' | 'pallet' | 'container' | 'box' | 'unit';
  name: string;
  parent_id: string | null;
  children_count: number;
  capacity?: number;
  app_cascade_map?: boolean;
  message?: string;
}

export interface QSealMapRequest {
  child_ids: string[];
}

export interface QSealMapResponse {
  parent_id: string;
  mapped_count: number;
  message: string;
}

export interface QSealHistoryItem {
  id: string;
  serial_number: string;
  scan_timestamp: string;
  device_type: string;
  city: string;
  state: string;
  country: string;
}

// ---------- QSeal Linked Units ----------
export interface LinkedUnit {
  id: string;
  serial_number: string;
  product_name?: string;
  product_sku?: string;
  manufacturing_date: string;
  expiry_date: string;
  dispatch_batch: string;
  mrp: number | null;
  product_item_url: string;
  product_item_scan_count: number;
}

export interface QSealParentWithUnits {
  id: string;
  serial_number: string;
  name: string;
  qseal_type: string;
  capacity: number;
  children_count: number;
  linked_units: LinkedUnit[];
}

export interface QSealHistoryResponse {
  events: QSealHistoryItem[];
  pagination: Pagination;
}

// ============================================================
// Horizon Sync — Mobile App Type Definitions
// ============================================================

// ---------- Auth ----------
export interface LoginRequest {
  email: string;
  password: string;
  remember_me?: boolean;
  device_info?: {
    device_name: string;
    os: string;
    app_version: string;
  };
}

export interface BarcodeLoginRequest {
  barcode: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  user_type: string;
  organization_id: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface LoginResponse extends TokenResponse {
  user: User;
}

export interface Worker {
  id: string;
  organization_id: string;
  warehouse_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  employee_id: string;
  role: string;
  status: string;
  barcode: string;
  last_login_at: string;
  created_at: string;
}

export interface WorkerLoginResponse extends TokenResponse {
  worker: Worker;
}

// ---------- Warehouse ----------
export interface Warehouse {
  id: string;
  name: string;
  code: string;
  city: string;
  type: string;
  is_default: boolean;
}

// ---------- Inbound ----------
export interface InboundSession {
  id: string;
  organization_id: string;
  session_type: 'inbound';
  worker_id: string;
  warehouse_id: string;
  dock_location: string;
  status: 'OPEN' | 'CLOSED';
  total_boxes_scanned: number;
  started_at: string;
  created_at: string;
}

export interface StartSessionRequest {
  warehouse_id: string;
  dock_location: string;
}

export interface RecordScanRequest {
  qr_data: string;
  device_type?: string;
  os?: string;
}

export interface ScanRecord {
  scan_item_id: string;
  session_id: string;
  qr_identifier: string;
  sku: string;
  raw_quantity: number;
  batch_number: string;
  packaging_unit_id: string | null;
  scanned_at: string;
  total_boxes_scanned: number;
}

export interface SessionSummary {
  session_id: string;
  status: string;
  session_type: string;
  warehouse_id: string;
  worker_id: string;
  dock_location: string;
  started_at: string;
  total_boxes: number;
  total_quantity: number;
  items: SummaryItem[];
}

export interface SummaryItem {
  sku: string;
  total_quantity: number;
  total_boxes: number;
  batches: SummaryBatch[];
}

export interface SummaryBatch {
  batch_number: string;
  quantity: number;
  box_count: number;
}

export interface ReceivingSlip {
  id: string;
  organization_id: string;
  slip_number: string;
  session_id: string;
  warehouse_id: string;
  status: 'pending_review' | 'pending_putaway' | 'putaway_complete' | 'rejected';
  created_at: string;
  items: ReceivingSlipItem[];
}

export interface ReceivingSlipItem {
  id: string;
  sku: string;
  batch_number: string;
  quantity: number;
  box_count: number;
  flag: 'ok' | 'short' | 'damaged';
  notes: string | null;
}

// ---------- Put-Away ----------
export interface PutAwayList {
  id: string;
  organization_id: string;
  warehouse_id: string;
  put_away_list_no: string;
  status: 'pending' | 'completed';
  reference_type: string;
  reference_id: string;
  receiving_slip_id: string;
  assigned_to: string;
  warnings: string[];
  created_at: string;
  items: PutAwayItem[];
}

export interface PutAwayItem {
  id: string;
  item_id: string;
  sku: string;
  batch_number: string;
  quantity: number;
  bin_location_id: string;
  bin_location_code: string;
  sort_order: number;
  status: 'pending' | 'completed' | 'skipped';
  completed_at?: string;
}

// ---------- Pagination ----------
export interface Pagination {
  page: number;
  page_size: number;
  total_items?: number;
  total_pages?: number;
  total?: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  [key: string]: T[];
  pagination: Pagination;
}

// ---------- API Error ----------
export interface ApiError {
  detail: string;
}

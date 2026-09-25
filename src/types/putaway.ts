// ============================================================
// Put-away, tracking & bin QR types
// ============================================================

export interface PutAwayList {
  id: string;
  organization_id: string;
  warehouse_id: string;
  put_away_list_no: string;
  status: 'pending' | 'in_progress' | 'completed';
  reference_type?: string;
  reference_id?: string;
  receiving_slip_id: string;
  receiving_slip_no?: string | null;
  assigned_to?: string | null;
  worker_id?: string | null;
  worker_name?: string | null;
  total_items: number;
  completed_items: number;
  pending_items: number;
  remarks?: string | null;
  warnings: string[] | null;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  /** Legacy flat format */
  items?: PutAwayItem[];
  /** New grouped format (one group per put-away line / master pack) */
  groups?: PutAwayGroup[];
}

export interface PutAwayItem {
  id: string;
  item_id: string;
  sku: string;
  item_name?: string;
  batch_number: string;
  serial_nos?: string[] | null;
  quantity: number;
  bin_location_id: string;
  bin_location_code: string;
  bin_full_path?: string;
  sort_order: number;
  status: 'pending' | 'completed' | 'skipped';
  notes?: string | null;
  completed_at?: string | null;
}

export interface PutAwayParentInfo {
  id: string;
  serial_number: string | null;
  name: string | null;
  qseal_type: string | null;
  capacity: number | null;
}

export interface PutAwayGroupItem {
  serial_number: string | null;
  sku: string | null;
  batch_number: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  quantity: number;
  box_count: number;
}

export interface PutAwayGroup {
  id: string;
  item_id: string | null;
  parent_qseal: PutAwayParentInfo | null;
  product_name: string | null;
  bin_location_id: string | null;
  bin_location_code: string | null;
  status: string | null;
  sort_order: number;
  items: PutAwayGroupItem[];
}

// ---------- Suggested bin (smart location engine) ----------
export interface PutAwayBinSuggestion {
  rank: number;
  bin_id: string;
  bin_code: string | null;
  score: number;
  batch_number: string | null;
}

export interface PutAwayBinSuggestResponse {
  suggestions: PutAwayBinSuggestion[];
}

// ---------- Dual-Axis Put-Away (QR-based) ----------
export interface TrackingItem {
  id: string;
  organization_id: string;
  warehouse_id: string;
  scan_session_id: string;
  scan_session_item_id: string;
  qr_identifier: string;
  item_id: string;
  sku: string;
  batch_number: string | null;
  quantity: number;
  receiving_status: 'scanned' | 'approved' | 'rejected';
  receiving_slip_id: string | null;
  putaway_status: 'pending' | 'completed';
  bin_location_id: string | null;
  stock_entered: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompletePutawayRequest {
  qr: string;
  bin_id: string;
  quantity?: number;
  put_away_list_id?: string;
}

export interface CompletePutawayResponse {
  id: string;
  qr_identifier: string;
  sku: string;
  batch_number: string;
  quantity: number;
  bin_location_id: string;
  putaway_status: 'completed';
  stock_entered: boolean;
  completed_at: string;
}

// ---------- Bulk Put-Away (slip/list based — Flow A) ----------
export interface CompletePutAwayItemsRequest {
  bin_id?: string;
  item_ids: string[];
}

export interface CompletePutAwayItemResult {
  id?: string;
  item_id?: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  bin_location_id?: string;
  bin_location_code?: string;
  status?: string;
  completed_at?: string;
}

export interface CompletePutAwayFailedItem {
  id?: string;
  item_id?: string;
  error?: string;
  message?: string;
  detail?: string;
}

export interface CompletePutAwayItemsResponse {
  completed?: CompletePutAwayItemResult[];
  failed?: CompletePutAwayFailedItem[];
  summary?: { completed_count?: number; failed_count?: number };
}

// ---------- Bulk Put-Away Async Job (polling) ----------
export interface BulkPutAwayJobResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  job_type?: string;
  put_away_list_id?: string | null;
  progress?: { total: number; completed: number; failed: number } | null;
  result?: CompletePutAwayItemsResponse | null;
  error?: string | null;
  completed_at?: string | null;
}

// ---------- FIFO Bin Suggestions (Workflow B) ----------
export interface FifoBinSuggestion {
  bin_id: string;
  bin_path: string;
  batch_number: string;
  quantity_on_hand: number;
  stock_age_days: number;
}

export interface FifoBinResponse {
  sku: string;
  bins: FifoBinSuggestion[];
  message: string | null;
}

// ---------- Assign Bin (Workflow B) ----------
export interface AssignBinRequest {
  bin_location_id: string;
  quantity?: number;
}

export interface AssignBinResponse {
  slip_item_id: string;
  sku: string;
  batch_number: string;
  quantity: number;
  bin_location_id: string;
  bin_full_path: string;
  put_away_status: string;
  put_away_at: string;
}

// ---------- Bin QR ----------
export interface BinQRPayload {
  type: 'location';
  org_id: string;
  org_name: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_id: string;
  full_path: string;
  location_type: string;
  location_code: string;
}

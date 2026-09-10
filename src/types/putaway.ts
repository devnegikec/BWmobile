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
  assigned_to?: string | null;
  total_items: number;
  completed_items: number;
  pending_items: number;
  remarks?: string | null;
  warnings: string[];
  created_at: string;
  updated_at?: string;
  items: PutAwayItem[];
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

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

export interface QRLoginRequest {
  qr_code: string;
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

export interface QRLoginResponse extends TokenResponse {
  access_token: string;
  refresh_token: string;
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
  asn_order_id?: string | null;
  asn_order_no?: string | null;
}

export interface StartSessionRequest {
  warehouse_id: string;
  dock_location: string;
  asn_order_id?: string;
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
  total_boxes?: number;
  total_items?: number;
  created_at: string;
  asn_order_id?: string | null;
  asn_order_no?: string | null;
  /** New grouped format from API */
  groups?: ReceivingSlipGroup[];
  /** Legacy flat format */
  items?: ReceivingSlipItem[];
}

// Group format (matches backend response)
export interface ReceivingSlipGroup {
  parent_qseal: {
    id: string;
    serial_number: string;
    name: string;
    qseal_type: string;
    capacity: number;
  };
  product_name: string;
  items: ReceivingSlipGroupItem[];
}

export interface ReceivingSlipGroupItem {
  id: string;
  serial_number: string;
  sku: string;
  batch_number: string;
  manufacturing_date?: string;
  expiry_date?: string;
  quantity: number;
  box_count: number;
  flag: string;
  notes: string | null;
}

export interface ReceivingSlipItem {
  id: string;
  sku: string;
  batch_number: string;
  quantity: number;
  box_count: number;
  flag: 'ok' | 'short' | 'damaged' | 'rejected';
  notes: string | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  put_away_status?: 'pending' | 'completed';
  put_away_at?: string | null;
}

// ---------- Put-Away ----------
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

// ---------- ASN Order ----------
export interface AsnOrder {
  id: string;
  asn_order_no: string;
  supplier_name: string;
  status: string;
  expected_boxes: number;
  expected_items: number;
  created_at: string;
}

// ---------- QSeal ----------
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

// ---------- API Error ----------
export interface ApiError {
  detail: string;
}

// ---------- ASN Orders ----------
export interface AsnOrder {
  id: string;
  organization_id: string;
  asn_order_no: string;
  status: 'draft' | 'confirmed' | 'partially_delivered' | 'delivered' | 'closed';
  order_date?: string;
  delivery_date?: string;
  grand_total?: string;
  from_warehouse?: {
    id: string;
    name: string;
    code: string;
  };
  to_warehouse?: {
    id: string;
    name: string;
    code: string;
  };
  created_at: string;
  items?: AsnOrderItem[];
}

export interface AsnOrderItem {
  id: string;
  asn_order_id: string;
  item_id: string;
  sku: string;
  item_name?: string;
  qty: number;
  delivered_qty: number;
  batch_number?: string;
}

// ---------- ASN Receiving Summary ----------
export interface AsnReceivingSummary {
  asn_order_id: string;
  asn_order_no: string;
  asn_status: string;
  expected_total_qty: number;
  accepted_total_qty: number;
  rejected_total_qty: number;
  pending_total_qty: number;
  over_total_qty: number;
  total_line_items: number;
  matched_items: number;
  partial_items: number;
  not_received_items: number;
  over_items: number;
  linked_slips: AsnLinkedSlip[];
  line_items: AsnSummaryLineItem[];
}

export interface AsnLinkedSlip {
  slip_id: string;
  slip_number: string;
  status: string;
  created_at: string;
  total_accepted_qty: number;
  total_rejected_qty: number;
  total_items: number;
}

export interface AsnSummaryLineItem {
  asn_item_id: string;
  item_id: string;
  sku: string;
  item_name: string;
  expected_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  pending_qty: number;
  over_qty: number;
  status: 'matched' | 'partial' | 'not_received' | 'over';
}

// ---------- Floating Items ----------
export interface FloatingItem {
  slip_item_id: string;
  slip_id: string;
  slip_number: string;
  sku: string;
  batch_number: string;
  quantity: number;
  rejection_reason: string;
  rejected_at: string;
  warehouse_id: string;
  asn_order_no?: string | null;
}

export interface FloatingItemsResponse {
  floating_items: FloatingItem[];
  total: number;
  page: number;
  page_size: number;
}

export type FloatingResolveAction = 'accept' | 'return_to_sender' | 'dispose';

export interface ResolveFloatingRequest {
  action: FloatingResolveAction;
  notes?: string;
}

// ---------- Link ASN Request ----------
export interface LinkAsnRequest {
  asn_order_id: string;
}

// ---------- Reject Item Request ----------
export interface RejectItemRequest {
  reason: string;
  notes?: string;
}

// ---------- Item Rejection State (local, for review step) ----------
export interface ItemRejectionState {
  /** Maps "sku|batch_number" → rejection info */
  [key: string]: {
    rejected: boolean;
    reason: string;
  };
}

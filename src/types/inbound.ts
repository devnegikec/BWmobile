// ============================================================
// Inbound receiving, ASN, floating items & exceptions types
// ============================================================

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
  vehicle_arrival_id?: string | null;
  vehicle_no?: string | null;
}

export interface StartSessionRequest {
  warehouse_id: string;
  dock_location: string;
  asn_order_id?: string;
}

// ---------- Vehicle Arrival (inbound dock check-in) ----------
export interface VehicleArrivalCreatePayload {
  vehicle_no: string;
  driver_name?: string;
  driver_contact?: string;
  transporter?: string;
  warehouse_id?: string;
  dock?: string;
  asn_order_ids?: string[];
  notes?: string;
}

export interface VehicleArrival {
  id: string;
  organization_id: string;
  vehicle: {
    id: string;
    vehicle_no: string;
    driver_name?: string | null;
    driver_contact?: string | null;
    transporter?: string | null;
  } | null;
  warehouse_id?: string | null;
  dock?: string | null;
  status: string;
  arrived_at: string;
  notes?: string | null;
  asn_orders?: { id: string; asn_order_no: string; status?: string | null }[];
  created_at?: string;
  updated_at?: string;
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
  exception_id?: string | null;
  exception_status?: string | null;
}

export type InboundExceptionClassification = 'short' | 'damaged' | 'excess' | 'hold' | 'quarantine';
export type InboundExceptionDestination = 'HOLD' | 'QUARANTINE';

export interface InboundScanExceptionInput {
  serial_number: string;
  classification: InboundExceptionClassification;
  reason_code: string;
  destination?: InboundExceptionDestination;
  note?: string;
  evidence_uri?: string;
  evidence_name?: string;
  evidence_type?: string;
}

export interface InboundExceptionEvidence {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface InboundException {
  id: string;
  warehouse_id: string;
  slip_id?: string | null;
  slip_item_id?: string | null;
  exception_type: string;
  reason_code: string;
  status: string;
  condition_code: string;
  destination?: InboundExceptionDestination | 'released' | null;
  destination_location_id?: string | null;
  qr_identifier?: string | null;
  sku?: string | null;
  batch_number?: string | null;
  quantity: number;
  note?: string | null;
  disposition?: string | null;
  disposition_note?: string | null;
  created_at?: string | null;
  evidence: InboundExceptionEvidence[];
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
    batch: string; // batch name from QSealTrack.name
    qseal_type: string;
    capacity: number;
  };
  product_name: string;
  items: ReceivingSlipGroupItem[];
}

export interface ReceivingSlipGroupItem {
  id: string;
  serial_number: string; // unique item identifier
  sku: string;
  batch_number: string; // actual dispatch batch from QSeal
  manufacturing_date?: string;
  expiry_date?: string;
  quantity: number;
  box_count: number;
  flag: string;
  condition_code?: string | null;
  exception_status?: string | null;
  exception_destination_location_id?: string | null;
  notes: string | null;
}

export interface ReceivingSlipItem {
  id: string;
  sku: string;
  batch_number: string;
  quantity: number;
  box_count: number;
  flag: 'ok' | 'short' | 'damaged' | 'excess' | 'hold' | 'quarantine' | 'rejected';
  condition_code?: string | null;
  exception_status?: string | null;
  notes: string | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  put_away_status?: 'pending' | 'completed';
  put_away_at?: string | null;
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
  scanned_total_qty: number;
  accepted_total_qty: number;
  rejected_total_qty: number;
  short_total_qty: number;
  excess_total_qty: number;
  damaged_total_qty: number;
  hold_total_qty: number;
  pending_total_qty: number;
  over_total_qty: number;
  total_line_items: number;
  matched_items: number;
  partial_items: number;
  not_received_items: number;
  over_items: number;
  reconciliation_status: 'pending' | 'partial' | 'exception' | 'reconciled';
  ready_for_receipt_note: boolean;
  is_partial_receipt: boolean;
  unresolved_exception_count: number;
  active_session_id?: string | null;
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
  scanned_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  short_qty: number;
  excess_qty: number;
  damaged_qty: number;
  hold_qty: number;
  pending_qty: number;
  over_qty: number;
  status: 'matched' | 'partial' | 'not_received' | 'over' | 'exception' | 'not_applicable';
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

// ---------- Bulk Item Status Update ----------
export interface ItemStatusUpdate {
  item_id: string;
  status: 'rejected' | 'ok' | 'short' | 'damaged';
  reason?: string;
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

// ============================================================
// Returns types — registrations, receiving sessions, classification
// ============================================================
// Source of truth: docs/RETURNS_HANDHELD_INTEGRATION.md v1.0 (2026-09-19).
//
// Conventions used below:
//   • Fields shown in a documented JSON sample are REQUIRED.
//   • Fields the UI needs but the doc does not spell out are OPTIONAL and
//     flagged `⚠ inferred` so a backend mismatch surfaces as a type error
//     rather than a crash.
//   • The `/returns/…` endpoints are NOT deployed yet. Nothing here has been
//     verified against a running API — see Phase 0 of
//     docs/RETURNS_MOBILE_TASK_LIST.md.
// ============================================================

// ---------- Enums ----------

/** Condition captured per unit — §3.4. Exactly four values. */
export type ReturnCondition = 'good' | 'damaged' | 'hold' | 'quarantine';

/** §3.4 / §6 — a non-`good` condition always requires a reason code. */
export const NON_GOOD_RETURN_CONDITIONS: readonly ReturnCondition[] = [
  'damaged',
  'hold',
  'quarantine',
] as const;

/** Segregation target. `DAMAGED` is reserved for §10 Q3 (not confirmed). */
export type ReturnDestination = 'HOLD' | 'QUARANTINE' | 'DAMAGED';

/** What the device should do after a successful scan — §3.3. */
export type ReturnNextAction = 'classify' | 'report_unreadable';

/**
 * Registration lifecycle — §2, §3.5, §7.
 * `ready` is the only state that can open a new session; `receiving` is that
 * session's own state. `closed` is named in §7's operator-action column.
 */
export type ReturnRegistrationStatus =
  | 'ready'
  | 'receiving'
  | 'received'
  | 'cancelled'
  | 'closed';

/**
 * Session lifecycle — §3.1 shows `open`; §7 defines `RETURN_SESSION_NOT_OPEN`
 * for a closed/ended session.
 * ⚠ inferred: the contract never enumerates the terminal value(s), so treat
 * this union as provisional until Phase 0 confirms it.
 */
export type ReturnSessionStatus = 'open' | 'ended' | 'cancelled';

/** ⚠ inferred: §3.4 only ever shows `pending_approval`. */
export type ReturnExceptionStatus = 'pending_approval' | 'approved' | 'rejected';

// ---------- Registration ----------

/** ⚠ inferred: shape not documented; §3.1 only shows `{ id, name }`. */
export interface ReturnWarehouseRef {
  id: string;
  name: string;
}

/** ⚠ inferred: same shape as `ReturnWarehouseRef`. */
export interface ReturnPartyRef {
  id: string;
  name: string;
}

/**
 * A return registration awaiting receipt — **list** shape (§8 case 1).
 *
 * ✅ Verified against the live API: the list endpoint returns FLAT warehouse
 * and party names, unlike `GET /returns/registrations/{id}` which nests
 * `warehouse` / `party` objects. See `ReturnRegistrationDetail`.
 */
export interface ReturnRegistration {
  id: string;
  registration_no: string;
  status: ReturnRegistrationStatus;
  /** e.g. `delivery_note`. ✅ live */
  reference_type?: string;
  invoice_no?: string | null;
  /** ✅ live — flat, list-only. */
  party_name?: string | null;
  /** ✅ live — flat, list-only. */
  warehouse_name?: string | null;
  /** ✅ live — flat, list-only. */
  warehouse_id?: string | null;
  /**
   * The reason the registration was created with.
   * ✅ live on BOTH the list and the detail endpoint — pre-selects the picker
   * (task 6.9) without an extra round-trip.
   */
  return_reason_code?: string | null;
  expected_qty: number;
  received_qty: number;
  created_at?: string;
}

/** One expected line of a registration DETAIL response — ✅ live shape. */
export interface ReturnRegistrationDetailLine {
  id: string;
  sku: string;
  item_name: string;
  uom: string;
  expected_qty: number;
  received_qty: number;
  serials: string[];
  /** Per-condition counts; zeroed until units are classified. */
  conditions?: Record<ReturnCondition, number>;
}

/**
 * `GET /returns/registrations/{id}` — ✅ verified live.
 *
 * Distinct from the list row: it nests `warehouse` / `party` objects, carries
 * the registration's original `return_reason_code` (task 6.9 defaults the
 * picker from it), and its `lines[]` use `id` / `received_qty` rather than the
 * session's `line_id` / `scanned_qty`.
 */
export interface ReturnRegistrationDetail {
  id: string;
  registration_no: string;
  status: ReturnRegistrationStatus;
  reference_type?: string;
  invoice_no?: string | null;
  party?: ReturnPartyRef;
  warehouse?: ReturnWarehouseRef;
  /** The reason the registration was created with — pre-selects the picker. */
  return_reason_code?: string | null;
  note?: string | null;
  expected_qty: number;
  received_qty: number;
  created_at?: string;
  lines: ReturnRegistrationDetailLine[];
  /** ⚠ live: present as an empty array on a fresh registration. */
  sessions?: unknown[];
}

/**
 * Session line — ✅ verified live via `GET /returns/sessions/{id}`.
 * Note these differ from `ReturnRegistrationDetailLine`.
 */
export interface ReturnRegistrationLine {
  line_id: string;
  sku: string;
  item_name: string;
  uom: string;
  expected_qty: number;
  scanned_qty: number;
  classified_qty: number;
  serials: string[];
}

// ---------- Session ----------

/**
 * Return receiving session header.
 *
 * §3.1 returns the flat form; §3.2 adds `lines[]` + `items[]`. Both are
 * modelled here with the collections optional so a single type covers the
 * create response and the resume/poll response.
 */
export interface ReturnSession {
  id: string;
  registration_id: string;
  registration_no: string;
  warehouse?: ReturnWarehouseRef;
  status: ReturnSessionStatus;
  dock_location?: string | null;
  started_at: string;
  /** ✅ live — present as `null` while the session is open. */
  ended_at?: string | null;
  expected_qty: number;
  scanned_qty: number;
  classified_qty: number;
  /** Present on `GET /returns/sessions/{id}` only — §3.2 */
  lines?: ReturnRegistrationLine[];
  /** Present on `GET /returns/sessions/{id}` only — §3.2 */
  items?: ReturnSessionItem[];
}

/** One captured unit inside a session — §3.2 `items[]`. */
export interface ReturnSessionItem {
  id: string;
  qr_identifier: string;
  sku: string;
  serial_number: string;
  quantity: number;
  /**
   * `null` means the unit still needs classification. Drives the "N to
   * classify" badge and the post-restart pending list (§3.2, §5.4).
   */
  condition: ReturnCondition | null;
  reason_code: string | null;
  exception_id: string | null;
}

// ---------- Requests ----------

/** `POST /returns/registrations/{id}/sessions` — §3.1 */
export interface StartReturnSessionRequest {
  dock_location?: string;
  device_id?: string;
}

/** `POST /returns/sessions/{id}/scans` — §3.3 */
export interface RecordReturnScanRequest {
  qr_data: string;
  device_type?: string;
  os?: string;
}

/** `POST /returns/sessions/{id}/classify` — §3.4 */
export interface ClassifyReturnItemRequest {
  item_id: string;
  condition: ReturnCondition;
  /** Required whenever `condition !== 'good'` → `400 RETURN_REASON_CODE_REQUIRED` */
  reason_code?: string;
  note?: string;
  /** Override the reason's `default_destination`; omit to accept the server's. */
  destination?: ReturnDestination;
  /** Re-send a classification to change the reason → `409 RETURN_ITEM_ALREADY_CLASSIFIED` otherwise. */
  override?: boolean;
}

/** Single entry of `POST …/classify/bulk` — §3.4 */
export interface ClassifyReturnItemBulkEntry {
  item_id: string;
  condition: ReturnCondition;
  reason_code?: string;
  note?: string;
  destination?: ReturnDestination;
  override?: boolean;
}

/** `POST /returns/sessions/{id}/classify/bulk` — §3.4 */
export interface ClassifyReturnItemsBulkRequest {
  items: ClassifyReturnItemBulkEntry[];
}

/** `POST /returns/sessions/{id}/end` — §3.5 */
export interface EndReturnSessionRequest {
  note?: string;
}

/**
 * `POST /returns/sessions/{id}/unreadable` — §4.2.
 * ✅ verified live. The session id is in the PATH, not the body.
 * `carton_reference` is required; everything else is optional.
 */
export interface ReturnUnreadableReportRequest {
  /** What the operator READS off the carton — never a typed identity. */
  carton_reference: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  note?: string;
}

/**
 * Legacy inbound-only variant — `POST /inbound/exceptions/unreadable-qr`.
 * ⚠ The returns flow uses `ReturnUnreadableReportRequest` instead; this
 * endpoint's `session_id` must be an INBOUND scan session.
 */
export interface UnreadableQrRequest {
  session_id: string;
  carton_reference: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  note?: string;
}

// ---------- Responses ----------

/** `POST /returns/sessions/{id}/scans` — §3.3 */
export interface ReturnScanResponse {
  item_id: string;
  qr_identifier: string;
  sku: string;
  matched_line_id: string;
  quantity: number;
  /** `false` ⇒ serials are not enforced for this registration (§10 Q1). */
  serial_expected: boolean;
  /** Line already at its registered quantity — amber warning, keep scanning. */
  over_receipt: boolean;
  /** Always `null` on a fresh scan — the unit now needs classification. */
  condition: ReturnCondition | null;
  scanned_qty: number;
  expected_qty: number;
  next_action: ReturnNextAction;
}

/** `POST …/classify` — §3.4. ✅ verified live. */
export interface ReturnClassifyResponse {
  item_id: string;
  condition: ReturnCondition;
  /** ✅ live — the server fills `RETURN_GOOD` for a good unit. */
  reason_code: string | null;
  /**
   * ✅ live — `null` for a `good` unit. Server-derived from the reason's
   * `default_destination`, else `QUARANTINE` for non-good conditions.
   */
  destination: ReturnDestination | null;
  /** `null` for a `good` unit — classifying non-good creates the exception. */
  exception_id: string | null;
  exception_status: ReturnExceptionStatus | null;
}

/**
 * `POST …/classify/bulk` — §3.4.
 * ✅ verified live: the endpoint returns a BARE ARRAY of per-item results, not
 * an `{ items: [...] }` envelope. `classifyReturnItemsBulk` normalises it.
 */
export type ReturnClassifyBulkResponse = ReturnClassifyResponse[];

/** `POST /returns/sessions/{id}/end` — §3.5. ✅ verified live. */
export interface ReturnReceiptNoteRef {
  id: string;
  note_no: string;
  /** ✅ live value observed: `pending_approval` (the doc implied `draft`). */
  status: string;
}

/** `POST /returns/sessions/{id}/end` — §3.5 */
export interface EndReturnSessionResponse {
  receipt_note: ReturnReceiptNoteRef;
  registration_status: ReturnRegistrationStatus;
  expected_qty: number;
  received_qty: number;
  short_qty: number;
  /** Counts per condition; render as-is — never recompute client-side. */
  conditions: Record<ReturnCondition, number>;
  next: string;
}

/**
 * Response for reporting an unreadable label — ✅ verified live for BOTH
 * `POST /returns/sessions/{id}/unreadable` and the inbound variant: both return
 * the created inbound EXCEPTION object, keyed by `id`.
 */
export interface UnreadableQrResponse {
  id: string;
  reason_code: string;
  status: string;
  condition_code?: string;
  destination: ReturnDestination | null;
  qr_identifier?: string | null;
  serial_number?: string | null;
  sku?: string | null;
  item_name?: string | null;
  batch_number?: string | null;
  quantity?: number;
  note?: string | null;
  created_at?: string;
}

// ---------- Reason codes (reused live endpoint) ----------

/**
 * `GET /inbound/exception-reasons` — §3.6, §4.3.
 * ✅ verified live: `{ code, name, category, default_destination, requires_approval }`.
 *
 * ✅ The endpoint filters SERVER-SIDE by `condition` (`damaged` → 3 codes,
 * `hold` → 1, `quarantine` → 1, `good` → 1), so the app hard-codes nothing.
 */
export interface ExceptionReason {
  code: string;
  /** ✅ live — display name, e.g. "Returned damaged". */
  name?: string;
  /** ✅ live — e.g. `return_damage`, `hold`, `quarantine`, `damage`. */
  category?: string;
  /** ✅ live — may be `null` (e.g. `RETURN_GOOD`). */
  default_destination?: ReturnDestination | null;
  /** ✅ live. */
  requires_approval?: boolean;
}

// ---------- Errors ----------

/**
 * Device-facing `error` codes from §7.
 * Show the response `hint` to the operator; use these codes for logic only.
 */
export type ReturnErrorCode =
  // 400
  | 'RETURN_QR_INVALID'
  | 'RETURN_CONDITION_REQUIRED'
  | 'RETURN_CONDITION_INVALID'
  | 'RETURN_REASON_CODE_REQUIRED'
  | 'RETURN_REASON_CODE_INVALID'
  | 'RETURN_DESTINATION_INVALID'
  // 404
  | 'RETURN_REGISTRATION_NOT_FOUND'
  | 'RETURN_SESSION_NOT_FOUND'
  | 'RETURN_UNIT_NOT_REGISTERED'
  // 409
  | 'RETURN_SERIAL_NOT_REGISTERED'
  | 'RETURN_UNIT_ALREADY_SCANNED'
  | 'DUPLICATE_SERIAL'
  | 'RETURN_ITEM_ALREADY_CLASSIFIED'
  | 'RETURN_SESSION_HAS_UNCLASSIFIED_ITEMS'
  | 'RETURN_SESSION_NOT_OPEN'
  | 'RETURN_SESSION_ALREADY_OPEN'
  | 'RETURN_REGISTRATION_NOT_RECEIVABLE'
  | 'RETURN_REGISTRATION_CANCELLED'
  | 'RETURN_REGISTRATION_FULLY_RECEIVED'
  | 'EXCEPTION_ALREADY_ACTIVE';

/** §7 envelope — mirrors the receiving flow's error body. */
export interface ReturnApiErrorBody {
  error: ReturnErrorCode | string;
  message?: string;
  /** Operator-facing text — ALWAYS display this. */
  hint?: string;
  details?: unknown;
}

/**
 * Codes that mean "the unit is already captured, move on" rather than a
 * failure — §5.1 requires treating this as client-side success.
 */
export const RETURN_IDEMPOTENT_SCAN_CODES: readonly ReturnErrorCode[] = [
  'RETURN_UNIT_ALREADY_SCANNED',
] as const;

// ============================================================
// Inbound Service — Sessions, Scans, Receiving Slips, ASN
// ============================================================
import { coreClient } from './client';
import type {
  InboundSession,
  StartSessionRequest,
  RecordScanRequest,
  ScanRecord,
  SessionSummary,
  ReceivingSlip,
  PaginatedResponse,
  AsnOrder,
  AsnReceivingSummary,
  FloatingItemsResponse,
  ResolveFloatingRequest,
  RejectItemRequest,
} from '../types';

// ---------- Start Scan Session ----------
export async function startInboundSession(
  payload: StartSessionRequest
): Promise<InboundSession> {
  console.log('[API] POST /inbound/sessions — payload:', JSON.stringify(payload));
  const { data } = await coreClient.post<InboundSession>('/inbound/sessions', payload);
  console.log('[API] POST /inbound/sessions — response keys:', Object.keys(data));
  return data;
}

// ---------- Record QR Scan ----------
export async function recordScan(
  sessionId: string,
  payload: RecordScanRequest
): Promise<ScanRecord> {
  const { data } = await coreClient.post<ScanRecord>(
    `/inbound/sessions/${sessionId}/scan`,
    payload,
    { timeout: 10000 }
  );
  return data;
}

// ---------- Get Session Summary ----------
export async function getSessionSummary(sessionId: string): Promise<SessionSummary> {
  const { data } = await coreClient.get<SessionSummary>(
    `/inbound/sessions/${sessionId}/summary`
  );
  return data;
}

// ---------- End Session (Generate Receiving Slip) ----------
export interface RejectionPayload {
  serial_number: string;
  reason?: string;
}

export async function endSession(
  sessionId: string,
  rejections?: RejectionPayload[]
): Promise<ReceivingSlip> {
  console.log('[API] endSession called:', {
    sessionId,
    rejectionsCount: rejections?.length || 0,
  });
  const { data } = await coreClient.post<ReceivingSlip>(
    `/inbound/sessions/${sessionId}/end`,
    { rejections: rejections || [] }
  );
  console.log('[API] endSession response:', {
    slipId: data.id,
    slipNumber: data.slip_number,
    asn_order_id: (data as any).asn_order_id || 'NOT IN RESPONSE',
    asn_order_no: (data as any).asn_order_no || 'NOT IN RESPONSE',
    itemsCount: data.items?.length || 0,
  });
  return data;
}

// ---------- List Receiving Slips ----------
export async function getReceivingSlips(params?: {
  warehouse_id?: string;
  session_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<ReceivingSlip>> {
  const { data } = await coreClient.get<PaginatedResponse<ReceivingSlip>>(
    '/inbound/receiving-slips',
    { params }
  );
  return data;
}

// ---------- Get Receiving Slip Detail ----------
export async function getReceivingSlip(slipId: string): Promise<ReceivingSlip> {
  const { data } = await coreClient.get<ReceivingSlip>(
    `/inbound/receiving-slips/${slipId}`
  );
  return data;
}

// ---------- Approve Receiving Slip (Triggers Put-Away) ----------
export async function approveReceivingSlip(
  slipId: string,
  workerId?: string
): Promise<ReceivingSlip> {
  const { data } = await coreClient.post<ReceivingSlip>(
    `/inbound/receiving-slips/${slipId}/approve`,
    workerId ? { worker_id: workerId } : {}
  );
  return data;
}

// ---------- Flag Line Item ----------
export async function flagLineItem(
  slipId: string,
  itemId: string,
  flag: 'short' | 'damaged' | 'rejected',
  notes?: string
): Promise<void> {
  await coreClient.post(
    `/inbound/receiving-slips/${slipId}/items/${itemId}/flag`,
    { flag, notes }
  );
}

// ---------- ASN: Fetch ASN Orders ----------
export async function getAsnOrders(params?: {
  status?: string;
  warehouse_id?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<AsnOrder>> {
  const { data } = await coreClient.get<PaginatedResponse<AsnOrder>>(
    '/asn-orders',
    { params }
  );
  return data;
}

// ---------- ASN: Get Receiving Summary ----------
export async function getAsnReceivingSummary(asnOrderId: string): Promise<AsnReceivingSummary> {
  const { data } = await coreClient.get<AsnReceivingSummary>(
    `/asn-orders/${asnOrderId}/receiving-summary`
  );
  return data;
}

// ---------- Link ASN to Session ----------
export async function linkAsnToSession(
  sessionId: string,
  asnOrderId: string
): Promise<InboundSession> {
  const { data } = await coreClient.post<InboundSession>(
    `/inbound/sessions/${sessionId}/link-asn`,
    { asn_order_id: asnOrderId }
  );
  return data;
}

// ---------- Reject Slip Item ----------
export async function rejectSlipItem(
  slipId: string,
  itemId: string,
  payload: RejectItemRequest
): Promise<ReceivingSlip> {
  const { data } = await coreClient.post<ReceivingSlip>(
    `/inbound/receiving-slips/${slipId}/items/${itemId}/reject`,
    payload
  );
  return data;
}

// ---------- Bulk Update Slip Item Statuses ----------
export async function updateSlipItemsStatus(
  slipId: string,
  items: { item_id: string; status: 'rejected' | 'ok' | 'short' | 'damaged'; reason?: string; notes?: string }[]
): Promise<{ items: unknown[] }> {
  const { data } = await coreClient.post<{ items: unknown[] }>(
    `/inbound/receiving-slips/${slipId}/items/status`,
    { items }
  );
  return data;
}

// ---------- Get Floating Items ----------
export async function getFloatingItems(params?: {
  warehouse_id?: string;
  page?: number;
  page_size?: number;
}): Promise<FloatingItemsResponse> {
  const { data } = await coreClient.get<FloatingItemsResponse>(
    '/inbound/floating-items',
    { params }
  );
  return data;
}

// ---------- Resolve Floating Item ----------
export async function resolveFloatingItem(
  itemId: string,
  payload: ResolveFloatingRequest
): Promise<void> {
  await coreClient.post(
    `/inbound/floating-items/${itemId}/resolve`,
    payload
  );
}

// ---------- Get FIFO Bin Suggestions (Workflow B) ----------
export async function getFifoBins(
  slipId: string,
  itemId: string
): Promise<import('../types').FifoBinResponse> {
  const { data } = await coreClient.get<import('../types').FifoBinResponse>(
    `/inbound/receiving-slips/${slipId}/items/${itemId}/fifo-bins`
  );
  return data;
}

// ---------- Assign Bin to Slip Item (Workflow B) ----------
export async function assignBinToSlipItem(
  slipId: string,
  itemId: string,
  payload: import('../types').AssignBinRequest
): Promise<import('../types').AssignBinResponse> {
  const { data } = await coreClient.post<import('../types').AssignBinResponse>(
    `/inbound/receiving-slips/${slipId}/items/${itemId}/assign-bin`,
    payload
  );
  return data;
}

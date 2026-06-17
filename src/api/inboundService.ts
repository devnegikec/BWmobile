// ============================================================
// Inbound Service — Sessions, Scans, Receiving Slips
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
} from '../types';

// ---------- Start Scan Session ----------
export async function startInboundSession(
  payload: StartSessionRequest
): Promise<InboundSession> {
  const { data } = await coreClient.post<InboundSession>('/inbound/sessions', payload);
  return data;
}

// ---------- Record QR Scan ----------
export async function recordScan(
  sessionId: string,
  payload: RecordScanRequest
): Promise<ScanRecord> {
  const { data } = await coreClient.post<ScanRecord>(
    `/inbound/sessions/${sessionId}/scan`,
    payload
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
export async function endSession(sessionId: string): Promise<ReceivingSlip> {
  const { data } = await coreClient.post<ReceivingSlip>(
    `/inbound/sessions/${sessionId}/end`
  );
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
  flag: 'short' | 'damaged',
  notes?: string
): Promise<void> {
  await coreClient.post(
    `/inbound/receiving-slips/${slipId}/items/${itemId}/flag`,
    { flag, notes }
  );
}

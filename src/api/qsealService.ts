// ============================================================
// QSeal Service — Scan, Cascade, History
// ============================================================
import { coreClient } from './client';
import type {
  QSealScanRequest,
  QSealNode,
  QSealMapRequest,
  QSealMapResponse,
  QSealHistoryResponse,
  QSealParentWithUnits,
} from '../types';

// ---------- Scan a QSeal (public endpoint) ----------
export async function scanQSeal(
  organizationId: string,
  payload: QSealScanRequest
): Promise<QSealNode> {
  const { data } = await coreClient.post<QSealNode>(
    `/qseal/scan?organization_id=${organizationId}`,
    payload,
    { timeout: 15000 }
  );
  return data;
}

// ---------- Get Parent Details ----------
export async function getParentDetails(parentId: string): Promise<QSealNode> {
  const { data } = await coreClient.get<QSealNode>(
    `/qseal/parents/${parentId}`
  );
  return data;
}

// ---------- List Children Under a Parent ----------
export async function getChildren(
  parentId: string,
  page = 1,
  pageSize = 50
): Promise<{ children: QSealNode[]; pagination: unknown }> {
  const { data } = await coreClient.get<{ children: QSealNode[]; pagination: unknown }>(
    `/qseal/parents/${parentId}/children`,
    { params: { page, page_size: pageSize } }
  );
  return data;
}

// ---------- Map Children to Parent (Cascade) ----------
export async function mapChildren(
  parentId: string,
  payload: QSealMapRequest
): Promise<QSealMapResponse> {
  const { data } = await coreClient.post<QSealMapResponse>(
    `/qseal/parents/${parentId}/map`,
    payload
  );
  return data;
}

// ---------- View Scan / Cascade History ----------
export async function getQSealHistory(params?: {
  serial_number?: string;
  page?: number;
  page_size?: number;
}): Promise<QSealHistoryResponse> {
  const { data } = await coreClient.get<QSealHistoryResponse>(
    '/qseal/history',
    { params }
  );
  return data;
}

// ---------- Get Linked Units for a Parent QSeal ----------
export async function getLinkedUnits(parentId: string): Promise<QSealParentWithUnits> {
  const { data } = await coreClient.get<QSealParentWithUnits>(
    `/qseal/parents/${parentId}/linked-units`,
    { timeout: 15000 }
  );
  return data;
}

// ============================================================
// Pick List Service — List, Detail, Scan, Complete, Cancel, Assign
// ============================================================
import { coreClient, identityClient } from './client';
import type {
    PickList,
    PickListListResponse,
    PickScanResult,
    Worker,
} from '../types';

// ---------- List Pick Lists ----------
export async function getPickLists(params?: {
    warehouse_id?: string;
    status?: 'draft' | 'in_progress' | 'completed' | 'cancelled';
    page?: number;
    page_size?: number;
}): Promise<PickListListResponse> {
    const { data } = await coreClient.get<PickListListResponse>('/outbound', {
        params,
    });
    return data;
}

// ---------- Get Pick List Detail ----------
export async function getPickList(listId: string): Promise<PickList> {
    const { data } = await coreClient.get<PickList>(`/outbound/${listId}`);
    return data;
}

// ---------- Record a Pick Scan ----------
export async function recordPickScan(
    listId: string,
    qrData: string,
): Promise<PickScanResult> {
    const { data } = await coreClient.post<PickScanResult>(
        `/outbound/${listId}/scan`,
        { qr_data: qrData },
    );
    return data;
}

// ---------- Complete Pick List ----------
export async function completePickList(listId: string): Promise<PickList> {
    const { data } = await coreClient.post<PickList>(`/outbound/${listId}/complete`, {});
    return data;
}

// ---------- Cancel Pick List ----------
export async function cancelPickList(listId: string): Promise<PickList> {
    const { data } = await coreClient.post<PickList>(`/outbound/${listId}/cancel`, {});
    return data;
}

// ---------- Assign / Re-assign Worker ----------
export async function assignWorker(listId: string, workerId: string): Promise<PickList> {
    const { data } = await coreClient.post<PickList>(
        `/outbound/${listId}/assign`,
        { worker_id: workerId },
    );
    return data;
}

// ---------- List Warehouse Workers (for reassignment) ----------
export async function listWorkers(): Promise<Worker[]> {
    const { data } = await identityClient.get<{ workers: Worker[] }>(
        '/identity/workers',
        { params: { user_type: 'warehouse_worker', page_size: 100 } },
    );
    return data.workers ?? [];
}

// ============================================================
// Pick List Service — List, Detail, Scan, Complete, Cancel, Assign
// ============================================================
import { coreClient, identityClient } from '@/api/client';
import type {
    PickList,
    PickListListResponse,
    PickScanResult,
    PickSettings,
    Worker,
    PickBinSuggestResponse,
} from '@/types';

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

// ---------- Get pick settings (require_bin_scan gating) ----------
export async function getPickSettings(): Promise<PickSettings> {
    const { data } = await coreClient.get<{ settings: PickSettings }>(
        '/pick-settings/runtime',
    );
    return data.settings ?? {};
}

// ---------- Suggest bins for a manual pick line ----------
export async function suggestPickBins(payload: {
    item_id: string;
    quantity: number;
    warehouse_id: string;
    worker_id: string;
    batch_number?: string | null;
    limit?: number;
}): Promise<PickBinSuggestResponse['suggestions']> {
    const { data } = await coreClient.post<PickBinSuggestResponse>(
        '/wms-3d/suggest',
        { task_type: 'pick', ...payload },
    );
    return data.suggestions ?? [];
}

// ---------- Record a Pick Scan ----------
export async function recordPickScan(
    listId: string,
    qrData: string,
    binLocationId?: string | null,
): Promise<PickScanResult> {
    const { data } = await coreClient.post<PickScanResult>(
        `/outbound/${listId}/scan`,
        { qr_data: qrData, bin_location_id: binLocationId ?? null },
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

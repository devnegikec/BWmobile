// ============================================================
// Inbound Store — Inbound session & scanning state
// ============================================================
import { create } from 'zustand';
import type {
  InboundSession,
  ScanRecord,
  SessionSummary,
  ReceivingSlip,
  AsnOrder,
  ItemRejectionState,
} from '../types';
import type { QSealParentWithUnits } from '../types';
import * as inboundService from '../api/inboundService';
import * as qsealService from '../api/qsealService';

interface InboundState {
  // Current session
  currentSession: InboundSession | null;
  sessionSummary: SessionSummary | null;
  lastScan: ScanRecord | null;
  generatedSlip: ReceivingSlip | null;

  // ASN
  availableAsns: AsnOrder[];
  selectedAsn: AsnOrder | null;
  isFetchingAsns: boolean;

  // Item rejection (review step)
  itemRejections: ItemRejectionState;

  // UI state
  isScanning: boolean;
  isLoading: boolean;
  error: string | null;

  // QSeal linked units (accumulated across multiple parent scans)
  linkedUnitsParents: QSealParentWithUnits[];
  isFetchingLinkedUnits: boolean;

  // Actions
  startSession: (warehouseId: string, dockLocation: string, asnOrderId?: string) => Promise<void>;
  recordScan: (qrData: string) => Promise<void>;
  fetchLinkedUnits: (parentId: string) => Promise<void>;
  clearLinkedUnits: () => void;
  loadSummary: () => Promise<void>;
  endSession: () => Promise<ReceivingSlip>;
  clearSession: () => void;
  clearError: () => void;
  toggleScanning: () => void;

  // ASN actions
  fetchAsnOrders: (warehouseId: string) => Promise<void>;
  selectAsn: (asn: AsnOrder | null) => void;
  linkAsnToCurrentSession: (asnOrderId: string) => Promise<void>;

  // Item rejection actions
  toggleItemRejection: (sku: string, batchNumber: string, rejected: boolean, reason?: string) => void;
  clearRejections: () => void;
  rejectSlipItems: (slipId: string) => Promise<void>;
}

export const useInboundStore = create<InboundState>((set, get) => ({
  currentSession: null,
  sessionSummary: null,
  lastScan: null,
  generatedSlip: null,
  isScanning: false,
  isLoading: false,
  error: null,
  linkedUnitsParents: [],
  isFetchingLinkedUnits: false,
  availableAsns: [],
  selectedAsn: null,
  isFetchingAsns: false,
  itemRejections: {},

  // ---------- Start Session ----------
  startSession: async (warehouseId, dockLocation, asnOrderId?) => {
    set({ isLoading: true, error: null });
    try {
      const payload: { warehouse_id: string; dock_location: string; asn_order_id?: string } = {
        warehouse_id: warehouseId,
        dock_location: dockLocation,
      };
      if (asnOrderId) {
        payload.asn_order_id = asnOrderId;
      }
      console.log('[Store] startSession — payload:', payload);
      const session = await inboundService.startInboundSession(payload);
      console.log('[Store] startSession — raw response keys:', Object.keys(session));
      console.log('[Store] startSession — response ASN:', {
        sessionId: session.id,
        asn_order_id: (session as any).asn_order_id || 'NOT IN RESPONSE',
        asn_order_no: (session as any).asn_order_no || 'NOT IN RESPONSE',
      });

      // Backend may not return asn_order_id/no in the response — attach from the selected ASN
      const selectedAsn = get().selectedAsn;
      const sessionWithAsn = { ...session };
      if (!sessionWithAsn.asn_order_id && asnOrderId) {
        sessionWithAsn.asn_order_id = asnOrderId;
        sessionWithAsn.asn_order_no = selectedAsn?.asn_order_no || undefined;
        console.log('[Store] startSession — attached ASN from payload:', {
          asn_order_id: asnOrderId,
          asn_order_no: selectedAsn?.asn_order_no,
        });
      }

      set({
        currentSession: sessionWithAsn,
        isScanning: true,
        sessionSummary: null,
        lastScan: null,
        generatedSlip: null,
        linkedUnitsParents: [],
        itemRejections: {},
        isLoading: false,
      });
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail || '';
      let message = 'Failed to start session.';

      if (status === 403) {
        message = 'Permission denied (403). Your account lacks the required permission. Contact your admin.';
      } else if (status === 401) {
        message = 'Session expired. Please log in again.';
      } else if (detail) {
        message = detail;
      }

      console.error('startSession failed:', { status, detail, message });
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  // ---------- Record QR Scan ----------
  recordScan: async (qrData) => {
    const session = get().currentSession;
    if (!session) {
      set({ error: 'No active session.' });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      console.log('[InboundStore] recordScan API call:', {
        sessionId: session.id,
        payload: { qr_data: qrData?.substring(0, 100), device_type: 'mobile', os: 'iOS/Android' },
      });
      const scan = await inboundService.recordScan(session.id, {
        qr_data: qrData,
        device_type: 'mobile',
        os: 'iOS/Android',
      });
      // Update session with new total
      set({
        lastScan: scan,
        currentSession: {
          ...session,
          total_boxes_scanned: scan.total_boxes_scanned,
        },
        isLoading: false,
      });
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail || '';
      let message = 'Duplicate scan or invalid QR.';

      if (status === 403) {
        message = 'Permission denied (403). Your account lacks the required permission.';
      } else if (status === 400 && detail) {
        message = detail;
      }

      console.error('recordScan failed:', { status, detail, message });
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  // ---------- Fetch Linked Units (QSeal parent scanned during inbound) ----------
  fetchLinkedUnits: async (parentId: string) => {
    set({ isFetchingLinkedUnits: true, error: null });
    try {
      const data = await qsealService.getLinkedUnits(parentId);
      set((state) => ({
        linkedUnitsParents: [...state.linkedUnitsParents, data],
        isFetchingLinkedUnits: false,
      }));
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || 'Failed to fetch linked units.';
      const msg = typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail));
      console.error('fetchLinkedUnits failed:', msg);
      set({ isFetchingLinkedUnits: false, error: msg });
    }
  },

  clearLinkedUnits: () => set({ linkedUnitsParents: [] }),

  // ---------- Load Summary ----------
  loadSummary: async () => {
    const session = get().currentSession;
    if (!session) return;
    set({ isLoading: true });
    try {
      const summary = await inboundService.getSessionSummary(session.id);
      set({ sessionSummary: summary, isLoading: false });
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail || error.message || '';
      console.error('loadSummary failed:', { status, detail, sessionId: session.id });
      set({ isLoading: false, error: detail || 'Failed to load summary.' });
    }
  },

  // ---------- End Session ----------
  endSession: async () => {
    const session = get().currentSession;
    if (!session) throw new Error('No active session.');
    console.log('[Store] endSession — current session ASN details:', {
      sessionId: session.id,
      asn_order_id: session.asn_order_id || 'NOT SET',
      asn_order_no: session.asn_order_no || 'NOT SET',
      dock: session.dock_location,
      boxes: session.total_boxes_scanned,
    });
    set({ isLoading: true });
    try {
      const slip = await inboundService.endSession(session.id);
      // The end-session response may not include items — fetch the full slip
      let fullSlip = slip;
      if (!slip.items || slip.items.length === 0) {
        try {
          fullSlip = await inboundService.getReceivingSlip(slip.id);
        } catch {
          // Use the original slip if detail fetch fails
          fullSlip = slip;
        }
      }
      // Attach ASN reference from session if slip doesn't have it
      if (!fullSlip.asn_order_id && session.asn_order_id) {
        fullSlip = {
          ...fullSlip,
          asn_order_id: session.asn_order_id,
          asn_order_no: session.asn_order_no || undefined,
        };
      }
      set({
        generatedSlip: fullSlip,
        isScanning: false,
        isLoading: false,
      });
      return fullSlip;
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail || '';
      const responseData = error.response?.data;
      let message = 'Failed to end session.';

      if (status === 403) {
        message =
          'Permission denied (403). Your account lacks the "receiving_slip.create" permission. Contact your admin.';
      } else if (status === 401) {
        message =
          'Authentication failed (401). Your session may have expired. Please log out and log in again.';
      } else if (status === 404) {
        message = 'Session not found (404). It may have already been ended.';
      } else if (status === 500) {
        message = `Server error (500). ${detail || 'Please try again or contact support.'}`;
      } else if (detail) {
        message = detail;
      } else if (error.code === 'ECONNABORTED') {
        message = 'Request timed out. Check your connection and try again.';
      } else if (error.message === 'Network Error') {
        message = 'Network error. Please check your connection.';
      }

      // Log full error for debugging
      console.error('endSession failed:', {
        status,
        detail,
        message,
        sessionId: session.id,
        errorCode: error.code,
        errorMessage: error.message,
        responseData,
        isAxiosError: error.isAxiosError,
        configUrl: error.config?.url,
        configMethod: error.config?.method,
      });

      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  clearSession: () =>
    set({
      currentSession: null,
      sessionSummary: null,
      lastScan: null,
      generatedSlip: null,
      linkedUnitsParents: [],
      isScanning: false,
      itemRejections: {},
      selectedAsn: null,
    }),

  clearError: () => set({ error: null }),
  toggleScanning: () => set((s) => ({ isScanning: !s.isScanning })),

  // ---------- ASN: Fetch Orders ----------
  fetchAsnOrders: async (warehouseId: string) => {
    set({ isFetchingAsns: true });
    try {
      const response = await inboundService.getAsnOrders({
        warehouse_id: warehouseId,
        page_size: 50,
      });
      // Response key might be 'asn_orders' or 'items'
      const allOrders = (response as any).asn_orders || (response as any).items || [];
      // Only show confirmed or partially_delivered ASNs (filter out drafts)
      const orders = allOrders.filter(
        (o: any) => o.status === 'confirmed' || o.status === 'partially_delivered'
      );
      set({ availableAsns: orders, isFetchingAsns: false });
    } catch (error: any) {
      const status = error?.response?.status;
      // 404: ASN endpoint not yet deployed (backend migration pending)
      // Treat gracefully — show empty list, blind receipts still work
      if (status === 404) {
        console.log('[ASN] Endpoint not available (404). ASN feature requires backend migration. Continuing with blind receipt.');
        set({ availableAsns: [], isFetchingAsns: false });
        return;
      }
      console.error('fetchAsnOrders failed:', error?.response?.data || error?.message);
      set({ availableAsns: [], isFetchingAsns: false });
    }
  },

  selectAsn: (asn) => set({ selectedAsn: asn }),

  // ---------- ASN: Link to Current Session ----------
  linkAsnToCurrentSession: async (asnOrderId: string) => {
    const session = get().currentSession;
    if (!session) {
      set({ error: 'No active session.' });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const updated = await inboundService.linkAsnToSession(session.id, asnOrderId);
      set({
        currentSession: updated,
        isLoading: false,
      });
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to link ASN.';
      set({ isLoading: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    }
  },

  // ---------- Item Rejection Toggle (local state) ----------
  toggleItemRejection: (sku: string, batchNumber: string, rejected: boolean, reason?: string) => {
    const key = `${sku}||${batchNumber}`;
    set((state) => ({
      itemRejections: {
        ...state.itemRejections,
        [key]: {
          rejected,
          reason: reason || (rejected ? 'Rejected during review' : ''),
        },
      },
    }));
  },

  clearRejections: () => set({ itemRejections: {} }),

  // ---------- Reject Slip Items (after slip creation) ----------
  rejectSlipItems: async (slipId: string) => {
    const slip = get().generatedSlip;
    const rejections = get().itemRejections;
    if (!slip) {
      console.warn('[rejectSlipItems] No slip available.');
      return;
    }

    // Extract items from groups (new format) or items (legacy format)
    const allItems: { id: string; sku: string; batch_number: string | null; serial_number?: string }[] = [];
    if (slip.groups && slip.groups.length > 0) {
      for (const group of slip.groups) {
        for (const item of group.items) {
          allItems.push({
            id: item.id,
            sku: item.sku,
            batch_number: item.batch_number,
            serial_number: item.serial_number, // unique item identifier
          });
        }
      }
    } else if (slip.items && slip.items.length > 0) {
      allItems.push(...slip.items.map(i => ({ id: i.id, sku: i.sku, batch_number: i.batch_number })));
    }

    if (allItems.length === 0) {
      console.warn('[rejectSlipItems] No items found in slip (groups or items). Slip:', JSON.stringify(slip).substring(0, 200));
      return;
    }

    console.log('[rejectSlipItems] Starting rejection for slip:', slipId);
    console.log('[rejectSlipItems] Rejection keys:', Object.keys(rejections));
    console.log('[rejectSlipItems] Slip items:', allItems.map(i => ({ id: i.id, sku: i.sku, batch: i.batch_number, serial: i.serial_number })));

    const itemsToReject = allItems.filter((item) => {
      // Primary match: serial_number (unique item identifier)
      const serial = item.serial_number || item.batch_number || '';
      if (serial && rejections[serial]?.rejected) return true;
      // Fallback: sku||batch_number
      const skuBatchKey = `${item.sku}||${item.batch_number || ''}`;
      return rejections[skuBatchKey]?.rejected;
    });

    // Deduplicate by item.id (multiple QSeal children may map to same aggregated slip row)
    const uniqueItems = new Map<string, typeof itemsToReject[0]>();
    for (const item of itemsToReject) {
      if (!uniqueItems.has(item.id)) {
        uniqueItems.set(item.id, item);
      }
    }

    console.log('[rejectSlipItems] Items to reject:', uniqueItems.size, '(deduplicated from', itemsToReject.length, ')');

    if (itemsToReject.length === 0) {
      console.warn('[rejectSlipItems] No items matched rejection keys. Keys:', Object.keys(rejections));
      // Try matching by serial number (from qseal-child keys)
      const childKeys = Object.entries(rejections).filter(([k, v]) => k.startsWith('qseal-child||') && v.rejected);
      console.warn('[rejectSlipItems] Child rejection keys found:', childKeys.length);
    }

    let successCount = 0;
    let failCount = 0;

    // Build a single bulk payload with per-item status
    const payload = Array.from(uniqueItems.values()).map((item) => {
      const serial = item.serial_number || '';
      const reason =
        rejections[serial]?.reason ||
        rejections[`${item.sku}||${item.batch_number || ''}`]?.reason ||
        'Rejected during review';
      return { item_id: item.id, status: 'rejected' as const, reason };
    });

    try {
      console.log('[rejectSlipItems] Bulk rejecting items:', payload);
      await inboundService.updateSlipItemsStatus(slipId, payload);
      successCount = payload.length;
      console.log('[rejectSlipItems] Bulk reject OK:', payload.length, 'items');
    } catch (err: any) {
      failCount = payload.length;
      console.error('[rejectSlipItems] Bulk reject FAILED:', {
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
      });
    }

    console.log('[rejectSlipItems] Done:', { successCount, failCount, total: uniqueItems.size });
  },
}));

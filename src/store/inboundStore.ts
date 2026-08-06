// ============================================================
// Inbound Store — Inbound session & scanning state
// ============================================================
import { create } from 'zustand';
import type {
  InboundSession,
  ScanRecord,
  SessionSummary,
  ReceivingSlip,
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

  // UI state
  isScanning: boolean;
  isLoading: boolean;
  error: string | null;

  // QSeal linked units (accumulated across multiple parent scans)
  linkedUnitsParents: QSealParentWithUnits[];
  isFetchingLinkedUnits: boolean;

  // Actions
  startSession: (warehouseId: string, dockLocation: string) => Promise<void>;
  recordScan: (qrData: string) => Promise<void>;
  fetchLinkedUnits: (parentId: string) => Promise<void>;
  clearLinkedUnits: () => void;
  loadSummary: () => Promise<void>;
  endSession: () => Promise<ReceivingSlip>;
  clearSession: () => void;
  clearError: () => void;
  toggleScanning: () => void;
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

  // ---------- Start Session ----------
  startSession: async (warehouseId, dockLocation) => {
    set({ isLoading: true, error: null });
    try {
      const session = await inboundService.startInboundSession({
        warehouse_id: warehouseId,
        dock_location: dockLocation,
      });
      set({
        currentSession: session,
        isScanning: true,
        sessionSummary: null,
        lastScan: null,
        generatedSlip: null,
        linkedUnitsParents: [],
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
    set({ isLoading: true });
    try {
      const slip = await inboundService.endSession(session.id);
      set({
        generatedSlip: slip,
        isScanning: false,
        isLoading: false,
      });
      return slip;
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
    }),

  clearError: () => set({ error: null }),
  toggleScanning: () => set((s) => ({ isScanning: !s.isScanning })),
}));

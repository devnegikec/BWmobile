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
import * as inboundService from '../api/inboundService';

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

  // Actions
  startSession: (warehouseId: string, dockLocation: string) => Promise<void>;
  recordScan: (qrData: string) => Promise<void>;
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
        isLoading: false,
      });
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to start session.';
      set({ isLoading: false, error: detail });
      throw new Error(detail);
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
      const detail = error.response?.data?.detail || 'Duplicate scan or invalid QR.';
      set({ isLoading: false, error: detail });
      throw new Error(detail);
    }
  },

  // ---------- Load Summary ----------
  loadSummary: async () => {
    const session = get().currentSession;
    if (!session) return;
    set({ isLoading: true });
    try {
      const summary = await inboundService.getSessionSummary(session.id);
      set({ sessionSummary: summary, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false, error: 'Failed to load summary.' });
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
      const detail = error.response?.data?.detail || 'Failed to end session.';
      set({ isLoading: false, error: detail });
      throw new Error(detail);
    }
  },

  clearSession: () =>
    set({
      currentSession: null,
      sessionSummary: null,
      lastScan: null,
      generatedSlip: null,
      isScanning: false,
    }),

  clearError: () => set({ error: null }),
  toggleScanning: () => set((s) => ({ isScanning: !s.isScanning })),
}));

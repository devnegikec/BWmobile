// ============================================================
// Returns Store — registrations, session & classification state
// ============================================================
// Mirrors `inboundStore`: the store is the single source of truth for the
// returns flow. Screens never hold session state of their own.
//
// Invariants enforced here (docs/RETURNS_MOBILE_TASK_LIST.md):
//   • Counters are MONOTONIC — an out-of-order response can never roll
//     `scanned_qty` / `classified_qty` backwards (task 3.6).
//   • An item is never duplicated in `items` — a repeat scan of the same
//     `item_id` updates the row in place (task 3.6).
//   • `error` is always a string; the code/hint live in separate fields so
//     the UI can branch without rendering a raw code (error-handling notes).
// ============================================================
import { create } from 'zustand';
import type {
  ReturnRegistration,
  ReturnRegistrationDetail,
  ReturnSession,
  ReturnSessionItem,
  ReturnScanResponse,
  ClassifyReturnItemRequest,
  ClassifyReturnItemBulkEntry,
  EndReturnSessionResponse,
  ReturnUnreadableReportRequest,
  UnreadableQrResponse,
  ExceptionReason,
} from '@/types';
import * as returnsService from '@/api/returnsService';
import { getExceptionReasons } from '@/api/inboundService';
import { getBackendErrorInfo, type BackendErrorInfo } from '@/utils/errors';

/**
 * Typed error thrown by the scan path so the hook can branch on the backend
 * `error` code (e.g. `RETURN_UNIT_ALREADY_SCANNED` is treated as success).
 */
export class ReturnFlowError extends Error {
  code: string | null;
  status: number | null;
  hint: string | null;

  constructor(info: BackendErrorInfo) {
    super(info.message);
    this.name = 'ReturnFlowError';
    this.code = info.code;
    this.status = info.status;
    this.hint = info.hint;
  }
}

/** Amber/green/red banner shown after a scan — §4.1 device behaviour. */
export interface ReturnScanNotice {
  tone: 'success' | 'warning' | 'error';
  message: string;
  /** Set when the unit was already captured and the UI should jump to it. */
  itemId?: string;
  /**
   * Set when the operator should be offered a follow-up action.
   * `report_unreadable` → open the unreadable-label sheet (§4.1 / §4.3).
   */
  action?: 'report_unreadable';
}

interface ReturnsState {
  // Registration picking
  registrations: ReturnRegistration[];
  selectedRegistration: ReturnRegistrationDetail | null;

  // Live session
  currentSession: ReturnSession | null;
  items: ReturnSessionItem[];
  lastScan: ReturnScanResponse | null;
  scanNotice: ReturnScanNotice | null;
  endResult: EndReturnSessionResponse | null;
  /**
   * The registration's original reason (§4.3 task 6.9) — pre-selects the
   * picker. Never auto-classifies a non-good unit.
   */
  registrationReasonCode: string | null;

  // Reason picker (loaded live per condition, never hard-coded)
  reasonCodes: ExceptionReason[];
  /** Which condition `reasonCodes` was fetched for (cache key). */
  reasonCodesCondition: ReturnCondition | null;

  // UI state
  isLoading: boolean;
  isScanning: boolean;
  isSubmitting: boolean;
  isFetchingReasons: boolean;
  error: string | null;
  errorCode: string | null;

  // Actions
  fetchRegistrations: (warehouseId?: string) => Promise<void>;
  fetchRegistration: (id: string) => Promise<void>;
  openSession: (
    registrationId: string,
    payload: { dock_location?: string; device_id?: string },
    /** The registration's `return_reason_code`, for picker pre-selection. */
    reasonCode?: string | null
  ) => Promise<ReturnSession>;
  resumeSession: (sessionId: string) => Promise<ReturnSession>;
  scanUnit: (qrData: string, deviceType?: string, os?: string) => Promise<ReturnScanResponse>;
  classifyItem: (payload: ClassifyReturnItemRequest) => Promise<void>;
  classifyItemsBulk: (entries: ClassifyReturnItemBulkEntry[]) => Promise<void>;
  endSession: (note?: string) => Promise<EndReturnSessionResponse>;
  reportUnreadable: (payload: ReturnUnreadableReportRequest) => Promise<UnreadableQrResponse>;
  fetchReasonCodes: (condition: ReturnCondition) => Promise<void>;
  clearSession: () => void;
  clearError: () => void;
  clearScanNotice: () => void;
}

/** Units still needing a condition tap — drives the "N to classify" badge. */
export const usePendingReturnItems = (): ReturnSessionItem[] =>
  useReturnsStore((state) => state.items.filter((item) => item.condition === null));

/**
 * Monotonic token for `fetchReasonCodes`. Only the most recent request is
 * allowed to write the picker, so a slower response for a condition the
 * operator has already navigated away from cannot overwrite the current list.
 */
let reasonCodesRequestId = 0;

export const useReturnsStore = create<ReturnsState>((set, get) => ({
  registrations: [],
  selectedRegistration: null,
  currentSession: null,
  items: [],
  lastScan: null,
  scanNotice: null,
  endResult: null,
  registrationReasonCode: null,
  reasonCodes: [],
  reasonCodesCondition: null,
  isLoading: false,
  isScanning: false,
  isSubmitting: false,
  isFetchingReasons: false,
  error: null,
  errorCode: null,

  // ---------- Registration list (§2) ----------
  fetchRegistrations: async (warehouseId) => {
    set({ isLoading: true, error: null, errorCode: null });
    try {
      const registrations = await returnsService.listReturnRegistrations({
        status: 'ready',
        warehouse_id: warehouseId,
      });
      set({ registrations, isLoading: false });
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isLoading: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Registration detail (§2) ----------
  fetchRegistration: async (id) => {
    set({ isLoading: true, error: null, errorCode: null });
    try {
      const registration = await returnsService.getReturnRegistration(id);
      set({ selectedRegistration: registration, isLoading: false });
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isLoading: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Open session (§3.1) ----------
  openSession: async (registrationId, payload, reasonCode) => {
    set({ isLoading: true, error: null, errorCode: null });
    try {
      const session = await returnsService.openReturnSession(registrationId, payload);
      set({
        currentSession: session,
        items: session.items ?? [],
        endResult: null,
        lastScan: null,
        scanNotice: null,
        registrationReasonCode: reasonCode ?? null,
        isLoading: false,
      });
      return session;
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isLoading: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Resume / recover session (§3.2, §5.4) ----------
  resumeSession: async (sessionId) => {
    set({ isLoading: true, error: null, errorCode: null });
    try {
      const session = await returnsService.getReturnSession(sessionId);
      set({
        currentSession: session,
        // Rebuild the pending queue from the server's authoritative item list.
        items: session.items ?? [],
        isLoading: false,
      });
      return session;
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isLoading: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Scan a unit (§3.3) ----------
  scanUnit: async (qrData, deviceType = 'mobile', os = 'iOS/Android') => {
    const session = get().currentSession;
    if (!session) {
      throw new ReturnFlowError({
        code: 'RETURN_SESSION_NOT_FOUND',
        message: 'No open return session.',
        hint: null,
        status: null,
      });
    }

    set({ isScanning: true, error: null, errorCode: null, scanNotice: null });
    try {
      const scan = await returnsService.scanReturnUnit(session.id, {
        qr_data: qrData,
        device_type: deviceType,
        os,
      });

      set((state) => {
        // The session may have been reset or replaced while this request was in
        // flight (§5.4 recovery, cancel, end). Writing then would inject a
        // stale item and counters into the session now on screen.
        if (state.currentSession?.id !== session.id) return { isScanning: false };

        // Upsert the item instead of appending — a repeat scan must move the
        // counters forward, never duplicate the row (task 3.6).
        const exists = state.items.some((item) => item.id === scan.item_id);
        const nextItems: ReturnSessionItem[] = exists
          ? state.items.map((item) =>
              item.id === scan.item_id ? { ...item, condition: scan.condition } : item
            )
          : [
              ...state.items,
              {
                id: scan.item_id,
                qr_identifier: scan.qr_identifier,
                sku: scan.sku,
                serial_number: scan.qr_identifier,
                quantity: scan.quantity,
                condition: scan.condition,
                reason_code: null,
                exception_id: null,
              },
            ];

        return {
          items: nextItems,
          lastScan: scan,
          isScanning: false,
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                // Monotonic: take the higher of local and server values so an
                // out-of-order response can never roll a counter backwards.
                scanned_qty: Math.max(state.currentSession.scanned_qty, scan.scanned_qty),
                expected_qty: scan.expected_qty ?? state.currentSession.expected_qty,
              }
            : state.currentSession,
          scanNotice: scan.over_receipt
            ? { tone: 'warning', message: `${scan.sku} is over the registered quantity — supervisor decides.` }
            : { tone: 'success', message: `${scan.sku} captured.` },
        };
      });

      return scan;
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isScanning: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Classify one unit (§3.4) ----------
  classifyItem: async (payload) => {
    const session = get().currentSession;
    if (!session) throw new ReturnFlowError({
      code: 'RETURN_SESSION_NOT_FOUND',
      message: 'No open return session.',
      hint: null,
      status: null,
    });

    set({ isSubmitting: true, error: null, errorCode: null });
    try {
      const result = await returnsService.classifyReturnItem(session.id, payload);
      set((state) => {
        // Same guard as `scanUnit`: a superseded response must never overwrite
        // another session's items or `classified_qty`.
        if (state.currentSession?.id !== session.id) return { isSubmitting: false };

        const nextItems = state.items.map((item) =>
          item.id === result.item_id
            ? {
                ...item,
                condition: result.condition,
                reason_code: result.reason_code,
                exception_id: result.exception_id,
              }
            : item
        );
        const counted = nextItems.filter((i) => i.condition !== null).length;
        return {
          items: nextItems,
          isSubmitting: false,
          scanNotice: {
            tone: result.condition === 'good' ? 'success' : 'warning',
            message:
              result.condition === 'good'
                ? 'Classified good — available for put-away.'
                : `Routed to ${result.destination ?? 'HOLD'}.`,
          },
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                // Derived from the item list so it can never lag or overshoot.
                classified_qty: Math.max(state.currentSession.classified_qty, counted),
              }
            : state.currentSession,
        };
      });
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isSubmitting: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Bulk classify a carton (§3.4) ----------
  classifyItemsBulk: async (entries) => {
    const session = get().currentSession;
    if (!session) throw new ReturnFlowError({
      code: 'RETURN_SESSION_NOT_FOUND',
      message: 'No open return session.',
      hint: null,
      status: null,
    });

    set({ isSubmitting: true, error: null, errorCode: null });
    try {
      const result = await returnsService.classifyReturnItemsBulk(session.id, { items: entries });
      // ✅ live: a bare array of per-item results.
      const byId = new Map(result.map((r) => [r.item_id, r]));
      set((state) => {
        // Same guard as `classifyItem` — the bulk path shares the race.
        if (state.currentSession?.id !== session.id) return { isSubmitting: false };

        const nextItems = state.items.map((item) => {
          const applied = byId.get(item.id);
          return applied
            ? {
                ...item,
                condition: applied.condition,
                reason_code: applied.reason_code,
                exception_id: applied.exception_id,
              }
            : item;
        });
        const counted = nextItems.filter((i) => i.condition !== null).length;
        return {
          items: nextItems,
          isSubmitting: false,
          scanNotice: { tone: 'success', message: `${result.length} unit(s) classified.` },
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                classified_qty: Math.max(state.currentSession.classified_qty, counted),
              }
            : state.currentSession,
        };
      });
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isSubmitting: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- End session (§3.5) ----------
  endSession: async (note) => {
    const session = get().currentSession;
    if (!session) throw new ReturnFlowError({
      code: 'RETURN_SESSION_NOT_FOUND',
      message: 'No open return session.',
      hint: null,
      status: null,
    });

    set({ isSubmitting: true, error: null, errorCode: null });
    try {
      const result = await returnsService.endReturnSession(session.id, {
        note: note?.trim() ? note.trim() : undefined,
      });
      set({ endResult: result, isSubmitting: false });
      return result;
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isSubmitting: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Unreadable label (§4.2, returns-scoped endpoint) ----------
  reportUnreadable: async (payload) => {
    const session = get().currentSession;
    if (!session) throw new ReturnFlowError({
      code: 'RETURN_SESSION_NOT_FOUND',
      message: 'No open return session.',
      hint: null,
      status: null,
    });

    set({ isSubmitting: true, error: null, errorCode: null });
    try {
      const result = await returnsService.reportReturnUnreadable(session.id, payload);
      set({ isSubmitting: false });
      return result;
    } catch (err: any) {
      const info = getBackendErrorInfo(err);
      set({ isSubmitting: false, error: info.message, errorCode: info.code });
      throw new ReturnFlowError(info);
    }
  },

  // ---------- Reason codes (§4.3, live endpoint) ----------
  // ✅ The endpoint filters SERVER-SIDE by `condition`, so nothing is
  // hard-coded here. The fetched list is cached against the condition it was
  // loaded for.
  fetchReasonCodes: async (condition) => {
    const requestId = ++reasonCodesRequestId;
    set({ isFetchingReasons: true });
    try {
      const reasonCodes = await getExceptionReasons(condition);
      // Superseded by a newer request — its response owns the picker.
      if (requestId !== reasonCodesRequestId) return;
      set({ reasonCodes, reasonCodesCondition: condition, isFetchingReasons: false });
    } catch (err: any) {
      // Non-fatal: the picker shows its own empty state; do not clobber the
      // screen-level error for a background lookup.
      console.warn('[Returns] Failed to load reason codes:', err?.message);
      if (requestId !== reasonCodesRequestId) return;
      set({ reasonCodes: [], reasonCodesCondition: condition, isFetchingReasons: false });
    }
  },

  // ---------- Reset ----------
  clearSession: () =>
    set({
      currentSession: null,
      items: [],
      lastScan: null,
      scanNotice: null,
      endResult: null,
      registrationReasonCode: null,
      isScanning: false,
      isSubmitting: false,
      error: null,
      errorCode: null,
    }),

  clearError: () => set({ error: null, errorCode: null }),
  clearScanNotice: () => set({ scanNotice: null }),
}));

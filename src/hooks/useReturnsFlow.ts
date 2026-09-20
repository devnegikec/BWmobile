// ============================================================
// useReturnsFlow — Returns session state + business logic
// ============================================================
// Mirrors `useInboundFlow`. Two rules from the integration guide drive the
// shape of this hook:
//   • §5.4 — the session is recoverable: `session_id` is persisted locally and
//     replayed through `GET /returns/sessions/{id}` on the next launch.
//   • §5.1 — a repeat scan that the server rejects with
//     `RETURN_UNIT_ALREADY_SCANNED` is a CLIENT-SIDE SUCCESS (idempotent retry).
//     It must never surface as an error.
//   • §5.2 — classification and session-end are NEVER queued offline.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/authStore';
import {
  useReturnsStore,
  ReturnFlowError,
  type ReturnScanNotice,
} from '@/store/returnsStore';
import type {
  ClassifyReturnItemRequest,
  ReturnCondition,
  ReturnDestination,
  ReturnRegistration,
  ReturnSessionItem,
  ReturnUnreadableReportRequest,
} from '@/types';

export type ReturnsStep = 'idle' | 'registrations' | 'scanning' | 'ended';

const SESSION_KEY = 'returns_session_id';

/**
 * The ONLY screen that can be reached while a session is live is the scanning
 * screen; `ended` is terminal until the operator acknowledges the note.
 */
export function useReturnsFlow() {
  const { selectedWarehouse } = useAuthStore();

  const {
    registrations,
    selectedRegistration,
    currentSession,
    items,
    lastScan,
    scanNotice,
    endResult,
    reasonCodes,
    isLoading,
    isScanning,
    isSubmitting,
    isFetchingReasons,
    error,
    errorCode,
    registrationReasonCode,
    fetchRegistrations,
    fetchRegistration,
    openSession,
    resumeSession,
    scanUnit,
    classifyItem,
    classifyItemsBulk,
    endSession,
    reportUnreadable,
    fetchReasonCodes,
    clearSession,
    clearError,
    clearScanNotice,
  } = useReturnsStore();

  const [step, setStep] = useState<ReturnsStep>('idle');
  const [dockLocation, setDockLocation] = useState('');
  /**
   * Approximated connectivity. There is no NetInfo dependency in the project,
   * so this flips to `false` after any request fails without an HTTP response
   * (offline/DNS/timeout) and back to `true` as soon as one succeeds. It gates
   * classification/end only — scans stay enabled so the operator can retry.
   */
  const [isOnline, setIsOnline] = useState(true);

  /**
   * Bumped on every local reset (cancel / end / new session). Any in-flight
   * scan captures the value and bails out if it changed, so a late response
   * can never be written into a session that has since been discarded.
   */
  const sessionGeneration = useRef(0);

  // ---------------------------------------------------------
  // Restore a live session on boot (§5.4) — one attempt per app launch.
  // ---------------------------------------------------------
  const hasAttemptedRestore = useRef(false);
  useEffect(() => {
    if (hasAttemptedRestore.current) return;
    hasAttemptedRestore.current = true;

    (async () => {
      try {
        const storedId = await AsyncStorage.getItem(SESSION_KEY);
        if (!storedId) return;
        const session = await resumeSession(storedId);
        if (session.status === 'open') {
          setStep('scanning');
        } else {
          // The session ended while the app was closed — discard the pointer.
          await AsyncStorage.removeItem(SESSION_KEY);
          clearSession();
          setStep('idle');
        }
      } catch {
        // Expired/unknown session — drop the stale pointer and start clean.
        await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      }
    })();
  }, [resumeSession, clearSession]);

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  const rememberSession = useCallback(async (sessionId: string) => {
    await AsyncStorage.setItem(SESSION_KEY, sessionId).catch(() => {});
  }, []);

  const forgetSession = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }, []);

  /** Reset every local value back to idle. Shared by cancel + end + new. */
  const resetToIdle = useCallback(async () => {
    sessionGeneration.current += 1;
    clearSession();
    setDockLocation('');
    await forgetSession();
    setStep('idle');
  }, [clearSession, forgetSession]);

  const showNotice = useCallback((notice: ReturnScanNotice) => {
    useReturnsStore.setState({ scanNotice: notice });
  }, []);

  const handleError = useCallback((err: unknown, fallback: string): string => {
    if (err instanceof ReturnFlowError) {
      // No HTTP response at all ⇒ this is the offline/connectivity case.
      if (err.status === null && err.code === null) setIsOnline(false);
      else setIsOnline(true);
      return err.hint || err.message || fallback;
    }
    setIsOnline(false);
    return fallback;
  }, []);

  // ---------------------------------------------------------
  // 1. Registration picking
  // ---------------------------------------------------------
  const loadRegistrations = useCallback(async () => {
    try {
      await fetchRegistrations(selectedWarehouse?.id);
      setIsOnline(true);
    } catch (err) {
      handleError(err, 'Could not load return registrations.');
      setIsOnline(false);
    }
  }, [fetchRegistrations, selectedWarehouse, handleError]);

  const openRegistrations = useCallback(async () => {
    setStep('registrations');
    await loadRegistrations();
  }, [loadRegistrations]);

  const selectRegistration = useCallback(
    async (registration: ReturnRegistration) => {
      await fetchRegistration(registration.id).catch(() => {});
    },
    [fetchRegistration]
  );

  // ---------------------------------------------------------
  // 2. Open a session (§3.1) — resume on `RETURN_SESSION_ALREADY_OPEN`.
  // ---------------------------------------------------------
  const handleOpenSession = useCallback(
    async (registration: ReturnRegistration): Promise<boolean> => {
      try {
        const session = await openSession(
          registration.id,
          {
            dock_location: dockLocation.trim() || undefined,
            // device_id is supplied by the caller's device; keep it simple here.
            device_id: undefined,
          },
          // Pre-selects the reason picker (§4.3 task 6.9) — never auto-classifies.
          registration.return_reason_code ?? null
        );
        await rememberSession(session.id);
        setIsOnline(true);
        setStep('scanning');
        return true;
      } catch (err) {
        // One open session per registration — resume it instead of erroring.
        if (err instanceof ReturnFlowError && err.code === 'RETURN_SESSION_ALREADY_OPEN') {
          const storedId = await AsyncStorage.getItem(SESSION_KEY);
          if (storedId) {
            try {
              const resumed = await resumeSession(storedId);
              // `SESSION_KEY` is a single global pointer, so it may belong to a
              // DIFFERENT registration. Adopting it blindly would open the wrong
              // return, so require an exact match on both id and status (§5.4).
              if (resumed.registration_id === registration.id && resumed.status === 'open') {
                await rememberSession(storedId);
                setStep('scanning');
                return true;
              }
            } catch {
              // Fall through to the normal error path below.
            }
          }
        }
        // Report the failure to the caller instead of resolving normally — the
        // screen must not navigate to a receive screen with no live session.
        handleError(err, 'Could not open the return session.');
        return false;
      }
    },
    [openSession, dockLocation, rememberSession, resumeSession, handleError]
  );

  // ---------------------------------------------------------
  // 3. Scanning (§3.3, §4.1, §5.1)
  // ---------------------------------------------------------
  const handleScan = useCallback(
    async (qrData: string) => {
      const generation = sessionGeneration.current;
      clearScanNotice();

      try {
        const scan = await scanUnit(qrData);

        // A late response for a session that has since been reset — drop it.
        if (generation !== sessionGeneration.current) return;

        setIsOnline(true);

        // §4.1 — an over-receipt is an amber warning, not a failure. The
        // store already set the notice; nothing more to do but keep scanning.
        // `next_action` decides where the operator goes next (§3.3, task 5.12).
        if (scan.next_action === 'report_unreadable') {
          showNotice({
            tone: 'warning',
            message: 'Payload could not be matched — report the label as unreadable.',
            action: 'report_unreadable',
          });
          return;
        }
      } catch (err) {
        // §5.1 / task 9.2 — a duplicate in this session means the unit is
        // already captured. Treat it as success and point at the item.
        if (err instanceof ReturnFlowError && err.code === 'RETURN_UNIT_ALREADY_SCANNED') {
          const existing = useReturnsStore
            .getState()
            .items.find((item) => item.qr_identifier === qrData);
          showNotice({
            tone: 'warning',
            message: 'This unit is already captured — opening it.',
            itemId: existing?.id,
          });
          setIsOnline(true);
          return;
        }

        // §4.1 — an undecodable payload offers "Report unreadable label".
        // ✅ verified live: the server needs a JSON payload, so a plain serial
        // always lands here.
        if (err instanceof ReturnFlowError && err.code === 'RETURN_QR_INVALID') {
          showNotice({
            tone: 'error',
            message: err.hint || 'This code could not be read — report the label.',
            action: 'report_unreadable',
          });
          setIsOnline(true);
          return;
        }

        const message = handleError(err, 'Scan failed. Please try again.');
        showNotice({ tone: 'error', message });
      }
    },
    [scanUnit, clearScanNotice, showNotice, handleError]
  );

  // ---------------------------------------------------------
  // 4. Condition capture (§3.4) — never queued offline (§5.2)
  // ---------------------------------------------------------
  const handleClassify = useCallback(
    async (
      item: ReturnSessionItem,
      condition: ReturnCondition,
      options?: {
        reasonCode?: string;
        note?: string;
        destination?: ReturnDestination;
        /** Set when re-sending a classification to change the reason. */
        override?: boolean;
      }
    ): Promise<boolean> => {
      // Non-good without a reason never leaves the device (§4.3, task 6.4).
      if (condition !== 'good' && !options?.reasonCode) {
        showNotice({ tone: 'error', message: 'Select a reason before saving.' });
        return false;
      }

      // §5.2 — classification moves stock and is NEVER queued offline. The
      // sheet may already be open from when connectivity was healthy, so
      // re-check here instead of trusting the gate at open time.
      if (!isOnline) {
        showNotice({ tone: 'error', message: 'Offline — reconnect to save the condition.' });
        return false;
      }

      try {
        const payload: ClassifyReturnItemRequest = {
          item_id: item.id,
          condition,
          ...(condition !== 'good'
            ? {
                reason_code: options?.reasonCode,
                note: options?.note?.trim() ? options.note.trim() : undefined,
                destination: options?.destination,
              }
            : {}),
          ...(options?.override ? { override: true } : {}),
        };
        await classifyItem(payload);
        setIsOnline(true);
        return true;
      } catch (err) {
        // Surface the reason and keep the sheet open so the operator's typed
        // reason/note are not silently discarded.
        const message = handleError(err, 'Could not save the condition. Connect and try again.');
        showNotice({ tone: 'error', message });
        return false;
      }
    },
    [classifyItem, showNotice, handleError, isOnline]
  );

  /** "All good" for a carton — one round-trip for every pending unit (§4.3). */
  const handleBulkGood = useCallback(
    async (pendingItems: ReturnSessionItem[]) => {
      if (pendingItems.length === 0) return;
      try {
        await classifyItemsBulk(pendingItems.map((item) => ({ item_id: item.id, condition: 'good' })));
        setIsOnline(true);
      } catch (err) {
        handleError(err, 'Could not classify the carton. Connect and try again.');
      }
    },
    [classifyItemsBulk, handleError]
  );

  // ---------------------------------------------------------
  // 5. End session (§3.5) — never queued offline (§5.2)
  // ---------------------------------------------------------
  const handleEndSession = useCallback(
    async (note?: string) => {
      try {
        await endSession(note);
        await forgetSession();
        setIsOnline(true);
        setStep('ended');
      } catch (err) {
        // Unclassified units left — the store surfaces the hint; nothing to do
        // beyond keeping the operator on the scanning screen.
        handleError(err, 'Could not end the session.');
      }
    },
    [endSession, forgetSession, handleError]
  );

  const handleCancelSession = useCallback(async () => {
    await resetToIdle();
  }, [resetToIdle]);

  const finishAndExit = useCallback(async () => {
    await resetToIdle();
  }, [resetToIdle]);

  // ---------------------------------------------------------
  // 6. Unreadable label (§4.2) — live endpoint, never typed identity
  // ---------------------------------------------------------
  const handleReportUnreadable = useCallback(
    async (payload: ReturnUnreadableReportRequest) => {
      if (!currentSession) return;
      try {
        const result = await reportUnreadable(payload);
        setIsOnline(true);
        showNotice({
          tone: 'warning',
          message: `Reported — ${result.destination ?? 'HOLD'}, supervisors alerted.`,
        });
        return result;
      } catch (err) {
        // Already reported in this session — informational, not an error.
        if (err instanceof ReturnFlowError && err.code === 'EXCEPTION_ALREADY_ACTIVE') {
          showNotice({ tone: 'warning', message: 'This carton is already reported.' });
          return;
        }
        handleError(err, 'Could not report the label.');
      }
    },
    [currentSession, reportUnreadable, showNotice, handleError]
  );

  // ---------------------------------------------------------
  // 7. Reason codes (§4.3) — loaded live, filtered by the SERVER
  // ---------------------------------------------------------
  // ✅ verified live: `GET /inbound/exception-reasons?condition=` filters
  // server-side, so no reason code or category is hard-coded in the app.
  // Cached per condition to avoid refetching while the sheet stays open.
  const loadReasonCodes = useCallback(
    async (condition: ReturnCondition) => {
      if (condition === 'good') return;
      const { reasonCodes, reasonCodesCondition } = useReturnsStore.getState();
      if (reasonCodesCondition === condition && reasonCodes.length > 0) return;
      await fetchReasonCodes(condition);
    },
    [fetchReasonCodes]
  );

  const pendingItems = items.filter((item) => item.condition === null);

  return {
    // state
    step,
    registrations,
    selectedRegistration,
    currentSession,
    items,
    pendingItems,
    lastScan,
    scanNotice,
    endResult,
    reasonCodes,
    registrationReasonCode,
    isLoading,
    isScanning,
    isSubmitting,
    isFetchingReasons,
    error,
    errorCode,
    dockLocation,
    isOnline,

    // setters
    setDockLocation,

    // actions
    loadRegistrations,
    openRegistrations,
    selectRegistration,
    handleOpenSession,
    handleScan,
    handleClassify,
    handleBulkGood,
    handleEndSession,
    handleCancelSession,
    finishAndExit,
    handleReportUnreadable,
    loadReasonCodes,
    clearError,
    clearScanNotice,
    resetToIdle,
  };
}

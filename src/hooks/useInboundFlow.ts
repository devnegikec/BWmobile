// ============================================================
// useInboundFlow — Inbound session state + business logic
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useInboundStore } from '@/store/inboundStore';
import * as qsealService from '@/api/qsealService';
import { getAsnReceivingSummary, cancelInboundSession, removeScanItems } from '@/api/inboundService';
import { extractQSealSerial } from '@/utils/qsealUrl';
import type { AsnReceivingSummary, InboundScanExceptionInput } from '@/types';

export type InboundStep = 'idle' | 'scanning' | 'summary' | 'slip_generated';

export function useInboundFlow() {
  const { selectedWarehouse, user, worker, isAuthenticated, logout } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  // Redirect to login if no valid user/worker session
  useEffect(() => {
    if (!isAuthenticated || (!user && !worker)) {
      logout();
    }
  }, [isAuthenticated, user, worker, logout]);

  const {
    currentSession,
    sessionSummary,
    lastScan,
    generatedSlip,
    isScanning,
    isLoading,
    linkedUnitsParents,
    availableAsns,
    selectedAsn,
    isFetchingAsns,
    itemRejections,
    setScanException,
    startSession,
    recordScan,
    clearLinkedUnits,
    loadSummary,
    endSession,
    clearSession,
    fetchAsnOrders,
    selectAsn,
  } = useInboundStore();

  const [step, setStep] = useState<InboundStep>('idle');
  const [dockLocation, setDockLocation] = useState('');
  const [isProcessingQSeal, setIsProcessingQSeal] = useState(false);
  const [showAsnPicker, setShowAsnPicker] = useState(false);
  const [reconciliation, setReconciliation] = useState<AsnReceivingSummary | null>(null);
  const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
  // Monotonic request id to ignore out-of-order reconciliation responses
  const reconciliationRequestId = useRef(0);
  // Prevent duplicate QSeal scans. A ref (not state) is used because the
  // duplicate check must read/write synchronously — rapid scans can arrive
  // before a React state update would propagate.
  const scannedQSealSerials = useRef<Set<string>>(new Set());

  // Sync step with store state
  useEffect(() => {
    if (generatedSlip) {
      setStep('slip_generated');
    } else if (isScanning) {
      setStep('scanning');
    } else if (currentSession && !isScanning) {
      setStep('summary');
    } else {
      setStep('idle');
    }
  }, [currentSession, isScanning, generatedSlip]);

  const refreshReconciliation = useCallback(async () => {
    const activeSession = useInboundStore.getState().currentSession;
    const asnOrderId = activeSession?.asn_order_id || useInboundStore.getState().selectedAsn?.id;
    if (!activeSession || !asnOrderId) {
      reconciliationRequestId.current += 1;
      setIsReconciliationLoading(false);
      setReconciliation(null);
      return;
    }

    // Tag this request so only the latest response is applied. Concurrent
    // refreshes (e.g. a burst of scans) must not overwrite newer data with an
    // older, slower response.
    const requestId = ++reconciliationRequestId.current;
    setIsReconciliationLoading(true);
    try {
      const summary = await getAsnReceivingSummary(asnOrderId, activeSession.id);
      if (requestId === reconciliationRequestId.current) {
        setReconciliation(summary);
      }
    } catch (error) {
      if (requestId === reconciliationRequestId.current) {
        console.warn('[Inbound] Failed to refresh live reconciliation:', error);
      }
    } finally {
      if (requestId === reconciliationRequestId.current) {
        setIsReconciliationLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshReconciliation();
  }, [currentSession?.id, currentSession?.asn_order_id, refreshReconciliation]);

  // Reset every piece of local state back to the idle start screen. Shared by
  // end-session, cancel-session and start-new-session so the three paths can
  // never drift apart.
  const resetToIdle = useCallback(() => {
    clearSession();
    clearLinkedUnits();
    setDockLocation('');
    setShowAsnPicker(false);
    setReconciliation(null);
    scannedQSealSerials.current = new Set();
    setStep('idle');
  }, [clearSession, clearLinkedUnits]);

  // ============ HANDLERS ============

  const handleStartSession = async () => {
    if (!selectedWarehouse) {
      Alert.alert('Error', 'Please select a warehouse first.');
      return;
    }

    const doStart = async () => {
      clearLinkedUnits();
      await startSession(selectedWarehouse.id, dockLocation.trim(), selectedAsn?.id);
      await refreshReconciliation();
      setStep('scanning');
    };

    try {
      await doStart();
    } catch (err: any) {
      const existingSessionId = err?.existingSessionId;
      console.log('[Inbound] handleStartSession error:', {
        existingSessionId: existingSessionId || 'NOT EXTRACTED',
        status: err?.status,
        message: err?.message,
      });
      if (existingSessionId) {
        console.log('[Inbound] Showing cancel-and-start-fresh prompt for session:', existingSessionId);
        Alert.alert(
          'Session Already Active',
          'An open scan session already exists for this ASN. Cancel the previous session and start a fresh one?',
          [
            { text: 'Keep Existing', style: 'cancel' },
            {
              text: 'Cancel & Start Fresh',
              style: 'destructive',
              onPress: async () => {
                try {
                  console.log('[Inbound] Cancelling previous session:', existingSessionId);
                  await cancelInboundSession(existingSessionId);
                  console.log('[Inbound] Previous session cancelled — starting fresh session.');
                  await doStart();
                } catch (retryErr: any) {
                  console.error('[Inbound] Cancel/retry failed:', {
                    status: retryErr?.response?.status,
                    data: retryErr?.response?.data,
                    message: retryErr?.message,
                  });
                  Alert.alert('Error', retryErr?.message || 'Failed to start session.');
                }
              },
            },
          ]
        );
        return;
      }
      Alert.alert('Error', err.message);
    }
  };

  // Background: record individual item scans concurrently
  const recordScansInBackground = async (units: any[]) => {
    const CONCURRENCY = 5;
    /* eslint-disable no-await-in-loop -- intentional batched concurrency (limit 5 in flight) */
    for (let i = 0; i < units.length; i += CONCURRENCY) {
      const batch = units.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (unit) => {
          try {
            await recordScan(unit.serial_number);
          } catch {}
        })
      );
      await refreshReconciliation();
    }
    /* eslint-enable no-await-in-loop */
  };

  // ---- QSeal parent scan: Step 1→2 (UI visible), Step 3 (background) ----
  const handleQSealScan = async (serial: string) => {
    if (!orgId) {
      Alert.alert('Error', 'Organization ID not found. Please log out and log in again.');
      return;
    }

    // Prevent duplicate QSeal scans — silently ignore re-scans. Claim the
    // serial synchronously (before any await) so concurrent rapid scans of the
    // same QSeal cannot both pass this check.
    if (scannedQSealSerials.current.has(serial)) {
      console.log('[Inbound] duplicate QSeal ignored:', serial);
      return;
    }
    scannedQSealSerials.current.add(serial);

    setIsProcessingQSeal(true);
    try {
      // Step 1: Resolve serial → get parent UUID
      const node = await qsealService.scanQSeal(orgId, {
        serial_number: serial,
        device_type: 'mobile',
        os: 'iOS/Android',
        ip_address: '',
      });

      // Step 2: Fetch linked units
      const parentWithUnits = await qsealService.getLinkedUnits(node.node_id);

      // Update store & UI immediately — don't wait for Step 3
      useInboundStore.setState((s) => ({
        linkedUnitsParents: [...s.linkedUnitsParents, parentWithUnits],
      }));

      const unitCount = parentWithUnits.linked_units?.length || 0;
      setIsProcessingQSeal(false);

      // Step 3: Record individual scans in the BACKGROUND
      if (unitCount > 0) {
        recordScansInBackground(parentWithUnits.linked_units!);
      }
    } catch (err: any) {
      // Release the claim so this serial can be retried after the failure.
      scannedQSealSerials.current.delete(serial);
      const detail = err?.response?.data?.detail || err?.message || '';
      const msg = typeof detail === 'string' ? detail : detail?.message || 'Failed to process QSeal.';
      Alert.alert('QSeal Error', msg);
      setIsProcessingQSeal(false);
    }
  };

  const handleScan = async (data: string) => {
    console.log('[Inbound] handleScan raw data:', data.substring(0, 120));
    const qsealSerial = extractQSealSerial(data);
    console.log('[Inbound] isQSeal:', !!qsealSerial, 'serial:', qsealSerial);

    if (qsealSerial) {
      // ---- QSeal parent QR: resolve → fetch linked units → record each ----
      await handleQSealScan(qsealSerial);
    } else {
      // ---- Regular item QR: record scan directly ----
      console.log('[Inbound] recordScan (regular):', { qr_data: data.substring(0, 80) });
      try {
        const scan = await recordScan(data);
        await refreshReconciliation();
        // Surface SKUs that are not on this ASN but were accepted into HOLD.
        // Use the scan returned by THIS call (not the shared lastScan) so a
        // concurrent scan cannot show the wrong SKU or suppress this alert.
        if (scan?.exception_status === 'pending_approval') {
          Alert.alert(
            'Not in ASN',
            `"${scan.sku}" is not on this ASN. It was moved to HOLD for review.`
          );
        }
        console.log('[Inbound] recordScan SUCCESS');
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('Duplicate')) {
          // Same item scanned again — silently ignore.
          console.log('[Inbound] duplicate scan ignored:', data.substring(0, 80));
        } else {
          console.log('[Inbound] recordScan FAILED:', { message: msg });
          Alert.alert('Notice', msg);
        }
      }
    }
  };

  // Remove a scanned QSeal parent from the session (wrong QR scanned by mistake).
  const removeParent = async (parentId: string) => {
    const state = useInboundStore.getState();
    const parent = state.linkedUnitsParents.find((p) => p.id === parentId);
    if (!parent) return;

    const childSerials = (parent.linked_units || [])
      .map((u) => u.serial_number)
      .filter((s): s is string => !!s);

    // Delete the recorded child scans on the server FIRST. Local state is only
    // removed after the server confirms the deletion — otherwise a failed
    // request would hide the parent locally while its scans and session totals
    // remain on the server.
    if (state.currentSession && childSerials.length > 0) {
      try {
        const result = await removeScanItems(state.currentSession.id, childSerials);

        // Sync the authoritative box count returned by the server so session
        // and summary totals stop counting the deleted boxes/quantity.
        useInboundStore.setState((s) => ({
          currentSession: s.currentSession
            ? { ...s.currentSession, total_boxes_scanned: result.total_boxes_scanned }
            : s.currentSession,
        }));

        // Refresh the loaded summary and live reconciliation.
        await refreshReconciliation();
        const latest = useInboundStore.getState();
        if (latest.sessionSummary) {
          try {
            await latest.loadSummary();
          } catch {
            // Non-fatal — the totals above are already synced.
          }
        }
      } catch (err: any) {
        Alert.alert(
          'Remove Failed',
          err?.response?.data?.message || err?.message || 'Could not remove items from the server.'
        );
        return; // Keep the parent locally — nothing was deleted on the server.
      }
    }

    // Server deletion succeeded (or there were no child scans) — now drop the
    // parent locally and allow re-scanning its serial.
    if (parent.serial_number) {
      scannedQSealSerials.current.delete(parent.serial_number);
    }
    useInboundStore.getState().removeLinkedUnitsParent(parentId);
  };

  const handleViewSummary = async () => {
    try {
      await loadSummary();
      setStep('summary');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const classifyLastScan = (
    exception: Omit<InboundScanExceptionInput, 'serial_number'>
  ) => {
    if (!lastScan) {
      Alert.alert('No scan selected', 'Scan an item before adding an exception.');
      return;
    }
    setScanException({ ...exception, serial_number: lastScan.qr_identifier });
    Alert.alert(
      'Exception saved',
      `${lastScan.sku} will be routed to ${exception.destination || 'receipt review'} when the session ends.`
    );
  };

  const handleEndSession = async () => {
    // Do nothing if nothing was scanned — avoid creating empty receiving slips
    const hasScans =
      (currentSession?.total_boxes_scanned ?? 0) > 0 || linkedUnitsParents.length > 0;
    if (!hasScans) {
      Alert.alert('No Items Scanned', 'Nothing to end — no items have been scanned in this session.');
      return;
    }

    const rejectionCount = Object.values(itemRejections).filter((r) => r.rejected).length;
    const message =
      rejectionCount > 0
        ? `This will generate a receiving slip with ${rejectionCount} item(s) marked for rejection. Continue?`
        : 'This will generate a receiving slip. Continue?';

    Alert.alert('End Session', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        onPress: async () => {
          try {
            // Rejections are sent with the end-session call, so the backend
            // applies them before finalizing the receiving slip.
            await endSession();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleNewSession = () => {
    resetToIdle();
  };

  const handleCancelSession = () => {
    Alert.alert(
      'Cancel Session',
      'Cancel this receiving session? Any scanned items will be discarded.',
      [
        { text: 'Keep Scanning', style: 'cancel' },
        {
          text: 'Cancel Session',
          style: 'destructive',
          onPress: async () => {
            // Close the session on the SERVER first. Resetting local state
            // without this leaves the session OPEN on the backend, which then
            // rejects the next "Start Session" with an existing-open-session
            // conflict.
            const sessionId = useInboundStore.getState().currentSession?.id;
            if (sessionId) {
              try {
                await cancelInboundSession(sessionId);
              } catch (err: any) {
                const status = err?.response?.status;
                // 404/409 mean it is already gone or closed on the server, so
                // there is nothing left to cancel — safe to reset locally.
                if (status !== 404 && status !== 409) {
                  Alert.alert(
                    'Cancel Failed',
                    err?.response?.data?.message ||
                      err?.message ||
                      'Could not cancel the session on the server. Please try again.'
                  );
                  return; // Keep local state so the user can retry.
                }
              }
            }
            resetToIdle();
          },
        },
      ]
    );
  };

  const openAsnPicker = () => {
    if (selectedWarehouse) {
      fetchAsnOrders(selectedWarehouse.id);
    }
    setShowAsnPicker(true);
  };

  return {
    // Step
    step,
    setStep,
    // Form state
    dockLocation,
    setDockLocation,
    isProcessingQSeal,
    showAsnPicker,
    setShowAsnPicker,
    // Store state
    selectedWarehouse,
    currentSession,
    sessionSummary,
    lastScan,
    generatedSlip,
    linkedUnitsParents,
    availableAsns,
    selectedAsn,
    isFetchingAsns,
    isLoading,
    reconciliation,
    isReconciliationLoading,
    // Actions
    handleStartSession,
    handleScan,
    removeParent,
    handleViewSummary,
    classifyLastScan,
    handleEndSession,
    handleNewSession,
    handleCancelSession,
    selectAsn,
    openAsnPicker,
  };
}

// ============================================================
// useInboundFlow — Inbound session state + business logic
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useInboundStore } from '../store/inboundStore';
import * as qsealService from '../api/qsealService';
import { getAsnReceivingSummary, registerVehicleArrival } from '../api/inboundService';
import { extractQSealSerial } from '../utils/qsealUrl';
import type { AsnReceivingSummary, InboundScanExceptionInput } from '../types';

export type InboundStep = 'idle' | 'scanning' | 'summary' | 'slip_generated';

export function useInboundFlow() {
  const { selectedWarehouse, user, worker, isAuthenticated, logout } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  // Redirect to login if no valid user/worker session
  useEffect(() => {
    if (!isAuthenticated || (!user && !worker)) {
      logout();
    }
  }, [isAuthenticated, user, worker]);

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
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [isProcessingQSeal, setIsProcessingQSeal] = useState(false);
  const [showAsnPicker, setShowAsnPicker] = useState(false);
  const [reconciliation, setReconciliation] = useState<AsnReceivingSummary | null>(null);
  const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
  // Prevent duplicate QSeal scans
  const [scannedQSealSerials, setScannedQSealSerials] = useState<Set<string>>(new Set());

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
      setReconciliation(null);
      return;
    }

    setIsReconciliationLoading(true);
    try {
      const summary = await getAsnReceivingSummary(asnOrderId, activeSession.id);
      setReconciliation(summary);
    } catch (error) {
      console.warn('[Inbound] Failed to refresh live reconciliation:', error);
    } finally {
      setIsReconciliationLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshReconciliation();
  }, [currentSession?.id, currentSession?.asn_order_id, refreshReconciliation]);

  // ============ HANDLERS ============

  const handleStartSession = async () => {
    if (!selectedWarehouse) {
      Alert.alert('Error', 'Please select a warehouse first.');
      return;
    }
    if (!dockLocation.trim()) {
      Alert.alert('Error', 'Please enter a dock location.');
      return;
    }
    try {
      clearLinkedUnits();
      // HC-03: register vehicle arrival (optional) before starting unloading
      if (vehicleNumber.trim()) {
        await registerVehicleArrival({
          vehicle_no: vehicleNumber.trim(),
          driver_name: driverName.trim() || undefined,
          warehouse_id: selectedWarehouse.id,
          dock: dockLocation.trim(),
          asn_order_ids: selectedAsn?.id ? [selectedAsn.id] : [],
        });
      }
      await startSession(selectedWarehouse.id, dockLocation.trim(), selectedAsn?.id);
      await refreshReconciliation();
      setStep('scanning');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Background: record individual item scans concurrently
  const recordScansInBackground = async (units: any[]) => {
    const CONCURRENCY = 5;
    for (let i = 0; i < units.length; i += CONCURRENCY) {
      const batch = units.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (unit) => {
          const url = unit.product_item_url || unit.serial_number;
          try {
            await recordScan(url);
          } catch {}
        })
      );
      await refreshReconciliation();
    }
  };

  // ---- QSeal parent scan: Step 1→2 (UI visible), Step 3 (background) ----
  const handleQSealScan = async (serial: string) => {
    if (!orgId) {
      Alert.alert('Error', 'Organization ID not found. Please log out and log in again.');
      return;
    }

    // Prevent duplicate QSeal scans
    if (scannedQSealSerials.has(serial)) {
      Alert.alert('Duplicate', `QSeal "${serial}" has already been scanned in this session.`);
      return;
    }

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
      // Mark serial as scanned to prevent duplicates
      setScannedQSealSerials((prev) => new Set(prev).add(serial)); // 👈 Unblock UI immediately

      // Step 3: Record individual scans in the BACKGROUND
      if (unitCount > 0) {
        recordScansInBackground(parentWithUnits.linked_units!);
      }
    } catch (err: any) {
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
        await recordScan(data);
        await refreshReconciliation();
        console.log('[Inbound] recordScan SUCCESS');
      } catch (err: any) {
        console.log('[Inbound] recordScan FAILED:', {
          status: err?.response?.status,
          data: JSON.stringify(err?.response?.data),
        });
        Alert.alert('Notice', err.message);
      }
    }
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
    clearSession();
    clearLinkedUnits();
    setDockLocation('');
    setVehicleNumber('');
    setDriverName('');
    setShowAsnPicker(false);
    setReconciliation(null);
    setScannedQSealSerials(new Set());
    setStep('idle');
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
          onPress: () => {
            clearSession();
            clearLinkedUnits();
            setDockLocation('');
            setVehicleNumber('');
            setDriverName('');
            setShowAsnPicker(false);
            setReconciliation(null);
            setScannedQSealSerials(new Set());
            setStep('idle');
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
    vehicleNumber,
    setVehicleNumber,
    driverName,
    setDriverName,
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
    handleViewSummary,
    classifyLastScan,
    handleEndSession,
    handleNewSession,
    handleCancelSession,
    selectAsn,
    openAsnPicker,
  };
}

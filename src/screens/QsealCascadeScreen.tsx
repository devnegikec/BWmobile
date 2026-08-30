// ============================================================
// QSeal Cascade Screen — Parent-Child QR Linking
// Continuous scanning (like AssignBin). First scan = parent, rest = children.
// Only the final "Link" hits the backend.
// ============================================================
import React, { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useQSealStore } from '@/store/qsealStore';
import * as qsealService from '@/api/qsealService';
import IdleView from '@/components/qseal/IdleView';
import ScanningView from '@/components/qseal/ScanningView';
import ReviewView from '@/components/qseal/ReviewView';
import SubmittingView from '@/components/qseal/SubmittingView';
import SuccessView from '@/components/qseal/SuccessView';

type Phase = 'idle' | 'scanning' | 'review' | 'submitting' | 'success';

// ---- Serial number extraction ----
// Supports both URL patterns and returns the type:
//   Pattern A: /qseal/{SERIAL}        → parent QSeal
//   Pattern B: /s/{SERIAL}/{...}      → child unit
function extractSerial(data: string): { serial: string; isParent: boolean } | null {
  const trimmed = data.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // Pattern A: /qseal/{SERIAL} → PARENT
      const qsealIdx = pathParts.indexOf('qseal');
      if (qsealIdx !== -1 && qsealIdx + 1 < pathParts.length) {
        return { serial: pathParts[qsealIdx + 1], isParent: true };
      }

      // Pattern B: /s/{SERIAL}/... → CHILD
      const sIdx = pathParts.indexOf('s');
      if (sIdx !== -1 && sIdx + 1 < pathParts.length) {
        return { serial: pathParts[sIdx + 1], isParent: false };
      }

          // GS1 Digital Link SGTIN: /01/{gtin}/21/{serial} → treat as CHILD unit
          const gs1Idx = pathParts.indexOf('21');
          if (gs1Idx >= 1 && gs1Idx + 1 < pathParts.length) {
            // check if '01' precedes the GTIN (two positions before '21')
            if ((gs1Idx - 2) >= 0 && pathParts[gs1Idx - 2] === '01') {
              return { serial: pathParts[gs1Idx + 1], isParent: false };
            }
            // also accept pattern where '01' is immediately before GTIN (older variations)
            if (pathParts[gs1Idx - 1] && pathParts[gs1Idx - 1].length >= 8) {
              return { serial: pathParts[gs1Idx + 1], isParent: false };
            }
          }
    } catch {}
    return null;
  }

  // Raw serial — treat as parent by default
  if (trimmed.length >= 2 && trimmed.length <= 50) {
    return { serial: trimmed, isParent: true };
  }

  return null;
}

export default function QsealCascadeScreen({ navigation }: any) {
  const { user, worker } = useAuthStore();
  // Try multiple sources for organization_id
  const orgId = user?.organization_id || worker?.organization_id || '';
  console.log('[QSealCascade] orgId sources:', {
    userOrgId: user?.organization_id,
    workerOrgId: worker?.organization_id,
    final: orgId,
  });

  const {
    parent,
    children,
    isSubmitting,
    lastMapResult,
    error,
    setParent,
    addChild,
    removeChild,
    finalizeCascade,
    resetCascade,
    clearError,
  } = useQSealStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // ---- Handle QR scan (calls POST /qseal/scan to get UUID, then stores locally) ----
  const handleScan = useCallback(
    async (data: string) => {
      clearError();

      const result = extractSerial(data);
      if (!result) {
        Alert.alert('Invalid QR', 'Could not extract a serial number from this QR code.');
        return;
      }

      const { serial, isParent: detectedAsParent } = result;
      console.log('[QSealCascade] scan:', { serial, detectedAsParent, orgId });

      if (!orgId) {
        Alert.alert('Error', 'Organization ID not found. Please log out and log in again.');
        return;
      }

      setIsScanning(true);
      try {
        const node = await qsealService.scanQSeal(orgId, {
          serial_number: serial,
          device_type: Platform.OS,
          os: Platform.OS === 'ios' ? `iOS ${Platform.Version}` : `Android ${Platform.Version}`,
          ip_address: '',
        });

        setLastScanned(serial);

        // URL type detection:
        //   /qseal/{SERIAL} → parent (or first scan if no parent yet)
        //   /s/{SERIAL}/... → child
        if (detectedAsParent && !parent) {
          setParent(serial, node.node_id);
        } else {
          addChild(serial, node.node_id);
        }
      } catch (err: any) {
        const detail =
          err?.response?.data?.detail || err?.message || 'Failed to look up QSeal.';
        const msg = typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail));
        Alert.alert('Scan Error', msg);
      } finally {
        setIsScanning(false);
      }
    },
    [orgId, parent, setParent, addChild, clearError]
  );

  // ---- Review → finalize (sends map request to backend) ----
  const handleFinalize = async () => {
    console.log('[QSealCascade] handleFinalize called');
    setPhase('submitting');
    const result = await finalizeCascade();
    console.log('[QSealCascade] finalizeCascade result:', result);
    if (result) {
      if (result.mapped_count === 0) {
        // Backend accepted but nothing new was linked (already mapped)
        Alert.alert(
          'Already Mapped',
          `All ${children.length} child QSeal(s) are already linked to this parent. No new links were created.`,
          [{ text: 'OK' }]
        );
        setPhase('review');
      } else {
        setPhase('success');
      }
    } else {
      const storeError = useQSealStore.getState().error;
      console.log('[QSealCascade] finalize failed, error:', storeError);
      Alert.alert('Link Failed', storeError || 'Failed to link QSeals.');
      setPhase('review');
    }
  };

  // ---- Start new session ----
  const handleNewSession = () => {
    resetCascade();
    setLastScanned(null);
    setPhase('idle');
  };

  const handleStartScan = () => {
    resetCascade();
    setLastScanned(null);
    setPhase('scanning');
  };

  // ============ RENDER: Idle ============
  if (phase === 'idle') {
    return <IdleView onBack={() => navigation.goBack()} onStartScan={handleStartScan} />;
  }

  // ============ RENDER: Scanning ============
  if (phase === 'scanning') {
    return (
      <ScanningView
        parentSerial={parent?.serialNumber ?? null}
        childCount={children.length}
        lastScanned={lastScanned}
        isScanning={isScanning}
        onScan={handleScan}
        onCancel={handleNewSession}
        onReview={() => setPhase('review')}
      />
    );
  }

  // ============ RENDER: Review ============
  if (phase === 'review') {
    return (
      <ReviewView
        parentSerial={parent?.serialNumber ?? null}
        children={children}
        error={error}
        isSubmitting={isSubmitting}
        onBack={() => setPhase('scanning')}
        onRemoveChild={removeChild}
        onFinalize={handleFinalize}
        onAddMore={() => setPhase('scanning')}
      />
    );
  }

  // ============ RENDER: Submitting ============
  if (phase === 'submitting') {
    return <SubmittingView parentSerial={parent?.serialNumber ?? null} childCount={children.length} />;
  }

  // ============ RENDER: Success ============
  if (phase === 'success') {
    return (
      <SuccessView
        mappedCount={lastMapResult?.mapped_count ?? 0}
        childCount={children.length}
        parentSerial={parent?.serialNumber ?? null}
        onNewSession={handleNewSession}
        onDone={() => navigation.goBack()}
      />
    );
  }

  return null;
}



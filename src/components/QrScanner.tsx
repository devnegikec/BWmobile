// ============================================================
// QR Scanner — Shared barcode/QR scanning component
//
// Two scanning modes:
//   1. DataWedge hardware scanner — default on Zebra devices
//   2. Camera-based (expo-camera) — used on non-Zebra devices
//
// Zebra devices are auto-detected via Platform.constants.Manufacturer.
// DataWedge must have a profile for: com.horizonsync.mobile
// ============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import DataWedgeScanner from './DataWedgeScanner';
import PermissionDenied from './PermissionDenied';
import { styles } from './QrScanner.styles';

// Detect Zebra devices by manufacturer string
const isZebraDevice =
  Platform.OS === 'android' &&
  typeof Platform.constants?.Manufacturer === 'string' &&
  Platform.constants.Manufacturer.toLowerCase().includes('zebra');

interface QrScannerProps {
  onScan: (data: string) => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  /** Show the "Use Hardware Scanner" / "Switch to Camera" toggle. Default: false */
  showHardwareToggle?: boolean;
}

// ---------- Main QrScanner ----------
export default function QrScanner({ onScan, onClose, title, subtitle, showHardwareToggle = false }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [useHardwareScanner, setUseHardwareScanner] = useState(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  // Android only exposes ONE camera session to the app. Screens in the bottom
  // tab navigator stay mounted after you visit them, so more than one QrScanner
  // can exist at a time — whichever instance grabbed the camera first keeps it
  // and the visible screen renders an empty/black preview. Gating on focus
  // releases the camera from hidden screens and hands it to the active one.
  const isFocused = useIsFocused();

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  // Only request camera permission on non-Zebra devices or when user switches to camera
  useEffect(() => {
    if (!isZebraDevice && !useHardwareScanner && !permission?.granted && permission !== null) {
      requestPermission();
    }
  }, [permission, useHardwareScanner, requestPermission]);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      onScan(data);

      // Auto-reset after 1.5s so user can scan the next code seamlessly.
      // This prevents accidental double-scans of the same code while still
      // allowing continuous scanning of different codes (bin → items, etc.).
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      scanTimeoutRef.current = setTimeout(() => {
        setScanned(false);
      }, 1500);
    },
    [scanned, onScan]
  );

  const handleHardwareScan = useCallback(
    (data: string) => {
      onScan(data);
    },
    [onScan]
  );

  const switchToHardware = () => setUseHardwareScanner(true);
  const switchToCamera = () => setUseHardwareScanner(false);

  // ── Hardware scanner mode ──
  if (useHardwareScanner) {
    return (
      <View style={styles.container}>
        <DataWedgeScanner
          onScan={handleHardwareScan}
          title={title}
          subtitle={subtitle}
          onSwitchToCamera={switchToCamera}
        />
        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Camera permissions loading ──
  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    );
  }

  // ── Camera permission denied ──
  if (!permission.granted) {
    return (
      <PermissionDenied
        requestPermission={requestPermission}
        onClose={onClose}
        onSwitchToHardware={switchToHardware}
        showHardwareToggle={showHardwareToggle}
      />
    );
  }

  // ── Camera-based scanning ──
  return (
    <View style={styles.container}>
      {/* `collapsable={false}` is required on Android: the layout optimiser may
          otherwise flatten this wrapper away, which leaves the SurfaceView
          backed camera preview unmeasured and invisible. */}
      <View style={styles.cameraWrap} collapsable={false}>
        <CameraView
          style={styles.camera}
          active={isFocused}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      </View>
      {/* The camera preview is intentionally left completely clear — no scrim
          and no mask — so the operator can always see exactly what the camera
          sees. The corner brackets frame the target and the hints below use a
          text shadow to stay readable on any background. */}
      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <View style={styles.scanBox}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <Text style={styles.title}>{title || 'Scan QR Code'}</Text>
        <Text style={styles.subtitle}>
          {subtitle || 'Align the QR code within the frame'}
        </Text>
        {scanned && (
          <View style={styles.scannedIndicator}>
            <Text style={styles.scannedIndicatorText}>✓ Scanned</Text>
          </View>
        )}
        {showHardwareToggle && (
          <TouchableOpacity
            style={[styles.switchButton, { marginBottom: insets.bottom + 16 }]}
            onPress={switchToHardware}
          >
            <Text style={styles.switchButtonText}>Use Hardware Scanner</Text>
          </TouchableOpacity>
        )}

        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}


// ============================================================
// QR Scanner — Shared barcode/QR scanning component
//
// Two scanning modes (manually toggled):
//   1. Camera-based (expo-camera) — default
//   2. DataWedge hardware scanner — for Zebra devices
//
// On Zebra: tap "Use Hardware Scanner" to switch.
// DataWedge must have a profile for: com.horizonsync.mobile
// ============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface QrScannerProps {
  onScan: (data: string) => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
}

// ---------- DataWedge Hardware Scanner ----------
function DataWedgeScanner({
  onScan,
  title,
  subtitle,
  onSwitchToCamera,
}: Omit<QrScannerProps, 'onClose'> & { onSwitchToCamera: () => void }) {
  const inputRef = useRef<TextInput>(null);
  const scannedValueRef = useRef('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  // Keep the hidden input focused so DataWedge keystrokes land here
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    const timer = setTimeout(focusInput, 500);
    const interval = setInterval(focusInput, 800);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = useCallback(() => {
    const value = scannedValueRef.current.trim();
    scannedValueRef.current = '';
    inputRef.current?.clear();
    if (value) {
      setLastScanned(value);
      onScan(value);
    }
  }, [onScan]);

  // Process scan data as soon as DataWedge sends the terminator character
  const handleTextChange = useCallback((text: string) => {
    // DataWedge typically ends each scan with \n, \r, or \t
    if (text.includes('\n') || text.includes('\r') || text.includes('\t')) {
      const value = text.replace(/[\n\r\t]/g, '').trim();
      if (value) {
        inputRef.current?.clear();
        scannedValueRef.current = '';
        setLastScanned(value);
        onScan(value);
      }
      return;
    }
    // Still accumulating characters
    scannedValueRef.current = text;
  }, [onScan]);

  return (
    <View style={styles.container}>
      {/* Hidden input that captures DataWedge keystrokes */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        autoFocus
        showSoftInputOnFocus={false}
        onChangeText={handleTextChange}
        onSubmitEditing={handleSubmit}
        onBlur={() => inputRef.current?.focus()}
        blurOnSubmit={false}
      />

      <View style={styles.overlay}>
        <View style={styles.scanBox}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <Text style={styles.title}>{title || 'Scan Barcode'}</Text>
        <Text style={styles.subtitle}>
          {subtitle || 'Press the yellow scan button on your device'}
        </Text>

        {/* Feedback */}
        {lastScanned && (
          <View style={styles.scannedBubble}>
            <Text style={styles.scannedText}>Scanned: {lastScanned}</Text>
          </View>
        )}

        {/* Instructions for DataWedge setup */}
        <View style={styles.helpBox}>
          <Text style={styles.helpTitle}>DataWedge Setup</Text>
          <Text style={styles.helpText}>
            1. Open DataWedge on your Zebra device{'\n'}
            2. Create profile → Associate app: com.horizonsync.mobile{'\n'}
            3. Ensure "Keyboard wedge" output is ON{'\n'}
            4. Press the yellow scan button to scan
          </Text>
        </View>

        {/* Switch back to camera */}
        <TouchableOpacity style={styles.switchButton} onPress={onSwitchToCamera}>
          <Text style={styles.switchButtonText}>Switch to Camera Scanner</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------- Camera Permission Denied UI ----------
function PermissionDenied({
  requestPermission,
  onClose,
  onSwitchToHardware,
}: {
  requestPermission: () => void;
  onClose?: () => void;
  onSwitchToHardware: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.permissionText}>
        Camera permission is required to scan QR codes.
      </Text>
      <TouchableOpacity style={styles.button} onPress={requestPermission}>
        <Text style={styles.buttonText}>Grant Permission</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.buttonOutline} onPress={onSwitchToHardware}>
        <Text style={styles.buttonOutlineText}>Use Hardware Scanner Instead</Text>
      </TouchableOpacity>
      {onClose && (
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelButtonText}>Go Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------- Main QrScanner ----------
export default function QrScanner({ onScan, onClose, title, subtitle }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [useHardwareScanner, setUseHardwareScanner] = useState(false);

  useEffect(() => {
    if (!useHardwareScanner && !permission?.granted && permission !== null) {
      requestPermission();
    }
  }, [permission, useHardwareScanner]);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      onScan(data);
    },
    [scanned, onScan]
  );

  const handleHardwareScan = useCallback(
    (data: string) => {
      onScan(data);
    },
    [onScan]
  );

  const handleScanAgain = () => {
    setScanned(false);
  };

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
      />
    );
  }

  // ── Camera-based scanning ──
  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          {onClose && (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          )}

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
            <TouchableOpacity style={styles.scanAgainButton} onPress={handleScanAgain}>
              <Text style={styles.scanAgainText}>Tap to Scan Again</Text>
            </TouchableOpacity>
          )}

          {/* Hardware scanner toggle */}
          <TouchableOpacity style={styles.switchButton} onPress={switchToHardware}>
            <Text style={styles.switchButtonText}>Use Hardware Scanner</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    padding: 24,
  },
  loadingText: { color: '#fff', fontSize: 16 },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1A73E8',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonOutline: {
    borderWidth: 1,
    borderColor: '#1A73E8',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonOutlineText: { color: '#1A73E8', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  cancelButtonText: { color: '#aaa', fontSize: 16 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },

  scanBox: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#1A73E8',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },

  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 32,
    textAlign: 'center',
  },
  subtitle: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  scanAgainButton: {
    marginTop: 24,
    backgroundColor: '#1A73E8',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  scanAgainText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Switch button (camera ↔ hardware)
  switchButton: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  switchButtonText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },

  // Hardware scanner feedback
  scannedBubble: {
    marginTop: 16,
    backgroundColor: 'rgba(26,115,232,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scannedText: { color: '#fff', fontSize: 14 },

  // DataWedge help
  helpBox: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    borderRadius: 10,
    width: '85%',
  },
  helpTitle: {
    color: '#FFD54F',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  helpText: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 18,
  },

  // Hidden input for DataWedge capture
  hiddenInput: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    width: 1,
    height: 1,
    opacity: 0,
  },
});

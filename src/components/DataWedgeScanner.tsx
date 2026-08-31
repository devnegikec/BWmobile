// ============================================================
// DataWedgeScanner — Hardware barcode scanner (Zebra devices)
//
// Captures DataWedge keystrokes via a hidden TextInput. DataWedge
// must have a profile for: com.horizonsync.mobile
// ============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './QrScanner.styles';

interface DataWedgeScannerProps {
  onScan: (data: string) => void;
  title?: string;
  subtitle?: string;
  onSwitchToCamera: () => void;
}

export default function DataWedgeScanner({
  onScan,
  title,
  subtitle,
  onSwitchToCamera,
}: DataWedgeScannerProps) {
  const inputRef = useRef<TextInput>(null);
  const scannedValueRef = useRef('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

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
            3. Ensure &quot;Keyboard wedge&quot; output is ON{'\n'}
            4. Press the yellow scan button to scan
          </Text>
        </View>

        {/* Switch back to camera */}
        <TouchableOpacity
          style={[styles.switchButton, { marginBottom: insets.bottom + 16 }]}
          onPress={onSwitchToCamera}
        >
          <Text style={styles.switchButtonText}>Switch to Camera Scanner</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

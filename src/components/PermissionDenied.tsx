// ============================================================
// PermissionDenied — Camera permission prompt UI
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './QrScanner.styles';

interface PermissionDeniedProps {
  requestPermission: () => void;
  onClose?: () => void;
  onSwitchToHardware: () => void;
  showHardwareToggle?: boolean;
}

export default function PermissionDenied({
  requestPermission,
  onClose,
  onSwitchToHardware,
  showHardwareToggle,
}: PermissionDeniedProps) {
  return (
    <View style={styles.centered}>
      <Text style={styles.permissionText}>
        Camera permission is required to scan QR codes.
      </Text>
      <TouchableOpacity style={styles.button} onPress={requestPermission}>
        <Text style={styles.buttonText}>Grant Permission</Text>
      </TouchableOpacity>
      {showHardwareToggle && (
        <TouchableOpacity style={styles.buttonOutline} onPress={onSwitchToHardware}>
          <Text style={styles.buttonOutlineText}>Use Hardware Scanner Instead</Text>
        </TouchableOpacity>
      )}
      {onClose && (
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelButtonText}>Go Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

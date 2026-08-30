// ============================================================
// QR Login Screen — Worker QR code scanning login
// Uses Identity Service POST /api/v1/identity/login/qr-code
// The QR encodes a plain string like "WRK-A1B2C3D4E5F6"
// ============================================================
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import QrScanner from '../components/QrScanner';
import { useAuthStore } from '../store/authStore';

export default function QrLoginScreen({ navigation }: any) {
  const { loginWithQRCode, isLoading } = useAuthStore();
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleScan = async (data: string) => {
    setLoginError(null);
    try {
      // The QR code contains the worker's unique qr_code string
      await loginWithQRCode(data);
      // Navigation will happen automatically via auth state change
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Worker QR Login</Text>
        <Text style={styles.headerSubtitle}>
          Scan your worker QR code to sign in
        </Text>
      </View>

      {/* Scanner */}
      {!isLoading && (
        <QrScanner
          onScan={handleScan}
          onClose={() => navigation.goBack()}
          title="Scan Worker QR Code"
          subtitle="Position the QR code within the frame"
          showHardwareToggle
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.loadingText}>Logging you in...</Text>
        </View>
      )}

      {/* Error */}
      {loginError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{loginError}</Text>
        </View>
      )}

      {/* Manual entry fallback */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Can&apos;t scan? Contact your supervisor.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1923',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 10,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: '#667788',
    fontSize: 13,
  },
});

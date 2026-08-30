// ============================================================
// App.tsx — Horizon Sync Mobile App Entry Point
// ============================================================
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import AppNavigator from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await checkAuth();
      } catch {
        // Not authenticated — that's fine
      }
      setIsReady(true);
    }
    init();
  }, [checkAuth]);

  if (!isReady) {
    return (
      <View style={styles.splash}>
        <View style={styles.splashLogo}>
          <Text style={styles.splashLogoText}>HS</Text>
        </View>
        <Text style={styles.splashTitle}>Horizon Sync</Text>
        <ActivityIndicator color="#1A73E8" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1923',
  },
  splashLogo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogoText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },
  splashTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
  },
});

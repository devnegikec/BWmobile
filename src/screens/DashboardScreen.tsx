// ============================================================
// Dashboard Screen — Main hub after login
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../store/authStore';

export default function DashboardScreen({ navigation }: any) {
  const {
    user,
    worker,
    isAuthenticated,
    selectedWarehouse,
    warehouses,
    loadWarehouses,
    logout,
  } = useAuthStore();

  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);

  // Redirect to login if no valid session
  useEffect(() => {
    if (!isAuthenticated || (!user && !worker)) {
      logout();
    }
  }, [isAuthenticated, user, worker]);

  const displayName = user?.display_name || worker?.display_name || 'User';

  useEffect(() => {
    // Load warehouses as fallback (e.g., for password-login users)
    if (warehouses.length === 0 && !selectedWarehouse) {
      loadWarehousesWrapper();
    }
  }, []);

  const loadWarehousesWrapper = async () => {
    setLoadingWarehouses(true);
    setWarehouseError(null);
    try {
      await loadWarehouses();
    } catch (err: any) {
      setWarehouseError(err.message || 'Failed to load warehouses');
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  // ---- Empty warehouse state (no warehouses assigned) ----
  if (!loadingWarehouses && warehouses.length === 0 && !selectedWarehouse) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏭</Text>
          <Text style={styles.emptyTitle}>No Warehouses Assigned</Text>
          <Text style={styles.emptyMessage}>
            You are not assigned to any warehouse.{'\n'}
            Please contact your administrator.
          </Text>
          {warehouseError && (
            <Text style={styles.emptyError}>{warehouseError}</Text>
          )}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadWarehousesWrapper}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.emptyLogoutBtn} onPress={handleLogout}>
            <Text style={styles.emptyLogoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---- Loading state ----
  if (loadingWarehouses && !selectedWarehouse) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.loadingText}>Loading warehouses...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header — Warehouse + Logout */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.warehouseName}>
            {selectedWarehouse?.name || 'Loading...'}
          </Text>
          {selectedWarehouse && (
            <Text style={styles.warehouseCity}>{selectedWarehouse.city}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Welcome */}
      <View style={styles.welcomeSection}>
        <Text style={styles.greeting}>Welcome, {displayName}</Text>
        {worker && (
          <Text style={styles.role}>
            {worker.role === 'warehouse_worker' ? 'Warehouse Worker' : worker.role}
          </Text>
        )}
      </View>

      {/* Operations — 3x2 grid */}
      <View style={styles.operationsSection}>
        <Text style={styles.sectionTitle}>Operations</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Inbound')}>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📥</Text>
            </View>
            <Text style={styles.cardTitle}>Inbound</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Putaway')}>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📍</Text>
            </View>
            <Text style={styles.cardTitle}>Put-Away</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AssignBin')}>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📦</Text>
            </View>
            <Text style={styles.cardTitle}>Assign Bin</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('ReceivingSlips')}>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📋</Text>
            </View>
            <Text style={styles.cardTitle}>Slips</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('QsealCascade')}>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>🔗</Text>
            </View>
            <Text style={styles.cardTitle}>Link QSeal</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, styles.cardDisabled]} disabled>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📤</Text>
            </View>
            <Text style={styles.cardTitle}>Pick</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, styles.cardDisabled]} disabled>
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>📊</Text>
            </View>
            <Text style={styles.cardTitle}>Stock</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },

  // ---- Top Bar ----
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 55,
    paddingHorizontal: 24,
    paddingBottom: 14,
    backgroundColor: '#1A2332',
  },
  topBarLeft: {
    flex: 1,
  },
  warehouseName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  warehouseCity: {
    color: '#667788',
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
  },

  // ---- Welcome ----
  welcomeSection: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
  },
  greeting: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  role: {
    color: '#1A73E8',
    fontSize: 13,
    marginTop: 4,
  },

  // ---- Operations ----
  operationsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: '#1A2332',
    borderRadius: 14,
    paddingVertical: 16,
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  cardDisabled: {
    opacity: 0.35,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F1923',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTitle: {
    color: '#B0C4D8',
    fontSize: 11,
    fontWeight: '600',
  },

  // ---- Empty / Error State ----
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyMessage: {
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  emptyError: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#1A73E8',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyLogoutBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyLogoutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },

  // ---- Loading State ----
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8899AA',
    fontSize: 16,
    marginTop: 16,
  },
});

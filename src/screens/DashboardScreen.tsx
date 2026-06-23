// ============================================================
// Dashboard Screen — Main hub after login
// ============================================================
import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAuthStore } from '../store/authStore';

export default function DashboardScreen({ navigation }: any) {
  const {
    user,
    worker,
    selectedWarehouse,
    loadWarehouses,
    logout,
  } = useAuthStore();

  const displayName = user?.display_name || worker?.display_name || 'User';

  useEffect(() => {
    loadWarehouses();
  }, []);

  const handleLogout = async () => {
    await logout();
  };

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
});

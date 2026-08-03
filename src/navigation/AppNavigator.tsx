// ============================================================
// App Navigator — Stack & Tab navigation setup
// ============================================================
import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import LoginScreen from '../screens/LoginScreen';
import QrLoginScreen from '../screens/QrLoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import InboundScreen from '../screens/InboundScreen';
import PutawayScreen from '../screens/PutawayScreen';
import AssignBinScreen from '../screens/AssignBinScreen';
import ReceivingSlipsScreen from '../screens/ReceivingSlipsScreen';
import { useAuthStore } from '../store/authStore';

// ---------- Type Definitions ----------
export type AuthStackParamList = {
  Login: undefined;
  QrLogin: undefined;
};

export type AppTabsParamList = {
  Dashboard: undefined;
  Inbound: undefined;
  AssignBin: undefined;
  Putaway: undefined;
  ReceivingSlips: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<AppTabsParamList>();

// ---------- Auth Navigator (Not logged in) ----------
function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F1923' },
        animation: 'slide_from_right',
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="QrLogin" component={QrLoginScreen} />
    </AuthStack.Navigator>
  );
}

// ---------- App Tabs (Logged in) ----------
function AppTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1A2332',
          borderTopColor: '#2A3A4A',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#1A73E8',
        tabBarInactiveTintColor: '#667788',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <TabIcon label="🏠" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Inbound"
        component={InboundScreen}
        options={{
          tabBarLabel: 'Inbound',
          tabBarIcon: ({ color }) => (
            <TabIcon label="📥" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AssignBin"
        component={AssignBinScreen}
        options={{
          tabBarLabel: 'Assign Bin',
          tabBarIcon: ({ color }) => (
            <TabIcon label="📦" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Putaway"
        component={PutawayScreen}
        options={{
          tabBarLabel: 'Put-Away',
          tabBarIcon: ({ color }) => (
            <TabIcon label="📍" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ReceivingSlips"
        component={ReceivingSlipsScreen}
        options={{
          tabBarLabel: 'Slips',
          tabBarIcon: ({ color }) => (
            <TabIcon label="📋" color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Simple text-based tab icon
import { Text as RNText } from 'react-native';

function TabIcon({ label }: { label: string; color: string }) {
  return <RNText style={{ fontSize: 20 }}>{label}</RNText>;
}

// ---------- Root Navigator ----------
export default function AppNavigator() {
  const { isAuthenticated } = useAuthStore();

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {isAuthenticated ? <AppTabs /> : <AuthNavigator />}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

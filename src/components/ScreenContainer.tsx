// ============================================================
// ScreenContainer — Shared header + footer (home button) wrapper
// ============================================================
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

interface ScreenContainerProps {
  /** Header title */
  title: string;
  /** Optional header subtitle */
  subtitle?: string;
  /** Screen content */
  children: React.ReactNode;
  /** Show a back button in the header (calls this handler) */
  onBack?: () => void;
  /** Custom element rendered on the right side of the header */
  headerRight?: React.ReactNode;
  /** Show the footer home button (default: true) */
  showHomeButton?: boolean;
  /** Wrap children in a ScrollView */
  scrollable?: boolean;
  /** Style applied to ScrollView contentContainer (when scrollable) */
  contentContainerStyle?: object;
  /** Extra props forwarded to the ScrollView (when scrollable) */
  scrollProps?: ScrollViewProps;
}

/**
 * Navigates to the Dashboard (Home) tab, regardless of whether the
 * current screen lives inside the tab navigator or the root stack.
 */
export function navigateHome(navigation: any): void {
  const state = navigation?.getState?.();
  const routeNames: string[] = state?.routeNames ?? [];

  if (routeNames.includes('Dashboard')) {
    navigation.navigate('Dashboard');
  } else {
    navigation.navigate('AppTabs', { screen: 'Dashboard' });
  }
}

export default function ScreenContainer({
  title,
  subtitle,
  children,
  onBack,
  headerRight,
  showHomeButton = true,
  scrollable = false,
  contentContainerStyle,
  scrollProps,
}: ScreenContainerProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const goHome = () => navigateHome(navigation);

  return (
    <View style={styles.root}>
      {/* ---- Header (safe-area aware) ---- */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
          )}
          <View style={styles.headerTextWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight}
        </View>
      </SafeAreaView>

      {/* ---- Content ---- */}
      {scrollable ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}

      {/* ---- Footer home button ---- */}
      {/* {showHomeButton && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={goHome}
            activeOpacity={0.7}
          >
            <Text style={styles.homeIcon}>🏠</Text>
            <Text style={styles.homeText}>Home1</Text>
          </TouchableOpacity>
        </View>
      )} */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  headerSafe: {
    backgroundColor: '#1A2332',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backBtn: {
    marginRight: 8,
    marginLeft: -4,
    paddingHorizontal: 4,
  },
  backIcon: {
    color: '#B0C4D8',
    fontSize: 32,
    lineHeight: 32,
    fontWeight: '400',
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8899AA',
    fontSize: 13,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  footer: {
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderTopColor: '#2A3A4A',
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 12,
  },
  homeIcon: {
    fontSize: 16,
  },
  homeText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
});

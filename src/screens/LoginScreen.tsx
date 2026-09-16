// ============================================================
// Login Screen — Username/Password authentication
// ============================================================
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen({ navigation }: any) {
  const { loginWithPassword, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  // Controls whether the password is masked or shown in plain text, so the
  // user can verify what they typed before submitting.
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Details', 'Please enter both email and password.');
      return;
    }
    try {
      await loginWithPassword(email.trim(), password, rememberMe);
    } catch (err: any) {
      // The store normalises errors to a string; guard here as well so a
      // non-string value can never reach Alert/Text and crash the app.
      const message =
        typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Your email or password may be incorrect. Please try again.';
      Alert.alert('Login Failed', message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>HS</Text>
          </View>
          <Text style={styles.appName}>Horizon Sync</Text>
          <Text style={styles.tagline}>Warehouse Management</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>Sign In</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="worker@example.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                clearError();
              }}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputWithAction]}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  clearError();
                }}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((visible) => !visible)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Me */}
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.rememberText}>Remember me (30 days)</Text>
          </TouchableOpacity>

          {/* Error — guarded so a non-string value can never crash the render */}
          {typeof error === 'string' && error.trim() ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* QR Login Link */}
          <TouchableOpacity
            style={styles.qrLink}
            onPress={() => navigation.navigate('QrLogin')}
          >
            <Text style={styles.qrLinkText}>
              📷 Sign in with QR Code (Workers)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  appName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
  },
  tagline: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 4,
  },
  form: {
    backgroundColor: '#1A2332',
    borderRadius: 16,
    padding: 24,
  },
  formTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#B0C4D8',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F1923',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithAction: {
    // Leave room for the eye button so typed text never runs underneath it
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 18,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4A5A6A',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  rememberText: {
    color: '#B0C4D8',
    fontSize: 14,
  },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
  },
  loginButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  qrLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  qrLinkText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '500',
  },
});

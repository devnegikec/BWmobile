// ============================================================
// Auth Store — Zustand store for authentication state
// ============================================================
import { create } from 'zustand';
import type { User, Worker, Warehouse } from '@/types';
import * as authService from '@/api/authService';
import { getAccessToken, setOnTokensCleared } from '@/api/client';
import { getBackendErrorMessage } from '@/utils/errors';

// ------------------------------------------------------------
// Normalise any backend/network failure into a plain string.
//
// The identity/core services return errors in several shapes:
//   - { detail: "string" }               → FastAPI HTTPException
//   - { detail: { message, error } }     → nested error object
//   - { detail: [{ loc, msg, type }] }   → FastAPI validation array (e.g. a
//                                          malformed email address)
// Storing a non-string in `error` crashes React the moment it is rendered
// inside <Text> ("Objects are not valid as a React child"), which is why a
// failed login previously took the whole app down with no message shown.
// ------------------------------------------------------------
function resolveErrorMessage(error: any, fallback: string): string {
  // Already normalised by us (see `loadWarehouses`) — the message is final,
  // user-facing copy, so never re-derive it from the payload.
  if (error?.normalized && typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  // Axios reports offline/DNS/timeout failures without an HTTP response.
  if (error?.isAxiosError && !error?.response) {
    return 'Cannot reach the server. Check your connection and try again.';
  }

  // No HTTP response, but a real message was set on the error object itself.
  if (!error?.response) {
    const message = typeof error?.message === 'string' ? error.message.trim() : '';
    return message || fallback;
  }

  const message = getBackendErrorMessage(error);
  // `getBackendErrorMessage` falls back to Axios's own generic text ("Request
  // failed with status code 400"), which is never user-facing copy. When that
  // is all we got, prefer the caller's message instead of leaking it.
  return message && message.trim() && message !== error.message
    ? message.trim()
    : fallback;
}

// Terminal error whose `message` is already user-facing copy. The original
// Axios metadata is preserved so callers can still branch on HTTP status —
// e.g. `checkAuth` treats a 401 as an invalid session.
type NormalizedError = Error & { normalized: true; response?: any };

function toNormalizedError(error: any, detail: string): NormalizedError {
  const normalized = new Error(detail) as NormalizedError;
  normalized.normalized = true;
  normalized.response = error?.response;
  return normalized;
}

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  worker: Worker | null;
  warehouses: Warehouse[];
  selectedWarehouse: Warehouse | null;
  error: string | null;

  // Actions
  loginWithPassword: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithBarcode: (barcode: string) => Promise<void>;
  loginWithQRCode: (qrCode: string) => Promise<void>;
  loadWarehouses: () => Promise<void>;
  selectWarehouse: (warehouse: Warehouse) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: false,
  user: null,
  worker: null,
  warehouses: [],
  selectedWarehouse: null,
  error: null,

  // ---------- Username/Password Login ----------
  loginWithPassword: async (email, password, rememberMe = false) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.loginWithPassword({
        email,
        password,
        remember_me: rememberMe,
        device_info: {
          device_name: 'Mobile App',
          os: 'iOS/Android',
          app_version: '1.0.0',
        },
      });
      set({
        isAuthenticated: true,
        user: response.user,
        worker: null,
        isLoading: false,
      });
    } catch (error: any) {
      console.warn('[auth] loginWithPassword failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        requestUrl: error.config?.url,
      });
      const detail = resolveErrorMessage(
        error,
        'Invalid email or password. Please try again.'
      );
      set({ isLoading: false, error: detail });
      throw new Error(detail);
    }
  },

  // ---------- QR/Barcode Login (Worker) ----------
  loginWithBarcode: async (barcode) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.loginWithBarcode({ barcode });

      // Load warehouses before authenticating (per guide: Steps 2-3)
      await get().loadWarehouses();

      const { warehouses } = get();
      if (warehouses.length === 0) {
        set({
          isLoading: false,
          error:
            'You are not assigned to any warehouse. Please contact your administrator.',
        });
        throw new Error('No warehouses assigned to your account.');
      }

      set({
        isAuthenticated: true,
        worker: response.worker,
        user: null,
        isLoading: false,
      });
    } catch (error: any) {
      // Preserve warehouse-specific error messages
      if (error.message === 'No warehouses assigned to your account.') {
        throw error;
      }
      const detail = resolveErrorMessage(error, 'Invalid QR code. Please try again.');
      set({ isLoading: false, error: detail });
      throw new Error(detail);
    }
  },

  // ---------- QR Code Login (Identity Service) ----------
  loginWithQRCode: async (qrCode) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.loginWithQRCode({ qr_code: qrCode });

      // Load warehouses before authenticating (per guide: Steps 2-3)
      await get().loadWarehouses();

      const { warehouses } = get();
      if (warehouses.length === 0) {
        set({
          isLoading: false,
          error:
            'You are not assigned to any warehouse. Please contact your administrator.',
        });
        throw new Error('No warehouses assigned to your account.');
      }

      set({
        isAuthenticated: true,
        user: response.user,
        worker: null,
        isLoading: false,
      });
    } catch (error: any) {
      // Preserve warehouse-specific error messages
      if (error.message === 'No warehouses assigned to your account.') {
        throw error;
      }
      const detail = resolveErrorMessage(error, 'Invalid QR code. Please try again.');
      set({ isLoading: false, error: detail });
      throw new Error(detail);
    }
  },

  // ---------- Load Warehouses ----------
  loadWarehouses: async () => {
    set({ error: null });
    try {
      const warehouses = await authService.getMyWarehouses();
      const defaultWarehouse = warehouses.find((w) => w.is_default) || warehouses[0] || null;
      set({
        warehouses,
        selectedWarehouse: defaultWarehouse,
      });
    } catch (error: any) {
      const detail = resolveErrorMessage(error, 'Failed to load warehouses.');
      console.error('Failed to load warehouses:', error);
      set({ error: detail });
      // Re-throw carrying the normalised message so callers surface
      // user-facing copy instead of Axios's raw error text.
      throw toNormalizedError(error, detail);
    }
  },

  // ---------- Select Warehouse ----------
  selectWarehouse: (warehouse) => {
    set({ selectedWarehouse: warehouse });
  },

  // ---------- Logout ----------
  logout: async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore
    }
    set({
      isAuthenticated: false,
      user: null,
      worker: null,
      warehouses: [],
      selectedWarehouse: null,
      error: null,
    });
  },

  // ---------- Check Existing Auth ----------
  checkAuth: async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        set({ isAuthenticated: false });
        return false;
      }
      // Token exists — validate it by loading warehouses
      // If this fails with 401, the interceptor clears tokens and triggers logout
      try {
        const warehouses = await authService.getMyWarehouses();
        const defaultWarehouse =
          warehouses.find((w) => w.is_default) || warehouses[0] || null;
        set({
          isAuthenticated: true,
          warehouses,
          selectedWarehouse: defaultWarehouse,
        });
      } catch (err: any) {
        // 401 = token invalid/expired, let interceptor handle cleanup
        if (err?.response?.status === 401) {
          set({ isAuthenticated: false });
          return false;
        }
        // Network error — still allow (offline-first), but mark as needing refresh
        set({ isAuthenticated: true });
      }
      return true;
    } catch {
      set({ isAuthenticated: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

// When tokens are cleared (e.g., 401 refresh failure), reset auth state
// so the user is redirected to the login screen
setOnTokensCleared(() => {
  useAuthStore.setState({
    isAuthenticated: false,
    user: null,
    worker: null,
    warehouses: [],
    selectedWarehouse: null,
    error: null,
  });
});

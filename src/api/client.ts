// ============================================================
// API Client — Axios instance with JWT interceptors
// ============================================================
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Base URLs — sourced from .env (EXPO_PUBLIC_*). When unset, fall back to
// locally hosted services. On a physical phone, `localhost` points at the phone
// itself, so we auto-detect the dev machine's LAN IP from Expo's hostUri and
// use it as the host (e.g. http://192.168.1.10:8001/api/v1).
function resolveDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost ||
    (Constants as unknown as { manifest?: { debuggerHost?: string } })
      .manifest?.debuggerHost;
  if (!hostUri) return null;

  // hostUri looks like `192.168.1.10:8081` (IPv4) or `[2001:db8::1]:8081`
  // (IPv6). Strip the scheme, then handle a bracketed IPv6 literal before
  // falling back to the `host:port` split used for IPv4.
  const withoutScheme = hostUri.replace(/^https?:\/\//, '');

  if (withoutScheme.startsWith('[')) {
    const close = withoutScheme.indexOf(']');
    if (close !== -1) return withoutScheme.slice(1, close) || null;
    return withoutScheme.slice(1) || null;
  }

  return withoutScheme.split(':')[0] || null;
}

const DEV_HOST = resolveDevHost();

// In dev, `localhost` in .env points at the phone itself when running on a
// physical device (or an Android emulator). Rewrite localhost/127.0.0.1 URLs
// to the dev machine's LAN IP, auto-detected from Expo's hostUri.
function resolveServiceUrl(envUrl: string | undefined, port: number): string {
  if (envUrl) {
    if (DEV_HOST && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(envUrl)) {
      return envUrl.replace(/localhost|127\.0\.0\.1/, DEV_HOST);
    }
    return envUrl;
  }
  return DEV_HOST
    ? `http://${DEV_HOST}:${port}/api/v1`
    : `http://localhost:${port}/api/v1`;
}

const IDENTITY_BASE_URL = resolveServiceUrl(process.env.EXPO_PUBLIC_IDENTITY_URL, 8000);
const CORE_BASE_URL = resolveServiceUrl(process.env.EXPO_PUBLIC_CORE_URL, 8001);
export const SEARCH_BASE_URL = resolveServiceUrl(process.env.EXPO_PUBLIC_SEARCH_URL, 8002);

if (__DEV__) {
  console.log('[api] Resolved service URLs:', {
    identity: IDENTITY_BASE_URL,
    core: CORE_BASE_URL,
    search: SEARCH_BASE_URL,
    devHost: DEV_HOST,
  });
}

// ---------- Request timeout (ms) ----------
const REQUEST_TIMEOUT = Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT) || 15000;

// ---------- Common Headers ----------
const NGROK_SKIP_HEADER = process.env.EXPO_PUBLIC_NGROK_SKIP_HEADER || 'true';
const COMMON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(NGROK_SKIP_HEADER === 'true' ? { 'ngrok-skip-browser-warning': 'true' } : {}),
};

// ---------- Common Axios Config ----------
const COMMON_CONFIG = {
  headers: COMMON_HEADERS,
  timeout: REQUEST_TIMEOUT,
};

// ---------- Identity Service Client (Auth) ----------
export const identityClient = axios.create({
  baseURL: IDENTITY_BASE_URL,
  ...COMMON_CONFIG,
});

// ---------- Core Service Client (WMS/Inventory) ----------
export const coreClient = axios.create({
  baseURL: CORE_BASE_URL,
  ...COMMON_CONFIG,
});

// ---------- Token Keys ----------
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// ---------- Auth State Reset Callback ----------
// Allows client.ts to notify the auth store when tokens are cleared
let onTokensCleared: (() => void) | null = null;

export function setOnTokensCleared(callback: (() => void) | null): void {
  onTokensCleared = callback;
}

// ---------- Token Helpers (SecureStore with AsyncStorage fallback) ----------
// SecureStore fails on Android devices without a lock screen (PIN/pattern/password).
// We fall back to AsyncStorage in that case so the app still functions.

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // SecureStore unavailable (e.g., Android without lock screen) — fallback to AsyncStorage
    return AsyncStorage.getItem(key);
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

export async function getAccessToken(): Promise<string | null> {
  return secureGet(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return secureGet(REFRESH_TOKEN_KEY);
}

export async function saveTokens(accessToken: string, refreshToken?: string): Promise<void> {
  await secureSet(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    await secureSet(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearTokens(): Promise<void> {
  await secureDelete(ACCESS_TOKEN_KEY);
  await secureDelete(REFRESH_TOKEN_KEY);
  // Notify auth store so it can reset isAuthenticated
  if (onTokensCleared) {
    onTokensCleared();
  }
}

// ---------- Endpoints that authenticate the user ----------
// A 401 from a login endpoint means "the credentials just supplied are wrong",
// NOT "the session expired". Refreshing here would silently retry the login via
// coreClient and mask the real error, so these reject immediately instead.
const LOGIN_ENDPOINTS = [
  '/identity/login',
  '/identity/login/qr-code',
  '/wms-workers/login/barcode',
];

// Endpoints that do not require an Authorization header.
// Logout authenticates via the refresh_token in the request body, not Bearer.
const PUBLIC_ENDPOINTS = [...LOGIN_ENDPOINTS, '/identity/refresh', '/identity/logout'];

function isLoginRequest(url?: string): boolean {
  return !!url && LOGIN_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

// ---------- Response Interceptor — Auto-refresh on 401 ----------
let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

async function handle401(error: AxiosError) {
  // Only intercept 401 Unauthorized errors — don't retry timeouts, network errors, etc.
  if (error.response?.status !== 401) {
    return Promise.reject(error);
  }

  const originalRequest = error.config as InternalAxiosRequestConfig & {
    _retry?: boolean;
    _refreshed?: boolean;
  };

  // Already retried with a fresh token — give up, the token is being rejected
  if (originalRequest._refreshed) {
    return Promise.reject(error);
  }

  // Already in the retry queue — give up
  if (originalRequest._retry) {
    return Promise.reject(error);
  }

  // If the failing request IS the refresh endpoint itself, don't try to refresh again
  if (originalRequest.url?.includes('/identity/refresh')) {
    await clearTokens();
    return Promise.reject(error);
  }

  // Login endpoints: a failed sign-in must never refresh tokens, clear tokens,
  // or retry the request. Reject as-is so the UI can show the backend message.
  if (isLoginRequest(originalRequest.url)) {
    return Promise.reject(error);
  }

  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    })
      .then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return coreClient.request(originalRequest);
      })
      .catch((err) => Promise.reject(err));
  }

  originalRequest._retry = true;
  isRefreshing = true;

  try {
    const storedRefreshToken = await getRefreshToken();
    if (!storedRefreshToken) {
      // No refresh token (barcode/QR worker login) — clear and reject silently
      await clearTokens();
      return Promise.reject(error);
    }

    const { data } = await identityClient.post('/identity/refresh', {
      refresh_token: storedRefreshToken,
    });

    await saveTokens(data.access_token);
    processQueue(null, data.access_token);

    // Retry the original request with the new token.
    // Mark _refreshed so if this retry also gets 401, we reject immediately
    // instead of deadlocking in the isRefreshing queue.
    const retryConfig = {
      ...originalRequest,
      _refreshed: true,
    } as InternalAxiosRequestConfig & { _retry?: boolean; _refreshed?: boolean };
    delete retryConfig._retry;
    retryConfig.headers.Authorization = `Bearer ${data.access_token}`;
    return coreClient.request(retryConfig);
  } catch (refreshError) {
    processQueue(refreshError, null);
    await clearTokens();
    return Promise.reject(refreshError);
  } finally {
    isRefreshing = false;
  }
}

// ---------- Register Interceptors ----------
// Log failed requests in dev, then auto-refresh on 401
function responseErrorHandler(error: AxiosError) {
  if (__DEV__) {
    console.warn(
      `[api] ${error.config?.method?.toUpperCase() ?? 'GET'} ${error.config?.url ?? ''
      } failed`,
      {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      }
    );
  }
  return handle401(error);
}

coreClient.interceptors.response.use((res) => res, responseErrorHandler);
identityClient.interceptors.response.use((res) => res, responseErrorHandler);

// Request: attach JWT token to authenticated requests
async function authRequestInterceptor(
  config: InternalAxiosRequestConfig
): Promise<InternalAxiosRequestConfig> {
  if (config.url && PUBLIC_ENDPOINTS.some((ep) => config.url!.includes(ep))) {
    return config;
  }
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

coreClient.interceptors.request.use(authRequestInterceptor);
identityClient.interceptors.request.use(authRequestInterceptor);

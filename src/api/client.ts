// ============================================================
// API Client — Axios instance with JWT interceptors
// ============================================================
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Base URLs — ngrok tunnel to local dev server
const NGROK_HOST = 'https://2a3a-2401-4900-94e3-744a-d8ac-209f-616-27e5.ngrok-free.app';
const IDENTITY_BASE_URL = `${NGROK_HOST}/api/v1`;
const CORE_BASE_URL = `${NGROK_HOST}/api/v1`;

// ---------- Common Headers (ngrok bypass for free tier) ----------
const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true', // Bypass ngrok free-tier interstitial page
};

// ---------- Common Axios Config ----------
const COMMON_CONFIG = {
  headers: COMMON_HEADERS,
  timeout: 15000, // 15-second timeout to prevent hanging requests
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

// ---------- Response Interceptor — Auto-refresh on 401 ----------
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

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

  const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

  // Already retried — give up
  if (originalRequest._retry) {
    return Promise.reject(error);
  }

  // If the failing request IS the refresh endpoint itself, don't try to refresh again
  if (originalRequest.url?.includes('/identity/refresh')) {
    await clearTokens();
    return Promise.reject(error);
  }

  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    })
      .then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return axios(originalRequest);
      })
      .catch((err) => Promise.reject(err));
  }

  originalRequest._retry = true;
  isRefreshing = true;

  try {
    const storedRefreshToken = await getRefreshToken();
    if (!storedRefreshToken) {
      throw new Error('No refresh token');
    }

    const { data } = await identityClient.post('/identity/refresh', {
      refresh_token: storedRefreshToken,
    });

    await saveTokens(data.access_token);
    processQueue(null, data.access_token);
    originalRequest.headers.Authorization = `Bearer ${data.access_token}`;

    // Create a fresh config without the _retry flag
    const retryConfig = { ...originalRequest } as InternalAxiosRequestConfig & { _retry?: boolean };
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
// Response: auto-refresh on 401
coreClient.interceptors.response.use((res) => res, handle401);
identityClient.interceptors.response.use((res) => res, handle401);

// Request: attach JWT token to authenticated requests
const PUBLIC_ENDPOINTS = ['/identity/login', '/identity/refresh', '/wms-workers/login/barcode'];

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

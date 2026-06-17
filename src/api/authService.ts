// ============================================================
// Auth Service — Login, QR Login, Token Refresh, Warehouses
// ============================================================
import { identityClient, coreClient, saveTokens, clearTokens } from './client';
import type {
  LoginRequest,
  LoginResponse,
  BarcodeLoginRequest,
  WorkerLoginResponse,
  Warehouse,
} from '../types';

// ---------- Username/Password Login ----------
export async function loginWithPassword(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await identityClient.post<LoginResponse>('/identity/login', payload);
  await saveTokens(data.access_token, data.refresh_token);
  return data;
}

// ---------- QR / Barcode Login (Worker) ----------
export async function loginWithBarcode(payload: BarcodeLoginRequest): Promise<WorkerLoginResponse> {
  const { data } = await coreClient.post<WorkerLoginResponse>(
    '/wms-workers/login/barcode',
    payload
  );
  // Barcode login returns only access_token (24h), no refresh token
  await saveTokens(data.access_token);
  return data;
}

// ---------- Token Refresh ----------
export async function refreshToken(): Promise<string> {
  const { data } = await identityClient.post<{ access_token: string }>('/identity/refresh');
  await saveTokens(data.access_token);
  return data.access_token;
}

// ---------- Logout ----------
export async function logout(): Promise<void> {
  try {
    await identityClient.post('/identity/logout');
  } catch {
    // Ignore logout errors — clear local tokens regardless
  }
  await clearTokens();
}

// ---------- Get My Warehouses ----------
export async function getMyWarehouses(): Promise<Warehouse[]> {
  const { data } = await coreClient.get<{ warehouses: Warehouse[] }>(
    '/warehouse-users/my-warehouses'
  );
  return data.warehouses;
}

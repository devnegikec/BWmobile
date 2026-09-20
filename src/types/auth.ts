// ============================================================
// Auth & warehouse types
// ============================================================

// ---------- Auth ----------
export interface LoginRequest {
  email: string;
  password: string;
  remember_me?: boolean;
  device_info?: {
    device_name: string;
    os: string;
    app_version: string;
  };
}

export interface BarcodeLoginRequest {
  barcode: string;
}

export interface QRLoginRequest {
  qr_code: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  user_type: string;
  organization_id: string;
  is_active: boolean;
  email_verified: boolean;
  /**
   * Permission codes granted to this account (e.g. `return.read`).
   * ⚠ optional: the returns MVP (`R-10` / `X-02`) adds the `return.*` codes and
   * the token payload may not carry them yet. Callers MUST treat `undefined`
   * as "not yet known" rather than "denied" — see `src/utils/permissions.ts`.
   */
  permissions?: string[];
}

export interface LoginResponse extends TokenResponse {
  user: User;
}

export interface QRLoginResponse extends TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface Worker {
  id: string;
  organization_id: string;
  warehouse_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  employee_id: string;
  role: string;
  status: string;
  barcode: string;
  last_login_at: string;
  created_at: string;
  /** See `User.permissions` — `undefined` means "not yet known". */
  permissions?: string[];
}

export interface WorkerLoginResponse extends TokenResponse {
  worker: Worker;
}

// ---------- Warehouse ----------
export interface Warehouse {
  id: string;
  name: string;
  code: string;
  city: string;
  type: string;
  is_default: boolean;
}

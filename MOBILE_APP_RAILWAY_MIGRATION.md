# Mobile App: Gateway → Railway Direct Migration Guide

## Overview

The mobile app previously used a single API Gateway (`https://horizon.ciphercode.ai/api/v1`) that routed all requests to backend services. We are now bypassing the gateway and calling Railway-deployed microservices directly.

### Before (Gateway)
```
https://horizon.ciphercode.ai/api/v1/identity/login
https://horizon.ciphercode.ai/api/v1/core/organizations
https://horizon.ciphercode.ai/api/v1/search/...
```
All traffic went through ONE domain — the gateway routed to the correct backend.

### After (Railway Direct)
```
https://identity-service-production-a1eb.up.railway.app/api/v1/identity/login
https://core-service-production-66e9.up.railway.app/api/v1/organizations
https://420a-2401-4900-619a-4bf0-89c0-e9f1-13b8-73fc.ngrok-free.app/api/v1/search/...
```
Each service has its own Railway URL. The mobile app must call the correct service directly.

---

## Step 1: Update `.env` / Configuration

Use the provided `.env.mobile` file. In your mobile app (React Native / Flutter / etc.), replace the old single base URL with the three service URLs:

```env
# OLD (Gateway)
API_BASE_URL=https://horizon.ciphercode.ai/api/v1

# NEW (Railway Direct)
API_IDENTITY_URL=https://identity-service-production-a1eb.up.railway.app
API_CORE_URL=https://core-service-production-66e9.up.railway.app
API_SEARCH_URL=https://420a-2401-4900-619a-4bf0-89c0-e9f1-13b8-73fc.ngrok-free.app
```

---

## Step 2: Update API Client / Service Layer

Wherever your mobile app constructs API URLs, update the routing logic:

### Pseudocode Example (React Native / TypeScript)

```typescript
// OLD: Single gateway
const API_BASE = 'https://horizon.ciphercode.ai/api/v1';

// NEW: Service-specific URLs
const IDENTITY_URL = 'https://identity-service-production-a1eb.up.railway.app/api/v1';
const CORE_URL = 'https://core-service-production-66e9.up.railway.app/api/v1';
const SEARCH_URL = 'https://420a-2401-4900-619a-4bf0-89c0-e9f1-13b8-73fc.ngrok-free.app/api/v1';

// Helper to pick the right base URL
function getBaseUrl(endpoint: string): string {
  if (endpoint.startsWith('/identity/')) return IDENTITY_URL;
  if (endpoint.startsWith('/search/')) return SEARCH_URL;
  // All other endpoints go to core
  return CORE_URL;
}

// Usage
async function apiCall<T>(endpoint: string, options: RequestInit): Promise<T> {
  const baseUrl = getBaseUrl(endpoint);
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Login
const loginResponse = await apiCall('/identity/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});

// Get organizations
const orgs = await apiCall('/organizations', { method: 'GET' });
```

---

## Step 3: Auth Token Handling

### Token Storage
- **access_token**: Store in secure storage (Keychain on iOS, EncryptedSharedPreferences on Android). NEVER in AsyncStorage or localStorage.
- **refresh_token**: Store in secure storage alongside access_token.

### Token Refresh Flow
```
POST https://identity-service-production-a1eb.up.railway.app/api/v1/identity/refresh
Body: { "refresh_token": "<stored_refresh_token>" }
Response: { "access_token": "<new_token>", "refresh_token": "<new_refresh_token>" }
```

### Authorization Header
All authenticated requests to Core and Search services must include:
```
Authorization: Bearer <access_token>
```

---

## Step 4: CORS Notes

Unlike web browsers, mobile apps (native HTTP clients) do NOT enforce CORS. So the CORS issues you see in the browser will NOT affect the mobile app. The mobile app should work immediately with the Railway URLs.

---

## Step 5: ngrok Search Service (Temporary)

The search service is currently on ngrok free tier. The ngrok URL changes each time the tunnel restarts. For mobile:

- **Short term**: Use the current ngrok URL. Add the header `ngrok-skip-browser-warning: true` to bypass the ngrok interstitial page.
- **Long term**: Deploy the search service to Railway and update `API_SEARCH_URL`.

```typescript
// ngrok workaround for mobile
headers: {
  'ngrok-skip-browser-warning': 'true',
}
```

---

## Step 6: Testing with curl (Verify Before App Build)

```bash
# Test Identity Service
curl -X POST https://identity-service-production-a1eb.up.railway.app/api/v1/identity/login \
  -H "Content-Type: application/json" \
  -d '{"email":"devnegikec@gmail.com","password":"Test@123"}'

# Test Core Service (with auth token)
curl https://core-service-production-66e9.up.railway.app/api/v1/organizations \
  -H "Authorization: Bearer <access_token>"

# Test Search Service (with auth token)
curl "https://420a-2401-4900-619a-4bf0-89c0-e9f1-13b8-73fc.ngrok-free.app/api/v1/search/..." \
  -H "Authorization: Bearer <access_token>" \
  -H "ngrok-skip-browser-warning: true"
```

---

## Quick Reference: All Endpoints

| Service | Railway URL |
|---------|------------|
| **Identity** | `https://identity-service-production-a1eb.up.railway.app/api/v1` |
| **Core** | `https://core-service-production-66e9.up.railway.app/api/v1` |
| **Search** | `https://420a-2401-4900-619a-4bf0-89c0-e9f1-13b8-73fc.ngrok-free.app/api/v1` |

| Action | Method | Endpoint | Service |
|--------|--------|----------|---------|
| Login | POST | `/identity/login` | Identity |
| Register | POST | `/identity/register` | Identity |
| Refresh Token | POST | `/identity/refresh` | Identity |
| Logout | POST | `/identity/logout` | Identity |
| Forgot Password | POST | `/identity/forgot-password` | Identity |
| Reset Password | POST | `/identity/reset-password` | Identity |
| QR Code Login | POST | `/identity/login/qr-code` | Identity |
| Validate Invitation | GET | `/identity/invitations/validate/{token}` | Identity |
| Accept Invitation | POST | `/identity/invitations/accept` | Identity |
| Get Organizations | GET | `/organizations` | Core |
| Inventory CRUD | * | `/inventory/...` | Core |
| Suppliers | * | `/suppliers/...` | Core |
| Warehouses | * | `/warehouses/...` | Core |
| Purchase Orders | * | `/purchase-orders/...` | Core |
| Sourcing / RFQ | * | `/sourcing/...` | Core |
| Search | GET | `/search/...` | Search |

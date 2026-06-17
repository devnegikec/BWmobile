# Horizon Sync — Mobile App API Reference & Development Guide

> **Version**: 1.0
> **Date**: 2026-06-15
> **Base URLs**:
> - Identity Service (Auth): `http://<host>:8001/api/v1`
> - Core Service (WMS/Inventory): `http://<host>:8000/api/v1`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack Recommendations](#2-technology-stack-recommendations)
3. [Authentication & Login](#3-authentication--login)
4. [Inbound Process (Receiving)](#4-inbound-process-receiving)
5. [Receiving Slip Management](#5-receiving-slip-management)
6. [Put-Away Process](#6-put-away-process)
7. [Pick List Process](#7-pick-list-process)
8. [Worker Task Management](#8-worker-task-management)
9. [Stock Movement (Within Warehouse)](#9-stock-movement-within-warehouse)
10. [Stock Audit (Reconciliation)](#10-stock-audit-reconciliation)
11. [Supporting APIs](#11-supporting-apis)
12. [Mobile App Screen Flow](#12-mobile-app-screen-flow)
13. [Error Handling](#13-error-handling)

---

## 1. Architecture Overview

```
┌──────────────────────┐       HTTPS (JWT Bearer)       ┌──────────────────────┐
│   Mobile App         │ ──────────────────────────────▶ │   NGINX Gateway      │
│   (React Native /    │                                 │   (Reverse Proxy)    │
│    Flutter)          │                                 └──────────┬───────────┘
└──────────────────────┘                                            │
                                                         ┌──────────┴───────────┐
                                                         │                      │
                                                  ┌──────▼──────┐      ┌──────▼──────┐
                                                  │  Identity   │      │    Core     │
                                                  │  Service    │      │  Service   │
                                                  │  :8001      │      │  :8000     │
                                                  │  Auth/Users │      │  WMS/Inv   │
                                                  └─────────────┘      └─────────────┘
```

### Authentication Flow

1. **Username/Password Login**: Mobile app calls Identity Service `/identity/login` → receives JWT `access_token` + `refresh_token`.
2. **QR/Barcode Login**: Mobile app scans worker barcode → calls Core Service `/wms-workers/login/barcode` → receives JWT `access_token` (valid 24 hours).
3. All subsequent API calls include the token as `Authorization: Bearer <token>` header.

### Token Expiry

| Login Method | Access Token TTL | Refresh Token TTL |
|---|---|---|
| Username/Password | 3 days (default) / 30 days (remember_me) | 7 days / 90 days |
| Barcode/QR Scan | 24 hours | N/A |

---

## 2. Technology Stack Recommendations

| Layer | Recommendation |
|---|---|
| **Framework** | React Native (Expo) or Flutter |
| **QR/Barcode Scanner** | `react-native-camera` / `expo-barcode-scanner` (RN) or `mobile_scanner` (Flutter) |
| **HTTP Client** | Axios / Fetch with interceptor for JWT refresh |
| **State Management** | Zustand / Redux Toolkit (RN) or Riverpod / Bloc (Flutter) |
| **Offline Support** | SQLite (local cache) + background sync |
| **Push Notifications** | Firebase Cloud Messaging (FCM) |
| **Navigation** | React Navigation (RN) or GoRouter (Flutter) |

### HTTP Client Setup (Pseudocode)

```typescript
// api-client.ts
const apiClient = axios.create({
  baseURL: 'https://your-server.com/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token
apiClient.interceptors.request.use((config) => {
  const token = await SecureStore.get('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = await SecureStore.get('refresh_token');
      const { data } = await axios.post('/identity/refresh', { refresh_token: refreshToken });
      await SecureStore.set('access_token', data.access_token);
      error.config.headers.Authorization = `Bearer ${data.access_token}`;
      return axios(error.config);
    }
    return Promise.reject(error);
  }
);
```

---

## 3. Authentication & Login

### 3.1 Username/Password Login

**Endpoint**: `POST /identity/login` (Identity Service)

**Request**:
```json
{
  "email": "worker@example.com",
  "password": "securePassword123!",
  "remember_me": true,
  "device_info": {
    "device_name": "iPhone 15",
    "os": "iOS 18.0",
    "app_version": "1.0.0"
  }
}
```

**Response** `200`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 2592000,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "worker@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "display_name": "John D.",
    "user_type": "user",
    "organization_id": "660e8400-e29b-41d4-a716-446655440001",
    "is_active": true,
    "email_verified": true
  }
}
```

**Error Responses**:

| Status | Meaning |
|---|---|
| `400` | Invalid credentials |
| `403` | Account locked (too many failed attempts) |

---

### 3.2 QR Code / Barcode Login (Worker)

> **Note**: Currently the backend uses "barcode" — you can convert the existing barcode to QR codes. The login mechanism is identical: the worker scans the QR/barcode and the backend authenticates it.

**Endpoint**: `POST /wms-workers/login/barcode` (Core Service)
**Auth**: None (public endpoint)

**Request**:
```json
{
  "barcode": "WH-2024-A1B2C3D4"
}
```

**Response** `200`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 86400,
  "worker": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "organization_id": "660e8400-e29b-41d4-a716-446655440001",
    "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
    "first_name": "Jane",
    "last_name": "Smith",
    "display_name": "Jane S.",
    "employee_id": "EMP-001",
    "role": "warehouse_worker",
    "status": "active",
    "barcode": "WH-2024-A1B2C3D4",
    "last_login_at": "2026-06-15T08:30:00Z",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

**Error Responses**:

| Status | Meaning |
|---|---|
| `401` | Invalid barcode or worker inactive |

---

### 3.3 Token Refresh

**Endpoint**: `POST /identity/refresh` (Identity Service)

**Request**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

---

### 3.4 Get My Warehouses

After login, call this to know which warehouses the worker has access to.

**Endpoint**: `GET /warehouse-users/my-warehouses` (Core Service)
**Auth**: `warehouse.read`

**Response** `200`:
```json
{
  "warehouses": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Main Warehouse",
      "code": "WH-MAIN",
      "city": "Mumbai",
      "type": "warehouse",
      "is_default": true
    }
  ]
}
```

---

## 4. Inbound Process (Receiving)

The inbound workflow consists of:
1. **Start a scan session** → open a session at a dock
2. **Scan QR codes** of incoming items → record each scan
3. **View session summary** → see what's been scanned
4. **End session** → generates a receiving slip automatically

### 4.1 Start Scan Session

**Endpoint**: `POST /inbound/sessions`
**Auth**: `warehouse.create`

**Request**:
```json
{
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "dock_location": "Dock-A-12"
}
```

**Response** `201`:
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "organization_id": "660e8400-e29b-41d4-a716-446655440001",
  "session_type": "inbound",
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "dock_location": "Dock-A-12",
  "status": "OPEN",
  "total_boxes_scanned": 0,
  "started_at": "2026-06-15T08:35:00Z",
  "created_at": "2026-06-15T08:35:00Z"
}
```

---

### 4.2 Record QR Scan

**Endpoint**: `POST /inbound/sessions/{session_id}/scan`
**Auth**: `warehouse.create`

**Request**:
```json
{
  "qr_data": "{\"sku\":\"SKU-12345\",\"batch\":\"B-2026-001\",\"qty\":10,\"serial\":\"SN-ABC123\"}",
  "device_type": "mobile",
  "os": "iOS 18.0"
}
```

> **QR Payload Format**: The `qr_data` field expects a JSON string. The backend decodes it and extracts `sku`, `batch_number`, `quantity` etc.

**Response** `201`:
```json
{
  "scan_item_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "session_id": "990e8400-e29b-41d4-a716-446655440004",
  "qr_identifier": "SN-ABC123",
  "sku": "SKU-12345",
  "raw_quantity": 10,
  "batch_number": "B-2026-001",
  "packaging_unit_id": null,
  "scanned_at": "2026-06-15T08:36:00Z",
  "total_boxes_scanned": 5
}
```

**Error Responses**:

| Status | Meaning |
|---|---|
| `400` | Duplicate scan detected |
| `404` | Session not found or not OPEN |

---

### 4.3 Get Session Summary

**Endpoint**: `GET /inbound/sessions/{session_id}/summary`
**Auth**: `warehouse.read`

**Response** `200`:
```json
{
  "session_id": "990e8400-e29b-41d4-a716-446655440004",
  "status": "OPEN",
  "session_type": "inbound",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "dock_location": "Dock-A-12",
  "started_at": "2026-06-15T08:35:00Z",
  "total_boxes": 25,
  "total_quantity": 250,
  "items": [
    {
      "sku": "SKU-12345",
      "total_quantity": 100,
      "total_boxes": 10,
      "batches": [
        { "batch_number": "B-2026-001", "quantity": 60, "box_count": 6 },
        { "batch_number": "B-2026-002", "quantity": 40, "box_count": 4 }
      ]
    }
  ]
}
```

---

### 4.4 End Session (Generate Receiving Slip)

**Endpoint**: `POST /inbound/sessions/{session_id}/end`
**Auth**: `warehouse.create`

**Response** `200`:
```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "organization_id": "660e8400-e29b-41d4-a716-446655440001",
  "slip_number": "RS-2026-00042",
  "session_id": "990e8400-e29b-41d4-a716-446655440004",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "status": "pending_review",
  "created_at": "2026-06-15T08:40:00Z",
  "items": [
    {
      "id": "cc0e8400-e29b-41d4-a716-446655440007",
      "sku": "SKU-12345",
      "batch_number": "B-2026-001",
      "quantity": 60,
      "box_count": 6,
      "flag": "ok",
      "notes": null
    }
  ]
}
```

---

## 5. Receiving Slip Management

### 5.1 List Receiving Slips

**Endpoint**: `GET /inbound/receiving-slips`
**Auth**: `warehouse.read`

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `warehouse_id` | UUID | No | Filter by warehouse |
| `session_id` | UUID | No | Filter by scan session |
| `status` | string | No | `pending_review`, `pending_putaway`, `putaway_complete`, `rejected` |
| `page` | int | No | Default: 1 |
| `page_size` | int | No | Default: 20, max: 100 |

**Response** `200`:
```json
{
  "receiving_slips": [
    {
      "id": "bb0e8400-e29b-41d4-a716-446655440006",
      "slip_number": "RS-2026-00042",
      "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
      "status": "pending_review",
      "created_at": "2026-06-15T08:40:00Z",
      "items": [...]
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 42,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  }
}
```

---

### 5.2 Get Receiving Slip Detail

**Endpoint**: `GET /inbound/receiving-slips/{slip_id}`
**Auth**: `warehouse.read`

---

### 5.3 Approve Receiving Slip (Triggers Put-Away Generation)

**Endpoint**: `POST /inbound/receiving-slips/{slip_id}/approve`
**Auth**: `warehouse.update`

**Request** (optional):
```json
{
  "worker_id": "770e8400-e29b-41d4-a716-446655440002"
}
```

**Response** `200`: Updated receiving slip with status `pending_putaway`.

---

### 5.4 Reject Receiving Slip

**Endpoint**: `POST /inbound/receiving-slips/{slip_id}/reject`
**Auth**: `warehouse.update`

**Request**:
```json
{
  "reason": "Damaged packaging on 3 boxes"
}
```

---

### 5.5 Flag Line Item (Short/Damaged)

**Endpoint**: `POST /inbound/receiving-slips/{slip_id}/items/{item_id}/flag`
**Auth**: `warehouse.update`

**Request**:
```json
{
  "flag": "damaged",
  "notes": "Box crushed on corner"
}
```

> `flag` values: `"short"` or `"damaged"`

---

## 6. Put-Away Process

### 6.1 Generate Put-Away List from Receiving Slip

> **Note**: This is also triggered automatically when you approve a receiving slip. You can call this explicitly if needed.

**Endpoint**: `POST /put-away/generate-from-slip/{slip_id}`
**Auth**: `warehouse.create`

**Request** (optional):
```json
{
  "worker_id": "770e8400-e29b-41d4-a716-446655440002"
}
```

**Response** `201`:
```json
{
  "id": "dd0e8400-e29b-41d4-a716-446655440008",
  "organization_id": "660e8400-e29b-41d4-a716-446655440001",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "put_away_list_no": "PAL-2026-00018",
  "status": "pending",
  "reference_type": "receiving_slip",
  "reference_id": "bb0e8400-e29b-41d4-a716-446655440006",
  "receiving_slip_id": "bb0e8400-e29b-41d4-a716-446655440006",
  "assigned_to": "770e8400-e29b-41d4-a716-446655440002",
  "warnings": ["Bin Z01-A03-B02 is 85% full"],
  "created_at": "2026-06-15T08:42:00Z",
  "items": [
    {
      "id": "ee0e8400-e29b-41d4-a716-446655440009",
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "sku": "SKU-12345",
      "batch_number": "B-2026-001",
      "quantity": 60.0,
      "bin_location_id": "gg0e8400-e29b-41d4-a716-446655440011",
      "bin_location_code": "Z01-A03-B02-L04",
      "sort_order": 1,
      "status": "pending"
    }
  ]
}
```

---

### 6.2 List Put-Away Lists

**Endpoint**: `GET /put-away`
**Auth**: `warehouse.read`

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `warehouse_id` | UUID | No | Filter by warehouse |
| `status` | string | No | `pending`, `completed` |
| `page` | int | No | Default: 1 |
| `page_size` | int | No | Default: 20, max: 100 |

**Response** `200`:
```json
{
  "put_away_lists": [
    {
      "id": "dd0e8400-e29b-41d4-a716-446655440008",
      "put_away_list_no": "PAL-2026-00018",
      "status": "pending",
      "total_items": 5,
      "completed_items": 0,
      "pending_items": 5,
      "assigned_to": "770e8400-e29b-41d4-a716-446655440002"
    }
  ],
  "pagination": { "page": 1, "page_size": 20, "total": 18, "total_pages": 1, "has_next": false, "has_prev": false }
}
```

---

### 6.3 Get Put-Away List Detail

**Endpoint**: `GET /put-away/{put_away_list_id}`
**Auth**: `warehouse.read`

Returns the full put-away list with all items and bin assignments.

---

### 6.4 Complete a Put-Away Item (Put stock into bin)

**Endpoint**: `POST /put-away/{put_away_list_id}/items/{item_id}/complete`
**Auth**: `warehouse.create`

**Request** (optional — override pre-assigned bin):
```json
{
  "bin_id": "hh0e8400-e29b-41d4-a716-446655440012"
}
```

**Response** `200`:
```json
{
  "id": "ee0e8400-e29b-41d4-a716-446655440009",
  "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
  "sku": "SKU-12345",
  "batch_number": "B-2026-001",
  "quantity": 60.0,
  "bin_location_id": "gg0e8400-e29b-41d4-a716-446655440011",
  "bin_location_code": "Z01-A03-B02-L04",
  "sort_order": 1,
  "status": "completed",
  "completed_at": "2026-06-15T08:50:00Z"
}
```

> **Important**: When all items in a put-away list are completed, the put-away list status changes to `completed` and the receiving slip status changes to `putaway_complete`.

---

### 6.5 Skip a Put-Away Item

**Endpoint**: `POST /put-away/{put_away_list_id}/items/{item_id}/skip`
**Auth**: `warehouse.create`

**Request**:
```json
{
  "reason": "Bin full — need supervisor override"
}
```

---

## 7. Pick List Process

### 7.1 Create Pick List

**Endpoint**: `POST /pick-lists`
**Auth**: `pick_list.create`

**Request**:
```json
{
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "status": "draft",
  "pick_date": "2026-06-15T09:00:00Z",
  "reference_type": "sales_order",
  "reference_id": "ii0e8400-e29b-41d4-a716-446655440013",
  "remarks": "Urgent order",
  "items": [
    {
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
      "qty": 10,
      "uom": "pcs",
      "batch_no": "B-2026-001",
      "sort_order": 1
    }
  ]
}
```

**Response** `201`: Full pick list object with `id`, `pick_list_no`, etc.

---

### 7.2 List Pick Lists

**Endpoint**: `GET /pick-lists`
**Auth**: `pick_list.read`

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `warehouse_id` | UUID | No | Filter by warehouse |
| `status` | string | No | `draft`, `in_progress`, `completed`, `cancelled` |
| `page` | int | No | Default: 1 |
| `page_size` | int | No | Default: 20, max: 100 |
| `sort_by` | string | No | Default: `created_at` |
| `sort_order` | string | No | `asc` or `desc` |

**Response** `200`:
```json
{
  "pick_lists": [
    {
      "id": "jj0e8400-e29b-41d4-a716-446655440014",
      "pick_list_no": "PL-2026-00055",
      "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
      "status": "draft",
      "reference_type": "sales_order",
      "sales_order_no": "SO-2026-00123",
      "items_count": 8,
      "created_at": "2026-06-15T09:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### 7.3 Get Pick List Detail

**Endpoint**: `GET /pick-lists/{pick_list_id}`
**Auth**: `pick_list.read`

---

### 7.4 Update Pick List (Status Transitions)

**Endpoint**: `PUT /pick-lists/{pick_list_id}`
**Auth**: `pick_list.update`

**Request** — Start picking:
```json
{
  "status": "in_progress"
}
```

**Request** — Complete picking:
```json
{
  "status": "completed"
}
```

**Request** — Cancel:
```json
{
  "status": "cancelled"
}
```

> **Status Flow**: `draft` → `in_progress` → `completed` (or `cancelled` at any point)

---

### 7.5 Delete Pick List

**Endpoint**: `DELETE /pick-lists/{pick_list_id}`
**Auth**: `pick_list.update`

---

## 7.6 Smart Picking (Sales Order → Pick List)

**3-step workflow for sales order fulfillment:**

#### Step 1: Suggest Allocation

**Endpoint**: `GET /smart-picking/suggest-allocation/{sales_order_id}`
**Auth**: `pick_list.read`

Returns which warehouses have stock for each SO line item.

#### Step 2: Create Pick List from Allocations

**Endpoint**: `POST /smart-picking/create`
**Auth**: `pick_list.create`

**Request**:
```json
{
  "sales_order_id": "ii0e8400-e29b-41d4-a716-446655440013",
  "remarks": "Priority order",
  "allocations": [
    {
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
      "qty": 10,
      "uom": "pcs"
    }
  ]
}
```

#### Step 3 (Optional): Convert Pick List to Delivery Note

**Endpoint**: `POST /smart-picking/delivery-from-pick-list`
**Auth**: `delivery_note.create`

---

## 8. Worker Task Management

Worker tasks track the assignment and progress of put-away and pick operations.

### 8.1 Create Worker Task

**Endpoint**: `POST /worker-tasks`
**Auth**: `pick_list.create`

**Request**:
```json
{
  "task_type": "put_away",
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "reference_id": "dd0e8400-e29b-41d4-a716-446655440008"
}
```

> `task_type`: `"put_away"` or `"pick"`
> `reference_id`: UUID of the `put_away_list` or `pick_list`

**Response** `201`:
```json
{
  "id": "kk0e8400-e29b-41d4-a716-446655440015",
  "organization_id": "660e8400-e29b-41d4-a716-446655440001",
  "task_type": "put_away",
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "reference_id": "dd0e8400-e29b-41d4-a716-446655440008",
  "status": "assigned",
  "assigned_at": "2026-06-15T08:42:00Z"
}
```

---

### 8.2 List Worker Tasks

**Endpoint**: `GET /worker-tasks`
**Auth**: `pick_list.read`

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `worker_id` | UUID | **Yes** | Worker to list tasks for |
| `status` | string | No | `assigned`, `in_progress`, `completed`, `cancelled` |
| `date_from` | datetime | No | Filter from date |
| `date_to` | datetime | No | Filter to date |
| `page` | int | No | Default: 1 |
| `page_size` | int | No | Default: 20, max: 100 |

---

### 8.3 Get Task Detail

**Endpoint**: `GET /worker-tasks/{task_id}`
**Auth**: `pick_list.read`

---

### 8.4 Start Task (assigned → in_progress)

**Endpoint**: `POST /worker-tasks/{task_id}/start`
**Auth**: `pick_list.update`

> Call this when a worker begins working on a put-away or pick task.

**Response** `200`:
```json
{
  "id": "kk0e8400-e29b-41d4-a716-446655440015",
  "status": "in_progress",
  "assigned_at": "2026-06-15T08:42:00Z",
  "started_at": "2026-06-15T08:45:00Z"
}
```

---

### 8.5 Complete Task (in_progress → completed)

**Endpoint**: `POST /worker-tasks/{task_id}/complete`
**Auth**: `pick_list.update`

> Call this when a worker finishes all items in the task.

**Response** `200`:
```json
{
  "id": "kk0e8400-e29b-41d4-a716-446655440015",
  "status": "completed",
  "started_at": "2026-06-15T08:45:00Z",
  "completed_at": "2026-06-15T09:30:00Z"
}
```

---

### 8.6 Cancel Task

**Endpoint**: `POST /worker-tasks/{task_id}/cancel`
**Auth**: `pick_list.update`

---

## 8.7 Location Scans (QR Time Tracking)

Track time spent at each bin location during put-away/pick.

### Record Scan (Start/Finish)

**Endpoint**: `POST /location-scans`
**Auth**: `pick_list.create`

**Request** — Start at a location:
```json
{
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "task_id": "kk0e8400-e29b-41d4-a716-446655440015",
  "location_code": "Z01-A03-B02-L04-B01",
  "scan_type": "start"
}
```

**Request** — Finish at a location:
```json
{
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "task_id": "kk0e8400-e29b-41d4-a716-446655440015",
  "location_code": "Z01-A03-B02-L04-B01",
  "scan_type": "finish"
}
```

**Response** `201`:
```json
{
  "id": "ll0e8400-e29b-41d4-a716-446655440016",
  "organization_id": "660e8400-e29b-41d4-a716-446655440001",
  "worker_task_id": "kk0e8400-e29b-41d4-a716-446655440015",
  "location_code": "Z01-A03-B02-L04-B01",
  "scan_type": "finish",
  "scanned_at": "2026-06-15T08:52:00Z",
  "elapsed_seconds": 420
}
```

### Get Time Summary

**Endpoint**: `GET /location-scans/summary`
**Auth**: `pick_list.read`

**Query Parameters**: `worker_id`, `task_id`, `location_code`, `date_from`, `date_to`

---

## 8.8 Scan Events (Audit Trail)

Record every QR scan for full audit trail.

**Endpoint**: `POST /scan-events`
**Auth**: `pick_list.read`

**Request**:
```json
{
  "worker_id": "770e8400-e29b-41d4-a716-446655440002",
  "scan_context": "pick",
  "serial_number": "SN-ABC123",
  "pick_list_id": "jj0e8400-e29b-41d4-a716-446655440014",
  "decoded_payload": {"sku": "SKU-12345", "batch": "B-2026-001"},
  "device_type": "mobile",
  "os": "iOS 18.0",
  "latitude": 19.0760,
  "longitude": 72.8777
}
```

---

## 9. Stock Movement (Within Warehouse)

### 9.1 Record Stock Movement

**Endpoint**: `POST /stock-movements`
**Auth**: Authenticated user

**Request** — Transfer between bins:
```json
{
  "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "movement_type": "transfer",
  "quantity": 25,
  "reference_type": "manual",
  "notes": "Moved from overstock bin to pick face",
  "performed_at": "2026-06-15T10:00:00Z"
}
```

> `movement_type`: `"in"`, `"out"`, `"transfer"`, `"adjustment"`

**Response** `201`:
```json
{
  "id": "mm0e8400-e29b-41d4-a716-446655440017",
  "organization_id": "660e8400-e29b-41d4-a716-446655440001",
  "product_id": "ff0e8400-e29b-41d4-a716-446655440010",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "movement_type": "transfer",
  "quantity": 25,
  "notes": "Moved from overstock bin to pick face",
  "performed_by": "770e8400-e29b-41d4-a716-446655440002",
  "performed_at": "2026-06-15T10:00:00Z",
  "product": { "name": "Widget A", "code": "SKU-12345" },
  "warehouse": { "name": "Main Warehouse", "code": "WH-MAIN" }
}
```

---

### 9.2 Move Stock Between Bins (Bin-Level)

Use the bin-stock APIs for direct bin-to-bin transfers:

**Copy stock from source bin to target bin**:

**Endpoint**: `POST /bin-stock/copy`
**Auth**: `warehouse.create`

**Request**:
```json
{
  "source_bin_id": "gg0e8400-e29b-41d4-a716-446655440011",
  "target_bin_id": "hh0e8400-e29b-41d4-a716-446655440012",
  "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
  "quantity": 25,
  "batch_number": "B-2026-001"
}
```

**Manually add/remove from bin**:

| Action | Endpoint | Auth |
|---|---|---|
| Add stock to bin | `POST /bin-stock/add` | `warehouse.create` |
| Remove stock from bin | `POST /bin-stock/remove` | `warehouse.create` |

---

### 9.3 List Stock Movements

**Endpoint**: `GET /stock-movements`
**Auth**: Authenticated user

**Query Parameters**:

| Param | Type | Description |
|---|---|---|
| `item_id` | UUID | Filter by item |
| `warehouse_id` | UUID | Filter by warehouse |
| `movement_type` | string | `in`, `out`, `transfer`, `adjustment` |
| `reference_type` | string | Filter by reference type |
| `search` | string | Search by item name, code, or notes |
| `page` | int | Default: 1 |
| `page_size` | int | Default: 20 |

---

### 9.4 Check Stock Levels

**Endpoint**: `GET /stock-levels`
**Auth**: Authenticated user

**Query Parameters**: `item_id`, `warehouse_id`, `search`, `page`, `page_size`

**Get stock for specific item + warehouse**: `GET /stock-levels/by-location?item_id=...&warehouse_id=...`

---

### 9.5 Check Bin Stock

**Get all bins for an item**: `GET /bin-stock/item/{item_id}` (Auth: `warehouse.read`)

**Response**:
```json
{
  "bins": [
    {
      "bin_location_id": "gg0e8400-e29b-41d4-a716-446655440011",
      "bin_code": "Z01-A03-B02-L04-B01",
      "bin_name": "Bay 1 Shelf A",
      "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "quantity_on_hand": 60.0,
      "batch_number": "B-2026-001",
      "bin_capacity": 100.0,
      "available_capacity": 40.0
    }
  ]
}
```

---

## 10. Stock Audit (Reconciliation)

### 10.1 Download CSV Template

**Endpoint**: `GET /stock-reconciliations/template?warehouse_id={warehouse_id}`
**Auth**: Authenticated user

Returns a CSV file pre-populated with current stock levels for the warehouse. The worker fills in `actual_qty` column.

---

### 10.2 Upload Completed CSV (Preview)

**Endpoint**: `POST /stock-reconciliations/upload`
**Auth**: Authenticated user
**Content-Type**: `multipart/form-data`

**Form Fields**:
- `warehouse_id`: UUID
- `file`: CSV file

**Response** `200`:
```json
{
  "reconciliation_id": "nn0e8400-e29b-41d4-a716-446655440018",
  "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
  "status": "draft",
  "discrepancies": [
    {
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "item_code": "SKU-12345",
      "item_name": "Widget A",
      "system_qty": 100,
      "actual_qty": 95,
      "difference": -5,
      "uom": "pcs"
    }
  ],
  "total_items": 150,
  "items_with_discrepancy": 12
}
```

---

### 10.3 Confirm Reconciliation (Commit Adjustments)

**Endpoint**: `POST /stock-reconciliations/{reconciliation_id}/confirm`
**Auth**: Authenticated user

> This commits the adjustments — actual stock levels are updated and audit records are created.

**Response** `200`: Full reconciliation record with status updated.

---

### 10.4 Manual Reconciliation (API-based)

**Create reconciliation**: `POST /stock-reconciliations`
**List reconciliations**: `GET /stock-reconciliations`
**Get detail**: `GET /stock-reconciliations/{rec_id}`
**Update**: `PUT /stock-reconciliations/{rec_id}`

**Create request**:
```json
{
  "purpose": "Monthly cycle count",
  "posting_date": "2026-06-15T00:00:00Z",
  "status": "draft",
  "items": [
    {
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "warehouse_id": "880e8400-e29b-41d4-a716-446655440003",
      "current_qty": 100,
      "qty": 95,
      "qty_difference": -5
    }
  ]
}
```

---

## 11. Supporting APIs

### 11.1 Warehouse Locations (Bins)

| Action | Endpoint | Auth |
|---|---|---|
| List locations | `GET /warehouse-locations` | `warehouse.read` |
| Get location by ID | `GET /warehouse-locations/{id}` | `warehouse.read` |

### 11.2 Items / Products

| Action | Endpoint | Auth |
|---|---|---|
| List items | `GET /items` | Authenticated |
| Search/Picker | `GET /items/picker?search=...` | Authenticated |
| Get item detail | `GET /items/{item_id}` | Authenticated |

### 11.3 WMS Workers

| Action | Endpoint | Auth |
|---|---|---|
| List workers | `GET /wms-workers` | `warehouse.read` |
| Get worker | `GET /wms-workers/{worker_id}` | `warehouse.read` |

### 11.4 WMS Dashboard

**Endpoint**: `GET /wms-dashboard/stats`
**Auth**: `warehouse.read`

**Query Parameters**: `warehouse_id`, `period` (`week`, `month`, `year`)

Returns stats: total stock items, low stock count, out-of-stock count, active workers, stock movement charts.

---

## 12. Mobile App Screen Flow

```
┌──────────────┐
│  Login       │──── Username/Password ────▶ JWT Token
│  Screen      │──── Scan QR/Barcode ──────▶ JWT Token (24h)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Dashboard   │
│  (Warehouse  │
│   Selection) │
└──────┬───────┘
       │
  ┌────┼────────────────────────────────┐
  │    │                                │
  ▼    ▼                                ▼
┌────┐ ┌──────────┐              ┌──────────────┐
│In- │ │Put-Away  │              │Stock Audit   │
│bound│ │Process   │              │(Reconciliation│
│    │ │          │              │)             │
└──┬─┘ └────┬─────┘              └──────┬───────┘
   │        │                           │
   ▼        ▼                           ▼
┌──────────────────────────────────────────────────┐
│              Shared Scanning Screen               │
│  ┌──────────────────────────────────────────┐    │
│  │         Camera View (QR Scanner)          │    │
│  │         ┌─────────────────────┐           │    │
│  │         │                     │           │    │
│  │         │    [QR Code]        │           │    │
│  │         │                     │           │    │
│  │         └─────────────────────┘           │    │
│  └──────────────────────────────────────────┘    │
│  Status: Scanning... | Session: OPEN              │
│  Items scanned: 25 | Boxes: 250                   │
│  [End Session]  [View Summary]                    │
└──────────────────────────────────────────────────┘
```

### Detailed Screen-by-Screen Flow

#### A. Inbound Flow
```
Home → Select "Inbound" → Select Warehouse → Start Session
  → Scan QR codes (each box/item)
  → View Summary (SKU × Qty × Batch)
  → End Session → Receiving Slip Generated
```

#### B. Put-Away Flow
```
Home → Select "Put-Away" → List of Put-Away Lists
  → Select a List → View Items (sorted by bin order)
  → Select Item → Scan bin QR → Confirm Put-Away
  → (or) Skip Item (with reason)
  → All items done → Task Complete
```

#### C. Pick List Flow
```
Home → Select "Pick List" → List of Pick Lists
  → Select a List → Start Task → View Items (sorted)
  → Navigate to Bin → Scan bin QR → Scan item QR → Pick qty
  → Next Item → All done → Complete Task
```

#### D. Stock Movement Flow
```
Home → Select "Move Stock" → Scan source bin QR
  → Select item → Enter qty → Scan destination bin QR
  → Confirm → Movement Recorded
```

#### E. Stock Audit Flow
```
Home → Select "Audit" → Select Warehouse
  → Download Template (optional: if using CSV method)
  → Or: Scan each bin QR → Enter actual count → Next
  → Review Discrepancies → Confirm → Audit Complete
```

---

## 13. Error Handling

### Standard Error Response Format

```json
{
  "detail": "Human-readable error message"
}
```

### Common HTTP Status Codes

| Status | Meaning | Action |
|---|---|---|
| `200` | Success | — |
| `201` | Created | — |
| `204` | Deleted (no body) | — |
| `400` | Bad Request | Check request payload |
| `401` | Unauthorized | Refresh token or re-login |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate detected |
| `422` | Validation Error | Invalid field values |

### Mobile App Error Handling Strategy

```typescript
// Global error handler
function handleApiError(error: AxiosError) {
  switch (error.response?.status) {
    case 401:
      // Attempt token refresh; if fails, redirect to login
      await refreshToken();
      break;
    case 403:
      showToast("You don't have permission for this action");
      break;
    case 404:
      showToast("Resource not found");
      break;
    case 409:
      // Duplicate scan — show warning, allow continue
      showToast("This item was already scanned");
      break;
    case 422:
      // Show field-level validation errors
      showValidationErrors(error.response.data);
      break;
    default:
      showToast("Something went wrong. Please try again.");
  }
}
```

---

## Appendix A: Permission Reference

| Feature | Required Permission |
|---|---|
| Start/end scan session, record scans | `warehouse.create` |
| View sessions, receiving slips, put-away lists | `warehouse.read` |
| Approve/reject slips, flag items | `warehouse.update` |
| Create pick lists, worker tasks | `pick_list.create` |
| View pick lists, worker tasks | `pick_list.read` |
| Update pick lists, start/complete tasks | `pick_list.update` |
| Stock movements, stock levels | Authenticated user (any) |
| Bin stock add/remove/copy | `warehouse.create` |
| Stock reconciliation | Authenticated user (any) |
| WMS dashboard | `warehouse.read` |

> **Barcode/QR Login**: Workers receive `WMS_WORKER_PERMISSIONS` automatically, which includes `warehouse.create`, `warehouse.read`, `warehouse.update`, `pick_list.create`, `pick_list.read`, `pick_list.update`.

---

## Appendix B: QR Code Formats

### For Inbound Scanning (Item QR)
```json
{
  "sku": "SKU-12345",
  "batch": "B-2026-001",
  "qty": 10,
  "serial": "SN-ABC123"
}
```

### For Bin Location QR
The location code itself (e.g., `Z01-A03-B02-L04-B01`) encoded as a QR code.

### For Worker Login QR
The worker's barcode value (e.g., `WH-2024-A1B2C3D4`) encoded as a QR code. This is the same value stored in the `wms_workers.barcode` column.

---

## Appendix C: Quick Reference — All Endpoints

| # | Method | Endpoint | Auth Required | Feature |
|---|---|---|---|---|
| 1 | `POST` | `/identity/login` | No | Username/password login |
| 2 | `POST` | `/identity/refresh` | No | Refresh access token |
| 3 | `POST` | `/identity/logout` | No | Logout |
| 4 | `POST` | `/wms-workers/login/barcode` | No | QR/barcode login |
| 5 | `GET` | `/warehouse-users/my-warehouses` | `warehouse.read` | Get user's warehouses |
| 6 | `POST` | `/inbound/sessions` | `warehouse.create` | Start inbound session |
| 7 | `POST` | `/inbound/sessions/{id}/scan` | `warehouse.create` | Record QR scan |
| 8 | `GET` | `/inbound/sessions/{id}/summary` | `warehouse.read` | Session summary |
| 9 | `POST` | `/inbound/sessions/{id}/end` | `warehouse.create` | End session → slip |
| 10 | `GET` | `/inbound/receiving-slips` | `warehouse.read` | List receiving slips |
| 11 | `GET` | `/inbound/receiving-slips/{id}` | `warehouse.read` | Get slip detail |
| 12 | `POST` | `/inbound/receiving-slips/{id}/approve` | `warehouse.update` | Approve slip |
| 13 | `POST` | `/inbound/receiving-slips/{id}/reject` | `warehouse.update` | Reject slip |
| 14 | `POST` | `/inbound/receiving-slips/{sid}/items/{iid}/flag` | `warehouse.update` | Flag line item |
| 15 | `POST` | `/put-away/generate-from-slip/{id}` | `warehouse.create` | Generate put-away |
| 16 | `GET` | `/put-away` | `warehouse.read` | List put-away lists |
| 17 | `GET` | `/put-away/{id}` | `warehouse.read` | Get put-away detail |
| 18 | `POST` | `/put-away/{pid}/items/{iid}/complete` | `warehouse.create` | Complete put-away item |
| 19 | `POST` | `/put-away/{pid}/items/{iid}/skip` | `warehouse.create` | Skip put-away item |
| 20 | `POST` | `/pick-lists` | `pick_list.create` | Create pick list |
| 21 | `GET` | `/pick-lists` | `pick_list.read` | List pick lists |
| 22 | `GET` | `/pick-lists/{id}` | `pick_list.read` | Get pick list detail |
| 23 | `PUT` | `/pick-lists/{id}` | `pick_list.update` | Update pick list |
| 24 | `DELETE` | `/pick-lists/{id}` | `pick_list.update` | Delete pick list |
| 25 | `GET` | `/smart-picking/suggest-allocation/{id}` | `pick_list.read` | Suggest allocation |
| 26 | `POST` | `/smart-picking/create` | `pick_list.create` | Create from allocation |
| 27 | `POST` | `/worker-tasks` | `pick_list.create` | Create worker task |
| 28 | `GET` | `/worker-tasks?worker_id=...` | `pick_list.read` | List worker tasks |
| 29 | `GET` | `/worker-tasks/{id}` | `pick_list.read` | Get task detail |
| 30 | `POST` | `/worker-tasks/{id}/start` | `pick_list.update` | Start task |
| 31 | `POST` | `/worker-tasks/{id}/complete` | `pick_list.update` | Complete task |
| 32 | `POST` | `/worker-tasks/{id}/cancel` | `pick_list.update` | Cancel task |
| 33 | `POST` | `/location-scans` | `pick_list.create` | Record location scan |
| 34 | `GET` | `/location-scans/summary` | `pick_list.read` | Time tracking summary |
| 35 | `POST` | `/scan-events` | `pick_list.read` | Record scan event |
| 36 | `GET` | `/scan-events` | `pick_list.read` | Query scan events |
| 37 | `POST` | `/stock-movements` | Authenticated | Record stock movement |
| 38 | `GET` | `/stock-movements` | Authenticated | List stock movements |
| 39 | `POST` | `/bin-stock/copy` | `warehouse.create` | Move stock between bins |
| 40 | `POST` | `/bin-stock/add` | `warehouse.create` | Add stock to bin |
| 41 | `POST` | `/bin-stock/remove` | `warehouse.create` | Remove stock from bin |
| 42 | `GET` | `/bin-stock/item/{id}` | `warehouse.read` | Get bins for item |
| 43 | `GET` | `/stock-levels` | Authenticated | List stock levels |
| 44 | `GET` | `/stock-reconciliations/template` | Authenticated | Download audit template |
| 45 | `POST` | `/stock-reconciliations/upload` | Authenticated | Upload audit CSV |
| 46 | `POST` | `/stock-reconciliations/{id}/confirm` | Authenticated | Confirm audit |
| 47 | `GET` | `/stock-reconciliations` | Authenticated | List reconciliations |
| 48 | `POST` | `/stock-reconciliations` | Authenticated | Create reconciliation |
| 49 | `GET` | `/items/picker?search=...` | Authenticated | Search items |
| 50 | `GET` | `/wms-dashboard/stats` | `warehouse.read` | Dashboard stats |

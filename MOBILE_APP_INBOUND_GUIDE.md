# Mobile App — Inbound (Receiving + Put-Away) Integration Guide

> **Version**: 1.0
> **Date**: 2026-06-20
> **Audience**: Mobile App Developers (React Native / Flutter)
> **Base URL**: `http://<host>:9000/api/v1`

---

## 1. Inbound Flow Overview

```
Worker opens mobile app
  → Starts scan session
  → Scans item QR codes (box labels)
  → Ends session → System generates Receiving Slip
  → Admin approves slip → System generates Put-Away List
  → Worker scans bin QR → Confirms put-away → Stock updated
```

---

## 2. API Reference — Inbound Endpoints

### 2.1 Start Scan Session

```
POST /inbound/sessions
Authorization: Bearer <token>

Body:
{
  "warehouse_id": "0cbc00c4-7315-44e5-8fb3-687affa1e0ea",
  "dock_location": "DOCK-A"
}

Response 201:
{
  "id": "session-uuid",
  "warehouse_id": "...",
  "worker_id": "...",
  "status": "open",
  "dock_location": "DOCK-A",
  "created_at": "2026-06-20T10:00:00Z"
}
```

**Required permission**: `receiving_slip.create`

---

### 2.2 Record QR Scan

```
POST /inbound/sessions/{session_id}/scan
Authorization: Bearer <token>

Body:
{
  "qr_data": "{\"id\":\"RB7FJE\",\"sku\":\"ITEM-001\",\"qty\":50,\"batch\":\"BATCH-2025-01\"}"
}

Response 201:
{
  "id": "scan-uuid",
  "sku": "ITEM-001",
  "batch": "BATCH-2025-01",
  "quantity": 50,
  "is_duplicate": false
}
```

**QR Payload Format** (what the QR code must contain):
```json
{
  "id": "RB7FJE",
  "sku": "ITEM-001",
  "qty": 50,
  "batch": "BATCH-2025-01"
}
```

**Required permission**: `receiving_slip.create`

---

### 2.3 End Scan Session → Generate Receiving Slip

```
POST /inbound/sessions/{session_id}/end
Authorization: Bearer <token>

Response 200:
{
  "id": "slip-uuid",
  "slip_no": "RS-2025-0001",
  "status": "pending_review",
  "items": [
    {
      "sku": "ITEM-001",
      "batch_number": "BATCH-2025-01",
      "total_quantity": 150,
      "scan_count": 3
    }
  ]
}
```

**Required permission**: `receiving_slip.create`

---

## 3. Item Lookup (CRITICAL FIX)

### ❌ WRONG — Do NOT use stock-levels

```
GET /stock-levels?search=12350301&warehouse_id=...
→ Returns empty if no stock exists yet → "No item found"
```

### ✅ CORRECT — Use items endpoint

```
GET /items?search=12350301&page_size=1

Response 200:
{
  "items": [
    {
      "id": "item-uuid",
      "item_code": "12350301",
      "item_name": "Widget A",
      "item_type": "stock",
      "uom": "Nos",
      "maintain_stock": true,
      "standard_rate": 150.00,
      "valuation_rate": 120.00,
      "barcode": "12350301",
      ...
    }
  ],
  "pagination": { "page": 1, "page_size": 1, "total": 1, "total_pages": 1 }
}
```

**No special permission required** — any authenticated user can call this.

### Item Lookup Helper (TypeScript)

```typescript
// api/items.ts

const BASE = "/api/v1";

interface ItemResult {
  id: string;
  item_code: string;
  item_name: string;
  item_type: string;
  uom: string;
  maintain_stock: boolean;
  standard_rate: number;
  barcode: string | null;
}

export async function findItemBySKU(sku: string, token: string): Promise<ItemResult | null> {
  const url = `${BASE}/items?search=${encodeURIComponent(sku)}&page_size=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Item lookup failed: ${res.status}`);

  const data = await res.json();
  return data.items?.[0] ?? null;
}
```

---

## 4. Put-Away Flow (After Receiving Slip is Approved)

### 4.1 List Put-Away Lists (Worker sees assigned tasks)

```
GET /put-away?warehouse_id=<uuid>&status=pending

Response 200:
{
  "items": [
    {
      "id": "putaway-list-uuid",
      "put_away_list_no": "PA-2025-0001",
      "status": "pending",
      "item_count": 5,
      ...
    }
  ],
  "pagination": { ... }
}
```

### 4.2 Get Put-Away List Detail (with bin assignments)

```
GET /put-away/{putaway_list_id}

Response 200:
{
  "id": "...",
  "items": [
    {
      "id": "item-uuid",
      "sku": "ITEM-001",
      "batch_number": "BATCH-2025-01",
      "quantity": 50,
      "bin_location_id": "bin-uuid",
      "bin_location_code": "Z01-A01-B01-L01-BN001",
      "status": "pending"
    }
  ]
}
```

### 4.3 Complete Put-Away Item (Worker confirms put-away into bin)

```
POST /put-away/items/{item_id}/complete
Authorization: Bearer <token>

Body:
{
  "bin_location_id": "scanned-bin-uuid",
  "quantity": 50
}

Response 200:
{
  "id": "item-uuid",
  "status": "completed",
  "bin_location_id": "scanned-bin-uuid",
  "bin_location_code": "Z01-A01-B01-L01-BN001",
  "completed_at": "2026-06-20T10:30:00Z"
}
```

---

## 5. Bin QR Scanning During Put-Away

### 5.1 Scan Bin QR Code

The mobile app scans the bin QR code (generated via `GET /warehouse-locations/{id}/qr-image`):

```json
// QR payload decoded by mobile app:
{
  "type": "location",
  "org_id": "8614e0b8-...",
  "warehouse_id": "0cbc00c4-...",
  "warehouse_code": "WH-001",
  "warehouse_name": "Main Warehouse",
  "location_id": "bin-uuid",
  "full_path": "Z01-A01-B01-L01-BN001",
  "location_type": "bin",
  "location_code": "BN001"
}
```

### 5.2 Confirm Bin Assignment

```typescript
async function confirmPutAway(
  putAwayItemId: string,
  scannedBinQR: string,
  quantity: number,
  token: string
) {
  const binPayload = JSON.parse(scannedBinQR);

  if (binPayload.type !== "location") {
    throw new Error("Scanned QR is not a bin location");
  }

  const res = await fetch(`${BASE}/put-away/items/${putAwayItemId}/complete`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bin_location_id: binPayload.location_id,
      quantity: quantity,
    }),
  });

  if (!res.ok) throw new Error(`Put-away failed: ${res.status}`);
  return res.json();
}
```

---

## 6. Complete Inbound Flow (Pseudocode)

```typescript
// 1. Start session
const session = await startSession(warehouseId, dockLocation, token);

// 2. Scan item boxes
for (const qrScan of scannedBoxes) {
  await recordScan(session.id, qrScan.rawData, token);
}

// 3. End session → receiving slip generated
const slip = await endSession(session.id, token);

// --- Admin approves slip (via admin portal) ---
// --- System generates put-away list ---

// 4. Worker fetches put-away list
const putAwayList = await getPutAwayList(putAwayListId, token);

// 5. For each put-away item:
for (const item of putAwayList.items) {
  // Show: "Put 50 × ITEM-001 (BATCH-2025-01) into bin Z01-A01-B01-L01-BN001"
  displayItem(item);

  // Wait for worker to scan bin QR
  const binQR = await scanBinQR();

  // Confirm put-away
  await confirmPutAway(item.id, binQR, item.quantity, token);
}

// 6. All items done → put-away list auto-completes
```

---

## 7. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `GET /stock-levels?search=...` to find items | Use `GET /items?search=...` — items exist before stock |
| Using `warehouse.create` permission | Workers need `receiving_slip.create` |
| Not sending `Authorization` header on image requests | Fetch QR blob with auth header, then use `blob:` URL |
| QR payload missing `sku` or `batch` | Ensure QR encodes JSON with `id`, `sku`, `qty`, `batch` |

---

## 8. Permissions Reference

| Operation | Permission Required | Role |
|-----------|-------------------|------|
| Start/end scan session | `receiving_slip.create` | `warehouse_work_user` ✅ |
| Record QR scan | `receiving_slip.create` | `warehouse_work_user` ✅ |
| Look up items | (any authenticated) | All roles ✅ |
| View put-away lists | `warehouse.read` | `warehouse_work_user` ✅ |
| Complete put-away item | `warehouse.read` | `warehouse_work_user` ✅ |
| Generate put-away list | `warehouse.create` | Admin/Manager only |
| Scan bin QR | `warehouse.read` | `warehouse_work_user` ✅ |

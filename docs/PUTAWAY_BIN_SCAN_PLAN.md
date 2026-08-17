# Direct Put-Away — Bin QR Scanning Plan

> **Date**: 2026-08-12
> **Status**: ✅ Implemented — 5-char QR codes with API lookup

---

## 1. Bin QR Code System

### 1.1 Format (Current)

Bin QR codes encode a **5-character alphanumeric code** (e.g., `LFBMT`, `A3B2C`).

These are auto-generated for all 210 warehouse bins in the backend (`layout_service._generate_qr_code()`). Each code is unique, stored in the `warehouse_locations.qr_code` column (VARCHAR(5), UNIQUE).

### 1.2 Mobile App Flow

```
Worker scans bin QR → gets "LFBMT"
  → Calls GET /warehouse-locations/by-qr/LFBMT
  → Backend returns: { id: UUID, qr_code: "LFBMT", full_path: "Z01-A03-B02-L04-B01", ... }
  → Mobile extracts location_id (UUID)
  → Uses with POST /put-away/complete { qr, bin_id: UUID, quantity }
```

### 1.3 Legacy JSON Support

The `parseBinQR()` utility also supports legacy JSON-format bin QRs:
```json
{ "type": "location", "location_id": "UUID", "location_code": "A03-B02-L04", "full_path": "..." }
```
But **new bins use only the 5-char code**.

---

## 2. Backend APIs

| API | Method | Description |
|-----|--------|-------------|
| `/warehouse-locations/by-qr/{qr_code}` | GET | Lookup bin by 5-char QR code → returns location with UUID |
| `/put-away/complete` | POST | Complete put-away: `{ qr, bin_id: UUID, quantity }` |
| `/put-away/lookup/{qr}` | GET | Lookup tracking item by QSeal QR |
| `/put-away/available` | GET | List pending items for put-away |

---

## 3. Implementation Summary

### 3.1 `src/components/putaway/binScanner.ts` (NEW)

```typescript
parseBinQR(data: string): BinInfo | null
// Supports:
// - 5-char alphanumeric codes (e.g., "LFBMT") → needs API lookup
// - Legacy JSON with location_id → UUID extracted directly

lookupBinByQr(qrCode: string): Promise<BinInfo | null>
// Calls GET /warehouse-locations/by-qr/{code}
// Returns BinInfo with location_id (UUID) populated
```

### 3.2 `src/components/putaway/AssignView.tsx` (UPDATED)

- Manages bin code input + scanner overlay internally
- On scan/enter: detects bin QR vs QSeal QR
- Bin QR → `lookupBinByQr()` → resolves UUID → shows resolved bin path
- QSeal QR → passes raw data to hook's `handleScan`
- "Assign All" button calls `onAssignAll(locationId: UUID)`
- Individual row "Assign" calls `onAssignRow(row, locationId: UUID)`

### 3.3 `src/hooks/useDirectPutaway.ts` (UPDATED)

- `assignRow(row: TableRow, locationId: string)` — uses UUID directly
- `assignAll(locationId: string)` — uses UUID directly
- Removed `binId` state (bin resolution now in AssignView)
- `handleScan(data: string)` unchanged — handles QSeal scanning from both views

### 3.4 `src/screens/DirectPutawayScreen.tsx` (UPDATED)

- Passes `onAssignAll={assignAll}`, `onAssignRow={assignRow}`, `onScanQSeal={handleScan}`
- Simple wire-up, no bin resolution logic

---

## 4. File Changes Summary

| File | Change |
|------|--------|
| `src/components/putaway/binScanner.ts` | **NEW** — `parseBinQR()` + `lookupBinByQr()` |
| `src/components/putaway/AssignView.tsx` | **REWRITTEN** — Bin scanning, lookup, UUID resolution |
| `src/hooks/useDirectPutaway.ts` | `assignRow`/`assignAll` accept UUID, removed `binId` |
| `src/screens/DirectPutawayScreen.tsx` | Updated props to match new AssignView |

---

## 5. Acceptance Criteria

- [x] Worker scans bin QR (5-char code) → bin UUID resolved via API
- [x] Bin path shown after successful lookup
- [x] "Assign All" assigns all pending items to the resolved bin
- [x] Individual "Assign" assigns one item to the resolved bin
- [x] Legacy JSON bin QRs still work (parsed directly without API call)
- [x] QSeal scanning works from within AssignView
- [x] Manual 5-char code entry works ("Go" button)
- [x] Error shown for invalid/unknown bin codes

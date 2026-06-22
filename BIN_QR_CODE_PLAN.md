# Bin Location QR Code — Implementation Plan

> **Date**: 2026-06-20
> **Goal**: Generate QR codes for bin locations so mobile app can scan them during inbound/outbound to identify the exact bin for put-away or picking.

---

## 1. Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Admin prints bin QR labels → sticks on each bin             │
│                                                              │
│  Worker scans bin QR with mobile app                         │
│    → App decodes JSON payload                                │
│    → Knows: org, warehouse, location_id, full_path           │
│    → Uses for: put-away confirmation, pick start/finish      │
└──────────────────────────────────────────────────────────────┘
```

### Current state

| What exists | Where |
|-------------|-------|
| Worker QR codes (for login) | `identity-service` → `GET /identity/workers/{id}/qr-image` |
| `qrcode` library | Already installed in identity-service |
| Location hierarchy | `core-service` → `warehouse_locations` table (Zone→Aisle→Bay→Level→Bin) |
| `full_path` column | e.g. `Z01-A01-B01-L01-BN001` — already stored |
| Location scans | `POST /location-scans` — records start/finish at bin |

### What's missing

- No endpoint to generate a QR code FOR a bin location
- No standard QR payload format for locations
- No bulk label printing endpoint

---

## 2. QR Payload Design

### Format: JSON (same as existing QR decoder supports)

```json
{
  "type": "location",
  "org_id": "8614e0b8-3316-4f84-a6bb-92791ceacd23",
  "org_name": "Acme Logistics",
  "warehouse_id": "f2c7ea58-5bcf-408c-a506-755da6a67ba8",
  "warehouse_code": "WH-001",
  "warehouse_name": "Main Warehouse",
  "location_id": "0cbc00c4-7315-44e5-8fb3-687affa1e0ea",
  "full_path": "Z01-A01-B01-L01-BN001",
  "location_type": "bin",
  "location_code": "BN001"
}
```

### Why JSON?

1. **Already supported** — `core-service/app/services/qr_decoder.py` handles JSON natively
2. **Self-describing** — mobile app gets everything it needs without DB lookup
3. **Extensible** — can add fields later (e.g., `capacity`, `zone_name`)
4. **Human-readable** — admins can scan with any QR reader to verify

### Alternative: Short-code + API lookup

QR encodes just `location_id`, mobile app calls `GET /warehouse-locations/{id}`. Simpler QR but requires network. **Decision**: use JSON (self-contained, works offline).

---

## 3. API Design

### 3.1 Single Location QR

```
GET /api/v1/warehouse-locations/{location_id}/qr-image
Authorization: Bearer <token>

Response: image/png (330×330px QR code)
```

**Implementation**: core-service `warehouse_locations.py`

**Logic**:
1. Look up `WarehouseLocation` by ID
2. Look up parent `Warehouse` for name/code
3. Look up `Organization` for name
4. Build JSON payload
5. Generate QR PNG using `qrcode` library
6. Return `StreamingResponse`

### 3.2 Bulk Label Print (Optional — Phase 2)

```
POST /api/v1/warehouse-locations/qr-labels/bulk
Authorization: Bearer <token>
Body: { "location_ids": ["uuid1", "uuid2", ...] }

Response: application/pdf (printable sheet of QR labels)
```

### 3.3 QR Download by Warehouse/Zone (Optional — Phase 2)

```
GET /api/v1/warehouse-locations/qr-labels?warehouse_id=<uuid>&location_type=bin
Authorization: Bearer <token>

Response: application/zip (ZIP of PNG files, one per bin)
```

---

## 4. Files to Create/Modify

### core-service

| File | Action | Purpose |
|------|--------|---------|
| `app/api/v1/endpoints/warehouse_locations.py` | **Modify** | Add `GET /{location_id}/qr-image` endpoint |
| `app/services/layout_service.py` | **Modify** | Add `get_location_with_context()` method (loads org + warehouse) |
| `app/schemas/warehouse_location.py` | **Modify** | Add `LocationQRPayload` schema |
| `pyproject.toml` | **Modify** | Add `qrcode` + `Pillow` dependencies |

### Dependencies to add (core-service)

```
qrcode>=7.4
Pillow>=10.0
```

---

## 5. Implementation Steps

### Step 1: Add dependencies

Add `qrcode` and `Pillow` to `core-service/pyproject.toml`.

### Step 2: Add QR schema

```python
# core-service/app/schemas/warehouse_location.py

class LocationQRPayload(BaseModel):
    """QR code payload for a bin location"""
    type: str = "location"
    org_id: UUID
    org_name: str
    warehouse_id: UUID
    warehouse_code: str
    warehouse_name: str
    location_id: UUID
    full_path: str
    location_type: str
    location_code: str
```

### Step 3: Add service method

```python
# core-service/app/services/layout_service.py

def get_location_qr_payload(self, location_id: UUID, organization_id: UUID) -> LocationQRPayload:
    """Build QR payload with org, warehouse, and location context."""
    location = self._get_location(location_id, organization_id)
    warehouse = self.db.query(Warehouse).filter(Warehouse.id == location.warehouse_id).first()
    org = self.db.query(Organization).filter(Organization.id == organization_id).first()

    return LocationQRPayload(
        org_id=organization_id,
        org_name=org.name if org else "",
        warehouse_id=location.warehouse_id,
        warehouse_code=warehouse.code if warehouse else "",
        warehouse_name=warehouse.name if warehouse else "",
        location_id=location.id,
        full_path=location.full_path or "",
        location_type=location.location_type,
        location_code=location.code,
    )
```

### Step 4: Add endpoint

```python
# core-service/app/api/v1/endpoints/warehouse_locations.py

@router.get(
    "/{location_id}/qr-image",
    responses={404: {"description": "Location not found"}},
    summary="Generate QR code image for a bin location",
)
async def get_location_qr_image(
    location_id: UUID,
    current_user: CurrentUser = Depends(require_permission(WAREHOUSE_READ)),
    db: Session = Depends(get_db),
):
    """Generate a printable QR code for a bin location.

    The QR encodes org, warehouse, and full bin path as JSON.
    Mobile app scans this to identify the exact bin during inbound/outbound.
    """
    layout_service = LayoutService(db)
    payload = layout_service.get_location_qr_payload(location_id, current_user.organization_id)

    import qrcode, io
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(payload.model_dump_json())
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="image/png",
        headers={"Content-Disposition": f"inline; filename=bin-qr-{payload.full_path}.png"},
    )
```

### Step 5: Mobile App Integration

The mobile app's existing QR scanner already handles JSON payloads (via `qr_decoder.py`). For location QR codes:

```typescript
// Mobile app — on QR scan
function onQRScanned(qrText: string) {
  const payload = JSON.parse(qrText);

  if (payload.type === "location") {
    // Worker scanned a bin QR during put-away or picking
    setCurrentLocation({
      locationId: payload.location_id,
      fullPath: payload.full_path,
      warehouseId: payload.warehouse_id,
      warehouseName: payload.warehouse_name,
    });

    // Confirm: "You are at Z01-A01-B01-L01-BN001 in Main Warehouse"
    // Continue with put-away or pick operation
  }
}
```

---

## 6. Frontend (Admin Portal) Integration

### 6.1 Warehouse Location Tree — QR Button

In the warehouse location tree view, add a QR icon next to each bin-level location:

```
┌────────────────────────────────────────────────────────────┐
│  Warehouse Locations — Main Warehouse                      │
│                                                            │
│  ▼ Zone Z-01 (Receiving)                                   │
│    ▼ Aisle A-01                                             │
│      ▼ Bay B-01                                             │
│        ▼ Level L-01                                         │
│          ■ BN-001  [ 📱 QR ] [ 🖨 Print ] [ ✏️ Edit ]      │
│          ■ BN-002  [ 📱 QR ] [ 🖨 Print ] [ ✏️ Edit ]      │
│          ■ BN-003  [ 📱 QR ] [ 🖨 Print ] [ ✏️ Edit ]      │
│                                                            │
│  [ 📱 Print All Bins in Zone ]  [ 🖨 Print All Bins ]      │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Print Flow

```
User clicks QR icon (or "Print All")
  → Modal opens with QR preview + print options
  → User confirms label size (small/medium/large)
  → User clicks "Print" → browser print dialog
  → OR user clicks "Download" → saves PNG file
```

---

### 6.3 TypeScript Types

```typescript
// types/bin-qr.ts

export interface BinQRPayload {
  type: "location";
  org_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location_id: string;
  full_path: string;
  location_type: string;
  location_code: string;
}

export type LabelSize = "small" | "medium" | "large";

export const LABEL_DIMENSIONS: Record<LabelSize, { width: string; height: string; fontSize: string }> = {
  small:  { width: "4cm",  height: "4cm",  fontSize: "8px"  },
  medium: { width: "5cm",  height: "5cm",  fontSize: "10px" },
  large:  { width: "7cm",  height: "7cm",  fontSize: "12px" },
};
```

---

### 6.4 API Helper

```typescript
// api/bin-qr.ts

const BASE_URL = "/api/v1";

/**
 * Fetch QR code image for a single bin location.
 * Returns a Blob URL that can be used in <img> tags.
 */
export async function fetchBinQRImage(
  locationId: string,
  token: string
): Promise<string> {
  const response = await fetch(
    `${BASE_URL}/warehouse-locations/${locationId}/qr-image`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch QR: ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Fetch QR images for multiple bins in parallel.
 */
export async function fetchBinQRImages(
  locationIds: string[],
  token: string
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const promises = locationIds.map(async (id) => {
    try {
      const url = await fetchBinQRImage(id, token);
      results.set(id, url);
    } catch (err) {
      console.error(`Failed to fetch QR for ${id}:`, err);
    }
  });
  await Promise.all(promises);
  return results;
}
```

---

### 6.5 React Component — Single Bin QR Label

```tsx
// components/BinQRLabel.tsx

import { useState, useEffect, useRef } from "react";
import { fetchBinQRImage } from "@/api/bin-qr";
import { LABEL_DIMENSIONS, LabelSize } from "@/types/bin-qr";
import { useAuthStore } from "@/stores/auth";

interface BinQRLabelProps {
  locationId: string;
  fullPath: string;
  warehouseName: string;
  warehouseCode: string;
  size?: LabelSize;
  onClose?: () => void;
}

export function BinQRLabel({
  locationId,
  fullPath,
  warehouseName,
  warehouseCode,
  size = "medium",
  onClose,
}: BinQRLabelProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const dims = LABEL_DIMENSIONS[size];

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchBinQRImage(locationId, token)
      .then(setQrUrl)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
  }, [locationId, token]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `bin-qr-${fullPath}.png`;
    a.click();
  };

  if (loading) return <div className="qr-loading">Generating QR...</div>;
  if (error) return <div className="qr-error">Error: {error}</div>;
  if (!qrUrl) return null;

  return (
    <div className="bin-qr-modal-overlay" onClick={onClose}>
      <div className="bin-qr-modal" onClick={(e) => e.stopPropagation()}>
        {/* Printable label */}
        <div
          ref={printRef}
          className="bin-qr-label"
          style={{
            width: dims.width,
            height: dims.height,
            fontSize: dims.fontSize,
          }}
        >
          <img
            src={qrUrl}
            alt={`QR for ${fullPath}`}
            className="bin-qr-image"
          />
          <div className="bin-qr-text">
            <div className="bin-qr-warehouse">{warehouseName}</div>
            <div className="bin-qr-path">{fullPath}</div>
          </div>
        </div>

        {/* Action buttons (hidden during print) */}
        <div className="bin-qr-actions no-print">
          <button onClick={handlePrint} className="btn-primary">
            🖨 Print Label
          </button>
          <button onClick={handleDownload} className="btn-secondary">
            ⬇ Download PNG
          </button>
          <button onClick={onClose} className="btn-ghost">
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### 6.6 React Component — Bulk Print All Bins

```tsx
// components/BinQRBulkPrint.tsx

import { useState } from "react";
import { fetchBinQRImages } from "@/api/bin-qr";
import { LABEL_DIMENSIONS, LabelSize } from "@/types/bin-qr";
import { useAuthStore } from "@/stores/auth";

interface BinQRBulkPrintProps {
  locationIds: string[];
  locations: Array<{ id: string; full_path: string; warehouse_name: string; warehouse_code: string }>;
  onClose: () => void;
}

export function BinQRBulkPrint({ locationIds, locations, onClose }: BinQRBulkPrintProps) {
  const [qrUrls, setQrUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [labelSize, setLabelSize] = useState<LabelSize>("medium");
  const token = useAuthStore((s) => s.accessToken);
  const dims = LABEL_DIMENSIONS[labelSize];

  const handleGenerate = async () => {
    setLoading(true);
    const urls = await fetchBinQRImages(locationIds, token!);
    setQrUrls(urls);
    setLoading(false);
  };

  const handlePrint = () => window.print();

  // Build a lookup by ID
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  return (
    <div className="bin-qr-modal-overlay" onClick={onClose}>
      <div className="bin-qr-modal bin-qr-bulk" onClick={(e) => e.stopPropagation()}>
        <h2>Print Bin QR Labels — {locationIds.length} bins</h2>

        <div className="bin-qr-bulk-controls no-print">
          <label>
            Label Size:
            <select value={labelSize} onChange={(e) => setLabelSize(e.target.value as LabelSize)}>
              <option value="small">Small (4cm × 4cm)</option>
              <option value="medium">Medium (5cm × 5cm)</option>
              <option value="large">Large (7cm × 7cm)</option>
            </select>
          </label>

          {qrUrls.size === 0 ? (
            <button onClick={handleGenerate} disabled={loading} className="btn-primary">
              {loading ? "Generating..." : "📱 Generate QR Codes"}
            </button>
          ) : (
            <button onClick={handlePrint} className="btn-primary">
              🖨 Print All ({qrUrls.size} labels)
            </button>
          )}

          <button onClick={onClose} className="btn-ghost">✕ Cancel</button>
        </div>

        {/* Printable labels grid */}
        <div className="bin-qr-label-grid">
          {locationIds.map((id) => {
            const loc = locationMap.get(id);
            const qrUrl = qrUrls.get(id);
            if (!loc) return null;

            return (
              <div
                key={id}
                className="bin-qr-label"
                style={{ width: dims.width, height: dims.height, fontSize: dims.fontSize }}
              >
                {qrUrl ? (
                  <>
                    <img src={qrUrl} alt={`QR for ${loc.full_path}`} className="bin-qr-image" />
                    <div className="bin-qr-text">
                      <div className="bin-qr-warehouse">{loc.warehouse_name}</div>
                      <div className="bin-qr-path">{loc.full_path}</div>
                    </div>
                  </>
                ) : (
                  <div className="bin-qr-placeholder">QR</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

---

### 6.7 Print CSS

```css
/* styles/bin-qr-print.css */

/* Hide non-print elements */
@media print {
  .no-print {
    display: none !important;
  }

  .bin-qr-modal-overlay {
    position: static !important;
    background: white !important;
  }

  .bin-qr-modal {
    box-shadow: none !important;
    padding: 0 !important;
    max-width: 100% !important;
  }

  .bin-qr-label-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8mm;
    justify-content: flex-start;
    page-break-inside: avoid;
  }

  .bin-qr-label {
    border: 1px dashed #ccc;
    page-break-inside: avoid;
  }

  @page {
    size: A4;
    margin: 10mm;
  }
}

/* Screen styles */
.bin-qr-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.bin-qr-modal {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.bin-qr-bulk {
  max-width: 95vw;
}

.bin-qr-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 4mm;
  margin: 0 auto;
}

.bin-qr-image {
  width: 70%;
  height: auto;
  aspect-ratio: 1;
}

.bin-qr-text {
  text-align: center;
  margin-top: 2mm;
  font-family: monospace;
}

.bin-qr-warehouse {
  font-weight: 600;
  color: #333;
}

.bin-qr-path {
  color: #666;
  letter-spacing: 0.5px;
}

.bin-qr-placeholder {
  width: 70%;
  aspect-ratio: 1;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  border-radius: 4px;
}

.bin-qr-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: center;
}

.bin-qr-bulk-controls {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.bin-qr-label-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.bin-qr-loading,
.bin-qr-error {
  padding: 20px;
  text-align: center;
}

.bin-qr-error {
  color: #d32f2f;
}
```

---

### 6.8 Integration into Location Tree

```tsx
// In your location tree component:

import { BinQRLabel } from "@/components/BinQRLabel";
import { BinQRBulkPrint } from "@/components/BinQRBulkPrint";

function LocationTreeNode({ location, warehouse, allBins }) {
  const [showQR, setShowQR] = useState(false);
  const [showBulkPrint, setShowBulkPrint] = useState(false);

  return (
    <div className="location-node">
      <span className="location-name">
        {location.location_type === "bin" ? "■" : "▼"} {location.code}
        {location.name && ` — ${location.name}`}
      </span>

      {location.location_type === "bin" && (
        <span className="location-actions">
          <button onClick={() => setShowQR(true)} title="View QR">
            📱
          </button>
          <button onClick={() => setShowQR(true)} title="Print Label">
            🖨
          </button>
        </span>
      )}

      {showQR && (
        <BinQRLabel
          locationId={location.id}
          fullPath={location.full_path}
          warehouseName={warehouse.name}
          warehouseCode={warehouse.code}
          size="medium"
          onClose={() => setShowQR(false)}
        />
      )}

      {/* ... children recursion ... */}
    </div>
  );
}
```

---

### 6.9 API Endpoints Reference (Frontend)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/warehouse-locations/{id}/qr-image` | `GET` | `warehouse.read` | Single bin QR PNG |
| `/warehouse-locations?warehouse_id=X&location_type=bin` | `GET` | `warehouse.read` | List all bins (for bulk print) |

> ⚠️ **CORS Note**: If using `<img src={qrUrl}>` with auth, the image request must include the `Authorization` header. Options:
> 1. Fetch blob client-side with auth header, create `blob:` URL (recommended — shown above)
> 2. Proxy through your frontend server
> 3. Use a short-lived signed URL

---

## 7. QR Code Label Design (Physical Print)

```
┌─────────────────────────┐
│                         │
│   ██████████████████    │
│   ██ ████ ██ ████ ██    │
│   ██ ████ ██ ████ ██    │  ← QR Code
│   ██████████████████    │
│                         │
│  Main Warehouse          │
│  Z01-A01-B01-L01-BN001   │  ← Human-readable text
│                         │
└─────────────────────────┘
     5cm × 5cm label
```

---

## 8. Summary

| Deliverable | Service | Effort |
|-------------|---------|--------|
| `GET /warehouse-locations/{id}/qr-image` | core-service ✅ | 1 endpoint + 1 service method |
| `LocationQRPayload` schema | core-service ✅ | 1 Pydantic model |
| `qrcode` + `Pillow` dependency | core-service ✅ | `requirements.txt` |
| `BinQRLabel` component | Frontend | 1 React component (~80 lines) |
| `BinQRBulkPrint` component | Frontend | 1 React component (~100 lines) |
| Print CSS | Frontend | 1 CSS file (~100 lines) |
| API helper (`fetchBinQRImage`) | Frontend | 1 utility function (~20 lines) |
| Mobile app location QR handler | Mobile App | Parse `type: "location"` JSON |

**Total backend effort**: ~50 lines of new code across 3 files (✅ DONE)
**Total frontend effort**: ~300 lines across 4 files (Components + CSS + API helper)

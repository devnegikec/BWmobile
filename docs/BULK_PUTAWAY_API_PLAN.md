# Bulk Put-Away API — Backend Implementation Notes

> **Status**: Draft spec for backend team. Mobile side is ready to consume it once
> the endpoints exist (see §5 for the exact mobile changes).

## 1. Why this is needed

Today the mobile app completes put-away **one HTTP request per item**:

| Flow | Endpoint | Payload |
|------|----------|---------|
| Slip/list based (`PutawayScreen.tsx`) | `POST /put-away/{put_away_list_id}/items/{item_id}/complete` | `{ bin_id }` (optional) |
| QR/direct (`useDirectPutaway.ts`) | `POST /put-away/complete` | `{ qr, bin_id, quantity, put_away_list_id }` |

The mobile "Assign All" button fires N requests in parallel via
`Promise.allSettled(...)`. This works but:

- generates N round-trips (slow on the floor, chatty over slow networks), and
- makes partial failure handling awkward on the client.

Goal: **one request that completes many items into the same bin**, with a
**per-item** result so a capacity overflow on one item does not hide the success
of the others.

## 2. Design requirements (non-negotiable)

1. **Partial success is required.** A volume-capacity overflow on item #2 must
   NOT fail item #1. Return per-item results, not an all-or-nothing error.
2. **Per-item failure shape must match the existing single-complete error.**
   The mobile error mapper reads `data.message` (and `data.detail`). Keep the
   envelope `{ "error": "<CODE>", "message": "<human text>" }` on every failed
   item — exactly like today's single-complete 400.
3. **Reuse the capacity check.** The bulk endpoint must call the same
   volume-capacity validation used by the single-complete endpoint, and emit the
   same message text.
4. **Same side effects as single complete** (stock entry, list/slip status
   transitions). Do not fork the business logic.

### Observed capacity-overflow message (verbatim, from mobile logs)

```
Cannot add 4 to bin 'Z01-A01-B01-L01-BN01'. Volume capacity exceeded: occupied 1000000.000000000000 / capacity …
```

(The backend currently prints full float precision — the mobile app trims the
trailing zeros before display. You do **not** need to change the backend text,
but rounding the numbers is a nice-to-have.)

## 3. Proposed endpoints

### 3.1 Flow A — slip/list based (bulk by item id)

```
POST /put-away/{put_away_list_id}/complete
Auth: warehouse.create
```

Request:

```json
{
  "bin_id": "hh0e8400-e29b-41d4-a716-446655440012",
  "item_ids": [
    "ee0e8400-e29b-41d4-a716-446655440009",
    "ee0e8400-e29b-41d4-a716-44665544000a"
  ]
}
```

- `item_ids` — the same `id` values returned in `GET /put-away/{id}` `items[]`
  that the single endpoint uses as `{item_id}`.
- Optional: `bin_id` may be omitted if items already carry a pre-assigned
  `bin_location_id` (mirroring the single endpoint's optional `bin_id`).

Response `200`:

```json
{
  "completed": [
    {
      "id": "ee0e8400-e29b-41d4-a716-446655440009",
      "item_id": "ff0e8400-e29b-41d4-a716-446655440010",
      "sku": "SKU-12345",
      "batch_number": "B-2026-001",
      "quantity": 60.0,
      "bin_location_id": "hh0e8400-e29b-41d4-a716-446655440012",
      "bin_location_code": "Z01-A03-B02-L04",
      "status": "completed",
      "completed_at": "2026-06-15T08:50:00Z"
    }
  ],
  "failed": [
    {
      "item_id": "ee0e8400-e29b-41d4-a716-44665544000a",
      "error": "VALIDATION_ERROR",
      "message": "Cannot add 4 to bin 'Z01-A01-B01-L01-BN01'. Volume capacity exceeded: occupied 1000000 / capacity 1000"
    }
  ],
  "summary": { "completed_count": 1, "failed_count": 1 }
}
```

- Whole-request validation errors (unknown `bin_id`, unknown list id, empty
  `item_ids`) → `400` with the same top-level `{ "error", "message" }` envelope.

> **Update (2026-09-24) — sync vs async response.** The endpoint now returns
> one of two shapes:
> - **≤ `BULK_PUTAWAY_SYNC_THRESHOLD` items** (default 20): completes inline
>   and returns `200` with the `{ completed, failed, summary }` body above —
>   no polling.
> - **> threshold items**: enqueues a Celery job and returns `202`:
>   ```json
>   { "job_id": "f0fd5919-...", "status": "queued" }
>   ```
>   The client polls `GET /put-away/bulk-jobs/{job_id}` until
>   `status == completed | failed`. Mobile polls with exponential backoff and
>   surfaces a "Still processing → Keep checking" retry if the job is still
>   pending after the poll window.
>
> Threshold is configurable via `BULK_PUTAWAY_SYNC_THRESHOLD` (backend env);
> client timeouts via `EXPO_PUBLIC_BULK_PUTAWAY_*` (see `putawayService.ts`).

### 3.2 Flow B — QR/direct (bulk by serial/QR)

```
POST /put-away/complete/bulk
Auth: warehouse.create
```

Request:

```json
{
  "bin_id": "hh0e8400-e29b-41d4-a716-446655440012",
  "put_away_list_id": "dd0e8400-e29b-41d4-a716-446655440008",
  "items": [
    { "qr": "SERIAL-0001", "quantity": 4 },
    { "qr": "SERIAL-0002", "quantity": 2 }
  ]
}
```

- `items[].qr` — the serial number / QR identifier, same as the single
  `POST /put-away/complete` `qr` field.
- `quantity` — optional; falls back to the tracking row quantity when omitted.
- `put_away_list_id` — optional, same as the single endpoint.

Response `200`:

```json
{
  "completed": [
    {
      "id": "tracking-row-uuid",
      "qr_identifier": "SERIAL-0001",
      "sku": "SKU-1",
      "batch_number": "B-2026-001",
      "quantity": 4,
      "bin_location_id": "hh0e8400-e29b-41d4-a716-446655440012",
      "putaway_status": "completed",
      "stock_entered": true,
      "completed_at": "2026-06-15T08:50:00Z"
    }
  ],
  "failed": [
    {
      "qr": "SERIAL-0002",
      "error": "VALIDATION_ERROR",
      "message": "Cannot add 2 to bin 'Z01-A01-B01-L01-BN01'. Volume capacity exceeded: occupied 1000000 / capacity 1000"
    }
  ],
  "summary": { "completed_count": 1, "failed_count": 1 }
}
```

> Note: keep the QR flow's success payload fields aligned with the existing
> single `POST /put-away/complete` response (`qr_identifier`, `putaway_status`,
> `stock_entered`, `completed_at`) so the mobile types stay consistent.

## 4. Business rules (shared by both endpoints)

1. **Process each item independently.** Commit each item's completion in its own
   transaction; one item's failure must not roll back the others.
2. **Capacity/volume validation** — reuse the existing single-complete check.
   On overflow, emit the per-item failure above with the same message text.
3. **Idempotency** — completing an item already `completed` must be a no-op
   success (preferred) or a per-item `409`. It must **not** double-enter stock
   or double-increment counters.
4. **Unknown/missing items** — a `qr` or `item_id` that does not map to a
   pending put-away line should be reported in `failed` with a clear message
   (e.g. `ITEM_NOT_FOUND`), not abort the whole request.
5. **Status transitions (same as single complete):**
   - Flow A: mark line `status = completed`; when all lines are `completed`,
     set `put_away_list.status = completed` and
     `receiving_slip.status = putaway_complete`.
   - Flow B: set tracking row `putaway_status = completed` and
     `stock_entered = true`.
6. **Authorization** — `warehouse.create`, identical to the single endpoints.
7. **Response code** — `200` with mixed results. (Alternatively `207
   Multi-Status`; the mobile axios client treats 2xx as success either way, but
   `200` keeps the client simpler.)

## 5. Mobile-side changes (already planned, will wire up on confirm)

Once either endpoint lands, the mobile app will:

1. `src/types/putaway.ts` — add:
   - `CompletePutAwayItemsRequest` / `CompletePutAwayItemsResponse`
   - `CompletePutawayBulkRequest` / `CompletePutawayBulkResponse`
2. `src/api/putawayService.ts` — add:
   - `completePutAwayItems(listId, binId, itemIds)`
   - `completePutawayByQrBulk(payload)`
3. `src/screens/PutawayScreen.tsx` — `handleAssignGroup` / `handleAssignAll`
   call the bulk endpoint, mark `completed` ids, and surface the `failed`
   messages in one alert.
4. `src/hooks/useDirectPutaway.ts` — `assignRow` (box) / `assignAll` call the
   bulk endpoint, mark `assigned` rows for the `completed` entries, and alert
   the `failed` messages.

The existing `collectSettledErrors` / `getBackendErrorMessage` helpers remain for
any endpoint that stays per-item (e.g. returns classification).

## 6. Acceptance criteria

- [ ] One request completes N items into the same bin.
- [ ] Capacity overflow on one item yields `failed[]` with the same
      `{ error, message }` shape as today's single-complete 400.
- [ ] Other items in the same request still complete successfully.
- [ ] Re-submitting an already-completed item does not double stock.
- [ ] List/slip status transitions fire exactly once when the last item completes.
- [ ] Invalid `bin_id` / empty `item_ids` → top-level `400 { error, message }`.

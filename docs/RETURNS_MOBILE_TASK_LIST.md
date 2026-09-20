# Returns (HC) — Mobile Implementation Task List

> **Source of truth**: `RETURNS_HANDHELD_INTEGRATION.md` v1.0
> **Status**: 📝 Contract-level plan. The `/returns/…` endpoints are **not deployed yet** — every
> task in Phase 1–8 is blocked on the returns MVP (`R-01` → `R-10`). Phases 0, 9, 11 are runnable now.
> **How to use**: work top-down. Each task has a **Validate** column — do exactly those steps and
> tick the box. A task is only done when its manual check passes on a physical HC device.

---

## Legend

| Mark | Meaning |
| ---- | ------- |
| ☐ | Not started |
| 🟢 | Runnable today (live endpoints) |
| 🟠 | Blocked on returns MVP deployment |
| 🔒 | Blocked on an open question (doc §10) |

---

## Phase 0 — Prep & contract lock 🟢

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 0.1 | Confirm `/returns/*` base paths + envelope with backend (`{"error","message","hint","details"}`) | — | Open the API reference / ask backend; envelope shape matches `errors.ts` parsing | ☐ |
| 0.2 | Resolve open questions that change payload shape: serials mandatory (§10 Q1), over-receipt hard/soft stop (§10 Q2), `DAMAGED` destination (§10 Q3) | — | Written answer from product owner filed in this doc | ☐ |
| 0.3 | Confirm new permission codes `return.read` / `return.receive` / `return.classify` exist in the token payload | — | Log a token; `permissions` array contains all three | ☐ |
| 0.4 | Decide the rehearsal path while MVP is undeployed (`POST /inbound/sessions/{id}/scan` + `/receiving-slips/{slip_id}/items/{item_id}/flag`) | — | Decision recorded; a dry-run session can be completed end-to-end | ☐ |

**Phase 0 exit**: no task below is written against a guessed shape.

---

## Phase 1 — Types 🟠

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 1.1 | Add `ReturnRegistration`, `ReturnRegistrationLine` (§2, §3.2) | `src/types/returns.ts` (new), `src/types/index.ts` | `npx tsc --noEmit` clean | ☐ |
| 1.2 | Add `ReturnSession` incl. `expected_qty`, `scanned_qty`, `classified_qty`, `lines[]`, `items[]` | same | Fields match §3.2 JSON 1:1 — diff the sample payload against the interface | ☐ |
| 1.3 | Add `ReturnSessionItem` with `condition: ReturnCondition \| null`, `reason_code`, `exception_id` | same | `condition === null` is type-narrowable (drives the "N to classify" badge) | ☐ |
| 1.4 | Add `ReturnCondition = 'good' \| 'damaged' \| 'hold' \| 'quarantine'` | same | Exactly four members — no extras | ☐ |
| 1.5 | Add `ReturnScanResponse` incl. `next_action: 'classify' \| 'report_unreadable'`, `over_receipt`, `serial_expected` | same | Matches §3.3 sample | ☐ |
| 1.6 | Add `ReturnClassifyResponse` (`destination`, `exception_id`, `exception_status`) and end-session response (§3.5) | same | Matches §3.4 / §3.5 samples | ☐ |
| 1.7 | Add union of the §7 error codes (`RETURN_*`, `DUPLICATE_SERIAL`, `EXCEPTION_ALREADY_ACTIVE`) | same | Every code in the §7 table has a matching type member | ☐ |

**Phase 1 exit**: paste each JSON sample from the doc into a TS file as a literal and confirm it
assigns without error.

---

## Phase 2 — API layer 🟠

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 2.1 | `listReturnRegistrations({ status: 'ready', warehouse_id })` — §2 | `src/api/returnsService.ts` (new) | Device with an empty queue shows an empty state, not an error | ☐ |
| 2.2 | `getReturnRegistration(id)` — expected lines + serials | same | Detail screen shows the same `expected_qty` as the list row | ☐ |
| 2.3 | `openReturnSession(registrationId, { dock_location, device_id })` — §3.1 | same | `201` → session id persisted; status flips to `receiving` | ☐ |
| 2.4 | `getReturnSession(id)` — §3.2 | same | After app force-kill mid-session, calling this rebuilds the pending list with no scan loss | ☐ |
| 2.5 | `scanReturnUnit(sessionId, { qr_data, device_type, os })` with its own timeout (mirror `recordScan`'s 10 s) | same | A slow-network scan times out at 10 s and surfaces a retry path, not a spinner forever | ☐ |
| 2.6 | `classifyReturnItem(sessionId, payload)` + `override` flag for "Change reason" — §3.4 | same | Re-sending the same item without `override` → `409`; with `override: true` → `201` | ☐ |
| 2.7 | `classifyReturnItemsBulk(sessionId, items[])` — §3.4 | same | Bulk-good on a 3-unit carton classifies all three in one round-trip | ☐ |
| 2.8 | `endReturnSession(sessionId, { note })` — §3.5 | same | Returns `receipt_note.note_no` + `conditions` breakdown | ☐ |
| 2.9 | Wrap `POST /inbound/exceptions/unreadable-qr` (reuse — do **not** reimplement) — §3.6, §4.2 | `src/api/inboundService.ts` | Call succeeds against today's live backend 🟢 | ☐ |
| 2.10 | Wrap `GET /inbound/exception-reasons` for the reason picker | same | Returns the categories used by §4.3 filtering | ☐ |

**Phase 2 exit**: every call is exercised once from a scratch screen/log before any UI is built.

---

## Phase 3 — Session lifecycle & store 🟠

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 3.1 | `returnsStore` mirroring `inboundStore` shape (`currentSession`, `pendingItems`, `error`, `isLoading`) | `src/store/returnsStore.ts` (new) | Store is the single source of truth — no session state in components | ☐ |
| 3.2 | `useReturnsFlow` hook mirroring `useInboundFlow`, **including the `sessionGeneration` ref guard** | `src/hooks/useReturnsFlow.ts` (new) | Cancel the session mid-QSeal-style background batch; no late write lands in the new session | ☐ |
| 3.3 | `409 RETURN_SESSION_ALREADY_OPEN` → resume, never create a second session | hook | Tap "Open session" twice; second attempt loads the existing session instead of erroring | ☐ |
| 3.4 | Handle `409 RETURN_REGISTRATION_NOT_RECEIVABLE` / `RETURN_REGISTRATION_CANCELLED` | hook | Cancelled registration shows a terminal message, not a retry loop | ☐ |
| 3.5 | Persist `session_id` locally; on boot call §3.2 and rebuild the pending list from `condition === null` | hook + storage | Force-kill the app mid-session; relaunch → badge count matches the pre-kill count | ☐ |
| 3.6 | Monotonic counters — never roll `scanned_qty` backwards on out-of-order responses | store | Fire 5 rapid scans; the counter only increases, final value correct | ☐ |
| 3.7 | Reset `scannedQSealSerials`-equivalent de-dupe set on every session reset | hook | Same QR twice after a cancel is accepted, not treated as duplicate | ☐ |

**Phase 3 exit**: a session can be opened, background-written, cancelled, and restarted with no
cross-session leakage.

---

## Phase 4 — Screens & navigation 🟠

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 4.1 | Registration list screen (`status=ready`) with `expected_qty` / `received_qty` per row | `src/screens/ReturnsScreen.tsx` (new) | Matches doc §8 case 1 | ☐ |
| 4.2 | Registration detail (expected lines + serials) | `src/screens/ReturnDetailScreen.tsx` (new) | Serial list matches `lines[].serials` from §3.2 | ☐ |
| 4.3 | Dock/device entry → opens the session (dock location + `device_id`) | component | `dock_location` echoed back on the session header | ☐ |
| 4.4 | Scanning screen: camera + counters (`expected` / `scanned` / `classified`) + **"N to classify"** badge | `src/screens/ReturnReceiveScreen.tsx` (new) | Badge decrements on each classify and reaches 0 right before End | ☐ |
| 4.5 | Register the new screens (tab or stack) in the navigator | `src/navigation/AppNavigator.tsx` | Tab renders for a dock user; hidden when `return.read` is absent | ☐ |
| 4.6 | Hide the whole Returns tab when `return.read` is missing (§6) | navigator + auth store | Log in as a non-dock account → tab absent, no dead route reachable via deep link | ☐ |
| 4.7 | End-session result screen (note no., `expected/received/short`, condition breakdown, "supervisor review" next step) | screen | Matches §3.5 response fields, values not recomputed client-side | ☐ |

**Phase 4 exit**: the happy path is clickable end-to-end against a mocked/staging API.

---

## Phase 5 — Scan validation matrix 🟠

Implement every row of doc §4.1. **One task per case**, because each has a distinct operator message.

| # | Case | Server response | Required device behaviour | Done |
| - | ---- | --------------- | ------------------------- | ---- |
| 5.1 | Identity on registration (SKU + serial) | `201` | Green; go straight to condition capture | ☐ |
| 5.2 | SKU on registration, serial not listed | `409 RETURN_SERIAL_NOT_REGISTERED` | Red banner + "Report as unexpected / call supervisor" | ☐ |
| 5.3 | SKU not on registration at all | `404 RETURN_UNIT_NOT_REGISTERED` | Red; offer the unreadable/unexpected action. **Never** offer an override | ☐ |
| 5.4 | Already scanned **this** session | `409 RETURN_UNIT_ALREADY_SCANNED` | Amber "already captured" — **jump to that item, do not blind-retry** | ☐ |
| 5.5 | Identity already in active stock | `409 DUPLICATE_SERIAL` | Hard stop, red; supervisor investigation message | ☐ |
| 5.6 | Line at registered quantity | `201` + `over_receipt: true` | Amber warning; keep scanning (supervisor decides) | ☐ |
| 5.7 | All lines fully received | `409 RETURN_REGISTRATION_FULLY_RECEIVED` | Offer "End session" | ☐ |
| 5.8 | Malformed / undecodable payload | `400 RETURN_QR_INVALID` | Offer "Report unreadable label" (§4.2), keep the camera live | ☐ |
| 5.9 | Session closed / ended | `409 RETURN_SESSION_NOT_OPEN` | Return to the session picker | ☐ |
| 5.10 | QR already put away by an earlier return | `409 DUPLICATE_SERIAL` | Same handling as 5.5 | ☐ |
| 5.11 | Damaged unit already classified | `409 RETURN_ITEM_ALREADY_CLASSIFIED` | Use "Change reason" (`override: true`) | ☐ |
| 5.12 | Honor `next_action` from §3.3 | — | `classify` → condition screen; `report_unreadable` → §4.2 sheet | ☐ |
| 5.13 | Always display the server `hint` (never a raw code) | any | Force each error above; every one shows operator-readable text | ☐ |

**Phase 5 exit**: all 13 rows reproduced on-device, screenshotted, and compared with the doc table.

---

## Phase 6 — Condition capture 🟠

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 6.1 | Four large buttons Good / Damaged / Hold / Quarantine, ≥ 48 dp, thumb-reachable | `src/components/returns/ConditionSheet.tsx` (new) | Measured with a ruler/overlay; usable one-handed with gloves | ☐ |
| 6.2 | `Good` = one tap, no picker, no note | same | Good completes in a single tap | ☐ |
| 6.3 | Non-good → reason picker, loaded live from `GET /inbound/exception-reasons`, filtered by `return_*` / `damage` / `hold` / `quarantine` category | same | Picker is populated from the API — **no hard-coded reason codes** anywhere in the app | ☐ |
| 6.4 | Non-good without a reason → blocked client-side; server `400 RETURN_REASON_CODE_REQUIRED` also handled | same | Tapping Save with no reason never sends a request and shows the inline error | ☐ |
| 6.5 | Optional free-text note after the reason | same | Blank note is sent as `undefined`, not `""` | ☐ |
| 6.6 | Show the server-derived `destination` after classify | same | Operator sees `QUARANTINE` (etc.) before putting the unit down | ☐ |
| 6.7 | Destination override chips (`HOLD` / `QUARANTINE`, + `DAMAGED` if §10 Q3 resolves yes) | same | Override is sent only when tapped; `400 RETURN_DESTINATION_INVALID` handled | ☐ |
| 6.8 | "All good" bulk action per carton → `…/classify/bulk` | same | 3-unit carton = one request; counts consistent afterwards | ☐ |
| 6.9 | Default the picker from the registration's original reason but **never** auto-classify a non-good unit | same | Reopen the sheet; the default is preselected but nothing is submitted without an explicit tap | ☐ |
| 6.10 | Block End while any `condition === null` (`409 RETURN_SESSION_HAS_UNCLASSIFIED_ITEMS`) | hook + screen | Tap End with 1 pending → jumps to that unit | ☐ |

**Phase 6 exit**: doc §8 cases 9–13 all pass.

---

## Phase 7 — Unreadable label 🟢

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 7.1 | "Report unreadable label" sheet: `carton_reference`, `sku`, `batch_number`, `quantity`, `note` | `src/components/returns/UnreadableLabelSheet.tsx` (new) | Fields match §4.2 body exactly | ☐ |
| 7.2 | Operator **reads `carton_reference` off the carton** — no identity is ever typed | same | Free-text identity entry does not exist anywhere in the flow | ☐ |
| 7.3 | Success state: `QR_UNREADABLE` → `HOLD`, `pending_approval`, "supervisors alerted" | same | Nothing is counted and no stock is created (check the counters stay flat) | ☐ |
| 7.4 | Duplicate report → `409 EXCEPTION_ALREADY_ACTIVE` → "already reported", move on | same | Report the same carton twice; second attempt is informational, not an error | ☐ |
| 7.5 | Never show a success toast before the server responds (§5.6) | same | Airplane-mode the device mid-report → no success state appears | ☐ |

**Phase 7 exit**: doc §8 case 15 passes.

---

## Phase 8 — End session & put-away 🟠

| # | Task | Files | Validate | Done |
| - | ---- | ----- | -------- | ---- |
| 8.1 | End-session confirm with an optional note; call `POST /returns/sessions/{id}/end` | screen + hook | Note reaches the payload; response renders `draft` + `RRN-…` | ☐ |
| 8.2 | Registration flips to `received`; session id is cleared locally | hook | Re-opening the same registration is no longer offered | ☐ |
| 8.3 | Show `expected_qty` / `received_qty` / `short_qty` and the `conditions` breakdown straight from the response | screen | Client does **not** recompute any count | ☐ |
| 8.4 | `good` stock flows into the **existing** put-away list — no returns-specific screen | reuse `putawayService` | `GET /put-away` shows the returned good units in the same list as inbound | ☐ |
| 8.5 | Confirm put-away into a bin via `POST /put-away/{list_id}/items/{item_id}/complete` | reuse | Bin scan → confirm → item leaves the list | ☐ |
| 8.6 | No "Approve" / "Dispose" action anywhere on the device | audit | Grep the returns screens for approve/dispose — zero hits | ☐ |

**Phase 8 exit**: doc §8 cases 11 & 14 pass and the flow hands off to the supervisor web app.

---

## Phase 9 — Offline & error handling 🟢 (design) / 🟠 (verify)

| # | Rule (doc §5) | Validate | Done |
| - | ------------- | -------- | ---- |
| 9.1 | Scans are the **only** retryable operation | Kill the network, scan → queued/retried; kill the network, classify → blocked | ☐ |
| 9.2 | Treat `409 RETURN_UNIT_ALREADY_SCANNED` as **success** for retry purposes (idempotent client-side) | Timeout a scan then retry it — no duplicate item, no error shown | ☐ |
| 9.3 | **Never** queue classification offline | Airplane mode → classify is disabled with a clear "connect to continue" message (§8 case 17) | ☐ |
| 9.4 | **Never** queue session-end offline | Airplane mode → End is disabled, not silently queued | ☐ |
| 9.5 | Do not queue approvals | No approval UI exists at all | ☐ |
| 9.6 | Session recovery on restart via `GET /returns/sessions/{id}` | §8 case 16 | ☐ |
| 9.7 | Token expiry mid-shift: refresh and replay **only** the current scan | Force-expire the token, scan again → scan replays, no classification is replayed | ☐ |
| 9.8 | Never show success before the server responds | Every state transition is gated on the awaited response | ☐ |

**Phase 9 exit**: doc §8 case 17 passes with no partial writes in the audit trail.

---

## Phase 10 — Permissions & role 🟠

| # | Operation | Permission | Validate | Done |
| - | --------- | ---------- | -------- | ---- |
| 10.1 | List / read registrations | `return.read` | Dock user sees the list; others don't | ☐ |
| 10.2 | Open a session | `return.receive` | Hidden without it | ☐ |
| 10.3 | Record scans | `return.receive` + `wms.scan` | Missing `wms.scan` hides the scan action | ☐ |
| 10.4 | Report unreadable label | `inbound_exception.create` | Missing → action hidden, no `403` toast | ☐ |
| 10.5 | Classify conditions | `return.classify` | §8 case 18: non-dock account → `403` + action hidden | ☐ |
| 10.6 | End the session | `return.receive` | Hidden without it | ☐ |
| 10.7 | Approve / dispose / register / cancel | `return.approve` / `return.dispose` / `return.register` | **Not present on the device at all** | ☐ |

**Phase 10 exit**: every row above verified with two accounts (dock user + back-office user).

---

## Phase 11 — Manual QA sign-off (doc §8, verbatim)

Run each case on a physical HC device against staging. Attach tenant/user, session id,
`qr_identifier` and `error` code for any failure.

| # | Scenario | Call | Expect | Done |
| - | -------- | ---- | ------ | ---- |
| 1 | Pick a ready registration | `GET /returns/registrations?status=ready` | List with `expected_qty` / `received_qty` | ☐ |
| 2 | Open a session | `POST /returns/registrations/{id}/sessions` | `201`, registration → `receiving`, counters at 0 | ☐ |
| 3 | Open a second session | same | `409 RETURN_SESSION_ALREADY_OPEN` | ☐ |
| 4 | Scan an expected serial | `POST …/scans` | `201`, `next_action=classify`, counters +1 | ☐ |
| 5 | Re-scan the same unit | same | `409 RETURN_UNIT_ALREADY_SCANNED` + jump to the unit | ☐ |
| 6 | Scan a serial not on the registration | same | `409 RETURN_SERIAL_NOT_REGISTERED` (no stock change) | ☐ |
| 7 | Scan an identity already in stock | same | `409 DUPLICATE_SERIAL` (no stock change, exception recorded) | ☐ |
| 8 | Scan beyond the registered quantity | same | `201` + `over_receipt: true` | ☐ |
| 9 | Classify damaged without a reason | `POST …/classify` | `400 RETURN_REASON_CODE_REQUIRED` | ☐ |
| 10 | Classify damaged with a reason | same | `201`, `destination=QUARANTINE`, exception `pending_approval` | ☐ |
| 11 | Classify good | same | `201`, no exception, unit available for put-away | ☐ |
| 12 | Bulk good a carton | `POST …/classify/bulk` | All items classified, counts consistent | ☐ |
| 13 | End with an unclassified unit | `POST …/end` | `409 RETURN_SESSION_HAS_UNCLASSIFIED_ITEMS` | ☐ |
| 14 | End after classifying everything | `POST …/end` | Note `draft` + `RRN-…`, registration `received` | ☐ |
| 15 | Unreadable label flow | `POST /inbound/exceptions/unreadable-qr` | `201` HOLD `QR_UNREADABLE`; duplicate → `409 EXCEPTION_ALREADY_ACTIVE` | ☐ |
| 16 | App restart mid-session | `GET /returns/sessions/{id}` | Pending list rebuilt from `condition === null` | ☐ |
| 17 | Offline classification attempt | any | Blocked in the UI with "connect to continue" | ☐ |
| 18 | Classify with a non-dock account | `POST …/classify` | `403`, action hidden | ☐ |

---

## Phase 12 — Do-not-list audit (doc §9)

Run these as a final grep/review pass. Any hit is a defect.

| # | Must not exist | Check | Done |
| - | -------------- | ----- | ---- |
| 12.1 | Any UI that lets the operator type or "fix" an identity | Grep for free-text `qr_identifier` / serial inputs in `src/components/returns` | ☐ |
| 12.2 | Any offline queue for classification or session-end | Inspect the returns hook for queued/retry-forever mutations on those two calls | ☐ |
| 12.3 | `409 RETURN_UNIT_ALREADY_SCANNED` surfaced as a crash/error | Search the handler for that code | ☐ |
| 12.4 | `GET /stock-levels` used to resolve an item | Grep the whole app for `stock-levels` → 0 hits in returns | ☐ |
| 12.5 | A returns-specific put-away screen | Grep `src/screens` for `Return.*Put[Aa]way` | ☐ |
| 12.6 | Success state before the server responds | Review every `setState` that precedes an `await` | ☐ |
| 12.7 | Hard-coded reason codes | Grep for literal strings like `RETURN_DAMAGED`, `QUARANTINE` outside types/tests | ☐ |
| 12.8 | Any approve / alter-note action on the device | Grep for approve / dispose handlers | ☐ |

---

## Deferred / not in scope (doc §10)

These are tracked separately — do **not** build until the open questions resolve.

| # | Item | Blocked on | Done |
| - | ---- | ---------- | ---- |
| D.1 | Quantity-entry mode instead of scan-per-unit (bulk returns) | §10 Q1 — are serials mandatory? | ☐ |
| D.2 | Hard stop on over-receipt | §10 Q2 — business decision; payload shape changes | ☐ |
| D.3 | Fourth `DAMAGED` destination chip + dock lane | §10 Q3 | ☐ |
| D.4 | "Waiting for relabel" state on the unreadable screen | E-10 — supervisor relabel workflow not built | ☐ |

---

## Suggested build order

```mermaid
graph LR
  P0[Phase 0 · prep] --> P1[Phase 1 · types]
  P1 --> P2[Phase 2 · API]
  P2 --> P3[Phase 3 · store + hook]
  P3 --> P4[Phase 4 · screens]
  P4 --> P5[Phase 5 · scan matrix]
  P5 --> P6[Phase 6 · condition capture]
  P6 --> P7[Phase 7 · unreadable]
  P7 --> P8[Phase 8 · end + put-away]
  P8 --> P9[Phase 9 · offline]
  P9 --> P10[Phase 10 · permissions]
  P10 --> P11[Phase 11 · QA sign-off]
  P11 --> P12[Phase 12 · do-not audit]
```

#!/usr/bin/env python3
"""
End-to-end validation of the /returns/* API as the mobile app consumes it.

Usage:
    # 1. point at your backend and log in to get a token
    curl -s -X POST $IDENTITY/api/v1/identity/login \
         -H 'Content-Type: application/json' \
         -d '{"email":"...","password":"..."}' | python3 -c \
         "import sys,json; print(json.load(sys.stdin)['access_token'])" > /tmp/tok

    # 2. run it (override CORE / WAREHOUSE_ID via env if needed)
    CORE=http://localhost:8001/api/v1 WAREHOUSE_ID=<uuid> python3 scripts/validate-returns-api.py

It exercises the exact calls `src/api/returnsService.ts` makes, and asserts the
response shapes the app's types depend on. Re-run after any backend change.

⚠ It creates real registrations/sessions/exceptions in the target database.
   Run against a dev/staging tenant only.
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("CORE", "http://localhost:8001/api/v1")
WAREHOUSE_ID = os.environ.get("WAREHOUSE_ID", "")
TOKEN_PATH = os.environ.get("TOKEN_PATH", "/tmp/tok")

if not WAREHOUSE_ID:
    sys.exit("Set WAREHOUSE_ID to a warehouse uuid in the target tenant.")

try:
    TOK = open(TOKEN_PATH).read().strip()
except FileNotFoundError:
    sys.exit(f"Token file not found: {TOKEN_PATH}")

_passed = 0
_failed = 0


def call(method, path, body=None, params=None):
    url = BASE + path
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "null")
        except json.JSONDecodeError:
            return e.code, raw


def check(label, cond, detail=""):
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  PASS  {label} {detail}")
    else:
        _failed += 1
        print(f"  FAIL  {label} {detail}")


def scan_body(ident, sku):
    # ⚠ qr_data MUST be the decoded JSON payload — a raw serial is rejected
    #    with 400 RETURN_QR_INVALID.
    return {
        "qr_data": json.dumps({"id": ident, "sku": sku, "qty": 1}),
        "device_type": "mobile",
        "os": "iOS/Android",
    }


def main():
    print("== seed registration (1 line, 2 serial-tracked units) ==")
    st, reg = call(
        "POST",
        "/returns/registrations",
        {
            "warehouse_id": WAREHOUSE_ID,
            "reference_type": "delivery_note",
            "return_reason_code": "RETURN_DAMAGED",
            "note": "validate-returns-api.py",
            "lines": [
                {
                    "sku": "PIC-2000-BK",
                    "quantity": 2,
                    "uom": "NOS",
                    "serials": ["VLD0", "VLD1"],
                }
            ],
        },
    )
    if st >= 300:
        sys.exit(f"could not seed a registration: HTTP {st} {reg}")
    reg_id = reg["id"]
    print(f"   {reg['registration_no']} {reg_id}")

    print("== listReturnRegistrations({status, warehouse_id}) ==")
    st, lst = call(
        "GET",
        "/returns/registrations",
        params={"status": "ready", "warehouse_id": WAREHOUSE_ID},
    )
    row = next((r for r in lst.get("items", []) if r["id"] == reg_id), None)
    check("registration appears in the ready list", row is not None)
    check(
        "list row carries return_reason_code",
        bool(row) and row.get("return_reason_code") == "RETURN_DAMAGED",
        f"rc={row.get('return_reason_code') if row else None}",
    )

    print("== openSession ==")
    st, sess = call(
        "POST",
        f"/returns/registrations/{reg_id}/sessions",
        {"dock_location": "DOCK-VAL", "device_id": None},
    )
    check(
        "201 and status=open", st == 201 and sess.get("status") == "open", f"HTTP {st}"
    )
    sid = sess["id"]

    print("== reportReturnUnreadable (returns-scoped, NO session_id in body) ==")
    st, un = call(
        "POST",
        f"/returns/sessions/{sid}/unreadable",
        {
            "carton_reference": "VAL-CARTON",
            "sku": "PIC-2000-BK",
            "batch_number": "BT-SEP",
            "quantity": 1,
            "note": "torn",
        },
    )
    check(
        "201 + QR_UNREADABLE",
        st == 201 and un.get("reason_code") == "QR_UNREADABLE",
        f"HTTP {st}",
    )
    check(
        "destination HOLD",
        un.get("destination") == "HOLD",
        f"dest={un.get('destination')}",
    )
    st, after = call("GET", f"/returns/sessions/{sid}")
    check(
        "unreadable moved no counters",
        after["scanned_qty"] == 0 and after["classified_qty"] == 0,
        f"scanned={after['scanned_qty']} classified={after['classified_qty']}",
    )
    st, dup = call(
        "POST",
        f"/returns/sessions/{sid}/unreadable",
        {"carton_reference": "VAL-CARTON"},
    )
    check(
        "duplicate -> EXCEPTION_ALREADY_ACTIVE",
        st == 409 and dup.get("error") == "EXCEPTION_ALREADY_ACTIVE",
        f"HTTP {st}",
    )

    print("== getExceptionReasons(condition) is server-filtered ==")
    _, damaged = call(
        "GET", "/inbound/exception-reasons", params={"condition": "damaged"}
    )
    codes = sorted(c["code"] for c in damaged)
    check(
        "damaged -> only return-relevant codes",
        codes == ["DAMAGED", "RETURN_DAMAGED", "RETURN_SCRAP"],
        f"{codes}",
    )

    print("== scans ==")
    items = []
    for serial in ["VLD0", "VLD1"]:
        st, s = call(
            "POST", f"/returns/sessions/{sid}/scans", scan_body(serial, "PIC-2000-BK")
        )
        check(
            f"scan {serial} -> 201 next_action=classify",
            st == 201 and s.get("next_action") == "classify",
            f"HTTP {st}",
        )
        if st == 201:
            items.append(s["item_id"])
    st, again = call(
        "POST", f"/returns/sessions/{sid}/scans", scan_body("VLD0", "PIC-2000-BK")
    )
    check(
        "re-scan -> RETURN_UNIT_ALREADY_SCANNED (client treats as success)",
        st == 409 and again.get("error") == "RETURN_UNIT_ALREADY_SCANNED",
        f"HTTP {st}",
    )
    st, bad = call(
        "POST",
        f"/returns/sessions/{sid}/scans",
        {"qr_data": "NOT-JSON", "device_type": "mobile", "os": "iOS/Android"},
    )
    check(
        "malformed qr_data -> RETURN_QR_INVALID",
        st == 400 and bad.get("error") == "RETURN_QR_INVALID",
        f"HTTP {st}",
    )

    if len(items) < 2:
        return

    print("== classify ==")
    st, no_reason = call(
        "POST",
        f"/returns/sessions/{sid}/classify",
        {"item_id": items[0], "condition": "damaged"},
    )
    check(
        "damaged without reason -> RETURN_REASON_CODE_REQUIRED",
        st == 400 and no_reason.get("error") == "RETURN_REASON_CODE_REQUIRED",
        f"HTTP {st}",
    )
    st, c = call(
        "POST",
        f"/returns/sessions/{sid}/classify",
        {
            "item_id": items[0],
            "condition": "damaged",
            "reason_code": "RETURN_DAMAGED",
            "note": "dent",
        },
    )
    check(
        "damaged with reason -> destination QUARANTINE",
        st == 201 and c.get("destination") == "QUARANTINE",
        f"HTTP {st} dest={c.get('destination')}",
    )
    st, dup_c = call(
        "POST",
        f"/returns/sessions/{sid}/classify",
        {"item_id": items[0], "condition": "damaged", "reason_code": "RETURN_DAMAGED"},
    )
    check(
        "re-classify -> RETURN_ITEM_ALREADY_CLASSIFIED",
        st == 409 and dup_c.get("error") == "RETURN_ITEM_ALREADY_CLASSIFIED",
        f"HTTP {st}",
    )

    print("== bulk classify (bare array) ==")
    st, b = call(
        "POST",
        f"/returns/sessions/{sid}/classify/bulk",
        {"items": [{"item_id": items[1], "condition": "good"}]},
    )
    check(
        "201 and returns a LIST (not {items})",
        st == 201 and isinstance(b, list),
        f"HTTP {st} type={type(b).__name__}",
    )

    print("== end ==")
    st, e = call("POST", f"/returns/sessions/{sid}/end", {"note": "validation run"})
    check(
        "200 + registration received",
        st == 200 and e.get("registration_status") == "received",
        f"HTTP {st}",
    )
    check(
        "receipt note has RRN- number",
        str(e.get("receipt_note", {}).get("note_no", "")).startswith("RRN-"),
        f"{e.get('receipt_note')}",
    )
    check(
        "counts come from the response",
        e.get("received_qty") == 2 and e.get("short_qty") == 0,
        f"recv={e.get('received_qty')} short={e.get('short_qty')}",
    )

    print("== closed session ==")
    st, closed = call(
        "POST", f"/returns/sessions/{sid}/scans", scan_body("VLD9", "PIC-2000-BK")
    )
    check(
        "scan after close -> RETURN_SESSION_NOT_OPEN",
        st == 409 and closed.get("error") == "RETURN_SESSION_NOT_OPEN",
        f"HTTP {st}",
    )


if __name__ == "__main__":
    main()
    print()
    print(f"RESULT: {_passed} passed, {_failed} failed")
    sys.exit(1 if _failed else 0)

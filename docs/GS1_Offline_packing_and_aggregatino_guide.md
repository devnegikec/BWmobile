GS1-Based Offline Packing
and Parent-Child Aggregation
Factory implementation guide for SKU-mix prevention, QR scanning and offline mobile validation
Implementation focus
GTIN + internal SKU (AI 240)
Serialized child identification (AI 01 + AI 21)
SSCC master/pallet identification (AI 00)
Contained item + count (AI 02 + AI 37)
Offline parent-child validation without backend dependency
Important
All identifiers and URLs in this guide are fictitious examples. Replace them with identifiers allocated under your GS1 Company Prefix and a domain you control. Validate final production labels against the current GS1 General Specifications and your trading-partner requirements.

Prepared as a technical design / SOP reference

1. Executive summary
The recommended design is to keep the packing decision local to the mobile application. Each scanned code contains enough standardized identity information for the app to determine what is being packed. The backend remains useful for master data, audit history and enterprise traceability, but it is not required for every scan in the critical packing loop.
Core rule
The master or packing session defines the expected child GTIN (and optionally lot). Every child scan is accepted only when its locally decoded GTIN/lot matches the master. A wrong SKU is rejected immediately with a red screen, vibration and/or buzzer.
Question
Recommended answer
Can SKU be put in a GS1 barcode?
Yes. Use GTIN as the primary product identity; AI (240) may carry an additional manufacturer-assigned product identifier such as an internal SKU. It must not replace GTIN.
Can a master identify what child product belongs inside?
Yes for homogeneous contents: use SSCC (00) for the logistic unit, plus contained GTIN (02) and count (37); lot (10) may also be carried when applicable.
Can the app validate without backend access?
Yes. Decode the QR/GS1 data locally and compare child GTIN/lot/serial against the locally active master/packing session.
How do I know the exact children in a master?
Serialize children with GTIN + serial (01 + 21), and create an aggregation record locally: parent SSCC -> child serialized identities. Sync it to the backend later.

2. GS1 identifiers used in the design
AI
Meaning
Use in this solution
Example
(00)
SSCC
Unique identity of a logistic unit such as a master carton or pallet
952012345678912345
(01)
GTIN
Primary identity of a trade item / product packaging level
09520123456788
(02)
Contained GTIN
Identifies trade items contained in a logistic unit
09520123456856
(10)
Batch / lot
Optional lot-level traceability
B260813
(21)
Serial number
Creates an instance-level identity when combined with GTIN
C00001234
(37)
Count
Count of trade items identified by AI (02)
10
(240)
Additional product identification
Optional internal SKU/catalogue cross-reference
SKU-A-001

2.1 GTIN versus SKU
A SKU is normally an internal business identifier. In a GS1 implementation, the GTIN should be the primary standardized product identifier. If the mobile application also needs the internal SKU directly from the symbol, AI (240) can carry an additional manufacturer-assigned product identifier. This is useful for offline display and cross-reference, but it should be treated as an attribute of the GTIN rather than a replacement for it.
2.2 Packaging-level identity
When different packaging levels are trade items in their own right, each packaging level normally receives its own GTIN. A logistic unit such as a shipment carton or pallet is uniquely identified with an SSCC. A physical object may therefore have a trade-item identity and, when used as a logistic unit, a separate logistic-unit identity depending on the business process and applicable GS1 rules.
3. Recommended factory hierarchy
Level
Example identity
What the app learns offline
Primary purpose
Piece / each
GTIN 09520123456788
SKU class; optional lot and serial
Identify a single sellable/manufactured item
Inner box
GTIN 09520123456856
Packaging level / expected product
Trade-item packaging level
Master carton
SSCC 952012345678912345
Contained GTIN 09520123456856; qty 10; lot B260813
Packing / logistics unit and offline acceptance rule
Pallet
SSCC 952012345678912352
Contained master GTIN 09520123456924; qty 20; lot B260813
Higher-level aggregation and shipping
Design note
If your master carton is itself a trade item, give that packaging level its own GTIN as well. If the carton is being treated as a logistic unit for a specific shipment/packing event, identify that logistic unit with an SSCC. The exact label configuration should follow your commercial process and GS1 application standard.

4. Sample GS1 Digital Link QR URLs
The following QR codes are scannable examples. The domain id.example.com is reserved for documentation and is not a production resolver. A dedicated mobile application can decode these URI strings locally; network access is not required merely to parse the identifiers.
4.1. Each / product GTIN only

Scan sample
Purpose: Identify the product class.
GS1 Digital Link URI:
https://id.example.com/01/09520123456788
Equivalent GS1 element string:
(01)09520123456788
Notes: Use when the app only needs product identity and additional attributes are not required in the symbol.

4.2. Each GTIN + internal SKU

Scan sample
Purpose: Carry the standardized GTIN plus your internal SKU for local display/cross-reference.
GS1 Digital Link URI:
https://id.example.com/01/09520123456788?240=SKU-A-001
Equivalent GS1 element string:
(01)09520123456788(240)SKU-A-001
Notes: AI (240) is optional additional product identification; GTIN remains the primary identifier.

4.3. Each GTIN + batch/lot

Scan sample
Purpose: Identify a batch-specific product occurrence.
GS1 Digital Link URI:
https://id.example.com/01/09520123456788/10/B260813
Equivalent GS1 element string:
(01)09520123456788(10)B260813
Notes: Batch/lot is a key qualifier of GTIN in GS1 Digital Link.

4.4. Serialized child: GTIN + serial

Scan sample
Purpose: Uniquely identify an individual child unit for exact aggregation.
GS1 Digital Link URI:
https://id.example.com/01/09520123456788/21/C00001234
Equivalent GS1 element string:
(01)09520123456788(21)C00001234
Notes: GTIN + serial creates a serialized trade-item identity (often referred to as SGTIN).

4.5. Serialized child with lot

Scan sample
Purpose: Identify exact unit plus production lot.
GS1 Digital Link URI:
https://id.example.com/01/09520123456788/10/B260813/21/C00001234
Equivalent GS1 element string:
(01)09520123456788(10)B260813(21)C00001234
Notes: Useful when both instance traceability and batch validation are required.

4.6. Inner-box GTIN

Scan sample
Purpose: Identify the inner packaging level as a trade item.
GS1 Digital Link URI:
https://id.example.com/01/09520123456856
Equivalent GS1 element string:
(01)09520123456856
Notes: Use a packaging-level GTIN when the inner box is a distinct trade item under your GTIN allocation rules.

4.7. Master-carton trade-item GTIN

Scan sample
Purpose: Identify the master packaging level as a trade item.
GS1 Digital Link URI:
https://id.example.com/01/09520123456924
Equivalent GS1 element string:
(01)09520123456924
Notes: This is separate from SSCC. GTIN identifies what the trade item is; SSCC identifies a particular logistic unit.

4.8. Master logistic unit: SSCC + contained GTIN + count + lot

Scan sample
Purpose: Let the mobile app know the master identity and exactly what homogeneous child product/count belongs inside.
GS1 Digital Link URI:
https://id.example.com/00/952012345678912345?02=09520123456856&37=10&10=B260813
Equivalent GS1 element string:
(00)952012345678912345(02)09520123456856(37)10(10)B260813
Notes: For Digital Link, the SSCC is in the path; additional identifiers/attributes appear as query parameters. This form enables offline packing rules.

4.9. Pallet: SSCC + master GTIN + count + lot

Scan sample
Purpose: Represent a homogeneous pallet containing 20 master cartons of the same master-carton GTIN.
GS1 Digital Link URI:
https://id.example.com/00/952012345678912352?02=09520123456924&37=20&10=B260813
Equivalent GS1 element string:
(00)952012345678912352(02)09520123456924(37)20(10)B260813
Notes: The pallet can be validated and aggregated using the same pattern as the master-carton process.

5. Offline mobile packing workflow
5.1 Operator flow
Operator selects or starts a packing station/session.
Operator scans the master carton QR / GS1 symbol.
The app parses SSCC, contained GTIN, expected count and optional lot directly from the scan.
The app stores this as the active local packing rule.
Operator scans each child item or inner box.
The app parses child GTIN, lot and serial locally.
The app rejects a child immediately if GTIN does not match the master expected GTIN.
If lot control is enabled, the app also rejects a different lot.
If serialized tracking is enabled, the app rejects duplicate serial numbers and records accepted children under the parent SSCC.
When expected quantity is reached, the app marks the master complete and prevents further packing unless a supervisor reopens it.
The completed aggregation record is queued for backend synchronization whenever connectivity is available.
MASTER SCAN
SSCC: 952012345678912345
Expected child GTIN: 09520123456856
Expected qty: 10
Expected lot: B260813

CHILD SCAN -> decode locally
IF child.GTIN != expectedGTIN  => REJECT
IF lotRequired AND child.lot != expectedLot => REJECT
IF serial already scanned => REJECT
IF acceptedCount >= expectedQty => REJECT
ELSE => ACCEPT + store child under parent SSCC

6. Suggested local data model
SQLite (or an equivalent embedded database) is sufficient for the offline transaction layer. The following structure keeps the packing decision deterministic and independent of network latency.
PackingSession
{
  parentSscc: "952012345678912345",
  expectedChildGtin: "09520123456856",
  expectedLot: "B260813",
  expectedQty: 10,
  acceptedQty: 3,
  status: "OPEN"
}

PackedChild
{
  parentSscc: "952012345678912345",
  childGtin: "09520123456788",
  childSerial: "C00001234",
  lot: "B260813",
  scannedAt: "2026-08-13T13:20:00+05:30",
  syncStatus: "PENDING"
}

6.1 Recommended uniqueness constraints
SSCC must be unique for each logistic unit.
For serialized children, enforce uniqueness on (GTIN, serial) globally or within the appropriate traceability domain.
Prevent the same serialized child from being assigned to two open/closed parents.
Store an immutable scan/audit record for rejected scans as well as accepted scans if compliance or root-cause analysis is important.
Use an idempotency key for each completed aggregation transaction sent to the backend so retries do not create duplicate relationships.
7. Local validation matrix
Check
Accept condition
Operator response on failure
GTIN match
Scanned child GTIN equals active master expected GTIN
Red screen + strong vibration/buzzer: WRONG SKU
Lot match
If lot-controlled, scanned lot equals active master lot
Red screen: WRONG LOT
Serial uniqueness
Serialized identity not already packed
Red screen: DUPLICATE SERIAL
Quantity
Accepted quantity is below expected quantity
Red screen: MASTER ALREADY FULL
Parent status
PackingSession status is OPEN
Red screen: MASTER CLOSED
Reassignment
Child is not already linked to another parent
Red screen: ALREADY PACKED

8. Parent-child aggregation patterns
8.1 Homogeneous master without child serialization
If the only requirement is to stop mixed SKUs, the master can carry SSCC + contained GTIN + count. The app does not need the identity of every individual child; it only verifies that every scan has the expected GTIN. This is the simplest and fastest factory implementation.
Parent 952012345678912345
  expected content GTIN = 09520123456856
  expected qty = 10
  accepted scans = 10 matching items

8.2 Serialized child aggregation
If you need exact genealogy or recall traceability, serialize the children. The application then creates the relationship itself during packing; that relationship does not need to be encoded in the parent QR.
Parent SSCC 952012345678912345
  -> (01)09520123456788(21)C00001234
  -> (01)09520123456788(21)C00001235
  -> (01)09520123456788(21)C00001236
  ...
  -> quantity complete

8.3 Multi-level aggregation
For piece -> inner -> master -> pallet, apply the same relationship recursively. Each level can be validated locally and synchronized later.
Pallet SSCC 952012345678912352
  -> Master SSCC 952012345678912345
       -> Inner / child serialized identities
            -> Piece serialized identities (if required)

9. How to stay independent from the backend during packing
The design should distinguish between data required to make an immediate packing decision and data useful for enterprise reporting. Put the minimum decision-critical data into the scanned identifier or into a locally preloaded configuration. Avoid calling the backend to resolve every SKU scan.
Data
Keep in QR / local session?
Backend role
Product identity (GTIN)
Yes
Master-data enrichment, descriptions, images
Internal SKU (AI 240)
Optional
Cross-reference / ERP mapping
Expected child GTIN
Yes on homogeneous master, e.g. AI 02
Audit and master-data checks
Expected quantity
Yes, e.g. AI 37 where applicable
Order / production reconciliation
Lot
Yes when needed for validation
Traceability and recall
Serial
Yes on serialized child
Long-term item history
Parent-child relationship
Create locally during scan
Persist, query, report, integrate
Offline-app behavior
A normal phone camera may attempt to open an HTTPS URI in a browser. Your dedicated factory app should scan the symbol itself and parse the URI locally. It can optionally register/app-link your production domain, but the packing decision should not depend on successfully reaching that domain.

10. Reference validation logic
onMasterScan(data):
  parsed = parseGS1(data)
  require parsed["00"]                    // SSCC
  require parsed["02"]                    // expected content GTIN for this use case
  require parsed["37"]                    // expected count

  session = {
    parentSscc: parsed["00"],
    expectedChildGtin: parsed["02"],
    expectedLot: parsed.get("10"),
    expectedQty: integer(parsed["37"]),
    acceptedQty: 0,
    status: "OPEN"
  }
  saveLocal(session)

onChildScan(data):
  child = parseGS1(data)
  session = getActiveSession()

  if child["01"] != session.expectedChildGtin:
      reject("WRONG SKU")

  if session.expectedLot != null and child.get("10") != session.expectedLot:
      reject("WRONG LOT")

  if child.get("21") != null and alreadyPacked(child["01"], child["21"]):
      reject("DUPLICATE / ALREADY PACKED")

  if session.acceptedQty >= session.expectedQty:
      reject("MASTER FULL")

  accept()
  saveAggregationLocally(session.parentSscc, child)
  session.acceptedQty += 1

  if session.acceptedQty == session.expectedQty:
      session.status = "COMPLETE"
      queueSync(session)

11. Factory user-experience recommendations
Make wrong-SKU rejection unmistakable: full-screen red, large text, vibration and audible alert.
Show the expected SKU/GTIN and remaining quantity continuously after the master scan.
Do not allow the operator to dismiss a mismatch and continue silently; require removal/rescan or supervisor override.
Keep scans fast: all matching logic should execute locally in milliseconds.
Cache any human-friendly product name or image locally if workers benefit from visual confirmation.
Require an explicit close/complete state, and print/apply the final logistic label only after validation succeeds.
Log supervisor overrides with user, timestamp and reason.
Design for intermittent connectivity: pending sync queue, retry, idempotency and visible sync status.
12. Edge cases to decide before rollout
Scenario
Decision required
Mixed-SKU master intentionally allowed
A single AI (02)+AI (37) homogeneous-content rule is not enough. Use an order/recipe manifest locally or scan-and-build a controlled aggregation list.
Multiple lots in one master
Either prohibit by local rule or maintain allowed lot/count combinations in the local packing recipe.
Child has only a 1D GTIN barcode
The app can still decode GTIN locally; serialization/lot information will not be available unless separately encoded.
Repacking / de-aggregation
Define supervisor workflow to remove a child from a parent and record the reversal event.
Damaged QR
Allow fallback scan of a secondary GS1 carrier or controlled manual entry with audit logging.
Master label printed before contents known
Use a packing-order/recipe locally, then assign/print SSCC and finalize aggregation at close.

13. Suggested phased rollout
Phase 1 - SKU mix prevention: Use master expected GTIN + quantity; scan child GTIN; offline accept/reject. No serialization required.
Phase 2 - Lot control: Add AI (10) to master/child where required and enforce lot matching.
Phase 3 - Serialization: Add AI (21) on child units and persist parent SSCC -> serialized child relationships.
Phase 4 - Multi-level aggregation: Aggregate inner -> master -> pallet and synchronize all relationships to ERP/MES/WMS/traceability systems.
14. Copy/paste sample QR URLs
Example
Sample URI
Each GTIN
https://id.example.com/01/09520123456788
Each GTIN + internal SKU
https://id.example.com/01/09520123456788?240=SKU-A-001
Each GTIN + lot
https://id.example.com/01/09520123456788/10/B260813
Serialized child
https://id.example.com/01/09520123456788/21/C00001234
Serialized child + lot
https://id.example.com/01/09520123456788/10/B260813/21/C00001234
Inner-box GTIN
https://id.example.com/01/09520123456856
Master trade-item GTIN
https://id.example.com/01/09520123456924
Master logistic unit
https://id.example.com/00/952012345678912345?02=09520123456856&37=10&10=B260813
Pallet logistic unit
https://id.example.com/00/952012345678912352?02=09520123456924&37=20&10=B260813

15. Standards references and verification notes
This guide was prepared against current GS1 reference material available in August 2026. The implementation team should still validate its final production labels against the latest GS1 General Specifications and the applicable industry/application standard before deployment.
GS1 General Specifications (current reference): https://ref.gs1.org/standards/genspecs/
GS1 Application Identifier reference: https://ref.gs1.org/ai/
GS1 Digital Link URI Syntax: https://ref.gs1.org/standards/digital-link/uri-syntax/
GS1 Digital Link resources: https://ref.gs1.org/standards/digital-link/
GS1 support: AI (240) for internal part number / SKU: https://support.gs1.org/support/solutions/articles/43000734372-which-ai-should-i-use-to-encode-your-internal-part-number-or-sku-in-the-barcode-for-internal-tracking
Key standards facts used
AI (240) is additional manufacturer-assigned product identification and must not replace GTIN. GS1 Digital Link places the primary GS1 identifier in the URI path; additional identifiers/attributes may appear in the query string. The current GS1 General Specifications give an SSCC + contained GTIN + count example in the form /00/{SSCC}?02={GTIN}&37={count}.



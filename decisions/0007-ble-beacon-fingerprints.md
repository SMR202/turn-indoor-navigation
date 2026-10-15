# ADR-0007: TURN BLE beacon signals in the fingerprint pipeline

Status: Accepted, 2026-10-15. Android-only acquisition; shared matcher revision `station-rank-v3`.

## Context

Commercial BLE beacons are not yet available. The project needs a passive, camera-free place signal to test, and spare Android phones can advertise Bluetooth LE. The existing survey → recognition → user-confirmed PDR correction pipeline already handles per-phone surveys, abstention, immutable uploads and replay.

## Decision

IMPLEMENT BLE as an additional, optional feature of the existing fingerprint capture rather than a parallel positioning stack.

- **Identity.** TURN beacons advertise a non-connectable manufacturer payload: test company ID 0xFFFF, ASCII `TURN`, version 1, and a 1–12 character alphanumeric tag. The scanner uses a controller-level manufacturer filter, so unrelated devices (including people's phones and earbuds) are never delivered to the app or stored. Identity does not depend on Android's randomized MAC addresses. Real beacons later need an adapter for their own identity format (iBeacon/Eddystone/vendor) emitting the same normalized observations; the payload above is a development convention, not a product format.
- **Observation.** A capture holds per-beacon timestamped RSSI samples inside the same 8-second window as the magnetic capture. `ble` is present only when the scan completed; an empty array means "completed, heard nothing". Permission, hardware, lifecycle or throttling failures omit `ble` and set `bleStatus`, so a failure is never read as silence. Old records parse unchanged.
- **Matcher `station-rank-v3`.** For every candidate place, a reference is the median RSSI of each beacon repeatedly observed over the survey passes. The query is compared over the union of surveyed beacons; an unheard beacon counts as −100 dBm and per-beacon differences are capped at 20 dB, so a place is characterized by which beacons are near as well as how strong. Mean difference is scaled by 6 dB and, when magnetic data are usable for every place, blended 70/30 with the magnetic score. The existing abstention gates (best ≤ 2, margin ≥ 1.25 for a clear result) are retained. BLE is used only when every ready place has at least two passes with a completed scan and the query heard a surveyed beacon; otherwise v3 falls back to the v2 magnetic/Wi-Fi path. Records stamped v1/v2 replay unchanged.
- **Placement.** Beacon-to-place relations are learned by surveying, not configured. Venue-coordinate beacon placement and trilateration are deferred until real beacons and held-out survey data exist.
- **Lifecycle.** Foreground only: advertising keeps the screen awake; scanning is user-triggered. No background service, no automatic uploads.

## Alternatives and limits

REJECT a separate BLE positioning engine now: no evidence yet that proximity alone beats fingerprints, and it would duplicate survey/replay/confirmation. REJECT scanning all BLE devices: privacy exposure and no benefit. REJECT iOS phones as beacons: foreground-only advertising and limited payload. iOS scanning needs a signed development build and is not implemented.

The thresholds are engineering choices, not calibrated probabilities. Phone transmit power, antennas, orientation, body shadowing and OS scan throttling differ from commercial beacons, so phone-beacon results exercise the pipeline and must not be reported as final beacon accuracy. RSSI-to-distance, per-model calibration and cross-phone transfer are not validated.

## Verification and next action

Synthetic tests cover identical-magnetic places distinguished only by BLE, unheard-beacon handling, abstention between equidistant places, absent-survey fallback, historical revisions and schema validation; mocked tests cover permissions, cancellation and failed scans. Native compilation and physical RSSI behavior are separate. Next: place 3–4 phone beacons, survey two passes at three or more places, record held-out trials including unsurveyed spots, and measure wrong matches and abstentions before any automatic fusion.

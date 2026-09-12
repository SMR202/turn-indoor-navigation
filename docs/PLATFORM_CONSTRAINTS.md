# Platform constraints
Baseline from user context, 2026-09-12. Detailed API claims must be verified by the audit against current Apple/Android primary documentation.

| Area | Constraint / investigation |
|---|---|
| iOS Wi-Fi | Do not assume general nearby Wi-Fi scan access; investigate official supported APIs/entitlements. Connected-network information is not general fingerprint scanning. |
| Android Wi-Fi | Verify permission, location setting, scan throttling and foreground/background rules for selected OS targets. |
| BLE | Verify permissions, scan lifecycle, background behavior and device support independently on both platforms. RSSI is not a reliable direct distance measurement without evidence. |
| IMU/magnetic | Availability, rates, timestamp behavior, calibration, carrying mode and interference vary across devices. |
| Floor detection | Pressure sensors are optional; floor inference needs venue-specific evidence and fallback. |
| Cloud testing | Cloud can research and replay logs; real radio/sensor behavior needs physical devices. iOS build/signing workflow remains undecided. |

Record verified sources, access dates and actual target OS/device versions here during the audit. Never extrapolate Android results to iOS.

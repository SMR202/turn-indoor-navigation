# ADR-0015: Device profiles and self-calibration

Date: 2026-11-06
Status: ACCEPTED
Context and evidence: Phones read the same beacon several dB apart (our home survey: iPhone 1 m levels −68 to −59 dBm; earlier phone-beacon calibrations −72 to −81). iPhones range iBeacons about once a second; Android sees each packet. Stride and step detection differ by phone and by person. Beacon calibrations were stored per phone and per venue, so every new phone started uncalibrated.
Decision: A device profile `{ platform, model, rssiOffsetDb, stepLengthMetres, scan: { cadenceHz, minPackets, windowSeconds }, compass: { reliable } , source, samples }` is resolved in three layers: built-in defaults per platform and known model; the venue server's learned value for this model (median of uploads); this phone's own learned value. Learning: RSSI offset from beacon tests and confirmed positions (QR scans, "Not here?" answers) against the venue's beacon model; stride from map-matched walks (distance along the route divided by steps). Profiles are anonymous (model name only) and uploaded only for private LAN venues or with consent.
Alternatives considered: Per-venue calibration only (status quo): slow to converge, lost on a new phone. Asking every user to calibrate: friction, users skip it.
License/platform implications: Model names from `expo-device` (already part of Expo); no personal data.
Consequences and risks: Offsets learned near reflecting surfaces can be biased; learning is clipped (±12 dB) and blended slowly.
Validation / revisit trigger: Two different phones on the same verification walk should agree within 2 dB after learning.
Supersedes / superseded by: Extends ADR-0012.

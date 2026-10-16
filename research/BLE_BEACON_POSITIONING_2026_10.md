# BLE beacon positioning: what others do and what TURN does first

Date: 2026-10-16. Short market/literature check to choose the first beacon-correction mechanism. Vendor claims are marketing, not independent measurements.

## Findings

- **FACT (peer-reviewed, 2020):** a TU Dresden study of trilateration, fingerprinting and weighted-centroid positioning with BLE in a crowded exhibition found fingerprinting best in an empty hall but degrading to about 11 m (95th percentile) with visitors, while weighted centroid held about 5.7 m; returns diminished beyond roughly one beacon per 40 m². [TU Dresden](<https://fis.tu-dresden.de/portal/en/publications/trilateration-fingerprinting-and-centroid-taking-indoor-positioning-with-bluetooth-le-to-the-wild(3ec3129d-7353-49eb-b0e2-1d26884e1b54).html>).
- **FACT (small-room studies):** trilateration/weighted centroid reached roughly 1 m with beacons within about 3 m and RSSI stronger than about −70 dBm; fingerprinting about 0.65 m but needs a survey ([KTU](https://epubl.ktu.edu/object/elaba:16033742/16033742.pdf)). Body shadowing makes RSSI fluctuate; learned corrections help ([PMC 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9227766)).
- **Vendor claims:** Pointr advertises BLE plus sensor fusion and machine learning with about 1–3 m accuracy and on-device operation ([Pointr](https://www.pointr.tech/technology/deep-location)); Mapsted claims 1–5 m with no beacons ([Mapsted](https://mapsted.com/llms-full.txt)). Neither publishes test conditions here. The recurring industry pattern is **beacons/radio as corrections combined with inertial dead reckoning and the map**, not raw trilateration as the only source.
- **FACT (standards, still maturing):** Bluetooth 6.0 Channel Sounding gives phase/time-of-flight ranging far less sensitive to RSSI shadowing. Apple's WWDC 2026 material describes a beta iOS 27 API requiring Channel Sounding accessories; Android 16 has OS support dependent on chipset/firmware, with no phone list found ([Apple WWDC26](https://developer.apple.com/videos/play/wwdc2026/369/), [Nordic DevZone](https://devzone.nordicsemi.com/f/nordic-q-a/128469/nrf54l-channel-sounding-on-ios-27-beta/568274)). Worth watching when choosing the real beacon hardware; not usable with phone-as-beacon.

## Decision (ADR-0008)

Use beacons first as **calibrated passive proximity anchors**, the most robust RSSI use, and run them in **shadow mode** (record only) before any live correction. Trilateration is deferred: with 3–4 phone beacons, body shadowing and unknown per-phone transmit power it would add error before proving value. Revisit weighted-centroid / filter-based fusion and Channel Sounding hardware once shadow logs and commercial beacons exist.

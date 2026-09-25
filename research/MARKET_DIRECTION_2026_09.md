# Market review and TURN direction

Reviewed 2026-09-25. Primary vendor documentation describes their products; it is not independent validation of their accuracy or a guarantee TURN can reproduce it. No commercial SDK was installed, purchased or benchmarked.

| Player / primary source                                                                                                                               | Published approach                                                                                                                           | Implication for TURN                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [IndoorAtlas platform](https://www.indooratlas.com/platform/)                                                                                         | Sensor fusion layers include inertial, geomagnetic, Wi-Fi/BLE/RTT, visual-inertial and barometric inputs, plus SDK and wayfinding workflows. | Keep inertial tracking as one source; venue survey, corrections, floor inference and SDK boundaries matter as much as the moving marker.   |
| [Pointr FAQ](https://www.pointr.tech/technology/faq)                                                                                                  | BLE-compatible positioning, device-side SDK processing, mapping and navigation products.                                                     | Plan for deployment and maintenance of reference infrastructure and maps; offline positioning is compatible with a broader venue platform. |
| [Situm positioning](https://situm.com/docs/mobile-sdks-positioning/) and [requirements](https://situm.com/docs/smartphones-and-sensors-requirements/) | Calibrated Wi-Fi/BLE areas, inertial or visual tracking, platform-dependent positioning options.                                             | Survey and sensor availability must be explicit. Do not assume Android Wi-Fi scanning is a portable iPhone capability.                     |

## Decision

TURN remains an offline-capable, venue-independent navigation platform, with a reference app and eventual SDK. A house is a test venue, not the architecture. The end-to-end path remains reviewed venue data → positioning with corrections → one pose/quality result → routing/navigation → reusable clients.

The immediate slice is native step comparison and richer diagnostic acquisition. It measures whether a platform pedometer outperforms the current detector on missed steps and false positives. It does not make the native counter authoritative, introduce map snapping, or claim a walking classifier has been implemented.

Follow with measured walking recognition and direction/stride evaluation; then validated map constraints and known-location corrections. Evaluate camera-assisted positioning for free-hand use rather than promising IMU-only rejection of arbitrary hand movements. Evaluate magnetic or BLE corrections against surveyed, held-out venue data. Barometric floor changes need known-floor anchors and multi-floor evaluation. Wi-Fi remains optional Android-only unless an explicitly supported alternative is adopted. UWB is a future hardware/anchor experiment, not a universal phone capability.

Authoring/review/publication, cached versioned venue updates, floor/accessible routing and a second client remain platform work. These can progress alongside positioning, but should not displace the accuracy acceptance gate. No backend or commercial SDK is needed just to run the current comparison.

## Reuse and implementation evidence

ADOPT existing `expo-sensors` 57.0.3 (MIT), specifically Expo Pedometer/CMPedometer/Android TYPE_STEP_COUNTER. Inspected installed Pedometer.ts and native Swift/Kotlin modules. [SDK 57 Pedometer](https://docs.expo.dev/versions/v57.0.0/sdk/pedometer/), [DeviceMotion](https://docs.expo.dev/versions/v57.0.0/sdk/devicemotion/), and the existing [candidate review](PDR_IMPLEMENTATION_REVIEW.md) inform this slice. No additional dependency or copied third-party algorithm.

The native public callback reports cumulative counts without individual step timestamps. Receipt time is not footfall time. iOS interval queries use wall-clock dates and are recorded separately from native-boot-time IMU observations. Delayed counts are never integrated at the current heading. Unknown remains null, not zero; denied/unavailable/error states are preserved. Android final counts may omit late batches. An iOS interval query is another system estimate, not manual truth.

Full platform Euler angles are preserved with convention tags, not falsely declared a cross-platform quaternion. Gyro fields are reordered from inspected native implementations into device x/y/z and converted degrees/s → rad/s. Optional gravity-removed acceleration and gyro retain native sample times. These observations support future models; they do not themselves prove heading or activity accuracy.

## Plan and acceptance

1. Implement native/live/manual count comparison, explicit phone-handling labels, and enriched capture.
2. Verify denied/unavailable, delayed delivery, count reset, stalled query, cancellation, replay parity and recorded label round trips.
3. Check SDK 57 types/tests/bundles and local UI, preserving private venue/traces. Provide a reachable Expo QR.
4. Phone validation: still, bobbing, rotation, typing and walking in place; normal/slow/brisk measured walks with unchanged calibration and actual manual counts. Capture start/stop latency and failed/interrupted runs.
5. Choose a walking-recognition strategy only after reviewing false positives and missed starts on these captures. Use new sessions for validation after tuning. A robust navigation result also needs heading, endpoint, correction/recovery, battery and device/carry-mode evaluation.

Items 1–3 are the implementation scope for this turn. Item 4 needs the user's physical phone; item 5 is the next evidence-based decision, not an implied background task.

## Implementation validation

Items 1–3 implemented: 41 tests, typecheck, lint, formatting and documentation-link checks pass; iOS/Android/web exports succeed. Browser verification at 390 px covers count layout, bobbing and walking-in-place instructions, and zero-travel expectations. Native pedometer behavior, permissions and physical accuracy require on-phone validation; tests use an injected platform API and do not establish device accuracy.

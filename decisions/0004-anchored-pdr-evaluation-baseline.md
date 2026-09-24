# ADR-0004: QR anchoring and an observable PDR baseline

Date: 2026-09-24
Status: ACCEPTED for experimental evaluation, not an accuracy certification

User requests next implementation, accurate PDR, research before implementation, Expo SDK 57 and a phone-test QR at each app handoff.

## Decision

Implement M2 QR resolution against the bundled venue; never execute scanned URLs or trust scanned coordinates. Add a foreground-only experimental PDR slice behind common observations. Adopt Expo Camera/Sensors SDK 57. Reuse platform attitude rather than integrate accelerations twice or implement a new AHRS. Detect individual acceleration cycles in a pure testable module, use measured step length, align relative yaw explicitly to venue heading, and freeze on gaps, implausible attitude jumps or carrying orientation. Show uncertainty as unknown; any drift budget is a heuristic, not measured confidence. Rescanning/reselecting an anchor resets tracking.

Phone must be held screen-up, portrait, top toward walking direction, tilted less than 60 degrees. Upright/pocket/bag behavior is not supported by this initial yaw baseline. Confirm heading after lowering the phone following a QR scan. Capture normalized native timestamps and observations for deterministic replay. No arbitrary wall snapping or route matching that could hide drift. Export only on user action; no trace upload/telemetry.

## Alternatives / reuse evidence

- react-native-smartpdr: MIT but pinned tree uses Expo 41 and React hooks in algorithm paths; source shows fragile lifecycle handling. Reference, not adopted.
- xio Fusion: current MIT C/Python AHRS, rejection/bias facilities; excellent replay/native comparison candidate. Does not itself solve gait, stride or global position. Native bindings would prevent a simple Expo Go handoff now.
- RoNIN: research model/code with GPL-3.0 and separate data/model rights; preprocessing, mobile conversion and cross-device evaluation needed. No model weights imported.
- Expo Pedometer: useful future comparator, but public callback gives cumulative counts without per-step native timestamps. Assigning a batch to the latest heading loses turn timing. Use timestamped DeviceMotion samples for this baseline instead.

See [focused research](../research/PDR_IMPLEMENTATION_REVIEW.md) for exact revisions and limitations.

## Consequences and accuracy gates

Synthetic tests validate math/guards only. No measured accuracy is claimed. Before enabling normal navigation, run stationary false-step, known 90-degree turn, calibrated 10m walk and held-out 30–100m out-and-back tests per phone/carry mode; report endpoint/checkpoint errors, missed/extra steps and timestamp gaps. Proposed initial target: <=1m endpoint error on repeated 10m straight walks and <=5% distance error, subject to team agreement; this is a target, not a promise. If native attitude drift or device yaw conventions fail, stop and compare Fusion/native rotation matrices using captured evidence.

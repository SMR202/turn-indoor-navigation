# ADR-0006: buffered Android motion acquisition

Status: Accepted, 2026-10-09. Acquisition change only; `step-yaw-motion-v2` is unchanged.

## Evidence

FACT: two new Android recordings after the user's dedicated-build installation still contain only 38 accelerometer observations each over roughly 4.2 seconds. One contains intervals near 2.36 ms mixed with roughly 200–260 ms gaps. The previous manifest-permission change did not resolve sparse delivery. Raw captures and hash-based manifests stay private outside Git.

FACT: installed MIT-licensed expo-sensors 57.0.3 Android DeviceMotion caches the most recent SensorEvent per sensor and dispatches snapshots through Choreographer. Its update interval does not preserve intervening events. Display-thread delay is therefore an acquisition-loss mechanism. Actual Pixel frame timing has not been profiled; the recordings do not prove that the map alone causes the delays.

## Decision

IMPLEMENT a small local Expo module, `turn-android-imu-1`, using Android SensorManager and the already installed Expo Modules Core 57.0.18. Register accelerometer, gyroscope, gravity, linear acceleration and rotation vector at 20,000 microseconds on a dedicated HandlerThread, with zero requested hardware batch latency. Copy values and native monotonic timestamps immediately; never retain mutable SensorEvent references or depend on display frames.

Deliver batches every 100 ms, with one batch awaiting acknowledgement and a 1,000-event pending limit. Overflow fails explicitly. Session tokens, sequence validation, unregistering and lifecycle cleanup prevent silent loss or reuse across sessions. Native background capture is deliberately unsupported: leaving the activity stops acquisition and requires a new anchor.

Adapt events to the existing observation contracts, explicit units and Android Euler convention. Preserve per-stream times, actual gravity for tilt, and the acceleration sign convention used by historical replay. Wait for a coherent initial set of sensors; never interpolate missing observations. Tag recordings with the installed acquisition revision, including when that module is absent. iOS continues using its existing permission-gated DeviceMotion path.

## Alternatives and limits

REJECT relying solely on HIGH_SAMPLING_RATE_SENSORS or shorter JS intervals: neither removes snapshot loss. REJECT lowering motion-filter density thresholds: that masks the acquisition problem and weakens bobbing controls. Native step counts remain diagnostic and cannot substitute for translation evidence.

The module requires an updated Android binary, not a JS reload. Expo SDK remains 57. SensorManager rates are requests, not guarantees; hardware, vendor behavior, scheduling, sensor availability and JS overload still require field validation. Synthetic batching/filter checks and a compiled APK do not establish physical walking accuracy. Map-render performance remains a separate investigation if needed.

## Verification and next action

Regression tests cover preserved counts/times across arbitrary batch boundaries, original units/frames, missing or repeated data, slow streams, delayed delivery, session isolation, startup cleanup, missing native revisions, and synthetic walking/bobbing through the unchanged guard. See [mobile status](../docs/workstreams/mobile/STATUS.md) for actual build/check results and the next physical test. [Android SensorManager](https://developer.android.com/reference/android/hardware/SensorManager) documents listener dispatch on a supplied Handler; [Expo module API](https://docs.expo.dev/modules/module-api/) documents native events and lifecycle.

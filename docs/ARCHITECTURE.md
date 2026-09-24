# TURN architecture

Accepted initial design: [ADR-0002](../decisions/0002-product-platform-foundation.md), [ADR-0003](../decisions/0003-venue-contracts-and-offline-navigation.md).

```text
Reviewed plan / future CV → VenuePackage → local map + routing
Phone OR replay → normalized Observation → positioning → fusion → Pose
Pose + route → navigation → TURN app / future external client
```

| Implemented boundary | Responsibility                                          |
| -------------------- | ------------------------------------------------------- |
| packages/contracts   | Runtime schemas/types: Observation, Pose, Anchor, Route |
| packages/venue-model | Validate versioned venue; original synthetic fixture    |
| packages/routing     | Validated graph → route/failure without UI/network      |
| apps/mobile          | Interaction/state/rendering; no positioning algorithms  |

Add sensor adapters, positioning-core/PDR/anchors, replay/evaluation, survey tools and SDK distribution with real code. Native acquisition owns lifecycle/capabilities; fusion alone produces pose. Independent radio sources never manipulate UI markers.

[Contracts](CONTRACTS.md) define units, clock and frames. [Venue packages](VENUE_PACKAGES.md) define contents/update policy. QR establishes a known location before PDR is proven. E001/E002/E003 run alongside product milestones. Replay shares algorithm interfaces but is engineering tooling, not the app's user flow.

Manual scale/orientation calibration → reviewed geometry/doors/POIs → graph/anchors → package. Future CV/OCR emits suggestions into that same model. M0 bundles synthetic data; target is download once, validate/cache atomically, navigate locally and update later.

SVG is the initial renderer; revisit MapLibre for larger/complex venues. Backend/admin and PostgreSQL/PostGIS remain candidates for real authoring/publication needs. No database/service or C++/Rust core now. Fusion selection follows evidence; Centaurus integration follows actual app inspection.

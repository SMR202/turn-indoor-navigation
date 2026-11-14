# ADR-0018: Offers are decided on the phone

Date: 2026-11-14
Status: ACCEPTED
Context and evidence: Venues want to reach visitors near a place (a promotion, a tip). The usual design sends positions to a server that decides. TURN's promise is that position stays on the phone, and badly timed promotions are the fastest way to lose a visitor's trust in a navigation app.
Decision: A venue authors offers in TURN Studio (place, radius, dwell time, dates, hours, days, cooldown). They are published with the venue content. The app's `OfferEngine` decides on the device when to show one, with limits the venue cannot override: the position must be trustworthy, no turn within 10 m while navigating, one offer on screen, two minutes between offers, six per visit, and each offer's own cooldown remembered on the phone. The venue receives only anonymous counts (shown, opened, dismissed). In-app cards are on by default with a switch in Settings; background notifications are a later, opt-in step that needs a native build and the iBeacon slot on iPhones.
Alternatives considered: Server-side geofencing: breaks the privacy promise and needs connectivity. Beacon-ID triggers only: ties offers to hardware instead of places and fails where positioning comes from motion and the map.
License/platform implications: None for foreground cards. Background delivery later needs "Always" location on iOS and background location plus notification permission on Android, with store review of the wording.
Consequences and risks: Offers reach visitors only after the next publish. Counts cannot be attributed to people, by design.
Validation / revisit trigger: Unit tests for the engine and the API; a preview walk in the browser showed the demo offer. Revisit when background delivery is built.
Supersedes / superseded by: None.

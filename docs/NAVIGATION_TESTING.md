# Room-to-room navigation

Start with `npm run phone:tests`, reload the app from its Expo launch QR and keep the phone/computer on the same reachable network. SDK 57 remains required. Navigation itself uses the loaded venue offline; the development server/inbox are for this test build and explicit uploads.

1. Navigate is the home screen. Choose a destination by search/list or tapping a mapped room with a POI.
2. Stand at a known marker. Scan its location QR, or choose **Set a known location manually → I’m at …** only when physically there. These are location markers, not the Expo launch QR. Printable markers are generated in ignored `work/phone-test/location-markers.html` by `npm run phone:qr -- <actual Expo URL>`; their placement must match the map's named locations.
3. Calibration carries over from the existing tests. If none is saved, open **Tests, calibration & recordings**, calibrate and return. Establish the start again after changing calibration.
4. Face along the first highlighted route segment, phone screen-up/top edge forward. Confirm alignment, tap **Start guidance**, and wait through the settling countdown.
5. Follow the live estimated remaining distance and next turn. Check the actual physical doorway/path; the map does not detect furniture or prove clearance. Motion filtering may briefly hold position. The brisk-walking undercount remains unresolved.
6. Near the destination, the app asks you to check the room. **Confirm arrival** only when you can see the actual destination. If it falls short or drifts, use the recovery flow rather than claiming arrival from the estimate.
7. To recover or pause: scan another known location QR, or manually confirm a known location where you are standing. The destination stays selected and the route recalculates. Align again before resuming. A sensor failure, leaving the screen/app or the existing 30 m limit also requires a new location anchor.

Sessions save locally with destination, source anchor, guidance revision and completion status. Open **Tests, calibration & recordings → Saved runs** to inspect/share them or send all to the computer. Recovery produces a new session; prior traces remain saved. Arrival is user-confirmed, not measured ground truth. Nothing posts to chat or starts analysis automatically.

First acceptance walk: choose a short route through a turn, start at an existing measured location, check the turn instruction, confirm the visible destination, and send the recording. Then test Pause → scan/set a known location → restart with the same destination. Include failures. Browser previews cannot validate sensors, physical marker placement, native persistence or accuracy.

The marker remains the original pose estimate. Sequential route progress is not wall-based map matching; nearby parallel corridors, backward walking and incorrect map geometry can still confuse it. Multi-floor routes are explicitly blocked in this screen. See [ADR-0005](../decisions/0005-route-progress-and-anchor-recovery.md).

# Local venue maps and guided walks

Private plans and derived geometry stay outside Git. The reusable app supports locally bundled venue packages without uploading plans or requiring a backend. The original synthetic venue is the fresh-clone/CI fallback.

```sh
npm run venue:load -- /path/to/private-venue.json
npm run venue:validate
npm run mobile
```

Loading validates the package, saves a private copy to ignored work/private/venue.json, and generates ignored apps/mobile/src/config/venue.generated.json. `npm run venue:prepare` restores that local selection; it runs automatically after install. Another computer needs an explicitly transferred private package. Never commit the generated JSON or publish a bundle containing private venue data without authorization.

Plan-derived packages use exact feet-to-metre conversion (0.3048), labelled room polygons, windows, wall segments, door gaps, POIs, anchor nodes and test courses. Preserve printed clear dimensions. Record unresolved wall thicknesses, offsets and unreadable labels in provenance notes instead of marking a drawing as surveyed. Window/door schedules and furniture cannot be invented from a floor plan.

`venue:validate` checks schema, all anchor-to-POI routes, proper graph/wall intersections, and test-course/wall intersections. It does not prove clearance, handle every collinear/tangent contact, or validate as-built accuracy. Source-specific extraction/measurement reports belong with the private input in work/, not public fixtures.

## Phone flow

1. Select a short test course. Place start/corner/end tape marks using the course instructions and an independent measuring tape; clear the path. Confirm setup in the app.
2. Calibrate on a separate straight walk of at least 5 m, manually counting steps. Calibration saves locally on that phone. Edit or forget it when pace, user or carry style changes.
3. Stand at S, tap **I’m at the start**, then **Start walk**. Course heading is preselected. Screen up, phone top aligned with body, stand still for one second, then walk.
4. Tap **Finish at the end mark** while at E. Read endpoint and signed distance error. Interrupted walks are not completed accuracy trials. Save each run, including failures. Return physically to S before resetting/repeating.
5. Use **Test area**, zoom and arrows to inspect the map. Tap rooms or use destination chips for routes from the last established start; this is not continuous rerouting.

Recordings embed their venue snapshot and the selected course/completion declaration so replay works on the correct map: `npm run replay -- recording.json`. Explicit expected x/y arguments are still supported. Export includes private floor geometry; sharing is a user action through the OS. Calibration persists; unsaved runs are replaced when establishing a new start. Web checks UI only and cannot simulate native walking.

`npm run phone:qr -- exp://HOST:PORT` uses the currently generated venue for marker QRs. The Expo launch QR remains separate from location markers. Keep Metro running and verify the LAN/tunnel URL at handoff. SDK remains 57.

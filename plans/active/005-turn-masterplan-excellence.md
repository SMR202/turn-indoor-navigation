# Plan 005: TURN master plan — from working prototype to a product people trust

Status: ACTIVE (2026-11-13). Plan of record. It keeps the open items of [Plan 004](004-turn-1.0.md) and replaces its priorities. Owner's brief (2026-11-13): the app works but is not publishable; make every part excellent — look and feel, human interaction, mapping, multi-floor navigation, the positioning engine, the blue dot, the 3D map, search, phone differences, beacons and proximity offers — as one system, not a demo.

Rules stay as in [AGENTS.md](../../AGENTS.md): tick `[x]` only with evidence; label FACT, PROPOSED, DECISION and EXPERIMENT RESULT; simulation and synthetic tests never establish venue accuracy; private maps stay private.

## 0. The thesis

TURN's position is **high accuracy with little hardware**. Competitors buy accuracy with density: a beacon every 10–15 m and at least four heard everywhere (Esri, Pointr guidance). TURN buys it with intelligence:

1. **The phone's own motion is the backbone** (steps, turn rate, barometer). It is smooth and always available, but it drifts.
2. **The map removes most drift** for free: people cannot walk through walls, and corridors are narrow.
3. **Beacons go where drift becomes a decision**: entrances, junctions, stair and lift landings, long corridors. A beacon there resets the error exactly where a wrong turn would cost the user.
4. **The interface is honest and calm**: a steady dot that never crosses a wall, an uncertainty that is shown rather than hidden, and a quick way to correct it.

Everything below serves that thesis. Where a feature needs hardware we do not have (beacons mounted, a paid Apple account, a LiDAR phone), the plan says so and stops at the last step that can be verified.

## 1. What "publishable" means

A stranger can install TURN, open a building they have never seen, and reach a room on another floor without help, feeling that the app knows where they are. A venue owner can produce that building's map from whatever they have (CAD, an image, nothing) without a developer.

Measured targets (PROPOSED; to be measured on site, never claimed from simulation):

| Measure                                  | Target                                    |
| ---------------------------------------- | ----------------------------------------- |
| Route completed without help             | ≥ 9 of 10 walks                           |
| Position error at checkpoints            | median ≤ 2 m, 90th percentile ≤ 4 m       |
| Wrong floor shown for more than 10 s     | ≤ 1 in 20 floor changes                   |
| Dot jumps (more than 3 m in one second)  | ≤ 1 per 10 minutes of walking             |
| Time from opening the app to a first dot | ≤ 8 s at an entrance                      |
| Interface response to a tap              | ≤ 100 ms, 60 frames per second on the map |
| Search finds the intended place          | first three results in ≥ 95% of queries   |
| New venue from a plan image to published | ≤ 1 hour for a 30-room floor              |

## 2. Where the app is today (FACT, reviewed in the browser 2026-11-13)

What works: venue list, MapLibre map with extruded walls, search, place cards, routes with named turns, voice and haptic guidance, off-route detection, a particle-filter blue dot (steps + compass + beacons + walls), beacon planner and install sheet, Studio with place and room edits, device profiles.

What stops it from being publishable:

1. **The 3D map is murky.** Walls are 2.4 m dark slabs with nothing between them; rooms are empty holes without names; the building floats in a void; tall walls hide rooms. The camera turns with a lagging compass, the route preview does not frame the route, labels clip at the screen edge and controls overlap labels.
2. **Engineering shows through.** "Demo walk / Step by step / Live", "Private · LAN only", and setup controls sit in the visitor's flow.
3. **Floors do not change by themselves.** A floor change waits for a tap; there is no barometer use and no floor belief.
4. **Search is plain substring matching** with no synonyms, typo tolerance or "nearest".
5. **Maps cannot be made inside TURN.** Studio only imports a finished file; there is no drawing, tracing or geometry editing, and no path for a venue with no plan.
6. **Nothing reaches the user by itself**: no offers, no nudges, no venue detection.
7. **All phones get the same map quality and the same engine load**; only signal offset and stride differ.
8. **Nothing has been measured on a real installation** (beacons not mounted).

## 3. Experience and visual system

### 3.1 Principles

- **The map is the product.** Chrome is thin, floats over the map and gets out of the way; one accent colour; depth from soft shadow, never from borders.
- **One thing to do next.** Each state has a single primary action in the thumb zone (bottom third). Everything else is secondary or hidden (Hick's law, Fitts's law).
- **Recognition over recall.** Categories with icons, recent places, the destination always visible while navigating.
- **Always say what the system is doing.** A status for locating, approximate, confident, lost; skeletons while loading; an explicit offline state.
- **Motion explains.** Sheets spring, the camera eases, the selected room lifts. 160–360 ms, never decorative, all removable under Reduce Motion.
- **Touch is confirmed three ways**: a pressed state within 100 ms, a haptic tick for selections, a spoken or visible result.
- **Forgiving.** Undo instead of "Are you sure?"; a wrong position is corrected in two taps ("Not here?").
- **Accessible by default.** 44 pt targets, WCAG AA contrast, screen-reader labels, dynamic type, voice guidance, step-free routing.

### 3.2 Visual language (DECISION)

- **Light first.** Buildings are bright; a light map reads as architecture. Dark is a full second theme, not the default look of the product.
- **Map palette**: cool paper ground, a white building slab with a soft ambient shadow, room blocks in warm off-white with a faint category tint, corridor floor lighter than rooms so the walkable space reads as the "street", accent blue reserved for the user, the route and the selection.
- **Typography**: Inter; numbers tabular in distances and times; at most three sizes on a screen.
- **Shape**: 16–26 pt radii, pills for actions, circles for tools.
- **Iconography**: one stroke weight; category badges on the map are small, white-ringed, coloured.

### 3.3 Screen-by-screen changes

| Screen        | Change                                                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First run     | Three short pages; permission priming before each system prompt; skip.                                                                                                                                                                                   |
| Home          | The venue you are in first (QR, beacon or GPS match), then recent and nearby venues; light map thumbnails; no engineering labels.                                                                                                                        |
| Venue (map)   | Search bar on top; category chips; floor switcher with the current floor marked; tools: re-centre, 2D/3D, compass. Sheet with "Explore".                                                                                                                 |
| Search        | Full-height sheet; results while typing with distance and floor; synonyms and typo tolerance; "nearest"; empty state with suggestions.                                                                                                                   |
| Place         | Name, category, open state, walking time, floor; one primary action: Directions.                                                                                                                                                                         |
| Route preview | The whole route framed; floors as steps; time, distance, step-free switch; one Start button. Live guidance when positioning is available, otherwise a preview that advances by tap. The technical mode switch moves to Settings → Developer.             |
| Navigation    | Instruction banner (icon, distance, street-style text), "then" chip, route with direction chevrons, bottom bar (time, distance, arrival, End), floor-change card, re-centre pill after a pan, mute. Off-route and "turn around" as calm, coloured pills. |
| Arrival       | Destination highlighted, a short success moment, "Done" and "Rate this route".                                                                                                                                                                           |
| Setup tools   | Beacons, calibration and test walks live behind Settings → Venue setup (staff), not in the visitor flow.                                                                                                                                                 |

## 4. The blue dot: psychology and rules

People judge the whole system by the dot. Research and vendor experience agree on three points: jitter destroys trust faster than error; users notice the worst fix, not the median ([Crowd Connected](https://www.crowdconnected.com/blog/indoor-positioning-performance/)); and a visible uncertainty area is accepted and understood ([degraded-GPS study](https://typeset.io/pdf/pedestrian-navigation-with-degraded-gps-signal-investigating-4rod9lds1m.pdf)). Map matching supplies a large share of perceived accuracy ([Mapsted](https://mapsted.com/blog/bluetooth-indoor-positioning-systems-hidden-costs)).

DECISION — display rules (the engine's estimate is never altered; only what is drawn):

1. **Never impossible.** The dot is never drawn inside a wall or a room it could not have entered. Display positions move along walkable space.
2. **Never jittery.** The drawn dot follows the estimate through a critically damped filter with a speed limit of 2.2 m/s. A correction larger than 6 m fades out and in at the new place with a short "Position updated" note instead of sliding through walls.
3. **Size.** The dot is a constant 22 pt (about a body width at navigation zoom), white ring, soft shadow. At navigation zoom a 2.5 m corridor is roughly three dots wide: big enough to find at arm's length, small enough to say which side of a junction you are on.
4. **Uncertainty.** A translucent disc of the real 1σ radius, clamped between 1 m and 8 m. Beyond 8 m the room or zone is tinted instead of drawing a huge circle, and the status reads "Approximate location".
5. **Direction.** A beam whose width grows with heading uncertainty (30° confident, 90° unsure); hidden when unknown.
6. **On a route, ride the line.** Within tolerance (max(2 m, 1.5σ)) the dot is drawn on the route, as car navigation does. After 1.5 s outside tolerance it is released and the off-route pill appears.
7. **States.** Locating (grey, pulsing ring), confident (blue), approximate (pale blue, wide disc), stale (grey, "Last known position"), lost (no dot, a prompt to scan a code or walk to an open area).
8. **Trust repair.** After a correction the app says why in plain words ("Signal was weak in this corridor"). "Not here?" is always one tap away.

## 5. The 3D map and camera

### 5.1 Geometry (DECISION)

- **Rooms are low solid blocks** (1.2 m at overview scale) with the name and icon on top; **corridors, halls and outdoor areas are open floor**. This is how Apple, Mappedin and Pointr make indoor space legible: volumes for places, void for movement. Tall thin walls with empty rooms are removed.
- **The room you are in, the selected room and the destination open up**: they are drawn as floor with a low rim so the dot and the door are visible.
- **Selected and destination rooms lift and take the accent colour.**
- A **soft shadow under the building** grounds it; no free-floating geometry.
- Walls that belong to no room (partitions in halls) stay as low rims.
- Labels: room names on blocks, corridor names spaced and muted; collision-managed; never clipped by screen edges (padding).

### 5.2 Camera director (pure module, tested)

One function decides the camera from the situation; renderers only ease to it.

| Mode          | When                                 | Bearing                                                   | Pitch  | Zoom                             | Dot position |
| ------------- | ------------------------------------ | --------------------------------------------------------- | ------ | -------------------------------- | ------------ |
| Overview      | browsing                             | venue-up                                                  | 30°    | floor fits                       | –            |
| Place         | a place is selected                  | unchanged                                                 | 35°    | room fills a third of the view   | –            |
| Route preview | before Start                         | start→end points up                                       | 35°    | whole leg fits                   | –            |
| Follow        | walking the route                    | **course-up**: the route's direction at the dot, smoothed | 55°    | corridor ≈ 3 dots wide           | 68% down     |
| Manoeuvre     | within 8 m of a turn or floor change | course-up, eased towards the next segment                 | 45°    | closer                           | 62% down     |
| Arrive        | within 6 m of the destination        | holds                                                     | 40°    | destination and dot both visible | –            |
| Free          | after a pan, pinch or rotate         | user's                                                    | user's | user's                           | –            |

- **Course-up, not compass-up.** While on the route the map turns with the path, not with a noisy magnetometer; the beam still shows the phone's heading. Off the route the bearing follows the walked course.
- Bearing changes are rate-limited (90°/s) and take the short way round.
- After a gesture a "Re-centre" pill appears; guidance resumes following after 10 s of no touches.
- 2D/3D button (pitch 0° / mode pitch), compass button (north-up or venue-up and back to course-up).

## 6. Multi-floor navigation

### 6.1 What the user sees

1. Before the connector: "Take the stairs up to Level 2" with the destination floor shown; the banner counts down to the stairs.
2. On the stairs or in the lift: a floor-change card ("Going up · Level 1 → Level 2"); the map cross-fades to the new floor **when the app detects it**, or on "I'm on Level 2".
3. On the new floor: the dot appears at the landing with a wide uncertainty that tightens in the first steps.
4. Wrong floor (walked past, lift went elsewhere): "You are on Level 3. Your destination is on Level 2" and a new route from there.

### 6.2 Physics and estimation (DECISION)

- **Barometer.** Altitude from pressure: `h = 44330 · (1 − (p / p₀)^0.1903)`. Near ground level 1 hPa ≈ 8.4 m, so a 3.6 m floor is about 0.43 hPa. Phone sensors resolve 0.01–0.05 hPa after one second of smoothing. Weather drifts about 1 hPa per hour (0.002 m/s); stairs climb at 0.15–0.5 m/s and lifts at 0.5–2.5 m/s, two orders of magnitude faster. So only **relative** change over tens of seconds is used, never absolute altitude.
- **Detector.** A two-rate filter (fast 2 s and slow 60 s averages) gives the height change since "steady". A floor change is declared when the change exceeds 60% of the floor height and has settled (rate below 0.05 m/s for 2 s). Floors moved = round(change ÷ floor height). The climb rate and whether steps continue classify stairs, lift and escalator.
- **Disturbances.** Door slams and air handling produce steps of 0.1–0.3 hPa that look like 1–2.5 m; they are shorter than a floor and usually return, so the settle rule and the 60% threshold reject them. Half-landings pause the climb; the detector waits for settle. Per-venue floor heights are learned when a floor change is confirmed.
- **Floor belief.** Floor is a discrete state with a probability per floor, updated by three independent sources: the barometer (strong when available), beacons (each beacon carries its floor; a concrete slab costs 15–20 dB, so same-floor beacons dominate — the strongest few vote), and the route (a small prior that the walker did what the route says, only near a connector). The shown floor changes when one floor exceeds 0.8; a conflict asks the user.
- **No barometer** (many budget Android phones): beacons at every stair and lift landing plus the route prior, with the confirmation button as the fallback. The beacon planner therefore always proposes landing beacons.
- **After a change** the 2D filter restarts at the connector's node on the new floor with a 2.5 m spread and the last heading.

## 7. The positioning engine

### 7.1 Architecture (unchanged principle, extended sources)

Acquisition → normalised observations → fusion → pose → display. Live and replay share contracts. Each source is optional and feature-detected.

| Source                             | Gives                            | Phones                                                                | State                                        |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| Steps and turn rate (PDR)          | relative movement                | all                                                                   | built                                        |
| Compass + venue bearing            | absolute heading (weak)          | all                                                                   | built; disturbance detection added in Wave 3 |
| Floor plan (walls, walkable space) | constraint                       | all                                                                   | built                                        |
| BLE beacons (Eddystone, iBeacon)   | range-like evidence, room, floor | all                                                                   | built; awaits hardware                       |
| Barometer                          | floor changes                    | iPhones, most mid/high Android                                        | Wave 3                                       |
| QR location codes                  | exact fix                        | all                                                                   | built                                        |
| GPS at entrances                   | venue detection, entry fix       | all                                                                   | Wave 3 (maths), next native build (sensor)   |
| Camera relocalisation (AR)         | precise fix on demand            | ARKit/ARCore phones                                                   | later                                        |
| Wi-Fi RTT / fingerprints           | extra ranges                     | Android only                                                          | optional, later                              |
| Bluetooth Channel Sounding         | sub-metre ranges                 | iPhone 17 (iOS 27), some Android flagships; needs Bluetooth 6 beacons | watch; not with Minew E7 Plus                |

### 7.2 Fusion (FACT: built; PROPOSED: additions)

Built: a particle filter (500 hypotheses) over position, heading bias and stride scale; steps move the particles; walls kill or slide them; beacon readings weight them with a heavy-tailed likelihood and a shared offset that absorbs phone and body differences; fixes re-seed them.

Additions in this plan:

- **Start ambiguity.** For the first 15 m keep hypotheses for the opposite direction; the first turn or beacon resolves it.
- **Magnetic disturbance.** When the field strength or dip angle departs from the venue's normal, widen the compass uncertainty and lean on turn rate.
- **Stillness.** No diffusion while the phone is still; the dot must not creep.
- **Recovery.** When the likelihood of every hypothesis collapses (the "kidnapped" case), re-seed around the strongest beacons instead of drifting.
- **Body shadow.** A beacon behind the walker reads 5–15 dB lower; widen the noise for beacons behind the heading.
- **Budget.** Particle count scales with the phone's measured update time (200–800).
- **Learning, where it pays.** Per-model signal offsets and per-user stride are learned from confirmed positions (built). Next: a carry-mode classifier (hand, pocket, swinging) for step detection, and a learned inertial model only if PDR remains the limit after beacons.

### 7.3 Proof

Replay every recorded walk through each engine change; report median, 90th and 95th percentile error at checkpoints, jumps per minute, wrong-floor time and completion rate. Simulated walks cover what recordings cannot (beacon outages, wrong starts, 180° starts, floor changes, weak corridors).

## 8. Edge cases the product must handle

| Situation                                     | Behaviour                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| User ignores the route                        | Off-route pill at 1.5 s, new route at 6 s, never a nag; three ignored reroutes → "Just show the map".   |
| User passes the turn                          | "You passed your turn" and a route from where they are.                                                 |
| User walks the wrong way                      | "Turn around" after 5 m.                                                                                |
| User is not where the dot is                  | "Not here?" → tap the map or scan a code; the engine re-seeds; the correction trains the profile.       |
| Weak or no beacon signal                      | Motion and map carry on; the disc grows; status "Approximate"; no false precision.                      |
| Beacon dead or moved                          | Health report from phones; the engine ignores a beacon whose readings contradict motion.                |
| Wrong floor                                   | Floor belief catches it; reroute from the actual floor.                                                 |
| Lift goes to another floor first              | Barometer follows the real floor; route recalculated only when the doors would be left.                 |
| Phone in pocket or bag                        | Step detection by acceleration magnitude; voice and haptics carry guidance; heading from walked course. |
| Phone without compass, gyroscope or barometer | Feature-detected; guidance degrades to step-by-step preview with manual floor change.                   |
| Permission denied                             | The map, search and routes still work; a clear explanation and a one-tap path to Settings.              |
| Offline                                       | A loaded venue works fully; the banner says the data may be old.                                        |
| Destination closed or restricted              | Shown on the place card; routes avoid staff-only rooms.                                                 |
| Crowds, queues, slow walking, stopping        | Time estimates adapt to the walker's speed; stillness is not "lost".                                    |
| App backgrounded mid-route                    | Position resumes from motion history on return; a notification holds the next instruction (later).      |
| Low battery                                   | Scan and sensor rates fall; the map drops to 2D.                                                        |

## 9. The mapping module

### 9.1 The ladder: whatever the venue has

| Venue has                  | Path                                                                                                                                                                     | State                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| CAD or BIM (DXF, DWG, IFC) | Parse layers to walls, rooms and doors; review in Studio.                                                                                                                | PROPOSED (DXF first)        |
| Plan image or PDF          | **TURN-Mapper** (Zaki's module) converts automatically; Studio's **Trace** editor draws or corrects over the image; in-browser room detection proposes rooms in one tap. | Mapper built; editor Wave 5 |
| A photo of a wall plan     | Same as an image after perspective correction (four corner taps).                                                                                                        | PROPOSED                    |
| Nothing                    | Phone capture: LiDAR room scan on Pro iPhones (RoomPlan), an AR corner-tap walk on any ARKit/ARCore phone, or a measured sketch in Studio.                               | PROPOSED (native work)      |

### 9.2 Studio map editor (Wave 5)

- **Underlay**: drop an image; it stays in the browser, never uploaded with the venue unless the owner chooses.
- **Scale**: click two points, type the real distance; a second measurement checks it.
- **Draw**: rectangle and polygon rooms with snapping to corners, edges and right angles; doors that snap to walls; stairs and lifts; places; restricted areas.
- **Detect rooms**: one tap finds enclosed regions in the plan image and proposes them as rooms to accept, merge or delete.
- **Edit**: move corners, rename, change kind and category, delete; undo and redo.
- **Validate live**: rooms without doors, unreachable places, doors on no wall, floors not aligned; a test route before publishing.
- **Build**: the existing importer derives walls and the walk graph ([format](../../docs/MAP_IMPORT_FORMAT.md)); the result is a normal draft floor.
- TURN-Mapper stays the automatic path for FAST; its maps are not hand-edited (corrections go to Zaki). The editor serves venues without Mapper output and geometry fixes elsewhere.

### 9.3 Later mapping intelligence

- Text recognition for room names on plans; category suggestions from names (built).
- Multi-floor alignment view (stack floors with transparency; match stairs and lifts).
- Change detection between plan versions; stable IDs so edits survive re-imports.
- Survey check: walk a known distance on site and compare with the map scale.

## 10. Search

- **Index**: place names, categories, room numbers, tags and aliases from Studio.
- **Matching**: prefix and word-start boosts, typo tolerance (one edit per four letters), synonyms ("toilet", "washroom", "WC" → restrooms; "cafe", "coffee" → food), number tolerance ("room 12" = "R-12").
- **Ranking**: text score, then walking distance along the route graph from where the user is (not straight-line), same-floor preference, open now.
- **"Nearest"**: category chips answer with the closest by walking distance and show all on the map.
- **Empty and failed searches**: suggestions and categories; failed queries are logged anonymously so the venue can add aliases.
- **On the map**: results stay as pins while others dim; selecting one frames it.

## 11. Proximity offers and nudges

**Model** (authored in Studio, published with the venue, evaluated on the phone — no location leaves the device): title, text, linked place or URL, trigger (enter a room or zone, within N metres of a place or beacon, dwell longer than T), schedule (dates, hours), caps (per day, cooldown), priority.

**Rules** (DECISION):

- Opt-in, with a visible "Offers" switch; quiet during an active manoeuvre; at most one nudge on screen; never the same one twice inside its cooldown.
- A nudge is a small card under the search bar: what, where, how far; tap to see the place; swipe to dismiss.
- Only anonymous counts (shown, opened, dismissed) return to the venue.

**iPhone versus Android** (FACT from platform rules):

| Capability             | iPhone                                                                                                                                              | Android                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Foreground scanning    | Eddystone through CoreBluetooth; iBeacon only through CoreLocation ranging (about 1 Hz)                                                             | Both, raw advertisements                                                                                                  |
| Wake in the background | iBeacon region monitoring only; 20 regions per app, so one UUID per venue and "major" per floor or zone; a few seconds to run; delays up to minutes | Filtered background scans with a pending intent; scan start limit of 5 per 30 s; vendor battery managers may kill the app |
| Permissions            | Bluetooth; Location "While Using" for iBeacon ranging, "Always" for background wake; notifications                                                  | Nearby devices; Location (background location on Android 10+ for background use); notifications on 13+                    |
| Implication            | Background offers need the iBeacon slot and "Always" location: ask late, explain clearly                                                            | Works, but reliability varies by manufacturer                                                                             |

Wave 6 ships foreground nudges (no new permission). Background notifications need a native build and store review of the permission text.

## 12. Different phones

- **Signal**: receive strength differs by 5–15 dB between models (antenna, case, chipset). Google's exposure-notification work used a per-model offset table and found most models poorly calibrated, so TURN keeps three layers ([ADR-0015](../../decisions/0015-device-profiles.md)): platform default → per-model median shared through the server → this phone's own learned offset. The fusion also scores readings by their shape across beacons, not their absolute level.
- **Sensors**: capability report per phone (barometer, gyroscope, compass quality, step rate); each missing sensor has a defined fallback (§8).
- **Performance tiers** (Wave 3): the app measures frame time and engine update time in the first minute and sets a tier — full (3D blocks, 800 particles), balanced (3D, 400 particles), light (2D, 200 particles, fewer labels). Battery saver forces light.
- **Operating systems**: scan cadence, background limits and permission prompts per platform (§11); iOS returns no MAC addresses, so identity is always the advertised ID.
- **Screens**: layouts tested at 320 pt width, large phones and tablets; safe areas; dynamic type to 130%.
- **A test matrix**: at least one small iPhone, one recent iPhone, one Pixel, one Samsung, one budget Android without barometer.

## 13. Getting the most from the beacons

Minew E7 Plus (FACT, vendor pages: [E7 Plus](https://www.minew.com/product/e7-plus-beacon/)): up to six advertising slots (iBeacon, Eddystone UID/URL/TLM, device info, optional accelerometer data), about 100 m maximum range, replaceable 1000 mAh cell, IP67, configured with BeaconSET+.

DECISION — slot plan:

| Slot | Frame                                               | Interval, power   | Purpose                                                                                                                                             |
| ---- | --------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Eddystone-UID (venue namespace, beacon instance)    | 250–300 ms, 0 dBm | Positioning on both platforms (three to four packets a second per beacon is enough at walking pace and roughly doubles battery life against 100 ms) |
| 2    | iBeacon (venue UUID, major = floor, minor = beacon) | 800–1000 ms       | iPhone background wake; an instant floor hint                                                                                                       |
| 3    | Eddystone-TLM                                       | 10 s              | Battery voltage, temperature and uptime for beacon health                                                                                           |
| 4    | Accelerometer (if fitted)                           | on movement       | "This beacon was moved" alert                                                                                                                       |

- Power: 0 dBm by default; −4 to −8 dBm where beacons are dense (sharper proximity); +4 dBm in long open corridors.
- Placement: decision points first (entrances, junctions, every stair and lift landing), then corridors every 12–18 m alternating sides, 2.2–2.6 m high, clear of metal and of each other's line.
- Each beacon gets its own 1 m reference after mounting; each phone model its own offset.
- Static IDs can be copied: the engine distrusts readings that contradict motion, and layouts are signed by the server.
- Health: last heard, signal trend and battery from visitors' phones; alerts in TURN Ops.

Not possible with this hardware: Channel Sounding (needs Bluetooth 6 radios) and direction finding (needs antenna arrays).

## 14. System and company

- **Surfaces**: visitor app (iOS, Android, web "Lite" link and kiosk), TURN Studio (maps, content, beacons, offers, analytics), TURN Ops (health), setup tools inside the app, an SDK later.
- **Release path**: Apple Developer Program and Play Console accounts, signed builds, TestFlight and internal testing, crash and performance reporting, privacy policy and permission texts, store listing. The unsigned sideload expires every seven days and is for development only.
- **Backend**: hosted API with real sign-in, tenancy, backups and a content CDN; today it is a development server on the LAN.
- **Privacy**: positions are computed and kept on the phone; analytics are anonymous counts; private venues never leave the venue's network.
- **Quality**: one `npm run check`; replay regression for the engine; a browser pass for every screen; a device matrix before each release.

## 15. Work plan

Each wave ends with tests, a browser or phone check, updated status files and a commit. Evidence goes next to the tick.

**Wave 1 — Map that looks like a building**

- [ ] Room blocks, open floor, ambient shadow, light and dark palettes, labels on blocks.
- [ ] The current, selected and destination rooms open or lift.
- [ ] Route with casing and direction chevrons; new user puck (ring, beam, disc).
- [ ] Camera director (modes of §5.2), course-up following, re-centre, 2D/3D and compass controls.
- [ ] Web and native renderers on the same style.

**Wave 2 — Experience**

- [ ] Visitor flow without engineering wording; one Start button; setup tools moved.
- [ ] Route preview frames the route; floor steps.
- [ ] Navigation chrome: banner, then-chip, bottom bar, pills, floor-change card, arrival.
- [ ] Blue-dot display rules of §4 (ride the line, states, fade on large corrections).
- [ ] Empty, loading, error and offline states; accessibility pass.

**Wave 3 — Engine and floors**

- [ ] Barometric floor-change detector and floor belief (pure, tested on synthetic traces with drift, door slams, lifts, landings).
- [ ] Barometer source in the app (feature-detected) and automatic floor switch with confirmation fallback.
- [ ] Magnetic disturbance → heading uncertainty.
- [ ] Opposite-direction start hypothesis.
- [ ] Performance tiers and capability report.
- [ ] GPS entry fix maths (sensor wiring in the next native build).

**Wave 4 — Search**

- [ ] Search engine (synonyms, typos, numbers, walking-distance ranking) with tests.
- [ ] Search sheet, nearest-by-category, results on the map, failed-search logging.

**Wave 5 — Mapping studio**

- [ ] Trace editor: underlay, scale, rooms, doors, snapping, undo, validation, build.
- [ ] Room detection from the plan image.
- [ ] Edit an existing floor's geometry (round trip).
- [ ] DXF import (PROPOSED), phone capture (PROPOSED, native).

**Wave 6 — Offers**

- [ ] Offer model, Studio authoring, publish.
- [ ] On-device trigger engine (zones, dwell, schedule, caps) with tests; nudge card; anonymous counts.
- [ ] Background delivery (native build, permissions).

**Wave 7 — Hardware day and release**

- [ ] Native builds with barometer wiring checked on phones, GPS, TLM parsing, iBeacon regions.
- [ ] Beacons configured per §13, mounted per the install sheet, verification walk, measured report.
- [ ] Store accounts, signed builds, hosted backend.

## 16. Risks

- Maps from automatic conversion may have rooms that overlap corridors; block rendering then hides floor. The style falls back to rims for rooms that overlap walkable space by more than a fifth.
- MapLibre draws lines over extrusions, so the route is always visible but can appear to cross a block's top at shallow angles; blocks are kept low.
- Barometer behaviour differs by phone and building pressure control; thresholds are per venue and need on-site recordings.
- Free Apple signing blocks background modes and store release.
- Everything about accuracy remains unproven until the beacons are mounted.

## Sources

Vendor statements are claims, not verified results: [Pointr AI mapping](https://www.pointr.tech/ai-mapping), [Pointr MapScale Galileo](https://www.pointr.tech/blog/mapscale-galileo), [Mappedin Maker](https://www.mappedin.com/resources/blog/product-101-mappedin-maker/), [Mappedin blue dot](https://www.mappedin.com/resources/blog/what-is-blue-dot-wayfinding/), [Apple RoomPlan](https://developer.apple.com/augmented-reality/roomplan), [Minew E7 Plus](https://www.minew.com/product/e7-plus-beacon/), [Android presence calibration](https://source.android.com/docs/core/connect/presence-requirements), [RSSI and distance deep dive](https://medium.com/personaldata-io/inferring-distance-from-bluetooth-signal-strength-a-deep-dive-fe7badc2bb6d), [barometer floor detection](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4431287/), [Microsoft barometer study](https://microsoft.com/en-us/research/wp-content/uploads/2016/02/hotmobile14b.pdf), [iOS Channel Sounding](https://developer.apple.com/documentation/nearbyinteraction/nidevicecapability/supportsbluetoothchannelsounding.md), [Apple forum on beacon regions](https://developer.apple.com/forums/thread/90467), [GNSS indoor detection](https://ar5iv.arxiv.org/html/2007.14329), [indoor–outdoor transitions](https://www.beaconzone.co.uk/blog/?p=9910).

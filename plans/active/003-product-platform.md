# Plan 003: TURN product platform (Navigator, Studio, Ops, API)

Status: ACTIVE (2026-10-19). Positioning accuracy continues under [Plan 002](002-turn-masterplan.md); this plan builds the product around it. Same rules as Plan 002 §0: one task per branch, tick `[x]` only with evidence, never claim accuracy from synthetic data. The existing `apps/mobile` stays the **TURN Lab** test app and is not redesigned.

## 1. Product shape

Three audiences, one platform:

| Surface                                      | Who                             | What they do                                                                                                                                                                         | Tech                                                                                                             |
| -------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **TURN** (`apps/navigator`)                  | Visitors of a venue             | Find a venue (list, QR, link), explore the map, search and browse places, get directions, navigate with a live blue dot, save places, accessibility options                          | Expo SDK 57 (iOS, Android) plus the same code on the web as **TURN Lite** (no install, opened from a QR or link) |
| **TURN Studio** (`apps/console`, owner role) | Building owners and their staff | Create a venue, import floor plans (from the map-conversion module), edit places and categories, plan and monitor beacons, review analytics, publish versions, print QR entry points | Vite + React web app                                                                                             |
| **TURN Ops** (`apps/console`, staff role)    | Us                              | All organisations and venues, onboarding pipeline, survey and positioning-quality results (Plan 002 eval), publication review                                                        | Same web app, separate area                                                                                      |
| **API** (`apps/api`)                         | All of the above                | Organisations, venues, draft/published versions, public catalog, anonymous usage events, beacon health                                                                               | Node 24 + Hono, `node:sqlite`; local-first, deployable later                                                     |

Shared packages: `@turn/design` (brand tokens, logo), `@turn/map-scene` (one map styling and labelling engine for app and web), `@turn/venue-model` (venue package plus a GeoJSON import for the map module), `@turn/contracts` (API schemas), and the existing positioning packages.

### What we learned from the market

- Pointr sells white-label maps and wayfinding: a cloud dashboard for maps, content, wayfinding settings and beacon topology; automated CAD-to-map conversion (MapScale); usage and search analytics as an add-on; and "Express", which gives no-download access through QR codes, links and NFC (an App Clip on iOS). [Pointr packages](https://pointr.tech/packages), [Express](https://www.pointr.tech/express), [Maps Widget](https://docs-dev.pointr.tech/docs/shared/Features/MapWidget/Overview)
- Mappedin Maker: bulk floor-plan upload with AI detection of walls, doors and rooms; an automatic path network; location details such as hours and contacts; Draft & Publish; previews before going live; embeddable links. [Mappedin Maker](https://developer.mappedin.com/docs/maker)

**Where TURN should be better:**

- **Honest positioning UX:** an accuracy halo, "not sure" states and guidance withheld when uncertain. Competitors hide uncertainty.
- **Beacon planning with predicted coverage before buying hardware.**
- **A positioning-quality dashboard per venue** built from real walks (Plan 002 eval).
- **One codebase for app and no-install web.**
- **Draft/publish with validation**, so a broken map cannot be published.
- **A calmer, more modern interface:** fewer controls, animated sheets, and maps that read like a building rather than boxes.

## 2. Brand (DECISION, minimal and mature)

- **Name:** TURN.
- **Mark:** a rounded-square ink tile containing a route that leaves a position dot and turns right. One idea: _you are here, and this is your turn_.
- **Palette:**
  - neutrals: ink `#0B1220` (text), ink-600 `#3A4456`, ink-400 `#7A8394`, line `#E5E1DA`, paper `#F6F4F0` (background), surface `#FFFFFF`;
  - one accent, Turn Blue `#2F5AF2`, for routes, the blue dot and primary actions;
  - status colours used only for state: success `#1F8A5B`, warning `#B7791F`, danger `#C2412D`.
  - Map palette: warm land, white rooms, soft extruded walls, muted greens outdoors.
- **Type:** Inter, with tabular numbers for distances and times.
- **Motion:** springs for sheets and the map camera, 200–320 ms eased transitions, and a breathing pulse on the blue dot. Reduced motion is respected.

## 3. Tasks

### Foundation

- [ ] **F1.** `@turn/design`: colour, type, spacing, radius, elevation, motion and map-palette tokens; CSS variables for the web; logo and app-icon SVGs; an asset generator (PNG icons and splash).
- [ ] **F2.** `@turn/map-scene`: from a venue package to a render model:
  - room fills by kind;
  - a wall band and soft extrusion offset;
  - label placement with priority and collision culling per zoom;
  - POI glyph categories;
  - route splitting (walked / remaining);
  - camera fit and bounds.
    Pure TypeScript and tested.
- [ ] **F3.** Venue content model: categories, descriptions, hours, tags and accessibility per place (optional, backward-compatible); a **GeoJSON floor import** for the map-conversion module (rooms, walls, doors, labels → venue package with an automatic walk graph). Format documented for the module's author.
- [ ] **F4.** API contracts in `@turn/contracts`: organisation, venue, version, catalog entry, usage event.

### API

- [ ] **A1.** Hono server with `node:sqlite`:
  - organisations, venues, versions (draft, published, archived);
  - a validation gate on publish (`parseVenuePackage` plus a wall-crossing check);
  - public catalog and package endpoints with ETag;
  - anonymous usage events (opened, searched, route started, arrived);
  - beacon health reports;
  - dev auth with roles (owner, editor, staff).
    Seeds: the public sample venue, plus the private home venue only when present locally and never exposed beyond the LAN.
- [ ] **A2.** Tests: auth and role checks, publish validation, catalog, events, ETags.

### TURN app (end user)

- [ ] **N1.** App shell: Expo SDK 57, Inter fonts, brand theme, haptics, splash and icon from F1. A separate bundle ID `com.turn.app.dev` from Lab.
- [ ] **N2.** Onboarding: three calm animated cards and permission priming (motion, Bluetooth, camera for QR), skippable, with no dark patterns.
- [ ] **N3.** Venue discovery: a catalog from the API with an offline bundled fallback, search, recent venues, QR/link entry (`turn://venue/<id>`, and the `?venue=` URL on web).
- [ ] **N4.** Map view: F2 rendering, 60 fps pan/pinch with Reanimated and Gesture Handler (transform during the gesture, crisp re-render after), double-tap zoom, recentre/follow, a pulsing blue dot with an accuracy halo and heading cone, and an animated route line.
- [ ] **N5.** Search and browse: a category chip row, instant search with highlighted matches, recents.
- [ ] **N6.** Place sheet: an animated bottom sheet with snap points, place details, Directions, and save.
- [ ] **N7.** Directions: start from "my location" (positioning), a tapped point or a QR; route preview (time, distance, step-free); Start.
- [ ] **N8.** Live navigation: maneuver banner, progress, rerouting, the not-sure state, and an arrival moment, wired to the positioning runtime (R1). It must work without beacons via QR or tap start plus walking.
- [ ] **N9.** Saved places, settings (step-free, voice guidance, haptics, units, reduced motion) and an about/privacy page.
- [ ] **N10.** Usage events (opt-in, anonymous) to the API.
- [ ] **N11.** TURN Lite: the same app built for the web, opened from a QR code with no install; map, search and directions work there, and the position comes from a QR or a tap.

### TURN Studio and Ops (web)

- [ ] **C1.** Shell: sign-in (dev), organisation switcher, navigation, and the design system in CSS.
- [ ] **C2.** Venues: list, create, venue overview (status, last publish, beacons, quality).
- [ ] **C3.** Map: an interactive F2 map on the web, room and place inspector, place editing (name, category, description, hours, accessibility), GeoJSON import from the map module.
- [ ] **C4.** Beacons: planner (Plan 002 B3) with predicted coverage, layout export, a health table from reports.
- [ ] **C5.** Publish: a draft-versus-published diff summary, validation results, publish, a version history, and QR codes for entry points and TURN Lite links.
- [ ] **C6.** Analytics: sessions, top searches, top destinations, arrivals and route completion over time (privacy-preserving aggregates).
- [ ] **C7.** Ops: all organisations and venues, an onboarding pipeline (map imported → content → beacons → survey → published), positioning-quality results imported from `npm run eval`.

### Runtime and integration

- [ ] **R1.** Extract the phone positioning runtime (BLE stream, motion source, assisted tracker, display pose, navigation session) from `apps/mobile` into `packages/mobile-runtime`, and move the native module to `packages/turn-native` so the TURN app and Lab share it. Lab keeps working; native rebuilds are then needed for both apps.
- [ ] **R2.** Native builds of the TURN app (Android APK, iPhone CI IPA), and update the CI workflow.

## 4. Verification

- Unit tests for every package and the API; `npm run check`.
- Browser-pane checks of TURN Lite and Studio at phone and desktop sizes, with screenshots reviewed for layout, motion and empty or error states.
- Native: the TURN app on both phones after R2 (the user).
- No positioning-accuracy claims here; those come from Plan 002 gates.

## 5. Open decisions (need the user)

- Hosting and real authentication (for example Supabase or a managed Postgres) before any public deployment; until then everything runs on the LAN.
- The App Store/Play identity and the final bundle IDs.
- Whether venue owners may upload CAD (DWG/DXF) directly, or only the map module's GeoJSON.

## Progress (2026-10-18)

- DONE: A1/A2 API (`apps/api`, `npm run api`, port 8090, data in ignored `work/api-data`), tests in `apps/api/src/app.test.ts`.
- DONE: Visitor app `apps/navigator` (`npm run navigator`, port 8082): onboarding, venue catalog (API + offline cache + bundled demo), new map renderer, search, categories, place sheet, route preview with named steps, Demo walk and Step-by-step guidance, arrival, saved places, settings, QR scan. Verified in the web build (browser pane) only, not yet on a phone.
- DONE: Console `apps/console` (`npm run console`, port 5173): TURN Studio (checklist, map + GeoJSON import, QR entry markers, places, beacon planner with coverage, publish/versions/QR print, analytics) and TURN Ops (pipeline, accuracy entry, organisations). Verified in the browser pane.
- NOT DONE: R1 live positioning in the visitor app ("Live" option is disabled). Next action: extract `apps/mobile/src/{navigation/assisted-tracker,display-pose,assist-helpers,use-navigation-session}.ts`, `sensors/*` and `fingerprinting/ble.ts` into `packages/positioning-runtime` with re-export shims in the test app, then wire a `useLivePosition` hook into `apps/navigator/src/app/venue/[id].tsx`.
- NOT DONE: STATUS/PROJECT_STATE/reuse registry updates (hono, @vitejs/plugin-react, Inter OFL), native build of the visitor app (R2), phone test of the visitor app.

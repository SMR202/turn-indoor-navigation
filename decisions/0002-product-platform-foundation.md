# ADR-0002: Product platform and lightweight mobile monorepo

Date: 2026-09-24
Status: ACCEPTED (user-authorized implementation transition)
Supersedes: ADR-0001's research-only restriction; retains its durable context and reuse rules.

## Context

TURN is a reusable indoor-navigation platform with its own reference app. Centaurus is a prospective pilot/client, not the product boundary. Product slices and measured localization research must progress independently.

## Decision

- Use npm workspaces, TypeScript, Expo/React Native and Expo Router for the reference app. Shared packages have no React/native dependencies. Start with contracts, venue-model and routing only.
- Use Expo Go for the initial compatible UI smoke test; development builds are the deployment path when custom acquisition/BLE/native code requires them. Swift/Kotlin adapters may be added behind observation interfaces. No C++/Rust core until profiling or concrete library reuse justifies it.
- Adopt Zod for runtime boundary validation and inferred types. Use Vitest, ESLint and Prettier with a single lockfile and simple GitHub Actions checks.
- Adopt Graphlib 4.0.5 (MIT) for shortest paths; TURN owns venue/access rules and route formatting. This replaces a temporary handwritten baseline with a maintained, typed library without runtime dependencies.
- Adapt react-native-svg for the small metric floor/route view. Defer MapLibre until venue size, tiles or interaction requirements justify its integration cost. SVG avoids geographic-coordinate conversion for the first local floor.
- Keep backend/admin unscaffolded until authoring/publication needs them. Consider a TypeScript modular API plus PostgreSQL/PostGIS for spatial queries, but bundled venue JSON currently needs neither server nor database. No speculative microservices, Nx or Turborepo.

## Options and rationale

Native Swift/Kotlin offers direct sensing but doubles initial UI work. Expo preserves that escape hatch with faster team iteration. A shared native algorithm core would add build/FFI complexity before measurements. MapLibre remains a valid researched candidate; SVG fits a small schematic. A database now adds credentials, deployment and migrations without serving M0/M1.

## Consequences / validation

Web preview validates UI and workspace imports, not phone sensors or native correctness. Native builds/device smoke tests remain required before pilot readiness. Pure TypeScript contracts/routing form a future SDK boundary, not a published SDK or guaranteed Centaurus integration. See the reuse registry for pinned installed versions and upstream sources. Revisit rendering with realistic venue geometry and the stack with native acquisition measurements.

Sources checked 2026-09-24: [Expo monorepos](https://docs.expo.dev/guides/monorepos/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/), [SVG support](https://docs.expo.dev/versions/latest/sdk/svg/), [Zod](https://zod.dev/).

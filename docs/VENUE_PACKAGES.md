# Venue packages

A building is versioned data: metadata/provenance, metric floors, reviewed walkable polygons/walls/doors, POIs, graph nodes/edges, anchors/connectors and optional hashed asset references.

[Parser](../packages/venue-model/src/schema.ts) validates versions, structure, IDs, references, node bounds, connector/accessibility rules and anchor consistency. It does not prove polygon validity, wall clearance or survey accuracy. Review and future geometry validators remain required. Edges are straight segments; subdivide curved paths.

[Sample](../packages/venue-model/src/sample-venue.ts) is original fictional geometry, bundled and loaded locally; no Centaurus data/download service.

Authoring: obtain rights → calibrate scale/orientation → trace/review → place POIs/connectors/anchors → generate/review graph → validate → assign revision/publish. CV/OCR later suggests geometry into the same model.

Offline updater target (not implemented): download manifest/assets, verify schema/references/SHA-256, stage complete revision, activate atomically, keep last-good on failure. Pin active navigation to a revision. Choose authenticated distribution before external downloads; never trust arbitrary QR URLs/coordinates.

Unknown schema versions fail closed. Add explicit tested migrations before changing persisted formats. No database migrations exist yet.

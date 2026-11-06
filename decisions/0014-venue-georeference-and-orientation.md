# ADR-0014: Venue georeference and orientation

Date: 2026-11-06
Status: ACCEPTED
Context and evidence: At FAST the blue dot moved opposite to the walker. Code reading (Plan 004 §4) shows the map is not mirrored; the app had no idea where north is on a new venue's map and trusted the walker to face along the blue line. Both phones already give an absolute compass yaw (Android `TYPE_ROTATION_VECTOR`, iOS `xMagneticNorthZVertical`), but the venue-to-north offset was learned per phone and kept only on that phone.
Decision: Every venue gets a georeference in its venue content (server, editable in TURN Studio, not inside the map package so map re-exports keep it): `{ lat, lon, bearingDeg, declinationDeg?, source, updatedAt }`, where `bearingDeg` is the compass bearing (degrees clockwise from true north) of the map's +y axis and (lat, lon) is the map origin. Sources, best first: aligned by staff on a satellite view in Studio; measured on a setup walk (compass along a corridor, magnetic declination applied); learned from visitors' walks after the filter has fixed the heading (averaged on the server). Live starts use compass + bearing with σ 0.6 rad (wider when the magnetic field magnitude is abnormal), and the filter keeps a reversed-heading hypothesis for the first metres. Navigation turns the map heading-up.
Alternatives considered: (1) Keep per-phone learning only: every visitor's first walk in every venue would start blind. (2) Require a QR code or tap at every start: works but adds friction; kept as a fallback. (3) Store the bearing in the TURN-Mapper package: re-exports would overwrite staff corrections.
License/platform implications: None. Magnetic declination comes from a small table or a staff-entered value (Islamabad about +3°).
Consequences and risks: Indoor compass error near steel can exceed 30°; the compass is a prior, walls and beacons decide. Venues without a georeference behave as before.
Validation / revisit trigger: A walk starting facing away from the route on a FAST floor must turn the dot the right way within 10 m.
Supersedes / superseded by: Extends ADR-0011 (map constraints) and the October "direction learned from a marked heading" change.

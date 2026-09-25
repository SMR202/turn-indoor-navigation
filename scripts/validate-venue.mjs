import { readFile } from 'node:fs/promises';
import {
  parseVenuePackage,
  wallCrossings,
  pathLength,
  segmentsCross,
} from '@turn/venue-model';
import { calculateRoute } from '@turn/routing';
const venue = parseVenuePackage(
  JSON.parse(
    await readFile(
      process.argv[2] ?? 'apps/mobile/src/config/venue.generated.json',
      'utf8',
    ),
  ),
);
const crossings = wallCrossings(venue);
if (crossings.length)
  throw new Error(`Graph crosses walls: ${crossings.join(', ')}`);
let checkedRoutes = 0;
for (const anchor of venue.anchors)
  for (const poi of venue.pois) {
    const result = calculateRoute(venue, anchor.nodeId, poi.nodeId);
    if (result.status !== 'ok')
      throw new Error(`No route from ${anchor.id} to ${poi.id}`);
    checkedRoutes++;
  }
for (const course of venue.testCourses) {
  const anchor = venue.anchors.find((a) => a.id === course.anchorId);
  const floor = venue.floors.find((f) => f.id === anchor.floorId);
  if (pathLength(course.points) <= 0)
    throw new Error(`Zero-length test ${course.id}`);
  for (let i = 1; i < course.points.length; i++)
    if (
      floor.walls.some((w) =>
        segmentsCross(course.points[i - 1], course.points[i], w.from, w.to),
      )
    )
      throw new Error(`Test ${course.id} crosses a wall`);
}
console.log(
  JSON.stringify(
    {
      venue: venue.name,
      revision: venue.revision,
      rooms: venue.floors.reduce((s, f) => s + f.rooms.length, 0),
      checkedRoutes,
      properWallCrossings: crossings.length,
      courses: venue.testCourses.map((c) => ({
        id: c.id,
        lengthMetres: pathLength(c.points),
      })),
      limitations:
        'Checks model geometry only; does not establish as-built scale, furniture clearance or PDR accuracy.',
    },
    null,
    2,
  ),
);

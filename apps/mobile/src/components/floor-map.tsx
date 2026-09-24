import Svg, {
  Circle,
  Line,
  Polygon,
  Polyline,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import type { Route } from '@turn/contracts';
import type { VenuePackage } from '@turn/venue-model';

export function FloorMap({
  venue,
  floorId,
  route,
  startNodeId,
}: {
  venue: VenuePackage;
  floorId: string;
  route?: Route;
  startNodeId: string;
}) {
  const floor = venue.floors.find((item) => item.id === floorId)!;
  const y = (value: number) => floor.heightMetres - value;
  const start = venue.nodes.find((node) => node.id === startNodeId)!;
  // Split at floor transitions so no artificial line bridges separate floor segments.
  const segments: string[][] = [[]];
  for (const point of route?.geometry ?? []) {
    if (point.floorId === floorId)
      segments[segments.length - 1]!.push(`${point.x},${y(point.y)}`);
    else segments.push([]);
  }
  return (
    <Svg
      width="100%"
      height={280}
      viewBox={`-1 -1 ${floor.widthMetres + 2} ${floor.heightMetres + 2}`}
      accessibilityLabel={`Map of ${floor.label}${route ? ', route highlighted' : ''}`}
    >
      <Rect
        x={0}
        y={0}
        width={floor.widthMetres}
        height={floor.heightMetres}
        rx={1}
        fill="#eef0e9"
      />
      {floor.walkablePolygons.map((polygon, index) => (
        <Polygon
          key={index}
          points={polygon.map((point) => `${point.x},${y(point.y)}`).join(' ')}
          fill="#ffffff"
        />
      ))}
      {floor.walls.map((wall, index) => (
        <Line
          key={index}
          x1={wall.from.x}
          y1={y(wall.from.y)}
          x2={wall.to.x}
          y2={y(wall.to.y)}
          stroke="#b8c4b7"
          strokeWidth={0.15}
        />
      ))}
      {segments
        .filter((segment) => segment.length > 1)
        .map((segment, index) => (
          <Polyline
            key={index}
            points={segment.join(' ')}
            fill="none"
            stroke="#398459"
            strokeWidth={0.45}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      {venue.pois.map((poi) => {
        const node = venue.nodes.find((item) => item.id === poi.nodeId)!;
        if (node.floorId !== floorId) return null;
        return (
          <SvgText
            key={poi.id}
            x={node.x}
            y={y(node.y) - 0.8}
            fontSize={0.85}
            textAnchor="middle"
            fill="#183d34"
          >
            {poi.name}
          </SvgText>
        );
      })}
      {start.floorId === floorId && (
        <Circle
          cx={start.x}
          cy={y(start.y)}
          r={0.5}
          fill="#357bb8"
          stroke="#ffffff"
          strokeWidth={0.2}
        />
      )}
      <Line x1={2} y1={19} x2={7} y2={19} stroke="#62706b" strokeWidth={0.15} />
      <SvgText
        x={4.5}
        y={18.5}
        fontSize={0.7}
        textAnchor="middle"
        fill="#62706b"
      >
        5 m
      </SvgText>
    </Svg>
  );
}

import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import Svg, {
  Circle,
  Line,
  Polygon,
  Polyline,
  Rect,
  Text as SvgText,
  G,
} from 'react-native-svg';
import type { Route, Pose } from '@turn/contracts';
import type { VenuePackage } from '@turn/venue-model';
type Point = { x: number; y: number };
export function FloorMap({
  venue,
  floorId,
  route,
  pose,
  course,
  trace = [],
  onSelectRoom,
  selectedRoom,
}: {
  venue: VenuePackage;
  floorId: string;
  route?: Route;
  pose?: Pose;
  course?: Point[];
  trace?: Point[];
  onSelectRoom?: (id: string) => void;
  selectedRoom?: string;
}) {
  const floor = venue.floors.find((f) => f.id === floorId)!;
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState<Point | null>(null);
  const y = (v: number) => floor.heightMetres - v;
  const w = (floor.widthMetres + 1) / zoom,
    h = (floor.heightMetres + 1) / zoom;
  const cx = centre?.x ?? floor.widthMetres / 2,
    cy = y(centre?.y ?? floor.heightMetres / 2);
  const vx = cx - w / 2,
    vy = cy - h / 2;
  const points = (items: Point[]) =>
    items.map((p) => `${p.x},${y(p.y)}`).join(' ');
  const controls = [
    ['−', () => setZoom((v) => Math.max(1, v / 1.5))],
    ['+', () => setZoom((v) => Math.min(5, v * 1.5))],
    [
      'Fit',
      () => {
        setZoom(1);
        setCentre(null);
      },
    ],
    [
      'Test area',
      () => {
        if (course?.length) {
          setCentre({
            x: course.reduce((s, p) => s + p.x, 0) / course.length,
            y: course.reduce((s, p) => s + p.y, 0) / course.length,
          });
          setZoom(2.5);
        }
      },
    ],
    ['←', () => setCentre({ x: cx - w * 0.25, y: floor.heightMetres - cy })],
    ['↑', () => setCentre({ x: cx, y: floor.heightMetres - cy + h * 0.25 })],
    ['↓', () => setCentre({ x: cx, y: floor.heightMetres - cy - h * 0.25 })],
    ['→', () => setCentre({ x: cx + w * 0.25, y: floor.heightMetres - cy })],
  ] as const;
  const segments: Point[][] = [[]];
  for (const point of route?.geometry ?? []) {
    if (point.floorId === floorId) segments[segments.length - 1]!.push(point);
    else segments.push([]);
  }
  const bar = zoom > 2 ? 1 : 3;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {controls.map(([label, action]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`Map ${label}`}
            onPress={action}
            style={{
              minWidth: 42,
              minHeight: 42,
              padding: 10,
              backgroundColor: '#eef3ee',
              borderRadius: 9,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#183d34', fontWeight: '600' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Svg
        width="100%"
        height={540}
        viewBox={`${vx} ${vy} ${w} ${h}`}
        accessibilityLabel={`Map of ${floor.label}${route ? ', route highlighted' : ''}`}
      >
        <Rect
          x={0}
          y={0}
          width={floor.widthMetres}
          height={floor.heightMetres}
          fill="#e9e6df"
          stroke="#a8b3a9"
          strokeWidth={0.04}
        />
        {!floor.rooms.length &&
          floor.walkablePolygons.map((p, i) => (
            <Polygon key={i} points={points(p)} fill="white" />
          ))}
        {floor.rooms.map((room) => (
          <G key={room.id} onPress={() => onSelectRoom?.(room.id)}>
            <Polygon
              points={points(room.polygon)}
              fill={
                room.id === selectedRoom
                  ? '#d5ecdc'
                  : room.kind === 'outdoor'
                    ? '#e0e9d5'
                    : room.kind === 'stairs'
                      ? '#dedbd3'
                      : room.kind === 'circulation'
                        ? '#f6f4eb'
                        : '#fffdf8'
              }
            />
            <SvgText
              x={room.labelPosition.x}
              y={y(room.labelPosition.y)}
              fontSize={room.kind === 'outdoor' ? 0.25 : 0.27}
              fontWeight="600"
              textAnchor="middle"
              fill="#344f46"
            >
              {room.name}
            </SvgText>
            {room.dimensionLabel && (
              <SvgText
                x={room.labelPosition.x}
                y={y(room.labelPosition.y) + 0.36}
                fontSize={0.22}
                textAnchor="middle"
                fill="#718077"
              >
                {room.dimensionLabel}
              </SvgText>
            )}
          </G>
        ))}
        {floor.walls.map((wall, i) => (
          <Line
            key={i}
            x1={wall.from.x}
            y1={y(wall.from.y)}
            x2={wall.to.x}
            y2={y(wall.to.y)}
            stroke="#58685e"
            strokeWidth={0.045}
          />
        ))}
        {floor.windows.map((window, i) => (
          <Line
            key={`window-${i}`}
            x1={window.from.x}
            y1={y(window.from.y)}
            x2={window.to.x}
            y2={y(window.to.y)}
            stroke="#769fbc"
            strokeWidth={0.08}
          />
        ))}
        {floor.doors.map((door) => (
          <Circle
            key={door.id}
            cx={door.position.x}
            cy={y(door.position.y)}
            r={0.07}
            fill="#a2b9a6"
          />
        ))}
        {!floor.rooms.length &&
          venue.pois.map((poi) => {
            const node = venue.nodes.find((n) => n.id === poi.nodeId)!;
            return node.floorId === floorId ? (
              <SvgText
                key={poi.id}
                x={node.x}
                y={y(node.y) - 0.5}
                fontSize={0.45}
                textAnchor="middle"
                fill="#344f46"
              >
                {poi.name}
              </SvgText>
            ) : null;
          })}
        {segments
          .filter((s) => s.length > 1)
          .map((s, i) => (
            <Polyline
              key={i}
              points={points(s)}
              fill="none"
              stroke="#348259"
              strokeWidth={0.13}
              strokeLinecap="round"
            />
          ))}
        {course && (
          <Polyline
            points={points(course)}
            fill="none"
            stroke="#c88724"
            strokeWidth={0.1}
            strokeDasharray=".2 .14"
          />
        )}
        {course?.map((p, i) => (
          <G key={i}>
            <Circle
              cx={p.x}
              cy={y(p.y)}
              r={0.2}
              fill={i === 0 ? '#236e5b' : '#c88724'}
              stroke="white"
              strokeWidth={0.05}
            />
            <SvgText
              x={p.x}
              y={y(p.y) + 0.08}
              fontSize={0.22}
              fill="white"
              textAnchor="middle"
            >
              {i === 0 ? 'S' : i === course.length - 1 ? 'E' : '↱'}
            </SvgText>
          </G>
        ))}
        {trace.length > 1 && (
          <Polyline
            points={points(trace)}
            fill="none"
            stroke="#257caf"
            strokeWidth={0.09}
          />
        )}
        {pose?.floorId === floorId && (
          <G>
            <Circle
              cx={pose.position.x}
              cy={y(pose.position.y)}
              r={0.19}
              fill={pose.status === 'lost' ? '#bb6533' : '#257caf'}
              stroke="white"
              strokeWidth={0.05}
            />
            {pose.headingRad !== null && (
              <Line
                x1={pose.position.x}
                y1={y(pose.position.y)}
                x2={pose.position.x + 0.55 * Math.cos(pose.headingRad)}
                y2={y(pose.position.y + 0.55 * Math.sin(pose.headingRad))}
                stroke="#257caf"
                strokeWidth={0.1}
              />
            )}
          </G>
        )}
        <Rect
          x={vx + w * 0.05 - 0.1}
          y={vy + h * 0.93 - 0.42}
          width={bar + 0.25}
          height={0.65}
          fill="white"
          opacity={0.94}
        />
        <Line
          x1={vx + w * 0.05}
          y1={vy + h * 0.93}
          x2={vx + w * 0.05 + bar}
          y2={vy + h * 0.93}
          stroke="#344f46"
          strokeWidth={0.035}
        />
        <SvgText
          x={vx + w * 0.05 + bar / 2}
          y={vy + h * 0.93 - 0.13}
          textAnchor="middle"
          fontSize={0.23}
          fill="#344f46"
        >
          {bar} m
        </SvgText>
      </Svg>
      <Text style={{ color: '#718077', fontSize: 12 }}>
        Top = rear of plan · amber = test course · blue = walked trail
        {route ? ' · green = route' : ''}. Tap a room for details.
      </Text>
    </View>
  );
}

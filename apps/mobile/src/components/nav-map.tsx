import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Polygon,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';
import type { VenuePackage } from '@turn/venue-model';

type Point = { x: number; y: number };
export type MapPosition = Point & {
  /** Uncertainty radius in metres (drawn as the accuracy halo). */
  sigma?: number;
  /** Venue-frame heading, radians counter-clockwise from +x. */
  headingRad?: number | null;
};
export type MapBeacon = {
  tag: string;
  x: number;
  y: number;
  state: 'ok' | 'silent' | 'uncalibrated' | 'planned';
};

// Palette: warm land, white rooms, one saturated accent - close to mainstream map apps.
const C = {
  land: '#EFEBE3',
  room: '#FFFFFF',
  circulation: '#FAF7F1',
  outdoor: '#DCEBD0',
  stairs: '#E9E3D6',
  wall: '#BDB5A8',
  window: '#8FB8D9',
  label: '#5B6168',
  route: '#1A73E8',
  routeCasing: '#FFFFFF',
  dot: '#1A73E8',
  pin: '#D93025',
  beacon: '#7B3FE4',
};
const LABEL_FONT =
  Platform.OS === 'web'
    ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    : undefined;
const MIN_SCALE = 6;
const MAX_SCALE = 160;

function areaOf(poly: Point[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  return Math.abs(a / 2);
}

export function NavMap({
  venue,
  floorId,
  position,
  route,
  destination,
  beacons = [],
  selectedBeacon,
  follow = false,
  followScale = 46,
  onFollowChange,
  onTap,
  height = 420,
  hint,
  insets = { top: 0, bottom: 0 },
  style,
}: {
  venue: VenuePackage;
  floorId: string;
  position?: MapPosition | null;
  /** Polyline to highlight (remaining route). */
  route?: Point[];
  destination?: Point | null;
  beacons?: MapBeacon[];
  selectedBeacon?: string | null;
  follow?: boolean;
  followScale?: number;
  onFollowChange?: (follow: boolean) => void;
  onTap?: (p: Point) => void;
  height?: number | 'fill';
  hint?: string;
  /** Screen areas covered by overlays (search bar, bottom sheet): the map is framed in what remains. */
  insets?: { top: number; bottom: number };
  style?: ViewStyle;
}) {
  const floor = venue.floors.find((f) => f.id === floorId) ?? venue.floors[0]!;
  const [size, setSize] = useState({
    w: 360,
    h: typeof height === 'number' ? height : 480,
  });
  const [view, setView] = useState<{
    cx: number;
    cy: number;
    scale: number;
  } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const availH = Math.max(120, size.h - insets.top - insets.bottom);
  const focusY = insets.top + availH / 2;
  const focusRef = useRef(focusY);
  focusRef.current = focusY;
  const fit = Math.min(
    (size.w - 24) / floor.widthMetres,
    (availH - 16) / floor.heightMetres,
  );
  const current = view ?? {
    cx: floor.widthMetres / 2,
    cy: floor.heightMetres / 2,
    scale: Math.max(MIN_SCALE, fit),
  };
  const currentRef = useRef(current);
  currentRef.current = current;

  // Follow mode: keep the user centred at a walking-friendly zoom.
  useEffect(() => {
    if (!follow || !position) return;
    setView((v) => ({
      cx: position.x,
      cy: position.y,
      scale: v ? Math.max(v.scale, followScale * 0.9) : followScale,
    }));
  }, [follow, position?.x, position?.y]);

  const gesture = useRef({
    startDist: 0,
    startScale: 1,
    lastX: 0,
    lastY: 0,
    moved: 0,
    t0: 0,
  });
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const onFollowRef = useRef(onFollowChange);
  onFollowRef.current = onFollowChange;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const t = e.nativeEvent.touches;
          const g = gesture.current;
          g.moved = 0;
          g.t0 = Date.now();
          g.lastX = t[0]?.pageX ?? 0;
          g.lastY = t[0]?.pageY ?? 0;
          g.startDist = 0;
          g.startScale = currentRef.current.scale;
        },
        onPanResponderMove: (e) => {
          const t = e.nativeEvent.touches;
          const g = gesture.current;
          const v = currentRef.current;
          if (t.length >= 2) {
            const d = Math.hypot(
              t[0]!.pageX - t[1]!.pageX,
              t[0]!.pageY - t[1]!.pageY,
            );
            if (g.startDist === 0) {
              g.startDist = d;
              g.startScale = v.scale;
            } else {
              const scale = Math.max(
                MIN_SCALE,
                Math.min(MAX_SCALE, (g.startScale * d) / g.startDist),
              );
              g.moved += 20;
              onFollowRef.current?.(false);
              setView({ cx: v.cx, cy: v.cy, scale });
            }
            g.lastX = t[0]!.pageX;
            g.lastY = t[0]!.pageY;
            return;
          }
          g.startDist = 0;
          const x = t[0]?.pageX ?? g.lastX,
            y = t[0]?.pageY ?? g.lastY;
          const dx = x - g.lastX,
            dy = y - g.lastY;
          g.lastX = x;
          g.lastY = y;
          g.moved += Math.abs(dx) + Math.abs(dy);
          if (g.moved > 8) {
            onFollowRef.current?.(false);
            setView({
              cx: v.cx - dx / v.scale,
              cy: v.cy + dy / v.scale,
              scale: v.scale,
            });
          }
        },
        onPanResponderRelease: (e) => {
          const g = gesture.current;
          if (g.moved <= 8 && Date.now() - g.t0 < 400 && onTapRef.current) {
            const v = currentRef.current;
            const s = sizeRef.current;
            const px = e.nativeEvent.locationX,
              py = e.nativeEvent.locationY;
            onTapRef.current({
              x: v.cx + (px - s.w / 2) / v.scale,
              y: v.cy - (py - focusRef.current) / v.scale,
            });
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const u = 1 / current.scale; // one screen pixel in metres
  const vw = size.w * u,
    vh = size.h * u;
  const vx = current.cx - vw / 2,
    vy = -current.cy - focusY * u;
  const Y = (v: number) => -v;
  const pts = (items: Point[]) =>
    items.map((p) => `${p.x},${Y(p.y)}`).join(' ');
  const zoom = (factor: number) => {
    onFollowChange?.(false);
    setView({
      cx: current.cx,
      cy: current.cy,
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor)),
    });
  };
  const recenter = () => {
    if (position) {
      setView({
        cx: position.x,
        cy: position.y,
        scale: Math.max(current.scale, followScale),
      });
      onFollowChange?.(true);
    } else {
      setView(null);
    }
  };

  const halo =
    position?.sigma !== undefined
      ? Math.max(0.5, Math.min(position.sigma * 1.6, 6))
      : 0;
  const h = position?.headingRad;
  const cone =
    position && h !== undefined && h !== null
      ? (() => {
          const r = 38 * u;
          const a1 = h - 0.55,
            a2 = h + 0.55;
          return `M ${position.x} ${Y(position.y)} L ${position.x + r * Math.cos(a1)} ${Y(position.y + r * Math.sin(a1))} A ${r} ${r} 0 0 0 ${position.x + r * Math.cos(a2)} ${Y(position.y + r * Math.sin(a2))} Z`;
        })()
      : null;

  const roundBtn: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  };
  return (
    <View
      onLayout={(e: LayoutChangeEvent) =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      style={{
        height: height === 'fill' ? undefined : height,
        flex: height === 'fill' ? 1 : undefined,
        backgroundColor: C.land,
        overflow: 'hidden',
        ...style,
      }}
      accessibilityLabel={`Map of ${floor.label}`}
      {...responder.panHandlers}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <Svg width={size.w} height={size.h} viewBox={`${vx} ${vy} ${vw} ${vh}`}>
          {floor.rooms.length === 0 &&
            floor.walkablePolygons.map((p, i) => (
              <Polygon key={i} points={pts(p)} fill={C.room} />
            ))}
          {floor.rooms.map((room) => (
            <Polygon
              key={room.id}
              points={pts(room.polygon)}
              fill={
                room.kind === 'outdoor'
                  ? C.outdoor
                  : room.kind === 'stairs'
                    ? C.stairs
                    : room.kind === 'circulation'
                      ? C.circulation
                      : C.room
              }
            />
          ))}
          {floor.walls.map((w, i) => (
            <Line
              key={i}
              x1={w.from.x}
              y1={Y(w.from.y)}
              x2={w.to.x}
              y2={Y(w.to.y)}
              stroke={C.wall}
              strokeWidth={2.2 * u}
              strokeLinecap="round"
            />
          ))}
          {floor.windows.map((w, i) => (
            <Line
              key={`w${i}`}
              x1={w.from.x}
              y1={Y(w.from.y)}
              x2={w.to.x}
              y2={Y(w.to.y)}
              stroke={C.window}
              strokeWidth={3.2 * u}
            />
          ))}
          {floor.rooms
            .filter(
              (r) =>
                r.kind !== 'fixture' &&
                areaOf(r.polygon) * current.scale * current.scale > 2600,
            )
            .map((room) => (
              <SvgText
                key={`l${room.id}`}
                x={room.labelPosition.x}
                y={Y(room.labelPosition.y)}
                fontSize={11.5 * u}
                fontFamily={LABEL_FONT}
                fontWeight="600"
                textAnchor="middle"
                fill={C.label}
              >
                {room.name}
              </SvgText>
            ))}
          {route && route.length > 1 && (
            <>
              <Polyline
                points={pts(route)}
                fill="none"
                stroke={C.routeCasing}
                strokeWidth={10 * u}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Polyline
                points={pts(route)}
                fill="none"
                stroke={C.route}
                strokeWidth={6 * u}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
          {beacons.map((b) => (
            <G
              key={b.tag}
              transform={`translate(${b.x} ${Y(b.y)}) scale(${u})`}
            >
              <Circle
                r={selectedBeacon === b.tag ? 15 : 12}
                fill={
                  b.state === 'silent'
                    ? '#9AA0A6'
                    : b.state === 'planned'
                      ? 'white'
                      : C.beacon
                }
                stroke={b.state === 'planned' ? C.beacon : 'white'}
                strokeWidth={b.state === 'planned' ? 2.5 : 2}
                strokeDasharray={b.state === 'uncalibrated' ? '3 3' : undefined}
              />
              <SvgText
                y={4}
                fontSize={10.5}
                fontFamily={LABEL_FONT}
                fontWeight="700"
                textAnchor="middle"
                fill={b.state === 'planned' ? C.beacon : 'white'}
              >
                {b.tag}
              </SvgText>
            </G>
          ))}
          {destination && (
            <G
              transform={`translate(${destination.x} ${Y(destination.y)}) scale(${u})`}
            >
              <Path
                d="M0 0 C-7 -10 -13 -17 -13 -25 A13 13 0 1 1 13 -25 C13 -17 7 -10 0 0 Z"
                fill={C.pin}
                stroke="white"
                strokeWidth={2}
              />
              <Circle cx={0} cy={-25} r={4.5} fill="white" />
            </G>
          )}
          {position && halo > 0 && (
            <Circle
              cx={position.x}
              cy={Y(position.y)}
              r={halo}
              fill="rgba(26,115,232,0.14)"
              stroke="rgba(26,115,232,0.40)"
              strokeWidth={1.2 * u}
            />
          )}
          {cone && <Path d={cone} fill="rgba(26,115,232,0.28)" />}
          {position && (
            <>
              <Circle
                cx={position.x}
                cy={Y(position.y)}
                r={10 * u}
                fill="white"
              />
              <Circle
                cx={position.x}
                cy={Y(position.y)}
                r={7.2 * u}
                fill={C.dot}
              />
            </>
          )}
        </Svg>
      </View>
      <View style={{ position: 'absolute', right: 12, bottom: 14, gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={() => zoom(1.4)}
          style={roundBtn}
        >
          <Text style={{ fontSize: 22, color: '#3C4043', marginTop: -2 }}>
            +
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={() => zoom(1 / 1.4)}
          style={roundBtn}
        >
          <Text style={{ fontSize: 24, color: '#3C4043', marginTop: -3 }}>
            −
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={position ? 'Centre on my location' : 'Fit map'}
          onPress={recenter}
          style={roundBtn}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle
              cx={12}
              cy={12}
              r={4}
              fill={position && follow ? C.dot : 'none'}
              stroke={position ? C.dot : '#5F6368'}
              strokeWidth={2}
            />
            <Path
              d="M12 2v4M12 18v4M2 12h4M18 12h4"
              stroke={position ? C.dot : '#5F6368'}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>
      {hint ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 12,
            bottom: 14,
            maxWidth: size.w - 90,
            backgroundColor: 'rgba(32,33,36,0.82)',
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: 'white', fontSize: 12.5 }}>{hint}</Text>
        </View>
      ) : null}
      {Platform.OS === 'web' ? null : null}
    </View>
  );
}

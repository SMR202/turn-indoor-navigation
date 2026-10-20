import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDecay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { motion } from '@turn/design';
import {
  fitCamera,
  placeLabels,
  pointInPolygon,
  polylineLength,
  slicePolyline,
  type P,
  type PlacedLabel,
  type Scene,
  type ScenePlace,
} from '@turn/map-scene';
import { Icon } from '../components/icon';
import type { LiveDotValues } from '../lib/live-dot';
import { catColor, F } from '../theme';

/** Camera: map point (x, y) in metres at the screen centre, `s` screen pixels per metre. */
type Camera = { x: number; y: number; s: number };
export type MapUser = {
  x: number;
  y: number;
  sigma: number;
  heading: number | null;
  live: boolean;
};
export type CameraRequest =
  | { kind: 'fit' }
  | { kind: 'point'; x: number; y: number; zoom?: number }
  | { kind: 'points'; points: P[] };
export type CameraCommand = CameraRequest & { id: number };

type Props = {
  scene: Scene;
  /** Screen pixels covered by overlays (search bar, sheet), so framing keeps content visible. */
  insets: { top: number; bottom: number };
  selectedPlace: ScenePlace | null;
  route: P[] | null;
  /** Metres already walked along the route. */
  walked?: number;
  routeStart?: P | null;
  user: MapUser | null;
  command: CameraCommand | null;
  follow?: boolean;
  onSelect: (placeId: string | null) => void;
  /** When set, taps report the map point instead of selecting places (position corrections). */
  onMapTap?: (p: P) => void;
  onGesture?: () => void;
  /** Small labelled pins, such as "To Level 1" where the route changes floor. */
  markers?: { key: string; x: number; y: number; text: string; icon: string }[];
  /**
   * The live blue dot, animated on the UI thread (pass the same object on every render). With
   * `follow` the camera glides after it every frame.
   */
  liveDot?: LiveDotValues;
  liveVisible?: boolean;
};

const MARGIN = 140; // pixels of map drawn beyond each screen edge so pans reveal content instantly
const EASE = Easing.bezier(...motion.easing.standard);

/**
 * Indoor map renderer. Geometry is crisp vector SVG re-rendered when the camera settles; between
 * settles pan and zoom run on the UI thread as a composited transform, so gestures stay at frame rate.
 * Labels, pins and the blue dot are native views positioned from the same shared camera.
 */
export const VenueMap = memo(function VenueMap(props: Props) {
  const { scene, insets } = props;
  const pal = scene.palette;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const cs = useSharedValue(1);
  const vw = useSharedValue(0);
  const vh = useSharedValue(0);
  // Reference camera (fixed) and rendered camera; see transform composition below.
  const refX = useSharedValue(0);
  const refY = useSharedValue(0);
  const refS = useSharedValue(1);
  const pending = useSharedValue(false);
  const limits = useSharedValue({
    whole: 1,
    minS: 1,
    maxS: 100,
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1,
  });
  const [rendered, setRendered] = useState<Camera | null>(null);
  const [ref, setRef] = useState<Camera | null>(null);
  const rendS = useSharedValue(1);
  const rendX = useSharedValue(0);
  const rendY = useSharedValue(0);

  const fit = useCallback(
    (points: P[] | null, w: number, h: number, pad = 28): Camera => {
      const b = points?.length
        ? {
            minX: Math.min(...points.map((p) => p.x)),
            maxX: Math.max(...points.map((p) => p.x)),
            minY: Math.min(...points.map((p) => p.y)),
            maxY: Math.max(...points.map((p) => p.y)),
          }
        : scene.bounds;
      const grow = points?.length ? 4 : 0;
      const cam = fitCamera(
        {
          minX: b.minX - grow,
          maxX: b.maxX + grow,
          minY: b.minY - grow,
          maxY: b.maxY + grow,
        },
        { width: w, height: h },
        insets,
        pad,
      );
      // Never frame a short route closer than ~3x the whole-floor view: context matters more than size.
      const s = Math.min(
        cam.scale,
        points?.length ? limits.value.whole * 3 : limits.value.maxS,
      );
      return { x: cam.cx, y: cam.cy + (cam.focusY - h / 2) / s, s };
    },
    [scene, insets, limits],
  );

  // First layout / new venue: frame the whole floor.
  const initialised = useRef<string | null>(null);
  useEffect(() => {
    if (
      !size.w ||
      !size.h ||
      initialised.current === scene.venueId + scene.floorId
    )
      return;
    initialised.current = scene.venueId + scene.floorId;
    const whole = fitCamera(
      scene.bounds,
      { width: size.w, height: size.h },
      { top: 0, bottom: 0 },
      16,
    );
    limits.value = {
      whole: whole.scale,
      minS: whole.scale * 0.55,
      maxS: Math.max(whole.scale * 9, 70),
      minX: scene.bounds.minX,
      maxX: scene.bounds.maxX,
      minY: scene.bounds.minY,
      maxY: scene.bounds.maxY,
    };
    const cam = fit(null, size.w, size.h);
    cx.value = cam.x;
    cy.value = cam.y;
    cs.value = cam.s;
    refX.value = cam.x;
    refY.value = cam.y;
    refS.value = cam.s;
    rendX.value = cam.x;
    rendY.value = cam.y;
    rendS.value = cam.s;
    setRef(cam);
    setRendered(cam);
  }, [
    size,
    scene,
    fit,
    cx,
    cy,
    cs,
    refX,
    refY,
    refS,
    rendX,
    rendY,
    rendS,
    limits,
  ]);

  const commit = useCallback(
    (x: number, y: number, s: number) => {
      pending.value = false;
      rendX.value = x;
      rendY.value = y;
      rendS.value = s;
      setRendered({ x, y, s });
    },
    [pending, rendX, rendY, rendS],
  );

  const animateTo = useCallback(
    (cam: Camera, duration = 700) => {
      cancelAnimation(cx);
      cancelAnimation(cy);
      cancelAnimation(cs);
      const cfg = { duration, easing: EASE };
      cx.value = withTiming(cam.x, cfg);
      cy.value = withTiming(cam.y, cfg);
      cs.value = withTiming(cam.s, cfg, (done) => {
        if (done) scheduleOnRN(commit, cam.x, cam.y, cam.s);
      });
    },
    [cx, cy, cs, commit],
  );

  // Camera commands from the screen (fit, focus a place, frame a route).
  useEffect(() => {
    const c = props.command;
    if (!c || !size.w || !rendered) return;
    if (c.kind === 'fit') animateTo(fit(null, size.w, size.h));
    else if (c.kind === 'points') animateTo(fit(c.points, size.w, size.h, 36));
    else {
      const s = Math.min(
        limits.value.maxS,
        Math.max(
          c.zoom ?? Math.max(cs.value, limits.value.whole * 2.2),
          limits.value.minS,
        ),
      );
      const visibleMid = insets.top + (size.h - insets.top - insets.bottom) / 2;
      animateTo({ x: c.x, y: c.y + (visibleMid - size.h / 2) / s, s });
    }
  }, [props.command?.id]);

  // Follow the walker (navigation mode).
  useEffect(() => {
    const u = props.user;
    if (!props.follow || !u || !size.w) return;
    const s = Math.max(cs.value, limits.value.minS * 3.2);
    const visibleMid = insets.top + (size.h - insets.top - insets.bottom) / 2;
    animateTo({ x: u.x, y: u.y + (visibleMid - size.h / 2) / s, s }, 650);
  }, [props.follow, props.user?.x, props.user?.y]);

  // ---- Gestures (UI thread) ------------------------------------------------------------------
  const maybeCommit = () => {
    'worklet';
    if (pending.value) return;
    const dx = Math.abs((rendX.value - cx.value) * cs.value);
    const dy = Math.abs((cy.value - rendY.value) * cs.value);
    const k = cs.value / rendS.value;
    if (dx > MARGIN * 0.55 || dy > MARGIN * 0.55 || k > 1.45 || k < 0.7) {
      pending.value = true;
      scheduleOnRN(commit, cx.value, cy.value, cs.value);
    }
  };
  const settle = () => {
    'worklet';
    const l = limits.value;
    const x = Math.min(l.maxX, Math.max(l.minX, cx.value));
    const y = Math.min(l.maxY, Math.max(l.minY, cy.value));
    if (x !== cx.value || y !== cy.value) {
      cx.value = withSpring(x, motion.spring.camera);
      cy.value = withSpring(y, motion.spring.camera, () =>
        scheduleOnRN(commit, x, y, cs.value),
      );
    } else scheduleOnRN(commit, cx.value, cy.value, cs.value);
  };
  // Live follow: the camera eases after the animated dot every frame (UI thread), re-rendering the
  // vector geometry only when it drifts past the drawn margin.
  const dot = props.liveDot;
  const followLive = useSharedValue(false);
  const followDy = useSharedValue(0);
  useEffect(() => {
    const on = Boolean(props.follow && dot && props.liveVisible && size.w);
    if (on) {
      const visibleMid = insets.top + (size.h - insets.top - insets.bottom) / 2;
      followDy.value = visibleMid - size.h / 2;
      cancelAnimation(cx);
      cancelAnimation(cy);
      const s1 = Math.max(cs.value, limits.value.minS * 3.2);
      if (s1 > cs.value * 1.01)
        cs.value = withTiming(s1, { duration: 550, easing: EASE }, (done) => {
          if (done) scheduleOnRN(commit, cx.value, cy.value, s1);
        });
    }
    followLive.value = on;
  }, [
    props.follow,
    props.liveVisible,
    size.w,
    size.h,
    insets.top,
    insets.bottom,
  ]);
  useFrameCallback((frame) => {
    'worklet';
    if (!followLive.value || !dot) return;
    const dt = Math.min(0.1, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const k = 1 - Math.exp(-dt / 0.28);
    const tx = dot.x.value;
    const ty = dot.y.value + followDy.value / cs.value;
    cx.value += (tx - cx.value) * k;
    cy.value += (ty - cy.value) * k;
    maybeCommit();
  });

  const notify = props.onGesture;
  const pan = usePanGesture({
    maxPointers: 2,
    onBegin: () => {
      'worklet';
      followLive.value = false;
      cancelAnimation(cx);
      cancelAnimation(cy);
      if (notify) scheduleOnRN(notify);
    },
    onUpdate: (e) => {
      'worklet';
      cx.value -= e.changeX / cs.value;
      cy.value += e.changeY / cs.value;
      maybeCommit();
    },
    onDeactivate: (e) => {
      'worklet';
      const l = limits.value;
      cx.value = withDecay({
        velocity: -e.velocityX / cs.value,
        deceleration: 0.994,
        clamp: [l.minX, l.maxX],
      });
      cy.value = withDecay(
        {
          velocity: e.velocityY / cs.value,
          deceleration: 0.994,
          clamp: [l.minY, l.maxY],
        },
        () => settle(),
      );
    },
  });
  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      followLive.value = false;
      cancelAnimation(cs);
    },
    onUpdate: (e) => {
      'worklet';
      const l = limits.value;
      const s0 = cs.value;
      const s1 = Math.min(l.maxS, Math.max(l.minS, s0 * e.scaleChange));
      const mx = cx.value + (e.focalX - vw.value / 2) / s0;
      const my = cy.value + (vh.value / 2 - e.focalY) / s0;
      cs.value = s1;
      cx.value = mx - (e.focalX - vw.value / 2) / s1;
      cy.value = my - (vh.value / 2 - e.focalY) / s1;
      maybeCommit();
    },
    onDeactivate: () => {
      'worklet';
      settle();
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      const l = limits.value;
      const s1 = Math.min(l.maxS, cs.value * 2);
      const mx = cx.value + (e.x - vw.value / 2) / cs.value;
      const my = cy.value + (vh.value / 2 - e.y) / cs.value;
      const x = mx - (e.x - vw.value / 2) / s1;
      const y = my - (vh.value / 2 - e.y) / s1;
      const cfg = { duration: 380, easing: EASE };
      cx.value = withTiming(x, cfg);
      cy.value = withTiming(y, cfg);
      cs.value = withTiming(s1, cfg, () => scheduleOnRN(commit, x, y, s1));
    },
  });
  const onSelect = props.onSelect;
  const onMapTap = props.onMapTap;
  const pick = useCallback(
    (sx: number, sy: number) => {
      const s = cs.value;
      const m = {
        x: cx.value + (sx - vw.value / 2) / s,
        y: cy.value + (vh.value / 2 - sy) / s,
      };
      if (onMapTap) return onMapTap(m);
      const near = scene.places
        .map((p) => ({ p, d: Math.hypot(p.x - m.x, p.y - m.y) * s }))
        .filter((o) => o.d < 22)
        .sort((a, b) => a.d - b.d)[0];
      if (near) return onSelect(near.p.id);
      const room = scene.rooms
        .filter((r) => r.placeId && pointInPolygon(m, r.polygon))
        .sort((a, b) => a.area - b.area)[0];
      onSelect(room?.placeId ?? null);
    },
    [scene, onSelect, onMapTap, cs, cx, cy, vw, vh],
  );
  const tap = useTapGesture({
    requireToFail: doubleTap,
    runOnJS: true,
    onActivate: (e) => pick(e.x, e.y),
  });
  const gesture = useSimultaneousGestures(pan, pinch, doubleTap, tap);

  // ---- Composited transform -----------------------------------------------------------------
  // screen = C + T + k (p - C). Outer view maps reference → live camera (UI thread, every frame);
  // inner view maps rendered → reference (React, changes only together with the SVG it wraps).
  const outer = useAnimatedStyle(() => ({
    transform: [
      { translateX: (refX.value - cx.value) * cs.value },
      { translateY: (cy.value - refY.value) * cs.value },
      { scale: cs.value / refS.value },
    ],
  }));
  const inner =
    rendered && ref
      ? {
          transform: [
            { translateX: (rendered.x - ref.x) * ref.s },
            { translateY: (ref.y - rendered.y) * ref.s },
            { scale: ref.s / rendered.s },
          ],
        }
      : null;

  const labels = useMemo<PlacedLabel[]>(
    () =>
      rendered
        ? placeLabels(scene, rendered.s, { minSize: 11, maxSize: 13.5 })
        : [],
    // Quantise so small zoom steps do not reshuffle labels.
    [scene, rendered ? Math.round(Math.log(rendered.s) * 8) : 0],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    vw.value = width;
    vh.value = height;
    setSize({ w: width, h: height });
  };
  // Web: mouse-wheel and trackpad zoom around the pointer.
  const rootRef = useRef<View>(null);
  const hasRendered = rendered !== null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !hasRendered) return;
    const el = rootRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      const l = limits.value;
      const s0 = cs.value;
      const s1 = Math.min(
        l.maxS,
        Math.max(l.minS, s0 * Math.exp(-e.deltaY * 0.0015)),
      );
      const mx = cx.value + (fx - vw.value / 2) / s0;
      const my = cy.value + (vh.value / 2 - fy) / s0;
      cs.value = s1;
      cx.value = mx - (fx - vw.value / 2) / s1;
      cy.value = my - (vh.value / 2 - fy) / s1;
      clearTimeout(timer);
      timer = setTimeout(() => commit(cx.value, cy.value, cs.value), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasRendered, commit, cs, cx, cy, vw, vh, limits]);
  const cam = { cx, cy, cs, vw, vh };
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={rootRef}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: pal.land, overflow: 'hidden' },
        ]}
        onLayout={onLayout}
      >
        {rendered && size.w > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, outer]}
          >
            <View
              style={[
                {
                  position: 'absolute',
                  left: -MARGIN,
                  top: -MARGIN,
                  width: size.w + 2 * MARGIN,
                  height: size.h + 2 * MARGIN,
                },
                inner,
              ]}
            >
              <Geometry
                scene={scene}
                cam={rendered}
                w={size.w}
                h={size.h}
                selectedRoomId={props.selectedPlace?.roomId ?? null}
                route={props.route}
                walked={props.walked ?? 0}
              />
            </View>
          </Animated.View>
        )}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {labels.map((l) => (
            <MapLabel
              key={`${l.id}:${l.iconOnly ? 0 : l.lines.length}`}
              label={l}
              cam={cam}
              pal={pal}
              hidden={props.selectedPlace?.roomId === l.id}
            />
          ))}
          {props.markers?.map((m) => (
            <MapPill key={m.key} marker={m} cam={cam} pal={pal} />
          ))}
          {props.routeStart && (
            <StartMarker at={props.routeStart} cam={cam} color={pal.route} />
          )}
          {props.selectedPlace && (
            <Pin
              key={props.selectedPlace.id}
              place={props.selectedPlace}
              cam={cam}
            />
          )}
          {dot && props.liveVisible && (
            <LiveUserDot
              v={dot}
              cam={cam}
              color={pal.dot}
              halo={pal.dotHalo}
              ring={pal.dotRing}
            />
          )}
          {props.user && (
            <UserDot
              user={props.user}
              cam={cam}
              color={pal.dot}
              halo={pal.dotHalo}
              ring={pal.dotRing}
            />
          )}
        </View>
      </View>
    </GestureDetector>
  );
});

type Cam = {
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  cs: SharedValue<number>;
  vw: SharedValue<number>;
  vh: SharedValue<number>;
};

// ---- Vector geometry (rendered camera, pixel coordinates) -----------------------------------
const Geometry = memo(function Geometry({
  scene,
  cam,
  w,
  h,
  selectedRoomId,
  route,
  walked,
}: {
  scene: Scene;
  cam: Camera;
  w: number;
  h: number;
  selectedRoomId: string | null;
  route: P[] | null;
  walked: number;
}) {
  const pal = scene.palette;
  const ox = w / 2 + MARGIN;
  const oy = h / 2 + MARGIN;
  const X = (x: number) => (ox + (x - cam.x) * cam.s).toFixed(1);
  const Y = (y: number) => (oy - (y - cam.y) * cam.s).toFixed(1);
  const poly = (pts: P[], dy = 0) =>
    pts
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${X(p.x)} ${(Number(Y(p.y)) + dy).toFixed(1)}`,
      )
      .join('') + 'Z';
  const line = (pts: P[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join('');
  const ext = Math.max(1.5, Math.min(7, scene.extrusionMetres * cam.s));
  const byKind = (k: string) => scene.rooms.filter((r) => r.kind === k);
  const footprint = scene.rooms
    .filter((r) => r.kind !== 'outdoor')
    .map((r) => poly(r.polygon))
    .join('');
  const shadows = scene.rooms
    .filter((r) => r.casts)
    .map((r) => poly(r.polygon, ext))
    .join('');
  const walls = scene.walls.map((wl) => line([wl.from, wl.to])).join('');
  const windows = scene.windows.map((wl) => line([wl.from, wl.to])).join('');
  const wallW = Math.max(1.2, Math.min(7, 0.16 * cam.s));
  const routeW = Math.max(5, Math.min(12, 0.42 * cam.s));
  const selected = scene.rooms.find((r) => r.id === selectedRoomId);
  const total = route ? polylineLength(route) : 0;
  const draw = useDrawProgress(route);
  const shown = total * draw;
  const done = route ? slicePolyline(route, 0, Math.min(walked, shown)) : [];
  const ahead = route
    ? slicePolyline(route, Math.min(walked, shown), shown)
    : [];
  return (
    <Svg width={w + 2 * MARGIN} height={h + 2 * MARGIN}>
      <Path
        d={footprint}
        fill={pal.extrusion}
        stroke={pal.extrusion}
        strokeWidth={Math.max(3, 0.5 * cam.s)}
        strokeLinejoin="round"
      />
      {byKind('outdoor').map((r) => (
        <Path key={r.id} d={poly(r.polygon)} fill={pal.outdoor} />
      ))}
      {byKind('circulation').map((r) => (
        <Path key={r.id} d={poly(r.polygon)} fill={pal.circulation} />
      ))}
      <Path d={shadows} fill={pal.extrusion} />
      {scene.rooms
        .filter((r) => r.kind !== 'outdoor' && r.kind !== 'circulation')
        .map((r) => (
          <Path
            key={r.id}
            d={poly(r.polygon)}
            fill={r.id === selectedRoomId ? pal.roomSelected : r.fill}
          />
        ))}
      <Path
        d={walls}
        stroke={pal.wall}
        strokeWidth={wallW}
        strokeLinecap="round"
        fill="none"
      />
      {windows ? (
        <Path
          d={windows}
          stroke={pal.window}
          strokeWidth={Math.max(1, wallW * 0.45)}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      {selected && (
        <Path
          d={poly(selected.polygon)}
          fill="none"
          stroke={pal.route}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {route && (
        <>
          <Path
            d={line(done.length ? done : [])}
            stroke={pal.routeWalked}
            strokeWidth={routeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d={line(ahead)}
            stroke={pal.routeCasing}
            strokeWidth={routeW + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d={line(ahead)}
            stroke={pal.route}
            strokeWidth={routeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}
    </Svg>
  );
});

/** Route "draws itself" from the start when a new route appears. */
function useDrawProgress(route: P[] | null) {
  const key = route
    ? `${route.length}:${route[0]?.x}:${route.at(-1)?.x}:${route.at(-1)?.y}`
    : '';
  const [p, setP] = useState(1);
  useEffect(() => {
    if (!key) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 750);
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return p;
}

// ---- Overlays positioned on the UI thread -----------------------------------------------------
function useScreenPoint(cam: Cam, x: number, y: number) {
  return useAnimatedStyle(() => ({
    transform: [
      { translateX: cam.vw.value / 2 + (x - cam.cx.value) * cam.cs.value },
      { translateY: cam.vh.value / 2 - (y - cam.cy.value) * cam.cs.value },
    ],
  }));
}

const LABEL_W = 150;
const MapLabel = memo(function MapLabel({
  label,
  cam,
  pal,
  hidden,
}: {
  label: PlacedLabel;
  cam: Cam;
  pal: Scene['palette'];
  hidden: boolean;
}) {
  const pos = useScreenPoint(cam, label.x, label.y);
  const icon = label.icon;
  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(140)}
      style={[styles.anchor, pos]}
    >
      <View
        style={[
          styles.label,
          {
            opacity: hidden ? 0 : 1,
            top: label.iconOnly
              ? -10
              : icon
                ? -(11 + label.lines.length * label.size * 0.62)
                : -label.lines.length * label.size * 0.62,
          },
        ]}
      >
        {icon && (
          <View
            style={[
              styles.labelBadge,
              label.iconOnly && styles.iconOnly,
              { backgroundColor: catColor(icon as never) },
            ]}
          >
            <Icon
              name={iconFor(icon)}
              size={label.iconOnly ? 12 : 11}
              color="#FFFFFF"
              stroke={2.4}
            />
          </View>
        )}
        {!label.iconOnly && (
          <Text
            numberOfLines={2}
            style={[
              styles.labelText,
              {
                fontSize: label.muted ? label.size - 2 : label.size,
                lineHeight: (label.muted ? label.size - 2 : label.size) * 1.22,
                fontFamily: label.muted
                  ? F.semibold
                  : label.weight === '600'
                    ? F.semibold
                    : F.medium,
                color: label.muted ? pal.labelMuted : pal.label,
                letterSpacing: label.muted ? 0.9 : -0.1,
                textTransform: label.muted ? 'uppercase' : 'none',
                textShadowColor: pal.labelHalo,
              },
            ]}
          >
            {label.lines.join('\n')}
          </Text>
        )}
      </View>
    </Animated.View>
  );
});

function iconFor(category: string) {
  const map: Record<string, string> = {
    restroom: 'restroom',
    food: 'coffee',
    shop: 'bag',
    service: 'info',
    health: 'cross',
    exit: 'exit',
    stairs: 'stairs',
    meeting: 'users',
    desk: 'desk',
    outdoor: 'tree',
    parking: 'car',
    circulation: 'footprints',
    room: 'door',
  };
  return map[category] ?? 'pin';
}

function Pin({ place, cam }: { place: ScenePlace; cam: Cam }) {
  const pos = useScreenPoint(cam, place.x, place.y);
  const drop = useSharedValue(0);
  useEffect(() => {
    drop.value = withSpring(1, motion.spring.pop);
  }, [drop]);
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2),
    transform: [
      { translateY: (1 - drop.value) * -26 },
      { scale: 0.6 + drop.value * 0.4 },
    ],
  }));
  const color = catColor(place.category);
  return (
    <Animated.View style={[styles.anchor, pos]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: -20,
            top: -50,
            width: 40,
            height: 50,
            alignItems: 'center',
          },
          a,
        ]}
      >
        <Svg width={40} height={50} viewBox="0 0 40 50">
          <Path
            d="M20 49C20 49 4 31.5 4 19.5A16 16 0 0 1 36 19.5C36 31.5 20 49 20 49Z"
            fill={color}
            stroke="#FFFFFF"
            strokeWidth={2.5}
          />
        </Svg>
        <View
          style={{
            position: 'absolute',
            top: 9,
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={place.icon} size={18} color="#FFFFFF" stroke={2.3} />
        </View>
      </Animated.View>
      <View
        style={{
          position: 'absolute',
          left: -5,
          top: -2.5,
          width: 10,
          height: 5,
          borderRadius: 5,
          backgroundColor: 'rgba(11,18,32,0.22)',
        }}
      />
    </Animated.View>
  );
}

function MapPill({
  marker,
  cam,
  pal,
}: {
  marker: { x: number; y: number; text: string; icon: string };
  cam: Cam;
  pal: Scene['palette'];
}) {
  const pos = useScreenPoint(cam, marker.x, marker.y);
  return (
    <Animated.View entering={FadeIn.duration(240)} style={[styles.anchor, pos]}>
      <View
        style={{
          position: 'absolute',
          bottom: 10,
          left: -110,
          width: 220,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 9,
            height: 26,
            borderRadius: 13,
            backgroundColor: pal.route,
            boxShadow: '0 2px 6px rgba(11,18,32,0.25)',
          }}
        >
          <Icon name={marker.icon} size={14} color="#FFFFFF" stroke={2.4} />
          <Text
            numberOfLines={1}
            style={{
              color: '#FFFFFF',
              fontFamily: F.semibold,
              fontSize: 12,
            }}
          >
            {marker.text}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function StartMarker({ at, cam, color }: { at: P; cam: Cam; color: string }) {
  const pos = useScreenPoint(cam, at.x, at.y);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.anchor, pos]}>
      <View
        style={{
          position: 'absolute',
          left: -8,
          top: -8,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          borderWidth: 4,
          borderColor: color,
        }}
      />
    </Animated.View>
  );
}

function UserDot({
  user,
  cam,
  color,
  halo,
  ring,
}: {
  user: MapUser;
  cam: Cam;
  color: string;
  halo: string;
  ring: string;
}) {
  const ux = useSharedValue(user.x);
  const uy = useSharedValue(user.y);
  const sig = useSharedValue(user.sigma);
  const head = useSharedValue(user.heading ?? 0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    const cfg = { duration: 480, easing: Easing.out(Easing.cubic) };
    ux.value = withTiming(user.x, cfg);
    uy.value = withTiming(user.y, cfg);
    sig.value = withTiming(user.sigma, cfg);
    if (user.heading != null) {
      // Rotate the short way round.
      let d = user.heading - head.value;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      head.value = withTiming(head.value + d, cfg);
    }
  }, [user.x, user.y, user.sigma, user.heading, ux, uy, sig, head]);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: motion.pulseMs,
        easing: Easing.out(Easing.quad),
      }),
      -1,
      false,
    );
  }, [pulse]);
  const pos = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: cam.vw.value / 2 + (ux.value - cam.cx.value) * cam.cs.value,
      },
      {
        translateY: cam.vh.value / 2 - (uy.value - cam.cy.value) * cam.cs.value,
      },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const r = Math.max(16, sig.value * cam.cs.value);
    return { width: 2 * r, height: 2 * r, borderRadius: r, left: -r, top: -r };
  });
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.6 }],
  }));
  const beam = useAnimatedStyle(() => ({
    transform: [{ rotate: `${90 - (head.value * 180) / Math.PI}deg` }],
  }));
  return (
    <Animated.View style={[styles.anchor, pos]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            backgroundColor: halo,
            borderWidth: 1,
            borderColor: `${color}33`,
          },
          haloStyle,
        ]}
      />
      {user.heading != null && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: -32,
              top: -32,
              width: 64,
              height: 64,
            },
            beam,
          ]}
        >
          <Svg width={64} height={64} viewBox="0 0 64 64">
            <Path
              d="M32 32 L19 4 A30 30 0 0 1 45 4 Z"
              fill={color}
              opacity={0.28}
            />
          </Svg>
        </Animated.View>
      )}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: -11,
            top: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
      <View
        style={{
          position: 'absolute',
          left: -11,
          top: -11,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: user.live ? color : '#8A93A3',
          borderWidth: 3.5,
          borderColor: ring,
          boxShadow: '0 1px 4px rgba(11,18,32,0.35)',
        }}
      />
    </Animated.View>
  );
}

/** The live dot: position, heading and accuracy straight from UI-thread values. */
function LiveUserDot({
  v,
  cam,
  color,
  halo,
  ring,
}: {
  v: LiveDotValues;
  cam: Cam;
  color: string;
  halo: string;
  ring: string;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: motion.pulseMs,
        easing: Easing.out(Easing.quad),
      }),
      -1,
      false,
    );
  }, [pulse]);
  const pos = useAnimatedStyle(() => ({
    opacity: v.visible.value,
    transform: [
      {
        translateX:
          cam.vw.value / 2 + (v.x.value - cam.cx.value) * cam.cs.value,
      },
      {
        translateY:
          cam.vh.value / 2 - (v.y.value - cam.cy.value) * cam.cs.value,
      },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const r = Math.max(16, v.sigma.value * cam.cs.value);
    return { width: 2 * r, height: 2 * r, borderRadius: r, left: -r, top: -r };
  });
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value) * v.live.value,
    transform: [{ scale: 1 + pulse.value * 1.6 }],
  }));
  const beam = useAnimatedStyle(() => ({
    opacity: v.headingOn.value,
    transform: [{ rotate: `${90 - (v.heading.value * 180) / Math.PI}deg` }],
  }));
  const core = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.live.value, [0, 1], ['#8A93A3', color]),
  }));
  return (
    <Animated.View
      testID="live-dot"
      style={[styles.anchor, pos]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            backgroundColor: halo,
            borderWidth: 1,
            borderColor: `${color}33`,
          },
          haloStyle,
        ]}
      />
      <Animated.View
        style={[
          { position: 'absolute', left: -36, top: -36, width: 72, height: 72 },
          beam,
        ]}
      >
        <Svg width={72} height={72} viewBox="0 0 64 64">
          <Path
            d="M32 32 L17 3 A31 31 0 0 1 47 3 Z"
            fill={color}
            opacity={0.32}
          />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: -11,
            top: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: -11,
            top: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 3.5,
            borderColor: ring,
            boxShadow: '0 1px 4px rgba(11,18,32,0.35)',
          },
          core,
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  label: {
    position: 'absolute',
    left: -LABEL_W / 2,
    width: LABEL_W,
    alignItems: 'center',
  },
  iconOnly: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginBottom: 0,
    boxShadow: '0 1px 3px rgba(11,18,32,0.25)',
  },
  labelBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  labelText: {
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: Platform.OS === 'web' ? 3 : 4,
  },
});

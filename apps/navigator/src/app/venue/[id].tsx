import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  ScrollView,
  Share,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { motion, placeCategories, type PlaceCategory } from '@turn/design';
import {
  buildScene,
  projectOnPolyline,
  type P,
  type Scene,
  type ScenePlace,
} from '@turn/map-scene';
import { DisplayPose, nearestRoutableNode } from '@turn/positioning-runtime';
import { calculateRoute } from '@turn/routing';
import type { VenuePackage } from '@turn/venue-model';
import { Icon } from '../../components/icon';
import { Sheet } from '../../components/sheet';
import {
  Badge,
  Button,
  Chip,
  Divider,
  IconButton,
  T,
  Tap,
} from '../../components/ui';
import { track } from '../../lib/analytics';
import { useVenue, type VenueBundle } from '../../lib/api';
import {
  arrivalClock,
  formatDistance,
  formatDuration,
  WALK_SPEED,
  type Step,
} from '../../lib/directions';
import { planJourney, positionOnJourney } from '../../lib/journey';
import { useLiveGuidance } from '../../lib/live';
import { useStored } from '../../lib/storage';
import {
  VenueMap,
  type CameraCommand,
  type CameraRequest,
  type MapUser,
} from '../../map/VenueMap';
import { catColor, F, shadow, usePrefs, useTheme } from '../../theme';

export default function VenueScreen() {
  const { id, anchor } = useLocalSearchParams<{
    id: string;
    anchor?: string;
  }>();
  const state = useVenue(String(id));
  const { c } = useTheme();
  if (state.status === 'ready')
    return (
      <Experience
        key={state.bundle.pkg.revision}
        bundle={state.bundle}
        anchorId={anchor}
      />
    );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 16,
      }}
    >
      {state.status === 'loading' ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <>
          <Icon name="offline" size={34} color={c.textSubtle} />
          <T v="headline" center>
            {state.message}
          </T>
          <Button
            label="Back to venues"
            kind="secondary"
            onPress={() => router.back()}
          />
        </>
      )}
    </View>
  );
}

type Mode =
  | { kind: 'browse' }
  | { kind: 'search' }
  | { kind: 'place'; placeId: string }
  | { kind: 'route'; placeId: string }
  | { kind: 'navigate'; placeId: string }
  | { kind: 'arrived'; placeId: string };
type Start = {
  key: string;
  label: string;
  nodeId: string;
  point: P;
  floorId: string;
  kind: 'marker' | 'place' | 'entrance';
};
type Place = ScenePlace & { floorId: string; floorLabel: string };
type Guidance = 'demo' | 'steps' | 'live';

function nodePoint(pkg: VenuePackage, nodeId: string): P {
  const n = pkg.nodes.find((x) => x.id === nodeId)!;
  return { x: n.x, y: n.y };
}
function startOptions(pkg: VenuePackage, places: Place[]): Start[] {
  const markers: Start[] = pkg.anchors.map((a) => ({
    key: `m:${a.id}`,
    label: a.label,
    nodeId: a.nodeId,
    point: nodePoint(pkg, a.nodeId),
    floorId: a.floorId,
    kind: 'marker',
  }));
  const entrances: Start[] = places
    .filter((p) => p.category === 'exit')
    .map((p) => ({
      key: `p:${p.id}`,
      label: p.name,
      nodeId: p.nodeId,
      point: { x: p.x, y: p.y },
      floorId: p.floorId,
      kind: 'entrance',
    }));
  const rest: Start[] = places
    .filter((p) => p.category !== 'exit')
    .map((p) => ({
      key: `p:${p.id}`,
      label: p.name,
      nodeId: p.nodeId,
      point: { x: p.x, y: p.y },
      floorId: p.floorId,
      kind: 'place',
    }));
  return [...entrances, ...markers, ...rest];
}
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const stepIcon = (k: Step['kind']) =>
  k === 'depart'
    ? 'turn-straight'
    : k === 'arrive'
      ? 'turn-arrive'
      : k === 'u-turn'
        ? 'turn-u'
        : k === 'level-up' || k === 'level-down'
          ? 'stairs'
          : k.includes('slight')
            ? `turn-${k}`
            : k.includes('left')
              ? 'turn-left'
              : 'turn-right';

function Experience({
  bundle,
  anchorId,
}: {
  bundle: VenueBundle;
  anchorId?: string;
}) {
  const { c, dark, map } = useTheme();
  const { prefs } = usePrefs();
  const insets = useSafeAreaInsets();
  const { height: H, width: W } = useWindowDimensions();
  const pkg = bundle.pkg;
  // A venue's brand colour (TURN Studio → Settings) tints the route and the visitor's dot.
  const accent = bundle.content.branding?.accent;
  const palette = useMemo(
    () =>
      accent && /^#[0-9a-fA-F]{6}$/.test(accent)
        ? { ...map, route: accent, dot: accent, dotHalo: `${accent}26` }
        : map,
    [map, accent],
  );
  const scenes = useMemo(
    () =>
      Object.fromEntries(
        pkg.floors.map((f) => [f.id, buildScene(pkg, f.id, palette)]),
      ) as Record<string, Scene>,
    [pkg, palette],
  );
  /** Floors top to bottom, as a building reads. */
  const floors = useMemo(
    () => [...pkg.floors].sort((a, b) => b.level - a.level),
    [pkg],
  );
  const multiFloor = floors.length > 1;
  const places = useMemo<Place[]>(
    () =>
      pkg.floors.flatMap((f) =>
        scenes[f.id]!.places.filter(
          (p) => !bundle.content.places[p.id]?.hidden,
        ).map((p) => ({ ...p, floorId: f.id, floorLabel: f.label })),
      ),
    [pkg, scenes, bundle],
  );
  const placeById = useCallback(
    (id: string | null | undefined) => places.find((p) => p.id === id) ?? null,
    [places],
  );
  const starts = useMemo(() => startOptions(pkg, places), [pkg, places]);
  const [start, setStart] = useState<Start>(() => {
    const marker = anchorId
      ? starts.find((s) => s.key === `m:${anchorId}`)
      : undefined;
    return (
      marker ??
      starts[0] ?? {
        key: 'n0',
        label: 'Start',
        nodeId: pkg.nodes[0]!.id,
        point: nodePoint(pkg, pkg.nodes[0]!.id),
        floorId: pkg.nodes[0]!.floorId,
        kind: 'place',
      }
    );
  });
  const atMarker = start.kind === 'marker';
  const [floorId, setFloorId] = useState(start.floorId);
  const floor = pkg.floors.find((f) => f.id === floorId) ?? pkg.floors[0]!;
  const scene = scenes[floor.id]!;
  const [mode, setMode] = useState<Mode>({ kind: 'browse' });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [pickingStart, setPickingStart] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const [stepFree, setStepFree] = useState(prefs.stepFree);
  const live = useLiveGuidance(pkg, bundle.content, start.floorId);
  const [guidance, setGuidance] = useState<Guidance>(
    live.availability.available ? 'live' : 'demo',
  );
  const [walked, setWalked] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [follow, setFollow] = useState(true);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const cmd = useRef(0);
  const camera = useCallback(
    (c: CameraRequest) => setCommand({ ...c, id: ++cmd.current }),
    [],
  );
  const [saved, setSaved] = useStored<string[]>('saved', []);
  const [recent, setRecent] = useStored<string[]>('recent-searches', []);
  const input = useRef<TextInput>(null);
  const venueId = bundle.summary.id;

  useEffect(() => track({ venueId, type: 'venue_opened' }), [venueId]);

  const destination = 'placeId' in mode ? placeById(mode.placeId) : null;
  const routing =
    mode.kind === 'route' ||
    mode.kind === 'navigate' ||
    mode.kind === 'arrived';
  const route = useMemo(() => {
    if (!routing || !destination) return null;
    return planJourney(
      pkg,
      start.nodeId,
      destination.nodeId,
      { stepFree },
      scenes,
      destination.name,
    );
  }, [routing, destination, pkg, start.nodeId, stepFree, scenes]);
  // Where the walker is on the journey, and the leg drawn on the floor being shown.
  const at = route ? positionOnJourney(route, walked) : null;
  const shownLegIndex = route
    ? route.legs.findIndex(
        (l, i) =>
          l.floorId === floorId &&
          (!at || at.floorId !== floorId || i === at.leg),
      )
    : -1;
  const shownLeg =
    route && shownLegIndex >= 0 ? route.legs[shownLegIndex]! : null;
  const floorLabel = (id: string | undefined) =>
    pkg.floors.find((f) => f.id === id)?.label ?? '';

  // Walking distance from the start to every place, for list rows.
  const distances = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of places) {
      const r = calculateRoute(pkg, start.nodeId, p.nodeId, { stepFree });
      if (r.status === 'ok') out.set(p.id, r.route.distanceMetres);
    }
    return out;
  }, [places, pkg, start.nodeId, stepFree]);

  // ---- Guidance -------------------------------------------------------------------------------
  useEffect(() => {
    if (mode.kind !== 'navigate' || guidance !== 'demo' || !route) return;
    const timer = setInterval(
      () =>
        setWalked((w) => Math.min(route.length, w + WALK_SPEED * 1.2 * 0.5)),
      500,
    );
    return () => clearInterval(timer);
  }, [mode.kind, guidance, route]);
  useEffect(() => {
    if (mode.kind === 'navigate' && guidance === 'steps' && route)
      setWalked(route.steps[stepIndex]?.along ?? 0);
  }, [stepIndex, guidance, mode.kind, route]);

  // Live: a smoothed, route-snapped dot from the positioning runtime drives progress and re-routing.
  const display = useRef(new DisplayPose()).current;
  const [shown, setShown] = useState<P | null>(null);
  const lastSteps = useRef(0);
  const offRouteSince = useRef<number | null>(null);
  const liveOn = mode.kind === 'navigate' && guidance === 'live';
  const fix = live.state?.fix ?? null;
  const liveSteps = live.state?.steps ?? 0;
  const liveLeg = at?.leg ?? 0;
  useEffect(
    () => display.setRoute(route?.legs[liveLeg]?.points ?? null),
    [display, route, liveLeg],
  );
  useEffect(() => {
    if (!liveOn || !fix) return;
    display.update(
      fix,
      performance.now() / 1000,
      liveSteps !== lastSteps.current,
      fix.source === 'fix',
    );
    lastSteps.current = liveSteps;
  }, [liveOn, fix, liveSteps, display]);
  useEffect(() => {
    if (!liveOn) return;
    display.reset();
    lastSteps.current = 0;
    const timer = setInterval(() => {
      const p = display.step(0.25);
      if (p) setShown({ x: p.x, y: p.y });
    }, 250);
    return () => {
      clearInterval(timer);
      setShown(null);
    };
  }, [liveOn, display]);
  useEffect(() => {
    if (!liveOn || !shown || !route) return;
    const leg = route.legs[liveLeg]!;
    const pr = projectOnPolyline(leg.points, shown);
    if (pr.distance > Math.max(4, 2 * (fix?.sigma ?? 2))) {
      offRouteSince.current ??= Date.now();
      if (Date.now() - offRouteSince.current > 6000) {
        // Off the route for a while: route again from where the walker is.
        offRouteSince.current = null;
        const node = nearestRoutableNode(pkg, leg.floorId, shown);
        setStart({
          key: `live-${Date.now()}`,
          label: 'Your position',
          nodeId: node.id,
          point: shown,
          floorId: leg.floorId,
          kind: 'place',
        });
        setWalked(0);
      }
      return;
    }
    offRouteSince.current = null;
    // Stay on this floor's leg until the walker confirms the floor change.
    setWalked((w) =>
      Math.max(
        w,
        Math.min(leg.offset + pr.along, leg.offset + leg.length - 0.01),
      ),
    );
  }, [liveOn, shown, route, liveLeg, fix?.sigma, pkg]);
  const nextLeg = route?.legs[liveLeg + 1] ?? null;
  const atFloorChange = Boolean(
    liveOn &&
    route &&
    nextLeg &&
    walked >= route.legs[liveLeg]!.offset + route.legs[liveLeg]!.length - 2.5,
  );
  const continueOnNextFloor = () => {
    if (!nextLeg) return;
    const [a, b] = nextLeg.points;
    setWalked(nextLeg.offset + 0.05);
    setFloorId(nextLeg.floorId);
    setFollow(true);
    void live.start(
      nextLeg.points[0]!,
      a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0,
      nextLeg.floorId,
    );
  };
  // Demo and step guidance carry the map to the walker's floor.
  useEffect(() => {
    if (
      mode.kind === 'navigate' &&
      guidance !== 'live' &&
      follow &&
      at &&
      at.floorId !== floorId
    )
      setFloorId(at.floorId);
  }, [mode.kind, guidance, follow, at?.floorId, floorId]);
  useEffect(() => {
    const within = guidance === 'live' ? 3 : 0.4;
    if (mode.kind === 'navigate' && route && walked >= route.length - within) {
      const id = mode.placeId;
      const t = setTimeout(() => {
        live.stop();
        setMode({ kind: 'arrived', placeId: id });
        track({ venueId, type: 'arrived', placeId: id });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [walked, mode, route, venueId, guidance, live.stop]);

  const livePhase = live.state?.phase ?? 'idle';
  const user: MapUser | null = useMemo(() => {
    if (mode.kind === 'navigate' && guidance === 'live') {
      if ((route?.legs[liveLeg]?.floorId ?? start.floorId) !== floorId)
        return null;
      const p = shown ?? fix;
      return p
        ? {
            x: p.x,
            y: p.y,
            sigma: fix?.sigma ?? 2,
            heading: fix?.headingRad ?? null,
            live: livePhase === 'tracking',
          }
        : null;
    }
    if (mode.kind === 'navigate' && route && at) {
      if (at.floorId !== floorId) return null;
      return {
        x: at.x,
        y: at.y,
        sigma: guidance === 'demo' ? 1.2 : 2.5,
        heading: at.headingRad,
        live: guidance !== 'steps',
      };
    }
    if (mode.kind === 'arrived' && route) {
      const last = route.legs.at(-1)!;
      if (last.floorId !== floorId) return null;
      const p = last.points.at(-1)!;
      return { x: p.x, y: p.y, sigma: 1, heading: null, live: true };
    }
    if (atMarker && start.floorId === floorId)
      return {
        x: start.point.x,
        y: start.point.y,
        sigma: 1.5,
        heading: null,
        live: true,
      };
    return null;
  }, [
    mode.kind,
    route,
    at,
    guidance,
    atMarker,
    start.point,
    start.floorId,
    floorId,
    liveLeg,
    shown,
    fix,
    livePhase,
  ]);

  const current = route
    ? Math.max(
        0,
        route.steps.findLastIndex((s) => s.along <= walked + 0.6),
      )
    : 0;
  const next =
    route?.steps[Math.min(route.steps.length - 1, current + 1)] ?? null;

  // ---- Layout / camera insets ----------------------------------------------------------------
  const topBar = insets.top + 64 + (mode.kind === 'browse' ? 46 : 0);
  const snaps = useMemo(() => {
    const full = H - insets.top - 76;
    if (mode.kind === 'place')
      return [262 + insets.bottom, Math.min(full, H * 0.62)];
    if (mode.kind === 'route')
      return [318 + insets.bottom, Math.min(full, H * 0.66)];
    return [148 + insets.bottom, Math.round(H * 0.46), full];
  }, [mode.kind, H, insets]);
  const sheetVisible =
    mode.kind === 'navigate'
      ? 132 + insets.bottom
      : mode.kind === 'arrived'
        ? 260
        : snaps[Math.min(sheetIndex, snaps.length - 1)]!;
  const mapInsets = useMemo(
    () => ({
      top: mode.kind === 'navigate' ? insets.top + 150 : topBar,
      bottom: Math.min(sheetVisible, H * 0.5),
    }),
    [mode.kind, insets.top, topBar, sheetVisible, H],
  );

  // ---- Actions --------------------------------------------------------------------------------
  const select = useCallback(
    (placeId: string | null) => {
      if (mode.kind === 'navigate') return;
      const p = placeById(placeId);
      if (!p) {
        if (mode.kind === 'place') setMode({ kind: 'browse' });
        return;
      }
      input.current?.blur();
      if (p.floorId !== floorId) setFloorId(p.floorId);
      setMode({ kind: 'place', placeId: p.id });
      setSheetIndex(0);
      camera({ kind: 'point', x: p.x, y: p.y });
      track({ venueId, type: 'place_viewed', placeId: p.id });
      if (query.trim()) {
        track({ venueId, type: 'search', query: query.trim(), placeId: p.id });
        setRecent((r) =>
          [query.trim(), ...r.filter((x) => x !== query.trim())].slice(0, 6),
        );
      }
    },
    [mode.kind, placeById, camera, venueId, query, setRecent, floorId],
  );
  const preview = (placeId: string) => {
    setMode({ kind: 'route', placeId });
    setSheetIndex(0);
    setPickingStart(false);
    setWalked(0);
    setStepIndex(0);
  };
  useEffect(() => {
    if (mode.kind !== 'route' || !route) return;
    const first = route.legs[0]!;
    setFloorId(first.floorId);
    camera({ kind: 'points', points: first.points });
  }, [mode.kind, route]);
  const startGuidance = () => {
    if (mode.kind !== 'route') return;
    setWalked(0);
    setStepIndex(0);
    setFollow(true);
    setMode({ kind: 'navigate', placeId: mode.placeId });
    track({ venueId, type: 'route_started', placeId: mode.placeId });
    if (guidance === 'live' && route) {
      const first = route.legs[0]!;
      const [a, b] = first.points;
      setFloorId(first.floorId);
      void live.start(
        start.point,
        a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0,
        first.floorId,
      );
    }
  };
  const end = () => {
    live.stop();
    if (mode.kind === 'navigate')
      track({ venueId, type: 'route_cancelled', placeId: mode.placeId });
    const id = 'placeId' in mode ? mode.placeId : null;
    setMode(id ? { kind: 'place', placeId: id } : { kind: 'browse' });
    setWalked(0);
    camera({ kind: 'fit' });
  };
  const back = useCallback(() => {
    if (mode.kind === 'browse') {
      router.back();
      return true;
    }
    if (mode.kind === 'navigate') end();
    else if (mode.kind === 'route')
      setMode({ kind: 'place', placeId: mode.placeId });
    else {
      setMode({ kind: 'browse' });
      setQuery('');
      setCategory(null);
      input.current?.blur();
      setSheetIndex(0);
    }
    return true;
  }, [mode]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]);

  const results = useMemo(() => {
    const q = norm(query.trim());
    const scored = places
      .map((p) => {
        const content = bundle.content.places[p.id];
        const name = norm(p.name);
        let score = 0;
        if (category && p.category !== category) return null;
        if (!q) score = 1;
        else if (name.startsWith(q)) score = 5;
        else if (name.includes(q)) score = 4;
        else if (norm(p.categoryLabel).includes(q) || p.category.startsWith(q))
          score = 3;
        else if ((content?.tags ?? []).some((t) => norm(t).includes(q)))
          score = 2.5;
        else if (content?.description && norm(content.description).includes(q))
          score = 2;
        return score ? { p, score } : null;
      })
      .filter((x): x is { p: Place; score: number } => x !== null)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (distances.get(a.p.id) ?? 1e9) - (distances.get(b.p.id) ?? 1e9),
      );
    return scored.map((x) => x.p);
  }, [query, category, places, bundle, distances]);
  const categoriesHere = useMemo(
    () =>
      (Object.keys(placeCategories) as PlaceCategory[]).filter(
        (k) =>
          k !== 'room' &&
          k !== 'circulation' &&
          places.some((p) => p.category === k),
      ),
    [places],
  );
  const isSaved = (id: string) => saved.includes(`${venueId}:${id}`);
  const toggleSave = (id: string) =>
    setSaved((s) =>
      s.includes(`${venueId}:${id}`)
        ? s.filter((x) => x !== `${venueId}:${id}`)
        : [...s, `${venueId}:${id}`],
    );
  const savedHere = places.filter((p) => isSaved(p.id));

  // ---- Render ---------------------------------------------------------------------------------
  const placeRow = (p: Place, i: number) => (
    <Animated.View
      key={p.id}
      entering={FadeInDown.delay(Math.min(i, 8) * 35).duration(320)}
    >
      <Tap
        onPress={() => select(p.id)}
        scaleTo={0.985}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 20,
          paddingVertical: 11,
        }}
      >
        <Badge icon={p.icon} color={catColor(p.category)} size={38} />
        <View style={{ flex: 1 }}>
          <T v="callout" weight="600" lines={1}>
            {p.name}
          </T>
          <T v="caption" color={c.textMuted} lines={1}>
            {[
              p.categoryLabel,
              multiFloor ? p.floorLabel : null,
              bundle.content.places[p.id]?.hours,
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
        </View>
        {distances.has(p.id) && (
          <View style={{ alignItems: 'flex-end' }}>
            <T v="caption" weight="600">
              {formatDuration(distances.get(p.id)! / WALK_SPEED)}
            </T>
            <T v="caption" color={c.textSubtle}>
              {formatDistance(distances.get(p.id)!)}
            </T>
          </View>
        )}
      </Tap>
    </Animated.View>
  );

  const browseSheet = (
    <>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="headline" lines={1} style={{ flexShrink: 1 }}>
            {bundle.summary.name}
          </T>
          {bundle.summary.private && (
            <Icon name="lock" size={15} color={c.textSubtle} />
          )}
        </View>
        <T v="caption" color={c.textMuted} lines={1}>
          {[
            bundle.summary.address || null,
            `${places.length} places`,
            atMarker ? `You are at ${start.label}` : null,
            bundle.source === 'cached' ? 'Offline copy' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </T>
      </View>
      <Divider />
      {savedHere.length > 0 && (
        <>
          <Section title="Saved" />
          {savedHere.map(placeRow)}
        </>
      )}
      <Section title="Explore" />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: 14,
          gap: 4,
        }}
      >
        {categoriesHere.map((k) => (
          <Tap
            key={k}
            onPress={() => {
              setCategory(k);
              setMode({ kind: 'search' });
              setSheetIndex(2);
            }}
            style={{
              width: (Math.min(W, 640) - 28 - 12) / 4,
              alignItems: 'center',
              gap: 6,
              paddingVertical: 8,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                backgroundColor: `${catColor(k)}1A`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon
                name={placeCategories[k].icon}
                size={24}
                color={catColor(k)}
                stroke={2}
              />
            </View>
            <T
              v="caption"
              weight="500"
              center
              lines={1}
              style={{ fontSize: 12 }}
            >
              {placeCategories[k].label.split(' ')[0]!}
            </T>
          </Tap>
        ))}
      </View>
      <Section title="All places" />
      {places
        .slice()
        .sort(
          (a, b) => (distances.get(a.id) ?? 1e9) - (distances.get(b.id) ?? 1e9),
        )
        .map(placeRow)}
    </>
  );

  const searchSheet = (
    <>
      {category && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 8,
            flexDirection: 'row',
          }}
        >
          <Chip
            label={placeCategories[category].label}
            icon={placeCategories[category].icon}
            selected
            onPress={() => setCategory(null)}
          />
        </View>
      )}
      {!query && !category && recent.length > 0 && (
        <>
          <Section title="Recent" />
          {recent.map((r) => (
            <Tap
              key={r}
              onPress={() => setQuery(r)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Icon name="clock" size={20} color={c.textSubtle} />
              <T v="callout">{r}</T>
            </Tap>
          ))}
        </>
      )}
      <Section
        title={
          query || category
            ? `${results.length} result${results.length === 1 ? '' : 's'}`
            : 'Places'
        }
      />
      {results.map(placeRow)}
      {results.length === 0 && (
        <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={28} color={c.textSubtle} />
          <T v="callout" color={c.textMuted} center>
            No places match “{query}”.
          </T>
        </View>
      )}
    </>
  );

  const placeSheet = destination && (
    <View style={{ paddingHorizontal: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
        <Badge
          icon={destination.icon}
          color={catColor(destination.category)}
          size={46}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title" lines={2}>
            {destination.name}
          </T>
          <T v="caption" color={c.textMuted}>
            {[
              destination.categoryLabel,
              bundle.content.places[destination.id]?.hours,
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
        </View>
        <IconButton
          icon="close"
          label="Close"
          size={34}
          tone="sunken"
          onPress={back}
        />
      </View>
      {distances.has(destination.id) && (
        <T v="callout" color={c.textMuted}>
          <T v="callout" weight="600" color={c.text}>
            {formatDuration(distances.get(destination.id)! / WALK_SPEED)}
          </T>{' '}
          walk · {formatDistance(distances.get(destination.id)!)} from{' '}
          {start.label}
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          label="Directions"
          icon="navigate"
          grow
          onPress={() => preview(destination.id)}
        />
        <IconButton
          icon="bookmark"
          label={isSaved(destination.id) ? 'Remove from saved' : 'Save'}
          tone="sunken"
          size={52}
          active={isSaved(destination.id)}
          onPress={() => toggleSave(destination.id)}
        />
        <IconButton
          icon="share"
          label="Share"
          tone="sunken"
          size={52}
          onPress={() =>
            void Share.share({
              message: `${destination.name} at ${bundle.summary.name} — open in TURN: turnapp://venue/${venueId}`,
            })
          }
        />
      </View>
      {bundle.content.places[destination.id]?.description && (
        <T v="body" color={c.textMuted}>
          {bundle.content.places[destination.id]!.description!}
        </T>
      )}
      <View style={{ backgroundColor: c.sunken, borderRadius: 16 }}>
        {bundle.content.places[destination.id]?.hours && (
          <Detail
            icon="clock"
            text={`Open ${bundle.content.places[destination.id]!.hours}`}
          />
        )}
        {bundle.content.places[destination.id]?.accessible && (
          <Detail icon="accessible" text="Step-free access" />
        )}
        <Detail
          icon="layers"
          text={`${destination.floorLabel} · ${bundle.summary.name}`}
        />
      </View>
    </View>
  );

  const routeSheet = destination && (
    <View style={{ gap: 14 }}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <View
          style={{ backgroundColor: c.sunken, borderRadius: 16, padding: 4 }}
        >
          <Tap
            onPress={() => setPickingStart((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 10,
            }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                borderWidth: 3.5,
                borderColor: c.accent,
                marginHorizontal: 5,
              }}
            />
            <View style={{ flex: 1 }}>
              <T v="caption" color={c.textSubtle}>
                From
              </T>
              <T v="callout" weight="600" lines={1}>
                {start.label}
              </T>
            </View>
            <Icon
              name={pickingStart ? 'up' : 'down'}
              size={18}
              color={c.textMuted}
            />
          </Tap>
          <View
            style={{ height: 1, backgroundColor: c.line, marginLeft: 46 }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 10,
            }}
          >
            <View style={{ width: 24, alignItems: 'center' }}>
              <Icon
                name="turn-arrive"
                size={20}
                color={catColor(destination.category)}
                stroke={2.4}
              />
            </View>
            <View style={{ flex: 1 }}>
              <T v="caption" color={c.textSubtle}>
                To
              </T>
              <T v="callout" weight="600" lines={1}>
                {destination.name}
              </T>
            </View>
          </View>
        </View>
        {pickingStart ? (
          <View style={{ gap: 2 }}>
            {live.canLocate && (
              <Tap
                disabled={locating === 'busy'}
                onPress={() => {
                  setLocating('busy');
                  void live.locate().then((r) => {
                    if (!r.fix) {
                      setLocating(r.reason);
                      return;
                    }
                    const node = nearestRoutableNode(pkg, r.fix.floorId, r.fix);
                    setStart({
                      key: `beacons-${Date.now()}`,
                      label: `Your position (±${Math.round(r.fix.sigma)} m, ${r.heard} beacons)`,
                      nodeId: node.id,
                      point: { x: r.fix.x, y: r.fix.y },
                      floorId: r.fix.floorId,
                      kind: 'marker',
                    });
                    setFloorId(r.fix.floorId);
                    setLocating(null);
                    setPickingStart(false);
                  });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                }}
              >
                <Badge icon="beacon" color={c.accent} size={34} />
                <View style={{ flex: 1 }}>
                  <T v="callout" weight="600">
                    {locating === 'busy'
                      ? 'Listening for beacons…'
                      : 'Find me with venue beacons'}
                  </T>
                  {locating && locating !== 'busy' ? (
                    <T v="caption" color={c.danger}>
                      {locating}
                    </T>
                  ) : (
                    <T v="caption" color={c.textSubtle}>
                      Hold still for about 6 seconds
                    </T>
                  )}
                </View>
                {locating === 'busy' && <ActivityIndicator color={c.accent} />}
              </Tap>
            )}
            <Tap
              onPress={() => router.push('/scan')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
              }}
            >
              <Badge icon="qr" color={c.text} size={34} />
              <T v="callout" weight="600">
                Scan a TURN code to start here
              </T>
            </Tap>
            {starts
              .filter((s) => s.key !== `p:${destination.id}`)
              .map((s) => (
                <Tap
                  key={s.key}
                  onPress={() => {
                    setStart(s);
                    setPickingStart(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 9,
                  }}
                >
                  <Icon
                    name={
                      s.kind === 'marker'
                        ? 'qr'
                        : s.kind === 'entrance'
                          ? 'exit'
                          : 'pin'
                    }
                    size={20}
                    color={s.key === start.key ? c.accent : c.textMuted}
                  />
                  <T
                    v="callout"
                    color={s.key === start.key ? c.accent : c.text}
                    weight={s.key === start.key ? '600' : '400'}
                  >
                    {s.label}
                  </T>
                </Tap>
              ))}
          </View>
        ) : route ? (
          <>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <T v="display" color={c.success} style={{ fontSize: 30 }}>
                  {formatDuration(route.distanceMetres / WALK_SPEED)}
                </T>
                <T v="caption" color={c.textMuted}>
                  {formatDistance(route.length)} · arrive{' '}
                  {arrivalClock(route.distanceMetres / WALK_SPEED)}
                </T>
              </View>
              <Button
                label="Start"
                icon="navigate"
                onPress={startGuidance}
                style={{ paddingHorizontal: 26 }}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                padding: 4,
                gap: 4,
                backgroundColor: c.sunken,
                borderRadius: 14,
              }}
            >
              {(
                [
                  ['demo', 'Demo walk'],
                  ['steps', 'Step by step'],
                  ['live', 'Live'],
                ] as const
              ).map(([g, label]) => (
                <Tap
                  key={g}
                  disabled={g === 'live' && !live.availability.available}
                  onPress={() => setGuidance(g)}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: guidance === g ? c.surface : 'transparent',
                    opacity:
                      g === 'live' && !live.availability.available ? 0.45 : 1,
                  }}
                >
                  <T
                    v="caption"
                    weight="600"
                    color={guidance === g ? c.text : c.textMuted}
                  >
                    {label}
                  </T>
                </Tap>
              ))}
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <T v="caption" color={c.textSubtle} style={{ flex: 1 }}>
                {guidance === 'demo'
                  ? 'Demo walk moves the dot along the route at walking pace — no positioning.'
                  : guidance === 'steps'
                    ? 'Move through the directions yourself, one turn at a time.'
                    : live.availability.available
                      ? `Live follows your steps${live.beaconCount ? ` and ${live.beaconCount} venue beacons` : ''}. Hold the phone in front of you, screen up.`
                      : (live.availability.reason ??
                        'Live position is unavailable here.')}
              </T>
              <Chip
                label="Step-free"
                icon="accessible"
                selected={stepFree}
                onPress={() => setStepFree((v) => !v)}
              />
            </View>
          </>
        ) : (
          <T v="callout" color={c.danger}>
            {stepFree
              ? 'No step-free route found. Turn off step-free to see other routes.'
              : 'No route found to this place.'}
          </T>
        )}
      </View>
      {route && !pickingStart && (
        <View>
          <Section title="Directions" />
          {route.steps.map((s, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: c.sunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={stepIcon(s.kind)}
                  size={20}
                  color={c.text}
                  stroke={2.3}
                />
              </View>
              <View style={{ flex: 1 }}>
                <T v="callout">{s.text}</T>
                {s.distance > 0 && (
                  <T v="caption" color={c.textSubtle}>
                    {formatDistance(s.distance)}
                  </T>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  // Remaining routing cost, so stairs and lifts count towards the time estimate.
  const remaining = route
    ? Math.max(
        0,
        route.distanceMetres * (1 - walked / Math.max(0.01, route.length)),
      )
    : 0;
  const transitionMarkers = (() => {
    if (!route || !shownLeg) return [];
    const out: {
      key: string;
      x: number;
      y: number;
      text: string;
      icon: string;
    }[] = [];
    const next = route.legs[shownLegIndex + 1];
    const prev = route.legs[shownLegIndex - 1];
    const end = shownLeg.points.at(-1)!;
    if (next)
      out.push({
        key: 'next',
        x: end.x,
        y: end.y,
        text: `To ${floorLabel(next.floorId)}`,
        icon: 'stairs',
      });
    if (prev)
      out.push({
        key: 'prev',
        x: shownLeg.points[0]!.x,
        y: shownLeg.points[0]!.y,
        text: `From ${floorLabel(prev.floorId)}`,
        icon: 'stairs',
      });
    return out;
  })();
  return (
    <View style={{ flex: 1, backgroundColor: map.land, overflow: 'hidden' }}>
      <VenueMap
        scene={scene}
        insets={mapInsets}
        selectedPlace={
          destination && destination.floorId === floorId ? destination : null
        }
        route={shownLeg?.points ?? null}
        markers={transitionMarkers}
        walked={
          mode.kind === 'navigate' || mode.kind === 'arrived'
            ? Math.max(0, walked - (shownLeg?.offset ?? 0))
            : 0
        }
        routeStart={
          mode.kind === 'route' && start.floorId === floorId
            ? start.point
            : null
        }
        user={user}
        command={command}
        follow={mode.kind === 'navigate' && follow}
        onSelect={select}
        onMapTap={
          mode.kind === 'navigate' &&
          guidance === 'live' &&
          livePhase === 'tracking'
            ? (p) => {
                const apply = () => {
                  live.correct(p);
                  setFollow(true);
                };
                if (Platform.OS === 'web') {
                  if (globalThis.confirm?.('Set your position here?')) apply();
                } else
                  Alert.alert(
                    'Set your position here?',
                    'Use this when the dot is clearly in the wrong place.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Set position', onPress: apply },
                    ],
                  );
              }
            : undefined
        }
        onGesture={() => mode.kind === 'navigate' && setFollow(false)}
      />

      {/* Top: search, categories / navigation banner */}
      {atFloorChange && nextLeg ? (
        <Animated.View
          entering={FadeInUp.duration(320)}
          style={[
            {
              position: 'absolute',
              top: insets.top + 8,
              left: 12,
              right: 12,
              borderRadius: 22,
              padding: 16,
              gap: 12,
              backgroundColor: c.accent,
            },
            shadow('floating', dark),
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Icon name="stairs" size={36} color="#FFFFFF" stroke={2.4} />
            <View style={{ flex: 1 }}>
              <T v="headline" color="#FFFFFF">
                {route?.steps.find(
                  (s) => s.kind === 'level-up' || s.kind === 'level-down',
                )?.text ?? `Go to ${floorLabel(nextLeg.floorId)}`}
              </T>
              <T v="caption" color="rgba(255,255,255,0.85)">
                Tap when you are there. Live position restarts on the new floor.
              </T>
            </View>
          </View>
          <Button
            label={`I'm on ${floorLabel(nextLeg.floorId)}`}
            kind="secondary"
            size="md"
            onPress={continueOnNextFloor}
          />
        </Animated.View>
      ) : liveOn && livePhase !== 'tracking' ? (
        <Animated.View
          entering={FadeInUp.duration(320)}
          style={[
            {
              position: 'absolute',
              top: insets.top + 8,
              left: 12,
              right: 12,
              borderRadius: 22,
              padding: 16,
              gap: 10,
              backgroundColor: livePhase === 'stopped' ? c.surface : c.text,
            },
            shadow('floating', dark),
          ]}
        >
          {livePhase === 'stopped' ? (
            <>
              <T v="callout" weight="600" color={c.danger}>
                Live position stopped
              </T>
              <T v="caption" color={c.textMuted}>
                {live.state?.message || 'The motion sensors are unavailable.'}
              </T>
              <Button
                label="Continue step by step"
                size="md"
                kind="secondary"
                onPress={() => {
                  live.stop();
                  setGuidance('steps');
                }}
              />
            </>
          ) : (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <T v="headline" color="#FFFFFF">
                  {String(Math.max(1, live.state?.settling ?? 4))}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="callout" weight="600" color={c.background}>
                  Face along the blue line
                </T>
                <T v="caption" color={dark ? c.textMuted : '#B9BFCA'}>
                  Hold the phone in front of you, screen up, and stay still for
                  a moment.
                </T>
              </View>
            </View>
          )}
        </Animated.View>
      ) : mode.kind === 'navigate' && route && next ? (
        <Animated.View
          entering={FadeInUp.duration(320)}
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            gap: 6,
          }}
        >
          <View
            style={[
              {
                backgroundColor: c.accent,
                borderRadius: 22,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              },
              shadow('floating', dark),
            ]}
          >
            <Animated.View key={`i${current}`} entering={FadeIn.duration(250)}>
              <Icon
                name={stepIcon(next.kind)}
                size={40}
                color="#FFFFFF"
                stroke={2.6}
              />
            </Animated.View>
            <Animated.View
              key={`t${current}`}
              entering={FadeInDown.duration(260)}
              style={{ flex: 1 }}
            >
              <T v="title" color="#FFFFFF">
                {formatDistance(Math.max(0, next.along - walked))}
              </T>
              <T v="callout" color="rgba(255,255,255,0.9)" lines={2}>
                {next.text}
              </T>
            </Animated.View>
          </View>
          {route.steps[current + 2] && (
            <Animated.View
              key={`n${current}`}
              entering={FadeIn.duration(300)}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: c.accentPressed,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 7,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <T v="caption" color="rgba(255,255,255,0.85)">
                Then
              </T>
              <Icon
                name={stepIcon(route.steps[current + 2]!.kind)}
                size={16}
                color="#FFFFFF"
                stroke={2.4}
              />
            </Animated.View>
          )}
        </Animated.View>
      ) : mode.kind !== 'arrived' && mode.kind !== 'navigate' ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 0,
            right: 0,
            gap: 10,
          }}
        >
          <View
            style={[
              {
                marginHorizontal: 12,
                height: 52,
                borderRadius: 26,
                backgroundColor: c.surface,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 6,
                paddingRight: 6,
              },
              shadow('floating', dark),
            ]}
          >
            <Tap
              onPress={back}
              accessibilityLabel="Back"
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="back" size={21} color={c.text} stroke={2.2} />
            </Tap>
            <TextInput
              ref={input}
              value={
                mode.kind === 'place' || mode.kind === 'route'
                  ? (destination?.name ?? '')
                  : query
              }
              onChangeText={(t) => {
                setQuery(t);
                if (mode.kind !== 'search') setMode({ kind: 'search' });
              }}
              onFocus={() => {
                if (mode.kind === 'place' || mode.kind === 'route')
                  setQuery('');
                setMode({ kind: 'search' });
                setSheetIndex(2);
              }}
              onSubmitEditing={() => results[0] && select(results[0].id)}
              placeholder={`Search ${bundle.summary.name}`}
              placeholderTextColor={c.textSubtle}
              returnKeyType="search"
              style={{
                flex: 1,
                height: 50,
                fontFamily: F.medium,
                fontSize: 16,
                color: c.text,
                paddingHorizontal: 4,
                outlineWidth: 0,
                // react-native-web: no browser focus ring inside the pill.
                ...(Platform.OS === 'web'
                  ? ({ outlineStyle: 'none' } as object)
                  : null),
              }}
            />
            {(query.length > 0 || mode.kind !== 'browse') &&
            mode.kind !== 'route' ? (
              <Tap
                onPress={back}
                accessibilityLabel="Clear"
                style={{
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={19} color={c.textMuted} />
              </Tap>
            ) : (
              <Tap
                onPress={() => router.push('/scan')}
                accessibilityLabel="Scan a TURN code"
                style={{
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="qr" size={20} color={c.text} />
              </Tap>
            )}
          </View>
          {mode.kind === 'browse' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            >
              {categoriesHere.map((k, i) => (
                <Animated.View
                  key={k}
                  entering={FadeInDown.delay(80 + i * 40).duration(300)}
                >
                  <Chip
                    floating
                    label={placeCategories[k].label}
                    icon={placeCategories[k].icon}
                    iconColor={catColor(k)}
                    onPress={() => {
                      setCategory(k);
                      setMode({ kind: 'search' });
                      setSheetIndex(2);
                    }}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* Floating map controls */}
      {mode.kind !== 'arrived' &&
        !(
          snaps.length > 2 &&
          sheetIndex >= snaps.length - 1 &&
          mode.kind !== 'navigate'
        ) && (
          <View
            style={{
              position: 'absolute',
              right: 12,
              bottom: sheetVisible + 12,
              gap: 10,
            }}
          >
            {multiFloor && (
              <View
                style={[
                  {
                    backgroundColor: c.surface,
                    borderRadius: 23,
                    padding: 4,
                    gap: 2,
                  },
                  shadow('floating', dark),
                ]}
              >
                {floors.map((f) => (
                  <Tap
                    key={f.id}
                    scaleTo={0.9}
                    accessibilityLabel={f.label}
                    onPress={() => {
                      setFloorId(f.id);
                      if (mode.kind === 'navigate') setFollow(false);
                    }}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        f.id === floorId ? c.text : 'transparent',
                    }}
                  >
                    <T
                      v="caption"
                      weight="700"
                      color={f.id === floorId ? c.background : c.textMuted}
                    >
                      {shortFloor(f.label, f.level)}
                    </T>
                  </Tap>
                ))}
              </View>
            )}
            <IconButton
              icon="locate"
              label={
                mode.kind === 'navigate' ? 'Re-centre' : 'Show whole floor'
              }
              size={46}
              active={mode.kind === 'navigate' && follow}
              onPress={() => {
                if (mode.kind === 'navigate') setFollow(true);
                else if (shownLeg)
                  camera({ kind: 'points', points: shownLeg.points });
                else camera({ kind: 'fit' });
              }}
            />
          </View>
        )}

      {/* Bottom */}
      {mode.kind === 'navigate' && route ? (
        <Animated.View
          entering={FadeInDown.duration(320)}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingBottom: insets.bottom + 14,
              paddingTop: 16,
              paddingHorizontal: 20,
              backgroundColor: c.surface,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              gap: 12,
            },
            shadow('sheet', dark),
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T v="title" color={c.success}>
                {formatDuration(remaining / WALK_SPEED)}
              </T>
              <T v="caption" color={c.textMuted}>
                {formatDistance(remaining)} · arrive{' '}
                {arrivalClock(remaining / WALK_SPEED)} ·{' '}
                {guidance === 'demo'
                  ? 'Demo walk'
                  : guidance === 'live'
                    ? live.beaconCount
                      ? `Live · ${fix?.beaconsUsed ?? 0} beacons heard`
                      : 'Live · steps and map'
                    : 'Step by step'}
              </T>
            </View>
            {guidance === 'steps' && (
              <>
                <IconButton
                  icon="back"
                  label="Previous step"
                  tone="sunken"
                  size={46}
                  onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
                />
                <IconButton
                  icon="forward"
                  label="Next step"
                  tone="accent"
                  size={46}
                  onPress={() =>
                    setStepIndex((i) => Math.min(route.steps.length - 1, i + 1))
                  }
                />
              </>
            )}
            <Button label="End" kind="danger" size="md" onPress={end} />
          </View>
          <Progress value={route.length ? walked / route.length : 0} />
        </Animated.View>
      ) : mode.kind === 'arrived' && destination ? (
        <Arrived name={destination.name} onDone={end} bottom={insets.bottom} />
      ) : (
        <Sheet
          key={mode.kind === 'search' ? 'browse' : mode.kind}
          snaps={snaps}
          index={Math.min(sheetIndex, snaps.length - 1)}
          onIndex={setSheetIndex}
          bottomInset={insets.bottom}
        >
          {mode.kind === 'browse'
            ? browseSheet
            : mode.kind === 'search'
              ? searchSheet
              : mode.kind === 'place'
                ? placeSheet
                : routeSheet}
        </Sheet>
      )}
    </View>
  );
}

/** Compact floor button text: "G", "L1", "B1"… */
function shortFloor(label: string, level: number) {
  if (/ground/i.test(label) || level === 0) return 'G';
  const n = /(-?\d+)/.exec(label)?.[1];
  if (n) return level < 0 ? `B${Math.abs(Number(n))}` : `L${n}`;
  return level < 0 ? `B${-level}` : `L${level}`;
}

function Section({ title }: { title: string }) {
  const { c } = useTheme();
  return (
    <T
      v="micro"
      color={c.textSubtle}
      style={{
        textTransform: 'uppercase',
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 6,
      }}
    >
      {title}
    </T>
  );
}

function Detail({ icon, text }: { icon: string; text: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Icon name={icon} size={19} color={c.textMuted} />
      <T v="callout">{text}</T>
    </View>
  );
}

function Progress({ value }: { value: number }) {
  const { c } = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 480 });
  }, [value, w]);
  const a = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      style={{
        height: 4,
        borderRadius: 2,
        backgroundColor: c.sunken,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[{ height: 4, borderRadius: 2, backgroundColor: c.accent }, a]}
      />
    </View>
  );
}

function Arrived({
  name,
  onDone,
  bottom,
}: {
  name: string;
  onDone: () => void;
  bottom: number;
}) {
  const { c, dark } = useTheme();
  const ring = useSharedValue(0);
  const tick = useSharedValue(0);
  useEffect(() => {
    ring.value = withSpring(1, motion.spring.pop);
    tick.value = withDelay(180, withTiming(1, { duration: 420 }));
  }, [ring, tick]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.value }],
    opacity: ring.value,
  }));
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = Date.now() + 180;
    let raf = 0;
    const step = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / 420));
      setP(t);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOut}
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: bottom + 12,
          backgroundColor: c.surface,
          borderRadius: 26,
          padding: 22,
          alignItems: 'center',
          gap: 10,
        },
        shadow('floating', dark),
      ]}
    >
      <Animated.View
        style={[
          {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.success,
            alignItems: 'center',
            justifyContent: 'center',
          },
          ringStyle,
        ]}
      >
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="#FFFFFF"
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={[22, 22]}
            strokeDashoffset={22 * (1 - p)}
          />
        </Svg>
      </Animated.View>
      <T v="headline" center>
        You have arrived
      </T>
      <T v="callout" color={c.textMuted} center>
        {name}
      </T>
      <Button
        label="Done"
        onPress={onDone}
        style={{ alignSelf: 'stretch', marginTop: 6 }}
      />
    </Animated.View>
  );
}

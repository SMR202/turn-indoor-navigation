import type { Feature } from 'geojson';
import {
  headingToBearing,
  type FollowCamera,
  type Georeference,
  type P,
  type Scene,
  type ScenePlace,
} from '@turn/map-scene';
import type { DotSnapshot, LiveDot } from '../lib/live-dot';
import type { CameraCommand, MapUser } from './VenueMap';

/** The same contract as the SVG `VenueMap`, plus where the venue sits on Earth. */
export type Map3DProps = {
  scene: Scene;
  georef: Georeference;
  insets: { top: number; bottom: number };
  selectedPlace: ScenePlace | null;
  route: P[] | null;
  walked?: number;
  routeStart?: P | null;
  user: MapUser | null;
  command: CameraCommand | null;
  follow?: boolean;
  onSelect: (placeId: string | null) => void;
  onMapTap?: (p: P, pixelsPerMetre: number) => void;
  onCenterChange?: (p: P) => void;
  onGesture?: () => void;
  onDotTap?: () => void;
  markers?: { key: string; x: number; y: number; text: string; icon: string }[];
  liveDot?: LiveDot;
  liveVisible?: boolean;
  /** Rooms that show their floor instead of a block (the walker's room, rooms on the route). */
  openRooms?: string[];
  /** `lift`: the selected room rises; `floor`: it shows its floor, tinted (a destination). */
  selectionStyle?: 'lift' | 'floor';
  /** While following: where the camera director wants the view (course, tilt, scale). */
  followCamera?: FollowCamera | null;
  /** 2D: look straight down. */
  flat?: boolean;
};

/** Overview: tilted enough that room blocks read as volumes; following: set by the camera director. */
export const OVERVIEW_PITCH = 38;
export const FOLLOW_PITCH = 55;
export const MAX_ZOOM = 23.5;
/** While following, the dot sits this far down the visible area (more map ahead, as in car maps). */
export const FOLLOW_DOT_AT = 0.68;
/** Taps within this many pixels of the dot open "Where am I?". */
export const DOT_TAP_PX = 30;
/** Search box (pixels each side of the finger) for picking places and rooms. */
export const PICK_PX = 10;

/** The camera padding that puts the dot `FOLLOW_DOT_AT` down the visible area. */
export function followPadding(
  height: number,
  insets: { top: number; bottom: number },
  dotAt = FOLLOW_DOT_AT,
) {
  const visible = Math.max(1, height - insets.top - insets.bottom);
  const dotY = insets.top + visible * dotAt;
  // The camera centre is the middle of the padded area: make that middle the dot.
  const bottom = insets.bottom;
  return {
    top: Math.max(0, 2 * dotY - height + bottom),
    bottom,
    left: 0,
    right: 0,
  };
}

/** Layers a tap may pick from, nearest the finger first. */
export const PICK_NEAR_LAYERS = ['place-icons', 'room-labels'];
export const PICK_ROOM_LAYERS = ['selection-lift', 'blocks', 'room-fill'];

/** The best feature under a tap: a place icon, then a room label, then the room itself. */
export function pickPlace(features: Feature[]): {
  placeId: string | null;
  roomId: string | null;
} {
  const props = (f: Feature) => (f.properties ?? {}) as Record<string, string>;
  const byLayer = (id: string) =>
    features.filter(
      (f) => (f as Feature & { layer?: { id: string } }).layer?.id === id,
    );
  for (const layer of [
    'place-icons',
    'room-labels',
    'selection-lift',
    'blocks',
    'room-fill',
  ]) {
    const hit = byLayer(layer).find((f) => props(f).placeId || props(f).roomId);
    if (hit)
      return {
        placeId: props(hit).placeId || null,
        roomId: props(hit).roomId || null,
      };
  }
  // Some renderers do not report layer ids: fall back to any feature with a place.
  const any = features.find((f) => props(f).placeId);
  return any
    ? { placeId: props(any).placeId || null, roomId: props(any).roomId || null }
    : { placeId: null, roomId: null };
}

type DotFrame = {
  x: number;
  y: number;
  sigma: number;
  heading: number | null;
  live: boolean;
  visible: boolean;
};

/**
 * Glides the live dot between the 10 Hz display steps: each new step is reached over the next
 * 110 ms, so the dot (and a following camera) moves at frame rate without jumps.
 */
export class DotAnimator {
  private from: DotSnapshot | null = null;
  private to: DotSnapshot | null = null;
  private since = 0;
  private raf: number | null = null;
  private stopTicks: (() => void) | null = null;
  constructor(
    private readonly onFrame: (f: DotFrame | null) => void,
    private readonly now: () => number = () => performance.now(),
    private readonly request: (cb: () => void) => number = (cb) =>
      requestAnimationFrame(cb),
    private readonly cancel: (id: number) => void = (id) =>
      cancelAnimationFrame(id),
  ) {}
  attach(dot: LiveDot) {
    this.detach();
    this.stopTicks = dot.onStep((s) => this.push(s));
  }
  detach() {
    this.stopTicks?.();
    this.stopTicks = null;
    if (this.raf !== null) this.cancel(this.raf);
    this.raf = null;
  }
  private push(s: DotSnapshot) {
    if (!s.visible) {
      this.from = this.to = null;
      this.onFrame(null);
      return;
    }
    // A corrected position is shown at once, never as a glide across the map.
    this.from = this.to && !s.jump ? this.frameAt(this.now()) : s;
    this.to = s;
    this.since = this.now();
    if (this.raf === null) this.loop();
  }
  private frameAt(t: number): DotSnapshot {
    const a = this.from!;
    const b = this.to!;
    const k = Math.min(1, (t - this.since) / 110);
    return {
      ...b,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      sigma: a.sigma + (b.sigma - a.sigma) * k,
      heading: a.heading + (b.heading - a.heading) * k,
    };
  }
  private loop = () => {
    this.raf = null;
    if (!this.to) return;
    const t = this.now();
    const f = this.frameAt(t);
    this.onFrame({
      x: f.x,
      y: f.y,
      sigma: f.sigma,
      heading: f.headingOn ? f.heading : null,
      live: f.live,
      visible: true,
    });
    if (t - this.since < 120) this.raf = this.request(this.loop);
  };
}

/** Camera bearing (degrees) for a venue heading on a georeferenced map. */
export const bearingFor = (headingRad: number, g: Georeference) =>
  headingToBearing(headingRad, g);

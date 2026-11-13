import { useEffect, useRef, useState } from 'react';
import {
  FloorBelief,
  FloorChangeDetector,
  shownFloor,
  type FloorChangeEvent,
} from '@turn/positioning-core';
import { barometerAvailable, watchPressure } from '@turn/positioning-runtime';

export type FloorChange = {
  floorId: string;
  /** What decided it. */
  source: 'barometer' | 'beacons';
  event?: FloorChangeEvent;
};

/**
 * Which floor the walker is on while the live dot runs (Plan 005 §6.2): the barometer reports
 * floor changes, beacons vote for their floor, and the route adds a nudge at stairs and lifts.
 * `onChange` fires when another floor has become clearly more likely than the one shown.
 *
 * Feature-detected: without a barometer the beacons and the walker's confirmation carry it.
 */
export function useFloorSensing(input: {
  floors: { id: string; level: number }[];
  /** The floor the live dot is on; null while it is not running. */
  liveFloorId: string | null;
  /** Storey height in metres for this venue. */
  floorHeight?: number;
  /** Whether steps were detected in the last couple of seconds. */
  stepping: () => boolean;
  /** The strongest beacon heard on each floor just now. */
  votes: () => { floorId: string; rssi: number }[];
  /** The floor the route goes to next, while the walker is at its stairs or lift. */
  expectedFloorId: string | null;
  onChange: (change: FloorChange) => void;
}) {
  const [barometer, setBarometer] = useState<boolean | null>(null);
  /** A floor that leads without being clear enough to switch: the app may ask. */
  const [doubt, setDoubt] = useState<string | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const belief = useRef<FloorBelief | null>(null);

  useEffect(() => {
    let alive = true;
    void barometerAvailable().then((ok) => alive && setBarometer(ok));
    return () => {
      alive = false;
    };
  }, []);

  const floorsKey = input.floors.map((f) => `${f.id}:${f.level}`).join('|');
  const on = input.liveFloorId !== null && input.floors.length > 1;
  useEffect(() => {
    const start = latest.current.liveFloorId;
    if (!on || !start) {
      belief.current = null;
      setDoubt(null);
      return;
    }
    // The live dot was just started on this floor (by a fix, a code or a confirmation).
    const b = new FloorBelief(latest.current.floors, start, 0.92);
    belief.current = b;
    const detector = new FloorChangeDetector(
      latest.current.floorHeight
        ? { floorHeight: latest.current.floorHeight }
        : {},
    );
    let lastSource: FloorChange['source'] = 'beacons';
    let lastEvent: FloorChangeEvent | undefined;
    const decide = () => {
      const now = latest.current.liveFloorId;
      if (!now) return;
      const shown = shownFloor(now, b.estimate());
      setDoubt(shown.ask ? b.estimate().floorId : null);
      if (shown.floorId !== now)
        latest.current.onChange({
          floorId: shown.floorId,
          source: lastSource,
          event: lastEvent,
        });
    };
    const stopPressure = barometer
      ? watchPressure((s) => {
          const e = detector.update({
            ...s,
            stepping: latest.current.stepping(),
          });
          if (!e) return;
          lastSource = 'barometer';
          lastEvent = e;
          b.moved(e.floors, 0.9 * e.confidence);
          decide();
        })
      : () => undefined;
    const timer = setInterval(() => {
      const votes = latest.current.votes();
      if (votes.length) {
        lastSource = 'beacons';
        lastEvent = undefined;
        b.heard(votes);
      }
      const expected = latest.current.expectedFloorId;
      if (expected) b.expected(expected, 0.12);
      decide();
    }, 1000);
    return () => {
      stopPressure();
      clearInterval(timer);
    };
    // A new live floor restarts the belief there.
  }, [on, input.liveFloorId, floorsKey, barometer]);

  return {
    /** Whether this phone has a pressure sensor (null while unknown). */
    barometer,
    doubt,
    /** The walker said which floor they are on. */
    confirm: (floorId: string) => belief.current?.confirmed(floorId),
  };
}

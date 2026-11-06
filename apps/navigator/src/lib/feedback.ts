import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { formatDistance, type Step } from './directions';

/**
 * Spoken directions and haptic cues. Both are feature-detected: an app build without the native
 * modules (or the web) simply stays silent and still.
 */
const hasHaptics =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoHaptics') !== null;
const hasSpeech =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoSpeech') !== null;
/* eslint-disable @typescript-eslint/no-require-imports */
const Haptics = hasHaptics
  ? (require('expo-haptics') as typeof import('expo-haptics'))
  : null;
const Speech = hasSpeech
  ? (require('expo-speech') as typeof import('expo-speech'))
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */

let hapticsOn = true;
let voiceOn = true;
/** Follows the visitor's settings (called by the root layout). */
export function setFeedbackPrefs(p: { haptics: boolean; voice: boolean }) {
  hapticsOn = p.haptics;
  voiceOn = p.voice;
  if (!voiceOn) Speech?.stop();
}

export type HapticKind = 'tap' | 'turn' | 'success' | 'warning';
/** A short, distinct vibration per meaning: taps tick, turns knock, arrival and problems buzz. */
export function haptic(kind: HapticKind) {
  if (!Haptics || !hapticsOn) return;
  const run = () => {
    switch (kind) {
      case 'tap':
        return Haptics.selectionAsync();
      case 'turn':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'success':
        return Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      case 'warning':
        return Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
    }
  };
  run()?.catch(() => undefined);
}

/** Says `text`, interrupting anything still being said (directions go stale fast). */
export function speak(text: string) {
  if (!Speech || !voiceOn) return;
  Speech.stop();
  Speech.speak(text, { rate: Platform.OS === 'ios' ? 0.52 : 1.0 });
}
export const voiceAvailable = hasSpeech;
export const hapticsAvailable = hasHaptics;

/** Lower-case the first letter so "Turn left" reads naturally after "In 15 metres,". */
const lead = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * Announces navigation as the walker progresses: each manoeuvre once about 15 m ahead (when the
 * leg is long enough) and again when it is due, plus arrival. `walked` is metres along the route.
 */
export function useSpokenGuidance(
  active: boolean,
  steps: Step[] | null,
  walked: number,
  /** How close counts as "now" (metres): larger for live positions than for a demo walk. */
  nowWithin: number,
) {
  const said = useRef(new Set<string>());
  const route = useRef<Step[] | null>(null);
  useEffect(() => {
    if (!active || !steps?.length) {
      said.current.clear();
      route.current = null;
      return;
    }
    if (route.current !== steps) {
      // A new route: start with the first instruction.
      route.current = steps;
      said.current.clear();
      const first = steps.find((s) => s.kind !== 'depart') ?? steps[0]!;
      const head = steps[0]!;
      speak(
        head.kind === 'depart' && head.distance > 1
          ? `${head.text}, ${formatDistance(head.distance)}.`
          : first.text,
      );
      said.current.add(`0-near`);
    }
    const i = steps.findIndex((s) => s.along > walked + 0.5);
    if (i < 0) return;
    const step = steps[i]!;
    const ahead = step.along - walked;
    if (step.kind === 'arrive') {
      if (ahead <= nowWithin && !said.current.has(`${i}-near`)) {
        said.current.add(`${i}-near`);
        haptic('success');
      }
      return;
    }
    if (ahead <= nowWithin && !said.current.has(`${i}-near`)) {
      said.current.add(`${i}-near`);
      said.current.add(`${i}-far`);
      speak(step.text);
      haptic('turn');
    } else if (
      ahead <= 16 &&
      ahead > 9 &&
      !said.current.has(`${i}-far`) &&
      (steps[i - 1]?.distance ?? 0) > 22
    ) {
      said.current.add(`${i}-far`);
      speak(
        `In ${formatDistance(Math.round(ahead / 5) * 5)}, ${lead(step.text)}.`,
      );
    }
  }, [active, steps, walked, nowWithin]);
}

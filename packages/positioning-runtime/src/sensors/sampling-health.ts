import type { Observation } from '@turn/contracts';

const streams = [
  'accelerometer',
  'attitude',
  'gyroscope',
  'linear-acceleration',
] as const;

/** Delivery health only. Never invent samples or relax the motion classifier. */
export function createSamplingHealth(startedAtMs: number) {
  const receipts = new Map<string, number[]>();
  return {
    observe(observation: Observation, receivedAtMs: number) {
      if (!streams.some((stream) => stream === observation.type)) return;
      const recent = (receipts.get(observation.type) ?? []).filter(
        (time) => receivedAtMs - time <= 3000,
      );
      recent.push(receivedAtMs);
      receipts.set(observation.type, recent);
    },
    problem(nowMs: number): string | null {
      // Allow native startup; count only fresh, normalized events (not callbacks
      // containing repeated Android fields). All four streams are needed by v2.
      if (nowMs - startedAtMs < 4500) return null;
      for (const stream of streams) {
        const count = (receipts.get(stream) ?? []).filter(
          (time) => nowMs - time <= 3000,
        ).length;
        if (count < 75)
          return `Sensor data too slow: ${stream} is delivering about ${Math.round(count / 3)} updates/s; TURN needs at least 25. The TURN background sensor capture is active, but this stream is below the required rate. Save and send this recording for diagnosis.`;
      }
      return null;
    },
  };
}

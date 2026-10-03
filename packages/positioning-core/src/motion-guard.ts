import type { Observation } from '@turn/contracts';

export const GUARDED_PDR_REVISION = 'step-yaw-motion-v2' as const;
export type MotionState =
  | 'checking'
  | 'still'
  | 'vertical-motion'
  | 'rotation'
  | 'walking-like'
  | 'uncertain'
  | 'unavailable';
type Candidate = { time: number; heading: number };
type Sample = {
  time: number;
  vertical2: number;
  horizontal2: number;
  rotation2: number;
};
export type MotionFeatures = {
  verticalRms: number;
  horizontalRms: number;
  gyroRms: number;
};
export type MotionAssessment = MotionFeatures & { state: MotionState };

/** Experimental screen-up handheld filter, not a body-translation sensor.
 * Uses a 1.2 s window around each peak, delaying decisions by 0.65 s.
 * All thresholds are hypotheses for held-out evaluation, not learned guarantees.
 */
export class MotionGuard {
  private acceleration: Extract<Observation, { type: 'accelerometer' }> | null =
    null;
  private gyro: Extract<Observation, { type: 'gyroscope' }> | null = null;
  private samples: Sample[] = [];
  private candidates: Candidate[] = [];
  private ready: Candidate[] = [];
  private first: Candidate | null = null;
  private lastEligible = -Infinity;
  private lastCandidate = -Infinity;
  private continuous = false;
  private detected = 0;
  private rejected = 0;
  private assessment: MotionAssessment = {
    state: 'checking',
    verticalRms: 0,
    horizontalRms: 0,
    gyroRms: 0,
  };

  observe(o: Observation) {
    if (o.type === 'accelerometer' && o.includesGravity) this.acceleration = o;
    if (o.type === 'gyroscope') this.gyro = o;
    if (o.type !== 'linear-acceleration') return;
    const acc = this.acceleration,
      gyro = this.gyro;
    if (
      !acc ||
      !gyro ||
      Math.abs(o.timestampSeconds - acc.timestampSeconds) > 0.04 ||
      Math.abs(o.timestampSeconds - gyro.timestampSeconds) > 0.06
    )
      return;
    // Gravity is in the same device frame as linear acceleration; no Euler convention assumptions.
    const gravity = acc.values.map((v, i) => v - o.values[i]!);
    const gravityNorm = Math.hypot(...gravity);
    if (gravityNorm < 7 || gravityNorm > 12) return;
    const vertical =
      o.values.reduce((sum, v, i) => sum + v * gravity[i]!, 0) / gravityNorm;
    this.samples.push({
      time: o.timestampSeconds,
      vertical2: vertical * vertical,
      horizontal2: Math.max(
        0,
        o.values.reduce((s, v) => s + v * v, 0) - vertical * vertical,
      ),
      rotation2: gyro.values.reduce((s, v) => s + v * v, 0),
    });
    this.samples = this.samples.filter((s) => o.timestampSeconds - s.time <= 4);
  }
  candidate(time: number, heading: number) {
    this.detected++;
    this.lastCandidate = time;
    this.candidates.push({ time, heading });
  }
  private classify(start: number, end: number): MotionAssessment {
    const samples = this.samples.filter(
      (s) => s.time >= start && s.time <= end,
    );
    const unavailable = {
      state: 'unavailable' as const,
      verticalRms: 0,
      horizontalRms: 0,
      gyroRms: 0,
    };
    if (
      samples.length < 25 ||
      samples[0]!.time - start > 0.1 ||
      end - samples.at(-1)!.time > 0.1 ||
      samples.some((s, i) => i > 0 && s.time - samples[i - 1]!.time > 0.1)
    )
      return unavailable;
    const rms = (key: 'vertical2' | 'horizontal2' | 'rotation2') =>
      Math.sqrt(samples.reduce((sum, s) => sum + s[key], 0) / samples.length);
    const verticalRms = rms('vertical2'),
      horizontalRms = rms('horizontal2'),
      gyroRms = rms('rotation2');
    const features = { verticalRms, horizontalRms, gyroRms };
    if (Math.hypot(verticalRms, horizontalRms) < 0.35)
      return { ...features, state: 'still' };
    if (gyroRms > 1.5) return { ...features, state: 'rotation' };
    if (verticalRms > 0.6 && horizontalRms / verticalRms < 0.4)
      return { ...features, state: 'vertical-motion' };
    if (
      verticalRms >= 0.35 &&
      horizontalRms >= 0.25 &&
      horizontalRms / verticalRms >= 0.45
    )
      return { ...features, state: 'walking-like' };
    return { ...features, state: 'uncertain' };
  }
  advance(now: number): Candidate | undefined {
    if (this.first && now - this.first.time > 1.9) {
      this.rejected++;
      this.first = null;
    }
    if (now - this.lastEligible > 1.9) this.continuous = false;
    while (this.candidates.length && now - this.candidates[0]!.time >= 0.65) {
      const candidate = this.candidates.shift()!;
      this.assessment = this.classify(
        candidate.time - 0.6,
        candidate.time + 0.6,
      );
      if (this.assessment.state !== 'walking-like') {
        this.rejected++;
        if (this.first) {
          this.rejected++;
          this.first = null;
        }
        this.continuous = false;
        continue;
      }
      const interval = candidate.time - this.lastEligible;
      if (
        interval >= 0.3 &&
        interval <= 1.2 &&
        (this.continuous || this.first)
      ) {
        if (this.first) this.ready.push(this.first);
        this.first = null;
        this.ready.push(candidate);
        this.continuous = true;
      } else {
        if (this.first) this.rejected++;
        this.first = candidate;
        this.continuous = false;
      }
      this.lastEligible = candidate.time;
    }
    if (now - this.lastCandidate > 1.9)
      this.assessment = this.classify(now - 1.2, now);
    // One accepted peak per observation keeps the existing trail/replay event contract.
    return this.ready.shift();
  }
  finish() {
    this.rejected +=
      this.candidates.length + this.ready.length + (this.first ? 1 : 0);
    this.candidates = [];
    this.ready = [];
    this.first = null;
    this.continuous = false;
  }
  snapshot() {
    return {
      ...this.assessment,
      detected: this.detected,
      rejected: this.rejected,
      pending:
        this.candidates.length + this.ready.length + (this.first ? 1 : 0),
    };
  }
}

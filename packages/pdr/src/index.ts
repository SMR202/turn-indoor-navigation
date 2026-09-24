export const PDR_REVISION = 'step-yaw-v1';
export const wrapAngle = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

export function calibratedStepLength(
  distanceMetres: number,
  countedSteps: number,
): number {
  if (
    !Number.isFinite(distanceMetres) ||
    distanceMetres < 5 ||
    !Number.isInteger(countedSteps) ||
    countedSteps < 5
  )
    throw new Error('Measure at least 5 metres and count at least 5 steps.');
  const length = distanceMetres / countedSteps;
  if (length < 0.3 || length > 1.2)
    throw new Error(
      'Step length must be 0.30–1.20 m. Check distance and count.',
    );
  return length;
}

/** Time-aware, hysteretic gait baseline. Thresholds are experimental, not tuned accuracy. */
export class StepDetector {
  private start: number | null = null;
  private last = -Infinity;
  private baseline = 9.80665;
  private filtered = 0;
  private armed = false;
  private peak: { value: number; time: number } | null = null;
  private lastStep = -Infinity;
  update(
    time: number,
    magnitude: number,
  ): { stepAt: number | null; issue?: string } {
    if (!Number.isFinite(time) || !Number.isFinite(magnitude) || time < 0)
      return { stepAt: null, issue: 'Invalid sensor value' };
    if (time <= this.last)
      return {
        stepAt: null,
        issue: 'Duplicate or reversed acceleration timestamp',
      };
    const dt = this.last === -Infinity ? 0.02 : time - this.last;
    this.last = time;
    if (dt > 0.4)
      return { stepAt: null, issue: 'Motion gap over 400 ms; re-anchor' };
    if (this.start === null) {
      this.start = time;
      this.baseline = magnitude;
    }
    this.baseline += (1 - Math.exp(-dt / 0.8)) * (magnitude - this.baseline);
    this.filtered +=
      (1 - Math.exp(-dt / 0.06)) * (magnitude - this.baseline - this.filtered);
    if (magnitude < 3 || magnitude > 20)
      return { stepAt: null, issue: 'Impact/freefall outside walking range' };
    if (time - this.start < 1) return { stepAt: null };
    if (
      (this.filtered < -0.15 ||
        (this.lastStep === -Infinity && Math.abs(this.filtered) < 0.1)) &&
      !this.peak
    )
      this.armed = true;
    if (this.armed && this.filtered > 0.75) {
      if (!this.peak || this.filtered > this.peak.value)
        this.peak = { value: this.filtered, time };
    }
    if (this.peak && time - this.peak.time > 0.8) {
      this.peak = null;
      this.armed = false;
    }
    if (this.peak && this.filtered < 0) {
      const candidate = this.peak;
      this.peak = null;
      this.armed = false;
      if (candidate.time - this.lastStep >= 0.3) {
        this.lastStep = candidate.time;
        return { stepAt: candidate.time };
      }
    }
    return { stepAt: null };
  }
}

import type { Observation } from '@turn/contracts';

// Acquisition protocol, separate from the replayable PDR revision. Three seconds
// to settle the grip, then the detector's one-second warm-up before the cue.
export class SettledStart {
  private alignedAt: number | null = null;
  private warmupAt: number | null = null;
  consume(event: Observation, headingRad: number) {
    let alignment: Observation | null = null;
    if (
      this.alignedAt === null &&
      event.type === 'attitude' &&
      event.timestampSeconds >= 3
    ) {
      this.alignedAt = event.timestampSeconds;
      alignment = {
        schemaVersion: 1,
        sessionId: event.sessionId,
        source: 'settled-user-heading',
        timestampSeconds: event.timestampSeconds,
        type: 'heading-alignment',
        headingRad,
        frame: 'venue',
      };
    }
    if (this.alignedAt !== null && event.type === 'accelerometer')
      this.warmupAt ??= event.timestampSeconds;
    const remaining =
      this.alignedAt === null
        ? Math.max(1, Math.ceil(4 - event.timestampSeconds))
        : this.warmupAt === null
          ? 1
          : Math.max(
              0,
              Math.ceil(this.warmupAt + 1.1 - event.timestampSeconds),
            );
    return {
      alignment,
      remaining,
      readyAt: this.warmupAt === null ? null : this.warmupAt + 1.1,
    };
  }
}

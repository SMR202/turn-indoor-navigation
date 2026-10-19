import { expect, it } from 'vitest';
import type { Observation } from '@turn/contracts';
import { createSamplingHealth } from './sampling-health';

function feed(rate: number, omit?: string) {
  const health = createSamplingHealth(0);
  for (let ms = 0; ms <= 5000; ms += 1000 / rate) {
    for (const type of [
      'accelerometer',
      'attitude',
      'gyroscope',
      'linear-acceleration',
    ]) {
      if (type !== omit) health.observe({ type } as Observation, ms);
    }
  }
  return health;
}

it('allows startup, then explains the Pixel 5–8 Hz failure without accepting false steps', () => {
  expect(createSamplingHealth(0).problem(4000)).toBeNull();
  for (const rate of [5, 8]) {
    expect(feed(rate).problem(5000)).toContain('Sensor data too slow');
  }
});
it('accepts 50 Hz delivery and detects a missing or stalled richer sensor', () => {
  expect(feed(50).problem(5000)).toBeNull();
  expect(feed(50, 'linear-acceleration').problem(5000)).toContain(
    'linear-acceleration',
  );
  expect(feed(50).problem(9000)).toContain('Sensor data too slow');
});

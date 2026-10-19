// Moved to @turn/positioning-runtime (shared with the TURN visitor app). The test app keeps saving
// every assisted-navigation trace locally for upload, so this wrapper supplies that default.
import {
  AssistedTracker as SharedTracker,
  type TrackerOptions,
} from '@turn/positioning-runtime/src/assisted-tracker';
import { saveBleTrace } from '../fingerprinting/storage';

export type {
  BeaconHealth,
  TrackerEstimate,
  TrackerOptions,
} from '@turn/positioning-runtime/src/assisted-tracker';
export class AssistedTracker extends SharedTracker {
  constructor(options: TrackerOptions) {
    super({ save: saveBleTrace, ...options });
  }
}

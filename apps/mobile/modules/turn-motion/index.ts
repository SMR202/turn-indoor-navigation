import { requireOptionalNativeModule, NativeModule } from 'expo';

export interface RawMotionEvent {
  type: number;
  timestamp: number;
  values: [number, number, number];
}
export interface MotionBatch {
  token: string;
  sequence: number;
  samples: RawMotionEvent[];
}
type Events = {
  onBatch: (batch: MotionBatch) => void;
  onFailure: (failure: { token: string; message: string }) => void;
};
declare class TurnMotion extends NativeModule<Events> {
  revision: string;
  start(token: string): Promise<void>;
  stop(token: string): void;
  acknowledge(token: string, sequence: number): void;
}

// Absent in Expo Go/iOS/web. Android must use the matching installed TURN build.
export default requireOptionalNativeModule<TurnMotion>('TurnMotion');

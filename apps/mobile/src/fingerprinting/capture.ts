import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Magnetometer } from 'expo-sensors';
import { requireOptionalNativeModule } from 'expo';
import { scanBeacons } from './ble';
import {
  fingerprintCaptureSchema,
  type FingerprintCapture,
} from '@turn/positioning-core';

type WifiResult = { status: string; readings: FingerprintCapture['wifi'] };
const wifi = requireOptionalNativeModule<{
  scan(salt: string): Promise<WifiResult>;
  cancel(): void;
}>('TurnWifi');
export const wifiBuildAvailable = Boolean(wifi);

async function prepareWifi(enabled: boolean): Promise<string | null> {
  if (!enabled) return 'Wi-Fi not selected';
  if (Platform.OS !== 'android')
    return 'Wi-Fi scanning is unavailable on iPhone';
  if (!wifi) return 'Install Android fingerprint build 3 to enable Wi-Fi';
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  return result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
    'granted'
    ? null
    : 'Precise location permission denied; captured magnetic readings only';
}

/** Single foreground capture. Cancellation and native clocks are retained independently of React rendering. */
export async function captureFingerprint(
  profile: string,
  enableWifi: boolean,
  signal: AbortSignal,
  progress: (seconds: number) => void,
  enableBle = false,
): Promise<FingerprintCapture> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    throw new Error('Open TURN on your phone to capture real sensor readings.');
  if (!(await Magnetometer.isAvailableAsync()))
    throw new Error('This phone does not expose a magnetometer.');
  if (
    Platform.OS === 'ios' &&
    !(await Magnetometer.requestPermissionsAsync()).granted
  )
    throw new Error(
      'Allow motion access in phone settings to record magnetic signals.',
    );
  const wifiMessage = await prepareWifi(enableWifi);
  if (signal.aborted)
    throw new Error('Capture cancelled. Nothing was added to the survey.');
  if (AppState.currentState !== 'active')
    throw new Error('Return to TURN, then start capture again.');
  const radio = wifiMessage
    ? Promise.resolve({ status: wifiMessage, readings: [] } as WifiResult)
    : wifi!
        .scan(profile)
        .catch(
          (e: unknown) => ({ status: String(e), readings: [] }) as WifiResult,
        );
  // Same 8-second window as the magnetic capture; a failed scan is recorded as unavailable, never as silence.
  const beacons = enableBle ? scanBeacons(8000, signal) : Promise.resolve(null);
  const magnetic: FingerprintCapture['magnetic'] = [];
  const started = performance.now();
  const cancelRadio = () => wifi?.cancel();
  signal.addEventListener('abort', cancelRadio);
  let origin: number | null = null;
  let last = -Infinity;
  try {
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        sub.remove();
        lifecycle.remove();
        clearInterval(ticker);
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      };
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const abort = () =>
        finish(
          new Error('Capture cancelled. Nothing was added to the survey.'),
        );
      Magnetometer.setUpdateInterval(100);
      const sub = Magnetometer.addListener((s) => {
        if (![s.x, s.y, s.z, s.timestamp].every(Number.isFinite)) return;
        if (s.timestamp <= last) return;
        origin ??= s.timestamp;
        last = s.timestamp;
        const t = s.timestamp - origin;
        if (magnetic.length < 2000)
          magnetic.push({ t, x: s.x, y: s.y, z: s.z });
      });
      const lifecycle = AppState.addEventListener('change', (state) => {
        if (state !== 'active')
          finish(new Error('Capture interrupted. Keep TURN open and retry.'));
      });
      const ticker = setInterval(
        () => progress(Math.min(8, (performance.now() - started) / 1000)),
        200,
      );
      const timer = setTimeout(() => finish(), 8000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    const readings = await radio;
    const bleResult = await beacons;
    if (signal.aborted || AppState.currentState !== 'active')
      throw new Error('Capture interrupted. Retry while TURN is open.');
    if (magnetic.length < 30 || (magnetic.at(-1)?.t ?? 0) < 5)
      throw new Error(
        'Not enough fresh magnetic readings. Keep TURN open, hold still and retry.',
      );
    return fingerprintCaptureSchema.parse({
      id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      platform: Platform.OS,
      deviceProfile: profile,
      durationSeconds: (performance.now() - started) / 1000,
      magnetic,
      wifi: readings.readings,
      wifiStatus: readings.status,
      ...(bleResult
        ? {
            bleStatus: bleResult.status,
            ...(bleResult.completed ? { ble: bleResult.readings } : {}),
          }
        : {}),
    });
  } finally {
    signal.removeEventListener('abort', cancelRadio);
    wifi?.cancel();
  }
}

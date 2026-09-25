import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { recordingSchema, type Recording } from '@turn/positioning-core';

const prefix = 'turn-run-v1-';
function safeId(id: string) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id))
    throw new Error('Invalid run identifier');
  return `${prefix}${id}.json`;
}
// One file per run: no shared index to lose on an interrupted index write.
export function saveRun(recording: Recording) {
  const data = recordingSchema.parse(recording);
  const name = safeId(data.sessionId);
  const content = JSON.stringify(data);
  if (Platform.OS === 'web') localStorage.setItem(name, content);
  else {
    const directory = new Directory(Paths.document, 'turn-runs');
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, name);
    file.create({ overwrite: true });
    file.write(content);
  }
}
export async function listRuns(): Promise<string[]> {
  if (Platform.OS === 'web')
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .sort()
      .reverse();
  const directory = new Directory(Paths.document, 'turn-runs');
  if (!directory.exists) return [];
  return directory
    .list()
    .filter((f) => f instanceof File && f.name.startsWith(prefix))
    .map((f) => f.name)
    .sort()
    .reverse();
}
export async function readRun(name: string): Promise<Recording> {
  if (!/^turn-run-v1-[a-zA-Z0-9-]{1,100}\.json$/.test(name))
    throw new Error('Invalid saved run');
  const raw =
    Platform.OS === 'web'
      ? localStorage.getItem(name)
      : await new File(Paths.document, 'turn-runs', name).text();
  if (!raw) throw new Error('Saved run is unavailable');
  return recordingSchema.parse(JSON.parse(raw));
}

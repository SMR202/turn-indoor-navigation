import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Recording } from '@turn/positioning-core';

export async function exportRecording(recording: Recording | null) {
  if (!recording)
    throw new Error('Establish an anchor and record a walk first.');
  const content = JSON.stringify(recording);
  if (Platform.OS === 'web')
    throw new Error('Recording export is for phone testing.');
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing unavailable on this device.');
  const file = new File(Paths.cache, `${recording.sessionId}.json`);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save your TURN test recording',
  });
}

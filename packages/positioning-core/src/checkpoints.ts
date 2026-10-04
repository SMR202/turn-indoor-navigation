import type { Recording } from './engine';

/** Evaluation annotation only. Never inserted into positioning observations. */
export function appendCheckpoint(
  recording: Recording,
  nodeId: string,
  phase: 'arrival' | 'after-wait',
) {
  if (recording.navigation?.completion !== 'in-progress')
    throw new Error('Start navigation before marking a checkpoint.');
  if (!recording.venue?.nodes.some((n) => n.id === nodeId))
    throw new Error('Checkpoint is not in the recorded venue.');
  if (!recording.observations.some((o) => o.type === 'accelerometer'))
    throw new Error('Wait for live motion samples.');
  if ((recording.checkpoints?.length ?? 0) >= 100)
    throw new Error('Checkpoint limit reached. Finish and save this walk.');
  const checkpoint = {
    nodeId,
    timestampSeconds: recording.observations.reduce(
      (latest, o) => Math.max(latest, o.timestampSeconds),
      0,
    ),
    afterObservationCount: recording.observations.length,
    phase,
    reference: 'user-confirmed-map-point' as const,
  };
  recording.checkpoints ??= [];
  recording.checkpoints.push(checkpoint);
  return checkpoint;
}

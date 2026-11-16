/**
 * Reservoir sampling for camera snapshots during live supervisor monitoring.
 * Stores at most 10 representative frames per student in browser memory for Excel export.
 */

export interface CameraSnapshotEvent {
  session_id: string;
  name?: string;
  roll_number?: string;
  frame: string; // base64 JPEG data URL
  timestamp?: number;
}

export interface StudentSnapshotSample {
  session_id: string;
  name: string;
  roll_number: string;
  selectedSnapshots: string[];
  snapshotCount: number;
}

const MAX_SNAPSHOTS = 10;
const samples = new Map<string, StudentSnapshotSample>();
let activeQuizId: string | null = null;

export function startCameraSnapshotSession(quizId: string): void {
  if (activeQuizId !== quizId) {
    samples.clear();
    activeQuizId = quizId;
  }
}

export function recordCameraSnapshot(event: CameraSnapshotEvent): void {
  const sessionId = event.session_id;
  if (!sessionId || !event.frame) return;

  const previous: StudentSnapshotSample = samples.get(sessionId) || {
    session_id: sessionId,
    name: event.name || "Student",
    roll_number: event.roll_number || "—",
    selectedSnapshots: [],
    snapshotCount: 0,
  };

  previous.name = event.name || previous.name;
  previous.roll_number = event.roll_number || previous.roll_number;
  previous.snapshotCount += 1;

  // Algorithm R Reservoir Sampling:
  if (previous.selectedSnapshots.length < MAX_SNAPSHOTS) {
    previous.selectedSnapshots.push(event.frame);
  } else {
    const randomIndex = Math.floor(Math.random() * previous.snapshotCount);
    if (randomIndex < MAX_SNAPSHOTS) {
      previous.selectedSnapshots[randomIndex] = event.frame;
    }
  }

  samples.set(sessionId, previous);
}

export function getCameraSnapshotSamples(): Array<{
  session_id: string;
  name: string;
  roll_number: string;
  snapshots: string[];
}> {
  return [...samples.values()].map((sample) => ({
    session_id: sample.session_id,
    name: sample.name,
    roll_number: sample.roll_number,
    snapshots: [...sample.selectedSnapshots],
  }));
}

export function clearCameraSnapshotSamples(): void {
  samples.clear();
  activeQuizId = null;
}

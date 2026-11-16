const MAX_SNAPSHOTS = 10;
const samples = new Map();
let activeQuizId = null;

export function startCameraSnapshotSession(quizId) {
  if (activeQuizId !== quizId) {
    samples.clear();
    activeQuizId = quizId;
  }
}

export function recordCameraSnapshot(event) {
  const sessionId = event.session_id;
  if (!sessionId || !event.frame) return;
  const previous = samples.get(sessionId) || {
    session_id: sessionId,
    name: event.name,
    roll_number: event.roll_number,
    selectedSnapshots: [],
    snapshotCount: 0,
  };
  previous.name = event.name || previous.name;
  previous.roll_number = event.roll_number || previous.roll_number;
  previous.snapshotCount += 1;

  if (previous.selectedSnapshots.length < MAX_SNAPSHOTS) {
    previous.selectedSnapshots.push(event.frame);
  } else {
    const randomIndex = Math.floor(Math.random() * previous.snapshotCount);
    if (randomIndex < MAX_SNAPSHOTS) previous.selectedSnapshots[randomIndex] = event.frame;
  }
  samples.set(sessionId, previous);
}

export function getCameraSnapshotSamples() {
  return [...samples.values()].map((sample) => ({
    session_id: sample.session_id,
    name: sample.name,
    roll_number: sample.roll_number,
    snapshots: [...sample.selectedSnapshots],
  }));
}

export function clearCameraSnapshotSamples() {
  samples.clear();
}

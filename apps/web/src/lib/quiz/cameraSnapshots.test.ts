import { describe, it, expect, beforeEach } from 'vitest';
import {
  startCameraSnapshotSession,
  recordCameraSnapshot,
  getCameraSnapshotSamples,
  clearCameraSnapshotSamples,
} from './cameraSnapshots';

describe('Camera Snapshots Reservoir Sampling', () => {
  beforeEach(() => {
    clearCameraSnapshotSamples();
  });

  it('records initial snapshots up to MAX_SNAPSHOTS (10)', () => {
    startCameraSnapshotSession('quiz-101');

    for (let i = 1; i <= 8; i++) {
      recordCameraSnapshot({
        session_id: 'student-1',
        name: 'Alice',
        roll_number: 'ROLL-01',
        frame: `data:image/jpeg;base64,frame-${i}`,
      });
    }

    const samples = getCameraSnapshotSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].session_id).toBe('student-1');
    expect(samples[0].snapshots).toHaveLength(8);
    expect(samples[0].snapshots[0]).toBe('data:image/jpeg;base64,frame-1');
    expect(samples[0].snapshots[7]).toBe('data:image/jpeg;base64,frame-8');
  });

  it('bounds stored snapshots to at most 10 frames when many are captured', () => {
    startCameraSnapshotSession('quiz-102');

    // Simulate 50 captured snapshots
    for (let i = 1; i <= 50; i++) {
      recordCameraSnapshot({
        session_id: 'student-2',
        name: 'Bob',
        roll_number: 'ROLL-02',
        frame: `data:image/jpeg;base64,frame-${i}`,
      });
    }

    const samples = getCameraSnapshotSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].snapshots).toHaveLength(10);
  });

  it('tracks multiple simultaneous candidates independently', () => {
    startCameraSnapshotSession('quiz-103');

    recordCameraSnapshot({
      session_id: 'student-A',
      name: 'Alice',
      roll_number: 'ROLL-A',
      frame: 'data:image/jpeg;base64,alice-frame-1',
    });

    recordCameraSnapshot({
      session_id: 'student-B',
      name: 'Bob',
      roll_number: 'ROLL-B',
      frame: 'data:image/jpeg;base64,bob-frame-1',
    });

    const samples = getCameraSnapshotSamples();
    expect(samples).toHaveLength(2);
    const alice = samples.find((s) => s.session_id === 'student-A');
    const bob = samples.find((s) => s.session_id === 'student-B');

    expect(alice?.name).toBe('Alice');
    expect(alice?.snapshots).toEqual(['data:image/jpeg;base64,alice-frame-1']);
    expect(bob?.name).toBe('Bob');
    expect(bob?.snapshots).toEqual(['data:image/jpeg;base64,bob-frame-1']);
  });

  it('clears snapshots on session change', () => {
    startCameraSnapshotSession('quiz-alpha');
    recordCameraSnapshot({
      session_id: 'student-X',
      name: 'Xavier',
      roll_number: 'ROLL-X',
      frame: 'data:image/jpeg;base64,x-frame',
    });
    expect(getCameraSnapshotSamples()).toHaveLength(1);

    startCameraSnapshotSession('quiz-beta');
    expect(getCameraSnapshotSamples()).toHaveLength(0);
  });
});

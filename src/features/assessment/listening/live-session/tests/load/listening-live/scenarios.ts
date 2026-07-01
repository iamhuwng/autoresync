import type { ListeningLiveLoadHarnessConfig } from './config';
import type { LiveAudioAction } from '../../../authority/masterAudioState.types';

export const LISTENING_LIVE_LOAD_NETWORK_PROFILES = [
  'normal-broadband',
  'latency-150-jitter-30',
  'latency-400-jitter-100',
  'packet-loss-1-percent',
  'teacher-offline-10s',
  'student-offline-15s',
  'media-buffering-throttle',
  'refresh-delay-near-expiry',
] as const;

export type ListeningLiveLoadNetworkProfile = typeof LISTENING_LIVE_LOAD_NETWORK_PROFILES[number];

export interface ListeningLiveLoadStudentPlan {
  readonly studentClientId: string;
  readonly joinAtMs: number;
  readonly networkProfile: ListeningLiveLoadNetworkProfile;
}

export interface ListeningLiveLoadTeacherActionPlan {
  readonly atMs: number;
  readonly action: Exclude<LiveAudioAction, 'initialize' | 'play'>;
  readonly section?: number;
  readonly position?: number;
  readonly speed?: number;
  readonly colliding?: boolean;
}

export interface ListeningLiveLoadStudentEventPlan {
  readonly atMs: number;
  readonly type: 'join' | 'reload' | 'student-partition' | 'media-buffering' | 'refresh-delay';
  readonly studentClientId: string;
}

export interface ListeningLiveLoadSessionPlan {
  readonly sessionCode: string;
  readonly teacherClientId: string;
  readonly collisionTeacherClientId?: string;
  readonly students: readonly ListeningLiveLoadStudentPlan[];
  readonly teacherActions: readonly ListeningLiveLoadTeacherActionPlan[];
  readonly studentEvents: readonly ListeningLiveLoadStudentEventPlan[];
}

export interface ListeningLiveLoadScenario {
  readonly runId: string;
  readonly durationMs: number;
  readonly sessions: readonly ListeningLiveLoadSessionPlan[];
  readonly networkProfiles: readonly ListeningLiveLoadNetworkProfile[];
  readonly fidelity: {
    readonly virtualFirebaseSdkClients: boolean;
    readonly syntheticTeacherAuthorityWriter: boolean;
    readonly syntheticStudentAuthorityListeners: boolean;
    readonly browserMediaTierDefined: boolean;
    readonly studentAuthorityWritesForbidden: boolean;
    readonly localDryRunDefault: boolean;
  };
  readonly totals: {
    readonly sessions: number;
    readonly students: number;
    readonly teacherWriters: number;
    readonly collisionMonitorSessions: number;
  };
}

const actionCycle: readonly ListeningLiveLoadTeacherActionPlan[] = [
  { atMs: 2 * 60 * 1000, action: 'resume' },
  { atMs: 5 * 60 * 1000, action: 'pause' },
  { atMs: 6 * 60 * 1000, action: 'seek', position: 45 },
  { atMs: 8 * 60 * 1000, action: 'speed', speed: 1.25 },
  { atMs: 12 * 60 * 1000, action: 'section', section: 2, position: 0 },
];

export function generateListeningLiveLoadScenario(
  config: ListeningLiveLoadHarnessConfig,
): ListeningLiveLoadScenario {
  const sessions = Array.from({ length: config.sessions }, (_, sessionIndex) =>
    createSessionPlan(config, sessionIndex),
  );

  return {
    runId: config.runId,
    durationMs: config.rampMs + config.steadyStateMs + config.recoveryDrainMs,
    sessions,
    networkProfiles: LISTENING_LIVE_LOAD_NETWORK_PROFILES,
    fidelity: {
      virtualFirebaseSdkClients: true,
      syntheticTeacherAuthorityWriter: true,
      syntheticStudentAuthorityListeners: true,
      browserMediaTierDefined: true,
      studentAuthorityWritesForbidden: true,
      localDryRunDefault: config.executionMode === 'local-dry-run',
    },
    totals: {
      sessions: config.sessions,
      students: config.sessions * config.studentsPerSession,
      teacherWriters: config.teacherWriters,
      collisionMonitorSessions: config.collisionMonitorSessions,
    },
  };
}

function createSessionPlan(
  config: ListeningLiveLoadHarnessConfig,
  sessionIndex: number,
): ListeningLiveLoadSessionPlan {
  const sessionNumber = sessionIndex + 1;
  const sessionCode = `${config.sessionCodePrefix}-${String(sessionNumber).padStart(3, '0')}`;
  const students = Array.from({ length: config.studentsPerSession }, (_, studentIndex) =>
    createStudentPlan(sessionCode, studentIndex),
  );
  const collisionTeacherClientId = sessionIndex >= config.sessions - config.collisionMonitorSessions
    ? `${sessionCode}-teacher-tab-2`
    : undefined;

  return {
    sessionCode,
    teacherClientId: `${sessionCode}-teacher-tab-1`,
    collisionTeacherClientId,
    students,
    teacherActions: collisionTeacherClientId
      ? [...actionCycle, { atMs: 30_000, action: 'seek', position: 5, colliding: true }]
      : actionCycle,
    studentEvents: createStudentEvents(students),
  };
}

function createStudentPlan(
  sessionCode: string,
  studentIndex: number,
): ListeningLiveLoadStudentPlan {
  const profile = LISTENING_LIVE_LOAD_NETWORK_PROFILES[
    studentIndex % LISTENING_LIVE_LOAD_NETWORK_PROFILES.length
  ];
  if (!profile) {
    throw new Error('Missing load-test network profile');
  }
  return {
    studentClientId: `${sessionCode}-student-${String(studentIndex + 1).padStart(3, '0')}`,
    joinAtMs: studentIndex * 250,
    networkProfile: profile,
  };
}

function createStudentEvents(
  students: readonly ListeningLiveLoadStudentPlan[],
): readonly ListeningLiveLoadStudentEventPlan[] {
  const selected = students.slice(0, 5);
  const eventTypes: ListeningLiveLoadStudentEventPlan['type'][] = [
    'join',
    'reload',
    'student-partition',
    'media-buffering',
    'refresh-delay',
  ];
  return selected.map((student, index) => ({
    atMs: student.joinAtMs + (index + 1) * 60_000,
    type: eventTypes[index] ?? 'join',
    studentClientId: student.studentClientId,
  }));
}

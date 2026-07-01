import type {
  LiveAudioAuthorityIntent,
} from '../../../authority/liveAudioAuthorityTransaction';
import {
  buildLiveAudioAuthorityTransaction,
  createInitialMasterAudioState,
} from '../../../authority/liveAudioAuthorityTransaction';
import type { MasterAudioStateV2 } from '../../../authority/masterAudioState.types';
import type { ListeningLiveLoadMetricsCollector } from './metrics';

export interface InMemoryListeningLiveLoadSession {
  readonly sessionCode: string;
  state: MasterAudioStateV2;
}

export interface InMemoryListeningLiveLoadSessionInput {
  readonly sessionCode: string;
  readonly teacherUid: string;
  readonly writerClientId: string;
  readonly now: number;
  readonly metrics?: ListeningLiveLoadMetricsCollector;
}

export interface VirtualTeacherActionInput {
  readonly session: InMemoryListeningLiveLoadSession;
  readonly teacherUid: string;
  readonly writerClientId: string;
  readonly intent: LiveAudioAuthorityIntent;
  readonly now: number;
  readonly expectedRevision: number;
  readonly retryOnConflict?: boolean;
  readonly metrics?: ListeningLiveLoadMetricsCollector;
}

export interface VirtualTeacherActionResult {
  readonly status: 'accepted' | 'retried-after-conflict' | 'rejected-conflict';
  readonly revision: number;
}

export function createInMemoryListeningLiveLoadSession({
  sessionCode,
  teacherUid,
  writerClientId,
  now,
  metrics,
}: InMemoryListeningLiveLoadSessionInput): InMemoryListeningLiveLoadSession {
  metrics?.sample('authority_write_latency_ms', 0);
  return {
    sessionCode,
    state: createInitialMasterAudioState({
      teacherUid,
      writerClientId,
      now,
      section: 1,
      actionId: `${sessionCode}-initialize`,
    }),
  };
}

export function issueVirtualTeacherAction({
  session,
  teacherUid,
  writerClientId,
  intent,
  now,
  expectedRevision,
  retryOnConflict = false,
  metrics,
}: VirtualTeacherActionInput): VirtualTeacherActionResult {
  if (expectedRevision !== session.state.revision) {
    metrics?.increment('authority_revision_conflict_total');
    metrics?.increment('firebase_transaction_rejected_total');
    metrics?.increment('authority_writer_contention_total');
    if (!retryOnConflict) {
      return { status: 'rejected-conflict', revision: session.state.revision };
    }
    metrics?.increment('authority_retry_total');
  }

  const transaction = buildLiveAudioAuthorityTransaction({
    sessionCode: session.sessionCode,
    previousState: session.state,
    intent,
    teacherUid,
    writerClientId,
    now,
  });
  session.state = transaction.state;
  metrics?.sample('authority_write_latency_ms', expectedRevision === transaction.state.revision - 1 ? 100 : 180);

  return {
    status: expectedRevision === transaction.state.revision - 1 ? 'accepted' : 'retried-after-conflict',
    revision: transaction.state.revision,
  };
}

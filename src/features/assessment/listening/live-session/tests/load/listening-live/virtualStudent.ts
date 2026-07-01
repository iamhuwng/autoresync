import {
  classifyLiveAudioDrift,
} from '../../../authority/liveAudioSyncPolicy';
import {
  resolveLiveAudioHydration,
  shouldAcceptCanonicalAudioState,
  type LiveAudioHydrationSection,
} from '../../../authority/liveAudioRuntimeHydration';
import type { MasterAudioStateV2 } from '../../../authority/masterAudioState.types';
import type { ListeningLiveLoadMetricsCollector } from './metrics';
import type { ListeningLiveLoadNetworkProfile } from './scenarios';

export interface VirtualStudentClientInput {
  readonly studentClientId: string;
  readonly networkProfile: ListeningLiveLoadNetworkProfile;
  readonly metrics?: ListeningLiveLoadMetricsCollector;
}

export interface VirtualStudentReceiptInput {
  readonly masterState: MasterAudioStateV2;
  readonly audioSections: readonly LiveAudioHydrationSection[];
  readonly now: number;
  readonly localAudioIndex?: number;
  readonly localPosition?: number;
  readonly sequence: number;
}

export interface VirtualStudentReceipt {
  readonly accepted: boolean;
  readonly reason: string;
  readonly correction: 'none' | 'soft-correction' | 'hard-seek';
  readonly networkDelayMs: number;
}

export interface VirtualStudentClient {
  receiveCanonicalState(input: VirtualStudentReceiptInput): VirtualStudentReceipt;
  attemptAuthorityWrite(): { readonly allowed: false; readonly reason: 'student_clients_never_write_authority' };
}

export function createVirtualStudentClient({
  networkProfile,
  metrics,
}: VirtualStudentClientInput): VirtualStudentClient {
  let currentState: MasterAudioStateV2 | null = null;
  let connectedRecorded = false;

  return {
    receiveCanonicalState(input) {
      const decision = shouldAcceptCanonicalAudioState({
        currentState,
        nextState: input.masterState,
      });
      const networkDelayMs = calculateListeningLiveNetworkDelayMs(networkProfile, input.sequence);
      metrics?.sample('authority_event_delivery_latency_ms', networkDelayMs);

      if (!decision.accept) {
        return { accepted: false, reason: decision.reason, correction: 'none', networkDelayMs };
      }

      const hydration = resolveLiveAudioHydration(input);
      currentState = input.masterState;
      if (!connectedRecorded) {
        metrics?.increment('load_client_connected');
        connectedRecorded = true;
      }
      if (!hydration || input.localPosition === undefined) {
        return { accepted: true, reason: decision.reason, correction: 'none', networkDelayMs };
      }

      const driftSeconds = Math.abs(input.localPosition - hydration.expectedPosition);
      const correction = classifyLiveAudioDrift(input.localPosition, hydration.expectedPosition);
      metrics?.sample('student_drift_ms', driftSeconds * 1000);
      if (correction === 'soft-correction') metrics?.increment('soft_correction_total');
      if (correction === 'hard-seek') metrics?.increment('hard_seek_total');
      return { accepted: true, reason: decision.reason, correction, networkDelayMs };
    },
    attemptAuthorityWrite() {
      return { allowed: false, reason: 'student_clients_never_write_authority' };
    },
  };
}

export function calculateListeningLiveNetworkDelayMs(
  profile: ListeningLiveLoadNetworkProfile,
  sequence: number,
): number {
  switch (profile) {
    case 'normal-broadband':
      return 35;
    case 'latency-150-jitter-30':
      return 150 + deterministicJitter(sequence, 30);
    case 'latency-400-jitter-100':
      return 400 + deterministicJitter(sequence, 100);
    case 'packet-loss-1-percent':
      return sequence % 100 === 0 ? 1_000 : 80;
    case 'teacher-offline-10s':
      return 10_000;
    case 'student-offline-15s':
      return 15_000;
    case 'media-buffering-throttle':
      return 2_500;
    case 'refresh-delay-near-expiry':
      return 8_500;
  }
}

function deterministicJitter(sequence: number, jitterMs: number): number {
  const bucket = sequence % 3;
  if (bucket === 1) return -jitterMs;
  if (bucket === 2) return jitterMs;
  return 0;
}

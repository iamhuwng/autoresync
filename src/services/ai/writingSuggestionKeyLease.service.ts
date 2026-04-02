import { loadAllGeminiApiKeys } from '../../config/env.config';
import { isKeyBenched } from '../key-cooldown.service';

interface WritingSuggestionKeyLease {
  leaseId: string;
  preferredKeyIndex: number;
}

const activeGeminiLeases = new Set<number>();

function createLeaseId() {
  return `wsk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getUsableGeminiSuggestionKeyCount(): Promise<number> {
  const keys = await loadAllGeminiApiKeys();
  return keys.filter((key) => !isKeyBenched(key)).length;
}

export async function acquireGeminiSuggestionKeyLeases(count: number): Promise<WritingSuggestionKeyLease[]> {
  const keys = await loadAllGeminiApiKeys();
  const leases: WritingSuggestionKeyLease[] = [];

  for (let index = 0; index < keys.length && leases.length < count; index += 1) {
    if (isKeyBenched(keys[index])) {
      continue;
    }
    if (activeGeminiLeases.has(index)) {
      continue;
    }

    activeGeminiLeases.add(index);
    leases.push({
      leaseId: createLeaseId(),
      preferredKeyIndex: index,
    });
  }

  if (leases.length !== count) {
    leases.forEach((lease) => activeGeminiLeases.delete(lease.preferredKeyIndex));
    return [];
  }

  return leases;
}

export function releaseGeminiSuggestionKeyLeases(leases: WritingSuggestionKeyLease[]): void {
  leases.forEach((lease) => activeGeminiLeases.delete(lease.preferredKeyIndex));
}

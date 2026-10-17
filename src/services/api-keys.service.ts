import { getAuth } from 'firebase/auth';

export type AIProvider = 'gemini' | 'groq';

export interface APIKeyEntry {
  id: string;
  provider: AIProvider;
  label: string;
  keyPreview: string;
  createdAt: number;
  createdBy: string;
  isActive: boolean;
}

export interface APIKeysConfig {
  gemini: Record<string, APIKeyEntry>;
  groq: Record<string, APIKeyEntry>;
}

let cache: { uid: string; value: APIKeysConfig; timestamp: number } | null = null;
const listeners = new Set<(config: APIKeysConfig | null) => void>();

async function request(path: string, init: RequestInit = {}): Promise<any> {
  const baseUrl = import.meta.env.VITE_THCS_GEMMA_WORKER_URL?.trim().replace(/\/+$/, '');
  const user = getAuth().currentUser;
  if (!baseUrl || !user) throw new Error('AI gateway unavailable');
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${String(body?.error ?? 'AI key request failed')}`);
  return body;
}

function toConfig(entries: APIKeyEntry[]): APIKeysConfig {
  const config: APIKeysConfig = { gemini: {}, groq: {} };
  for (const entry of entries) {
    if (entry.provider === 'gemini' || entry.provider === 'groq') {
      config[entry.provider][entry.id] = {
        ...entry,
        keyPreview: entry.keyPreview ?? '',
        isActive: entry.isActive ?? true,
      };
    }
  }
  return config;
}

export async function getAPIKeys(force = false): Promise<APIKeysConfig> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('AI gateway unavailable');
  if (!force && cache?.uid === uid && Date.now() - cache.timestamp < 30_000) return cache.value;
  const result = await request('/ai/keys');
  const value = toConfig(result.keys ?? []);
  cache = { uid, value, timestamp: Date.now() };
  return value;
}

async function refresh() {
  cache = null;
  const config = await getAPIKeys(true);
  listeners.forEach((listener) => listener(config));
}

export async function getActiveKeyIds(provider: AIProvider): Promise<string[]> {
  const config = await getAPIKeys();
  return Object.values(config[provider])
    .filter((entry) => entry.isActive)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((entry) => entry.id);
}

export async function addAPIKey(provider: AIProvider, label: string, key: string): Promise<APIKeyEntry> {
  const result = await request('/ai/keys', {
    method: 'POST', body: JSON.stringify({ provider, label, key }),
  });
  await refresh();
  return result.key;
}

export async function updateAPIKey(id: string, isActive: boolean): Promise<void> {
  await request(`/ai/keys/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ isActive }),
  });
  await refresh();
}

export async function deleteAPIKey(id: string): Promise<void> {
  await request(`/ai/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refresh();
}

export function subscribeToAPIKeys(callback: (config: APIKeysConfig | null) => void): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

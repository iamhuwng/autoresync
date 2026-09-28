import { getAuth } from 'firebase/auth';

const endpoint = () => import.meta.env.VITE_THCS_GEMMA_WORKER_URL?.trim().replace(/\/+$/, '');

async function callProvider(provider: 'groq' | 'gemini', body: Record<string, unknown>): Promise<any> {
  const baseUrl = endpoint();
  const user = getAuth().currentUser;
  if (!baseUrl || !user) throw new Error('AI gateway unavailable');
  const response = await fetch(`${baseUrl}/ai/${provider}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const code = result?.error === 'rate_limited' ? 'user_rate_limited'
      : result?.error === 'Unauthorized' ? 'user_unauthorized'
      : result?.error === 'account_disabled' ? 'user_account_disabled'
      : String(result?.error ?? 'AI request failed');
    throw new Error(`${response.status} ${code}`);
  }
  return result;
}

export default class Groq {
  private keyId: string;

  constructor(options: { apiKey: string; maxRetries?: number }) {
    this.keyId = options.apiKey;
  }

  chat = {
    completions: {
      create: (request: Record<string, unknown>) => callProvider('groq', { keyId: this.keyId, request }),
    },
  };
}

export class GoogleGenerativeAI {
  constructor(private keyId: string) {}

  getGenerativeModel(options: {
    model: string;
    systemInstruction?: string;
    generationConfig?: Record<string, unknown>;
  }) {
    return {
      generateContent: async (prompt: string | Array<{ text: string }>) => {
        const result = await callProvider('gemini', {
          keyId: this.keyId,
          model: options.model,
          systemInstruction: options.systemInstruction,
          generationConfig: options.generationConfig,
          prompt,
        });
        return {
          response: {
            ...result,
            text: () => result.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part.text ?? '').join('') ?? '',
          },
        };
      },
    };
  }
}

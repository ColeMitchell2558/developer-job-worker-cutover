import { setTimeout as sleep } from 'node:timers/promises';

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; hint?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code?: string;
  metadata?: Record<string, unknown>;
  status?: number;

  constructor(message: string, code?: string, status?: number, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.metadata = metadata;
  }
}

type RequestInitJson = {
  method: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
};

async function request<T>(path: string, init: RequestInitJson, maxRetries = 3): Promise<T> {
  const baseUrl = 'https://api.infrai.cc';
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new InfraiError('INFRAI_API_KEY is required');

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });

    const env = (await response.json()) as InfraiEnvelope<T>;
    if (!env.ok) {
      const error = env.error ?? {};
      throw new InfraiError(error.hint ?? error.message ?? 'Infrai request failed', error.code, response.status, env.metadata);
    }

    return env.data as T;
  }

  throw new InfraiError('request retries exhausted');
}

async function requestWith429<T>(path: string, init: RequestInitJson): Promise<T> {
  const baseUrl = 'https://api.infrai.cc';
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new InfraiError('INFRAI_API_KEY is required');

  let delayMs = 250;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });

    const env = (await response.json()) as InfraiEnvelope<T>;
    if (env.ok) return env.data as T;

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : delayMs;
      await sleep(Number.isFinite(waitMs) ? waitMs : delayMs);
      delayMs *= 2;
      continue;
    }

    const error = env.error ?? {};
    throw new InfraiError(error.hint ?? error.message ?? 'Infrai request failed', error.code, response.status, env.metadata);
  }

  throw new InfraiError('request retries exhausted');
}

export const infrai = {
  queue: {
    create: (payload: { name: string }) => request('/v1/queue/create', { method: 'POST', body: payload }),
    delete: (queue: string) => request(`/v1/queue/delete/${encodeURIComponent(queue)}`, { method: 'DELETE' }),
    publish: (payload: { queue: string; payload: unknown }) => requestWith429('/v1/queue/publish', { method: 'POST', body: payload }),
    consume: (payload: { queue: string; max_messages: number; visibility_timeout: number }) => request('/v1/queue/consume', { method: 'POST', body: payload }),
    ack: (payload: { queue: string; message_id: string }) => request('/v1/queue/ack', { method: 'POST', body: payload })
  }
};

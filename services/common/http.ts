export class TimeoutError extends Error {
  constructor(public readonly waitedMs: number) {
    super(`timeout after ${waitedMs}ms`);
    this.name = 'TimeoutError';
  }
}

export interface JsonResponse<T = any> {
  status: number;
  data: T;
}

export async function callJson<T = any>(
  url: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<JsonResponse<T>> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new TimeoutError(Date.now() - started);
    throw err;
  }
}

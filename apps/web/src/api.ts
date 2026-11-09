import { config } from './config';
import { addError, currentScenario, loadUser } from './rum';

export class ApiError extends Error {
  constructor(
    public readonly api: string,
    public readonly status: number,
    public readonly body: any,
  ) {
    super(`${api} failed with HTTP ${status}`);
    this.name = 'ApiError';
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'X-App-Version': config.appVersion,
    'X-Campaign-Id': config.campaign,
    'X-Platform': config.platform,
    'X-Scenario': currentScenario(),
  };
  const user = loadUser();
  if (user) h['X-User-Id'] = user.id;
  return h;
}

/** JSON call with the demo headers. Non-2xx responses are reported to RUM with { step, api }. */
export async function api<T = any>(method: 'GET' | 'POST', path: string, step: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    addError(err, { step, api: path });
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(path, res.status, data);
    addError(err, { step, api: path, status: res.status });
    throw err;
  }
  return data as T;
}

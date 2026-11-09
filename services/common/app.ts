import tracer from 'dd-trace';
import express, { NextFunction, Request, Response } from 'express';
import { logger } from './logger';

export interface RequestContext {
  appVersion: string;
  campaign: string;
  platform: string;
  scenario: string;
  userId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestContext;
    }
  }
}

export const CONTEXT_HEADERS = ['x-app-version', 'x-campaign-id', 'x-platform', 'x-scenario', 'x-user-id'] as const;

function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function activeSpan() {
  return tracer.scope().active();
}

export function tagSpan(tags: Record<string, unknown>) {
  const span = activeSpan();
  if (!span) return;
  for (const [k, v] of Object.entries(tags)) {
    if (v !== undefined && v !== null) span.setTag(k, v as string | number);
  }
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: process.env.DD_SERVICE });
  });
  app.use((req, _res, next) => {
    req.ctx = {
      appVersion: header(req, 'x-app-version') ?? 'unknown',
      campaign: header(req, 'x-campaign-id') ?? 'none',
      platform: header(req, 'x-platform') ?? 'web',
      scenario: header(req, 'x-scenario') ?? 'baseline',
      userId: header(req, 'x-user-id'),
    };
    tagSpan({
      'app.version': req.ctx.appVersion,
      'campaign.id': req.ctx.campaign,
      'client.platform': req.ctx.platform,
      'demo.scenario': req.ctx.scenario,
      'usr.id': req.ctx.userId,
    });
    next();
  });
  return app;
}

export function forwardHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = { 'content-type': 'application/json' };
  for (const h of CONTEXT_HEADERS) {
    const v = header(req, h);
    if (v) out[h] = v;
  }
  return out;
}

export function start(app: express.Express) {
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, path: req.path, 'usr.id': req.ctx?.userId }, `Unhandled error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
  });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => logger.info({ port }, `${process.env.DD_SERVICE} listening on ${port}`));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

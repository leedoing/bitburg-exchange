import StatsD from 'hot-shots';
import type { RequestContext } from './app';
import { activeCampaign, currentScenario } from './faults';
import { logger } from './logger';

// includeDataDogTags adds env / service / version from DD_ENV, DD_SERVICE, DD_VERSION.
export const statsd = new StatsD({
  host: process.env.DD_AGENT_HOST ?? 'localhost',
  port: 8125,
  includeDataDogTags: true,
  cacheDns: true,
  errorHandler: (err) => logger.warn({ err }, 'DogStatsD error'),
});

export type Tags = Record<string, string>;

/** Business metric tags: env (global), app_version, platform, campaign, scenario. */
export function bizTags(ctx: RequestContext, extra: Tags = {}): Tags {
  const campaign = ctx.campaign !== 'none' ? ctx.campaign : activeCampaign();
  return {
    app_version: ctx.appVersion,
    platform: ctx.platform,
    campaign,
    scenario: currentScenario(),
    ...extra,
  };
}

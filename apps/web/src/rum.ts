import { datadogLogs } from '@datadog/browser-logs';
import { datadogRum } from '@datadog/browser-rum';
import { config } from './config';

const applicationId = import.meta.env.VITE_DD_RUM_APP_ID;
const clientToken = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN;
const site = import.meta.env.VITE_DD_SITE ?? 'datadoghq.com';

export const rumEnabled = Boolean(applicationId && clientToken);

let scenario = config.scenario ?? 'baseline';

export function currentScenario() {
  return scenario;
}

export function initRum() {
  if (!rumEnabled) return;
  datadogRum.init({
    applicationId,
    clientToken,
    site,
    service: 'bitsburg-web',
    env: 'demo-coinone',
    version: config.appVersion,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    trackViewsManually: true,
    defaultPrivacyLevel: 'mask-user-input',
    allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['datadog', 'tracecontext'] }],
    enableExperimentalFeatures: ['feature_operation_vital'],
  });
  datadogLogs.init({
    clientToken,
    site,
    service: 'bitsburg-web',
    env: 'demo-coinone',
    version: config.appVersion,
    forwardErrorsToLogs: true,
  });

  datadogRum.setGlobalContextProperty('client', { platform: config.platform });
  datadogRum.setGlobalContextProperty('campaign', { id: config.campaign, source: config.source });
  datadogRum.setGlobalContextProperty('demo', { scenario });
  datadogRum.addFeatureFlagEvaluation('kyc_flow_v2', config.kycFlowV2);

  const user = loadUser();
  if (user) datadogRum.setUser({ id: user.id, name: user.name, tier: user.tier });
}

/** Without an explicit ?scenario=, demo.scenario follows the active fault on the server. */
export async function syncScenario() {
  if (config.scenario) return;
  try {
    const res = await fetch('/api/demo/state');
    const state = (await res.json()) as { scenario: string };
    if (state.scenario && state.scenario !== scenario) {
      scenario = state.scenario;
      if (rumEnabled) datadogRum.setGlobalContextProperty('demo', { scenario });
    }
  } catch {
    // keep the last known scenario
  }
}

export interface DemoUser {
  id: string;
  name: string;
  tier: string;
}

export function loadUser(): DemoUser | null {
  return JSON.parse(sessionStorage.getItem('bitsburg.user') ?? 'null');
}

export function setUser(user: DemoUser) {
  sessionStorage.setItem('bitsburg.user', JSON.stringify(user));
  if (rumEnabled) datadogRum.setUser({ id: user.id, name: user.name, tier: user.tier });
}

export type ActionName =
  | 'signup_started'
  | 'signup_completed'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_failed'
  | 'deposit_requested'
  | 'deposit_completed'
  | 'deposit_stuck'
  | 'order_placed'
  | 'order_filled'
  | 'order_failed'
  | 'cs_contact_opened';

export function action(name: ActionName, context: Record<string, unknown>) {
  if (rumEnabled) datadogRum.addAction(name, context);
}

export type OperationName = 'signup' | 'kyc_verification' | 'krw_deposit' | 'place_order';
export type FailureReason = 'error' | 'abandoned' | 'other';

export const operation = {
  start(name: OperationName, operationKey: string, context?: Record<string, unknown>) {
    if (rumEnabled) datadogRum.startFeatureOperation(name, { operationKey, context });
  },
  succeed(name: OperationName, operationKey: string, context?: Record<string, unknown>) {
    if (rumEnabled) datadogRum.succeedFeatureOperation(name, { operationKey, context });
  },
  fail(name: OperationName, operationKey: string, reason: FailureReason, context?: Record<string, unknown>) {
    if (rumEnabled) datadogRum.failFeatureOperation(name, reason, { operationKey, context });
  },
};

export function startView(name: string) {
  if (rumEnabled) datadogRum.startView({ name });
}

export function addError(err: unknown, context: Record<string, unknown>) {
  if (rumEnabled) datadogRum.addError(err instanceof Error ? err : new Error(String(err)), context);
}

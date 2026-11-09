// Datadog deep links. Safe for browser code: org URL and RUM application ID are not secrets.
import type { Window } from './types';

// Must use the org's custom subdomain; app.datadoghq.com opens whichever org the viewer last used.
export const DD_APP_URL = 'https://hyunjin.datadoghq.com';
export const RUM_APP_ID = 'b6478d57-baa4-4ff1-b07c-f9fd12d514d8';
export const ENV = 'demo-coinone';

const BASE = `@application.id:${RUM_APP_ID} env:${ENV} @session.type:user`;

/** RUM Explorer, filtered to this app's real-user events plus `query`, over `w`. */
export function rumUrl(query: string, w: Window): string {
    const q = `${BASE} ${query}`.trim();
    return `${DD_APP_URL}/rum/sessions?query=${encodeURIComponent(q)}&from_ts=${Math.floor(w.from)}&to_ts=${Math.ceil(w.to)}&live=false`;
}

export const action = (...names: string[]) => `@type:action @action.name:${names.length > 1 ? `(${names.join(' OR ')})` : names[0]}`;

/** Quote values that contain characters the RUM search grammar treats specially. */
export const val = (v: string) => (/^[\w.-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`);

/** RUM queries for the series names the backend emits. */
export const RUM = {
    sessions: '@type:session',
    signup: action('signup_completed'),
    kycApproved: action('kyc_approved'),
    kycResult: action('kyc_approved', 'kyc_failed'),
    kycFailed: action('kyc_failed'),
    deposit: action('deposit_completed'),
    depositWaiting: action('deposit_requested', 'deposit_stuck'),
    orderFilled: action('order_filled'),
    orderFailed: action('order_failed'),
    order: action('order_placed', 'order_filled', 'order_failed'),
    cs: action('cs_contact_opened'),
} as const;

/** Funnel traffic-light stage key → RUM query. */
export const STAGE_RUM: Record<string, string> = {
    signup: RUM.signup,
    kyc: RUM.kycResult,
    deposit: action('deposit_requested', 'deposit_completed', 'deposit_stuck'),
    order: RUM.order,
};

export function openUrl(url: string | null | undefined) {
    if (url) globalThis.open(url, '_blank', 'noopener,noreferrer');
}

// Connection IDs are configuration, not secrets: the admin token lives in the Datadog connection.
export const ADMIN_CONNECTION_ID = '4b2edd33-a2c2-4296-8f50-ee0798bd4b55';
// EC2 EIP (`terraform output web_url`). Changes when the demo is torn down and recreated; keep in sync with the
// base URL of the Datadog connection bitsburg-admin-api.
export const ADMIN_BASE_URL = 'http://43.203.69.109';

import { Pool, PoolConfig } from 'pg';

export function createPool(options: PoolConfig = {}) {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    ...options,
  });
}

const { createHash } = require('node:crypto');

// Atomic counters shared by all Vercel instances. No raw IP address is stored.
class PostgresRateLimitStore {
  constructor(pool, prefix) {
    this.pool = pool;
    this.prefix = prefix;
    this.localKeys = false;
    this.nextCleanupAt = 0;
  }

  init({ windowMs }) {
    this.windowMs = windowMs;
  }

  storageKey(key) {
    return createHash('sha256').update(`${this.prefix}:${key}`).digest('hex');
  }

  async increment(key) {
    const { rows } = await this.pool.query(`
      INSERT INTO public.api_rate_limits AS counter (key, hits, reset_at)
      VALUES ($1, 1, statement_timestamp() + $2 * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN counter.reset_at <= statement_timestamp()
          THEN 1 ELSE counter.hits + 1 END,
        reset_at = CASE WHEN counter.reset_at <= statement_timestamp()
          THEN EXCLUDED.reset_at ELSE counter.reset_at END
      RETURNING hits, reset_at
    `, [this.storageKey(key), this.windowMs]);

    // Bounded cleanup during requests also works when serverless timers freeze.
    if (Date.now() >= this.nextCleanupAt) {
      this.nextCleanupAt = Date.now() + 60_000;
      try {
        await this.pool.query(`
          DELETE FROM public.api_rate_limits WHERE key IN (
            SELECT key FROM public.api_rate_limits
            WHERE reset_at < statement_timestamp() - interval '1 day'
            ORDER BY reset_at LIMIT 100
          )
        `);
      } catch {
        // The counter already succeeded; cleanup can retry on a later request.
        console.warn('Rate limit cleanup deferred');
      }
    }

    return { totalHits: Number(rows[0].hits), resetTime: new Date(rows[0].reset_at) };
  }

  async decrement(key) {
    await this.pool.query(`
      UPDATE public.api_rate_limits SET hits = GREATEST(hits - 1, 0)
      WHERE key = $1 AND reset_at > statement_timestamp()
    `, [this.storageKey(key)]);
  }

  async resetKey(key) {
    await this.pool.query('DELETE FROM public.api_rate_limits WHERE key = $1', [this.storageKey(key)]);
  }
}

function usePostgresRateLimits(env = process.env) {
  if (env.RATE_LIMIT_STORE && !['postgres', 'memory'].includes(env.RATE_LIMIT_STORE)) {
    throw new Error('RATE_LIMIT_STORE must be postgres or memory');
  }
  return env.RATE_LIMIT_STORE
    ? env.RATE_LIMIT_STORE === 'postgres'
    : env.VERCEL === '1' || env.SERVERLESS === 'true';
}

module.exports = { PostgresRateLimitStore, usePostgresRateLimits };

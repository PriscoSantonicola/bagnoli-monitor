import { Pool } from "pg";

/**
 * Pool singleton PostgreSQL (schema bagnoli_cantieri su Hetzner dev).
 *
 * Config via env:
 *   DATABASE_URL = postgresql://user:pass@host:port/db?schema=bagnoli_cantieri
 *
 * search_path viene impostato esplicitamente in ogni connessione.
 *
 * Il pool è LAZY: viene costruito al primo utilizzo, non al load del modulo.
 * Questo evita che `next build` fallisca quando DATABASE_URL non e' disponibile
 * durante la fase di build (le pagine dinamiche non vengono chiamate ma il
 * modulo viene comunque risolto / importato).
 */

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL non configurato");
  const pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: false,
  });
  pool.on("connect", (c) => {
    c.query("SET search_path = bagnoli_cantieri, public;").catch(() => {});
  });
  pool.on("error", (err) => {
    console.error("[pg pool error]", err);
  });
  return pool;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;
  const p = buildPool();
  global.__pgPool = p;
  return p;
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const r = await getPool().query(sql, params);
  return r.rows as T[];
}

export async function q1<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const r = await getPool().query(sql, params);
  return (r.rows[0] as T) ?? null;
}

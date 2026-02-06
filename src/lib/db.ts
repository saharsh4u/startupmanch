import { createRequire } from "module";

type PoolLike = {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

const connectionString = process.env.DATABASE_URL;
let poolPromise: Promise<PoolLike> | null = null;

const loadPg = () => {
  const requireFn = createRequire(import.meta.url);
  const moduleName = ["p", "g"].join("");
  try {
    return requireFn(moduleName) as { Pool: new (config: object) => PoolLike };
  } catch (error) {
    return null;
  }
};

const getPool = async () => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!poolPromise) {
    poolPromise = Promise.resolve().then(() => {
      const pg = loadPg();
      if (!pg) {
        throw new Error("pg is not installed. Run `npm install pg` to enable database access.");
      }
      const { Pool } = pg;
      return new Pool({
        connectionString,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
      }) as PoolLike;
    });
  }
  return poolPromise;
};

export const db = {
  async query<T>(text: string, params?: unknown[]) {
    const pool = await getPool();
    return pool.query<T>(text, params);
  }
};

export type RankingRow = {
  rank: number;
  company: string;
  sector: string | null;
  revenue: string | null;
  cts_score: number;
  delta: number | null;
  updated_at: string;
};

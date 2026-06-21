import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";

// Lazy singleton so importing this module doesn't require DATABASE_URL until a
// query actually runs (the compose slice works without a DB today).
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it to app/.env.local to enable the database.");
  }
  // prepare:false keeps it compatible with Supabase's transaction-mode pooler.
  const client = postgres(url, { prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}

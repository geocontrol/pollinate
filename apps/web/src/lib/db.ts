import "server-only";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { createDb, type Db } from "@pollinate/db";

const DEV_DATABASE_URL = "postgres://pollinate_app:pollinate_app@localhost:5432/pollinate";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  // `next build` imports modules without serving requests; the pool only
  // connects on first query, so a placeholder is safe there.
  const building = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
  if (process.env.NODE_ENV === "production" && !building) throw new Error("DATABASE_URL is not set");
  return DEV_DATABASE_URL;
}

// One pool per process; survive dev hot reloads.
const globalForDb = globalThis as unknown as { pollinateDb?: Db };
export const db: Db = (globalForDb.pollinateDb ??= createDb(connectionString()).db);

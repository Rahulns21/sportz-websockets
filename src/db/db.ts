import "dotenv/config";
import { InferSelectModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { commentary, matches } from "./schema.ts";
import { env } from "../config/env.ts";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool);
export type Match = InferSelectModel<typeof matches>;
export type Commentary = InferSelectModel<typeof commentary>;

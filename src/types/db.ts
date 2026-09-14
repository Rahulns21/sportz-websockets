import { InferSelectModel } from "drizzle-orm";
import { commentary, matches } from "../db/schema.ts";

export type Match = InferSelectModel<typeof matches>;
export type Commentary = InferSelectModel<typeof commentary>;
import { Router } from "express";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../validation/matches.ts";
import { db } from "../db/db.ts";
import { matches } from "../db/schema.ts";
import { getMatchStatus } from "../utils/match-status.ts";
import { desc } from "drizzle-orm";

export const matchRouter = Router();

matchRouter.get("/", async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.issues });
  }

  const limit = parsed.data?.limit ?? 50;

  try {
    const data = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(limit);

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list matches." });
  }
});

matchRouter.post("/", async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid payload.",
      details: JSON.stringify(parsed.error),
    });

  const {
    data: { startTime, endTime, homeScore, awayScore },
  } = parsed;

  try {
    const computedStatus = getMatchStatus({ startTime, endTime });
    if (!computedStatus) {
      return res.status(400).json({ error: "Invalid match times" });
    }

    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        homeScore: homeScore,
        awayScore: awayScore,
        status: computedStatus,
      })
      .returning();

    return res.status(201).json({ data: event });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Failed to create match.", details: JSON.stringify(e) });
  }
});

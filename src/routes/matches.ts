import { Router } from "express";
import {
  createMatchSchema,
  listMatchesQuerySchema,
  matchIdParamSchema,
  updateScoreSchema,
} from "../validation/matches.ts";
import { db } from "../db/db.ts";
import { matches } from "../db/schema.ts";
import { getMatchStatus, syncMatchStatus } from "../utils/match-status.ts";
import { desc, eq } from "drizzle-orm";

export const matchRouter = Router();

matchRouter.get("/", async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.issues });
  }

  const limit = parsed.data.limit ?? 50;

  try {
    const rows = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(limit);

    const syncedData = await Promise.all(
      rows.map(async (match) => {
        const status = await syncMatchStatus(match, async (nextStatus) => {
          await db
            .update(matches)
            .set({ status: nextStatus })
            .where(eq(matches.id, match.id));
        });

        return { ...match, status };
      })
    );

    return res.json({ data: syncedData });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list matches." });
  }
});

matchRouter.post("/", async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid payload.",
      details: parsed.error.issues,
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

    if (!event) {
      return res.status(500).json({ error: "Failed to create match." });
    }

    if (res.app.locals.broadcastMatchCreated) {
      res.app.locals.broadcastMatchCreated({ match: event! });
    }

    return res.status(201).json({ data: event });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create match." });
  }
});

matchRouter.patch("/:id/score", async (req, res) => {
  const paramsResult = matchIdParamSchema.safeParse(req.params);

  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID.", details: paramsResult.error.issues });
  }

  const bodyResult = updateScoreSchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: "Invalid score payload.",
      details: bodyResult.error.issues,
    });
  }

  try {
    const [updated] = await db
      .update(matches)
      .set({
        homeScore: bodyResult.data.homeScore,
        awayScore: bodyResult.data.awayScore,
      })
      .where(eq(matches.id, paramsResult.data.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Match not found." });
    }

    res.app.locals.broadcastScoreUpdate({
      matchId: updated.id,
      homeScore: updated.homeScore,
      awayScore: updated.awayScore,
    });

    return res.json({ data: updated });
  } catch (error) {
    console.error("Failed to update score:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "no stack");
    return res.status(500).json({ error: "Failed to update score." });
  }
});

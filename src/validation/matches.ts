import { z } from "zod";

export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
} as const;

export type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createMatchSchema = z
  .object({
    sport: z.string().min(1),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    startTime: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
    endTime: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
    homeScore: z.number().int().nonnegative().default(0),
    awayScore: z.number().int().nonnegative().default(0),
  })
  .superRefine((date, ctx) => {
    const start = new Date(date.startTime);
    const end = new Date(date.endTime);
    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        message: "endTime must be chronologically after startTime",
        path: ["endTime"],
      });
    }
  });

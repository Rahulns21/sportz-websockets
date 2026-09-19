import { z } from "zod";

export const footballStatsSchema = z.object({
  possession: z.number().min(0).max(100).optional(),
  shots: z
    .object({
      home: z.number().int().nonnegative(),
      away: z.number().int().nonnegative(),
    })
    .optional(),
});

export const cricketInningsSchema = z.object({
  runs: z.number().int().min(0),
  wickets: z.number().int().min(0).max(10),
  overs: z.number().min(0),
  declared: z.boolean().optional(),
});

export const cricketStatsSchema = z.object({
  format: z.enum(["t20", "odi", "test"]),
  homeInnings: z.array(cricketInningsSchema).max(2),
  awayInnings: z.array(cricketInningsSchema).max(2),
  currentBatting: z.enum(["home", "away"]).optional(),
  currentDay: z.number().int().min(1).max(5).optional(),
  daysPlayed: z.number().int().min(0).max(5).optional(),
});

export const basketballStatsSchema = z.object({
    possession: z.number().min(0).max(100).optional(),
});

export const sportStatsSchemas = {
    football: footballStatsSchema,
    cricket: cricketStatsSchema,
    basketball: basketballStatsSchema,
} as const;

export type Sport = keyof typeof sportStatsSchemas;
export type CricketStats = z.infer<typeof cricketStatsSchema>;
export type Innings = z.infer<typeof cricketInningsSchema>;
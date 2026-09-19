import type { Match } from "./db.ts";

declare global {
  namespace Express {
    interface Locals {
      broadcastMatchCreated: (params: { match: Match }) => void;
      broadcastCommentary: (params: {
        matchId: number;
        comment: unknown;
      }) => void;
      broadcastScoreUpdate: (params: {
        matchId: number;
        homeScore: number;
        awayScore: number;
        stats: unknown;
      }) => void;
    }
  }
}

export {};

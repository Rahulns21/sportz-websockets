import { InferSelectModel } from "drizzle-orm";
import { MATCH_STATUS, type MatchStatus } from "../validation/matches.ts";
import { matches } from "../db/schema.ts";

interface GetMatchParams {
  startTime: Date | null;
  endTime: Date | null;
  now?: Date;
}

type MatchInput = InferSelectModel<typeof matches>;

export function getMatchStatus({
  startTime,
  endTime,
  now = new Date(),
}: GetMatchParams): MatchStatus | null {
  if (!startTime || !endTime) return null;

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return null;
  }

  if (now < startTime) return MATCH_STATUS.SCHEDULED;

  if (now >= endTime) return MATCH_STATUS.FINISHED;

  return MATCH_STATUS.LIVE;
}

export async function syncMatchStatus(
  match: MatchInput,
  updateStatus: (status: MatchStatus) => Promise<void>
): Promise<MatchStatus> {
  const nextStatus = getMatchStatus({
    startTime: match.startTime,
    endTime: match.endTime,
  });

  if (!nextStatus) {
    return match.status;
  }

  if (match.status === nextStatus) {
    return match.status;
  }

  await updateStatus(nextStatus);
  return nextStatus;
}

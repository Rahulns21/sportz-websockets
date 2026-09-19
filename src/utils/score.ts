import type { CricketStats } from "../validation/sports.ts";

interface DisplayScoreParams {
    sport: string,
    stats: unknown,
    fallback: { homeScore: number; awayScore: number},
}

interface Scores {
    homeScore: number;
    awayScore: number;
}

export function computeDisplayScore({ sport, stats, fallback }: DisplayScoreParams): Scores {
    if (sport === "cricket" && stats && typeof stats === "object") {
        const cricket = stats as CricketStats;
        const lastHome = cricket.homeInnings[cricket.homeInnings.length - 1];
        const lastAway = cricket.awayInnings[cricket.awayInnings.length - 1];
        return {
            homeScore: lastHome?.runs ?? 0,
            awayScore: lastAway?.runs ?? 0,
        };
    }
    return fallback;
}
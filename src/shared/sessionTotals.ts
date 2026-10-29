import type { SessionSummary } from '../main/sessionSummary';

/** What a list of session summaries adds up to: the totals over the ones "Wszystkie sesje" shows. */
export function summaryTotals(list: SessionSummary[]): { sessions: number; ms: number; kills: number; deaths: number; blocks: number; crashes: number } {
  const out = { sessions: list.length, ms: 0, kills: 0, deaths: 0, blocks: 0, crashes: 0 };
  for (const s of list) {
    out.ms += Math.max(0, s.end - s.start);
    if (s.crashed) out.crashes++;
    if (!s.stats) continue;
    out.kills += s.stats.kills.players + s.stats.kills.mobs;
    out.deaths += s.stats.deaths;
    out.blocks += s.stats.blocks.mined + s.stats.blocks.placed;
  }
  return out;
}

/** Sessions matching the filters ('' = any): a profile, and a server or world played in. */
export function filterSummaries(list: SessionSummary[], profileId: string, place: string): SessionSummary[] {
  return list.filter((s) => (!profileId || s.profileId === profileId) && (!place || s.places.some((p) => p.name === place)));
}

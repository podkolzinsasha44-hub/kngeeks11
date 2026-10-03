// What the assistant coaches of AI clubs do: pick the team, respect the foreign-player limit,
// renew contracts, set the club strategy.
import { wageFor } from './contracts';
import { LEAGUE_IDS, foreignLimit, isForeign, leagueTeams } from './leagues';
import { FORMATIONS, autoLineup, available, slotRating, squad, teamPower } from './lineup';
import { next } from './rng';
import { sortedTeams } from './standings';
import type { League, Player, Team } from './types';
import { ageOn } from './util';

export function groupByTeam(L: League): Map<string, Player[]> {
  const m = new Map<string, Player[]>();
  for (const id in L.teams) m.set(id, squad(L, id));
  return m;
}

/** Number of foreign players in the starting eleven. */
export function foreignOnPitch(L: League, t: Team) {
  return t.lineup.xi.filter((id) => L.players[id] && isForeign(L.players[id], t.country)).length;
}

/** Swaps foreigners out of the XI until the on-pitch limit holds, losing as little quality as possible. */
export function fixForeign(L: League, t: Team, roster: Player[]) {
  const lim = foreignLimit(t.lg, L.season);
  if (!lim) return;
  const roles = FORMATIONS[t.lineup.form];
  for (let guard = 0; guard < 11 && foreignOnPitch(L, t) > lim[1]; guard++) {
    const inXI = new Set(t.lineup.xi);
    const locals = roster.filter((p) => available(p) && !inXI.has(p.id) && !isForeign(p, t.country));
    let best: { i: number; sub: Player; loss: number } | null = null;
    t.lineup.xi.forEach((id, i) => {
      const p = L.players[id];
      if (!p || !isForeign(p, t.country)) return;
      for (const s of locals) {
        const loss = slotRating(p, roles[i]) - slotRating(s, roles[i]);
        if (!best || loss < best.loss) best = { i, sub: s, loss };
      }
    });
    if (!best) return;
    const b = best as { i: number; sub: Player; loss: number };
    const out = t.lineup.xi[b.i];
    t.lineup.xi[b.i] = b.sub.id;
    t.lineup.bench = [out, ...t.lineup.bench.filter((id) => id !== b.sub.id)].slice(0, 12);
  }
}

/** Line-up of an AI club (and of the user's club when the assistant is in charge). */
export function aiLineup(L: League, t: Team, roster?: Player[], keepForm = false) {
  const sq = roster ?? squad(L, t.id);
  autoLineup(L, t, sq, { keepForm });
  fixForeign(L, t, sq);
}

export function updateStrategies(L: League) {
  for (const lg of LEAGUE_IDS) {
    const teams = leagueTeams(L, lg);
    if (!teams.length) continue;
    const power = teams.map((t) => ({ t, p: teamPower(L, t) })).sort((a, b) => b.p - a.p);
    const table = sortedTeams(L, lg);
    const gp = teams[0].rec.gp;
    power.forEach(({ t }, i) => {
      let rank = i + 1;
      if (gp >= 10) rank = Math.round(rank * 0.4 + (table.findIndex((x) => x.id === t.id) + 1) * 0.6);
      t.strategy = rank <= Math.round(teams.length * 0.3) ? 'contend' : rank <= Math.round(teams.length * 0.7) ? 'bubble' : 'rebuild';
    });
  }
}

/** In spring AI clubs extend the players they want to keep; the rest leave as free agents in summer. */
export function aiRenewals(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || p.team === L.user || p.loan || !p.c || p.c.until !== L.season + 1) continue;
    const t = L.teams[p.team];
    const age = ageOn(p.bd, L.date);
    const rank = squad(L, t.id).filter((x) => x.ovr > p.ovr).length;
    // Called once a month in spring: most of the squad is renewed by the summer.
    const keep = rank < 16 ? 0.45 : age <= 23 ? 0.35 : 0.15;
    if (next() < keep * (age >= 34 ? 0.5 : 1)) {
      p.c = { wage: Math.max(p.c.wage, wageFor(p.ovr, t.lg)), until: L.season + 1 + (age >= 32 ? 1 : age <= 24 ? 4 : 3), signed: L.season };
    }
  }
}

/** Players at clubs outside the simulated leagues simply get new deals. */
export function extRenewals(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team || !p.ext || !p.c || p.c.until > L.season + 1) continue;
    p.c = { wage: p.c.wage, until: L.season + 3, signed: L.season + 1 };
  }
}

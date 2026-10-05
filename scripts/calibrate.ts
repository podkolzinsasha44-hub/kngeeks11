// Realism check: plays N full seasons of every league and compares the totals with the real
// 2025-26 season (computed from the open match dataset, see docs/PLAN.md §6).
//   npm run calibrate            — 6 seasons
//   npm run calibrate -- 12      — 12 seasons
//   npm run calibrate -- 4 KS=0.2 KQ=0.1   — try other engine constants
import fs from 'node:fs';
import { LEAGUES, LEAGUE_IDS, statKey } from '../src/engine/leagues';
import { K } from '../src/engine/match';
import { gameOdds, quickOdds, ratingOf } from '../src/engine/projection';
import { advanceDay } from '../src/engine/season';
import { sortedTeams } from '../src/engine/standings';
import { leaders } from '../src/engine/stats';
import type { LeagueId } from '../src/engine/types';
import { newCareer, type WorldJson } from '../src/engine/world';

const N = Number(process.argv[2] ?? 6);
for (const a of process.argv.slice(3)) {
  const [k, v] = a.split('=');
  if (k in K) (K as unknown as Record<string, number>)[k] = Number(v);
}
const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));

/** Real 2025-26: goals per match, home wins, draws, champion's points, top scorer's goals. */
const REAL: Partial<Record<LeagueId, { gpm: number; home: number; draw: number; champ: number; last: number; scorer: number }>> = {
  // Mean of the 2024-25 and 2025-26 seasons where both are in the dataset.
  RPL: { gpm: 2.62, home: 0.44, draw: 0.275, champ: 67.5, last: 20, scorer: 19 },
  FNL: { gpm: 2.3, home: 0.42, draw: 0.3, champ: 64, last: 25, scorer: 18 },
  // Second League B, group 3: mean of 2025 (full) and 2026 (26 of 30 rounds), from the league's own site.
  // Top scorer: a reference value — the 2026 leader (14 goals in 19 games) at his pace over 30 rounds
  // and about 25 games, ≈ 20; the season leader of a full year is not in the data yet.
  // Second League A: 2025-26, both stages of both groups (326 matches, the league's own site). Points of the best and
  // the worst club per game over 32 rounds (the game plays one table of 17). Top scorer: a reference value —
  // the 2026-27 leader's pace (10 goals in 12 rounds) is too early to trust, so ≈ 22.
  L2A: { gpm: 2.42, home: 0.405, draw: 0.31, champ: 64, last: 27, scorer: 22 },
  L2B: { gpm: 2.83, home: 0.433, draw: 0.196, champ: 69, last: 10, scorer: 20 },
  EPL: { gpm: 2.84, home: 0.417, draw: 0.26, champ: 84.5, last: 20, scorer: 27 },
  ESP: { gpm: 2.66, home: 0.467, draw: 0.25, champ: 91, last: 25, scorer: 31 },
  ITA: { gpm: 2.5, home: 0.393, draw: 0.272, champ: 84.5, last: 22, scorer: 25 },
  GER: { gpm: 3.19, home: 0.412, draw: 0.248, champ: 85.5, last: 25, scorer: 32 },
  FRA: { gpm: 2.9, home: 0.464, draw: 0.224, champ: 80, last: 20, scorer: 23 },
};
/**
 * Cards per team per league match, 2024-25: yellow from the season totals (RPL 1051 in 240 matches, EPL 1549 in 380;
 * La Liga 4.64, Bundesliga 4.24, Ligue 1 4.23, Serie A 4.07 per match), red — sending-offs of both kinds (RPL 0.25 per
 * match, EPL 52 in 380; La Liga 0.22, Serie A 0.23, Bundesliga 0.10, Ligue 1 0.27 per match — Match TV). The lower
 * Russian divisions have no published totals and are only reported.
 */
const CARDS_REAL: Partial<Record<LeagueId, { yc: number; rc: number }>> = {
  RPL: { yc: 2.19, rc: 0.125 }, EPL: { yc: 2.04, rc: 0.068 }, ESP: { yc: 2.32, rc: 0.11 },
  ITA: { yc: 2.04, rc: 0.115 }, GER: { yc: 2.12, rc: 0.05 }, FRA: { yc: 2.12, rc: 0.135 },
};
const CARDS_CORRIDOR = { yc: 0.15, rc: 0.04 };
// The youth league (squads typed in by the user) has no real reference and is not calibrated.
const CAL = LEAGUE_IDS.filter((lg) => REAL[lg]);
const CORRIDOR = { gpm: 0.18, home: 0.06, draw: 0.055, champ: 9, last: 10, scorer: 8 };
/** Champions League, mean of 2024-25 and 2025-26 (189 + 188 matches of the same dataset). */
const UCL_REAL = { gpm: 3.4, home: 0.504, draw: 0.157 };
const UCL_CORRIDOR = { gpm: 0.2, home: 0.07, draw: 0.06 };
const ucl = { gpm: 0, home: 0, draw: 0, n: 0 };

const acc: Record<string, { gpm: number; home: number; draw: number; champ: number; last: number; scorer: number; cards: number; reds: number }> = {};
for (const lg of CAL) acc[lg] = { gpm: 0, home: 0, draw: 0, champ: 0, last: 0, scorer: 0, cards: 0, reds: 0 };
let oddsErr = 0, oddsN = 0;
const t0 = Date.now();
for (let s = 0; s < N; s++) {
  const L = newCareer(world, { team: 'ZEN', gmName: 'Cal', seed: 1000 + s * 77 });
  L.teams.ZEN.lineup.auto = true;
  // The odds shown to the user against what the engine then actually does (first-round sample).
  if (s === 0) {
    for (const g of L.games.filter((x) => x.comp === 'RPL' && Number(x.rd) <= 4)) {
      const mc = gameOdds(L, g.h, g.a, g.comp, 1500);
      const q = quickOdds(ratingOf(L, L.teams[g.h]), ratingOf(L, L.teams[g.a]), LEAGUES.RPL.style);
      oddsErr += Math.abs(mc.h - q.h) + Math.abs(mc.d - q.d) + Math.abs(mc.a - q.a);
      oddsN += 3;
    }
  }
  while (L.date < `${L.season + 1}-06-01`) { advanceDay(L); L.stops.length = 0; }
  for (const g of L.games) {
    if (g.comp !== 'UCL' || !g.played) continue;
    ucl.n++; ucl.gpm += g.hs! + g.as!;
    if (!g.neutral) { ucl.home += Number(g.hs! > g.as!); ucl.draw += Number(g.hs === g.as); }
  }
  for (const lg of CAL) {
    const t = sortedTeams(L, lg);
    const gp = t.reduce((x, y) => x + y.rec.gp, 0) / 2;
    const a = acc[lg];
    a.gpm += t.reduce((x, y) => x + y.rec.gf, 0) / gp / N;
    a.home += t.reduce((x, y) => x + y.rec.hw, 0) / gp / N;
    a.draw += t.reduce((x, y) => x + y.rec.d, 0) / 2 / gp / N;
    a.champ += t[0].rec.pts / N;
    a.last += t[t.length - 1].rec.pts / N;
    a.scorer += (leaders(L, statKey(L.season, lg), 'g', 1)[0]?.v ?? 0) / N;
    let yc = 0, rc = 0;
    for (const p of Object.values(L.players)) { const st = p.stats[statKey(L.season, lg)]; if (st) { yc += st.yc; rc += st.rc; } }
    a.cards += yc / gp / N; a.reds += rc / gp / N;
  }
}
let bad = 0;
const f = (v: number, d = 2) => v.toFixed(d).padStart(6);
console.log(`\n${N} seasons, ${((Date.now() - t0) / 1000).toFixed(0)} s. K = ${JSON.stringify({ SHOT: K.SHOT, KS: K.KS, KQ: K.KQ, KF: K.KF, KG: K.KG, HOME: K.HOME, AWAY: K.AWAY })}`);
console.log('league      goals/match     home wins        draws        champion        last       top scorer   yellow/team    red/team');
for (const lg of CAL) {
  const a = acc[lg], r = REAL[lg]!;
  const cell = (k: keyof typeof CORRIDOR, d = 2) => {
    const ok = Math.abs(a[k] - r[k]) <= CORRIDOR[k];
    if (!ok) bad++;
    return `${f(a[k], d)}/${f(r[k], d)}${ok ? ' ' : '!'}`;
  };
  const cr = CARDS_REAL[lg];
  const card = (v: number, k: keyof typeof CARDS_CORRIDOR, d: number) => {
    if (!cr) return `${f(v, d)}       `;
    const ok = Math.abs(v - cr[k]) <= CARDS_CORRIDOR[k];
    if (!ok) bad++;
    return `${f(v, d)}/${f(cr[k], d)}${ok ? ' ' : '!'}`;
  };
  console.log(`${lg.padEnd(6)} ${cell('gpm')} ${cell('home', 3)} ${cell('draw', 3)} ${cell('champ', 0)} ${cell('last', 0)} ${cell('scorer', 0)} ${card(a.cards / 2, 'yc', 2)} ${card(a.reds / 2, 'rc', 3)}`);
}
{
  const v = { gpm: ucl.gpm / ucl.n, home: ucl.home / ucl.n, draw: ucl.draw / ucl.n };
  const cell = (k: keyof typeof UCL_CORRIDOR, d = 2) => {
    const ok = Math.abs(v[k] - UCL_REAL[k]) <= UCL_CORRIDOR[k];
    if (!ok) bad++;
    return `${f(v[k], d)}/${f(UCL_REAL[k], d)}${ok ? ' ' : '!'}`;
  };
  console.log(`UCL    ${cell('gpm')} ${cell('home', 3)} ${cell('draw', 3)}   (${ucl.n} matches)`);
}
console.log(`Odds: analytic formula vs. 1500 engine runs — mean absolute difference ${((oddsErr / oddsN) * 100).toFixed(1)} p.p.`);
console.log(bad ? `\n${bad} metric(s) outside the corridor (marked "!")` : '\nAll metrics inside their corridors.');
process.exit(bad ? 1 : 0);

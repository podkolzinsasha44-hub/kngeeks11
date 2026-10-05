// The staff's "best line-up" for the user's club: every formation is tried, the eleven of each is
// tuned on the same strength the match engine plays with (teamPower), and the shapes are ranked.
import { fixForeign } from './ai';
import { foreignLimit, isForeign } from './leagues';
import { FORMATIONS, FORMATION_IDS, available, bestTaker, bestXI, familiarity, pickBench, squad, teamPower, teamStrength, type Strength } from './lineup';
import type { FormationId, League, Lineup, Player, Role, Team } from './types';

export interface ShapeOption {
  form: FormationId;
  lineup: Lineup;
  power: number;
  s: Strength;
  /** Starters away from their natural role, with how well they know the slot (1 = natural). */
  off: { p: Player; slot: Role; fam: number }[];
  /** The strongest available players left out of the eleven. */
  out: Player[];
}

/** All formations for the next match, strongest first, plus the power of the current line-up. */
export function lineupOptions(L: League, t: Team): { options: ShapeOption[]; current: number } {
  const pool = squad(L, t.id).filter(available);
  const lim = foreignLimit(t.lg, L.season);
  const maxF = lim ? lim[1] : 11;
  const foreign = (p: Player) => isForeign(p, t.country);
  const options: ShapeOption[] = [];
  for (const form of FORMATION_IDS) {
    const roles = FORMATIONS[form];
    const tmp = { ...t, lineup: { ...t.lineup, form, xi: bestXI(pool, form).xi.map((p) => p.id) } };
    fixForeign(L, tmp, pool);
    const xi = tmp.lineup.xi;
    const power = () => teamPower(L, tmp);
    if (xi.length === 11) {
      // Local search on the engine's own strength: swap two starters, or a starter with a reserve.
      let best = power();
      for (let pass = 0, improved = true; improved && pass < 8; pass++) {
        improved = false;
        for (let i = 0; i < 11; i++) {
          for (let j = i + 1; j < 11; j++) {
            [xi[i], xi[j]] = [xi[j], xi[i]];
            const v = power();
            if (v > best + 1e-6) { best = v; improved = true; } else [xi[i], xi[j]] = [xi[j], xi[i]];
          }
          const onPitch = xi.filter((id) => foreign(L.players[id])).length;
          for (const p of pool) {
            if (xi.includes(p.id)) continue;
            const was = xi[i];
            if (foreign(p) && !foreign(L.players[was]) && onPitch >= maxF) continue;
            xi[i] = p.id;
            const v = power();
            if (v > best + 1e-6) { best = v; improved = true; break; } else xi[i] = was;
          }
        }
      }
    }
    const starters = xi.map((id) => L.players[id]);
    const lineup: Lineup = {
      form, xi: [...xi], bench: pickBench(pool, starters).map((p) => p.id), auto: t.lineup.auto,
      pen: bestTaker(starters), cap: t.lineup.cap != null && xi.includes(t.lineup.cap) ? t.lineup.cap : undefined,
    };
    const off = starters.map((p, i) => ({ p, slot: roles[i], fam: familiarity(p, roles[i]) })).filter((x) => x.fam < 1);
    const weakest = Math.min(...starters.filter((p) => p.pos !== 'G').map((p) => p.ovr));
    const out = pool.filter((p) => !xi.includes(p.id) && p.pos !== 'G' && p.ovr > weakest).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    options.push({ form, lineup, power: power(), s: teamStrength(L, tmp), off, out });
  }
  options.sort((a, b) => b.power - a.power);
  return { options, current: teamPower(L, t) };
}

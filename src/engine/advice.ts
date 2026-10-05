// Transfer advice for the user: who would make the team stronger now, who is a bargain, who is a
// talent for the future, and whether the deal is realistic (price, wage, the player's will, limits).
// Everything is computed with the same functions the market and the match engine use: the asking
// price, the wage the player will ask for, his interest in the club and the power of the eleven.
// No randomness: the same state gives the same advice.
import { askingWage, canRegister, interest, JOIN_MORALE, wageBill } from './contracts';
import { foreignLimit, isForeign, windowOpen } from './leagues';
import { FORMATIONS, planned, SHORT_ABSENCE, slotRating, squad, teamPower } from './lineup';
import { askingPrice } from './transfers';
import type { League, Player, Role, Team } from './types';
import { ageOn, clamp } from './util';

export type Chance = 'high' | 'mid' | 'low';

/** A deal the club can close right now: the fee the owner club asks (0 for a free agent) and the wage he asks. */
export interface Deal { fee: number; wage: number }

/**
 * Can this player join the club now, for money it has? The same checks the deal itself makes: the player
 * talks to the club (interest), the window is open for a transfer, the asking price fits the budget, and
 * the wage he will ask fits the wage budget and the squad rules (foreign-player limit).
 */
export function dealFor(L: League, p: Player, t: Team): Deal | null {
  if (p.team === t.id || p.loan || (p.st !== 'ACT' && p.st !== 'FA')) return null;
  if (p.talksBlockedUntil && p.talksBlockedUntil > L.date) return null;
  const free = p.st === 'FA';
  if (!free && !windowOpen(L)) return null;
  if (interest(L, p, t) < 0.35) return null;
  const fee = free ? 0 : askingPrice(L, p, t);
  if (fee > t.budget) return null;
  const wage = askingWage(L, p, t, free ? 'free' : 'transfer');
  if (canRegister(L, t, p, wage, !free)) return null;
  return { fee, wage };
}

export interface Pick {
  p: Player;
  /** Transfer fee the club asks (0 for a free agent). */
  fee: number;
  /** Yearly wage the player will ask for. */
  wage: number;
  /** Slot of the eleven he would take, the role there and whom he would replace. */
  slot: number;
  role: Role;
  replaces: number | null;
  /** Change of the team's power (0–100 scale) with him in that slot. */
  gain: number;
  /** His rating in that slot. */
  rating: number;
  chance: Chance;
  /** Things to know before buying. */
  notes: string[];
}

export interface Advice {
  /** The weakest place of the current eleven. */
  weak: { slot: number; role: Role; player: number | null; rating: number } | null;
  now: Pick[];
  value: Pick[];
  future: Pick[];
  free: Pick[];
  windowOpen: boolean;
  budget: number;
  wageRoom: number;
  /** The user's regulars who are out: back soon (their place is kept) or for long (the advice covers the gap). */
  away: { p: Player; days: number; long: boolean }[];
}

const chanceOf = (i: number): Chance => (i >= 0.75 ? 'high' : i >= 0.5 ? 'mid' : 'low');

/** Best place of the player in the eleven and how much it changes the power of the team. */
function bestSlot(L: League, t: Team, p: Player, base: number) {
  const roles = FORMATIONS[t.lineup.form];
  // He is measured as he will be after signing: a new player arrives in a better mood.
  const players: Record<number, Player> = Object.create(L.players);
  players[p.id] = { ...p, morale: clamp(p.morale + JOIN_MORALE, 0, 100) };
  let best: { slot: number; gain: number; rating: number } | null = null;
  roles.forEach((r, i) => {
    const cur = L.players[t.lineup.xi[i]];
    const mine = slotRating(p, r);
    if (cur && mine <= slotRating(cur, r) + 0.5) return;
    const xi = [...t.lineup.xi];
    xi[i] = p.id;
    const gain = teamPower({ players }, { ...t, lineup: { ...t.lineup, xi } }) - base;
    if (!best || gain > best.gain) best = { slot: i, gain, rating: mine };
  });
  return best as { slot: number; gain: number; rating: number } | null;
}

/** Recommendations for the user's club at the current date. */
export function transferAdvice(L: League, limit = 8): Advice {
  // Players out for a short time keep their place: a two-week injury is not a reason to buy.
  const t = planned(L, L.teams[L.user]);
  const roles = FORMATIONS[t.lineup.form];
  const base = teamPower(L, t);
  const open = windowOpen(L);
  const sq = squad(L, t.id);
  const lim = foreignLimit(t.lg, L.season);
  const foreignIn = sq.filter((x) => isForeign(x, t.country)).length;
  const foreignOn = t.lineup.xi.filter((id) => L.players[id] && isForeign(L.players[id], t.country)).length;
  const wageRoom = t.wageBudget * 1.02 - wageBill(L, t.id);
  const starterOvr = t.lineup.xi.map((id) => L.players[id]?.ovr ?? 0);
  const avgStarter = starterOvr.reduce((a, b) => a + b, 0) / Math.max(1, starterOvr.length);

  let weak: Advice['weak'] = null;
  roles.forEach((r, i) => {
    const cur = L.players[t.lineup.xi[i]];
    const rating = cur ? slotRating(cur, r) : 0;
    if (!weak || rating < weak.rating) weak = { slot: i, role: r, player: cur?.id ?? null, rating };
  });

  const all: Pick[] = [];
  const young: Pick[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.team === t.id || p.loan || (p.st !== 'ACT' && p.st !== 'FA')) continue;
    const isFree = p.st === 'FA';
    const will = interest(L, p, t);
    if (will < 0.35) continue;
    const fee = isFree ? 0 : askingPrice(L, p, t);
    if (fee > t.budget) continue;
    const wage = askingWage(L, p, t, isFree ? 'free' : 'transfer');
    if (canRegister(L, t, p, wage, !isFree)) continue;
    const age = ageOn(p.bd, L.date);
    const talent = age <= 21 && p.pot >= avgStarter + 2;
    const best = bestSlot(L, t, p, base);
    if (!best && !talent) continue;
    const slot = best?.slot ?? roles.findIndex((r) => slotRating(p, r) === Math.max(...roles.map((x) => slotRating(p, x))));
    const notes: string[] = [];
    if (!isFree && !open) notes.push('окно закрыто — сделка возможна, когда оно откроется');
    if (lim && isForeign(p, t.country)) {
      const out = L.players[t.lineup.xi[slot]];
      if (foreignOn + 1 - (out && isForeign(out, t.country) ? 1 : 0) > lim[1]) notes.push(`на поле станет больше ${lim[1]} легионеров`);
      if (foreignIn + 1 > lim[0]) notes.push(`в заявке станет больше ${lim[0]} легионеров`);
    }
    if (age >= 32) notes.push(`${age} лет — ненадолго`);
    if (p.inj) notes.push(`сам травмирован ещё на ${p.inj.days} дн.`);
    const pick: Pick = {
      p, fee, wage, slot, role: roles[slot], replaces: t.lineup.xi[slot] ?? null,
      gain: best?.gain ?? 0, rating: best?.rating ?? slotRating(p, roles[slot]), chance: chanceOf(will), notes,
    };
    if (best && best.gain > 0.05) all.push(pick);
    if (talent) young.push(pick);
  }
  // Deals that break the foreign limit stay visible but go to the end.
  const blocked = (x: Pick) => (x.notes.some((n) => n.includes('легионеров')) ? 1 : 0);
  // Not more than two names per place, so the list covers different positions.
  const spread = (list: Pick[]) => {
    const per = new Map<number, number>();
    return list.filter((x) => { const n = per.get(x.slot) ?? 0; per.set(x.slot, n + 1); return n < 2; }).slice(0, limit);
  };
  const byGain = [...all].sort((a, b) => blocked(a) - blocked(b) || b.gain - a.gain || a.fee - b.fee);
  const now = spread(byGain.filter((x) => x.fee > 0));
  const taken = new Set(now.map((x) => x.p.id));
  // Value: power gained per million spent (fee plus two years of wages); veterans count for less.
  const cost = (x: Pick) => (x.fee + x.wage * 2) / 1e6 + 0.5;
  const span = (x: Pick) => { const a = ageOn(x.p.bd, L.date); return a >= 33 ? 0.55 : a >= 31 ? 0.75 : 1; };
  const value = spread(all
    .filter((x) => x.fee > 0 && !taken.has(x.p.id) && x.gain >= 0.15)
    .sort((a, b) => blocked(a) - blocked(b) || (b.gain * span(b)) / cost(b) - (a.gain * span(a)) / cost(a)));
  const future = spread(young
    .filter((x) => !taken.has(x.p.id))
    .sort((a, b) => blocked(a) - blocked(b) || b.p.pot - a.p.pot || a.fee - b.fee));
  const free = spread(byGain.filter((x) => x.fee === 0));
  const regulars = new Set([...t.lineup.xi, ...L.teams[L.user].lineup.bench]);
  const away = sq
    .filter((p) => (p.inj || (p.susp ?? 0) > 0) && (regulars.has(p.id) || p.ovr >= avgStarter - 2))
    .map((p) => ({ p, days: p.inj?.days ?? 0, long: !!p.inj && p.inj.days > SHORT_ABSENCE }))
    .sort((a, b) => b.p.ovr - a.p.ovr);
  return { weak, now, value, future, free, windowOpen: open, budget: t.budget, wageRoom, away };
}

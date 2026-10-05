import type { KeeperAttrs, League, OutfieldAttrs, Player, Role } from './types';

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
export function ageOn(birth: string, date: string): number {
  const b = new Date(birth + 'T12:00:00Z');
  const d = new Date(date + 'T12:00:00Z');
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
export const age = (p: Player, L: League) => ageOn(p.bd, L.date);
export const dow = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();

export const isKeeper = (p: Player) => p.pos === 'G';
export const of = (p: Player) => p.r as OutfieldAttrs;
export const gk = (p: Player) => p.r as KeeperAttrs;

type W = Partial<Record<keyof OutfieldAttrs, number>>;
/** Attribute weights of every outfield role (each row sums to 1). */
export const W_ROLE: Record<Exclude<Role, 'GK'>, W> = {
  ST: { pac: 0.14, sho: 0.26, pas: 0.08, dri: 0.14, att: 0.24, phy: 0.08, hea: 0.06 },
  LW: { pac: 0.2, sho: 0.14, pas: 0.16, dri: 0.22, att: 0.18, def: 0.04, phy: 0.04, hea: 0.02 },
  RW: { pac: 0.2, sho: 0.14, pas: 0.16, dri: 0.22, att: 0.18, def: 0.04, phy: 0.04, hea: 0.02 },
  LM: { pac: 0.18, sho: 0.1, pas: 0.2, dri: 0.2, att: 0.14, def: 0.1, phy: 0.06, hea: 0.02 },
  RM: { pac: 0.18, sho: 0.1, pas: 0.2, dri: 0.2, att: 0.14, def: 0.1, phy: 0.06, hea: 0.02 },
  AM: { pac: 0.1, sho: 0.14, pas: 0.24, dri: 0.2, att: 0.22, def: 0.04, phy: 0.04, hea: 0.02 },
  CM: { pac: 0.08, sho: 0.08, pas: 0.26, dri: 0.14, att: 0.12, def: 0.18, phy: 0.1, hea: 0.04 },
  DM: { pac: 0.08, sho: 0.03, pas: 0.2, dri: 0.08, att: 0.05, def: 0.34, phy: 0.16, hea: 0.06 },
  LB: { pac: 0.2, sho: 0.02, pas: 0.14, dri: 0.1, att: 0.08, def: 0.3, phy: 0.1, hea: 0.06 },
  RB: { pac: 0.2, sho: 0.02, pas: 0.14, dri: 0.1, att: 0.08, def: 0.3, phy: 0.1, hea: 0.06 },
  CB: { pac: 0.1, pas: 0.08, dri: 0.04, att: 0.01, def: 0.44, phy: 0.19, hea: 0.14 },
};

export function keeperOvr(a: KeeperAttrs) {
  return 0.3 * a.ref + 0.28 * a.pos + 0.16 * a.han + 0.06 * a.kic + 0.12 * a.con + 0.08 * a.men;
}

/** Rating of an outfield player as if he played `role` (attributes only, no familiarity penalty). */
export function roleRating(a: OutfieldAttrs, role: Exclude<Role, 'GK'>) {
  const w = W_ROLE[role];
  let v = 0;
  for (const k in w) v += w[k as keyof OutfieldAttrs]! * a[k as keyof OutfieldAttrs];
  return v;
}

export function calcOvr(p: Player): number {
  if (p.pos === 'G') return Math.round(keeperOvr(p.r as KeeperAttrs));
  return Math.round(roleRating(p.r as OutfieldAttrs, p.role as Exclude<Role, 'GK'>));
}

export const posOfRole = (r: Role): Player['pos'] =>
  r === 'GK' ? 'G' : r === 'CB' || r === 'LB' || r === 'RB' ? 'D' : r === 'ST' || r === 'LW' || r === 'RW' ? 'F' : 'M';

export const fullName = (p: Player) => (p.fn ? `${p.fn} ${p.ln}` : p.ln);
export const shortName = (p: Player) => (p.fn ? `${p.fn[0]}. ${p.ln}` : p.ln);
/** Russian name when known (RPL players), otherwise the original spelling. */
export const dispName = (p: Player) => p.ru ?? fullName(p);
export const dispShort = (p: Player) => {
  if (!p.ru) return shortName(p);
  const parts = p.ru.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : p.ru;
};

export function seasonLabel(season: number) {
  return `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
}

/** Money in euros: "€12,5 млн", "€350 тыс". */
/** Money rounded to about two significant figures: €1 тыс steps below €100 тыс, €5 тыс below €1 млн, €50 тыс below €10 млн, €100 тыс above. */
const moneyUnit = (v: number) => (v < 1e5 ? 1000 : v < 1e6 ? 5000 : v < 1e7 ? 50_000 : 1e5);
export const roundMoney = (v: number) => Math.round(v / moneyUnit(v)) * moneyUnit(v);
/** Rounded down, so a sum derived from a ceiling never ends up above it. */
export const floorMoney = (v: number) => Math.floor(v / moneyUnit(v)) * moneyUnit(v);
/** The lowest market value a player can have. */
export const MIN_VALUE = 5000;

export function money(n: number, digits = 1) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `€${(n / 1_000_000).toFixed(a >= 100_000_000 ? 0 : digits).replace('.', ',')} млн`;
  if (a >= 1000) return `€${Math.round(n / 1000)} тыс`;
  return `€${Math.round(n)}`;
}

export function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

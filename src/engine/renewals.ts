// Contract renewals of the user's club: for every player whose deal ends this summer or next, the
// assistant decides — extend (and on what terms), haggle yourself (he is worth keeping but asks too
// much), sell while he still has a price, or let him go — and explains why. With auto-renewal on,
// good extensions are signed by themselves once a month (October to May of the final year), on
// exactly the terms the player asks for in talks. No randomness: the same state, the same decision.
import { askingWage, signContract, talksWill, talkYears, wageBill, wageFor } from './contracts';
import { FORMATIONS, slotRating, squad, teamPower } from './lineup';
import { pushMsg } from './news';
import type { League, Player, Pos } from './types';
import { ageOn, dispName, money } from './util';

export type Verdict = 'extend' | 'haggle' | 'sell' | 'release';
export const VERDICT_RU: Record<Verdict, string> = { extend: 'продлить', haggle: 'торговаться', sell: 'продать', release: 'отпустить' };

export interface RenewalCase {
  p: Player;
  verdict: Verdict;
  /** One line for the list and the full explanation. */
  short: string;
  why: string[];
  /** Terms the player asks for now. */
  wage: number;
  years: number;
  /** Fair wage for his rating in this league. */
  fair: number;
  /** How much weaker the eleven gets without him (power points). */
  loss: number;
  /** The contract ends this coming summer. */
  final: boolean;
  /** Auto-renewal may sign it now. */
  auto: boolean;
}

/** Players a squad needs in each line, counting those with a contract for next season. */
const NEED: Record<Pos, number> = { G: 2, D: 6, M: 6, F: 4 };

/** Power lost if the player left: his slot in the eleven goes to the best player outside it. */
function lossWithout(L: League, p: Player): number {
  const t = L.teams[L.user];
  const i = t.lineup.xi.indexOf(p.id);
  if (i < 0) return 0;
  const role = FORMATIONS[t.lineup.form][i];
  const inXi = new Set(t.lineup.xi);
  let best: Player | null = null;
  for (const x of squad(L, t.id)) if (!inXi.has(x.id) && x.id !== p.id && (!best || slotRating(x, role) > slotRating(best, role))) best = x;
  const xi = [...t.lineup.xi];
  if (best) xi[i] = best.id; else xi.splice(i, 1);
  return Math.max(0, teamPower(L, t) - teamPower(L, { ...t, lineup: { ...t.lineup, xi } }));
}

/** The assistant's view of every contract of the user's club that ends within two summers. */
export function renewalCases(L: League): RenewalCase[] {
  const t = L.teams[L.user];
  const sq = squad(L, t.id);
  const starters = t.lineup.xi.map((id) => L.players[id]).filter(Boolean);
  const avgStarter = starters.reduce((s, p) => s + p.ovr, 0) / Math.max(1, starters.length);
  const room = t.wageBudget * 1.02 - wageBill(L, t.id);
  const out: RenewalCase[] = [];
  for (const p of sq) {
    if (!p.c || p.loan || p.c.until > L.season + 2) continue;
    const final = p.c.until <= L.season + 1;
    const age = ageOn(p.bd, L.date);
    const wage = askingWage(L, p, t, 'extend');
    const years = talkYears(age);
    const fair = wageFor(p.ovr, t.lg);
    const ratio = wage / Math.max(1, fair);
    const loss = lossWithout(L, p);
    const will = talksWill(L, p, t, 'extend');
    const staying = sq.filter((x) => x.pos === p.pos && x.id !== p.id && x.c && x.c.until > L.season + 1).length;
    const talent = age <= 22 && p.pot >= Math.max(p.ovr + 4, avgStarter - 1);
    const key = loss >= 0.35;
    const depth = staying < NEED[p.pos];
    const fits = wage - p.c.wage <= Math.max(0, room);
    const starter = t.lineup.xi.includes(p.id);
    const core = starter && p.ovr >= avgStarter - 4;
    const quality = !starter && p.ovr >= avgStarter - 5 && age <= 30;
    // Reasons for keeping him come first, then what speaks against, then the terms.
    const pros: string[] = [], cons: string[] = [];
    if (key) pros.push(`без него сила состава упадёт на ${loss.toFixed(1)}`);
    else if (core) pros.push('игрок основы по уровню команды');
    if (talent) pros.push(`${age} лет, потенциал ${p.pot}`);
    if (quality) pros.push('качественная замена для основы');
    if (depth) pros.push(`на позиции останется ${staying} из нужных ${NEED[p.pos]}`);
    if (starter && !key) cons.push('замена в составе почти равноценна');
    if (age >= 31) cons.push(`${age} лет — дальше рейтинг будет снижаться`);
    const terms = `просит ${money(wage)} в год на ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'} (сейчас ${money(p.c.wage)}, рынок для рейтинга ${p.ovr} — ${money(fair)})`;
    let verdict: Verdict, short: string;
    const wanted = key || core || talent || quality || (depth && ratio <= 1.15);
    const tooOld = age >= 34 && loss < 0.8;
    if (p.wantsOut || will < 0.45 || (p.talksBlockedUntil && p.talksBlockedUntil > L.date)) {
      verdict = p.val >= 1e6 && final ? 'sell' : 'release';
      short = p.wantsOut ? 'хочет уйти — продлить не выйдет' : 'не настроен продлевать';
      cons.unshift(p.wantsOut ? 'игрок хочет сменить клуб' : 'агент сейчас не готов к переговорам');
      if (verdict === 'sell') cons.push(`летом уйдёт бесплатно, а сейчас стоит ${money(p.val)} — лучше продать в окно`);
    } else if (!wanted || tooOld) {
      verdict = 'release';
      short = tooOld ? 'возраст, замена найдётся' : 'не нужен составу';
      if (!wanted) cons.unshift('не входит в планы: не игрок основы, не талант, позиция закрыта');
    } else if (ratio > (talent ? 1.45 : key ? 1.35 : 1.15) || !fits) {
      verdict = 'haggle';
      short = !fits ? 'нужен, но не влезает в зарплаты' : 'нужен, но просит слишком много';
      cons.push(!fits ? `в зарплатном бюджете свободно только ${money(Math.max(0, room))}` : `это на ${Math.round((ratio - 1) * 100)}% выше рыночного — попробуйте сбить цену в переговорах`);
    } else {
      verdict = 'extend';
      const what = key ? 'ключевой игрок' : core ? 'игрок основы' : talent ? 'талант' : quality ? 'качественная замена' : 'нужен для глубины';
      short = `${what}, ${ratio <= 1.02 ? 'условия не дороже рынка' : 'условия рыночные'}`;
    }
    const why = verdict === 'extend' || verdict === 'haggle' ? [...pros, ...cons, terms] : [...cons, ...pros, terms];
    out.push({ p, verdict, short, why, wage, years, fair, loss, final, auto: verdict === 'extend' && final });
  }
  const order: Record<Verdict, number> = { extend: 0, haggle: 1, sell: 2, release: 3 };
  return out.sort((a, b) => Number(b.final) - Number(a.final) || order[a.verdict] - order[b.verdict] || b.p.ovr - a.p.ovr);
}

/** Signs one extension on the player's own terms (the same deal talks end with when his ask is met). */
export function renewNow(L: League, c: RenewalCase) {
  signContract(L, c.p, L.teams[L.user], c.wage, c.years);
}

const RENEW_MONTHS = ['10', '11', '12', '01', '02', '03', '04', '05'];

/** Monthly auto-renewal of good deals of the user's club (when the setting is on). Returns who was extended. */
export function autoRenew(L: League): Player[] {
  if (L.settings.autoRenew === false || !RENEW_MONTHS.includes(L.date.slice(5, 7)) || L.gm.fired) return [];
  const done: [RenewalCase, number][] = [];
  // One by one: every signature takes room in the wage budget, so the next case is re-evaluated.
  for (let guard = 0; guard < 40; guard++) {
    const c = renewalCases(L).find((x) => x.auto && !L.negotiations[x.p.id]);
    if (!c) break;
    renewNow(L, c);
    done.push([c, c.p.c!.until]);
  }
  if (done.length) {
    pushMsg(L, {
      from: 'Спортивный отдел', kind: 'staff', title: `Автопродление: ${done.length === 1 ? dispName(done[0][0].p) : `${done.length} ${done.length % 10 >= 2 && done.length % 10 <= 4 && (done.length % 100 < 12 || done.length % 100 > 14) ? 'контракта' : 'контрактов'}`}`,
      body: done.map(([c, until]) => `${dispName(c.p)} (${c.p.ovr}) — до лета ${until}, ${money(c.wage)} в год. ${c.short[0].toUpperCase()}${c.short.slice(1)}: ${c.why[0]}.`).join('\n\n')
        + '\n\nАвтопродление выключается в настройках.',
      ref: { type: 'screen', id: 'finance' },
    });
  }
  return done.map(([c]) => c.p);
}

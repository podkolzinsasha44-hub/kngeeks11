// Should the user sell this player, and for how much? The staff weighs what the team loses (power
// of the eleven without him), what a replacement of the same level costs on the market right now,
// where his price is heading (age, potential, contract) and whether he wants to stay. For a concrete
// offer it says accept / ask for more / refuse, and how much to ask: the club's ceiling is the same
// formula respondOffer uses, so the suggested counter does not scare the buyer away.
// No randomness: the same state gives the same advice.
import { askingWage, interest, wageBill } from './contracts';
import { FORMATIONS, slotRating, squad } from './lineup';
import { lossWithout, renewalCases } from './renewals';
import { askingPrice, buyerCeiling } from './transfers';
import type { League, Player, Role, TransferOffer } from './types';
import { ageOn, dispName, money } from './util';

export interface SaleView {
  /** Not for sale at any price a club would realistically pay. */
  keep: boolean;
  /** Below this the sale weakens the club; above `good` it is a good deal. */
  min: number;
  good: number;
  label: string;
  why: string[];
  replacement: { p: Player; fee: number } | null;
  loss: number;
}

export interface OfferView extends SaleView {
  verdict: 'accept' | 'counter' | 'reject';
  /** What to ask for instead (never above what the buyer is ready to pay), or null. */
  ask: number | null;
  /** The staff's estimate of the most this club pays. */
  ceiling: number;
  text: string;
}

const round = (v: number) => (v >= 1e6 ? Math.round(v / 1e5) * 1e5 : Math.round(v / 25_000) * 25_000);

/** Cheapest market player who would take his place at the same level, with the money of the sale in hand. */
function replacementFor(L: League, p: Player, role: Role, money: number) {
  const me = L.teams[L.user];
  const need = slotRating(p, role) - 1;
  // His wage leaves with him: the replacement has that much plus the free room of the wage budget.
  const wageRoom = me.wageBudget * 1.02 - wageBill(L, me.id) + (p.c?.wage ?? 0);
  let best: { p: Player; fee: number } | null = null;
  for (const id in L.players) {
    const c = L.players[id];
    if (c.team === me.id || c.loan || (c.st !== 'ACT' && c.st !== 'FA') || slotRating(c, role) < need) continue;
    if (interest(L, c, me) < 0.35) continue;
    const fee = c.st === 'FA' ? 0 : askingPrice(L, c, me);
    if (fee > money || askingWage(L, c, me, c.st === 'FA' ? 'free' : 'transfer') > wageRoom) continue;
    if (!best || fee < best.fee) best = { p: c, fee };
  }
  return best;
}

/** The staff's view of selling one of the user's players (without a concrete offer). */
export function saleView(L: League, p: Player, offerFee = 0): SaleView {
  const me = L.teams[L.user];
  const age = ageOn(p.bd, L.date);
  const val = Math.max(p.val, 25_000);
  const i = me.lineup.xi.indexOf(p.id);
  const role: Role = i >= 0 ? FORMATIONS[me.lineup.form][i] : p.role;
  const loss = lossWithout(L, p);
  const starters = me.lineup.xi.map((id) => L.players[id]).filter(Boolean);
  const avgStarter = starters.reduce((s, x) => s + x.ovr, 0) / Math.max(1, starters.length);
  const key = loss >= 0.35;
  const core = i >= 0 && p.ovr >= avgStarter - 4;
  const talent = age <= 22 && p.pot >= Math.max(p.ovr + 4, avgStarter - 1);
  const renewal = renewalCases(L).find((c) => c.p.id === p.id);
  const leaving = !!p.wantsOut || (!!renewal && renewal.final && (renewal.verdict === 'sell' || renewal.verdict === 'release'));
  const samePos = squad(L, me.id).filter((x) => x.pos === p.pos && x.id !== p.id).length;
  const replacement = key || core ? replacementFor(L, p, role, me.budget + Math.max(offerFee, val)) : null;
  const why: string[] = [];
  let min: number, label: string, keep = false;
  if (leaving) {
    min = val * 0.5;
    label = p.wantsOut ? 'хочет уйти — лучше продать' : 'контракт истекает — летом уйдёт бесплатно';
    why.push(p.wantsOut ? 'игрок хочет сменить клуб: недовольный игрок портит настроение и всё равно уйдёт' : `контракт до лета ${p.c?.until}, продлевать штаб не советует — любые деньги лучше, чем ничего`);
  } else if (key) {
    // With a replacement in sight the sale must at least pay for it (with a margin for the risk);
    // without one he is not for sale at any price a club would realistically pay.
    min = replacement ? Math.max(val * 1.15, replacement.fee * 1.15 + 5e5) : val * 1.8;
    keep = !replacement;
    label = keep ? 'ключевой — не продавать' : 'ключевой — только за большие деньги';
    why.push(`без него сила состава упадёт на ${loss.toFixed(1)}`);
    why.push(replacement ? `замена того же уровня сейчас — ${dispName(replacement.p)} за ${replacement.fee ? money(replacement.fee) : 'бесплатно (свободный агент)'}` : 'равноценной замены, которая к вам пойдёт и по карману, на рынке сейчас нет');
  } else if (talent) {
    min = val * 1.3;
    label = 'талант — цена будет расти';
    why.push(`${age} лет, потенциал ${p.pot}: через пару сезонов он будет стоить дороже`);
  } else if (core) {
    min = Math.max(val * 1.15, replacement ? replacement.fee * 1.1 : val * 1.15);
    label = 'игрок основы — продавать дороже рынка';
    why.push('играет в основе, но заменить его можно почти без потерь');
    if (replacement) why.push(`замена — ${dispName(replacement.p)} за ${replacement.fee ? money(replacement.fee) : 'бесплатно'}`);
  } else {
    min = val * (age >= 31 ? 0.75 : 0.85);
    label = age >= 31 ? 'не в основе, цена падает — можно продать' : 'не в основе — можно продать';
    why.push(`не входит в стартовый состав${samePos >= 4 ? `, на позиции ещё ${samePos} игроков` : ''}`);
  }
  if (age >= 30 && !leaving) why.push(`${age} лет — его цена дальше будет снижаться`);
  if (p.c && !leaving && p.c.until <= L.season + 2) why.push(`контракт до лета ${p.c.until}: чем ближе конец, тем меньше за него дадут`);
  why.push(`рыночная оценка ${money(val)}`);
  min = round(min);
  return { keep, min, good: round(min * 1.15), label, why, replacement, loss };
}

/** The staff's verdict on a concrete offer from another club. */
export function offerView(L: League, o: TransferOffer): OfferView {
  const p = L.players[o.player];
  const buyer = L.teams[o.from];
  const v = saleView(L, p, o.fee);
  const ceiling = round(Math.floor(buyerCeiling(L, buyer, p) * 0.98));
  let verdict: OfferView['verdict'], ask: number | null = null, text: string;
  if (o.fee >= v.good) {
    verdict = 'accept';
    text = `Выгодно: ${money(o.fee)} — ${o.fee > v.good ? "выше" : "не ниже"} хорошей цены ${money(v.good)}.`;
    if (ceiling > o.fee * 1.08) { ask = Math.min(ceiling, round(o.fee * 1.25)); text += ` Можно попросить до ${money(ask)} — по оценке штаба «${buyer.ru}» заплатит.`; }
  } else if (o.fee >= v.min && !v.keep) {
    verdict = 'counter';
    ask = Math.min(ceiling, v.good) > o.fee ? Math.min(ceiling, v.good) : null;
    text = ask ? `Цена приемлемая, но мало. Попросите ${money(ask)}: больше «${buyer.ru}» вряд ли даст.` : `Цена приемлемая: «${buyer.ru}» больше не заплатит.`;
  } else {
    verdict = 'reject';
    const reach = !v.keep && ceiling >= v.min;
    ask = reach ? Math.min(ceiling, v.good) : null;
    text = v.keep ? 'Не продавать: равноценной замены сейчас нет.' : reach ? `Дёшево. Продавать не дешевле ${money(v.min)} — попросите ${money(ask!)}.` : `Дёшево, а больше ${money(ceiling)} «${buyer.ru}» не даст. Продавать не дешевле ${money(v.min)}.`;
  }
  return { ...v, verdict, ask, ceiling, text };
}

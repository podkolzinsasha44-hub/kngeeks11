import { LEAGUES, leagueTeams } from './leagues';
import { teamPower } from './lineup';
import { PRESIDENT } from './names';
import { pushMsg, pushNews } from './news';
import { shuffle } from './rng';
import type { League, OwnerState } from './types';
import { clamp } from './util';

/** Place in the table the board expects for each goal, scaled to a 16-club league. */
const TARGET: Record<OwnerState['goal'], number> = { title: 1, top3: 3, top6: 6, mid: 10, survive: 12, promote: 2, playoff: 4 };

export function ownerGoalFor(L: League, teamId: string): { goal: OwnerState['goal']; text: string } {
  const t = L.teams[teamId];
  const ranks = leagueTeams(L, t.lg).map((x) => ({ id: x.id, p: teamPower(L, x) })).sort((a, b) => b.p - a.p);
  const rank = ((ranks.findIndex((r) => r.id === teamId) + 1) * 16) / ranks.length;
  if (LEAGUES[t.lg].up) {
    if (rank <= 4) return { goal: 'promote', text: 'состав сильнейший в лиге — задача одна: прямой выход в Премьер-Лигу (первые два места)' };
    if (rank <= 9) return { goal: 'playoff', text: 'бороться за выход в Премьер-Лигу: место в первой четвёрке (стыковые матчи)' };
    return { goal: 'mid', text: 'спокойный сезон в середине таблицы и развитие молодых игроков' };
  }
  if (rank <= 2) return { goal: 'title', text: 'команда собрана для чемпионства — жду золотые медали' };
  if (rank <= 5) return { goal: 'top3', text: 'мы среди сильнейших — нужны медали (место в тройке)' };
  if (rank <= 8) return { goal: 'top6', text: 'место в верхней части таблицы — не ниже шестого' };
  if (rank <= 12) return { goal: 'mid', text: 'уверенный сезон без борьбы за выживание — не ниже десятого места' };
  return { goal: 'survive', text: 'сохранить место в лиге. Любое место выше зоны вылета и стыков — успех' };
}

export const targetPlace = (L: League) => {
  const n = leagueTeams(L, L.teams[L.user].lg).length;
  return Math.max(1, Math.round((TARGET[L.owner.goal] * n) / 16));
};

/** Evaluates the season for the board. Returns the trust change. */
export function evaluateSeason(L: League, place: number, extra: { champion: boolean; cup: boolean; relegated: boolean; promoted: boolean; ucl?: number }) {
  const o = L.owner;
  const target = targetPlace(L);
  let delta = (target - place) * 4 + (place <= target ? 9 : -7);
  if (extra.champion) delta += 25;
  if (extra.cup) delta += 12;
  // Champions League: the knock-out rounds reached (-1 = league phase, 0 = play-offs … 4 = final, 5 = won).
  if (extra.ucl != null) delta += [0, 2, 5, 8, 12, 16, 25][extra.ucl + 1] ?? 0;
  if (extra.promoted) delta += 20;
  if (extra.relegated) delta -= 35;
  const mul = L.settings.difficulty === 'rookie' ? 0.6 : L.settings.difficulty === 'hard' ? 1.3 : 1;
  delta = delta < 0 ? delta * mul : delta / mul;
  o.trust = clamp(Math.round(o.trust + delta), 0, 100);
  return Math.round(delta);
}

export function ownerReact(L: League) {
  const o = L.owner;
  if (L.settings.noFiring) {
    if (o.trust < 25) pushMsg(L, { from: PRESIDENT, kind: 'owner', title: 'Мы недовольны', body: 'Результаты далеки от ожиданий. Уволить вас мы не можем, но ждём перемен — болельщики и спонсоры тоже ждут.' });
    o.trust = Math.max(o.trust, 10);
    return;
  }
  if (o.trust <= 0) return fire(L);
  if (o.trust < 25) {
    o.warnings++;
    pushMsg(L, { from: PRESIDENT, kind: 'owner', title: 'Последнее предупреждение', body: 'Терпение на исходе. Если результаты не улучшатся, клубу придётся искать нового спортивного директора.' });
  }
}

export function fire(L: League) {
  L.gm.fired = true;
  pushNews(L, { kind: 'owner', title: `«${L.teams[L.user].ru}» увольняет спортивного директора ${L.gm.name}`, important: true, team: L.user });
  // Clubs of the same country call first; a well-known manager also gets an offer from abroad.
  const me = L.teams[L.user];
  const same = shuffle(Object.values(L.teams).filter((t) => t.id !== L.user && t.lg !== 'U17' && t.country === me.country && t.strategy !== 'contend' && t.rep <= me.rep + 5));
  const abroad = shuffle(Object.values(L.teams).filter((t) => t.lg !== 'U17' && t.country !== me.country && t.strategy === 'rebuild'));
  const n = L.gm.rep >= 45 ? 3 : L.gm.rep >= 25 ? 2 : 1;
  L.gm.offers = [...same.slice(0, n), ...(L.gm.rep >= 60 ? abroad.slice(0, 1) : [])].map((t) => t.id);
}

// Weekly life of a squad: morale follows playing time and results.
import { statKey } from './leagues';
import { pushMsg } from './news';
import { next } from './rng';
import type { League } from './types';
import { ageOn, clamp, dispName } from './util';

export function weeklyMorale(L: League) {
  const user = L.teams[L.user];
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.team || p.st !== 'ACT') { p.morale += (65 - p.morale) * 0.1; continue; }
    const t = L.teams[p.team];
    let target = 66;
    const streak = t.rec.streak;
    if (streak.startsWith('W')) target += Math.min(10, Number(streak.slice(1)) * 2.5);
    if (streak.startsWith('L')) target -= Math.min(12, Number(streak.slice(1)) * 3);
    if (t.rec.gp >= 6) {
      // A player good enough to start expects to play.
      const s = p.stats[statKey(L.season, t.lg)];
      const share = (s?.min ?? 0) / (t.rec.gp * 90);
      const starter = t.lineup.xi.includes(p.id);
      const better = Object.values(t.lineup.xi).filter((x) => (L.players[x]?.ovr ?? 0) > p.ovr).length;
      if (!p.inj && better <= 7 && share < 0.35) target -= 14;
      else if (starter || share > 0.6) target += 4;
    }
    p.morale = clamp(p.morale + (target - p.morale) * 0.18, 0, 100);
    if (p.team === L.user && user && p.morale < 32 && !p.wantsOut && !p.inj && next() < 0.3 && ageOn(p.bd, L.date) >= 20) {
      p.wantsOut = true;
      pushMsg(L, {
        from: `Агент игрока`, kind: 'player', title: `${dispName(p)} просит о трансфере`,
        body: 'Игрок недоволен своей ролью и хочет сменить клуб. Вернуть его расположение можно игровым временем, новым контрактом — или продажей.',
        ref: { type: 'player', id: p.id },
      });
      L.stops.push('player');
    }
    if (p.wantsOut && p.morale > 62) p.wantsOut = false;
  }
}

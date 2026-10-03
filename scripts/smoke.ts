// Plays whole seasons without the interface: npm run smoke -- 3 SPA
import fs from 'node:fs';
import { LEAGUES, LEAGUE_IDS } from '../src/engine/leagues';
import { nationName } from '../src/engine/intl';
import { advanceDay } from '../src/engine/season';
import { sortedTeams } from '../src/engine/standings';
import { newCareer, type WorldJson } from '../src/engine/world';
import { dispName, money } from '../src/engine/util';

const seasons = Number(process.argv[2] ?? 1);
const team = process.argv[3] ?? 'SPA';
const world: WorldJson = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
const L = newCareer(world, { team, gmName: 'Smoke', seed: 12345 });
L.teams[team].lineup.auto = true;
const t0 = Date.now();
let days = 0, blocked = 0;
const until = `${L.season + seasons}-06-25`;
while (L.date < until) {
  const r = advanceDay(L);
  if (r.blocked) blocked++;
  L.stops.length = 0;
  days++;
  if (L.gm.fired) { L.gm.fired = false; L.owner.trust = 50; }
  if (L.date.slice(5) === '06-19') {
    console.log(`\n===== Season ${L.season}/${L.season + 1}`);
    for (const lg of LEAGUE_IDS) {
      const t = sortedTeams(L, lg);
      const gp = t.reduce((s, x) => s + x.rec.gp, 0) / 2, gf = t.reduce((s, x) => s + x.rec.gf, 0);
      const hw = t.reduce((s, x) => s + x.rec.hw, 0), d = t.reduce((s, x) => s + x.rec.d, 0) / 2;
      const top = L.comps[lg].history[0]?.topScorer;
      console.log(`${LEAGUES[lg].short.padEnd(11)} ${t.slice(0, 3).map((x) => `${x.ru} ${x.rec.pts}`).join(', ')} … ${t[t.length - 1].ru} ${t[t.length - 1].rec.pts} | g/m ${(gf / gp).toFixed(2)} H ${(hw / gp).toFixed(3)} D ${(d / gp).toFixed(3)} | ${top?.name} ${top?.g}`);
    }
    const cup = L.cups.CUP;
    console.log(`Кубок: ${cup?.champion ? L.teams[cup.champion].ru : '—'}; стыки: ${(L.cups.PO?.ties ?? []).map((x) => `${L.teams[x.h].ru}-${L.teams[x.a].ru} → ${x.winner ? L.teams[x.winner].ru : '?'}`).join('; ')}`);
    const me = L.teams[team];
    console.log(`User ${me.ru}: place ${sortedTeams(L, me.lg).findIndex((x) => x.id === team) + 1}, budget ${money(me.budget)}, trust ${L.owner.trust}, transfers ${L.transfers.filter((x) => x.season === L.season).length}`);
  }
}
console.log(`\n${days} days in ${((Date.now() - t0) / 1000).toFixed(1)} s, blocked ${blocked}`);
console.log('Intl:', L.intl.history.map((h) => `${h.name}: ${h.medals.map(nationName).join(', ')}`).join(' | '));
console.log('RPL now:', sortedTeams(L, 'RPL').map((t) => t.short).join(' '));
console.log('Top transfers:', L.transfers.sort((a, b) => b.fee - a.fee).slice(0, 8).map((t) => `${t.name} ${t.from ?? 'ext'}→${t.to} ${money(t.fee)}`).join('; '));
const pl = Object.values(L.players);
console.log(`Players ${pl.length}, retired ${pl.filter((p) => p.st === 'RET').length}, FA ${pl.filter((p) => p.st === 'FA').length}, fictional ${pl.filter((p) => !p.real).length}`);
console.log('Best:', pl.filter((p) => p.st === 'ACT').sort((a, b) => b.ovr - a.ovr).slice(0, 8).map((p) => `${dispName(p)} ${p.ovr}`).join(', '));
console.log('Save size MB:', (JSON.stringify(L).length / 1e6).toFixed(2));

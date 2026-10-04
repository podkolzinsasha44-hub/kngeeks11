// Adds the 2026-27 UEFA Champions League to public/data/world.json (run after build-world.mjs).
//
//  * Pots and the 144 league-phase fixtures with their real dates: Wikipedia, "2026–27 UEFA Champions
//    League league phase" (CC BY-SA 4.0). Match results are not taken: the game starts in July and
//    plays every match itself.
//  * Which article is which club: Wikidata (CC0), the Transfermarkt club id (P7223).
//  * The 15 clubs from outside the seven simulated leagues: squads, stadium, coach from the open
//    transfermarkt-datasets snapshot (CC0); Slovan Bratislava and Sabah, which the snapshot barely
//    covers, from the squads of their Wikipedia articles (dates of birth from Wikidata).
//    Players are rated with the same formulas as everyone else (ratings.mjs).
//
// Nothing here is random: the same input gives the same output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUB_TM } from './club-tm.mjs';
import { fifa } from './countries.mjs';
import { cached, enSquad, fetchPages, link, templates, tplParams } from './fetch-data.mjs';
import { ageOn, buildAttrs, clamp, readCsv, rnd, targetOvr } from './ratings.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const WORLD = path.join(ROOT, 'public', 'data', 'world.json');
const UA = 'FootballGM-fan-project/0.1 (non-commercial data snapshot)';
const PAGE = '2026–27 UEFA Champions League league phase';

// Clubs outside the simulated leagues: id, Russian name, kit colours (club identity, not in the datasets).
const EXT = {
  336: ['SCP', 'Sporting CP', 'Спортинг', 'POR', '#00804A', '#FFFFFF'],
  720: ['FCP', 'Porto', 'Порту', 'POR', '#0047AB', '#FFFFFF'],
  2282: ['CLB', 'Club Brugge', 'Брюгге', 'BEL', '#0067B1', '#111111'],
  383: ['PSV', 'PSV Eindhoven', 'ПСВ', 'NED', '#E30613', '#FFFFFF'],
  234: ['FEY', 'Feyenoord', 'Фейеноорд', 'NED', '#E2001A', '#FFFFFF'],
  501: ['BOD', 'Bodø/Glimt', 'Будё-Глимт', 'NOR', '#FFD200', '#111111'],
  36: ['FEN', 'Fenerbahçe', 'Фенербахче', 'TUR', '#0B2A6F', '#FFED00'],
  660: ['SHK', 'Shakhtar Donetsk', 'Шахтёр', 'UKR', '#F37021', '#111111'],
  141: ['GAL', 'Galatasaray', 'Галатасарай', 'TUR', '#A90432', '#FDB912'],
  62: ['SLA', 'Slavia Prague', 'Славия', 'CZE', '#E30613', '#FFFFFF'],
  540: ['SLO', 'Slovan Bratislava', 'Слован', 'SVK', '#6CB4EE', '#FFFFFF'],
  2441: ['AEK', 'AEK Athens', 'АЕК', 'GRE', '#FFD200', '#111111'],
  413: ['LAS', 'LASK', 'ЛАСК', 'AUT', '#111111', '#FFFFFF'],
  239: ['VIK', 'Viking', 'Викинг', 'NOR', '#0B3D91', '#FFFFFF'],
  63993: ['SAB', 'Sabah', 'Сабах', 'AZE', '#1F5FAD', '#FFFFFF'],
};
// Knock-out dates are the calendar of UEFA and live in the engine (src/engine/ucl.ts, REF).
const FINAL_VENUE = 'Metropolitano, Madrid';

async function sparql(q) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (r.ok) return (await r.json()).results.bindings;
    await new Promise((res) => setTimeout(res, 4000 * (i + 1)));
  }
  throw new Error('Wikidata query failed');
}
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// ---------------------------------------------------------------- the article
await fetchPages('en', [PAGE]);
const text = cached('en', PAGE)?.text;
if (!text) throw new Error(`No article: ${PAGE}`);

const pots = [...text.matchAll(/\|\+Pot (\d)([\s\S]*?)\n\|\}/g)].map((m) => [...m[2].matchAll(/fbaicon\|(\w+)\}\} \[\[([^\]|]+)/g)].map((x) => x[2]));
if (pots.length !== 4 || pots.some((p) => p.length !== 9)) throw new Error('Pots not found');
const holderTitle = /\[\[([^\]|]+)[^\n]*Cref2\|TH/.exec(text)?.[1];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "{{Start date|2026|9|8|df=y}}" or "13 October 2026". */
function dateOf(s) {
  const a = /Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})/.exec(s);
  if (a) return `${a[1]}-${a[2].padStart(2, '0')}-${a[3].padStart(2, '0')}`;
  const b = /(\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(s);
  const m = b ? MONTHS.indexOf(b[2]) + 1 : 0;
  return m ? `${b[3]}-${String(m).padStart(2, '0')}-${b[1].padStart(2, '0')}` : null;
}
const fixtures = [];
{
  const heads = [...text.matchAll(/^===\s*Matchday (\d)\s*===\s*$/gm)];
  heads.forEach((h, i) => {
    const body = text.slice(h.index, heads[i + 1]?.index ?? text.indexOf('\n==', h.index + 10));
    for (const { body: b } of templates(body, '#invoke:Football box')) {
      const { named } = tplParams(b);
      const t1 = link(named.team1).page, t2 = link(named.team2).page;
      const day = dateOf(named.date ?? '');
      if (!day || !t1 || !t2) continue;
      fixtures.push({ md: Number(h[1]), day, h: t1, a: t2 });
    }
  });
}
if (fixtures.length !== 144) throw new Error(`Expected 144 fixtures, got ${fixtures.length}`);

// ---------------------------------------------------------------- which club is which
const titles = [...new Set(pots.flat())];
const rows = await sparql(`SELECT ?t ?tm WHERE { VALUES ?t { ${titles.map((t) => `"${esc(t)}"@en`).join(' ')} } ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. ?item wdt:P7223 ?tm }`);
const tmOf = new Map(rows.map((b) => [b.t.value, Number(b.tm.value)]));
// Titles that are redirects on Wikipedia have no sitelink of their own.
const REDIRECTS = { 'AEK Athens F.C.': 2441 };
for (const [t, tm] of Object.entries(REDIRECTS)) if (!tmOf.has(t)) tmOf.set(t, tm);
console.log('Not on Wikidata:', titles.filter((t) => !tmOf.has(t)));
const ourByTm = new Map(Object.entries(CLUB_TM).map(([id, tm]) => [tm, id]));
const idOf = new Map();
for (const t of titles) {
  const tm = tmOf.get(t);
  const id = ourByTm.get(tm) ?? EXT[tm]?.[0];
  if (!id) throw new Error(`Unknown club: ${t} (Transfermarkt ${tm})`);
  idOf.set(t, id);
}

// ---------------------------------------------------------------- squads of the outside clubs
const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const tmClubs = new Map(readCsv(path.join(RAW, 'tm', 'clubs.csv')).map((c) => [Number(c.club_id), c]));
const tmPlayers = readCsv(path.join(RAW, 'tm', 'players.csv'));
const tmById = new Map(tmPlayers.map((p) => [Number(p.player_id), p]));
const inWorld = new Map(world.players.map((p) => [p.id, p]));
const ROLE = {
  Goalkeeper: 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', 'Defensive Midfield': 'DM', 'Central Midfield': 'CM',
  'Attacking Midfield': 'AM', 'Left Midfield': 'LM', 'Right Midfield': 'RM', 'Left Winger': 'LW', 'Right Winger': 'RW', 'Centre-Forward': 'ST', 'Second Striker': 'ST',
};
const WIKI_ROLE = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' };
const photoKey = (tm) => {
  const m = /\/portrait\/header\/(\d+)-(\d+)\.(\w+)/.exec(tm?.image_url ?? '');
  return m && m[1] === tm.player_id ? (m[3] === 'jpg' ? m[2] : `${m[2]}.${m[3]}`) : null;
};
const wageFor = (ovr, mv) => Math.round((20_000 * Math.exp((ovr - 55) * 0.185) * (mv >= 2e7 ? 1 : 0.85)) / 5000) * 5000;

/** A player of an outside club in the world.json format (the same fields and formulas as build-world). */
function rate(src, club) {
  const p = { ...src, team: null, lg: null, hist: [] };
  const ovr = targetOvr(p);
  const a = ageOn(p.bd);
  const hi = p.mv >= 2e7 ? 3 : p.mv >= 8e6 ? 2 : 0;
  const room = clamp((99 - ovr) / 22, 0.25, 1);
  const pot = clamp(Math.round(a <= 21 ? ovr + (clamp((24 - a) * 1.7 + hi, 3, 14) + rnd(p.id, 'pot') * 3) * room : a <= 25 ? ovr + ((26 - a) * 0.9 + rnd(p.id, 'pot') * 2) * room : ovr), ovr, 96);
  let until = p.until ? Number(p.until.slice(0, 4)) + (Number(p.until.slice(5, 7)) > 7 ? 1 : 0) : 0;
  const real = until >= 2027;
  if (!real) until = 2027 + Math.floor(rnd(p.id, 'until') * (a >= 32 ? 2 : a <= 23 ? 4 : 3));
  const val = p.mv > 0 ? p.mv : Math.round((1e5 * Math.pow(10, (ovr - 58 - (a > 28 ? Math.min(7, a - 28) : 0)) / 10)) / 25000) * 25000;
  return {
    id: p.id, fn: p.fn, ln: p.ln, role: p.role, foot: p.foot, bd: p.bd, ...(p.approx ? { ab: 1 } : {}), c: p.ctry, ...(p.ht ? { ht: p.ht } : {}),
    ...(p.im ? { im: p.im } : {}), ...(p.num ? { n: p.num } : {}), x: club, o: ovr, p: pot, r: buildAttrs(p, ovr), v: val, w: wageFor(ovr, p.mv), u: Math.min(until, 2032),
    ...(real ? { cr: 1 } : {}), ...(p.caps ? { caps: p.caps } : {}), ...(p.ig ? { ig: p.ig } : {}),
  };
}
const fromTm = (tm) => ({
  id: Number(tm.player_id), fn: tm.first_name, ln: tm.last_name || tm.name, role: ROLE[tm.sub_position] ?? (tm.position === 'Goalkeeper' ? 'GK' : tm.position === 'Defender' ? 'CB' : tm.position === 'Attack' ? 'ST' : 'CM'),
  foot: tm.foot === 'left' ? 'L' : tm.foot === 'both' ? 'B' : 'R', bd: tm.date_of_birth.slice(0, 10), ctry: fifa(tm.country_of_citizenship), ht: Number(tm.height_in_cm) || null,
  mv: Number(tm.market_value_in_eur) || 0, until: tm.contract_expiration_date ? tm.contract_expiration_date.slice(0, 10) : null, tm: true, im: photoKey(tm),
  caps: Number(tm.international_caps) || 0, ig: Number(tm.international_goals) || 0,
});

const ext = {};
let added = 0, moved = 0;
for (const [tmId, [id, name, ru, country, primary, secondary]] of Object.entries(EXT)) {
  const c = tmClubs.get(Number(tmId));
  const dsName = c?.name;
  const ids = new Set();
  for (const tm of tmPlayers) {
    if (Number(tm.current_club_id) !== Number(tmId) || Number(tm.last_season) < 2025 || !tm.date_of_birth || ageOn(tm.date_of_birth.slice(0, 10)) > 39) continue;
    const pid = Number(tm.player_id);
    const w = inWorld.get(pid);
    if (w) {
      // Already in the world: only players listed at this club (not at one of the simulated clubs) join it.
      if (w.t || (w.x && w.x !== dsName && w.x !== name)) continue;
      if (w.x !== name) { w.x = name; moved++; }
    } else {
      const p = rate(fromTm(tm), name);
      world.players.push(p);
      inWorld.set(pid, p);
      added++;
    }
    ids.add(pid);
  }
  ext[id] = {
    id, name, ru, short: id, country, primary, secondary, tm: Number(tmId),
    stadium: c?.stadium_name?.replace(/\s+/g, ' ') ?? '', cap: Number(c?.stadium_seats) || 15000, coach: c?.coach_name || null, n: ids.size,
  };
}

// Slovan and Sabah: the snapshot lists a handful of players, the rest of the squad comes from Wikipedia.
const thin = Object.entries(ext).filter(([, e]) => e.n < 18);
const pageOf = new Map(titles.map((t) => [idOf.get(t), t]));
await fetchPages('en', thin.map(([id]) => pageOf.get(id)));
for (const [id, e] of thin) {
  const sq = enSquad(cached('en', pageOf.get(id))?.text ?? '').filter((s) => !s.loan);
  const pages = sq.map((s) => s.page).filter(Boolean);
  const bd = new Map();
  for (let i = 0; i < pages.length; i += 50) {
    const part = pages.slice(i, i + 50);
    const r = await sparql(`SELECT ?t ?bd ?ht WHERE { VALUES ?t { ${part.map((t) => `"${esc(t)}"@en`).join(' ')} } ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. OPTIONAL { ?item wdt:P569 ?bd } OPTIONAL { ?item wdt:P2048 ?ht } }`);
    for (const b of r) bd.set(b.t.value, { bd: b.bd?.value?.slice(0, 10), ht: b.ht ? Math.round(Number(b.ht.value) * (Number(b.ht.value) < 3 ? 100 : 1)) : null });
  }
  const have = world.players.filter((p) => p.x === e.name);
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  for (const s of sq) {
    const info = s.page ? bd.get(s.page) : null;
    if (!info?.bd || info.bd.startsWith('-')) continue;
    const last = norm(s.name.split(' ').slice(-1)[0]);
    if (have.some((p) => p.bd === info.bd || norm(p.ln).endsWith(last))) continue;
    // The dataset may know him under a different club: then he is matched by date of birth and surname.
    const tm = tmPlayers.find((t) => t.date_of_birth.startsWith(info.bd) && norm(t.last_name || t.name).endsWith(last));
    if (tm && inWorld.has(Number(tm.player_id))) continue;
    const parts = s.name.split(' ');
    const src = tm ? fromTm(tm) : {
      id: 9_400_000 + (Number.parseInt(id, 36) % 1000) * 100 + have.length, fn: parts.length > 1 ? parts[0] : '', ln: parts.length > 1 ? parts.slice(1).join(' ') : s.name,
      role: WIKI_ROLE[s.pos] ?? 'CM', foot: 'R', bd: info.bd, ctry: fifa(s.nat), ht: info.ht, mv: 0, until: null, tm: false, im: null, caps: 0, ig: 0,
    };
    src.num = s.no;
    // Without a valuation the level of the club's league is used (Slovak and Azerbaijani champions).
    const p = rate(src, e.name);
    if (!tm) { p.o = clamp(p.o + 2, 45, 95); p.p = Math.max(p.p, p.o); }
    world.players.push(p);
    inWorld.set(p.id, p);
    have.push(p);
    added++;
  }
  e.n = have.length;
}

// The snapshot also lists youth and loaned-out players at a club: a squad keeps the 30 most valuable,
// players who were already in the world before are never dropped.
{
  const before = new Set(JSON.parse(fs.readFileSync(WORLD, 'utf8')).players.map((p) => p.id));
  const drop = new Set();
  for (const e of Object.values(ext)) {
    const sq = world.players.filter((p) => p.x === e.name);
    const extra = sq.filter((p) => !before.has(p.id)).sort((a, b) => a.v - b.v || a.id - b.id);
    for (const p of extra.slice(0, Math.max(0, sq.length - 30))) drop.add(p.id);
  }
  world.players = world.players.filter((p) => !drop.has(p.id));
  added -= drop.size;
}

// Reputation and coach level from the squad, as for the simulated clubs.
for (const e of Object.values(ext)) {
  const sq = world.players.filter((p) => p.x === e.name);
  const tv = sq.reduce((s, p) => s + p.v, 0);
  const best = [...sq].sort((a, b) => b.o - a.o).slice(0, 14);
  const lvl = best.reduce((s, p) => s + p.o, 0) / Math.max(1, best.length);
  e.rep = clamp(Math.round(18 + 22 * Math.log10(Math.max(tv, 2e6) / 1e6)), 25, 96);
  e.coach = { name: e.coach ?? 'Главный тренер', rating: clamp(Math.round(lvl + 2 + (rnd(e.id, 'coach') - 0.5) * 8), 58, 92) };
  delete e.n;
}

const holder = idOf.get(holderTitle);
world.ucl = {
  season: 2026, holder, final: FINAL_VENUE,
  pots: pots.map((p) => p.map((t) => idOf.get(t))),
  ext: Object.values(ext),
  md: fixtures.map((f) => [f.md, f.day, idOf.get(f.h), idOf.get(f.a)]),
};
fs.writeFileSync(WORLD, JSON.stringify(world));

console.log(`Champions League 2026-27: holder ${holder}; ${fixtures.length} fixtures; players added ${added}, moved to their club ${moved}`);
for (const e of Object.values(ext)) {
  const sq = world.players.filter((p) => p.x === e.name).sort((a, b) => b.o - a.o);
  console.log(`  ${e.id} ${e.ru}: ${sq.length} players, best XI ${(sq.slice(0, 11).reduce((s, p) => s + p.o, 0) / 11).toFixed(1)}, rep ${e.rep}, GK ${sq.filter((p) => p.role === 'GK').length}`);
}

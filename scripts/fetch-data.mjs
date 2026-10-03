// Downloads the raw data snapshot into data/raw/ (cached on disk, safe to re-run).
//
// Sources:
//  1. Wikipedia (CC BY-SA 4.0): league pages of the 2026-27 season, current squads of every club,
//     squads of the 2026 FIFA World Cup. Squads are the source of truth for "who plays where".
//  2. Wikidata (CC0): dates of birth / height for players with an article.
//  3. transfermarkt-datasets by dcaribou (CC0): biography, position, market value, contract end,
//     per-game appearances of ~50 000 players. Used for ratings and prices.
//
// Pages are requested in batches of 40 titles to stay well inside the API etiquette.
// The game itself never talks to these services at runtime.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const UA = 'FootballGM-fan-project/0.1 (non-commercial data snapshot)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const LEAGUES = [
  { id: 'RPL', page: '2026–27 Russian Premier League', table: 'Template:2026–27 Russian Premier League table', prev: '2025–26 Russian Premier League' },
  { id: 'FNL', page: '2026–27 Russian First League', table: 'Template:2026–27 Russian First League table', prev: '2025–26 Russian First League' },
  { id: 'EPL', page: '2026–27 Premier League', table: 'Template:2026–27 Premier League table', prev: '2025–26 Premier League' },
  { id: 'ESP', page: '2026–27 La Liga', table: 'Template:2026–27 La Liga table', prev: '2025–26 La Liga' },
  { id: 'ITA', page: '2026–27 Serie A', table: 'Template:2026–27 Serie A table', prev: '2025–26 Serie A' },
  { id: 'GER', page: '2026–27 Bundesliga', table: 'Template:2026–27 Bundesliga table', prev: '2025–26 Bundesliga' },
  { id: 'FRA', page: '2026–27 Ligue 1', table: 'Template:2026–27 Ligue 1 table', prev: '2025–26 Ligue 1' },
];
export const EXTRA_PAGES = ['2026 FIFA World Cup', '2026 FIFA World Cup squads', '2025–26 Russian Cup', '2026–27 Russian Cup', '2025–26 UEFA Champions League', 'UEFA Euro 2028', '2030 FIFA World Cup', 'FIFA Men\'s World Ranking'];

export const fileFor = (lang, page) => path.join(RAW, 'wiki', `${lang}_${page.replace(/[^\p{L}\p{N}]+/gu, '_')}.json`);
export const cached = (lang, page) => {
  const f = fileFor(lang, page);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

async function api(host, params) {
  const u = new URL(`https://${host}/w/api.php`);
  u.search = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const j = await r.json();
        if (j.error?.code !== 'maxlag') return j;
      }
      const wait = Math.min(60, Number(r.headers.get('retry-after')) || 5 * (i + 1));
      console.log(`  ${r.status} from ${host}, waiting ${wait}s`);
      await sleep(wait * 1000);
    } catch { await sleep(3000 * (i + 1)); }
  }
  throw new Error(`Request failed: ${u}`);
}

/** Fetches wikitext (and the Russian interwiki title) of many pages; results are cached per page. */
export async function fetchPages(lang, titles) {
  const todo = [...new Set(titles)].filter((t) => !fs.existsSync(fileFor(lang, t)));
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const j = await api(`${lang}.wikipedia.org`, { action: 'query', prop: 'revisions|langlinks', rvprop: 'content', rvslots: 'main', redirects: '1', lllang: 'ru', lllimit: '500', titles: batch.join('|') });
    const alias = new Map();
    for (const n of j.query?.normalized ?? []) alias.set(n.to, n.from);
    for (const r of j.query?.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    const got = new Set();
    for (const pg of j.query?.pages ?? []) {
      const asked = batch.includes(pg.title) ? pg.title : alias.get(pg.title);
      const text = pg.revisions?.[0]?.slots?.main?.content;
      const out = text ? { title: pg.title, text, ru: pg.langlinks?.[0]?.title ?? null } : { error: 'missing' };
      for (const t of new Set([asked, pg.title].filter(Boolean))) { fs.writeFileSync(fileFor(lang, t), JSON.stringify(out)); got.add(t); }
    }
    for (const t of batch) if (!got.has(t)) fs.writeFileSync(fileFor(lang, t), JSON.stringify({ error: 'missing' }));
    console.log(`  ${lang}: ${Math.min(i + 40, todo.length)}/${todo.length} pages`);
    await sleep(1000);
  }
}

/** Club articles of a league from the `name_XXX = [[Article|Short]]` rows of its table. */
export function clubLinks(text) {
  const out = new Map();
  for (const m of text.matchAll(/\|\s*name_([\p{Lu}0-9]+)\s*=[^\n[]*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu)) {
    if (!out.has(m[1])) out.set(m[1], { code: m[1], page: m[2].trim(), short: (m[3] ?? m[2]).trim() });
  }
  return [...out.values()];
}

/** Parameters of a template call split at top-level pipes. */
export function tplParams(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if (two === ']]' || two === '}}') { depth--; cur += two; i++; continue; }
    if (s[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  parts.push(cur);
  const named = {}, pos = [];
  for (const p of parts) {
    const m = p.match(/^\s*([A-Za-z_0-9]+)\s*=([\s\S]*)$/);
    if (m) named[m[1].toLowerCase()] = m[2].trim();
    else pos.push(p.trim());
  }
  return { named, pos };
}

/** Body of every `{{name ...}}` call in a text (balanced braces). */
export function templates(text, nameRe) {
  const out = [];
  const re = new RegExp(`\\{\\{\\s*(?:${nameRe})\\s*\\|`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    let depth = 2, i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      const two = text.slice(i, i + 2);
      if (two === '{{') { depth += 2; i += 2; } else if (two === '}}') { depth -= 2; i += 2; } else i++;
    }
    out.push({ body: text.slice(start, i - 2), index: m.index });
  }
  return out;
}

export function link(s) {
  const m = (s ?? '').match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (m) return { page: m[1].trim(), text: (m[2] ?? m[1]).replace(/\s*\([^)]*\)\s*$/, '').trim() };
  return { page: null, text: (s ?? '').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/<[^>]+>/g, '').trim() };
}

/** First-team squad of an English club article. */
export function enSquad(text) {
  const i = text.search(/\{\{\s*(fs|football squad) start/i);
  if (i < 0) return [];
  const rest = text.slice(i);
  const j = rest.search(/\{\{\s*(fs|football squad) end/i);
  const blk = j > 0 ? rest.slice(0, j) : rest.slice(0, 8000);
  return templates(blk, 'fs player|football squad player').map(({ body }) => {
    const { named } = tplParams(body);
    const l = link(named.name);
    return { no: named.no ? Number(named.no) || null : null, nat: (named.nat ?? '').trim(), pos: (named.pos ?? '').toUpperCase().trim(), name: l.text, page: l.page, loan: /on loan from/i.test(named.other ?? '') ? link(named.other).page ?? true : null };
  }).filter((p) => p.name);
}

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  await pipeline(r.body, zlib.createGunzip(), fs.createWriteStream(dest + '.tmp'));
  fs.renameSync(dest + '.tmp', dest);
  console.log('  saved', path.basename(dest), (fs.statSync(dest).size / 1e6).toFixed(1), 'MB');
}

async function main() {
  fs.mkdirSync(path.join(RAW, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(RAW, 'tm'), { recursive: true });
  console.log('1/4 Open dataset (CC0)');
  const TM = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data';
  for (const f of ['players', 'clubs', 'competitions', 'national_teams', 'games', 'appearances']) {
    await download(`${TM}/${f}.csv.gz`, path.join(RAW, 'tm', `${f}.csv`));
  }

  console.log('2/4 Leagues and clubs (Wikipedia)');
  await fetchPages('en', [...LEAGUES.flatMap((l) => [l.page, l.table, l.prev]), ...EXTRA_PAGES]);
  const leagues = {};
  for (const lg of LEAGUES) {
    let clubs = clubLinks(cached('en', lg.page)?.text ?? '');
    if (clubs.length < 12) clubs = clubLinks(cached('en', lg.table)?.text ?? '');
    leagues[lg.id] = clubs;
  }
  await fetchPages('en', Object.values(leagues).flat().map((c) => c.page));
  const titles = new Set();
  for (const id in leagues) {
    for (const c of leagues[id]) {
      const w = cached('en', c.page);
      if (!w?.text) { console.log('  ! no article', c.page); continue; }
      c.title = w.title;
      c.ru = w.ru;
      for (const p of enSquad(w.text)) if (p.page) titles.add(p.page);
    }
    console.log(`  ${id}: ${leagues[id].length} clubs`);
  }
  await fetchPages('ru', [...leagues.RPL, ...leagues.FNL].map((c) => c.ru).filter(Boolean));
  fs.writeFileSync(path.join(RAW, 'leagues.json'), JSON.stringify(leagues, null, 1));

  console.log('3/4 World Cup squads');
  const wc = cached('en', '2026 FIFA World Cup squads');
  for (const { body } of templates(wc?.text ?? '', 'nat fs g player')) {
    const l = link(tplParams(body).named.name);
    if (l.page) titles.add(l.page);
  }

  console.log(`4/4 Wikidata: birth dates for ${titles.size} players`);
  const wdFile = path.join(RAW, 'wikidata.json');
  const wd = fs.existsSync(wdFile) ? JSON.parse(fs.readFileSync(wdFile, 'utf8')) : {};
  const todo = [...titles].filter((t) => !(t in wd));
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const j = await api('www.wikidata.org', { action: 'wbgetentities', sites: 'enwiki', titles: batch.join('|'), props: 'claims|sitelinks|labels', languages: 'ru', sitefilter: 'enwiki', formatversion: '1' });
    const seen = new Set();
    for (const e of Object.values(j.entities ?? {})) {
      const title = e.sitelinks?.enwiki?.title;
      if (!title) continue;
      const val = (pid) => e.claims?.[pid]?.[0]?.mainsnak?.datavalue?.value;
      const bd = val('P569')?.time;
      let ht = val('P2048') ? Number(val('P2048').amount) : null;
      if (ht && ht < 3) ht = ht * 100;
      wd[title] = { bd: bd ? bd.slice(1, 11) : null, ht: ht && ht > 140 && ht < 215 ? Math.round(ht) : null, ru: e.labels?.ru?.value ?? null };
      seen.add(title);
    }
    for (const t of batch) if (!seen.has(t)) wd[t] = wd[t] ?? null;
    fs.writeFileSync(wdFile, JSON.stringify(wd));
    if ((i / 50) % 10 === 0) console.log(`  ${Math.min(i + 50, todo.length)}/${todo.length}`);
    await sleep(700);
  }
  console.log('Done. Now run: npm run data:build');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

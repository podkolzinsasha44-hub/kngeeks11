import { useMemo } from 'react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { LEAGUES, LEAGUE_IDS, statKey } from '../../engine/leagues';
import { FORMATIONS, teamPower } from '../../engine/lineup';
import { seasonOdds } from '../../engine/projection';
import { sortedTeams } from '../../engine/standings';
import { avgRating, leaders } from '../../engine/stats';
import type { Game, League, LeagueId } from '../../engine/types';
import { club, rosterOf, UCL } from '../../engine/ucl';
import { UCL_TABS, UclView, uclDefaultTab, type UclTab } from './Ucl';
import { Button, Card, Chips, cx, Empty, Pill, SectionTitle, Segmented } from '../components/kit';
import { Screen } from '../components/shell';
import { PlayerRow, TeamBadge } from '../components/media';
import { clubLabel, dateShort, dispName, dowRu, money, ROLE_RU, seasonLabel } from '../format';
import { nationName } from '../../engine/intl';
import { useKeep } from '../keep';

type TabId = 'table' | 'games' | 'players' | 'cup';

export function LeagueScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [lg, setLg] = useKeep<LeagueId | typeof UCL>('league.lg', (params.lg as LeagueId) ?? L.teams[L.user].lg);
  const [tab, setTab] = useKeep<TabId>('league.tab', (params.tab as TabId) ?? 'table');
  const [uclTab, setUclTab] = useKeep<UclTab>('ucl.tab', () => uclDefaultTab(L));
  const chips = <Chips value={lg} onChange={setLg} options={[{ v: UCL, label: '⭐ ЛЧ' }, ...LEAGUE_IDS.map((id) => ({ v: id, label: LEAGUES[id].short }))]} />;
  if (lg === UCL) {
    const holder = L.ucl?.holder ? club(L, L.ucl.holder) : null;
    return (
      <Screen title="Лига чемпионов" subtitle={`Сезон ${seasonLabel(L.ucl?.season ?? L.season)}${L.ucl?.champion ? ` · победитель: ${club(L, L.ucl.champion).ru}` : holder ? ` · обладатель: ${holder.ru}` : ''}`}
        headerExtra={<div className="px-4 pb-2 flex flex-col gap-2">{chips}{L.ucl && <Segmented value={uclTab} onChange={setUclTab} options={UCL_TABS} />}</div>}>
        <UclView L={L} tab={uclTab} />
      </Screen>
    );
  }
  const russian = LEAGUES[lg].country === 'RUS';
  return (
    <Screen title={LEAGUES[lg].name} subtitle={`Сезон ${seasonLabel(L.season)}${L.comps[lg].champion && L.teams[L.comps[lg].champion] ? ` · чемпион: ${L.teams[L.comps[lg].champion].ru}` : ''}`}
      headerExtra={<div className="px-4 pb-2 flex flex-col gap-2">{chips}<Segmented value={tab} onChange={setTab} options={[{ v: 'table', label: 'Таблица' }, { v: 'games', label: 'Матчи' }, { v: 'players', label: 'Игроки' }, { v: 'cup', label: 'Кубок' }]} /></div>}>
      {tab === 'table' && <Table L={L} lg={lg} />}
      {tab === 'games' && <Games L={L} lg={lg} />}
      {tab === 'players' && <Leaders L={L} lg={lg} />}
      {tab === 'cup' && (russian ? <CupView L={L} /> : <Empty icon="🏆" title="Кубок России" text="В игре разыгрывается Кубок России. Национальные кубки других стран не моделируются." />)}
    </Screen>
  );
}

function Table({ L, lg }: { L: League; lg: LeagueId }) {
  const push = useNav((s) => s.push);
  const table = sortedTeams(L, lg);
  const cfg = LEAGUES[lg];
  const odds = useMemo(() => (L.comps[lg].phase === 'regular' ? seasonOdds(L, lg, 200) : null), [L.date, lg]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = table.length;
  const up = cfg.up ? cfg.promote ?? 0 : 1, upPO = cfg.up ? cfg.promotePO ?? 0 : cfg.top - 1;
  const zone = (i: number) => (i < up ? '#e8c26a' : i < up + upPO ? '#3ddc97' : i >= n - cfg.relegate && cfg.relegate ? '#ff5a5f' : i >= n - cfg.relegate - cfg.playoff && cfg.playoff ? '#ffb547' : 'transparent');
  return (
    <>
      <Card pad={false} className="mt-1 overflow-hidden">
        <div className="grid grid-cols-[26px_1fr_26px_26px_26px_26px_38px_34px] gap-x-1 items-center px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted border-b border-white/5">
          <span>#</span><span>Клуб</span><span className="text-center">И</span><span className="text-center">В</span><span className="text-center">Н</span><span className="text-center">П</span><span className="text-center">Мячи</span><span className="text-right">О</span>
        </div>
        {table.map((t, i) => (
          <div key={t.id} onClick={() => push('team', { id: t.id })} className={cx('press grid grid-cols-[26px_1fr_26px_26px_26px_26px_38px_34px] gap-x-1 items-center px-3 min-h-[46px] border-b border-white/5 last:border-0 tnum text-[14px]', t.id === L.user && 'bg-white/[0.07]')}>
            <span className="num text-[14px] pl-1.5 border-l-[3px]" style={{ borderColor: zone(i) }}>{i + 1}</span>
            <span className="flex items-center gap-2 min-w-0"><TeamBadge team={t} size={24} /><span className={cx('truncate', t.id === L.user && 'font-semibold')}>{t.ru}</span></span>
            <span className="text-center text-muted">{t.rec.gp}</span><span className="text-center">{t.rec.w}</span><span className="text-center">{t.rec.d}</span><span className="text-center">{t.rec.l}</span>
            <span className="text-center text-muted text-[12.5px]">{t.rec.gf}:{t.rec.ga}</span>
            <span className="text-right num text-[16px]">{t.rec.pts}</span>
          </div>
        ))}
      </Card>
      <div className="flex gap-3 flex-wrap text-[11.5px] text-muted mt-2.5 px-1">
        <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#e8c26a' }} />{cfg.up ? `выход ${LEAGUES[cfg.up].into}` : 'чемпион'}</span>
        {upPO > 0 && <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#3ddc97' }} />{cfg.up ? 'переходные матчи за выход' : `топ-${cfg.top}`}</span>}
        {cfg.playoff > 0 && <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#ffb547' }} />переходные матчи за место</span>}
        {cfg.relegate > 0 && <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#ff5a5f' }} />вылет{cfg.down ? ` ${LEAGUES[cfg.down].into}` : ''}</span>}
      </div>
      {lg === 'L2A' && <div className="text-[11.5px] text-faint mt-1.5 px-1">В жизни дивизион А играет двумя этапами в группах «Золото» и «Серебро»; в игре это одна таблица из 17 клубов с теми же местами на выход и вылет.</div>}
      {lg === 'L2B' && <div className="text-[11.5px] text-faint mt-1.5 px-1">Победитель группы выходит во Вторую лигу А. В игре это единственная группа дивизиона Б, поэтому вниз из неё никто не вылетает.</div>}
      {cfg.country !== 'RUS' && <div className="text-[11.5px] text-faint mt-1.5 px-1">Вылет и повышение в зарубежных лигах не моделируются: состав участников постоянный.</div>}
      {odds && (
        <>
          <SectionTitle>Шансы на титул</SectionTitle>
          <Card className="flex flex-col gap-2">
            {table.filter((t) => odds[t.id].title >= 0.01).sort((a, b) => odds[b.id].title - odds[a.id].title).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[13.5px]">
                <span className="w-[110px] truncate">{t.ru}</span>
                <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${odds[t.id].title * 100}%`, background: t.id === L.user ? 'var(--accent)' : '#8b98ae' }} /></div>
                <span className="num w-10 text-right">{Math.round(odds[t.id].title * 100)}%</span>
              </div>
            ))}
            <div className="text-[11.5px] text-muted">Остаток сезона сыгран 200 раз по той же формуле ожидаемых голов, что и в матчах, с текущими составами клубов.</div>
          </Card>
        </>
      )}
    </>
  );
}

export function GameRow({ L, g }: { L: League; g: Game }) {
  const openModal = useNav((s) => s.openModal);
  const mine = g.h === L.user || g.a === L.user;
  return (
    <div onClick={() => g.played && openModal('match', { id: g.id })} className={cx('grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 min-h-[46px] border-b border-white/5 last:border-0 text-[14px]', g.played && 'press', mine && 'bg-white/[0.06]')}>
      <span className="flex items-center justify-end gap-2 min-w-0"><span className="truncate text-right">{club(L, g.h).ru}</span><TeamBadge team={club(L, g.h)} size={22} /></span>
      {g.played
        ? <span className="num text-[16px] w-[64px] text-center">{g.hs}:{g.as}{g.pen ? <span className="text-[10px] text-muted block -mt-1">пен. {g.pen[0]}:{g.pen[1]}</span> : g.et ? <span className="text-[10px] text-muted block -mt-1">д.в.</span> : null}</span>
        : <span className="text-[11.5px] text-muted w-[64px] text-center leading-tight">{dowRu(g.day)}<br />{dateShort(g.day)}</span>}
      <span className="flex items-center gap-2 min-w-0"><TeamBadge team={club(L, g.a)} size={22} /><span className="truncate">{club(L, g.a).ru}</span></span>
    </div>
  );
}

function Games({ L, lg }: { L: League; lg: LeagueId }) {
  const games = useMemo(() => L.games.filter((g) => g.comp === lg), [L.games.length, lg, L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const rounds = Math.max(1, ...games.map((g) => Number(g.rd) || 1));
  const cur = Math.min(rounds, Math.max(1, ...games.filter((g) => g.played).map((g) => Number(g.rd))) + (games.some((g) => !g.played) ? 0 : 0));
  const next = games.find((g) => !g.played);
  const [rd, setRd] = useKeep('league.rd', Number(next?.rd ?? cur));
  const list = games.filter((g) => Number(g.rd) === rd).sort((a, b) => (a.day < b.day ? -1 : 1));
  return (
    <>
      <div className="flex items-center justify-between mt-1 mb-2">
        <button className="press w-11 h-11 glass rounded-xl" onClick={() => setRd(Math.max(1, rd - 1))}>‹</button>
        <div className="font-display uppercase tracking-wide text-[17px]">{rd}-й тур</div>
        <button className="press w-11 h-11 glass rounded-xl" onClick={() => setRd(Math.min(rounds, rd + 1))}>›</button>
      </div>
      <Card pad={false} className="overflow-hidden">{list.map((g) => <GameRow key={g.id} L={L} g={g} />)}</Card>
    </>
  );
}

function Leaders({ L, lg }: { L: League; lg: LeagueId }) {
  const [stat, setStat] = useKeep<'g' | 'a' | 'ga' | 'rt' | 'cs'>('league.stat', 'g');
  const key = statKey(L.season, lg);
  const list = useMemo(() => leaders(L, key, stat, 25), [L.date, key, stat]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="mt-1"><Chips value={stat} onChange={setStat} options={[{ v: 'g', label: 'Голы' }, { v: 'a', label: 'Передачи' }, { v: 'ga', label: 'Гол + пас' }, { v: 'rt', label: 'Оценка' }, { v: 'cs', label: 'Сухие матчи' }]} /></div>
      {list.length ? (
        <Card pad={false} className="mt-3 overflow-hidden">
          {list.map(({ p, v }, i) => <PlayerRow key={p.id} dense p={p} sub={<>{i + 1}. {clubLabel(L, p)} · {ROLE_RU[p.role]} · {p.stats[key].gp} матч.</>} right={<span className="num text-[19px] mr-2 accent-text">{stat === 'rt' ? v.toFixed(2) : v}</span>} />)}
        </Card>
      ) : <Empty title="Сезон ещё не начался" />}
    </>
  );
}

function CupView({ L }: { L: League }) {
  const cup = L.cups.CUP, po = L.cups.PO;
  if (!cup) return <Empty icon="🏆" title="Кубок ещё не разыгрывается" />;
  const games = new Map(L.games.map((g) => [g.id, g]));
  return (
    <>
      {cup.champion && <Card className="mt-1 text-center"><div className="text-3xl">🏆</div><div className="font-display uppercase text-[18px] mt-1">{L.teams[cup.champion].ru}</div><div className="text-muted text-[13px]">обладатель Кубка России {seasonLabel(cup.season)}</div></Card>}
      {[...cup.rounds.keys()].reverse().map((r) => {
        const ties = cup.ties.filter((t) => t.round === r);
        if (!ties.length) return null;
        return (
          <div key={r}>
            <SectionTitle right={<span className="text-[12px] text-muted">{dateShort(cup.rounds[r].day)}</span>}>{cup.rounds[r].name}</SectionTitle>
            <Card pad={false} className="overflow-hidden">{ties.map((t) => { const g = games.get(t.games[0]); return g ? <GameRow key={t.id} L={L} g={g} /> : null; })}</Card>
          </div>
        );
      })}
      {po && (
        <>
          <SectionTitle>Переходные матчи</SectionTitle>
          <Card pad={false} className="overflow-hidden">{po.ties.flatMap((t) => t.games).map((id) => { const g = games.get(id); return g ? <GameRow key={id} L={L} g={g} /> : null; })}</Card>
        </>
      )}
      <div className="text-[11.5px] text-faint mt-2 px-1">Формат — модель настоящего: клубы Второй лиги и слабейшие клубы Первой лиги начинают в августе, остальные клубы Первой лиги вступают во 2-м раунде, клубы РПЛ — в 1/16 финала. Один матч на выбывание, дома играет клуб из лиги ниже.</div>
    </>
  );
}

export function TeamScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const push = useNav((s) => s.push);
  const t = club(L, String(params.id));
  if (!t) return <Screen title="Клуб"><div /></Screen>;
  const sq = rosterOf(L, t.id).sort((a, b) => b.ovr - a.ovr);
  const roles = FORMATIONS[t.lineup.form];
  const games = L.games.filter((g) => (g.h === t.id || g.a === t.id)).sort((a, b) => (a.day < b.day ? -1 : 1));
  const key = statKey(L.season, t.ext ? UCL : t.lg);
  const sub = t.ext ? `${nationName(t.country)} · Лига чемпионов` : `${LEAGUES[t.lg].short} · ${sortedTeams(L, t.lg).findIndex((x) => x.id === t.id) + 1}-е место`;
  return (
    <Screen title={t.ru} subtitle={sub}>
      <Card className="mt-1 relative overflow-hidden" pad={false}>
        <div className="absolute inset-0 opacity-60" style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${t.primary} 55%, transparent), transparent 65%)` }} />
        <div className="relative p-4 flex items-center gap-3">
          <TeamBadge team={t} size={56} />
          <div className="flex-1 min-w-0">
            <div className="font-display uppercase text-[22px] leading-tight truncate">{t.ru}</div>
            <div className="text-[12.5px] text-ink/80 truncate">Тренер: {t.coach.name} · {t.stadium} ({t.cap.toLocaleString('ru-RU')})</div>
          </div>
        </div>
        <div className="relative grid grid-cols-4 gap-2 px-4 pb-4">
          <Mini l="Сила" v={teamPower(L, t).toFixed(0)} /><Mini l="Схема" v={t.lineup.form} />{t.ext ? <Mini l="Состав" v={`${sq.length}`} /> : <Mini l="Бюджет" v={money(t.budget, 0)} />}<Mini l="Титулы" v={`${t.titles}🏆 ${t.cups}🥇`} />
        </div>
      </Card>
      {t.lg === 'U17' && <Button variant="primary" full className="mt-3" onClick={() => push('youth', { id: t.id })}>Редактировать состав и название</Button>}
      {t.trophies.length > 0 && <div className="flex gap-1.5 flex-wrap mt-2">{t.trophies.slice(-6).map((x, i) => <Pill key={i} color="#e8c26a">{x}</Pill>)}</div>}
      <SectionTitle>Стартовый состав ({t.lineup.form})</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        {t.lineup.xi.map((id, i) => L.players[id] && <PlayerRow key={id} dense p={L.players[id]} sub={<>{ROLE_RU[roles[i]]} · {L.players[id].stats[key]?.gp ?? 0} матч., {L.players[id].stats[key]?.g ?? 0} гол., оценка {avgRating(L.players[id].stats[key]).toFixed(1)}</>} />)}
      </Card>
      <SectionTitle>Остальные игроки</SectionTitle>
      <Card pad={false} className="overflow-hidden">{sq.filter((p) => !t.lineup.xi.includes(p.id)).map((p) => <PlayerRow key={p.id} dense p={p} right={<span className="num text-[12.5px] text-muted mr-1">{money(p.val)}</span>} />)}</Card>
      <SectionTitle>Матчи</SectionTitle>
      <Card pad={false} className="overflow-hidden">{games.slice(Math.max(0, games.findIndex((g) => !g.played) - 4)).slice(0, 10).map((g) => <GameRow key={g.id} L={L} g={g} />)}</Card>
      <div className="text-muted text-[12px] mt-2 px-1">{dispName(sq[0] ?? L.players[t.lineup.xi[0]])} — сильнейший игрок клуба.</div>
    </Screen>
  );
}

function Mini({ l, v }: { l: string; v: string }) {
  return <div className="rounded-xl bg-black/25 px-2 py-1.5 text-center"><div className="num text-[15px] leading-tight truncate">{v}</div><div className="text-[9.5px] uppercase tracking-wider text-muted">{l}</div></div>;
}

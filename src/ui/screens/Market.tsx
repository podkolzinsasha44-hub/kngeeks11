import { useMemo } from 'react';
import { useGame, useL } from '../../store/game';
import { transferAdvice, type Chance, type Pick } from '../../engine/advice';
import { offerView } from '../../engine/sale';
import { useNav } from '../../store/nav';
import { LEAGUES, LEAGUE_IDS, windowOpen } from '../../engine/leagues';
import { foreignLeft, respondOffer } from '../../engine/transfers';
import { teamPower } from '../../engine/lineup';
import type { League, Player, Pos } from '../../engine/types';
import { Button, Card, Chips, cx, Empty, Pill, SectionTitle, Segmented } from '../components/kit';
import { Screen } from '../components/shell';
import { PlayerRow, TeamBadge } from '../components/media';
import { dateShort, dispName, money, playerAge, POS_RU, ROLE_RU } from '../format';
import { surname } from '../components/PlayerCard';
import { useKeep } from '../keep';

type TabId = 'search' | 'advice' | 'free' | 'offers' | 'list' | 'log';

export function Market({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useKeep<TabId>('market.tab', (params.tab as TabId) ?? 'search');
  const me = L.teams[L.user];
  const incoming = L.offers.filter((o) => o.to === L.user && o.status === 'pending');
  const fl = foreignLeft(L, me);
  return (
    <Screen
      title="Рынок"
      subtitle={`${windowOpen(L) ? 'Окно открыто' : 'Окно закрыто'} · бюджет ${money(me.budget)}${fl != null ? ` · мест для легионеров: ${Math.max(0, fl)}` : ''}`}
      headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'search', label: 'Поиск' }, { v: 'advice', label: 'Советы' }, { v: 'free', label: 'Агенты' }, { v: 'offers', label: `Сделки${incoming.length ? ` · ${incoming.length}` : ''}` }, { v: 'list', label: '★' }, { v: 'log', label: 'Лента' }]} /></div>}
    >
      {tab === 'search' && <Search L={L} free={false} />}
      {tab === 'advice' && <AdviceTab L={L} />}
      {tab === 'free' && <Search L={L} free />}
      {tab === 'offers' && <Offers L={L} />}
      {tab === 'list' && <Shortlist L={L} />}
      {tab === 'log' && <Log L={L} />}
    </Screen>
  );
}

function Search({ L, free }: { L: League; free: boolean }) {
  const me = L.teams[L.user];
  const [pos, setPos] = useKeep<'all' | Pos>('market.pos', 'all');
  const [lg, setLg] = useKeep<string>('market.lg', 'all');
  const [sort, setSort] = useKeep<'ovr' | 'pot' | 'val' | 'age'>('market.sort', 'ovr');
  const [q, setQ] = useKeep('market.q', '');
  const [afford, setAfford] = useKeep('market.afford', false);
  const [u23, setU23] = useKeep('market.u23', false);
  const list = useMemo(() => {
    const out: Player[] = [];
    const s = q.trim().toLowerCase();
    for (const id in L.players) {
      const p = L.players[id];
      if (p.team === L.user || p.st === 'RET') continue;
      if (free ? p.st !== 'FA' : p.st !== 'ACT') continue;
      if (pos !== 'all' && p.pos !== pos) continue;
      if (!free && lg !== 'all' && (lg === 'ext' ? !!p.team : !p.team || L.teams[p.team].lg !== lg)) continue;
      if (afford && p.val > me.budget) continue;
      if (u23 && playerAge(L, p) > 23) continue;
      if (s && !`${p.fn} ${p.ln} ${p.ru ?? ''}`.toLowerCase().includes(s)) continue;
      out.push(p);
    }
    const by = { ovr: (p: Player) => -p.ovr, pot: (p: Player) => -p.pot, val: (p: Player) => -p.val, age: (p: Player) => playerAge(L, p) }[sort];
    return out.sort((a, b) => by(a) - by(b) || b.ovr - a.ovr);
  }, [L, L.date, pos, lg, sort, q, afford, u23, free, me.budget]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя игрока" className="w-full h-11 rounded-2xl glass px-4 mt-1 mb-2.5 outline-none placeholder:text-faint" />
      <Chips value={pos} onChange={setPos} options={[{ v: 'all', label: 'Все амплуа' }, ...(['G', 'D', 'M', 'F'] as Pos[]).map((v) => ({ v, label: POS_RU[v] }))]} />
      {!free && <div className="mt-2"><Chips value={lg} onChange={setLg} options={[{ v: 'all', label: 'Все лиги' }, ...LEAGUE_IDS.map((id) => ({ v: id as string, label: LEAGUES[id].short })), { v: 'ext', label: 'Другие лиги' }]} /></div>}
      <div className="mt-2"><Chips value={sort} onChange={setSort} options={[{ v: 'ovr', label: 'Рейтинг' }, { v: 'pot', label: 'Потенциал' }, { v: 'val', label: 'Стоимость' }, { v: 'age', label: 'Моложе' }]} /></div>
      <div className="flex gap-2 mt-2">
        {!free && <button onClick={() => setAfford(!afford)} className={cx('press h-9 px-3.5 rounded-full text-[13.5px] font-medium border', afford ? 'bg-white text-[#05070d] border-white' : 'glass')}>По карману</button>}
        <button onClick={() => setU23(!u23)} className={cx('press h-9 px-3.5 rounded-full text-[13.5px] font-medium border', u23 ? 'bg-white text-[#05070d] border-white' : 'glass')}>До 23 лет</button>
        <div className="flex-1 text-right text-[12.5px] text-muted self-center">{list.length} игроков</div>
      </div>
      {list.length ? (
        <Card pad={false} className="mt-3 overflow-hidden">
          {list.slice(0, 80).map((p) => <PlayerRow key={p.id} p={p} showClub right={<span className="num text-[13px] text-muted mr-1">{money(p.val)}</span>} />)}
        </Card>
      ) : <Empty title="Никого не нашлось" text="Измените фильтры." />}
      {list.length > 80 && <div className="text-center text-[12.5px] text-muted mt-3">Показаны первые 80. Уточните фильтры, чтобы увидеть остальных.</div>}
    </>
  );
}

function Offers({ L }: { L: League }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const incoming = L.offers.filter((o) => o.to === L.user && o.status === 'pending');
  const talks = Object.values(L.negotiations).filter((n) => n.team === L.user && n.status === 'open');
  const mine = L.offers.filter((o) => o.from === L.user && o.status === 'countered');
  if (!incoming.length && !talks.length && !mine.length) return <Empty icon="📭" title="Сделок нет" text="Здесь появятся предложения клубов по вашим игрокам и ваши переговоры. Выставьте игрока на трансфер, чтобы предложений стало больше." />;
  return (
    <>
      {incoming.length > 0 && <SectionTitle className="!mt-2">Предложения по вашим игрокам</SectionTitle>}
      {incoming.map((o) => {
        const p = L.players[o.player], from = L.teams[o.from];
        const v = offerView(L, o);
        const [title, color] = OFFER_VERDICT[v.verdict === 'reject' && v.keep ? 'keep' : v.verdict];
        return (
          <Card key={o.id} className="mb-2.5">
            <div className="flex items-center gap-3" onClick={() => push('player', { id: p.id })}>
              <TeamBadge team={from} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{dispName(p)} → «{from.ru}»</div>
                <div className="text-[12.5px] text-muted">оценка рынка {money(p.val)} · до {dateShort(o.expires)}</div>
              </div>
              <div className="num text-[20px]" style={{ color }}>{money(o.fee)}</div>
            </div>
            <div className="mt-3 rounded-2xl px-3 py-2.5" style={{ background: `color-mix(in oklab, ${color} 10%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold" style={{ color }}>🧭 {title}</span>
                <span className="text-[12px] text-muted">{v.label}</span>
              </div>
              <div className="text-[13.5px] mt-1 leading-snug">{v.text}</div>
              <div className="text-[12px] text-muted mt-1 leading-snug">{v.keep ? 'Замены нет' : <>Не дешевле <span className="num text-ink">{money(v.min)}</span> · хорошая цена <span className="num text-ink">{money(v.good)}</span></>} · {v.why.slice(0, 2).join('; ')}</div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button full variant={v.verdict === 'accept' ? 'good' : 'glass'} size="sm" onClick={() => toast(act(() => respondOffer(L, o.id, 'accept')), 'good')}>Принять</Button>
              {v.ask != null && <Button full variant={v.verdict === 'accept' ? 'glass' : 'primary'} size="sm" onClick={() => toast(act(() => respondOffer(L, o.id, 'counter', v.ask!)))}>Просить {money(v.ask)}</Button>}
              <Button full variant="danger" size="sm" onClick={() => toast(act(() => respondOffer(L, o.id, 'reject')))}>Отказать</Button>
            </div>
          </Card>
        );
      })}
      {talks.length > 0 && <SectionTitle>Переговоры о контракте</SectionTitle>}
      {talks.map((n) => {
        const p = L.players[n.player];
        return (
          <Card key={n.player} className="mb-2.5 flex items-center gap-3" onClick={() => push('negotiate', { id: p.id })}>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{dispName(p)}</div>
              <div className="text-[12.5px] text-muted">{n.kind === 'extend' ? 'продление' : n.kind === 'transfer' ? `переход за ${money(n.fee ?? 0)}` : 'свободный агент'} · запрос {money(n.ask.wage)} × {n.ask.years}</div>
            </div>
            <Pill color="#3ddc97">продолжить</Pill>
          </Card>
        );
      })}
      {mine.length > 0 && <SectionTitle>Встречные условия клубов</SectionTitle>}
      {mine.map((o) => {
        const p = L.players[o.player];
        return (
          <Card key={o.id} className="mb-2.5 flex items-center gap-3" onClick={() => push('player', { id: p.id })}>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{dispName(p)}</div>
              <div className="text-[12.5px] text-muted">вы предлагали {money(o.fee)} · клуб хочет {money(o.ask ?? 0)}</div>
            </div>
          </Card>
        );
      })}
    </>
  );
}

function Shortlist({ L }: { L: League }) {
  const ps = L.scouting.shortlist.map((id) => L.players[id]).filter(Boolean);
  if (!ps.length) return <Empty icon="⭐" title="Список пуст" text="Отмечайте игроков звёздочкой в профиле, чтобы следить за ними." />;
  return <Card pad={false} className="mt-1 overflow-hidden">{ps.map((p) => <PlayerRow key={p.id} p={p} showClub right={<span className="num text-[13px] text-muted mr-1">{money(p.val)}</span>} />)}</Card>;
}

function Log({ L }: { L: League }) {
  const push = useNav((s) => s.push);
  const [mine, setMine] = useKeep('market.mine', false);
  const list = L.transfers.filter((t) => !mine || t.user).slice(0, 120);
  return (
    <>
      <div className="mt-1"><Segmented value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ v: 'all', label: 'Все переходы' }, { v: 'mine', label: 'Мои сделки' }]} /></div>
      {list.length ? (
        <Card pad={false} className="mt-3 overflow-hidden">
          {list.map((t) => (
            <div key={t.id} onClick={() => push('player', { id: t.player })} className="press px-4 py-2.5 border-b border-white/5 last:border-0 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-medium truncate">{t.name}</div>
                <div className="text-[12px] text-muted truncate">{dateShort(t.date)} · {t.from ? L.teams[t.from]?.ru : 'св. агент / другая лига'} → {L.teams[t.to]?.ru}</div>
              </div>
              {t.grade && <Pill color={t.grade === 'A' ? '#3ddc97' : t.grade === 'D' ? '#ff5a5f' : undefined}>{t.grade}</Pill>}
              <div className="num text-[15px]">{t.fee ? money(t.fee) : 'бесплатно'}</div>
            </div>
          ))}
        </Card>
      ) : <Empty icon="🔁" title="Переходов пока нет" />}
    </>
  );
}

const CHANCE: Record<Chance, [string, string]> = { high: ['охотно перейдёт', '#3ddc97'], mid: ['готов обсудить', '#ffb547'], low: ['сомневается', '#ff8a5f'] };

/** Who to buy: computed by the engine from the price, the wage, the player's will and the power of the eleven. */
function AdviceTab({ L }: { L: League }) {
  const ver = useGame((s) => s.ver);
  const adv = useMemo(() => transferAdvice(L), [L, ver]);
  const me = L.teams[L.user];
  const weak = adv.weak;
  const weakP = weak?.player != null ? L.players[weak.player] : null;
  const sections: [string, string, Pick[], 'now' | 'future'][] = [
    ['Усилят состав сейчас', 'Наибольший прирост силы одиннадцати, если игрок выйдет на своё место.', adv.now, 'now'],
    ['Выгодные варианты', 'Больше всего силы за каждый потраченный евро (трансфер и две зарплаты).', adv.value, 'now'],
    ['Таланты на вырост', 'До 21 года, потенциал выше среднего уровня вашего старта.', adv.future, 'future'],
    ['Свободные агенты', 'Без платы за трансфер — только контракт, можно подписать и вне окна.', adv.free, 'now'],
  ];
  return (
    <>
      <Card className="mt-1">
        <div className="flex items-start gap-3">
          <div className="text-[26px] leading-none">🧭</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px]">{weak ? <>Слабее всего: {ROLE_RU[weak.role]} — {weakP ? dispName(weakP) : 'место пустует'} ({Math.round(weak.rating)})</> : 'Состав не выбран'}</div>
            <div className="text-[13px] text-muted mt-0.5 leading-snug">
              Бюджет {money(adv.budget)} · свободно в зарплатах {money(Math.max(0, adv.wageRoom))} в год. Сила сейчас {teamPowerText(L)}.
              {!adv.windowOpen && ' Окно закрыто: покупка у клубов — когда оно откроется, свободных агентов можно подписать сразу.'}
            </div>
          </div>
        </div>
      </Card>
      {sections.map(([title, hint, list, kind]) => (
        <div key={title}>
          <SectionTitle>{title}</SectionTitle>
          <div className="text-[12px] text-muted -mt-1.5 mb-2 px-1">{hint}</div>
          {list.length ? (
            <Card pad={false} className="overflow-hidden">
              {list.map((x) => <AdviceRow key={x.p.id} L={L} x={x} kind={kind} />)}
            </Card>
          ) : <div className="text-[13px] text-muted px-1">{kind === 'future' ? 'Подходящих талантов по карману сейчас нет.' : 'Сейчас нет вариантов, которые усилят состав и подходят по деньгам.'}</div>}
        </div>
      ))}
      <div className="text-[11.5px] text-faint mt-4 px-1 leading-snug">
        Советы считает тот же движок, что играет матчи: прирост — это изменение силы одиннадцати (как в шансах на матч), цена — сколько запросит клуб у «{me.ru}», зарплата — с чего игрок начнёт переговоры. Игроков, которые не хотят к вам переходить или не помещаются в бюджет, здесь нет.
      </div>
    </>
  );
}

const teamPowerText = (L: League) => {
  const t = L.teams[L.user];
  return teamPower(L, t).toFixed(1);
};

function AdviceRow({ L, x, kind }: { L: League; x: Pick; kind: 'now' | 'future' }) {
  const out = x.replaces != null ? L.players[x.replaces] : null;
  const [label, color] = CHANCE[x.chance];
  const sub = (
    <>
      <span className="block truncate">
        <span className="text-ink/85">{ROLE_RU[x.role]}</span>
        {kind === 'now' ? <> вместо {out ? surname(out) : 'пустого места'}</> : <> · {playerAge(L, x.p)} лет · потенциал <span className="text-gold">{x.p.pot}</span></>}
      </span>
      {kind === 'now' && <span className="block truncate text-good font-medium">+{x.gain.toFixed(1)} к силе</span>}
      {x.notes.length > 0 && <span className="block text-warn text-[11.5px] truncate">⚠ {x.notes.join(' · ')}</span>}
    </>
  );
  return (
    <PlayerRow
      p={x.p}
      sub={sub}
      right={
        <div className="text-right mr-1 shrink-0 leading-tight">
          <div className="num text-[14px]">{x.fee ? money(x.fee) : 'бесплатно'}</div>
          <div className="text-[11px] text-muted tnum">{money(x.wage)}/год</div>
          <div className="text-[11px] font-medium whitespace-nowrap" style={{ color }}>{label}</div>
        </div>
      }
    />
  );
}

const OFFER_VERDICT: Record<'accept' | 'counter' | 'reject' | 'keep', [string, string]> = {
  accept: ['выгодно — можно продавать', '#3ddc97'],
  counter: ['торгуйтесь', '#ffb547'],
  reject: ['дёшево', '#ff5a5f'],
  keep: ['не продавать', '#ff5a5f'],
};

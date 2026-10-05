import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { transferAdvice, type Chance, type Pick } from '../../engine/advice';
import { offerView, sellAdvice, type SellPick } from '../../engine/sale';
import { useNav } from '../../store/nav';
import { LEAGUES, LEAGUE_IDS, windowOpen } from '../../engine/leagues';
import { foreignLeft, respondOffer } from '../../engine/transfers';
import { teamPower } from '../../engine/lineup';
import type { League, Player, Pos, TransferOffer } from '../../engine/types';
import { Button, Card, Chips, cx, Empty, Pill, SectionTitle, Segmented } from '../components/kit';
import { Icon, Screen, Sheet } from '../components/shell';
import { PlayerRow, TeamBadge } from '../components/media';
import { dateShort, dispName, money, moneyStep, playerAge, POS_RU, ROLE_RU } from '../format';
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
      headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'search', label: 'Поиск' }, { v: 'advice', label: 'Советы' }, { v: 'free', label: 'Без клуба' }, { v: 'offers', label: `Сделки${incoming.length ? ` · ${incoming.length}` : ''}` }, { v: 'list', label: '★' }, { v: 'log', label: 'Лента' }]} /></div>}
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
  // Only the search and the position stay on screen: the rest of the filters live in a sheet, so the
  // list starts in the upper half of the phone.
  const [sheet, setSheet] = useState(false);
  const SORTS = [{ v: 'ovr' as const, label: 'Рейтинг' }, { v: 'pot' as const, label: 'Потенциал' }, { v: 'val' as const, label: 'Стоимость' }, { v: 'age' as const, label: 'Моложе' }];
  const LGS = [{ v: 'all', label: 'Все лиги' }, ...LEAGUE_IDS.map((id) => ({ v: id as string, label: LEAGUES[id].short })), { v: 'ext', label: 'Другие лиги' }];
  const active = [
    !free && lg !== 'all' && { label: LGS.find((x) => x.v === lg)?.label ?? lg, off: () => setLg('all') },
    sort !== 'ovr' && { label: `↓ ${SORTS.find((x) => x.v === sort)!.label}`, off: () => setSort('ovr') },
    !free && afford && { label: 'По карману', off: () => setAfford(false) },
    u23 && { label: 'До 23 лет', off: () => setU23(false) },
  ].filter(Boolean) as { label: string; off: () => void }[];
  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button onClick={() => set(!on)} className={cx('press h-11 px-4 rounded-full text-[14.5px] font-medium border', on ? 'bg-white text-[#05070d] border-white' : 'glass')}>{label}</button>
  );
  return (
    <>
      <div className="flex gap-2 mt-1 mb-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя игрока" enterKeyHint="search" className="flex-1 min-w-0 h-11 rounded-2xl glass px-4 text-[16px] outline-none placeholder:text-faint" />
        <button onClick={() => setSheet(true)} aria-label="Фильтры" className={cx('press relative h-11 px-3.5 rounded-2xl flex items-center gap-1.5 text-[14.5px] font-medium', active.length ? 'bg-white text-[#05070d]' : 'glass')}>
          <Icon name="sliders" size={18} />Фильтры{active.length > 0 && <span className="num">· {active.length}</span>}
        </button>
      </div>
      <Chips value={pos} onChange={setPos} options={[{ v: 'all', label: 'Все амплуа' }, ...(['G', 'D', 'M', 'F'] as Pos[]).map((v) => ({ v, label: POS_RU[v] }))]} />
      <div className="flex gap-2 mt-2 items-center flex-wrap">
        {active.map((a) => (
          <button key={a.label} onClick={a.off} className="press hit h-8 pl-3 pr-2 rounded-full glass text-[13px] flex items-center gap-1" aria-label={`Убрать фильтр ${a.label}`}>{a.label}<span className="text-muted text-[15px] leading-none">×</span></button>
        ))}
        <div className="flex-1 text-right text-[12.5px] text-muted">{list.length} игроков</div>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Фильтры">
        {!free && (
          <>
            <div className="text-[12px] uppercase tracking-wider text-muted mb-2">Лига</div>
            <div className="flex flex-wrap gap-2">
              {LGS.map((o) => <button key={o.v} onClick={() => setLg(o.v)} className={cx('press h-11 px-4 rounded-full text-[14.5px] font-medium border', lg === o.v ? 'bg-white text-[#05070d] border-white' : 'glass')}>{o.label}</button>)}
            </div>
          </>
        )}
        <div className="text-[12px] uppercase tracking-wider text-muted mt-5 mb-2">Сортировка</div>
        <Segmented value={sort} onChange={setSort} options={SORTS} />
        <div className="text-[12px] uppercase tracking-wider text-muted mt-5 mb-2">Ещё</div>
        <div className="flex flex-wrap gap-2">
          {!free && toggle(afford, setAfford, `По карману (до ${money(me.budget)})`)}
          {toggle(u23, setU23, 'До 23 лет')}
        </div>
        <div className="flex gap-2 mt-6">
          {active.length > 0 && <Button onClick={() => active.forEach((a) => a.off())}>Сбросить</Button>}
          <Button variant="primary" size="lg" full onClick={() => setSheet(false)}>Показать {list.length}</Button>
        </div>
      </Sheet>
      {list.length ? (
        <Card pad={false} className="mt-3 overflow-hidden">
          {list.slice(0, 80).map((p) => <PlayerRow key={p.id} p={p} showClub right={<span className="num text-[13px] text-muted mr-1">{money(p.val)}</span>} />)}
        </Card>
      ) : free && !Object.values(L.players).some((p) => p.st === 'FA')
        ? <Empty icon="🧳" title="Свободных агентов сейчас нет" text="Здесь игроки без клуба — их можно подписать без платы за трансфер. Клубы разобрали всех летом; новые появятся 20 июня, когда истекут контракты. Продать своих игроков — во вкладке «Советы» (раздел «Кого выгодно продать») или кнопкой «На трансфер» в профиле." />
        : <Empty title="Никого не нашлось" text="Измените фильтры." />}
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
  const [asking, setAsking] = useState<TransferOffer | null>(null);
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
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button full variant={v.verdict === 'accept' ? 'good' : 'glass'} size="sm" onClick={() => toast(act(() => respondOffer(L, o.id, 'accept')), 'good')}>Принять</Button>
              <Button full variant="danger" size="sm" onClick={() => toast(act(() => respondOffer(L, o.id, 'reject')))}>Отказать</Button>
              <Button full variant={v.verdict === 'accept' || v.ask == null ? 'glass' : 'primary'} size="sm" className="col-span-2" onClick={() => setAsking(o)}>{v.ask != null ? `Просить больше · совет ${money(v.ask)}` : 'Просить больше'}</Button>
            </div>
          </Card>
        );
      })}
      {asking && <CounterSheet L={L} o={asking} onClose={() => setAsking(null)} />}
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

/** The user names the fee for an incoming bid: up to what the buyer can pay the deal is done, above it the club walks away. */
function CounterSheet({ L, o, onClose }: { L: League; o: TransferOffer; onClose: () => void }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const p = L.players[o.player], from = L.teams[o.from];
  const v = offerView(L, o);
  const step = moneyStep(Math.max(p.val, o.fee), 1000);
  const min = Math.floor(o.fee / step) * step + step;
  const max = Math.ceil(Math.max(v.good * 1.5, o.fee * 3, v.ceiling * 1.5) / step) * step;
  const [fee, setFee] = useState(() => Math.max(min, v.ask ?? Math.floor(v.ceiling / step) * step));
  const risky = fee > v.ceiling;
  const send = () => { const text = act(() => respondOffer(L, o.id, 'counter', fee)); toast(text, text.includes('переходит') ? 'good' : 'bad'); onClose(); };
  return (
    <Sheet open onClose={onClose} title={`Встречная цена: ${dispName(p)}`}>
      <div className="text-[13.5px] text-muted mb-3 leading-snug">
        «{from.ru}» предлагает {money(o.fee)}. По оценке штаба клуб заплатит до {money(v.ceiling)}; продавать не дешевле {money(v.min)}, хорошая цена — {money(v.good)}.
      </div>
      <div className="glass rounded-2xl p-4">
        <div className="text-center num text-[34px] leading-none" style={{ color: risky ? '#ff5a5f' : undefined }}>{money(fee)}</div>
        <div className="text-center text-[12px] text-muted mt-1">{risky ? 'выше, чем клуб, скорее всего, готов платить' : 'клуб, скорее всего, согласится'}</div>
        <input type="range" min={min} max={max} step={step} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="w-full mt-4 accent-[var(--accent)]" />
        <div className="flex gap-2 mt-3">
          {[-1, 1].map((d) => <Button key={d} full size="sm" onClick={() => setFee(Math.min(max, Math.max(min, fee + d * step)))}>{d < 0 ? '−' : '+'} {money(step)}</Button>)}
        </div>
      </div>
      <div className="text-[12.5px] text-muted mt-3 leading-snug">Если «{from.ru}» согласен на сумму, сделка закрывается сразу. Если нет — клуб выходит из переговоров.</div>
      <Button variant="primary" size="lg" full className="mt-4" onClick={send}>Просить {money(fee)}</Button>
    </Sheet>
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
  const sell = useMemo(() => sellAdvice(L), [L, ver]);
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
            {adv.away.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 text-[12.5px] leading-snug">
                {adv.away.slice(0, 4).map(({ p, days, long }) => (
                  <div key={p.id}>
                    <span className={long ? 'text-warn' : 'text-ice'}>{long ? '✚ Надолго выбыл' : '✚ Скоро вернётся'}:</span> {dispName(p)}{days ? ` (${days} дн.)` : ' (дисквалификация)'}
                    <span className="text-muted"> — {long ? 'советы учитывают замену на это время' : 'его место в расчётах сохранено, замену не ищем'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
      <SectionTitle>Кого выгодно продать</SectionTitle>
      <div className="text-[12px] text-muted -mt-1.5 mb-2 px-1">Уходящие бесплатно, лишние на позиции и возрастные из запаса. «До» — сколько готов заплатить самый щедрый из клубов, которым игрок интересен.</div>
      {sell.length ? (
        <Card pad={false} className="overflow-hidden">{sell.map((x) => <SellRow key={x.p.id} x={x} />)}</Card>
      ) : <div className="text-[13px] text-muted px-1">Продавать некого: все игроки нужны составу.</div>}
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

function SellRow({ x }: { x: SellPick }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const sub = (
    <>
      <span className="block truncate">{x.reason}</span>
      <span className="block truncate">мин. <span className="text-ink/90 font-medium">{money(x.view.min)}</span> · экономия {money(x.wage)}/год</span>
    </>
  );
  return (
    <PlayerRow
      p={x.p}
      sub={sub}
      right={
        <div className="text-right mr-1 shrink-0 leading-tight flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
          <div className="num text-[14px] text-good">{x.best ? `до ${money(x.best)}` : '—'}</div>
          <div className={cx('text-[11px]', x.buyers ? 'text-muted' : 'text-warn')}>{x.buyers ? `${x.buyers} ${x.buyers % 10 === 1 && x.buyers % 100 !== 11 ? 'клуб' : x.buyers % 10 >= 2 && x.buyers % 10 <= 4 && (x.buyers % 100 < 12 || x.buyers % 100 > 14) ? 'клуба' : 'клубов'}` : 'нет покупателей'}</div>
          {x.p.listed
            ? <span className="text-[11px] text-ice">на трансфере</span>
            : <button className="press text-[12px] font-semibold accent-text" onClick={() => { act(() => { x.p.listed = true; }); toast(`${dispName(x.p)} выставлен на трансфер — клубы будут присылать предложения`, 'good'); }}>На трансфер</button>}
        </div>
      }
    />
  );
}

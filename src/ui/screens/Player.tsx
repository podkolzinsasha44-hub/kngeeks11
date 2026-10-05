import { useMemo, useState } from 'react';
import { renewalCases, VERDICT_RU } from '../../engine/renewals';
import { saleView } from '../../engine/sale';
import { RenewalSheet, VERDICT_COLOR } from './More';
import { useGame, useL } from '../../store/game';
import { playerClub } from '../../engine/ucl';
import { useNav } from '../../store/nav';
import { interest, startTalks, yearsLeft } from '../../engine/contracts';
import { isLeague, LEAGUES, windowOpen } from '../../engine/leagues';
import { askingPrice, releasePlayer, squadRank, userBid } from '../../engine/transfers';
import { avgRating, career } from '../../engine/stats';
import type { KeeperAttrs, League, OutfieldAttrs, Player } from '../../engine/types';
import { fullName } from '../../engine/util';
import { Button, Card, cx, Meter, Pill, SectionTitle, Segmented } from '../components/kit';
import { Icon, Screen, Sheet, useDesktop } from '../components/shell';
import { Flag, TeamBadge } from '../components/media';
import { PlayerCard } from '../components/PlayerCard';
import { Sparkline } from '../components/charts';
import { ATTR_RU, clubLabel, dispName, fitColor, FOOT_RU, money, moneyStep, nationName, ovrColor, playerAge, potLabel, ROLE_FULL, ROLE_RU, seasonLabel } from '../format';
import { useKeep } from '../keep';

const OUT: (keyof OutfieldAttrs)[] = ['pac', 'sho', 'pas', 'dri', 'att', 'def', 'phy', 'hea', 'sta', 'dis'];
const KEEP: (keyof KeeperAttrs)[] = ['ref', 'pos', 'han', 'kic', 'con', 'men'];

const MEDAL: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };
const TOUR: Record<string, string> = { wc: 'ЧМ', euro: 'Евро' };

type Tab = 'info' | 'stats' | 'contract';

export function PlayerScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const p = L.players[Number(params.id)];
  const [tab, setTab] = useKeep<Tab>('player.tab', 'info');
  const desktop = useDesktop();
  if (!p) return <Screen title="Игрок"><div className="text-muted mt-6">Игрок не найден.</div></Screen>;
  const t = p.team ? L.teams[p.team] : null;
  const shortlisted = L.scouting.shortlist.includes(p.id);
  return (
    <Screen
      title={dispName(p)}
      subtitle={`${ROLE_FULL[p.role]} · ${clubLabel(L, p)}`}
      right={
        <button
          onClick={() => act(() => { L.scouting.shortlist = shortlisted ? L.scouting.shortlist.filter((x) => x !== p.id) : [...L.scouting.shortlist, p.id]; })}
          className="press w-11 h-11 rounded-full flex items-center justify-center"
          aria-label="Список наблюдения"
        >
          <Icon name="star" className={shortlisted ? 'text-gold fill-gold' : 'text-muted'} />
        </button>
      }
    >
      <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-10 lg:items-start">
        <div className="lg:sticky lg:top-2">
          <div className="pt-2 pb-4">
            <PlayerCard p={p} L={L} width={desktop ? 320 : Math.min(300, window.innerWidth - 80)} />
          </div>
          <Badges L={L} p={p} />
        </div>
        <div className="min-w-0 lg:pt-2">
          <Facts L={L} p={p} />
          <Actions L={L} p={p} />
          <Segmented className="mt-5" value={tab} onChange={setTab} options={[{ v: 'info', label: 'Обзор' }, { v: 'stats', label: 'Статистика' }, { v: 'contract', label: 'Контракт' }]} />
          {tab === 'info' && <Info p={p} />}
          {tab === 'stats' && <Stats L={L} p={p} />}
          {tab === 'contract' && <ContractTab L={L} p={p} team={t} />}
        </div>
      </div>
    </Screen>
  );
}

function Badges({ L, p }: { L: League; p: Player }) {
  const items = [
    !p.real && <Pill key="acad">Воспитанник академии</Pill>,
    p.inj && <Pill key="inj" color="#ff5a5f">Травма: {p.inj.type}, {p.inj.days} дн.</Pill>,
    !!p.susp && <Pill key="susp" color="#ff5a5f">Дисквалификация: {p.susp} матч.</Pill>,
    p.wantsOut && <Pill key="out" color="#ffb547">Хочет сменить клуб</Pill>,
    p.listed && <Pill key="list" color="#7fd3ff">На трансфере</Pill>,
    p.loan && <Pill key="loan">Аренда из {p.loan.from ? L.teams[p.loan.from]?.ru : p.ext ?? 'другого клуба'}</Pill>,
    p.ru && <Pill key="name">{fullName(p)}</Pill>,
  ].filter(Boolean);
  return items.length ? <div className="flex gap-1.5 flex-wrap mb-3 justify-center">{items}</div> : null;
}

function Facts({ L, p }: { L: League; p: Player }) {
  const age = playerAge(L, p);
  const items: [string, React.ReactNode][] = [
    ['Возраст', `${p.bdApprox ? '≈' : ''}${age}`],
    ['Рост', `${p.ht} см`],
    ['Нога', FOOT_RU[p.foot]],
    ['Страна', <span className="inline-flex items-center gap-1.5"><Flag code={p.ctry} size={14} />{p.ctry}</span>],
    ['Потенциал', potLabel(L, p)],
    ['Стоимость', money(p.val)],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([k, v]) => (
        <div key={k} className="glass rounded-2xl px-3 py-2 min-w-0">
          <div className="text-[10.5px] uppercase tracking-wider text-muted">{k}</div>
          <div className="num text-[17px] mt-0.5 truncate">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Actions({ L, p }: { L: League; p: Player }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const [bid, setBid] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const desktop = useDesktop();
  const mine = p.team === L.user;
  const blocked = p.talksBlockedUntil && p.talksBlockedUntil > L.date;
  const btns: React.ReactNode[] = [];
  const extra: React.ReactNode[] = [];
  if (mine && !p.loan) {
    btns.push(
      <Button key="ext" variant="primary" disabled={!!blocked} onClick={() => { act(() => startTalks(L, p, L.user, 'extend')); push('negotiate', { id: p.id }); }}>
        {blocked ? 'Агент не готов' : yearsLeft(L, p) === 0 ? 'Продлить — истекает' : 'Продлить'}
      </Button>,
      <Button key="list" onClick={() => act(() => { p.listed = !p.listed; toast(p.listed ? 'Игрок выставлен на трансфер: клубы будут присылать предложения' : 'Игрок снят с трансфера'); })} icon={<Icon name="swap" size={16} />}>
        {p.listed ? 'Снять с трансфера' : 'На трансфер'}
      </Button>,
    );
    // A destructive action stays out of the thumb zone.
    extra.push(<Button key="rel" variant="danger" onClick={() => setConfirm(true)}>Расторгнуть</Button>);
  }
  if (!mine && p.st === 'FA') {
    btns.push(
      <Button key="fa" variant="primary" disabled={!!blocked} onClick={() => {
        if (interest(L, p, L.teams[L.user]) < 0.35) return toast(`${dispName(p)} не рассматривает ваш клуб`, 'bad');
        act(() => startTalks(L, p, L.user, 'free')); push('negotiate', { id: p.id });
      }}>Предложить контракт</Button>,
    );
  }
  if (!mine && p.st === 'ACT') {
    btns.push(L.negotiations[p.id]?.kind === 'transfer' && L.negotiations[p.id].status === 'open'
      ? <Button key="talk" variant="good" onClick={() => push('negotiate', { id: p.id })}>Клубы договорились — к контракту</Button>
      : <Button key="bid" variant="primary" onClick={() => setBid(true)} icon={<Icon name="swap" size={16} />}>Сделать предложение</Button>);
  }
  const club = playerClub(L, p);
  if (club && !mine) btns.push(<Button key="club" onClick={() => push('team', { id: club.id })}>Клуб</Button>);
  // On a phone the main actions sit in a bar above the tab bar, under the thumb, whatever the scroll.
  const bar = !desktop && btns.length > 0;
  return (
    <>
      {bar ? (
        <div className="fixed inset-x-4 z-30 p-1.5 rounded-[22px] glass-strong shadow-[0_12px_36px_-10px_rgba(0,0,0,.9)] flex gap-1.5 [&>*]:flex-1 [&>*:not(:first-child)]:flex-none [&>*]:min-w-0 [&>*]:overflow-hidden" style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 10px)' }}>
          {btns}
        </div>
      ) : btns.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{btns}</div>}
      {extra.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{extra}</div>}
      <BidSheet open={bid} onClose={() => setBid(false)} L={L} p={p} />
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Расторгнуть контракт?">
        <div className="text-[14.5px] text-muted mb-4">{dispName(p)} станет свободным агентом. Клуб выплатит половину оставшейся зарплаты из трансферного бюджета.</div>
        <Button variant="danger" size="lg" full onClick={() => { const cost = act(() => releasePlayer(L, p)); setConfirm(false); toast(`Контракт расторгнут. Компенсация: ${money(cost)}`); }}>Расторгнуть</Button>
      </Sheet>
    </>
  );
}

function Info({ p }: { p: Player }) {
  const a = p.r as unknown as Record<string, number>;
  const keys = p.pos === 'G' ? KEEP : OUT;
  return (
    <>
      <SectionTitle>Характеристики</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
          {keys.map((k) => (
            <div key={k}>
              <div className="flex justify-between text-[12.5px]"><span className="text-muted">{ATTR_RU[k]}</span><span className="num" style={{ color: ovrColor(a[k]) }}>{a[k]}</span></div>
              <Meter value={a[k]} max={99} height={4} color={ovrColor(a[k])} className="mt-0.5" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Mini label="Форма" value={p.form > 0.25 ? '▲ на подъёме' : p.form < -0.25 ? '▼ спад' : '● ровная'} />
          <Mini label="Готовность" value={`${Math.round(p.fit)}%`} color={fitColor(p.fit)} />
          <Mini label="Настроение" value={p.morale >= 70 ? 'отличное' : p.morale >= 50 ? 'нормальное' : p.morale >= 35 ? 'недоволен' : 'плохое'} color={p.morale < 40 ? '#ff5a5f' : undefined} />
        </div>
        <div className="text-[12.5px] text-muted mt-3">
          {ROLE_FULL[p.role]}{p.alt?.length ? ` (также ${p.alt.map((r) => ROLE_RU[r]).join(', ')})` : ''} · {nationName(p.ctry)}{p.caps > 0 ? ` · сборная: ${p.caps} матч., ${p.ig} гол.` : ''}
        </div>
      </Card>

      {p.hist.length >= 2 && (
        <>
          <SectionTitle>Рейтинг по сезонам</SectionTitle>
          <Card><Sparkline values={p.hist.map((h) => h[1])} labels={p.hist.map((h) => seasonLabel(h[0]))} width={Math.min(320, 60 * p.hist.length)} /></Card>
        </>
      )}

      {(p.awards.length > 0 || !!p.intl?.length) && (
        <>
          <SectionTitle>Достижения</SectionTitle>
          <Card className="flex flex-col gap-1.5 text-[14px]">
            {(p.intl ?? []).map((x, i) => { const [k, y, m] = x.split(':'); return <div key={i}>{MEDAL[m]} {TOUR[k]}-{y}{k === 'wc' && y === '2026' ? ' (реальный турнир)' : ''}</div>; })}
            {p.awards.map((x, i) => <div key={`a${i}`}>🏅 {x}</div>)}
          </Card>
        </>
      )}
    </>
  );
}

function Stats({ L, p }: { L: League; p: Player }) {
  const seasons = Object.keys(p.stats).sort().reverse();
  const c = career(p);
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-muted">лиги: {c.gp} матч., {c.g} гол., {c.a} пас.</span>}>Статистика</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        <div className="grid grid-cols-[1.5fr_repeat(5,minmax(0,0.5fr))] text-[11px] uppercase tracking-wider text-muted px-3 py-2 border-b border-white/5">
          <span>Сезон · турнир</span><span className="text-right">И</span><span className="text-right">{p.pos === 'G' ? 'Сух' : 'Г'}</span><span className="text-right">{p.pos === 'G' ? 'Проп' : 'П'}</span><span className="text-right">ЖК</span><span className="text-right">Оц</span>
        </div>
        {seasons.map((k) => {
          const s = p.stats[k];
          const [y, comp] = k.split(':');
          return (
            <div key={k} className="grid grid-cols-[1.5fr_repeat(5,minmax(0,0.5fr))] text-[13.5px] px-3 py-2 border-b border-white/5 tnum">
              <span className="truncate">{seasonLabel(Number(y))} · <span className="text-muted">{isLeague(comp) ? LEAGUES[comp].short : comp === 'CUP' ? 'Кубок' : comp === 'UCL' ? 'ЛЧ' : comp === 'WC' ? 'ЧМ' : comp === 'EURO' ? 'Евро' : 'Стыки'}</span></span>
              <span className="text-right">{s.gp}</span><span className="text-right">{p.pos === 'G' ? s.cs : s.g}</span><span className="text-right">{p.pos === 'G' ? s.ga : s.a}</span><span className="text-right">{s.yc}</span><span className="text-right">{avgRating(s).toFixed(1)}</span>
            </div>
          );
        })}
        {[...(p.h ?? [])].reverse().map((h, i) => (
          <div key={i} className="grid grid-cols-[1.5fr_repeat(5,minmax(0,0.5fr))] text-[13.5px] px-3 py-2 border-b border-white/5 last:border-0 tnum text-ink/80">
            <span className="truncate">{seasonLabel(Number(h[0]))} · <span className="text-muted">{L.teams[String(h[1])]?.ru ?? h[1]}</span></span>
            <span className="text-right">{h[2]}</span><span className="text-right">{p.pos === 'G' ? '—' : h[3]}</span><span className="text-right">{p.pos === 'G' ? '—' : h[4]}</span><span className="text-right">—</span><span className="text-right">—</span>
          </div>
        ))}
        {!seasons.length && !p.h?.length && <div className="px-3 py-4 text-muted text-[13.5px]">Данных о матчах пока нет.</div>}
      </Card>
      {!!p.h?.length && <div className="text-[11.5px] text-faint mt-1.5 px-1">Сезоны до 2026/27 — реальная статистика игрока во всех турнирах.</div>}
    </>
  );
}

function ContractTab({ L, p, team }: { L: League; p: Player; team: League['teams'][string] | null }) {
  const push = useNav((s) => s.push);
  const ver = useGame((s) => s.ver);
  const rc = useMemo(() => (p.team === L.user ? renewalCases(L).find((c) => c.p.id === p.id) ?? null : null), [L, p, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const sv = useMemo(() => (p.team === L.user && !p.loan ? saleView(L, p) : null), [L, p, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {rc && (
        <Card className="mt-3" onClick={() => setOpen(true)}>
          <div className="flex items-center gap-2">
            <Pill color={VERDICT_COLOR[rc.verdict]}>Совет штаба: {VERDICT_RU[rc.verdict]}</Pill>
            {rc.auto && L.settings.autoRenew !== false && <span className="text-[11.5px] text-muted">продлится автоматически</span>}
          </div>
          <div className="text-[14px] mt-2">{rc.short[0].toUpperCase() + rc.short.slice(1)}.</div>
          <div className="text-[12.5px] text-muted mt-0.5 leading-snug">{rc.why.slice(0, 2).join('; ')}.</div>
          <div className="text-[13px] accent-text font-semibold mt-2">Подробнее и действия →</div>
        </Card>
      )}
      <RenewalSheet L={L} c={open ? rc : null} onClose={() => setOpen(false)} />
      {sv && (
        <Card className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Если продавать</div>
          <div className="text-[14.5px] font-medium mt-1">{sv.label[0].toUpperCase() + sv.label.slice(1)}</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Mini label="Не дешевле" value={sv.keep ? 'не продавать' : money(sv.min)} color={sv.keep ? '#ff5a5f' : undefined} />
            <Mini label="Хорошая цена" value={sv.keep ? '—' : money(sv.good)} color={sv.keep ? undefined : '#3ddc97'} />
          </div>
          <div className="text-[12.5px] text-muted mt-2 leading-snug">{sv.why.join('; ')}.</div>
        </Card>
      )}
      <SectionTitle>Контракт</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Card onClick={team ? () => push('team', { id: team.id }) : undefined} className="!p-3 flex items-center gap-2.5">
          {team ? <TeamBadge team={team} size={34} /> : <div className="text-2xl">🌍</div>}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted">Клуб</div>
            <div className="text-[14.5px] font-medium truncate">{clubLabel(L, p)}</div>
            {p.loan && <div className="text-[11px] text-muted truncate">аренда из {p.loan.from ? L.teams[p.loan.from]?.ru : p.ext ?? 'другого клуба'}</div>}
          </div>
        </Card>
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Рыночная стоимость</div>
          <div className="num text-[20px] leading-tight">{money(p.val)}</div>
          <div className="text-[11.5px] text-muted truncate">{p.listed ? 'выставлен на трансфер' : 'оценка рынка'}</div>
        </Card>
      </div>
      <Card className="mt-2">
        {p.c ? (
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Зарплата" value={`${money(p.c.wage)}/год`} />
            <Mini label="До лета" value={`${p.c.until}`} color={yearsLeft(L, p) === 0 ? '#ffb547' : undefined} />
            <Mini label="Осталось" value={`${yearsLeft(L, p)} сез.`} />
          </div>
        ) : <div className="text-[14px] text-muted">Без контракта{p.st === 'FA' ? ' — свободный агент' : ''}.</div>}
        {p.c && !p.c.real && <div className="text-[11.5px] text-faint mt-2">Зарплата — модель по рейтингу и лиге: реальные суммы не публикуются.</div>}
      </Card>
    </>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2.5 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-[13px] font-medium truncate" style={{ color }}>{value}</div>
    </div>
  );
}

function BidSheet({ open, onClose, L, p }: { open: boolean; onClose: () => void; L: League; p: Player }) {
  const act = useGame((s) => s.act);
  const push = useNav((s) => s.push);
  const me = L.teams[L.user];
  const step = moneyStep(p.val, 1000);
  const [fee, setFee] = useState(() => Math.round(p.val / step) * step);
  const [res, setRes] = useState<{ status: string; text: string; ask?: number } | null>(null);
  const want = interest(L, p, me);
  const rank = squadRank(L, p);
  const hint = askingPrice(L, p, me);
  return (
    <Sheet open={open} onClose={() => { setRes(null); onClose(); }} title={`Предложение: ${dispName(p)}`}>
      <div className="text-[13.5px] text-muted mb-3 leading-snug">
        Рыночная оценка — {money(p.val)}. {p.team ? `В «${L.teams[p.team].ru}» он ${rank < 3 ? 'один из лидеров — отдадут только за большие деньги' : rank < 11 ? 'игрок основы' : 'не в основе — клуб сговорчивее'}.` : `Игрок клуба ${p.ext ?? 'за рубежом'}.`}{' '}
        {want < 0.35 ? 'Сам игрок в ваш клуб не стремится.' : want > 0.75 ? 'Сам игрок перейти не прочь.' : ''} {!windowOpen(L) && 'Трансферное окно сейчас закрыто.'}
      </div>
      <div className="glass rounded-2xl p-4">
        <div className="text-center num text-[34px] leading-none">{money(fee)}</div>
        <div className="text-center text-[12px] text-muted mt-1">ваш бюджет: {money(me.budget)}</div>
        <input type="range" min={0} max={Math.max(hint * 1.6, p.val * 2.5, step * 4)} step={step} value={fee} onChange={(e) => { setFee(Number(e.target.value)); setRes(null); }} className="w-full mt-4 accent-[var(--accent)]" />
        <div className="flex gap-2 mt-3">
          {[-1, 1].map((d) => <Button key={d} full size="sm" onClick={() => { setFee(Math.max(0, fee + d * step)); setRes(null); }}>{d < 0 ? '−' : '+'} {money(step)}</Button>)}
        </div>
      </div>
      {res && <div className={cx('mt-3 rounded-2xl px-4 py-3 text-[14px]', res.status === 'accepted' ? 'bg-good/15 text-good' : res.status === 'countered' ? 'bg-warn/15 text-warn' : 'bg-bad/15 text-bad')}>{res.text}</div>}
      <div className="flex flex-col gap-2 mt-4">
        {res?.status === 'accepted'
          ? <Button variant="good" size="lg" full onClick={() => { onClose(); push('negotiate', { id: p.id }); }}>Перейти к контракту с игроком</Button>
          : <Button variant="primary" size="lg" full onClick={() => setRes(act(() => userBid(L, p.id, fee)))}>Отправить предложение</Button>}
        {res?.status === 'countered' && res.ask && <Button full onClick={() => { setFee(res.ask!); setRes(act(() => userBid(L, p.id, res.ask!))); }}>Согласиться на {money(res.ask)}</Button>}
      </div>
    </Sheet>
  );
}

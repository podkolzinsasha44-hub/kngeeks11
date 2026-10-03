import { useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { interest, startTalks, yearsLeft } from '../../engine/contracts';
import { isLeague, LEAGUES, windowOpen } from '../../engine/leagues';
import { askingPrice, releasePlayer, squadRank, userBid } from '../../engine/transfers';
import { avgRating, career } from '../../engine/stats';
import type { KeeperAttrs, League, OutfieldAttrs, Player } from '../../engine/types';
import { fullName } from '../../engine/util';
import { Button, Card, cx, Meter, Ovr, Pill, SectionTitle } from '../components/kit';
import { Screen, Sheet } from '../components/shell';
import { PlayerKit, TeamBadge } from '../components/media';
import { Sparkline } from '../components/charts';
import { Figure3D } from '../components/three';
import { ATTR_RU, clubLabel, dispName, fitColor, flag, FOOT_RU, money, nationName, ovrColor, playerAge, ROLE_FULL, ROLE_RU, seasonLabel, tierOf, TIER_RU } from '../format';

const OUT: (keyof OutfieldAttrs)[] = ['pac', 'sho', 'pas', 'dri', 'att', 'def', 'phy', 'hea', 'sta', 'dis'];
const KEEP: (keyof KeeperAttrs)[] = ['ref', 'pos', 'han', 'kic', 'con', 'men'];

const MEDAL: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };
const TOUR: Record<string, string> = { wc: 'ЧМ', euro: 'Евро' };

export function PlayerScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const p = L.players[Number(params.id)];
  const [bid, setBid] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!p) return <Screen title="Игрок"><div className="text-muted mt-6">Игрок не найден.</div></Screen>;
  const t = p.team ? L.teams[p.team] : null;
  const mine = p.team === L.user;
  const age = playerAge(L, p);
  const tier = tierOf(p.ovr);
  const a = p.r as unknown as Record<string, number>;
  const keys = p.pos === 'G' ? KEEP : OUT;
  // Scouts know their own players exactly; for others the potential is an estimate.
  const potText = mine || age >= 27 ? `${p.pot}` : `${Math.max(p.ovr, p.pot - 3)}–${Math.min(99, p.pot + 3)}`;
  const seasons = Object.keys(p.stats).sort().reverse();
  const c = career(p);
  const blocked = p.talksBlockedUntil && p.talksBlockedUntil > L.date;
  const shortlisted = L.scouting.shortlist.includes(p.id);
  return (
    <Screen title={dispName(p)} subtitle={p.ru ? fullName(p) : undefined} right={<button onClick={() => act(() => { L.scouting.shortlist = shortlisted ? L.scouting.shortlist.filter((x) => x !== p.id) : [...L.scouting.shortlist, p.id]; })} className={cx('press w-11 h-11 flex items-center justify-center text-[20px]', shortlisted ? 'text-gold' : 'text-muted')} aria-label="Список наблюдения">{shortlisted ? '★' : '☆'}</button>}>
      <Card pad={false} className="relative overflow-hidden mt-1">
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, ${t?.primary ?? '#334155'} 60%, transparent), transparent 70%)` }} />
        <div className={cx('absolute inset-x-0 top-0 h-1', tier === 'legend' && 'holo')} style={tier !== 'legend' ? { background: ovrColor(p.ovr) } : undefined} />
        <div className="relative">
          {L.settings.fx3d ? (
            <Figure3D height={250} spec={{ primary: t?.primary ?? '#3a4458', secondary: t?.secondary ?? '#aab4c8', num: t ? p.num : null, name: (p.ru ?? p.ln).split(' ').slice(-1)[0], keeper: p.pos === 'G', ht: p.ht }} />
          ) : (
            <div className="flex justify-center py-6"><PlayerKit L={L} p={p} size={120} /></div>
          )}
          <div className="absolute top-3 left-3 flex flex-col items-center gap-1">
            <Ovr v={p.ovr} size={52} />
            <div className="text-[10px] uppercase tracking-wider text-muted">{TIER_RU[tier]}</div>
          </div>
          <div className="absolute top-3 right-3 text-right">
            <div className="num text-[22px] leading-none">{ROLE_RU[p.role]}</div>
            <div className="text-[22px] leading-none mt-1.5">{flag(p.ctry)}</div>
          </div>
        </div>
        <div className="relative px-4 pb-4 -mt-1">
          <div className="font-display uppercase text-[24px] leading-tight">{dispName(p)}</div>
          <div className="text-[13px] text-muted">{ROLE_FULL[p.role]}{p.alt?.length ? ` (также ${p.alt.map((r) => ROLE_RU[r]).join(', ')})` : ''} · {nationName(p.ctry)} · {p.bdApprox ? '≈' : ''}{age} {age % 10 === 1 && age !== 11 ? 'год' : age % 10 >= 2 && age % 10 <= 4 && (age < 12 || age > 14) ? 'года' : 'лет'} · {p.ht} см · нога: {FOOT_RU[p.foot]}</div>
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            <Pill color="#e8c26a">Потенциал {potText}</Pill>
            {!p.real && <Pill>Воспитанник академии</Pill>}
            {p.inj && <Pill color="#ff5a5f">Травма: {p.inj.type}, {p.inj.days} дн.</Pill>}
            {!!p.susp && <Pill color="#ff5a5f">Дисквалификация: {p.susp} матч.</Pill>}
            {p.wantsOut && <Pill color="#ffb547">Хочет сменить клуб</Pill>}
            {p.listed && <Pill color="#7fd3ff">На трансфере</Pill>}
            {p.caps > 0 && <Pill>Сборная: {p.caps} матч., {p.ig} гол.</Pill>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Card onClick={t ? () => push('team', { id: t.id }) : undefined} className="!p-3 flex items-center gap-2.5">
          {t ? <TeamBadge team={t} size={34} /> : <div className="text-2xl">🌍</div>}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted">Клуб</div>
            <div className="text-[14.5px] font-medium truncate">{clubLabel(L, p)}</div>
            {p.loan && <div className="text-[11px] text-muted truncate">аренда из {p.loan.from ? L.teams[p.loan.from]?.ru : p.ext ?? 'другого клуба'}</div>}
          </div>
        </Card>
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Рыночная стоимость</div>
          <div className="num text-[20px] leading-tight">{money(p.val)}</div>
          <div className="text-[11.5px] text-muted truncate">{p.c ? `${money(p.c.wage)}/год · до лета ${p.c.until}` : 'без контракта'}</div>
        </Card>
      </div>

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
      </Card>

      {p.hist.length >= 2 && (
        <>
          <SectionTitle>Рейтинг по сезонам</SectionTitle>
          <Card><Sparkline values={p.hist.map((h) => h[1])} labels={p.hist.map((h) => seasonLabel(h[0]))} width={Math.min(320, 60 * p.hist.length)} /></Card>
        </>
      )}

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
              <span className="truncate">{seasonLabel(Number(y))} · <span className="text-muted">{isLeague(comp) ? LEAGUES[comp].short : comp === 'CUP' ? 'Кубок' : comp === 'WC' ? 'ЧМ' : comp === 'EURO' ? 'Евро' : 'Стыки'}</span></span>
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

      {(p.awards.length > 0 || p.intl?.length) && (
        <>
          <SectionTitle>Достижения</SectionTitle>
          <Card className="flex flex-col gap-1.5 text-[14px]">
            {(p.intl ?? []).map((x, i) => { const [k, y, m] = x.split(':'); return <div key={i}>{MEDAL[m]} {TOUR[k]}-{y}{k === 'wc' && y === '2026' ? ' (реальный турнир)' : ''}</div>; })}
            {p.awards.map((x, i) => <div key={`a${i}`}>🏅 {x}</div>)}
          </Card>
        </>
      )}

      <div className="flex flex-col gap-2 mt-5">
        {mine && !p.loan && (
          <>
            <Button variant="primary" size="lg" full disabled={!!blocked} onClick={() => { act(() => startTalks(L, p, L.user, 'extend')); push('negotiate', { id: p.id }); }}>
              {blocked ? 'Агент не готов к переговорам' : `Продлить контракт${yearsLeft(L, p) === 0 ? ' — истекает летом' : ''}`}
            </Button>
            <div className="flex gap-2">
              <Button full onClick={() => act(() => { p.listed = !p.listed; toast(p.listed ? 'Игрок выставлен на трансфер: клубы будут присылать предложения' : 'Игрок снят с трансфера'); })}>{p.listed ? 'Снять с трансфера' : 'Выставить на трансфер'}</Button>
              <Button full variant="danger" onClick={() => setConfirm(true)}>Расторгнуть</Button>
            </div>
          </>
        )}
        {!mine && p.st === 'FA' && (
          <Button variant="primary" size="lg" full disabled={!!blocked} onClick={() => {
            if (interest(L, p, L.teams[L.user]) < 0.35) return toast(`${dispName(p)} не рассматривает ваш клуб`, 'bad');
            act(() => startTalks(L, p, L.user, 'free')); push('negotiate', { id: p.id });
          }}>Предложить контракт (свободный агент)</Button>
        )}
        {!mine && p.st === 'ACT' && (
          L.negotiations[p.id]?.kind === 'transfer' && L.negotiations[p.id].status === 'open'
            ? <Button variant="good" size="lg" full onClick={() => push('negotiate', { id: p.id })}>Клубы договорились — к контракту</Button>
            : <Button variant="primary" size="lg" full onClick={() => setBid(true)}>Сделать предложение клубу</Button>
        )}
      </div>

      <BidSheet open={bid} onClose={() => setBid(false)} L={L} p={p} />
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Расторгнуть контракт?">
        <div className="text-[14.5px] text-muted mb-4">{dispName(p)} станет свободным агентом. Клуб выплатит половину оставшейся зарплаты из трансферного бюджета.</div>
        <Button variant="danger" size="lg" full onClick={() => { const cost = act(() => releasePlayer(L, p)); setConfirm(false); toast(`Контракт расторгнут. Компенсация: ${money(cost)}`); }}>Расторгнуть</Button>
      </Sheet>
    </Screen>
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
  const [fee, setFee] = useState(() => Math.round(p.val / 1e5) * 1e5);
  const [res, setRes] = useState<{ status: string; text: string; ask?: number } | null>(null);
  const step = p.val >= 2e7 ? 1e6 : p.val >= 3e6 ? 250_000 : 50_000;
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

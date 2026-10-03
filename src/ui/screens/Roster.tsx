import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { aiLineup, foreignOnPitch } from '../../engine/ai';
import { wageBill } from '../../engine/contracts';
import { foreignLimit, isForeign } from '../../engine/leagues';
import { BENCH_SIZE, FORMATIONS, FORMATION_IDS, available, lineupValid, slotRating, slotXY, squad, teamPower, teamStrength } from '../../engine/lineup';
import type { FormationId, League, Player, Pos, Tactic, Team } from '../../engine/types';
import { Button, Card, Chips, cx, Ovr, Pill, SectionTitle, Segmented } from '../components/kit';
import { Screen, Sheet } from '../components/shell';
import { inkOn, PlayerRow, StatusDots } from '../components/media';
import { PitchSvg } from '../components/charts';
import { Pitch3D } from '../components/three';
import { dispName, dispShort, fitColor, money, playerAge, POS_FULL, ROLE_RU } from '../format';

type TabId = 'squad' | 'lineup';

export function Roster({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useState<TabId>((params.tab as TabId) ?? 'squad');
  const t = L.teams[L.user];
  const sq = squad(L, t.id);
  return (
    <Screen title="Состав" subtitle={`${sq.length} игроков · зарплаты ${money(wageBill(L, t.id))} в год`} headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'squad', label: 'Игроки' }, { v: 'lineup', label: 'Расстановка на матч' }]} /></div>}>
      {tab === 'squad' ? <SquadList L={L} t={t} sq={sq} /> : <LineupEditor L={L} t={t} sq={sq} />}
    </Screen>
  );
}

function SquadList({ L, t, sq }: { L: League; t: Team; sq: Player[] }) {
  const [sort, setSort] = useState<'pos' | 'ovr' | 'age' | 'wage' | 'fit'>('pos');
  const xi = new Set(t.lineup.xi), bench = new Set(t.lineup.bench);
  const lim = foreignLimit(t.lg, L.season);
  const foreign = sq.filter((p) => isForeign(p, t.country)).length;
  const badge = (p: Player) => (xi.has(p.id) ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-good/20 text-good">СТАРТ</span> : bench.has(p.id) ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-muted">ЗАП</span> : null);
  const row = (p: Player) => (
    <PlayerRow key={p.id} p={p} right={<div className="flex flex-col items-end gap-0.5 mr-1">{badge(p)}<span className="text-[11px] text-muted tnum">{p.loan ? 'аренда' : p.c ? `${money(p.c.wage)} · до ${p.c.until}` : ''}</span></div>} />
  );
  const sorted = [...sq].sort((a, b) => (sort === 'ovr' ? b.ovr - a.ovr : sort === 'age' ? playerAge(L, a) - playerAge(L, b) : sort === 'wage' ? (b.c?.wage ?? 0) - (a.c?.wage ?? 0) : a.fit - b.fit));
  return (
    <>
      <div className="mt-1"><Chips value={sort} onChange={setSort} options={[{ v: 'pos', label: 'По амплуа' }, { v: 'ovr', label: 'Рейтинг' }, { v: 'age', label: 'Возраст' }, { v: 'wage', label: 'Зарплата' }, { v: 'fit', label: 'Готовность' }]} /></div>
      {lim && <div className="mt-2"><Pill color={foreign > lim[0] ? '#ff5a5f' : undefined}>Легионеры: {foreign} из {lim[0]} в заявке</Pill></div>}
      {sort === 'pos' ? (['G', 'D', 'M', 'F'] as Pos[]).map((pos) => (
        <div key={pos}>
          <SectionTitle>{POS_FULL[pos]} · {sq.filter((p) => p.pos === pos).length}</SectionTitle>
          <Card pad={false} className="overflow-hidden">{sq.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr).map(row)}</Card>
        </div>
      )) : <Card pad={false} className="mt-3 overflow-hidden">{sorted.map(row)}</Card>}
    </>
  );
}

function LineupEditor({ L, t, sq }: { L: League; t: Team; sq: Player[] }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const fx = L.settings.fx3d;
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [slot, setSlot] = useState<number | null>(null);
  const [benchSlot, setBenchSlot] = useState<number | null>(null);
  const ln = t.lineup;
  const roles = FORMATIONS[ln.form];
  const xy = slotXY(ln.form);
  const lim = foreignLimit(t.lg, L.season);
  const fOn = foreignOnPitch(L, t);
  const valid = lineupValid(L, t);
  const power = teamPower(L, t);
  const s = teamStrength(L, t);
  const manual = <T,>(fn: () => T) => act(() => { t.lineup.auto = false; return fn(); });

  /** Put a player into a slot; if he already starts elsewhere the two players swap places. */
  const assign = (i: number, pid: number) => manual(() => {
    const cur = t.lineup.xi[i];
    const j = t.lineup.xi.indexOf(pid);
    if (j >= 0) t.lineup.xi[j] = cur;
    else {
      const b = t.lineup.bench.indexOf(pid);
      if (b >= 0 && cur != null) t.lineup.bench[b] = cur;
      else if (cur != null && !t.lineup.bench.includes(cur) && t.lineup.bench.length < BENCH_SIZE) t.lineup.bench.push(cur);
    }
    t.lineup.xi[i] = pid;
    t.lineup.bench = t.lineup.bench.filter((id, k, arr) => !t.lineup.xi.includes(id) && arr.indexOf(id) === k);
  });
  const setForm = (f: FormationId) => manual(() => {
    // Keep the same eleven; players are re-seated into the new shape by best fit.
    const ps = t.lineup.xi.map((id) => L.players[id]).filter(Boolean);
    const newRoles = FORMATIONS[f];
    const left = [...ps];
    const xi: number[] = [];
    newRoles.forEach((r) => {
      let bi = 0, bv = -1;
      left.forEach((p, k) => { const v = slotRating(p, r) - (r !== 'GK' && p.pos === 'G' ? 100 : 0); if (v > bv) { bv = v; bi = k; } });
      const p = left.splice(bi, 1)[0];
      if (p) xi.push(p.id);
    });
    t.lineup.form = f;
    t.lineup.xi = xi;
  });
  const best = () => act(() => { const keep = t.lineup.auto; aiLineup(L, t, sq, true); t.lineup.auto = keep; });
  const candidates = useMemo(() => {
    if (slot == null) return [];
    return [...sq].sort((a, b) => slotRating(b, roles[slot]) - slotRating(a, roles[slot]));
  }, [slot, sq, roles]);

  return (
    <>
      <Card className="mt-1">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[15px] font-semibold">{ln.auto ? 'Состав выбирает штаб' : 'Состав выбираете вы'}</div>
            <div className="text-[12.5px] text-muted leading-snug">{ln.auto ? 'Перед каждым матчем штаб ставит сильнейших доступных игроков.' : 'На поле выйдут именно эти одиннадцать. Если кто-то не сможет играть, игра остановится и предупредит.'}</div>
          </div>
          <button onClick={() => act(() => { t.lineup.auto = !t.lineup.auto; if (t.lineup.auto) aiLineup(L, t, sq, true); })} className={cx('press w-[52px] h-[32px] rounded-full relative shrink-0 transition-colors', ln.auto ? 'bg-white/15' : 'accent-bg')} aria-label="Ручной состав">
            <span className={cx('absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white transition-all', ln.auto ? 'left-[3px]' : 'left-[23px]')} />
          </button>
        </div>
      </Card>

      <div className="mt-3"><Chips value={ln.form} onChange={setForm} options={FORMATION_IDS.map((f) => ({ v: f, label: f }))} /></div>

      <div className="flex items-center justify-between mt-3 mb-2">
        <div className="flex gap-1.5 flex-wrap">
          <Pill color="var(--accent)">Сила {power.toFixed(1)}</Pill>
          <Pill>АТК {s.att.toFixed(0)}</Pill><Pill>ЦЕН {s.mid.toFixed(0)}</Pill><Pill>ОБР {s.def.toFixed(0)}</Pill><Pill>ВР {s.gk.toFixed(0)}</Pill>
        </div>
        {fx && <div className="shrink-0 ml-2"><Segmented value={view} onChange={setView} options={[{ v: '2d', label: '2D' }, { v: '3d', label: '3D' }]} className="w-[104px]" /></div>}
      </div>
      {(!valid || (lim && fOn > lim[1])) && (
        <div className="mb-2 rounded-2xl border border-bad/40 bg-bad/10 px-3 py-2 text-[13px]">
          {!valid && <div>⚠️ В старте есть игрок, который не может выйти на поле (отмечен красным), или состав неполный.</div>}
          {lim && fOn > lim[1] && <div>⚠️ Легионеров на поле: {fOn}, разрешено не больше {lim[1]}.</div>}
        </div>
      )}

      {view === '3d' && fx ? (
        <Pitch3D
          height={380}
          selected={slot}
          onSelect={(i) => setSlot(i)}
          players={ln.xi.map((id, i) => { const p = L.players[id]; return { id, x: xy[i][0], y: xy[i][1], primary: t.primary, secondary: t.secondary, num: p?.num, name: p ? (p.ru ?? p.ln).split(' ').slice(-1)[0] : '', keeper: roles[i] === 'GK', ht: p?.ht }; })}
        />
      ) : (
        <div className="relative w-full max-w-[460px] mx-auto">
          <PitchSvg vertical className="w-full" />
          {roles.map((r, i) => {
            const p = L.players[ln.xi[i]];
            const ok = p && p.team === t.id && available(p);
            const rating = p ? Math.round(slotRating(p, r)) : 0;
            const off = p && p.role !== r && rating < p.ovr - 2;
            return (
              <button key={i} onClick={() => setSlot(i)} className="press absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 w-[72px]" style={{ left: `${xy[i][1] * 100}%`, top: `${(0.965 - xy[i][0]) * 100}%` }}>
                <div className={cx('w-[38px] h-[38px] rounded-full flex items-center justify-center num text-[16px] shadow-lg border-2', !ok ? 'border-bad' : 'border-white/70')} style={{ background: r === 'GK' ? '#f2c230' : t.primary, color: r === 'GK' ? '#111' : inkOn(t.primary) }}>
                  {p?.num ?? '?'}
                </div>
                <div className="mt-0.5 px-1.5 rounded-md bg-black/55 text-[10.5px] leading-[15px] max-w-full truncate">{p ? dispShort(p).split(' ').slice(-1)[0] : 'пусто'}</div>
                <div className="flex gap-1 items-center text-[9.5px] leading-[13px]">
                  <span className="text-white/80">{ROLE_RU[r]}</span>
                  <span className={cx('num', off ? 'text-warn' : 'text-white')}>{rating || ''}</span>
                  {p && !ok && <span className="text-bad">✚</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button full onClick={best}>Лучший состав</Button>
        <Button full onClick={() => { toast('Состав сохранён — в матче сыграют эти одиннадцать', 'good'); }} variant="primary" disabled={!valid}>Готово</Button>
      </div>

      <SectionTitle>Тактика</SectionTitle>
      <Segmented<Tactic> value={t.tactic} onChange={(v) => act(() => { t.tactic = v; })} options={[{ v: 'defense', label: 'Оборона' }, { v: 'balanced', label: 'Баланс' }, { v: 'attack', label: 'Атака' }]} />
      <div className="text-[12px] text-muted mt-1.5 px-1">Атака: больше моментов у ворот соперника и у своих. Оборона: меньше и там, и там.</div>

      <SectionTitle right={<span className="text-[12px] text-muted">{ln.bench.length} из {BENCH_SIZE} · до 5 замен</span>}>Запасные</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        {ln.bench.map((id, i) => L.players[id] && <PlayerRow key={id} dense p={L.players[id]} onClick={() => setBenchSlot(i)} />)}
        {ln.bench.length < BENCH_SIZE && <button onClick={() => setBenchSlot(ln.bench.length)} className="press w-full h-12 text-[14px] accent-text">+ Добавить запасного</button>}
      </Card>
      <SectionTitle>Пенальтист</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        <div className="hscroll flex gap-2 p-3">
          {ln.xi.map((id) => L.players[id]).filter((p) => p && p.pos !== 'G').map((p) => (
            <button key={p.id} onClick={() => manual(() => { t.lineup.pen = p.id; })} className={cx('press shrink-0 h-9 px-3 rounded-full text-[13px] border', ln.pen === p.id ? 'bg-white text-[#05070d] border-white' : 'glass')}>{dispShort(p)}</button>
          ))}
        </div>
      </Card>

      <Sheet open={slot != null} onClose={() => setSlot(null)} title={slot != null ? `Позиция: ${ROLE_RU[roles[slot]]}` : ''} full>
        {slot != null && (
          <div className="flex flex-col">
            {L.players[ln.xi[slot]] && <Button size="sm" className="self-start mb-2" onClick={() => { const id = ln.xi[slot]; setSlot(null); push('player', { id }); }}>Профиль: {dispName(L.players[ln.xi[slot]])}</Button>}
            {candidates.map((p) => {
              const inXI = ln.xi.indexOf(p.id);
              const can = available(p);
              return (
                <div key={p.id} onClick={() => { if (!can) return toast(`${dispName(p)} сейчас не может играть`, 'bad'); assign(slot, p.id); setSlot(null); }} className={cx('press flex items-center gap-3 py-2 border-b border-white/5', !can && 'opacity-45', ln.xi[slot] === p.id && 'bg-white/5 rounded-xl')}>
                  <Ovr v={Math.round(slotRating(p, roles[slot]))} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="truncate font-medium">{dispName(p)}</span><StatusDots p={p} /></div>
                    <div className="text-[12px] text-muted">{ROLE_RU[p.role]} · общий {p.ovr} · <span style={{ color: fitColor(p.fit) }}>готовность {Math.round(p.fit)}%</span>{isForeign(p, t.country) ? ' · легионер' : ''}</div>
                  </div>
                  {inXI >= 0 ? <span className="text-[11px] text-good">{inXI === slot ? 'здесь' : `старт · ${ROLE_RU[roles[inXI]]}`}</span> : ln.bench.includes(p.id) ? <span className="text-[11px] text-muted">запас</span> : null}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
      <Sheet open={benchSlot != null} onClose={() => setBenchSlot(null)} title="Запасной" full>
        {benchSlot != null && (
          <div className="flex flex-col">
            {ln.bench[benchSlot] != null && <Button size="sm" variant="danger" className="self-start mb-2" onClick={() => { manual(() => { t.lineup.bench.splice(benchSlot, 1); }); setBenchSlot(null); }}>Убрать из запаса</Button>}
            {[...sq].filter((p) => !ln.xi.includes(p.id) && !ln.bench.includes(p.id)).sort((a, b) => b.ovr - a.ovr).map((p) => (
              <PlayerRow key={p.id} dense p={p} onClick={() => { if (!available(p)) return toast(`${dispName(p)} сейчас не может играть`, 'bad'); manual(() => { t.lineup.bench[benchSlot] = p.id; }); setBenchSlot(null); }} />
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

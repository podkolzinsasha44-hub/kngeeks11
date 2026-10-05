import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { aiLineup, foreignOnPitch } from '../../engine/ai';
import { wageBill } from '../../engine/contracts';
import { foreignLimit, isForeign } from '../../engine/leagues';
import { BENCH_SIZE, FORMATIONS, FORMATION_IDS, available, lineupValid, slotRating, squad, teamPower, teamStrength } from '../../engine/lineup';
import type { FormationId, League, Player, Pos, Role, Tactic, Team } from '../../engine/types';
import { Button, Card, Chips, cx, Ovr, Pill, SectionTitle, Segmented } from '../components/kit';
import { Screen, Sheet } from '../components/shell';
import { PlayerRow, StatusDots } from '../components/media';
import { EmptyCard, PitchCard } from '../components/PlayerCard';
import { PitchSvg } from '../components/charts';
import { dispName, dispShort, fitColor, money, playerAge, POS_FULL, ROLE_RU } from '../format';
import { useKeep } from '../keep';

type TabId = 'pitch' | 'list';

export function Roster({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useKeep<TabId>('roster.tab', params.tab === 'squad' || params.tab === 'list' ? 'list' : 'pitch');
  const t = L.teams[L.user];
  const sq = squad(L, t.id);
  return (
    <Screen title="Состав" subtitle={`${sq.length} игроков · зарплаты ${money(wageBill(L, t.id))} в год`} headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'pitch', label: 'Поле' }, { v: 'list', label: 'Список и контракты' }]} /></div>}>
      {tab === 'list' ? <SquadList L={L} t={t} sq={sq} /> : <PitchEditor L={L} t={t} sq={sq} />}
    </Screen>
  );
}

function SquadList({ L, t, sq }: { L: League; t: Team; sq: Player[] }) {
  const [sort, setSort] = useKeep<'pos' | 'ovr' | 'age' | 'wage' | 'fit'>('roster.sort', 'pos');
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
      {lim && lim[0] > 0 && <div className="mt-2"><Pill color={foreign > lim[0] ? '#ff5a5f' : undefined}>Легионеры: {foreign} из {lim[0]} в заявке</Pill></div>}
      {sort === 'pos' ? (['G', 'D', 'M', 'F'] as Pos[]).map((pos) => (
        <div key={pos}>
          <SectionTitle>{POS_FULL[pos]} · {sq.filter((p) => p.pos === pos).length}</SectionTitle>
          <Card pad={false} className="overflow-hidden">{sq.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr).map(row)}</Card>
        </div>
      )) : <Card pad={false} className="mt-3 overflow-hidden">{sorted.map(row)}</Card>}
    </>
  );
}

/** Where the cards stand on the portrait pitch: [left, top] as fractions; own goal at the bottom. */
function cardXY(form: FormationId): [number, number][] {
  const roles = FORMATIONS[form];
  const count = (r: Role) => roles.filter((x) => x === r).length;
  const fullBacks = roles.includes('LB') || roles.includes('RB');
  const spread = (n: number, tight: boolean) => (n === 1 ? [0.5] : n === 2 ? (tight ? [0.37, 0.63] : [0.32, 0.68]) : tight ? [0.3, 0.5, 0.7] : [0.22, 0.5, 0.78]);
  const Y: Record<Role, number> = { GK: 0.915, CB: 0.755, LB: 0.715, RB: 0.715, DM: 0.585, CM: 0.455, LM: 0.435, RM: 0.435, AM: 0.33, LW: 0.215, RW: 0.215, ST: 0.105 };
  const X: Partial<Record<Role, number>> = { GK: 0.5, LB: 0.105, RB: 0.895, LM: 0.105, RM: 0.895, LW: 0.14, RW: 0.86 };
  const seen: Partial<Record<Role, number>> = {};
  return roles.map((r) => {
    if (X[r] != null) return [X[r]!, Y[r]];
    const k = (seen[r] = (seen[r] ?? 0) + 1) - 1;
    return [spread(count(r), r === 'CB' ? fullBacks : r === 'ST')[k] ?? 0.5, Y[r]];
  });
}

type Zone = 'xi' | 'bench' | 'res';
interface Sel { zone: Zone; i: number; id: number | null }

function PitchEditor({ L, t, sq }: { L: League; t: Team; sq: Player[] }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const [sel, setSel] = useState<Sel | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(358);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const ln = t.lineup;
  const roles = FORMATIONS[ln.form];
  const xy = useMemo(() => cardXY(ln.form), [ln.form]);
  const lim = foreignLimit(t.lg, L.season);
  const fOn = foreignOnPitch(L, t);
  const valid = lineupValid(L, t);
  const s = teamStrength(L, t);
  const inXI = new Set(ln.xi), onBench = new Set(ln.bench);
  const reserves = sq.filter((p) => !inXI.has(p.id) && !onBench.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const cardW = Math.max(54, Math.min(84, w * 0.176));
  const manual = <T,>(fn: () => T) => act(() => { t.lineup.auto = false; return fn(); });
  const ok = (id: number | null) => id != null && !!L.players[id] && available(L.players[id]);
  const refuse = (id: number | null) => { if (id != null && L.players[id]) toast(`${dispName(L.players[id])} сейчас не может играть`, 'bad'); };

  /** Two places on the team sheet exchange their players. */
  const swap = (a: Sel, b: Sel) => {
    if (a.id == null && b.id == null) return;
    const zones = new Set([a.zone, b.zone]);
    // A player who cannot play may leave the team sheet but not enter it.
    if (zones.has('xi') || zones.has('bench')) {
      const incoming = a.zone === 'res' ? a.id : b.zone === 'res' ? b.id : null;
      if (incoming != null && !ok(incoming)) return refuse(incoming);
      if (a.zone !== b.zone && zones.has('xi')) {
        const toXI = a.zone === 'xi' ? b.id : a.id;
        if (toXI != null && !ok(toXI)) return refuse(toXI);
      }
    }
    manual(() => {
      const l = t.lineup;
      const put = (z: Zone, i: number, id: number | null) => {
        if (z === 'res') return;
        const arr = z === 'xi' ? l.xi : l.bench;
        if (id == null) arr.splice(i, 1);
        else arr[i] = id;
      };
      if (a.zone === 'res' && b.zone === 'res') return;
      put(a.zone, a.i, b.id);
      put(b.zone, b.i, a.id);
      // A starter pushed out by a reserve sits on the bench while there is room.
      const out = a.zone === 'xi' && b.zone === 'res' ? a.id : b.zone === 'xi' && a.zone === 'res' ? b.id : null;
      if (out != null && l.bench.length < BENCH_SIZE && !l.bench.includes(out)) l.bench.push(out);
      l.bench = l.bench.filter((id, k, arr) => id != null && !l.xi.includes(id) && arr.indexOf(id) === k);
    });
  };
  /** FIFA-style: tap one card, tap another — the two swap places. */
  const tap = (b: Sel) => {
    const a = sel;
    if (!a) return setSel(b.id == null ? null : b);
    setSel(null);
    if (a.zone === b.zone && a.i === b.i) return;
    swap(a, b);
  };

  const setForm = (f: FormationId) => manual(() => {
    // Keep the same eleven; players are re-seated into the new shape by best fit.
    const left = t.lineup.xi.map((id) => L.players[id]).filter(Boolean);
    const xi: number[] = [];
    FORMATIONS[f].forEach((r) => {
      let bi = 0, bv = -Infinity;
      left.forEach((p, k) => { const v = slotRating(p, r) - (r !== 'GK' && p.pos === 'G' ? 100 : 0); if (v > bv) { bv = v; bi = k; } });
      const p = left.splice(bi, 1)[0];
      if (p) xi.push(p.id);
    });
    t.lineup.form = f;
    t.lineup.xi = xi;
    setSel(null);
  });
  const best = () => act(() => { const keep = t.lineup.auto; aiLineup(L, t, sq, true); t.lineup.auto = keep; setSel(null); });
  const candidates = useMemo(() => (pick == null ? [] : [...sq].sort((a, b) => slotRating(b, roles[pick]) - slotRating(a, roles[pick]))), [pick, sq, roles]);
  const selP = sel?.id != null ? L.players[sel.id] : null;
  const isSel = (zone: Zone, i: number) => sel?.zone === zone && sel.i === i;
  const controls = (
    <>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 min-w-0"><Chips value={ln.form} onChange={setForm} options={FORMATION_IDS.map((f) => ({ v: f, label: f }))} /></div>
      </div>
      <div className="flex gap-1.5 flex-wrap mt-2 mb-2">
        <Pill color="var(--accent)">Сила {teamPower(L, t).toFixed(1)}</Pill>
        <Pill>АТК {s.att.toFixed(0)}</Pill><Pill>ЦЕН {s.mid.toFixed(0)}</Pill><Pill>ОБР {s.def.toFixed(0)}</Pill><Pill>ВР {s.gk.toFixed(0)}</Pill>
        {lim && <Pill color={fOn > lim[1] ? '#ff5a5f' : undefined}>Легионеры {fOn}/{lim[1]}</Pill>}
      </div>
      {(!valid || (lim && fOn > lim[1])) && (
        <div className="mb-2 rounded-2xl border border-bad/40 bg-bad/10 px-3 py-2 text-[13px]">
          {!valid && <div>⚠️ В старте есть игрок, который не может выйти на поле (красный значок), или состав неполный.</div>}
          {lim && fOn > lim[1] && <div>⚠️ Легионеров на поле: {fOn}, разрешено не больше {lim[1]}.</div>}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="lg:hidden">{controls}</div>
      <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-8 lg:items-start">
      <div className="lg:sticky lg:top-2">
      <div ref={box} className="relative w-full max-w-[520px] mx-auto overflow-hidden rounded-[18px]" style={{ aspectRatio: '68 / 110' }}>
        <PitchSvg vertical stretch className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 0%, rgba(255,255,255,.10), transparent 60%), linear-gradient(180deg, transparent 70%, rgba(0,0,0,.22))' }} />
        {roles.map((r, i) => {
          const p = L.players[ln.xi[i]];
          const style = { left: `${xy[i][0] * 100}%`, top: `${xy[i][1] * 100}%` };
          if (!p) return <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={style}><EmptyCard width={cardW} label={ROLE_RU[r]} onClick={() => (sel ? tap({ zone: 'xi', i, id: null }) : setPick(i))} /></div>;
          const rating = Math.round(slotRating(p, r));
          return (
            <div key={i} className={cx('absolute -translate-x-1/2 -translate-y-1/2', isSel('xi', i) && 'z-10')} style={style}>
              <PitchCard p={p} team={t} width={cardW} rating={rating} role={r} warn={rating < p.ovr - 2} unavailable={p.team !== t.id || !available(p)} selected={isSel('xi', i)} onClick={() => tap({ zone: 'xi', i, id: p.id })} />
            </div>
          );
        })}
      </div>
      </div>
      <div className="min-w-0">
      <div className="hidden lg:block">{controls}</div>
      <div className="mt-3 glass rounded-[22px] overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-2.5">
          <span className="font-display uppercase tracking-[0.12em] text-[13px] text-muted">Скамейка</span>
          <span className="text-[12px] text-muted">{ln.bench.length} из {BENCH_SIZE} · до 5 замен</span>
        </div>
        <div className="hscroll flex gap-2 px-3 pt-2 pb-3" style={{ scrollSnapType: 'none' }}>
          {ln.bench.map((id, i) => L.players[id] && (
            <PitchCard key={id} p={L.players[id]} team={t} width={cardW} unavailable={!available(L.players[id])} selected={isSel('bench', i)} onClick={() => tap({ zone: 'bench', i, id })} />
          ))}
          {ln.bench.length < BENCH_SIZE && <EmptyCard width={cardW} label="запас" onClick={() => (sel?.zone === 'res' ? tap({ zone: 'bench', i: ln.bench.length, id: null }) : toast('Выберите игрока из резерва, затем нажмите сюда'))} />}
        </div>
      </div>

      <SectionTitle right={<span className="text-[12px] text-muted">{reserves.length} вне заявки на матч</span>}>Резерв</SectionTitle>
      {reserves.length ? (
        <div className="flex flex-wrap gap-2">
          {reserves.map((p, i) => <PitchCard key={p.id} p={p} team={t} width={cardW} unavailable={!available(p)} selected={isSel('res', i)} onClick={() => tap({ zone: 'res', i, id: p.id })} />)}
        </div>
      ) : <div className="text-muted text-[13.5px] px-1">Все игроки в заявке на матч.</div>}

      <div className="flex gap-2 mt-4">
        <Button full onClick={best}>Лучший состав</Button>
        <Button full variant="primary" disabled={!valid} onClick={() => toast('Состав сохранён — в матче сыграют эти одиннадцать', 'good')}>Готово</Button>
      </div>

      <Card className="mt-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[15px] font-semibold">{ln.auto ? 'Состав выбирает штаб' : 'Состав выбираете вы'}</div>
            <div className="text-[12.5px] text-muted leading-snug">{ln.auto ? 'Перед каждым матчем штаб ставит сильнейших доступных игроков.' : 'На поле выйдут именно эти одиннадцать. Если кто-то не сможет играть, игра остановится и предупредит.'}</div>
          </div>
          <button onClick={() => act(() => { t.lineup.auto = !t.lineup.auto; if (t.lineup.auto) aiLineup(L, t, sq, true); })} className={cx('press hit w-[52px] h-[32px] rounded-full shrink-0 transition-colors', ln.auto ? 'bg-white/15' : 'accent-bg')} aria-label="Ручной состав">
            <span className={cx('absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white transition-all', ln.auto ? 'left-[3px]' : 'left-[23px]')} />
          </button>
        </div>
      </Card>

      <SectionTitle>Тактика</SectionTitle>
      <Segmented<Tactic> value={t.tactic} onChange={(v) => act(() => { t.tactic = v; })} options={[{ v: 'defense', label: 'Оборона' }, { v: 'balanced', label: 'Баланс' }, { v: 'attack', label: 'Атака' }]} />
      <div className="text-[12px] text-muted mt-1.5 px-1">Атака: больше моментов у ворот соперника и у своих. Оборона: меньше и там, и там.</div>

      <SectionTitle>Пенальтист</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        <div className="hscroll flex gap-2 p-3" style={{ scrollSnapType: 'none' }}>
          {ln.xi.map((id) => L.players[id]).filter((p) => p && p.pos !== 'G').map((p) => (
            <button key={p.id} onClick={() => manual(() => { t.lineup.pen = p.id; })} className={cx('press hit shrink-0 h-9 px-3 rounded-full text-[13px] border', ln.pen === p.id ? 'bg-white text-[#05070d] border-white' : 'glass')}>{dispShort(p)}</button>
          ))}
        </div>
      </Card>
      </div>
      </div>

      {sel && (
        <div className="fixed dock-x z-30 px-3" style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 10px)' }}>
          <div className="glass-strong rounded-3xl p-2.5 pl-4 flex items-center gap-2 max-w-[560px] mx-auto shadow-2xl">
            <div className="flex-1 min-w-0">
              <div className="font-display uppercase tracking-wide text-[15px] truncate">{selP ? dispName(selP) : 'Свободное место'}</div>
              <div className="text-[12px] text-muted truncate">Нажмите на другого игрока — они поменяются местами</div>
            </div>
            {selP && <Button size="sm" onClick={() => { const id = selP.id; setSel(null); push('player', { id }); }}>Профиль</Button>}
            {sel.zone === 'xi' && <Button size="sm" onClick={() => { setPick(sel.i); setSel(null); }}>Кто лучше?</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSel(null)}>✕</Button>
          </div>
        </div>
      )}

      <Sheet open={pick != null} onClose={() => setPick(null)} title={pick != null ? `Позиция: ${ROLE_RU[roles[pick]]}` : ''} full>
        {pick != null && (
          <div className="flex flex-col">
            <div className="text-[12.5px] text-muted mb-1">Все игроки по силе на этой позиции. Нажмите, чтобы поставить.</div>
            {candidates.map((p) => {
              const at = ln.xi.indexOf(p.id);
              const can = available(p);
              return (
                <div key={p.id} onClick={() => { if (!can) return refuse(p.id); const from: Sel = at >= 0 ? { zone: 'xi', i: at, id: p.id } : onBench.has(p.id) ? { zone: 'bench', i: ln.bench.indexOf(p.id), id: p.id } : { zone: 'res', i: 0, id: p.id }; setPick(null); if (from.zone !== 'xi' || from.i !== pick) swap(from, { zone: 'xi', i: pick, id: ln.xi[pick] ?? null }); }} className={cx('press flex items-center gap-3 py-2 border-b border-white/5', !can && 'opacity-45', ln.xi[pick] === p.id && 'bg-white/5 rounded-xl')}>
                  <Ovr v={Math.round(slotRating(p, roles[pick]))} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="truncate font-medium">{dispName(p)}</span><StatusDots p={p} /></div>
                    <div className="text-[12px] text-muted">{ROLE_RU[p.role]} · общий {p.ovr} · <span style={{ color: fitColor(p.fit) }}>готовность {Math.round(p.fit)}%</span>{isForeign(p, t.country) ? ' · легионер' : ''}</div>
                  </div>
                  {at >= 0 ? <span className="text-[11px] text-good">{at === pick ? 'здесь' : `старт · ${ROLE_RU[roles[at]]}`}</span> : onBench.has(p.id) ? <span className="text-[11px] text-muted">запас</span> : null}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}

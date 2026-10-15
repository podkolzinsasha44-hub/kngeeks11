import { useMemo, useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { foreignOnPitch } from '../../engine/ai';
import { bestLineups, staffLineup, type ShapeOption } from '../../engine/bestxi';
import { wageBill } from '../../engine/contracts';
import { foreignLimit, isForeign } from '../../engine/leagues';
import { BENCH_SIZE, FORMATIONS, FORMATION_IDS, applyBackups, available, lineupValid, setCover, slotRating, squad, teamPower, teamStrength } from '../../engine/lineup';
import type { FormationId, League, Player, Pos, Tactic, Team } from '../../engine/types';
import { Button, Card, Chips, cx, Ovr, Pill, SectionTitle, Segmented } from '../components/kit';
import { Screen, Sheet } from '../components/shell';
import { PlayerRow, StatusDots } from '../components/media';
import { EmptyCard, PitchCard } from '../components/PlayerCard';
import { cardXY, Pitch, usePitchBox } from '../components/Formation';
import { dispName, dispShort, fitColor, money, playerAge, POS_FULL, ROLE_RU } from '../format';
import { useKeep } from '../keep';
import { loanedOut } from '../../engine/loans';
import { NewPlayerSheet } from '../components/NewPlayer';

type TabId = 'pitch' | 'list';

export function Roster({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const [tab, setTab] = useKeep<TabId>('roster.tab', params.tab === 'squad' || params.tab === 'list' ? 'list' : 'pitch');
  const t = L.teams[L.user];
  const sq = squad(L, t.id);
  const push = useNav((s) => s.push);
  // A youth team: the user types in the real squad himself.
  const [create, setCreate] = useState(false);
  const edit = t.lg === 'U17'
    ? <button onClick={() => push('youth', { id: t.id })} className="press h-11 px-3 rounded-full glass text-[14px] font-medium">Изменить состав</button>
    : <button onClick={() => setCreate(true)} className="press h-11 px-3 rounded-full glass text-[14px] font-medium">+ Игрок</button>;
  return (
    <Screen title="Состав" right={edit} subtitle={t.lg === 'U17' ? `${sq.length} игроков` : `${sq.length} игроков · зарплаты ${money(wageBill(L, t.id))} в год`} headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'pitch', label: 'Поле' }, { v: 'list', label: 'Список и контракты' }]} /></div>}>
      {tab === 'list' ? <SquadList L={L} t={t} sq={sq} /> : <PitchEditor L={L} t={t} sq={sq} />}
      {create && <NewPlayerSheet onClose={() => setCreate(false)} />}
    </Screen>
  );
}

function SquadList({ L, t, sq }: { L: League; t: Team; sq: Player[] }) {
  const [sort, setSort] = useKeep<'pos' | 'ovr' | 'age' | 'wage' | 'fit'>('roster.sort', 'pos');
  const xi = new Set(t.lineup.xi), bench = new Set(t.lineup.bench);
  const loans = loanedOut(L);
  const lim = foreignLimit(L, t.lg);
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
      {loans.length > 0 && (
        <>
          <SectionTitle>В аренде · {loans.length}</SectionTitle>
          <Card pad={false} className="overflow-hidden">{loans.map((p) => <PlayerRow key={p.id} p={p} right={<span className="text-[11.5px] text-muted mr-1 text-right">{L.teams[p.team!]?.ru}<br />до 30 июня</span>} />)}</Card>
        </>
      )}
    </>
  );
}

type Zone = 'xi' | 'bench' | 'res';
interface Sel { zone: Zone; i: number; id: number | null }

function PitchEditor({ L, t, sq }: { L: League; t: Team; sq: Player[] }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const [sel, setSel] = useState<Sel | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  /** Starter whose backup is being chosen. */
  const [backFor, setBackFor] = useState<number | null>(null);
  const { box, cardW } = usePitchBox();
  const ln = t.lineup;
  const roles = FORMATIONS[ln.form];
  const xy = useMemo(() => cardXY(ln.form), [ln.form]);
  const lim = foreignLimit(L, t.lg);
  const fOn = foreignOnPitch(L, t);
  const valid = lineupValid(L, t);
  const s = teamStrength(L, t);
  const inXI = new Set(ln.xi), onBench = new Set(ln.bench);
  const reserves = sq.filter((p) => !inXI.has(p.id) && !onBench.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const manual = <T,>(fn: () => T) => {
    if (t.lineup.auto) toast('Ручной состав: штаб больше не меняет его сам. Чтобы игрок оставался в основе при автосоставе — закрепите его 📌', 'info');
    return act(() => { t.lineup.auto = false; return fn(); });
  };
  const ok = (id: number | null) => id != null && !!L.players[id] && available(L.players[id]);
  const covers = Object.entries(ln.cover ?? {}).map(([sub, reg]) => [L.players[Number(sub)], L.players[reg]] as const).filter(([sub, reg]) => sub && reg && !available(reg) && ln.xi.includes(sub.id));
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
      // A starter who is out for now (injury, suspension) gets his place back when he can play: remember who covers.
      for (const [x, y] of [[a, b], [b, a]] as const) {
        if (x.zone === 'xi' && y.zone !== 'xi' && x.id != null && y.id != null && !ok(x.id) && L.players[x.id]?.team === t.id) setCover(l, y.id, x.id);
      }
      put(a.zone, a.i, b.id);
      put(b.zone, b.i, a.id);
      // A starter pushed out by a reserve sits on the bench while there is room.
      const out = a.zone === 'xi' && b.zone === 'res' ? a.id : b.zone === 'xi' && a.zone === 'res' ? b.id : null;
      if (out != null && l.bench.length < BENCH_SIZE && !l.bench.includes(out)) l.bench.push(out);
      l.bench = l.bench.filter((id, k, arr) => id != null && !l.xi.includes(id) && arr.indexOf(id) === k);
      // A pinned starter the user takes out of the eleven is no longer pinned; one who is only covered for keeps it.
      if (l.pinned) {
        const covered = new Set(Object.values(l.cover ?? {}));
        l.pinned = l.pinned.filter((id) => l.xi.includes(id) || covered.has(id));
        if (!l.pinned.length) delete l.pinned;
      }
    });
  };
  /** The backup steps in when the starter is injured or suspended; null removes him. */
  const setBackup = (starter: number, backup: number | null) => {
    act(() => {
      const b = (t.lineup.backups ??= {});
      if (backup == null) delete b[starter]; else b[starter] = backup;
      if (!Object.keys(b).length) delete t.lineup.backups;
      // A starter who is out already: his backup takes the slot now.
      if (backup != null) applyBackups(L, t);
    });
    toast(backup == null ? `У ${dispShort(L.players[starter])} больше нет дублёра` : `${dispShort(L.players[backup])} — дублёр ${dispShort(L.players[starter])}: выйдет вместо него при травме или дисквалификации`, 'good');
  };
  const backups = Object.entries(ln.backups ?? {}).map(([s, b]) => [L.players[Number(s)], L.players[b]] as const).filter(([a, b]) => a && b && a.team === t.id && b.team === t.id);
  const pinnedIds = new Set(ln.pinned ?? []);
  const pinned = (ln.pinned ?? []).map((id) => L.players[id]).filter((p) => p && p.team === t.id);
  /** Pinned starters stay in the eleven when the staff picks the best line-up. */
  const togglePin = (id: number) => {
    const on = !pinnedIds.has(id);
    act(() => {
      const l = t.lineup;
      l.pinned = on ? [...(l.pinned ?? []), id] : (l.pinned ?? []).filter((x) => x !== id);
      if (!l.pinned.length) delete l.pinned;
    });
    toast(on ? `${dispShort(L.players[id])} закреплён в основе — «Лучший состав» его не уберёт` : `${dispShort(L.players[id])} откреплён`, 'good');
  };
  /** FIFA-style: tap one card, tap another — the two swap places. */
  const tap = (b: Sel) => {
    const a = sel;
    if (!a) return setSel(b.id == null ? null : b);
    setSel(null);
    if (a.zone === b.zone && a.i === b.i) return;
    swap(a, b);
  };

  // With the staff in charge a new formation keeps them in charge: they put out the best eleven in it.
  const setForm = (f: FormationId) => (t.lineup.auto ? act(() => { t.lineup.form = f; staffLineup(L, t); setSel(null); }) : manual(() => {
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
  }));
  const [bestOpen, setBestOpen] = useState(false);
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
      {pinned.length > 0 && (
        <div className="mb-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] leading-snug flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div>📌 Закреплены: <b>{pinned.map((p) => dispShort(p)).join(', ')}</b></div>
            <div className="text-muted mt-0.5">«Лучший состав» их не уберёт{pinned.some((p) => !available(p)) ? '; кто сейчас не может играть, вернётся в основу, когда сможет' : ''}.</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => act(() => { delete t.lineup.pinned; })}>Снять</Button>
        </div>
      )}
      {backups.length > 0 && (
        <div className="mb-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] leading-snug">
          <div>🔁 Дублёры: {backups.map(([a, b], k) => <span key={a.id}>{k > 0 && ', '}<b>{dispShort(a)}</b> → {dispShort(b)}</span>)}</div>
          <div className="text-muted mt-0.5">Выйдут вместо основного при травме или красной карточке.</div>
        </div>
      )}
      {!ln.auto && covers.length > 0 && (
        <div className="mb-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] leading-snug">
          {covers.map(([sub, reg]) => <div key={sub.id}>🔄 <b>{dispShort(sub)}</b> временно вместо <b>{dispShort(reg)}</b> ({reg.inj ? `травма, ещё ${reg.inj.days} дн.` : 'дисквалификация'})</div>)}
          <div className="text-muted mt-0.5">Когда они смогут играть, штаб сам вернёт их на место.</div>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="lg:hidden">{controls}</div>
      <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-8 lg:items-start">
      <div className="lg:sticky lg:top-2">
      <Pitch box={box}>
        {roles.map((r, i) => {
          const p = L.players[ln.xi[i]];
          const style = { left: `${xy[i][0] * 100}%`, top: `${xy[i][1] * 100}%` };
          if (!p) return <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={style}><EmptyCard width={cardW} label={ROLE_RU[r]} onClick={() => (sel ? tap({ zone: 'xi', i, id: null }) : setPick(i))} /></div>;
          const rating = Math.round(slotRating(p, r));
          return (
            <div key={i} className={cx('absolute -translate-x-1/2 -translate-y-1/2', isSel('xi', i) && 'z-10')} style={style}>
              <PitchCard p={p} L={L} team={t} width={cardW} rating={rating} role={r} warn={rating < p.ovr - 2} unavailable={p.team !== t.id || !available(p)} pinned={pinnedIds.has(p.id)} selected={isSel('xi', i)} onClick={() => tap({ zone: 'xi', i, id: p.id })} />
            </div>
          );
        })}
      </Pitch>
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
            <PitchCard key={id} p={L.players[id]} L={L} team={t} width={cardW} unavailable={!available(L.players[id])} selected={isSel('bench', i)} onClick={() => tap({ zone: 'bench', i, id })} />
          ))}
          {ln.bench.length < BENCH_SIZE && <EmptyCard width={cardW} label="запас" onClick={() => (sel?.zone === 'res' ? tap({ zone: 'bench', i: ln.bench.length, id: null }) : toast('Выберите игрока из резерва, затем нажмите сюда'))} />}
        </div>
      </div>

      <SectionTitle right={<span className="text-[12px] text-muted">{reserves.length} вне заявки на матч</span>}>Резерв</SectionTitle>
      {reserves.length ? (
        <div className="flex flex-wrap gap-2">
          {reserves.map((p, i) => <PitchCard key={p.id} p={p} L={L} team={t} width={cardW} unavailable={!available(p)} selected={isSel('res', i)} onClick={() => tap({ zone: 'res', i, id: p.id })} />)}
        </div>
      ) : <div className="text-muted text-[13.5px] px-1">Все игроки в заявке на матч.</div>}

      <div className="flex gap-2 mt-4">
        <Button full onClick={() => { setSel(null); setBestOpen(true); }}>Лучший состав</Button>
        <Button full variant="primary" disabled={!valid} onClick={() => toast('Состав сохранён — в матче сыграют эти одиннадцать', 'good')}>Готово</Button>
      </div>

      <Card className="mt-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[15px] font-semibold">Автосостав: лучший состав после каждого матча</div>
            <div className="text-[12.5px] text-muted leading-snug">{ln.auto ? `Включён. После каждого матча, травмы или дисквалификации штаб сам ставит лучший состав в схеме ${ln.form}. Закреплённые 📌 остаются в основе.` : 'Выключен: на поле выйдут именно эти одиннадцать. Если кто-то не сможет играть, игра остановится и предупредит.'}</div>
          </div>
          <button onClick={() => { const on = !t.lineup.auto; act(() => { t.lineup.auto = on; if (on) staffLineup(L, t); }); toast(on ? 'Автосостав включён: штаб ставит лучший состав после каждого матча' : 'Автосостав выключен: состав выбираете вы', 'good'); }} className={cx('press hit relative w-[52px] h-[32px] rounded-full shrink-0 transition-colors', ln.auto ? 'accent-bg' : 'bg-white/15')} aria-label="Автосостав" aria-pressed={ln.auto}>
            <span className={cx('absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white transition-all', ln.auto ? 'left-[23px]' : 'left-[3px]')} />
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
          <div className="glass-strong rounded-3xl p-2.5 max-w-[560px] mx-auto shadow-2xl">
            <div className="flex items-center gap-2 pl-1.5">
              <div className="flex-1 min-w-0">
                <div className="font-display uppercase tracking-wide text-[15px] truncate">{selP ? dispName(selP) : 'Свободное место'}</div>
                <div className="text-[12px] text-muted truncate">Нажмите на другого игрока — они поменяются местами</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSel(null)}>✕</Button>
            </div>
            {/* A second row: on a narrow phone every action keeps its full label. */}
            {selP && (
              <div className={cx('grid gap-2 mt-2', sel.zone === 'xi' ? 'grid-cols-2' : 'grid-cols-1')}>
                {sel.zone === 'xi' && <Button size="sm" full className="!px-2" variant={pinnedIds.has(selP.id) ? 'primary' : 'glass'} onClick={() => { togglePin(selP.id); setSel(null); }}>{pinnedIds.has(selP.id) ? '📌 Открепить' : '📌 Закрепить'}</Button>}
                {sel.zone === 'xi' && <Button size="sm" full className="!px-2" variant={ln.backups?.[selP.id] != null ? 'primary' : 'glass'} onClick={() => { setBackFor(selP.id); setSel(null); }}>{ln.backups?.[selP.id] != null && L.players[ln.backups[selP.id]] ? `🔁 ${dispShort(L.players[ln.backups[selP.id]])}` : '🔁 Дублёр'}</Button>}
                <Button size="sm" full className="!px-2" onClick={() => { const id = selP.id; setSel(null); push('player', { id }); }}>Профиль</Button>
                {sel.zone === 'xi' && <Button size="sm" full className="!px-2" onClick={() => { setPick(sel.i); setSel(null); }}>Кто лучше?</Button>}
              </div>
            )}
          </div>
        </div>
      )}

      {bestOpen && <BestSheet L={L} t={t} onClose={() => setBestOpen(false)} />}
      {backFor != null && L.players[backFor] && <BackupSheet L={L} t={t} sq={sq} starter={L.players[backFor]} onPick={(id) => { setBackup(backFor, id); setBackFor(null); }} onClose={() => setBackFor(null)} />}
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

/** Choosing who replaces a starter while he is injured or suspended: any player outside the eleven. */
function BackupSheet({ L, t, sq, starter, onPick, onClose }: { L: League; t: Team; sq: Player[]; starter: Player; onPick: (id: number | null) => void; onClose: () => void }) {
  const ln = t.lineup;
  const i = ln.xi.indexOf(starter.id);
  const role = i >= 0 ? FORMATIONS[ln.form][i] : starter.role;
  const cur = ln.backups?.[starter.id];
  const list = sq.filter((p) => p.id !== starter.id && (!ln.xi.includes(p.id) || p.id === cur)).sort((a, b) => slotRating(b, role) - slotRating(a, role));
  return (
    <Sheet open onClose={onClose} title={`Дублёр: ${dispShort(starter)}`} full>
      <div className="text-[12.5px] text-muted mb-2 leading-snug">
        Если {dispShort(starter)} ({ROLE_RU[role]}) получит травму или дисквалификацию, вместо него выйдет выбранный игрок — даже если рейтинг у него ниже. Когда основной сможет играть, он вернётся на место.
      </div>
      {cur != null && <Button full variant="danger" className="mb-2" onClick={() => onPick(null)}>Убрать дублёра</Button>}
      <div className="flex flex-col">
        {list.map((p) => (
          <div key={p.id} onClick={() => onPick(p.id)} className={cx('press flex items-center gap-3 py-2 border-b border-white/5', !available(p) && 'opacity-45', p.id === cur && 'bg-white/5 rounded-xl')}>
            <Ovr v={Math.round(slotRating(p, role))} size={38} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5"><span className="truncate font-medium">{dispName(p)}</span><StatusDots p={p} /></div>
              <div className="text-[12px] text-muted">{ROLE_RU[p.role]} · общий {p.ovr} · потенциал <span className={p.pot >= starter.pot ? 'text-good' : ''}>{p.pot}</span> · {playerAge(L, p)} лет</div>
            </div>
            {p.id === cur ? <span className="text-[11px] text-good">дублёр</span> : ln.bench.includes(p.id) ? <span className="text-[11px] text-muted">запас</span> : null}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** The staff try every formation with the strongest available players and rank them by the engine's power. */
function BestSheet({ L, t, onClose }: { L: League; t: Team; onClose: () => void }) {
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const { options, current } = useMemo(() => bestLineups(L, t), [L, t]);
  const pinned = (t.lineup.pinned ?? []).map((id) => L.players[id]).filter((p) => p && p.team === t.id);
  const [open, setOpen] = useState(0);
  const apply = (o: ShapeOption) => {
    act(() => { t.lineup = { ...o.lineup, auto: t.lineup.auto }; });
    toast(`Схема ${o.form}: сила ${o.power.toFixed(1)}`, 'good');
    onClose();
  };
  const top = options[0];
  return (
    <Sheet open onClose={onClose} title="Лучший состав" full>
      <div className="text-[13.5px] text-muted leading-snug mb-3">
        Штаб перебрал все {options.length} схем и в каждой расставил сильнейших доступных игроков — по той же силе, с которой играет матч: атрибуты под роль, знание позиции, форма и готовность.
        {top && (top.power > current + 0.05 ? <> Лучшая — <span className="text-ink font-medium">{top.form}</span>, сильнее текущего состава на <span className="text-good num">{(top.power - current).toFixed(1)}</span>.</> : ' Ваш состав уже не слабее лучшего варианта.')}
        {pinned.length > 0 && <> 📌 Закреплённые остаются в основе в каждой схеме{pinned.some((p) => !available(p)) ? <> (кроме тех, кто сейчас не может играть: {pinned.filter((p) => !available(p)).map(dispShort).join(', ')})</> : ''}; в {t.lineup.form} — на своих местах.</>}
      </div>
      <div className="flex flex-col gap-2.5">
        {options.map((o, k) => {
          const d = o.power - current;
          const xi = new Set(o.lineup.xi), now = new Set(t.lineup.xi);
          const ins = o.lineup.xi.filter((id) => !now.has(id)).map((id) => L.players[id]);
          const outs = t.lineup.xi.filter((id) => !xi.has(id) && L.players[id]).map((id) => L.players[id]);
          const roles = FORMATIONS[o.form];
          return (
            <Card key={o.form} className={cx('!p-3.5', k === 0 && 'ring-1 ring-[var(--accent)]')}>
              <div className="press flex items-center gap-2" onClick={() => setOpen(open === k ? -1 : k)}>
                <span className="num text-[22px] leading-none">{o.form}</span>
                {k === 0 && <Pill color="var(--accent)">лучшая</Pill>}
                {o.form === t.lineup.form && <Pill>сейчас</Pill>}
                <span className="flex-1" />
                <span className="num text-[18px]">{o.power.toFixed(1)}</span>
                <span className={cx('num text-[13px] w-10 text-right', d > 0.05 ? 'text-good' : d < -0.05 ? 'text-bad' : 'text-muted')}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>
              </div>
              <div className="text-[12px] text-muted mt-1">АТК {o.s.att.toFixed(0)} · ЦЕН {o.s.mid.toFixed(0)} · ОБР {o.s.def.toFixed(0)} · ВР {o.s.gk.toFixed(0)}</div>
              <div className="text-[12.5px] mt-1.5 leading-snug">
                {o.off.length ? <span className="text-warn">Не на своей позиции: {o.off.map((x) => `${dispShort(x.p)} (${ROLE_RU[x.p.role]}→${ROLE_RU[x.slot]}, ${Math.round(x.fam * 100)}%)`).join(', ')}</span> : <span className="text-good">Все на своих позициях</span>}
              </div>
              {o.out.length > 0 && <div className="text-[12px] text-muted mt-1 leading-snug">Не в старте: {o.out.map((p) => `${dispShort(p)} ${p.ovr}`).join(', ')} — в этой схеме другие полезнее</div>}
              {open === k && (
                <div className="mt-2.5">
                  {(ins.length > 0 || outs.length > 0) && (
                    <div className="text-[12.5px] leading-snug mb-2">
                      {ins.length > 0 && <div><span className="text-good">В старт:</span> {ins.map(dispShort).join(', ')}</div>}
                      {outs.length > 0 && <div><span className="text-bad">Из старта:</span> {outs.map(dispShort).join(', ')}</div>}
                    </div>
                  )}
                  {o.lineup.xi.map((id, i) => {
                    const p = L.players[id];
                    return (
                      <div key={id} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 text-[13.5px]">
                        <span className="w-9 text-muted text-[12px]">{ROLE_RU[roles[i]]}</span>
                        <span className="flex-1 truncate">{t.lineup.pinned?.includes(id) && '📌 '}{dispName(p)}</span>
                        <Ovr v={Math.round(slotRating(p, roles[i]))} size={30} />
                      </div>
                    );
                  })}
                  <Button variant="primary" full className="mt-3" onClick={() => apply(o)}>Поставить {o.form}</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Sheet>
  );
}

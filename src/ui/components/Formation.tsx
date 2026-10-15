import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { available, FORMATIONS, slotRating, teamPower } from '../../engine/lineup';
import type { FormationId, League, Role, Team } from '../../engine/types';
import { useNav } from '../../store/nav';
import { ROLE_RU } from '../format';
import { PitchSvg } from './charts';
import { EmptyCard, PitchCard } from './PlayerCard';

/** Where the cards stand on the portrait pitch: [left, top] as fractions; own goal at the bottom. */
export function cardXY(form: FormationId): [number, number][] {
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

/** The pitch box and the width of the cards on it, which follows the width of the screen. */
export function usePitchBox() {
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
  return { box, w, cardW: Math.max(54, Math.min(84, w * 0.176)) };
}

/** The portrait pitch the cards stand on. */
export function Pitch({ box, children }: { box: RefObject<HTMLDivElement | null>; children?: ReactNode }) {
  return (
    <div ref={box} className="pitch-frame relative w-full max-w-[520px] mx-auto overflow-hidden rounded-[18px]" style={{ aspectRatio: '68 / 110' }}>
      {/* A layer of its own: the grass grain filter is drawn once, not again whenever a card on top changes. */}
      <div className="absolute inset-0" style={{ willChange: 'transform' }}><PitchSvg vertical stretch className="w-full h-full" /></div>
      {children}
    </div>
  );
}

/** A frosted label in a corner of the pitch. */
export function PitchTag({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <div className={`absolute top-2.5 ${right ? 'right-2.5' : 'left-2.5'} z-10 h-6 px-2.5 rounded-full bg-black/35 border border-white/15 backdrop-blur-md flex items-center num text-[12.5px] tracking-wide text-white/90 pointer-events-none`}>
      {children}
    </div>
  );
}

/** Another club's starting eleven and bench, the way the user sees his own; a tap opens the player. */
export function TeamPitch({ L, t }: { L: League; t: Team }) {
  const push = useNav((s) => s.push);
  const { box, cardW } = usePitchBox();
  const ln = t.lineup;
  const roles = FORMATIONS[ln.form];
  const xy = useMemo(() => cardXY(ln.form), [ln.form]);
  const bench = ln.bench.map((id) => L.players[id]).filter(Boolean);
  return (
    <>
      <Pitch box={box}>
        <PitchTag>{ln.form}</PitchTag>
        <PitchTag right>Сила {teamPower(L, t).toFixed(1)}</PitchTag>
        {roles.map((r, i) => {
          const p = L.players[ln.xi[i]];
          const style = { left: `${xy[i][0] * 100}%`, top: `${xy[i][1] * 100}%` };
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
              {p
                ? <PitchCard p={p} L={L} team={t} width={cardW} rating={Math.round(slotRating(p, r))} role={r} unavailable={!available(p)} onClick={() => push('player', { id: p.id })} />
                : <EmptyCard width={cardW} label={ROLE_RU[r]} />}
            </div>
          );
        })}
      </Pitch>
      {bench.length > 0 && (
        <div className="mt-3 glass rounded-[22px] overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-2.5">
            <span className="font-display uppercase tracking-[0.12em] text-[13px] text-muted">Скамейка</span>
            <span className="text-[12px] text-muted">{bench.length} игроков</span>
          </div>
          <div className="hscroll flex gap-2 px-3 pt-2 pb-3" style={{ scrollSnapType: 'none' }}>
            {bench.map((p) => <PitchCard key={p.id} p={p} L={L} team={t} width={cardW} unavailable={!available(p)} onClick={() => push('player', { id: p.id })} />)}
          </div>
        </div>
      )}
    </>
  );
}

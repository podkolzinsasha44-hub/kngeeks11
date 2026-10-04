import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useState } from 'react';
import type { League, Player, Role, Team } from '../../engine/types';
import { ATTR_SHORT, fitColor, flag, money, photoUrl, playerAge, potLabel, ROLE_RU, tierOf } from '../format';
import { cx } from './kit';
import { clubAccent, clubBase, Silhouette, TeamBadge } from './media';

const TIER_BORDER: Record<string, string> = {
  bronze: 'linear-gradient(140deg,#f0b88a,#8a5330 45%,#d99a6c 70%,#5a3018)',
  silver: 'linear-gradient(140deg,#ffffff,#8f9bb0 40%,#e6ecf5 65%,#5d6778)',
  gold: 'linear-gradient(140deg,#fff3c9,#c9a24b 40%,#ffe7a3 65%,#8a6a22)',
  elite: 'linear-gradient(140deg,#fff3c9,#1a1a1a 35%,#e8c26a 60%,#111 85%)',
  legend: '',
};
/** Transfermarkt portraits come with a background: the edges fade into the card. */
const PHOTO_MASK = 'radial-gradient(ellipse 50% 50% at 50% 46%, #000 62%, transparent 100%)';

export const surname = (p: Player) => (p.ru ?? p.ln).split(' ').slice(-1)[0];
const firstName = (p: Player) => (p.ru ? p.ru.split(' ').slice(0, -1).join(' ') : p.fn);

/** Big collectible card of the player profile: photo, rating, position, attributes; tilts under the finger. */
export function PlayerCard({ p, L, width = 260, interactive = true }: { p: Player; L: League; width?: number; interactive?: boolean }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const [imgErr, setImgErr] = useState(false);
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [9, -9]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-11, 11]), { stiffness: 180, damping: 18 });
  const glareX = useTransform(mx, [-1, 1], ['0%', '100%']);
  const h = width * 1.42;
  const attrs = p.pos === 'G' ? ['ref', 'pos', 'han', 'kic', 'con', 'men'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  const r = p.r as unknown as Record<string, number>;
  const primary = clubBase(t);
  const accent = clubAccent(t);
  const src = photoUrl(p, 'big');

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const b = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - b.left) / b.width) * 2 - 1);
    my.set(((e.clientY - b.top) / b.height) * 2 - 1);
  };
  const reset = () => { mx.set(0); my.set(0); };

  return (
    <div style={{ perspective: 900 }} className="mx-auto w-fit" onPointerMove={onMove} onPointerLeave={reset} onPointerUp={reset}>
      <motion.div
        style={{ width, height: h, rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className={cx('relative rounded-[28px] p-[3px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]', tier === 'legend' && 'holo')}
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        {tier !== 'legend' && <div className="absolute inset-0 rounded-[28px]" style={{ background: TIER_BORDER[tier] }} />}
        <div
          className={cx('relative w-full h-full rounded-[25px] overflow-hidden', tier !== 'bronze' && tier !== 'silver' && 'shine')}
          style={{ background: `linear-gradient(165deg, color-mix(in oklab, ${primary} 85%, #fff 6%) 0%, color-mix(in oklab, ${primary} 55%, #05070d) 48%, #070b14 100%)` }}
        >
          {/* pitch lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]" viewBox="0 0 100 142" preserveAspectRatio="none">
            <circle cx="50" cy="40" r="26" fill="none" stroke="white" strokeWidth="0.6" />
            <line x1="0" y1="40" x2="100" y2="40" stroke="white" strokeWidth="0.6" />
            <rect x="22" y="112" width="56" height="30" fill="none" stroke="white" strokeWidth="0.6" />
            <line x1="0" y1="98" x2="100" y2="98" stroke={accent} strokeWidth="1.4" />
          </svg>
          {/* photo */}
          <div className="absolute left-0 right-0 flex justify-center" style={{ top: h * 0.06, height: h * 0.52 }}>
            <div className="relative" style={{ width: h * 0.5, height: h * 0.52 }}>
              {src && !imgErr ? (
                <img src={src} alt="" className="w-full h-full object-cover object-top" style={{ maskImage: PHOTO_MASK, WebkitMaskImage: PHOTO_MASK }} onError={() => setImgErr(true)} draggable={false} />
              ) : (
                <div className="absolute inset-x-0 bottom-0" style={{ height: h * 0.42 }}><Silhouette p={p} color={accent} /></div>
              )}
            </div>
          </div>
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at var(--gx) 0%, rgba(255,255,255,0.22), transparent 55%)', ['--gx' as string]: glareX }} />
          <div className="absolute left-0 right-0" style={{ top: h * 0.44, height: h * 0.16, background: `linear-gradient(180deg, transparent, color-mix(in oklab, ${primary} 30%, #070b14))` }} />
          {/* header */}
          <div className="absolute left-4 top-4 flex flex-col items-center z-10">
            <div className={cx('num leading-none font-semibold', tier === 'gold' || tier === 'elite' ? 'text-gradient-gold' : 'text-white')} style={{ fontSize: width * 0.17 }}>{p.ovr}</div>
            <div className="font-display text-[13px] tracking-widest text-white/85 mt-0.5">{ROLE_RU[p.role]}</div>
            <div className="text-[18px] mt-1 leading-none">{flag(p.ctry)}</div>
            {t && <span className="mt-1.5"><TeamBadge team={t} size={28} /></span>}
          </div>
          <div className="absolute right-3.5 top-4 z-10 flex flex-col items-end gap-1">
            {p.team && p.num != null && <div className="num text-white/30 leading-none" style={{ fontSize: width * 0.11 }}>#{p.num}</div>}
            {p.foot && <div className="text-[10px] tracking-widest uppercase text-white/45">{p.foot === 'L' ? 'левша' : p.foot === 'B' ? 'обе ноги' : 'правша'}</div>}
          </div>
          {/* name */}
          <div className="absolute left-0 right-0 text-center px-3" style={{ top: h * 0.565 }}>
            <div className="text-white/70 text-[12px] uppercase tracking-[0.2em] truncate">{firstName(p) || ' '}</div>
            <div className="font-display uppercase text-white leading-[1.05] truncate" style={{ fontSize: width * 0.105 }}>{surname(p)}</div>
          </div>
          <div className="absolute left-5 right-5 h-px" style={{ top: h * 0.705, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
          {/* attributes */}
          <div className="absolute left-4 right-4 grid grid-cols-3 gap-y-1.5" style={{ top: h * 0.73 }}>
            {attrs.map((k) => (
              <div key={k} className="flex items-baseline justify-center gap-1.5">
                <span className="num text-white text-[18px] leading-none">{r[k]}</span>
                <span className="text-[10px] tracking-wider text-white/55">{ATTR_SHORT[k]}</span>
              </div>
            ))}
          </div>
          {/* footer */}
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 text-[11.5px] text-white/70 px-3 whitespace-nowrap">
            <span>{playerAge(L, p)} лет</span>
            <span className="opacity-40">·</span>
            <span className="truncate">{p.c ? `${money(p.c.wage)}/год до ${p.c.until}` : 'без контракта'}</span>
            <span className="opacity-40">·</span>
            <span>POT {potLabel(L, p)}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Small collectible tile used in lists of cards. */
export function MiniCard({ p, L, onClick }: { p: Player; L: League; onClick?: () => void }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const [err, setErr] = useState(false);
  const src = photoUrl(p, 'header');
  return (
    <div onClick={onClick} className={cx('press relative rounded-2xl p-[2px]', tier === 'legend' && 'holo')} style={tier !== 'legend' ? { background: TIER_BORDER[tier] } : undefined}>
      <div className="relative rounded-[14px] overflow-hidden aspect-[0.72]" style={{ background: `linear-gradient(165deg, ${clubBase(t)}, #070b14 75%)` }}>
        <div className="absolute inset-x-0 top-3 bottom-8 flex justify-center">
          {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className="h-full object-cover object-top" style={{ maskImage: PHOTO_MASK, WebkitMaskImage: PHOTO_MASK }} /> : <div className="w-3/4 self-end"><Silhouette p={p} color={clubAccent(t)} /></div>}
        </div>
        <div className="absolute left-2 top-1.5 num text-[20px] text-white leading-none">{p.ovr}</div>
        <div className="absolute left-2 top-7 font-display text-[10px] text-white/70">{ROLE_RU[p.role]}</div>
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-1 bottom-1.5 text-center font-display uppercase text-[11px] text-white truncate">{surname(p)}</div>
      </div>
    </div>
  );
}

/** Round photo inside a pitch tile; falls back to the silhouette. */
function TilePhoto({ p, team, size }: { p: Player; team: Team | null; size: number }) {
  const [err, setErr] = useState(false);
  const src = photoUrl(p, 'header');
  const bg = team ? `radial-gradient(circle at 50% 30%, color-mix(in oklab, ${clubBase(team)} 70%, #1a2440), #0b1120)` : 'radial-gradient(circle at 50% 30%, #1b2a44, #0b1120)';
  return (
    <span className="relative block rounded-full overflow-hidden shrink-0" style={{ width: size, height: size, background: bg, boxShadow: '0 0 0 1.5px rgba(255,255,255,.14)' }}>
      {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className="absolute inset-0 w-full h-full object-cover object-top" draggable={false} /> : <Silhouette p={p} color={clubAccent(team)} />}
    </span>
  );
}

/**
 * A player on the team sheet, drawn like the line tiles of NHL GM: role, photo, surname, rating.
 * `rating` and `role` show how the player rates in the slot he is standing in.
 */
export function PitchCard({ p, team, width, rating, role, selected, unavailable, warn, onClick }: {
  p: Player; team: Team | null; width: number; rating?: number; role?: Role; selected?: boolean; unavailable?: boolean; warn?: boolean; onClick?: () => void;
}) {
  const v = rating ?? p.ovr;
  const h = Math.round(width * 1.3);
  return (
    <button
      onClick={onClick}
      className={cx(
        'press relative shrink-0 rounded-2xl border flex flex-col items-center transition-colors',
        selected ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_26%,#0b1120)]' : 'border-white/12 bg-[rgba(9,13,24,0.78)]',
        selected && 'z-10',
      )}
      style={{ width, height: h, padding: `${width * 0.07}px ${width * 0.05}px`, gap: width * 0.035, WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)', boxShadow: selected ? '0 0 0 2px var(--accent), 0 8px 18px rgba(0,0,0,.5)' : '0 6px 14px rgba(0,0,0,.45)' }}
      aria-label={`${surname(p)}, ${ROLE_RU[role ?? p.role]}, рейтинг ${v}`}
    >
      <span className="absolute font-display text-muted leading-none" style={{ left: width * 0.09, top: width * 0.08, fontSize: Math.max(9, width * 0.13) }}>{ROLE_RU[role ?? p.role]}</span>
      <span className={cx('block', unavailable && 'grayscale opacity-60')} style={{ marginTop: width * 0.1 }}><TilePhoto p={p} team={team} size={width * 0.54} /></span>
      <span className="font-medium truncate w-full text-center leading-tight" style={{ fontSize: Math.max(10, width * 0.155) }}>{surname(p)}</span>
      <span className="flex items-center leading-none" style={{ gap: width * 0.05 }}>
        <span className="num" style={{ fontSize: Math.max(12, width * 0.2), color: warn || unavailable ? '#ff5a5f' : undefined }}>{v}</span>
        <span className="rounded-full overflow-hidden" style={{ width: width * 0.24, height: 3, background: 'rgba(255,255,255,.12)' }}>
          <span className="block h-full" style={{ width: `${p.fit}%`, background: fitColor(p.fit) }} />
        </span>
      </span>
      {(p.inj || !!p.susp) && (
        <span className="absolute rounded-full bg-bad text-white font-bold flex items-center justify-center" style={{ right: width * 0.06, top: width * 0.06, width: width * 0.22, height: width * 0.22, fontSize: width * 0.13 }}>
          {p.inj ? '✚' : '!'}
        </span>
      )}
    </button>
  );
}

/** Empty place on the pitch or on the bench. */
export function EmptyCard({ width, label, onClick }: { width: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="press relative shrink-0 rounded-2xl border border-dashed border-white/35 bg-black/30 flex flex-col items-center justify-center text-white/75" style={{ width, height: Math.round(width * 1.3) }}>
      <span style={{ fontSize: width * 0.34, lineHeight: 1 }}>+</span>
      <span className="font-display" style={{ fontSize: Math.max(10, width * 0.14) }}>{label}</span>
    </button>
  );
}

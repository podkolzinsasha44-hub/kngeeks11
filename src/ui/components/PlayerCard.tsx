import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useState, type ReactNode } from 'react';
import type { League, Player, Role, Team } from '../../engine/types';
import { ATTR_SHORT, fitColor, flag, money, photoUrl, playerAge, potLabel, ROLE_RU, tierOf, TIERS, type Tier } from '../format';
import { cx } from './kit';
import { clubAccent, clubBase, Silhouette, TeamBadge } from './media';

/** Tiers from epic up get the animated extras. */
const RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2, elite: 3, epic: 4, legend: 5, icon: 6 };
/** Rating digits: metal for the metal tiers, glowing white for the rare ones. */
const NUM_CLASS: Record<Tier, string> = { bronze: 'text-[#ffd9b8]', silver: 'text-white', gold: 'text-gradient-gold', elite: 'text-gradient-ice', epic: 'text-white glow-num', legend: 'text-gradient-gold glow-num', icon: 'text-white glow-num' };
const SPARKLES: [number, number, number][] = [[12, 22, 0], [84, 18, 0.7], [20, 48, 1.4], [78, 44, 0.3], [50, 8, 1.9], [90, 60, 1.1], [8, 64, 2.2]];

/** Background pattern of each tier. */
function Pattern({ tier, accent }: { tier: Tier; accent: string }) {
  const c = TIERS[tier].color;
  if (tier === 'bronze' || tier === 'silver' || tier === 'gold') {
    return (
      <svg className="absolute inset-0 w-full h-full opacity-[0.12]" viewBox="0 0 100 142" preserveAspectRatio="none">
        {Array.from({ length: 14 }, (_, i) => <line key={i} x1={-40 + i * 12} y1="0" x2={i * 12} y2="142" stroke="white" strokeWidth="0.35" />)}
        <line x1="0" y1="98" x2="100" y2="98" stroke={accent} strokeWidth="1.2" opacity="0.9" />
      </svg>
    );
  }
  if (tier === 'elite') {
    return (
      <svg className="absolute inset-0 w-full h-full opacity-[0.16]" viewBox="0 0 100 142" preserveAspectRatio="none">
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i * 12 - 6} 0 L${i * 12 + 6} 12 L${i * 12 - 6} 24 L${i * 12 - 18} 12 Z`} fill="none" stroke={c} strokeWidth="0.4" />)}
        {Array.from({ length: 9 }, (_, i) => <path key={`b${i}`} d={`M${i * 12} 12 L${i * 12 + 12} 24 L${i * 12} 36 L${i * 12 - 12} 24 Z`} fill="none" stroke={c} strokeWidth="0.3" />)}
        <line x1="0" y1="98" x2="100" y2="98" stroke="#ffe7a3" strokeWidth="1" />
      </svg>
    );
  }
  // epic, legend, icon: light rays and streaks
  return (
    <>
      <div className="absolute rays" style={{ left: '-30%', right: '-30%', top: '-18%', aspectRatio: '1' }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 142" preserveAspectRatio="none" style={{ opacity: 0.35 }}>
        <path d="M-5 30 L30 10 L22 26 L60 2" fill="none" stroke={c} strokeWidth="0.6" />
        <path d="M105 46 L72 64 L80 50 L40 72" fill="none" stroke={c} strokeWidth="0.5" />
        <line x1="0" y1="98" x2="100" y2="98" stroke={c} strokeWidth="1.4" />
      </svg>
    </>
  );
}

/** The real photo only, as large as the card allows: whatever the photo shows (head, shoulders) is what is seen. */
function Bust({ p, team, w, top, onError, err }: { p: Player; team: Team | null; w: number; top: number; onError: () => void; err: boolean }) {
  const src = photoUrl(p, 'big');
  const photoW = w * 0.62, photoH = photoW / (300 / 390);
  const fade = 'linear-gradient(90deg, transparent, #000 13%, #000 87%, transparent), linear-gradient(180deg, transparent, #000 8%, #000 80%, transparent)';
  return (
    <div className="absolute left-1/2 -translate-x-1/2" style={{ top, width: photoW, height: photoH }}>
      {src && !err ? (
        <img
          src={src}
          alt=""
          onError={onError}
          draggable={false}
          className="w-full h-full object-cover"
          style={{ maskImage: fade, WebkitMaskImage: fade, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}
        />
      ) : (
        <div className="absolute inset-x-0 bottom-0" style={{ height: photoH * 0.8 }}><Silhouette p={p} color={clubAccent(team)} /></div>
      )}
    </div>
  );
}

export const surname = (p: Player) => (p.ru ?? p.ln).split(' ').slice(-1)[0];
const firstName = (p: Player) => (p.ru ? p.ru.split(' ').slice(0, -1).join(' ') : p.fn);

/** The tier frame with its face; children are drawn on the face. */
function Frame({ tier, radius, pad, className, style, children }: { tier: Tier; radius: number; pad: number; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <div className={cx('relative', `frame-${tier}`, className)} style={{ borderRadius: radius, padding: pad, ...style }}>
      <div className={cx('relative w-full h-full overflow-hidden', `face-${tier}`, RANK[tier] >= 2 && 'shine')} style={{ borderRadius: radius - pad }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Big collectible card of the player profile, styled after FIFA Mobile: tier frame and decor,
 * the player from the chest up, rating, position, attributes. Tilts under the finger.
 */
export function PlayerCard({ p, L, width = 260, interactive = true }: { p: Player; L: League; width?: number; interactive?: boolean }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const rank = RANK[tier];
  const [imgErr, setImgErr] = useState(false);
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [9, -9]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-11, 11]), { stiffness: 180, damping: 18 });
  const glareX = useTransform(mx, [-1, 1], ['0%', '100%']);
  const foilX = useTransform(mx, [-1, 1], ['0%', '100%']);
  const h = width * 1.42;
  const attrs = p.pos === 'G' ? ['ref', 'pos', 'han', 'kic', 'con', 'men'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  const r = p.r as unknown as Record<string, number>;
  const accent = clubAccent(t);
  const glow = TIERS[tier].color;

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
        className="relative shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] rounded-[28px]"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      >
        <Frame tier={tier} radius={28} pad={rank >= 4 ? 4 : 3} className="w-full h-full">
          <Pattern tier={tier} accent={accent} />
          {/* club colour wash behind the player */}
          <div className="absolute inset-x-0 top-0" style={{ height: h * 0.6, background: `radial-gradient(60% 55% at 50% 45%, color-mix(in oklab, ${clubBase(t)} 55%, transparent), transparent 75%)` }} />
          <Bust p={p} team={t} w={width} top={h * 0.035} err={imgErr} onError={() => setImgErr(true)} />
          {tier === 'icon' && <motion.div className="absolute inset-0 foil pointer-events-none" style={{ ['--fx' as string]: foilX }} />}
          {rank >= 5 && SPARKLES.map(([x, y, d], i) => <span key={i} className="sparkle" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, transform: 'scale(0)' }} />)}
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at var(--gx) 0%, rgba(255,255,255,0.2), transparent 55%)', ['--gx' as string]: glareX }} />
          {/* name band */}
          <div className="absolute inset-x-0" style={{ top: h * 0.53, height: h * 0.2, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.55) 45%, rgba(0,0,0,.35))' }} />
          {/* header */}
          <div className="absolute left-4 top-4 flex flex-col items-center z-10" style={{ ['--glow' as string]: glow }}>
            <div className={cx('num leading-none font-semibold', NUM_CLASS[tier])} style={{ fontSize: width * 0.17 }}>{p.ovr}</div>
            <div className="font-display text-[13px] tracking-widest text-white/90 mt-0.5">{ROLE_RU[p.role]}</div>
            <div className="text-[18px] mt-1 leading-none">{flag(p.ctry)}</div>
            {t && <span className="mt-1.5"><TeamBadge team={t} size={28} /></span>}
          </div>
          <div className="absolute right-3 top-3.5 z-10 flex flex-col items-end gap-1">
            <TierBadge tier={tier} />
            <div className="text-[10px] tracking-widest uppercase text-white/55 mt-0.5">{p.foot === 'L' ? 'левша' : p.foot === 'B' ? 'обе ноги' : 'правша'}</div>
          </div>
          {/* name */}
          <div className="absolute left-0 right-0 text-center px-3 z-10" style={{ top: h * 0.6 }}>
            <div className="text-white/70 text-[12px] uppercase tracking-[0.2em] truncate">{firstName(p) || ' '}</div>
            <div className="font-display uppercase text-white leading-[1.05] truncate drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]" style={{ fontSize: width * 0.105 }}>{surname(p)}</div>
          </div>
          <div className="absolute left-5 right-5 h-px z-10" style={{ top: h * 0.735, background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }} />
          {/* attributes */}
          <div className="absolute left-4 right-4 grid grid-cols-3 gap-y-1.5 z-10" style={{ top: h * 0.755 }}>
            {attrs.map((k) => (
              <div key={k} className="flex items-baseline justify-center gap-1.5">
                <span className="num text-white text-[18px] leading-none">{r[k]}</span>
                <span className="text-[10px] tracking-wider text-white/60">{ATTR_SHORT[k]}</span>
              </div>
            ))}
          </div>
          {/* footer */}
          <div className="absolute left-0 right-0 bottom-3 flex items-center justify-center gap-2 text-[11.5px] text-white/75 px-3 whitespace-nowrap z-10">
            <span>{playerAge(L, p)} лет</span>
            <span className="opacity-40">·</span>
            <span className="truncate">{p.c ? `${money(p.c.wage)}/год до ${p.c.until}` : 'без контракта'}</span>
            <span className="opacity-40">·</span>
            <span>POT {potLabel(L, p)}</span>
          </div>
        </Frame>
      </motion.div>
    </div>
  );
}

/** Small pill with the name of the tier. */
export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  const c = TIERS[tier].color;
  const rare = RANK[tier] >= 4;
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full font-display uppercase tracking-[0.14em] leading-none', small ? 'px-1.5 h-4 text-[9px]' : 'px-2 h-5 text-[10.5px]', tier === 'icon' && 'holo text-[#1b1033]')}
      style={tier === 'icon' ? undefined : { color: rare ? '#fff' : c, background: rare ? `color-mix(in oklab, ${c} 55%, transparent)` : `color-mix(in oklab, ${c} 18%, rgba(0,0,0,.35))`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 55%, transparent)` }}
    >
      {tier === 'icon' ? '★' : tier === 'legend' ? '♛' : null}{TIERS[tier].name}
    </span>
  );
}

/** Small collectible tile used in lists of cards. */
export function MiniCard({ p, L, onClick }: { p: Player; L: League; onClick?: () => void }) {
  const t = p.team ? L.teams[p.team] : null;
  const tier = tierOf(p.ovr);
  const [err, setErr] = useState(false);
  const src = photoUrl(p, 'big');
  return (
    <div onClick={onClick} className="press">
      <Frame tier={tier} radius={16} pad={2} className="aspect-[0.72]">
        <div className="absolute inset-x-0 top-3 bottom-8 flex justify-center">
          {src && !err ? <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className="h-full object-contain" style={{ maskImage: 'linear-gradient(180deg, #000 70%, transparent)', WebkitMaskImage: 'linear-gradient(180deg, #000 70%, transparent)' }} /> : <div className="w-3/4 self-end"><Silhouette p={p} color={clubAccent(t)} /></div>}
        </div>
        <div className={cx('absolute left-2 top-1.5 num text-[20px] leading-none', NUM_CLASS[tier])} style={{ ['--glow' as string]: TIERS[tier].color }}>{p.ovr}</div>
        <div className="absolute left-2 top-7 font-display text-[10px] text-white/75">{ROLE_RU[p.role]}</div>
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-1 bottom-1.5 text-center font-display uppercase text-[11px] text-white truncate">{surname(p)}</div>
      </Frame>
    </div>
  );
}

/**
 * A player on the team sheet as a small FIFA-style card in the colours of his tier:
 * rating, position, photo, surname, fitness. `rating` and `role` show how he rates in the slot he stands in.
 */
export function PitchCard({ p, team, width, rating, role, selected, unavailable, warn, onClick }: {
  p: Player; team: Team | null; width: number; rating?: number; role?: Role; selected?: boolean; unavailable?: boolean; warn?: boolean; onClick?: () => void;
}) {
  const [err, setErr] = useState(false);
  const v = rating ?? p.ovr;
  const h = Math.round(width * 1.4);
  const tier = tierOf(p.ovr);
  const src = photoUrl(p, 'header');
  const fade = 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent), linear-gradient(180deg, #000 62%, transparent 96%)';
  return (
    <button
      onClick={onClick}
      className={cx('press relative block shrink-0 transition-transform duration-150', selected && '-translate-y-1 scale-[1.08] z-10')}
      style={{ width, height: h, filter: selected ? 'drop-shadow(0 0 2px var(--accent)) drop-shadow(0 0 8px var(--accent))' : 'drop-shadow(0 5px 8px rgba(0,0,0,.55))' }}
      aria-label={`${surname(p)}, ${ROLE_RU[role ?? p.role]}, рейтинг ${v}, ${TIERS[tier].name}`}
    >
      <Frame tier={tier} radius={Math.max(9, width * 0.15)} pad={RANK[tier] >= 4 ? 2.5 : 2} className={cx('w-full h-full', unavailable && 'grayscale opacity-70')}>
        <div className="absolute inset-x-0 top-0" style={{ height: h * 0.62, background: `radial-gradient(70% 60% at 60% 45%, color-mix(in oklab, ${clubBase(team)} 50%, transparent), transparent 80%)` }} />
        {/* photo */}
        <div className="absolute" style={{ right: 0, top: h * 0.04, width: width * 0.72, height: h * 0.6 }}>
          {src && !err ? (
            <img src={src} alt="" loading="lazy" draggable={false} onError={() => setErr(true)} className="w-full h-full object-cover object-top" style={{ maskImage: fade, WebkitMaskImage: fade, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }} />
          ) : (
            <div className="absolute inset-x-0 bottom-0" style={{ height: h * 0.5 }}><Silhouette p={p} color={clubAccent(team)} /></div>
          )}
        </div>
        {RANK[tier] >= 5 && <><span className="sparkle" style={{ left: '70%', top: '8%', width: 8, height: 8 }} /><span className="sparkle" style={{ left: '14%', top: '52%', width: 7, height: 7, animationDelay: '1.2s' }} /></>}
        {/* rating and position */}
        <span className="absolute flex flex-col items-center leading-none z-10 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.85))]" style={{ left: width * 0.07, top: width * 0.08, ['--glow' as string]: TIERS[tier].color }}>
          <span className={cx('num font-semibold', warn ? 'text-bad' : NUM_CLASS[tier])} style={{ fontSize: Math.max(13, width * 0.27) }}>{v}</span>
          <span className="font-display text-white/90" style={{ fontSize: Math.max(8.5, width * 0.13), marginTop: width * 0.02 }}>{ROLE_RU[role ?? p.role]}</span>
        </span>
        {/* name band */}
        <span className="absolute inset-x-0 bottom-0 flex flex-col items-center" style={{ height: h * 0.34, paddingTop: h * 0.08, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.6) 38%, rgba(0,0,0,.7))' }}>
          <span className="font-display uppercase text-white truncate w-full text-center leading-none" style={{ fontSize: Math.max(9, width * 0.145), padding: `0 ${width * 0.06}px` }}>{surname(p)}</span>
          <span className="rounded-full overflow-hidden" style={{ width: width * 0.42, height: 3, marginTop: h * 0.045, background: 'rgba(255,255,255,.18)' }}>
            <span className="block h-full" style={{ width: `${p.fit}%`, background: fitColor(p.fit) }} />
          </span>
        </span>
      </Frame>
      {(p.inj || !!p.susp) && (
        <span className="absolute rounded-full bg-bad text-white font-bold flex items-center justify-center z-20" style={{ right: -3, top: -4, width: Math.max(14, width * 0.26), height: Math.max(14, width * 0.26), fontSize: Math.max(9, width * 0.15) }}>
          {p.inj ? '✚' : '!'}
        </span>
      )}
    </button>
  );
}

/** Empty place on the pitch or on the bench. */
export function EmptyCard({ width, label, onClick }: { width: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="press relative shrink-0 border border-dashed border-white/40 bg-black/30 flex flex-col items-center justify-center text-white/75" style={{ width, height: Math.round(width * 1.4), borderRadius: Math.max(9, width * 0.15) }}>
      <span style={{ fontSize: width * 0.34, lineHeight: 1 }}>+</span>
      <span className="font-display" style={{ fontSize: Math.max(10, width * 0.14) }}>{label}</span>
    </button>
  );
}

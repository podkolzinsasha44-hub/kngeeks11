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

/** Head-and-shoulders portrait: the real photo above a shirt drawn in the club colours. */
function Bust({ p, team, w, top, onError, err }: { p: Player; team: Team | null; w: number; top: number; onError: () => void; err: boolean }) {
  const keeper = p.pos === 'G';
  const shirt = keeper ? '#f2c230' : team?.primary ?? '#3a4458';
  const trim = keeper ? '#1b1b1b' : team?.secondary ?? '#aab4c8';
  const src = photoUrl(p, 'big');
  const torsoW = w * 0.94, torsoH = torsoW * 0.42;
  const photoW = w * 0.52, photoH = photoW / (300 / 390);
  const neck = top + photoH * 0.86;
  const uid = `bust${p.id}`;
  return (
    <>
      <svg className="absolute left-1/2 -translate-x-1/2" style={{ top: neck - torsoH * 0.12, width: torsoW, height: torsoH }} viewBox="0 0 200 84">
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shirt} />
            <stop offset="1" stopColor={`color-mix(in oklab, ${shirt} 55%, #000)`} />
          </linearGradient>
          <radialGradient id={`${uid}h`} cx="0.5" cy="0" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M0 84 L0 56 C0 36 16 26 44 19 L76 9 C86 20 114 20 124 9 L156 19 C184 26 200 36 200 56 L200 84 Z" fill={`url(#${uid})`} />
        <path d="M0 84 L0 56 C0 36 16 26 44 19 L76 9 C86 20 114 20 124 9 L156 19 C184 26 200 36 200 56 L200 84 Z" fill={`url(#${uid}h)`} />
        <path d="M44 19 C30 23 16 32 10 48" fill="none" stroke={trim} strokeWidth="3" opacity="0.8" />
        <path d="M156 19 C170 23 184 32 190 48" fill="none" stroke={trim} strokeWidth="3" opacity="0.8" />
        <path d="M76 9 C86 20 114 20 124 9 L118 7 C108 16 92 16 82 7 Z" fill={trim} />
      </svg>
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top, width: photoW, height: photoH }}>
        {src && !err ? (
          <img
            src={src}
            alt=""
            onError={onError}
            draggable={false}
            className="w-full h-full object-cover"
            style={{
              maskImage: 'linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent), linear-gradient(180deg, transparent, #000 14%, #000 74%, transparent 92%)',
              WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent), linear-gradient(180deg, transparent, #000 14%, #000 74%, transparent 92%)',
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            }}
          />
        ) : (
          <div className="absolute inset-x-0 bottom-0" style={{ height: photoH * 0.9 }}><Silhouette p={p} color={clubAccent(team)} /></div>
        )}
      </div>
    </>
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
          <Bust p={p} team={t} w={width} top={h * 0.03} err={imgErr} onError={() => setImgErr(true)} />
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

/** Round photo inside a pitch tile; falls back to the silhouette. */
function TilePhoto({ p, team, size, ring }: { p: Player; team: Team | null; size: number; ring: string }) {
  const [err, setErr] = useState(false);
  const src = photoUrl(p, 'header');
  const bg = team ? `radial-gradient(circle at 50% 30%, color-mix(in oklab, ${clubBase(team)} 70%, #1a2440), #0b1120)` : 'radial-gradient(circle at 50% 30%, #1b2a44, #0b1120)';
  return (
    <span className="relative block rounded-full overflow-hidden shrink-0" style={{ width: size, height: size, background: bg, boxShadow: `0 0 0 2px ${ring}` }}>
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
  const tier = tierOf(p.ovr);
  const c = TIERS[tier].color;
  const rare = RANK[tier] >= 4;
  const idle = `inset 0 0 0 1px color-mix(in oklab, ${c} ${rare ? 70 : 35}%, transparent), 0 6px 14px rgba(0,0,0,.45)${rare ? `, 0 0 14px -3px ${c}` : ''}`;
  return (
    <button
      onClick={onClick}
      className={cx(
        'press relative shrink-0 rounded-2xl border flex flex-col items-center transition-colors',
        selected ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_26%,#0b1120)]' : 'border-transparent bg-[rgba(9,13,24,0.78)]',
        selected && 'z-10',
      )}
      style={{ width, height: h, padding: `${width * 0.07}px ${width * 0.05}px`, gap: width * 0.035, WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)', boxShadow: selected ? '0 0 0 2px var(--accent), 0 8px 18px rgba(0,0,0,.5)' : idle }}
      aria-label={`${surname(p)}, ${ROLE_RU[role ?? p.role]}, рейтинг ${v}`}
    >
      <span className="absolute font-display text-muted leading-none" style={{ left: width * 0.09, top: width * 0.08, fontSize: Math.max(9, width * 0.13) }}>{ROLE_RU[role ?? p.role]}</span>
      <span className={cx('block', unavailable && 'grayscale opacity-60')} style={{ marginTop: width * 0.1 }}><TilePhoto p={p} team={team} size={width * 0.54} ring={c} /></span>
      <span className="font-medium truncate w-full text-center leading-tight" style={{ fontSize: Math.max(10, width * 0.155) }}>{surname(p)}</span>
      <span className="flex items-center leading-none" style={{ gap: width * 0.05 }}>
        <span className="num" style={{ fontSize: Math.max(12, width * 0.2), color: warn || unavailable ? '#ff5a5f' : c }}>{v}</span>
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

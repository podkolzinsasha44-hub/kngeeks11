import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { playerClub } from '../../engine/ucl';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { League, Player, Role, Team } from '../../engine/types';
import { useGame } from '../../store/game';
import { ATTR_SHORT, cardOf, fitColor, money, photoUrl, playerAge, potLabel, ROLE_RU, TIERS, type Tier } from '../format';
import { cx } from './kit';
import { clubAccent, Flag, Silhouette, TeamBadge } from './media';

/**
 * How each edition looks. Light cards (metal and the legends) carry dark text, the rest white.
 * fx: 0 — plain metal, 1 — gold shards, 2 — light rays, 3 — rays, sparkles and holographic foil.
 */
const LOOK: Record<Tier, { ink: string; sub: string; num: string; fx: 0 | 1 | 2 | 3 }> = {
  bronze: { ink: '#3a2414', sub: 'rgba(58,36,20,.7)', num: '#3a2414', fx: 0 },
  silver: { ink: '#252a33', sub: 'rgba(37,42,51,.7)', num: '#252a33', fx: 0 },
  gold: { ink: '#3b2b07', sub: 'rgba(59,43,7,.72)', num: '#3b2b07', fx: 1 },
  rare: { ink: '#3b2a05', sub: 'rgba(59,42,5,.72)', num: '#3b2a05', fx: 1 },
  epic: { ink: '#ffffff', sub: 'rgba(230,205,255,.8)', num: '#ffffff', fx: 2 },
  star: { ink: '#fff3c9', sub: 'rgba(255,215,106,.8)', num: '#ffd76a', fx: 2 },
  world: { ink: '#ffffff', sub: 'rgba(255,200,240,.85)', num: '#ffffff', fx: 3 },
  icon: { ink: '#3a2f14', sub: 'rgba(122,99,49,.9)', num: '#8a6a22', fx: 3 },
  toty: { ink: '#ffffff', sub: 'rgba(255,233,166,.85)', num: '#ffe9a6', fx: 2 },
  ucl: { ink: '#ffffff', sub: 'rgba(170,200,255,.85)', num: '#ffffff', fx: 2 },
  tots: { ink: '#ffffff', sub: 'rgba(160,250,240,.85)', num: '#ffffff', fx: 2 },
  hero: { ink: '#ffffff', sub: 'rgba(255,211,110,.85)', num: '#ffd36e', fx: 2 },
  future: { ink: '#ffffff', sub: 'rgba(200,255,150,.85)', num: '#a6ff4d', fx: 3 },
};
const SPARKLES: [number, number, number][] = [[12, 24, 0], [84, 16, 0.7], [20, 46, 1.4], [80, 42, 0.3], [52, 8, 1.9], [88, 58, 1.1], [10, 60, 2.2]];

/** Background decor of the edition, drawn on the face behind the player. */
function Decor({ tier }: { tier: Tier }) {
  const { fx } = LOOK[tier];
  const c = TIERS[tier].color;
  if (fx === 0) {
    return (
      <svg className="absolute inset-0 w-full h-full opacity-[0.22]" viewBox="0 0 100 140" preserveAspectRatio="none">
        {Array.from({ length: 16 }, (_, i) => <line key={i} x1={-40 + i * 10} y1="0" x2={i * 10} y2="140" stroke="white" strokeWidth="0.4" />)}
      </svg>
    );
  }
  if (fx === 1) {
    // Faceted gold, as on the FC gold cards.
    return (
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none" style={{ opacity: tier === 'rare' ? 0.55 : 0.4 }}>
        <g fill="none" stroke="#fffbe6" strokeWidth="0.45">
          <path d="M100 8 L58 40 L100 62 M58 40 L70 0 M58 40 L40 72 L100 62 M40 72 L100 96 M70 0 L100 30" />
          <path d="M0 40 L22 18 L8 0 M22 18 L34 46 L0 70" opacity="0.6" />
        </g>
        <path d="M58 40 L100 62 L100 8 Z" fill="#ffffff" opacity="0.12" />
        <path d="M40 72 L100 96 L100 62 Z" fill="#000000" opacity="0.05" />
      </svg>
    );
  }
  return (
    <>
      <div className="absolute rays" style={{ left: '-30%', right: '-30%', top: '-16%', aspectRatio: '1' }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none" style={{ opacity: 0.5 }}>
        {tier === 'ucl' ? (
          // The starball behind the player.
          <g fill="none" stroke="#cfe0ff" strokeWidth="0.5" opacity="0.7">
            <circle cx="62" cy="38" r="34" />
            <path d="M62 4 L72 26 L96 30 L78 46 L84 70 L62 58 L40 70 L46 46 L28 30 L52 26 Z" />
          </g>
        ) : tier === 'icon' ? (
          <g fill="none" stroke="#c9a24b" strokeWidth="0.5">
            <path d="M100 6 L56 42 L100 66 M56 42 L66 0 M56 42 L36 76 L100 66" />
          </g>
        ) : (
          <g fill="none" stroke={c} strokeWidth="0.6">
            <path d="M-5 32 L30 12 L22 28 L60 4" />
            <path d="M105 50 L72 66 L80 52 L40 74" strokeWidth="0.5" />
            <path d="M0 88 L18 80 L14 90 L40 78" strokeWidth="0.4" />
          </g>
        )}
      </svg>
    </>
  );
}

/** The real photo, faded into the card; a silhouette in club colours without one. */
function Photo({ p, team, size, style, fade, onError, err }: { p: Player; team: Team | null; size: 'original' | 'big' | 'header'; style: CSSProperties; fade: string; onError: () => void; err: boolean }) {
  const src = photoUrl(p, size);
  return (
    <div className="absolute" style={style}>
      {src && !err ? (
        <img src={src} alt="" onError={onError} draggable={false} loading="lazy" className="w-full h-full object-cover object-top"
          style={{ maskImage: fade, WebkitMaskImage: fade, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }} />
      ) : (
        <div className="absolute inset-x-[8%] bottom-0 top-[18%]"><Silhouette p={p} color={clubAccent(team)} /></div>
      )}
    </div>
  );
}

export const surname = (p: Player) => (p.ru ?? p.ln).split(' ').slice(-1)[0];

/** The shield: frame of the edition with the face inside; children are drawn on the face. */
function Shield({ tier, w, h, pad, className, children }: { tier: Tier; w: number; h: number; pad: number; className?: string; children: ReactNode }) {
  return (
    <div className={cx('relative shield', `fr-${tier}`, className)} style={{ width: w, height: h }}>
      <div className={cx('absolute shield overflow-hidden', `fc-${tier}`)} style={{ inset: pad }}>
        {children}
        {LOOK[tier].fx >= 1 && <div className="absolute inset-0 pointer-events-none"><div className="shine w-full h-full" /></div>}
      </div>
    </div>
  );
}

/** Small pill with the name of the edition. */
export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  const c = TIERS[tier].color;
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full font-display uppercase tracking-[0.14em] leading-none whitespace-nowrap', small ? 'px-1.5 h-4 text-[9px]' : 'px-2 h-5 text-[10.5px]', tier === 'world' && 'holo text-[#1b1033]')}
      style={tier === 'world' ? undefined : { color: c, background: `color-mix(in oklab, ${c} 16%, rgba(0,0,0,.45))`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 55%, transparent)` }}
    >
      {tier === 'icon' ? '♛ ' : tier === 'world' ? '★ ' : ''}{TIERS[tier].name}
    </span>
  );
}

/**
 * The big card of the player profile, styled after FIFA Ultimate Team: the shield of his edition,
 * rating and position, flag and club, the photo, the name and six attributes. Tilts under the finger.
 */
export function PlayerCard({ p, L, width = 260, interactive = true }: { p: Player; L: League; width?: number; interactive?: boolean }) {
  const t = playerClub(L, p);
  const tier = cardOf(L, p);
  const look = LOOK[tier];
  const [imgErr, setImgErr] = useState(false);
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [9, -9]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-11, 11]), { stiffness: 180, damping: 18 });
  const glareX = useTransform(mx, [-1, 1], ['0%', '100%']);
  const foilX = useTransform(mx, [-1, 1], ['0%', '100%']);
  const W = width, H = Math.round(width * 1.4);
  const attrs = p.pos === 'G' ? ['ref', 'pos', 'han', 'kic', 'con', 'men'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  const r = p.r as unknown as Record<string, number>;
  const glow = TIERS[tier].color;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const b = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - b.left) / b.width) * 2 - 1);
    my.set(((e.clientY - b.top) / b.height) * 2 - 1);
  };
  const reset = () => { mx.set(0); my.set(0); };
  const fade = 'radial-gradient(ellipse 50% 58% at 50% 42%, #000 60%, transparent 100%), linear-gradient(180deg, transparent, #000 14%)';

  return (
    <div className="mx-auto w-fit flex flex-col items-center">
      <div style={{ perspective: 900 }} onPointerMove={onMove} onPointerLeave={reset} onPointerUp={reset}>
        <motion.div
          style={{ width: W, height: H, rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d', filter: `drop-shadow(0 26px 30px rgba(0,0,0,.6))${look.fx >= 2 ? ` drop-shadow(0 0 18px color-mix(in oklab, ${glow} 45%, transparent))` : ''}` }}
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        >
          <Shield tier={tier} w={W} h={H} pad={Math.max(3, W * 0.016)}>
            <Decor tier={tier} />
            <Photo p={p} team={t} size="original" err={imgErr} onError={() => setImgErr(true)} fade={fade}
              style={{ left: '24%', right: '3%', top: '6%', height: '53%' }} />
            {look.fx === 3 && <motion.div className="absolute inset-0 foil pointer-events-none" style={{ ['--fx' as string]: foilX }} />}
            {look.fx === 3 && SPARKLES.map(([x, y, d], i) => <span key={i} className="sparkle" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, transform: 'scale(0)' }} />)}
            <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at var(--gx) 0%, rgba(255,255,255,0.22), transparent 55%)', ['--gx' as string]: glareX }} />
            {/* rating, position, flag, club */}
            <div className="absolute flex flex-col items-center z-10" style={{ left: '9%', top: '11%', width: W * 0.2, ['--glow' as string]: glow }}>
              <div className={cx('num leading-[0.9] font-semibold', look.fx >= 2 && 'glow-num')} style={{ fontSize: W * 0.19, color: look.num }}>{p.ovr}</div>
              <div className="font-display font-semibold tracking-wide" style={{ fontSize: W * 0.07, color: look.ink, marginTop: W * 0.005 }}>{ROLE_RU[p.role]}</div>
              <span className="block" style={{ width: W * 0.13, height: 1, background: look.sub, opacity: 0.6, margin: `${W * 0.02}px 0` }} />
              <Flag code={p.ctry} size={Math.round(W * 0.075)} />
              {t && <span style={{ marginTop: W * 0.025 }}><TeamBadge team={t} size={Math.round(W * 0.11)} /></span>}
            </div>
            {/* name */}
            <div className="absolute inset-x-0 text-center z-10 px-[10%]" style={{ top: '60%' }}>
              <div className="font-display font-semibold uppercase truncate leading-none" style={{ fontSize: W * 0.098, color: look.ink }}>{surname(p)}</div>
            </div>
            <div className="absolute z-10" style={{ left: '12%', right: '12%', top: '69.5%', height: 1, background: look.sub, opacity: 0.55 }} />
            {/* attributes: labels over values, as on the FC cards */}
            <div className="absolute z-10 grid grid-cols-6" style={{ left: '7%', right: '7%', top: '71.5%' }}>
              {attrs.map((k) => (
                <div key={k} className="flex flex-col items-center leading-none">
                  <span className="font-display uppercase" style={{ fontSize: W * 0.042, color: look.sub }}>{ATTR_SHORT[k]}</span>
                  <span className="num font-semibold" style={{ fontSize: W * 0.075, color: look.ink, marginTop: W * 0.012 }}>{r[k]}</span>
                </div>
              ))}
            </div>
            {/* edition */}
            <div className="absolute inset-x-0 flex justify-center z-10" style={{ top: '86.5%' }}>
              <span className="font-display uppercase tracking-[0.18em] whitespace-nowrap" style={{ fontSize: W * 0.036, color: look.sub }}>
                {tier === 'icon' ? '♛ ' : ''}{TIERS[tier].name}
              </span>
            </div>
          </Shield>
        </motion.div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-muted whitespace-nowrap">
        <TierBadge tier={tier} small />
        <span>{playerAge(L, p)} лет</span>
        <span className="opacity-40">·</span>
        <span className="truncate max-w-[150px]">{p.c ? `${money(p.c.wage)}/год до ${p.c.until}` : 'без контракта'}</span>
        <span className="opacity-40">·</span>
        <span>POT {potLabel(L, p)}</span>
      </div>
    </div>
  );
}

/** Small collectible tile used in lists of cards. */
export function MiniCard({ p, L, onClick, width = 104 }: { p: Player; L: League; onClick?: () => void; width?: number }) {
  return <PitchCard p={p} L={L} team={playerClub(L, p)} width={width} onClick={onClick} />;
}

/**
 * A player on the team sheet as a small FIFA card of his edition: rating, position, photo, surname,
 * fitness. `rating` and `role` show how he rates in the slot he stands in.
 */
export function PitchCard({ p, L, team, width, rating, role, selected, unavailable, warn, onClick }: {
  p: Player; L?: League; team: Team | null; width: number; rating?: number; role?: Role; selected?: boolean; unavailable?: boolean; warn?: boolean; onClick?: () => void;
}) {
  const [err, setErr] = useState(false);
  const lg = L ?? useGame.getState().L!;
  const v = rating ?? p.ovr;
  const W = width, H = Math.round(width * 1.4);
  const tier = cardOf(lg, p);
  const look = LOOK[tier];
  const fade = 'radial-gradient(ellipse 50% 58% at 50% 42%, #000 58%, transparent 100%), linear-gradient(180deg, transparent, #000 14%)';
  return (
    <button
      onClick={onClick}
      className={cx('press relative block shrink-0 transition-transform duration-150', selected && '-translate-y-1 scale-[1.08] z-10')}
      style={{ width: W, height: H, filter: selected ? 'drop-shadow(0 0 2px var(--accent)) drop-shadow(0 0 8px var(--accent))' : 'drop-shadow(0 5px 7px rgba(0,0,0,.55))' }}
      aria-label={`${surname(p)}, ${ROLE_RU[role ?? p.role]}, рейтинг ${v}, ${TIERS[tier].name}`}
    >
      <Shield tier={tier} w={W} h={H} pad={look.fx >= 2 ? 2.5 : 2} className={cx(unavailable && 'grayscale opacity-70')}>
        <Decor tier={tier} />
        <Photo p={p} team={team} size="header" err={err} onError={() => setErr(true)} fade={fade} style={{ left: '28%', right: '2%', top: '7%', height: '55%' }} />
        {look.fx === 3 && <><span className="sparkle" style={{ left: '70%', top: '10%', width: 8, height: 8 }} /><span className="sparkle" style={{ left: '14%', top: '50%', width: 7, height: 7, animationDelay: '1.2s' }} /></>}
        {/* rating and position */}
        <span className="absolute flex flex-col items-center leading-none z-10" style={{ left: '8%', top: '13%', width: W * 0.3 }}>
          <span className="num font-semibold" style={{ fontSize: Math.max(13, W * 0.27), color: warn ? '#ff5a5f' : look.num }}>{v}</span>
          <span className="font-display font-semibold" style={{ fontSize: Math.max(8.5, W * 0.13), marginTop: W * 0.015, color: look.ink }}>{ROLE_RU[role ?? p.role]}</span>
        </span>
        {/* surname and fitness */}
        <span className="absolute inset-x-0 flex flex-col items-center z-10" style={{ top: '64%' }}>
          <span className="font-display font-semibold uppercase truncate w-full text-center leading-none" style={{ fontSize: Math.max(9, W * 0.145), padding: `0 ${W * 0.1}px`, color: look.ink }}>{surname(p)}</span>
          <span className="rounded-full overflow-hidden" style={{ width: W * 0.42, height: 3, marginTop: H * 0.04, background: 'rgba(0,0,0,.25)' }}>
            <span className="block h-full" style={{ width: `${p.fit}%`, background: fitColor(p.fit) }} />
          </span>
        </span>
      </Shield>
      {(p.inj || !!p.susp) && (
        <span className="absolute rounded-full bg-bad text-white font-bold flex items-center justify-center z-20" style={{ right: -3, top: -2, width: Math.max(14, W * 0.26), height: Math.max(14, W * 0.26), fontSize: Math.max(9, W * 0.15) }}>
          {p.inj ? '✚' : '!'}
        </span>
      )}
    </button>
  );
}

/** Empty place on the pitch or on the bench. */
export function EmptyCard({ width, label, onClick }: { width: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="press relative shrink-0 flex flex-col items-center justify-center text-white/75" style={{ width, height: Math.round(width * 1.4) }}>
      <span className="absolute inset-0 shield bg-white/25" />
      <span className="absolute shield bg-[#0b1220]/90" style={{ inset: 1.5 }} />
      <span className="relative" style={{ fontSize: width * 0.34, lineHeight: 1 }}>+</span>
      <span className="relative font-display" style={{ fontSize: Math.max(10, width * 0.14) }}>{label}</span>
    </button>
  );
}

import { useState, type ReactNode } from 'react';
import { useGame } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, Player, Team } from '../../engine/types';
import { clubLabel, dispName, fitColor, photoUrl, playerAge, ROLE_RU } from '../format';
import { flag as emojiFlag } from '../../engine/intl';
import { cx, Ovr } from './kit';

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const inkOn = (hex: string) => (lum(hex) > 0.6 ? '#0b1220' : '#ffffff');

/** Club crest: the real one from the Transfermarkt image CDN; offline (or for an unknown club) a badge drawn from the club colours. */
export function TeamBadge({ team, id, size = 36 }: { team?: Pick<Team, 'id' | 'primary' | 'secondary' | 'short' | 'tm'>; id?: string; size?: number }) {
  const t = team ?? (id ? useGame.getState().L?.teams[id] : undefined);
  const [err, setErr] = useState(false);
  if (t?.tm && !err) {
    return (
      <img
        src={crestUrl(t.tm)}
        alt={t.short}
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        onError={() => setErr(true)}
        className="shrink-0 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,.45)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return <DrawnBadge t={t} size={size} />;
}

export const crestUrl = (tm: number) => `https://tmssl.akamaized.net/images/wappen/big/${tm}.png`;

function DrawnBadge({ t, size }: { t?: Pick<Team, 'id' | 'primary' | 'secondary' | 'short'>; size: number }) {
  const a = t?.primary ?? '#334', b = t?.secondary ?? '#889';
  const uid = `b${(t?.id ?? 'x').replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <defs>
        <clipPath id={uid}><path d="M20 2l15 5v12c0 9-6.5 15.5-15 19C11.5 34.5 5 28 5 19V7z" /></clipPath>
      </defs>
      <g clipPath={`url(#${uid})`}>
        <rect width="40" height="40" fill={a} />
        <path d="M-4 30L30 -4h10L6 40z" fill={b} opacity="0.92" />
        <rect width="40" height="40" fill="url(#gloss)" />
      </g>
      <path d="M20 2l15 5v12c0 9-6.5 15.5-15 19C11.5 34.5 5 28 5 19V7z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <text x="20" y="23.5" textAnchor="middle" fontSize="10.5" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="700" fill="#fff" stroke="rgba(0,0,0,0.55)" strokeWidth="2.2" paintOrder="stroke">{t?.short ?? ''}</text>
    </svg>
  );
}

/**
 * ISO code of a country for the flag images, read from its emoji flag: regional indicators give "ru",
 * tag sequences give the UK nations ("gb-eng", "gb-sct", "gb-wls").
 */
/** A few country codes of the source data that are not FIFA codes of a national team in the game. */
const ISO_ALIAS: Record<string, string> = { SPA: 'es', SER: 'rs', NGR: 'ng', KVX: 'xk', BAN: 'bd', GLP: 'gp', MTQ: 'mq', NEW: 'nc' };

export function isoOf(code: string): string | null {
  if (ISO_ALIAS[code]) return ISO_ALIAS[code];
  const e = [...emojiFlag(code)].map((c) => c.codePointAt(0)!);
  const ri = e.filter((c) => c >= 0x1f1e6 && c <= 0x1f1ff);
  if (ri.length === 2) return ri.map((c) => String.fromCharCode(c - 0x1f1e6 + 97)).join('');
  const tags = e.filter((c) => c >= 0xe0061 && c <= 0xe007a).map((c) => String.fromCharCode(c - 0xe0000)).join('');
  return tags.length === 5 ? `${tags.slice(0, 2)}-${tags.slice(2)}` : null;
}

/** Country flag as an image (works on Windows too, where emoji flags show as letters). */
export function Flag({ code, size = 16, className }: { code: string; size?: number; className?: string }) {
  const iso = isoOf(code);
  const [err, setErr] = useState(false);
  if (!iso || err) return <span className={cx('text-[0.8em] font-semibold text-muted', className)}>{code}</span>;
  return (
    <img
      src={`https://flagcdn.com/${iso}.svg`}
      alt={code}
      loading="lazy"
      draggable={false}
      onError={() => setErr(true)}
      className={cx('inline-block shrink-0 rounded-[3px] object-cover align-[-0.15em] shadow-[0_0_0_1px_rgba(255,255,255,.12)]', className)}
      style={{ width: Math.round(size * 1.4), height: size }}
    />
  );
}

/** Small shirt in club colours with the squad number. */
export function Kit({ primary, secondary, num, size = 40 }: { primary: string; secondary: string; num?: number | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <path d="M13 5l-9 5 3 8 4-2v19h18V16l4 2 3-8-9-5c-1 3-3.5 4.5-7 4.500S14 8 13 5z" fill={primary} stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
      <path d="M4 10l3 8 4-2v-5zM36 10l-3 8-4-2v-5z" fill={secondary} opacity="0.9" />
      <path d="M13 5c1 3 3.5 4.5 7 4.500S26 8 27 5" fill="none" stroke={secondary} strokeWidth="1.6" />
      {num != null && <text x="20" y="27" textAnchor="middle" fontSize="13" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="700" fill={inkOn(primary)}>{num}</text>}
    </svg>
  );
}

export function PlayerKit({ L, p, size = 40 }: { L: League; p: Player; size?: number }) {
  const t = p.team ? L.teams[p.team] : null;
  return <Kit primary={t?.primary ?? '#3a4458'} secondary={t?.secondary ?? '#8b98ae'} num={p.team ? p.num : null} size={size} />;
}

/** Shown while a photo loads or when there is none: head and shoulders in the club colour with the initials. */
export function Silhouette({ p, color = '#7fd3ff' }: { p: Player; color?: string }) {
  const initials = `${p.fn[0] ?? ''}${p.ln[0] ?? ''}`;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id={`sil${p.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="36" r="17" fill={`url(#sil${p.id})`} />
      <path d="M14 100 C16 70 32 58 50 58 C68 58 84 70 86 100 Z" fill={`url(#sil${p.id})`} />
      <text x="50" y="41" textAnchor="middle" fontSize="13" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="600" fill="white" fillOpacity="0.85">
        {initials}
      </text>
    </svg>
  );
}

/** Dark base colour of a club for card backgrounds: clubs in white or yellow use their second colour. */
export const clubBase = (t: Pick<Team, 'primary' | 'secondary'> | null | undefined) =>
  !t ? '#1b2a44' : lum(t.primary) <= 0.55 ? t.primary : lum(t.secondary) <= 0.55 ? t.secondary : '#1b2a44';

/** Light accent of a club for silhouettes and lines on dark backgrounds. */
export const clubAccent = (t: Team | null | undefined) => (t ? (lum(t.primary) < 0.22 ? t.secondary : t.primary) : '#7fd3ff');

export function PlayerPhoto({ p, L, size = 44, className, round = true }: { p: Player; L: League; size?: number; className?: string; round?: boolean }) {
  const [err, setErr] = useState(false);
  const t = p.team ? L.teams[p.team] : null;
  const src = photoUrl(p, size > 72 ? 'big' : 'header');
  const bg = t ? `radial-gradient(circle at 50% 30%, color-mix(in oklab, ${clubBase(t)} 70%, #1a2440), #0b1120)` : 'radial-gradient(circle at 50% 30%, #1b2a44, #0b1120)';
  return (
    <div className={cx('relative overflow-hidden shrink-0', round ? 'rounded-full' : 'rounded-2xl', className)} style={{ width: size, height: size, background: bg }}>
      {src && !err ? (
        <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className="absolute inset-0 w-full h-full object-cover object-top" draggable={false} />
      ) : (
        <Silhouette p={p} color={clubAccent(t)} />
      )}
    </div>
  );
}

export function StatusDots({ p }: { p: Player }) {
  return (
    <>
      {p.inj && <span title="Травма" className="text-bad text-[12px]">✚{p.inj.days}</span>}
      {!!p.susp && <span title="Дисквалификация" className="text-[12px]">🟥</span>}
      {p.wantsOut && <span title="Хочет уйти" className="text-warn text-[12px]">↗</span>}
      {p.listed && <span title="Выставлен на трансфер" className="text-[11px] text-ice">ТР</span>}
      {p.loan && <span title="Аренда" className="text-[11px] text-muted">АР</span>}
    </>
  );
}

export function PlayerRow({ p, right, sub, onClick, showClub, dense }: { p: Player; right?: ReactNode; sub?: ReactNode; onClick?: () => void; showClub?: boolean; dense?: boolean }) {
  const L = useGame.getState().L!;
  const push = useNav((s) => s.push);
  return (
    <div onClick={onClick ?? (() => push('player', { id: p.id }))} className={cx('press flex items-center gap-3 px-3 active:bg-white/5 rounded-2xl', dense ? 'min-h-[56px] py-1.5' : 'min-h-[64px] py-2')}>
      <PlayerPhoto L={L} p={p} size={dense ? 40 : 46} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-[15.500px]">{dispName(p)}</span>
          <StatusDots p={p} />
        </div>
        <div className="text-[12.500px] text-muted truncate">
          {sub ?? (
            <>
              <span className="text-ink/80">{ROLE_RU[p.role]}</span> · {playerAge(L, p)} · <Flag code={p.ctry} size={11} />
              {showClub && <> · {clubLabel(L, p)}</>}
              {!showClub && p.team && <> · <span style={{ color: fitColor(p.fit) }}>{Math.round(p.fit)}%</span></>}
            </>
          )}
        </div>
      </div>
      {right}
      <Ovr v={p.ovr} size={dense ? 34 : 38} />
    </div>
  );
}

/** Three-way chance bar: home win, draw, away win. */
export function OddsBar({ h, d, a, labels }: { h: number; d: number; a: number; labels?: [string, string] }) {
  const p = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-white/8">
        <div style={{ width: p(h), background: 'var(--accent)' }} />
        <div style={{ width: p(d), background: 'rgba(255,255,255,0.28)' }} />
        <div style={{ width: p(a), background: '#8b98ae' }} />
      </div>
      <div className="flex justify-between text-[12px] mt-1.5 tnum">
        <span><span className="num text-[15px] accent-text">{p(h)}</span> <span className="text-muted">{labels?.[0] ?? 'победа'}</span></span>
        <span className="text-muted">ничья <span className="num text-[15px] text-ink">{p(d)}</span></span>
        <span><span className="text-muted">{labels?.[1] ?? 'поражение'}</span> <span className="num text-[15px]">{p(a)}</span></span>
      </div>
    </div>
  );
}

import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';

export function Sparkline({ values, width = 120, height = 36, color = 'var(--accent)', labels }: { values: number[]; width?: number; height?: number; color?: string; labels?: string[] }) {
  if (values.length < 2) return <div className="text-muted text-[12px]">недостаточно данных</div>;
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 4 - ((v - min) / (max - min)) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height + (labels ? 14 : 0)} className="overflow-visible">
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="2.8" fill={color} />
          <text x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize="9.5" fill="#cfd8e6" className="num">{values[i]}</text>
          {labels && <text x={p[0]} y={height + 12} textAnchor="middle" fontSize="9" fill="#7c889e">{labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

/** xG momentum per five minutes: bars above the line are the home side's. */
export function Momentum({ bins, home, away }: { bins: number[]; home: string; away: string }) {
  const max = Math.max(0.25, ...bins.map(Math.abs));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted mb-1"><span>{home} ▲</span><span>▼ {away}</span></div>
      <div className="flex items-center gap-1 h-24 relative">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />
        {bins.map((b, i) => (
          <div key={i} className="flex-1 h-full relative">
            <motion.div
              className="absolute left-0 right-0 rounded-sm"
              style={{ background: b >= 0 ? 'var(--accent)' : '#8b98ae', top: b >= 0 ? `${50 - (b / max) * 50}%` : '50%' }}
              initial={{ height: 0 }}
              animate={{ height: `${(Math.abs(b) / max) * 50}%` }}
              transition={{ delay: i * 0.03 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-faint mt-1"><span>1'</span><span>45'</span><span>90'</span></div>
    </div>
  );
}

/** Football pitch under floodlights: mowed stripes, grain, glowing lines, goals with nets. Children are drawn in the
 * 105×68 coordinates of the field (inside the lines). */
export function PitchSvg({ children, className, vertical, stretch }: { children?: ReactNode; className?: string; vertical?: boolean; stretch?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (k: string) => `url(#${k}${id})`;
  const W = vertical ? 68 : 105, H = vertical ? 105 : 68;
  // The field sits inside a strip of grass, where the goals stand.
  const M = 0.95;
  const field = `translate(${(105 * (1 - M)) / 2} ${(68 * (1 - M)) / 2}) scale(${M})`;
  const turn = vertical ? 'translate(68 0) rotate(90)' : undefined;
  const goal = (x: number) => <rect x={x} y="30.34" width="2" height="7.32" fill={u('net')} stroke="#fff" strokeWidth="0.32" />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={stretch ? 'none' : undefined} className={className} style={{ borderRadius: 18, display: 'block' }}>
      <defs>
        <linearGradient id={`grass${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a8a43" /><stop offset="0.5" stopColor="#23803c" /><stop offset="1" stopColor="#1a6a31" />
        </linearGradient>
        <pattern id={`net${id}`} width="0.55" height="0.55" patternUnits="userSpaceOnUse">
          <rect width="0.55" height="0.55" fill="rgba(0,0,0,0.25)" />
          <path d="M0 0L0.55 0.55M0.55 0L0 0.55" stroke="rgba(255,255,255,0.55)" strokeWidth="0.06" />
        </pattern>
        {/* Grass grain: streaky noise along the mowing, laid over the stripes. */}
        <filter id={`grain${id}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="2.2 0.3" numOctaves="2" seed="7" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id={`glow${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="0.45" />
        </filter>
        <radialGradient id={`flood${id}`} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" /><stop offset="0.45" stopColor="#fff" stopOpacity="0.03" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`vig${id}`} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.42" />
        </radialGradient>
        <radialGradient id={`lamp${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe8" stopOpacity="0.16" /><stop offset="1" stopColor="#fffbe8" stopOpacity="0" />
        </radialGradient>
        <g id={`lines${id}`} fill="none" stroke="#fff" strokeWidth="0.34">
          <rect x="0" y="0" width="105" height="68" />
          <line x1="52.5" y1="0" x2="52.5" y2="68" />
          <circle cx="52.5" cy="34" r="9.15" />
          <rect x="0" y="13.84" width="16.5" height="40.32" />
          <rect x="88.5" y="13.84" width="16.5" height="40.32" />
          <rect x="0" y="24.84" width="5.5" height="18.32" />
          <rect x="99.5" y="24.84" width="5.5" height="18.32" />
          <path d="M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31" />
          <path d="M1 0A1 1 0 0 1 0 1M104 0A1 1 0 0 0 105 1M105 67A1 1 0 0 0 104 68M0 67A1 1 0 0 1 1 68" />
          <g fill="#fff" stroke="none"><circle cx="11" cy="34" r="0.32" /><circle cx="94" cy="34" r="0.32" /><circle cx="52.5" cy="34" r="0.42" /></g>
        </g>
      </defs>
      <g transform={turn}>
        <rect width="105" height="68" fill={u('grass')} />
        {/* Mowing: light and dark bands across the pitch, the halfway line on a border between them. */}
        {Array.from({ length: 14 }, (_, i) => <rect key={i} x={i * 7.5} y="0" width="7.5" height="68" fill={i % 2 ? '#000' : '#fff'} opacity={i % 2 ? 0.085 : 0.06} />)}
        {Array.from({ length: 6 }, (_, i) => <rect key={i} x="0" y={i * 11.34} width="105" height="11.34" fill="#fff" opacity={i % 2 ? 0 : 0.018} />)}
        <rect width="105" height="68" filter={u('grain')} opacity="0.16" style={{ mixBlendMode: 'overlay' }} />
        {/* Worn grass in front of the goals. */}
        <ellipse cx="5" cy="34" rx="5" ry="6" fill="#6b5a2a" opacity="0.1" /><ellipse cx="100" cy="34" rx="5" ry="6" fill="#6b5a2a" opacity="0.1" />
        <g transform={field}>
          <use href={`#lines${id}`} filter={u('glow')} opacity="0.55" />
          <use href={`#lines${id}`} opacity="0.88" />
          {goal(-2)}{goal(105)}
        </g>
      </g>
      {/* Floodlights: a bright middle, four lamp pools in the corners, darker edges. */}
      <rect width={W} height={H} fill={u('flood')} />
      {[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={W * 0.45} ry={H * 0.32} fill={u('lamp')} />)}
      <rect width={W} height={H} fill={u('vig')} />
      <rect x="0.15" y="0.15" width={W - 0.3} height={H - 0.3} rx="2" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
      {children && <g transform={turn}><g transform={field}>{children}</g></g>}
    </svg>
  );
}

/** Shot map: the home side attacks to the right, the away side to the left. Circle size follows xG. */
export function ShotMap({ shots, home, colors }: { shots: { team: string; x: number; y: number; goal: boolean; xg: number }[]; home: string; colors: [string, string] }) {
  return (
    <PitchSvg className="w-full">
      {shots.map((s, i) => {
        const isH = s.team === home;
        const x = (isH ? s.x : 1 - s.x) * 105, y = (isH ? s.y : 1 - s.y) * 68;
        const r = 0.9 + Math.sqrt(s.xg) * 3.2;
        return s.goal
          ? <circle key={i} cx={x} cy={y} r={r + 0.5} fill={isH ? colors[0] : colors[1]} stroke="#fff" strokeWidth="0.6" />
          : <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={isH ? colors[0] : colors[1]} strokeWidth="0.5" opacity="0.9" />;
      })}
    </PitchSvg>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="num text-[17px]">{value >= 0.995 ? '99' : value < 0.005 && value > 0 ? '<1' : Math.round(value * 100)}<span className="text-[10px]">%</span></span>
        {label && <span className="text-[9px] text-muted mt-0.5 uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ovrColor } from '../format';

export function cx(...a: (string | number | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'glass' | 'ghost' | 'danger' | 'gold' | 'good';
export function Button({
  children, onClick, variant = 'glass', size = 'md', full, disabled, className, icon,
}: {
  children?: ReactNode; onClick?: () => void; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; full?: boolean; disabled?: boolean; className?: string; icon?: ReactNode;
}) {
  const sizes = { sm: 'hit h-9 px-3.5 text-[14px] rounded-xl', md: 'h-11 px-4 text-[15px] rounded-2xl', lg: 'h-[52px] px-5 text-[17px] rounded-2xl' };
  const variants: Record<BtnVariant, string> = {
    primary: 'accent-bg text-white shadow-[0_8px_28px_-8px_var(--accent)] font-semibold',
    gold: 'bg-[linear-gradient(135deg,#fff1c2,#e8c26a_45%,#a8812f)] text-[#1a1306] font-semibold shadow-[0_8px_28px_-10px_#e8c26a]',
    good: 'bg-[linear-gradient(135deg,#5ef0b0,#22b97a)] text-[#04170e] font-semibold',
    glass: 'glass text-ink font-medium',
    ghost: 'text-ink/80 font-medium',
    danger: 'bg-bad/15 text-bad border border-bad/30 font-semibold',
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={cx('press inline-flex items-center justify-center gap-2 select-none whitespace-nowrap', sizes[size], variants[variant], full && 'w-full', disabled && 'opacity-40 pointer-events-none', className)}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({ children, className, onClick, pad = true }: { children: ReactNode; className?: string; onClick?: () => void; pad?: boolean }) {
  return (
    <div onClick={onClick} className={cx('glass rounded-3xl', pad && 'p-4', onClick && 'press', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between px-1 mb-2.5 mt-6', className)}>
      <h3 className="font-display uppercase tracking-[0.12em] text-[13px] text-muted">{children}</h3>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('glass rounded-2xl p-1 flex relative', options.length >= 5 ? 'gap-0.5' : 'gap-1', className)}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={cx('hit h-9 rounded-xl font-medium press', options.length >= 5 ? 'flex-auto px-1 text-[12.5px] tracking-[-0.01em]' : 'flex-1 text-[14px]')}>
          {value === o.v && (
            <motion.div layoutId={`seg-${options.map((x) => x.v).join('')}`} className="absolute inset-0 rounded-xl bg-white/12 border border-white/10" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className={cx('relative', value === o.v ? 'text-ink' : 'text-muted')}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="hscroll flex gap-2 -mx-4 px-4 py-1 -my-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cx('press hit shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium border', value === o.v ? 'bg-white text-[#05070d] border-white' : 'glass text-ink/80')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100, color, className, height = 6 }: { value: number; max?: number; color?: string; className?: string; height?: number }) {
  const w = Math.max(0, Math.min(1, value / max));
  return (
    <div className={cx('w-full rounded-full bg-white/8 overflow-hidden', className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${w * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        style={{ background: color ?? 'linear-gradient(90deg, color-mix(in oklab, var(--accent) 60%, white 0%), var(--accent))' }}
      />
    </div>
  );
}

export function Stat({ label, value, sub, accent, good, className }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; good?: boolean; className?: string }) {
  return (
    <div className={cx('glass rounded-2xl px-3 py-2.5 min-w-0', className)}>
      <div className="text-[11px] uppercase tracking-wider text-muted truncate">{label}</div>
      <div className={cx('num text-[22px] leading-tight mt-0.5 truncate', accent && 'accent-text', good && 'text-good')}>{value}</div>
      {sub && <div className="text-[12px] text-muted truncate">{sub}</div>}
    </div>
  );
}

export function Ovr({ v, size = 36, className }: { v: number; size?: number; className?: string }) {
  const c = ovrColor(v);
  return (
    <div
      className={cx('num flex items-center justify-center rounded-xl shrink-0 font-semibold', className)}
      style={{ width: size, height: size, fontSize: size * 0.48, color: c, background: `color-mix(in oklab, ${c} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 35%, transparent)` }}
    >
      {v}
    </div>
  );
}

export function Empty({ icon = '⚽', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-display text-[18px] uppercase tracking-wide">{title}</div>
      {text && <div className="text-muted text-[14px] mt-1.5 max-w-[280px]">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pill({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium whitespace-nowrap', className)}
      style={{ color: color ?? 'var(--color-ink)', background: color ? `color-mix(in oklab, ${color} 16%, transparent)` : 'rgba(255,255,255,0.08)' }}
    >
      {children}
    </span>
  );
}

export function Row({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <div onClick={onClick} className={cx('flex items-center gap-3 px-4 min-h-[60px] py-2', onClick && 'press active:bg-white/5', className)}>
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-white/[0.06] mx-4" />;
}

export function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" className="shrink-0 text-faint">
      <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Delta({ v, suffix = '' }: { v: number; suffix?: string }) {
  if (!v) return <span className="text-muted">0{suffix}</span>;
  return <span className={v > 0 ? 'text-good' : 'text-bad'}>{v > 0 ? '+' : '−'}{Math.abs(v)}{suffix}</span>;
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <div className="spin rounded-full border-2 border-white/20 border-t-white" style={{ width: size, height: size }} />;
}

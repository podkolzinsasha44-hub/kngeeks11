import { useMemo, useState } from 'react';
import { squad } from '../../engine/lineup';
import { proposeSwap, swapWorth, type SwapReply } from '../../engine/swaps';
import { askingPrice, saleBlock } from '../../engine/transfers';
import type { League, Player } from '../../engine/types';
import { useGame } from '../../store/game';
import { useNav } from '../../store/nav';
import { dispName, money, moneyStep, playerAge, ROLE_RU } from '../format';
import { Button, cx, Ovr } from './kit';
import { Sheet } from './shell';

/** Offer some of the user's players, and money either way, for a player of another club. */
export function SwapSheet({ L, p, onClose }: { L: League; p: Player; onClose: () => void }) {
  const act = useGame((s) => s.act);
  const push = useNav((s) => s.push);
  const me = L.teams[L.user];
  const club = L.teams[p.team!];
  const ask = askingPrice(L, p, me);
  const mine = useMemo(() => squad(L, me.id).filter((x) => !x.loan).sort((a, b) => b.val - a.val), [L, me.id]);
  const [give, setGive] = useState<number[]>([]);
  // > 0: the user adds money; < 0: the other club does.
  const [cash, setCash] = useState(0);
  const [res, setRes] = useState<SwapReply | null>(null);
  const step = moneyStep(Math.max(ask, 100_000), 1000);
  const worth = give.reduce((s, id) => s + swapWorth(L, club, L.players[id]), 0);
  const gap = ask - worth - cash;
  const flip = (id: number) => { setRes(null); setGive((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.length >= 3 ? g : [...g, id])); };
  const maxPay = Math.max(step, Math.min(me.budget, ask));
  const maxGet = Math.max(step, Math.min(club.budget, worth));
  const send = (c = cash) => { setCash(c); setRes(act(() => proposeSwap(L, p.id, give, c))); };

  return (
    <Sheet open onClose={onClose} title={`Обмен: ${dispName(p)}`} full>
      <div className="text-[13px] text-muted leading-snug mb-2">
        «{club.ru}» ценит {dispName(p)} примерно в <span className="text-ink num">{money(ask)}</span>. Предложите своих игроков (до трёх) и доплату в любую сторону. Игроки переходят со своими контрактами.
      </div>

      <div className="glass rounded-2xl p-3.5">
        <div className="flex justify-between text-[13px]"><span className="text-muted">Ваши игроки для «{club.ru}»</span><span className="num">{money(worth)}</span></div>
        <div className="flex justify-between text-[13px] mt-1"><span className="text-muted">{cash >= 0 ? 'Ваша доплата' : `Доплата от «${club.ru}»`}</span><span className="num">{money(Math.abs(cash))}</span></div>
        <div className={cx('flex justify-between text-[13.5px] mt-1.5 font-semibold', gap <= ask * 0.03 ? 'text-good' : 'text-warn')}>
          <span>{gap <= ask * 0.03 ? 'Похоже на равный обмен' : 'Не хватает примерно'}</span><span className="num">{gap <= ask * 0.03 ? '✓' : money(gap)}</span>
        </div>
        <div className="text-center num text-[22px] mt-3">{cash === 0 ? 'Без доплаты' : cash > 0 ? `Вы доплачиваете ${money(cash)}` : `Вам доплачивают ${money(-cash)}`}</div>
        <input type="range" min={-maxGet} max={maxPay} step={step} value={cash} onChange={(e) => { setCash(Number(e.target.value)); setRes(null); }} className="w-full mt-2 accent-[var(--accent)]" aria-label="Доплата" />
        <div className="flex justify-between text-[11px] text-muted"><span>они доплачивают</span><span>без доплаты</span><span>вы доплачиваете</span></div>
        <div className="flex gap-2 mt-2">
          <Button size="sm" full onClick={() => { setCash(cash - step); setRes(null); }}>− {money(step)}</Button>
          <Button size="sm" full onClick={() => { setCash(0); setRes(null); }}>0</Button>
          <Button size="sm" full onClick={() => { setCash(cash + step); setRes(null); }}>+ {money(step)}</Button>
        </div>
      </div>

      {res && (
        <div className={cx('mt-3 rounded-2xl px-4 py-3 text-[14px]', res.status === 'accepted' ? 'bg-good/15 text-good' : res.status === 'countered' ? 'bg-warn/15 text-warn' : 'bg-bad/15 text-bad')}>{res.text}</div>
      )}
      <div className="flex flex-col gap-2 mt-3">
        {res?.status === 'accepted'
          ? <Button variant="good" size="lg" full onClick={() => { onClose(); push('player', { id: p.id }); }}>К игроку</Button>
          : <Button variant="primary" size="lg" full disabled={!give.length} onClick={() => send()}>{give.length ? 'Предложить обмен' : 'Выберите своих игроков'}</Button>}
        {res?.status === 'countered' && res.need && <Button full onClick={() => send(cash + res.need!)}>{cash + res.need < 0 ? `Согласиться: они доплачивают ${money(-(cash + res.need))}` : `Добавить ${money(res.need)} и отправить`}</Button>}
      </div>

      <div className="text-[12px] uppercase tracking-wider text-muted mt-4 mb-1">Ваши игроки · выбрано {give.length} из 3</div>
      <div className="flex flex-col">
        {mine.map((x) => {
          const on = give.includes(x.id);
          const b = saleBlock(x);
          return (
            <div key={x.id} onClick={() => (b ? null : flip(x.id))} className={cx('press flex items-center gap-3 py-2 border-b border-white/5', b && 'opacity-40', on && 'bg-white/5 rounded-xl')}>
              <span className={cx('w-6 h-6 rounded-full border flex items-center justify-center text-[13px] shrink-0', on ? 'accent-bg border-transparent text-white' : 'border-white/30')}>{on ? '✓' : ''}</span>
              <Ovr v={x.ovr} size={34} />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-[14.5px]">{dispName(x)}</div>
                <div className="text-[12px] text-muted truncate">{ROLE_RU[x.role]} · {playerAge(L, x)} лет · {money(x.c?.wage ?? 0)}/год{b ? ` · ${b.toLowerCase()}` : ''}</div>
              </div>
              <div className="text-right leading-tight">
                <div className="num text-[13px]">{money(x.val)}</div>
                <div className="text-[10.5px] text-muted">для них {money(swapWorth(L, club, x))}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

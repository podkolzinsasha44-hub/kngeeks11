import { useState } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { wageBill, wageFor } from '../../engine/contracts';
import { negotiate } from '../../engine/transfers';
import { Button, Card, cx, Meter, SectionTitle } from '../components/kit';
import { Screen } from '../components/shell';
import { PlayerKit } from '../components/media';
import { dispName, money, playerAge, ROLE_RU } from '../format';

export function NegotiateScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const pop = useNav((s) => s.pop);
  const p = L.players[Number(params.id)];
  const n = p ? L.negotiations[p.id] : undefined;
  const me = L.teams[L.user];
  const [wage, setWage] = useState(() => (n ? Math.round((n.ask.wage * 0.9) / 5000) * 5000 : 0));
  const [years, setYears] = useState(() => n?.ask.years ?? 3);
  const [done, setDone] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!p || (!n && !done)) return <Screen title="Переговоры"><div className="text-muted mt-6">Переговоры завершены.</div><Button className="mt-4" onClick={pop}>Назад</Button></Screen>;
  const market = wageFor(p.ovr, me.lg);
  const bill = wageBill(L, me.id);
  const kind = n?.kind === 'extend' ? 'Продление контракта' : n?.kind === 'transfer' ? `Переход за ${money(n.fee ?? 0)}` : 'Свободный агент';
  const step = market >= 2e6 ? 50_000 : market >= 4e5 ? 10_000 : 5000;
  const max = Math.max(market * 2.2, (n?.ask.wage ?? market) * 1.4);
  const send = () => {
    const r = act(() => negotiate(L, p.id, wage, years));
    if (r.status === 'signed') { setDone(r.text); toast('Контракт подписан', 'good'); }
    else if (r.status === 'broken') { setDone(r.text); toast('Переговоры сорваны', 'bad'); }
    else setMsg(r.text);
  };
  return (
    <Screen title="Переговоры" subtitle={kind}>
      <Card className="mt-1 flex items-center gap-3">
        <PlayerKit L={L} p={p} size={48} />
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-[19px] truncate">{dispName(p)}</div>
          <div className="text-[12.5px] text-muted">{ROLE_RU[p.role]} · {playerAge(L, p)} лет · рейтинг {p.ovr} · сейчас {p.c ? `${money(p.c.wage)}/год` : 'без контракта'}</div>
        </div>
      </Card>
      {done ? (
        <Card className="mt-3 text-center">
          <div className="text-4xl mb-2">{L.negotiations[p.id] ? '🤝' : p.team === L.user ? '✍️' : '🚪'}</div>
          <div className="text-[15px]">{done}</div>
          <Button variant="primary" full className="mt-4" onClick={pop}>Готово</Button>
        </Card>
      ) : n && (
        <>
          <SectionTitle>Позиция агента</SectionTitle>
          <Card>
            <div className="flex justify-between text-[14px]"><span className="text-muted">Запрос</span><span className="num text-[17px]">{money(n.ask.wage)} в год × {n.ask.years}</span></div>
            <div className="flex justify-between text-[14px] mt-1"><span className="text-muted">Средняя зарплата игрока такого уровня</span><span className="num">{money(market)}</span></div>
            <div className="flex justify-between text-[13px] mt-3 mb-1"><span className="text-muted">Терпение агента</span><span className="num">{Math.max(0, n.patience)}</span></div>
            <Meter value={n.patience} color={n.patience < 30 ? '#ff5a5f' : n.patience < 55 ? '#ffb547' : '#3ddc97'} />
            {msg && <div className="mt-3 text-[14px] text-warn">{msg}</div>}
          </Card>
          <SectionTitle>Ваше предложение</SectionTitle>
          <Card>
            <div className="text-center num text-[32px] leading-none">{money(wage)}<span className="text-[15px] text-muted"> / год</span></div>
            <input type="range" min={Math.round(market * 0.3)} max={max} step={step} value={wage} onChange={(e) => setWage(Number(e.target.value))} className="w-full mt-4 accent-[var(--accent)]" />
            <div className="flex gap-2 mt-2">
              <Button full size="sm" onClick={() => setWage(Math.max(0, wage - step))}>− {money(step)}</Button>
              <Button full size="sm" onClick={() => setWage(wage + step)}>+ {money(step)}</Button>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[14px] text-muted">{n.kind === 'extend' ? `Сезонов после текущего (до лета ${L.season + 1 + years})` : 'Срок, лет'}</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((y) => <button key={y} onClick={() => setYears(y)} className={cx('press w-10 h-10 rounded-xl num text-[16px] border', years === y ? 'bg-white text-[#05070d] border-white' : 'glass')}>{y}</button>)}
              </div>
            </div>
            <div className="text-[12px] text-muted mt-3">Зарплаты после сделки: {money(bill + wage - (n.kind === 'extend' ? p.c?.wage ?? 0 : 0))} из {money(me.wageBudget)} в год.</div>
          </Card>
          <Button variant="primary" size="lg" full className="mt-4" onClick={send}>Предложить</Button>
          {n.history.length > 0 && (
            <>
              <SectionTitle>Ход переговоров</SectionTitle>
              <Card className="flex flex-col gap-1.5 text-[13.5px]">
                {n.history.map((h, i) => <div key={i} className="flex justify-between gap-3"><span className="text-muted">{money(h.wage)} × {h.years}</span><span className="text-right">{h.result}</span></div>)}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

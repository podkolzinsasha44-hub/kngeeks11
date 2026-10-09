import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { BUILD_DAYS, FACILITY, FOCUS, INTENSITY, MAX_LEVEL, facility, startUpgrade, trainingOf, upgradeBlock, upgradeCost } from '../../engine/club';
import { loanedOut } from '../../engine/loans';
import { LEAGUES } from '../../engine/leagues';
import { avgRating, seasonTotal } from '../../engine/stats';
import { addDays } from '../../engine/util';
import { dateRu } from '../../engine/medical';
import type { Facility, Intensity, TrainFocus } from '../../engine/types';
import { Button, Card, cx, Meter, SectionTitle, Segmented, Chips } from '../components/kit';
import { Screen } from '../components/shell';
import { PlayerPhoto, TeamBadge } from '../components/media';
import { dispName, money } from '../format';

/** Training plan, facilities and players out on loan. */
export function ClubScreen() {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const t = L.teams[L.user];
  const tr = trainingOf(t);
  const set = (patch: Partial<typeof tr>) => act(() => { t.training = { ...trainingOf(t), ...patch }; });
  const I = INTENSITY[tr.int];
  const rec = I.rec + (tr.focus === 'physical' ? 0.4 : 0) + (facility(t, 'train') - 2) * 0.15;
  const grow = I.grow + (facility(t, 'train') - 2) * 0.25;
  const loans = loanedOut(L);
  return (
    <Screen title="Клуб" subtitle={`${t.ru} · бюджет ${money(t.budget)}`}>
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
      <div className="min-w-0">
      <SectionTitle className="!mt-2">Тренировки</SectionTitle>
      <Segmented<Intensity> value={tr.int} onChange={(v) => set({ int: v })} options={(Object.keys(INTENSITY) as Intensity[]).map((v) => ({ v, label: INTENSITY[v].label }))} />
      <div className="text-[12.5px] text-muted mt-1.5 px-1 leading-snug">{I.sub}.</div>
      <div className="mt-3 mb-2 px-1 text-[12px] uppercase tracking-[0.12em] text-muted">Упор</div>
      <Chips<TrainFocus> value={tr.focus} onChange={(v) => set({ focus: v })} options={(Object.keys(FOCUS) as TrainFocus[]).map((v) => ({ v, label: FOCUS[v].label }))} />
      <div className="text-[12.5px] text-muted mt-1.5 px-1 leading-snug">{FOCUS[tr.focus].sub}.</div>
      <Card className="mt-3">
        <Effect label="Восстановление готовности" value={`+${rec.toFixed(1)}% в день`} good={rec > 3.45} bad={rec < 3.35} />
        <Effect label="Рост молодых за сезон" value={grow === 0 ? 'обычный' : `${grow > 0 ? '+' : '−'}${Math.abs(grow).toFixed(2)} к рейтингу`} good={grow > 0} bad={grow < 0} />
        <Effect label="Травмы на тренировках" value={I.risk ? 'случаются' : 'нет'} bad={!!I.risk} good={!I.risk} />
        <div className="text-[11.5px] text-faint mt-2 leading-snug">Рост начисляется летом, при переходе сезона, вместе с обычным развитием. Сильнее всего тренировки влияют на игроков до 21 года.</div>
      </Card>
      </div>

      <div className="min-w-0">
      <SectionTitle className="lg:!mt-2">Инфраструктура</SectionTitle>
      {t.build && (
        <Card className="mb-2.5 border-gold/30">
          <div className="flex items-center gap-3">
            <div className="text-[26px]">🏗️</div>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold">Стройка: {FACILITY[t.build.kind].label.toLowerCase()}</div>
              <div className="text-[12.5px] text-muted">Готово {dateRu(t.build.done)} · вложено {money(t.build.cost)}</div>
              <Meter className="mt-1.5" height={5} color="#e8c26a" value={(1 - Math.max(0, (Date.parse(t.build.done) - Date.parse(L.date)) / 864e5) / BUILD_DAYS) * 100} />
            </div>
          </div>
        </Card>
      )}
      <div className="flex flex-col gap-2.5">
        {(Object.keys(FACILITY) as Facility[]).map((k) => {
          const f = FACILITY[k];
          const lvl = facility(t, k);
          const block = upgradeBlock(L, k);
          const cost = upgradeCost(t, k);
          return (
            <Card key={k}>
              <div className="flex items-start gap-3">
                <div className="text-[28px] leading-none mt-0.5">{f.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold flex-1 truncate">{f.label}</span>
                    <span className="flex gap-1">{Array.from({ length: MAX_LEVEL }, (_, i) => <span key={i} className={cx('w-2.5 h-2.5 rounded-full', i < lvl ? 'accent-bg' : 'bg-white/12')} />)}</span>
                  </div>
                  <div className="text-[12.5px] text-muted leading-snug mt-0.5">{f.sub}. Сейчас: {f.effect(lvl)}.</div>
                  {lvl < MAX_LEVEL && (
                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex-1 text-[12px] text-muted leading-snug">Уровень {lvl + 1}: {f.effect(lvl + 1)}</div>
                      <Button size="sm" variant={block ? 'glass' : 'primary'} disabled={!!t.build} onClick={() => { const msg = act(() => startUpgrade(L, k)); toast(msg, block ? 'bad' : 'good'); }}>{money(cost)}</Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="text-[11.5px] text-faint mt-2 px-1 leading-snug">Стройка оплачивается из трансферного бюджета и идёт {BUILD_DAYS} дней; одновременно — один объект. Цена зависит от уровня и от доходов лиги.</div>

      <SectionTitle right={<span className="text-[12px] text-muted">{loans.length}</span>}>В аренде</SectionTitle>
      {loans.length ? (
        <Card pad={false} className="overflow-hidden">
          {loans.map((p) => {
            const club = L.teams[p.team!];
            const st = seasonTotal(p, L.season);
            return (
              <div key={p.id} onClick={() => push('player', { id: p.id })} className="press flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0">
                <PlayerPhoto L={L} p={p} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-medium truncate">{dispName(p)} · {p.ovr}</div>
                  <div className="text-[12px] text-muted truncate">{club.ru} · {LEAGUES[club.lg].short} · {st.gp ? `${st.gp} матч., ${st.g} гол., оценка ${avgRating(st).toFixed(1)}` : 'ещё не играл'}</div>
                </div>
                <TeamBadge team={club} size={30} />
              </div>
            );
          })}
        </Card>
      ) : (
        <div className="text-[13px] text-muted px-1 leading-snug">Никого. Молодым игрокам без места в составе нужна практика: рост рейтинга зависит от сыгранных минут. Отдать в аренду можно из профиля игрока в трансферное окно — вернётся {dateRu(addDays(`${L.season + 1}-06-20`, 0))}.</div>
      )}
      </div>
      </div>
    </Screen>
  );
}

function Effect({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[14px] border-b border-white/5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className={cx('num text-[14.5px]', bad ? 'text-bad' : good ? 'text-good' : 'text-ink')}>{value}</span>
    </div>
  );
}

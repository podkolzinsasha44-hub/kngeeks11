import { useMemo } from 'react';
import { useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { LEAGUES, foreignLimit, isLeague, windowOpen } from '../../engine/leagues';
import { lineupValid, teamPower } from '../../engine/lineup';
import { gameOdds, seasonOdds } from '../../engine/projection';
import { nextUserGame, teamGames } from '../../engine/season';
import { placeOf } from '../../engine/standings';
import { unreadCount } from '../../engine/news';
import { wageBill } from '../../engine/contracts';
import { foreignOnPitch } from '../../engine/ai';
import { resultOf } from '../../store/game';
import { Card, cx, Meter, SectionTitle, Chevron, Pill } from '../components/kit';
import { Screen, Icon } from '../components/shell';
import { OddsBar, TeamBadge } from '../components/media';
import { Ring } from '../components/charts';
import { dateLong, dateShort, dowRu, money, recordStr, seasonLabel } from '../format';
import { SimDock } from './SimOverlay';

export function Office() {
  const L = useL();
  const push = useNav((s) => s.push);
  const go = useNav((s) => s.go);
  const openModal = useNav((s) => s.openModal);
  const t = L.teams[L.user];
  const ng = nextUserGame(L);
  const lim = foreignLimit(t.lg, L.season);
  const xiKey = t.lineup.xi.join(',') + t.lineup.form + t.tactic;
  const opp = ng ? L.teams[ng.h === L.user ? ng.a : ng.h] : null;
  // The odds come from the match engine itself, played with the two elevens as they stand now.
  const odds = useMemo(() => (ng ? gameOdds(L, ng.h, ng.a, ng.comp, 400) : null), [ng?.id, xiKey, opp?.lineup.xi.join(','), L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const so = useMemo(() => (L.comps[t.lg].phase !== 'done' ? seasonOdds(L, t.lg, 250)[t.id] : null), [L.date, xiKey, t.lg]); // eslint-disable-line react-hooks/exhaustive-deps
  const home = ng?.h === L.user;
  const unread = unreadCount(L);
  const recent = teamGames(L, L.user).filter((g) => g.played).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 5);
  const valid = lineupValid(L, t) && (!lim || foreignOnPitch(L, t) <= lim[1]);
  const cfg = LEAGUES[t.lg];
  const place = placeOf(L, t.id);
  return (
    <Screen
      title={t.ru}
      subtitle={`${cfg.short} · ${seasonLabel(L.season)} · ${dateLong(L.date)}`}
      right={<button onClick={() => push('inbox')} className="press relative w-11 h-11 flex items-center justify-center" aria-label="Входящие"><Icon name="mail" />{!!unread && <span className="absolute top-1.5 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-bad text-white text-[10.5px] font-semibold flex items-center justify-center">{unread}</span>}</button>}
    >
      <Card className="mt-1 relative overflow-hidden" pad={false}>
        <div className="absolute inset-0 opacity-60" style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${t.primary} 55%, transparent), transparent 65%)` }} />
        <div className="relative p-4 flex items-center gap-3">
          <TeamBadge team={t} size={54} />
          <div className="flex-1 min-w-0">
            <div className="font-display uppercase text-[22px] leading-tight truncate">{t.ru}</div>
            <div className="text-[13px] text-ink/80">{t.rec.gp ? `${place}-е место · ${recordStr(t)} · ${t.rec.pts} очк.` : 'Сезон ещё не начался'}</div>
          </div>
          <div className="text-right">
            <div className="num text-[26px] leading-none">{teamPower(L, t).toFixed(0)}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted">сила старта</div>
          </div>
        </div>
      </Card>

      {!valid && (
        <Card className="mt-3 border-bad/40" onClick={() => go('roster', undefined, { tab: 'lineup' })}>
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1 text-[14px]"><b>Состав на матч неполный.</b> Игрок из старта травмирован, дисквалифицирован или превышен лимит на легионеров. Нажмите, чтобы поправить.</div>
            <Chevron />
          </div>
        </Card>
      )}

      {ng && opp && odds && (
        <>
          <SectionTitle right={<span className="text-[12px] text-muted">{dowRu(ng.day)}, {dateShort(ng.day)} · {isLeague(ng.comp) ? `${ng.rd}-й тур` : `${ng.comp === 'CUP' ? 'Кубок России' : 'Переходные матчи'}${ng.rd ? ` · ${ng.rd}` : ''}`}</span>}>Следующий матч</SectionTitle>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <Side name={L.teams[ng.h].ru} id={ng.h} power={teamPower(L, L.teams[ng.h])} sub={home ? 'мы · дома' : 'дома'} />
              <div className="text-center shrink-0 px-1">
                <div className="font-display text-[15px] text-muted">VS</div>
                <div className="text-[11px] text-faint mt-1">ожид. голы</div>
                <div className="num text-[15px]">{odds.xgH.toFixed(1)} : {odds.xgA.toFixed(1)}</div>
              </div>
              <Side name={L.teams[ng.a].ru} id={ng.a} power={teamPower(L, L.teams[ng.a])} sub={home ? 'в гостях' : 'мы · в гостях'} right />
            </div>
            <div className="mt-4">
              <OddsBar h={home ? odds.h : odds.a} d={odds.d} a={home ? odds.a : odds.h} />
            </div>
            <div className="text-[11.5px] text-muted mt-2.5 leading-snug">Шансы — это {400} прогонов матчевого движка с вашими одиннадцатью и составом соперника. Поменяете состав или тактику — цифры изменятся.</div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => go('roster', undefined, { tab: 'lineup' })} className="press flex-1 h-10 rounded-xl glass text-[14px] font-medium">Расстановка {t.lineup.auto ? '· авто' : ''}</button>
              <button onClick={() => push('team', { id: opp.id })} className="press flex-1 h-10 rounded-xl glass text-[14px] font-medium">Соперник</button>
            </div>
          </Card>
        </>
      )}

      {recent.length > 0 && (
        <div className="flex gap-2 mt-3">
          {recent.reverse().map((g) => {
            const r = resultOf(L, g);
            return (
              <button key={g.id} onClick={() => openModal('match', { id: g.id })} className="press flex-1 glass rounded-xl py-1.5 text-center">
                <div className={cx('text-[11px] font-semibold', r === 'W' ? 'text-good' : r === 'L' ? 'text-bad' : 'text-muted')}>{r === 'W' ? 'В' : r === 'L' ? 'П' : 'Н'}</div>
                <div className="num text-[14px] leading-tight">{g.hs}:{g.as}</div>
                <div className="text-[10px] text-faint">{L.teams[g.h === L.user ? g.a : g.h].short}</div>
              </button>
            );
          })}
        </div>
      )}

      {so && (
        <>
          <SectionTitle>Прогноз сезона</SectionTitle>
          <Card className="flex items-center justify-around">
            <Ring value={so.title} label={cfg.up ? '1-е место' : 'титул'} color="#e8c26a" />
            <Ring value={so.top} label={cfg.up ? 'выход' : `топ-${cfg.top}`} />
            {(cfg.relegate > 0 || cfg.playoff > 0) && <Ring value={so.down} label="зона вылета" color="#ff5a5f" />}
            <div className="text-center">
              <div className="num text-[24px] leading-none">{so.pts.toFixed(0)}</div>
              <div className="text-[9px] text-muted uppercase tracking-wider mt-1">очков · ~{so.place.toFixed(0)}-е</div>
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Руководство</SectionTitle>
      <Card>
        <div className="flex justify-between text-[13px] mb-1.5"><span className="text-muted">Доверие совета директоров</span><span className="num">{L.owner.trust}/100</span></div>
        <Meter value={L.owner.trust} color={L.owner.trust < 30 ? '#ff5a5f' : L.owner.trust < 55 ? '#ffb547' : '#3ddc97'} />
        <div className="text-[13.5px] mt-3"><span className="text-muted">Задача на сезон:</span> {L.owner.goalText}.</div>
      </Card>

      <SectionTitle>Финансы</SectionTitle>
      <Card onClick={() => go('more', 'finance')}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[14px]"><span className="text-muted">Бюджет на трансферы</span><span className="num text-[16px]">{money(t.budget)}</span></div>
            <div className="flex justify-between text-[14px] mt-1"><span className="text-muted">Зарплаты</span><span className="num text-[16px]">{money(wageBill(L, t.id))} / {money(t.wageBudget)}</span></div>
          </div>
          <Chevron />
        </div>
        <div className="mt-2 flex gap-1.5 flex-wrap">
          <Pill color={windowOpen(L) ? '#3ddc97' : '#8b98ae'}>{windowOpen(L) ? 'Трансферное окно открыто' : 'Окно закрыто'}</Pill>
          {lim && <Pill>Легионеры: до {lim[0]} в заявке, {lim[1]} на поле</Pill>}
        </div>
      </Card>

      {L.inbox.filter((m) => !m.read).slice(0, 3).length > 0 && (
        <>
          <SectionTitle right={<button className="text-[13px] accent-text" onClick={() => push('inbox')}>Все</button>}>Входящие</SectionTitle>
          <Card pad={false}>
            {L.inbox.filter((m) => !m.read).slice(0, 3).map((m) => (
              <div key={m.id} onClick={() => push('inbox', { open: m.id })} className="press px-4 py-3 border-b border-white/5 last:border-0">
                <div className="text-[12px] text-muted">{m.from} · {dateShort(m.date)}</div>
                <div className="text-[14.5px] font-medium truncate">{m.title}</div>
              </div>
            ))}
          </Card>
        </>
      )}
      <SimDock />
    </Screen>
  );
}

function Side({ name, id, power, sub, right }: { name: string; id: string; power: number; sub: string; right?: boolean }) {
  return (
    <div className={cx('flex-1 min-w-0 flex flex-col gap-1', right ? 'items-end text-right' : 'items-start')}>
      <TeamBadge id={id} size={46} />
      <div className="font-display uppercase text-[16px] leading-tight truncate max-w-full">{name}</div>
      <div className="text-[11.5px] text-muted">{sub} · сила {power.toFixed(0)}</div>
    </div>
  );
}

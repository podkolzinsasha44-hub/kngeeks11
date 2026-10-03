import type { ComponentType } from 'react';
import { Office } from './screens/Office';
import { Roster } from './screens/Roster';
import { PlayerScreen } from './screens/Player';
import { Market } from './screens/Market';
import { NegotiateScreen } from './screens/Negotiate';
import { LeagueScreen, TeamScreen } from './screens/League';
import { MatchScreen } from './screens/Match';
import { CareerScreen, CelebrationModal, FinanceScreen, HistoryScreen, InboxScreen, IntlScreen, MoreScreen, NewsScreen, SettingsScreen } from './screens/More';

type RouteComp = ComponentType<{ params: Record<string, unknown> }>;

export const ROUTES: Record<string, RouteComp> = {
  office: Office,
  roster: Roster,
  market: Market,
  league: LeagueScreen,
  more: MoreScreen,
  inbox: InboxScreen,
  news: NewsScreen,
  player: PlayerScreen,
  team: TeamScreen,
  negotiate: NegotiateScreen,
  finance: FinanceScreen,
  history: HistoryScreen,
  career: CareerScreen,
  settings: SettingsScreen,
  intl: IntlScreen,
};

export const MODALS: Record<string, RouteComp> = {
  match: MatchScreen,
  celebration: CelebrationModal,
};

export type Pos = 'G' | 'D' | 'M' | 'F';
/** Detailed position on the pitch. */
export type Role = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';
export type Status = 'ACT' | 'FA' | 'RET';
export type Difficulty = 'rookie' | 'real' | 'hard';
/** Club leagues simulated by the engine. */
export type LeagueId = 'RPL' | 'FNL' | 'L2A' | 'L2B' | 'U17' | 'EPL' | 'ESP' | 'ITA' | 'GER' | 'FRA';
export type Strategy = 'contend' | 'bubble' | 'rebuild';
export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2' | '4-1-4-1' | '3-4-3';
export type Tactic = 'attack' | 'balanced' | 'defense';

export interface OutfieldAttrs {
  pac: number; // pace
  sho: number; // shooting
  pas: number; // passing
  dri: number; // dribbling
  att: number; // attacking positioning
  def: number; // defending
  phy: number; // physical
  hea: number; // heading
  dis: number; // discipline
  sta: number; // stamina / durability
}
export interface KeeperAttrs {
  ref: number; // reflexes
  pos: number; // positioning
  han: number; // handling
  kic: number; // distribution
  con: number; // consistency
  men: number; // mental
  sta: number;
}
export type Attrs = OutfieldAttrs | KeeperAttrs;

export interface Contract {
  /** Yearly wage, EUR. */
  wage: number;
  /** Year in which the contract ends on June 30 (2029 = until 30.06.2029). */
  until: number;
  signed?: number;
  /** Release clause, EUR. */
  release?: number;
  real?: boolean;
}

export interface StatLine {
  gp: number; gs: number; min: number; g: number; a: number; sh: number; yc: number; rc: number;
  /** Player-of-the-match awards and sum of match ratings (×10). */
  mom: number; rt: number;
  /** Goalkeepers: clean sheets, goals against, saves. */
  cs: number; ga: number; sv: number;
}

export interface Injury { type: string; days: number; total: number }

export interface Personality {
  lead: number; // 1-20
  prof: number;
  loy: number;
  greed: number;
  win: number;
}

export interface Player {
  id: number;
  fn: string;
  ln: string;
  /** Name in Russian, when known. */
  ru?: string;
  pos: Pos;
  role: Role;
  /** Other positions the player is comfortable in. */
  alt?: Role[];
  foot: 'L' | 'R' | 'B';
  bd: string;
  /** Only the year of birth (or not even that) is known from the sources. */
  bdApprox?: boolean;
  /** FIFA country code. */
  ctry: string;
  ht: number;
  num: number | null;
  /** Photo file on the Transfermarkt image CDN ("<id>-<timestamp>.jpg"), loaded by the UI at runtime. */
  img: string | null;
  real: boolean;
  team: string | null;
  st: Status;
  ovr: number;
  pot: number;
  r: Attrs;
  tr: string[];
  /** Market value, EUR (updated by the engine every month). */
  val: number;
  c: Contract | null;
  /** Club outside the simulated leagues the player belongs to (team is null then). */
  ext?: string;
  /** Loan: owner club ('' = a club outside the simulated leagues) and the year the loan ends on June 30. */
  loan?: { from: string; until: number };
  morale: number;
  form: number;
  /** Match fitness 0..100. */
  fit: number;
  inj: Injury | null;
  /** Matches of suspension remaining, keyed by competition group ('L' league, 'C' cup). */
  susp?: number;
  /** Yellow cards in the league this season. */
  yel?: number;
  pers: Personality;
  dev: 'E' | 'N' | 'L';
  /** Stats keyed by season and competition: "2026:RPL", "2026:CUP", "2030:WC". */
  stats: Record<string, StatLine>;
  /** Real seasons before the game started: [season, club, comp, gp, g, a, min]. */
  h?: (string | number)[][];
  /** In-game OVR history: [season, ovr]. */
  hist: [number, number][];
  awards: string[];
  teams: string[];
  /** Caps and goals for the national team. */
  caps: number;
  ig: number;
  /** National team honours: "wc:2026:gold". */
  intl?: string[];
  wantsOut?: boolean;
  /** Put on the transfer list by the club. */
  listed?: boolean;
  retired?: number;
  focus?: keyof OutfieldAttrs | keyof KeeperAttrs | null;
  talksBlockedUntil?: string;
  /** Season the player joined the current club. */
  joined?: number;
  /** How the user's club got him: fee (0 = free agent), date and the club he came from (display name). */
  bought?: { fee: number; date: string; from: string | null };
  /** Academy graduate still unknown to scouts: displayed potential is a range. */
  yth?: boolean;
  /** A player of a youth team: a placeholder or typed in by the user (not real data of the game). */
  custom?: boolean;
}

export interface Lineup {
  form: FormationId;
  /** 11 player ids in formation slot order; slot 0 is the goalkeeper. */
  xi: number[];
  bench: number[];
  /** True: the assistant picks the team before every match. False: the user's XI is played as set. */
  auto: boolean;
  pen?: number;
  cap?: number;
}

export interface Record_ {
  gp: number; w: number; d: number; l: number; pts: number; gf: number; ga: number;
  hw: number; hd: number; hl: number; streak: string; l5: ('W' | 'D' | 'L')[];
  sf: number; sa: number;
}

export interface Coach {
  name: string;
  rating: number; // 50-95
  style: 'offense' | 'defense' | 'balanced' | 'development';
  age: number;
  wage: number;
}

export interface Team {
  id: string;
  /** League of the club. Clubs from outside the simulated leagues (Champions League guests) carry 'EXT'. */
  lg: LeagueId;
  /** A club outside the seven simulated leagues: it lives in L.ext and plays only in the Champions League. */
  ext?: true;
  /** Transfermarkt club id: the crest is loaded from its image CDN. */
  tm?: number;
  /** Full crest URL for clubs Transfermarkt does not cover (the Second League: the league's own site). */
  logo?: string;
  name: string;
  /** Russian name for the interface. */
  ru: string;
  city: string;
  short: string;
  country: string;
  primary: string;
  secondary: string;
  accent: string;
  stadium: string;
  cap: number;
  /** Club reputation 1..100 (history, market, fan base). */
  rep: number;
  lastGame?: string;
  tactic: Tactic;
  last: { pos: number; w: number; d: number; l: number; pts: number; gf: number; ga: number; lg: LeagueId } | null;
  lineup: Lineup;
  rec: Record_;
  strategy: Strategy;
  coach: Coach;
  fans: number; // 0-100 mood
  /** Relationship of this AI club with the user (0-100). */
  rel: number;
  staff: { med: number; scouting: number; academy: number };
  /** Titles: league, cup. */
  titles: number;
  cups: number;
  /** Money available for transfers and yearly wage budget, EUR. */
  budget: number;
  wageBudget: number;
  trophies: string[];
}

export interface Game {
  id: number;
  /** Competition: league id, 'CUP' (Russian Cup), 'SC' (Super Cup), 'PO' (relegation play-offs). */
  comp: string;
  day: string;
  h: string;
  a: string;
  /** League round or cup stage name. */
  rd?: number | string;
  played?: boolean;
  hs?: number;
  as?: number;
  /** Extra time played; penalty shoot-out score. */
  et?: boolean;
  pen?: [number, number];
  shH?: number;
  shA?: number;
  /** xG of both sides ×100. */
  xg?: [number, number];
  mom?: number;
  /** Knock-out tie id (cup, play-offs). */
  tie?: string;
  neutral?: boolean;
}

export interface CupTie {
  id: string;
  round: number;
  h: string;
  a: string;
  /** Game ids (two-legged ties have two). */
  games: number[];
  winner?: string;
}
export interface Cup {
  id: string;
  name: string;
  season: number;
  /** Round names in order and their dates. */
  rounds: { name: string; day: string }[];
  round: number;
  ties: CupTie[];
  champion?: string;
  finalist?: string;
}

export type NewsKind = 'transfer' | 'sign' | 'injury' | 'game' | 'award' | 'youth' | 'rumor' | 'owner' | 'milestone' | 'league' | 'social' | 'suspension' | 'retire' | 'achievement' | 'intl';

export interface News {
  id: number;
  date: string;
  kind: NewsKind;
  title: string;
  body?: string;
  team?: string;
  players?: number[];
  author?: string;
  handle?: string;
  likes?: number;
  grade?: string;
  important?: boolean;
}

export interface Message {
  id: number;
  date: string;
  from: string;
  title: string;
  body: string;
  read: boolean;
  kind: 'owner' | 'transfer' | 'player' | 'staff' | 'league' | 'agent' | 'media';
  ref?: { type: 'offer' | 'player' | 'press' | 'screen' | 'game'; id: number | string };
  choices?: { label: string; effect: string }[];
  resolved?: string;
}

/** A bid from one club to another for a player. */
export interface TransferOffer {
  id: number;
  date: string;
  player: number;
  from: string; // buying club
  to: string; // selling club
  fee: number;
  /** Loan until the end of the season instead of a permanent move. */
  loan?: boolean;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'done' | 'collapsed';
  /** Counter-offer fee asked by the seller. */
  ask?: number;
  expires: string;
  note?: string;
}

export interface TransferRecord {
  id: number;
  date: string;
  season: number;
  player: number;
  name: string;
  from: string | null;
  to: string;
  fee: number;
  loan?: boolean;
  user: boolean;
  grade?: string;
}

export interface Negotiation {
  player: number;
  team: string;
  ask: { wage: number; years: number };
  floor: number; // hidden minimum wage
  patience: number; // 0-100
  rounds: number;
  history: { wage: number; years: number; result: string }[];
  status: 'open' | 'signed' | 'broken';
  kind: 'extend' | 'free' | 'transfer';
  /** Agreed fee with the selling club (transfer talks). */
  fee?: number;
  offer?: number;
}

export interface SeasonSummary {
  season: number;
  lg: LeagueId;
  champion: string;
  cup?: string;
  awards: Record<string, number>;
  userRecord: { w: number; d: number; l: number; pts: number; place: number; lg: LeagueId };
  standings: { id: string; pts: number }[];
  topScorer?: { id: number; name: string; g: number };
  relegated: string[];
  promoted: string[];
}

export interface OwnerState {
  name: string;
  trust: number; // 0-100
  goal: 'title' | 'top3' | 'top6' | 'mid' | 'survive' | 'promote' | 'playoff';
  goalText: string;
  patience: number; // 1-3
  warnings: number;
}

export interface GMState {
  name: string;
  rep: number; // 0-100
  seasons: number;
  titles: number;
  hiredSeason: number;
  history: { season: number; team: string; result: string }[];
  fired: boolean;
  offers?: string[];
}

export interface Settings {
  difficulty: Difficulty;
  sound: boolean;
  assistant: boolean;
  stopOnUserGames: boolean;
  watchGames: boolean;
  hideMedia: boolean;
  noFiring?: boolean;
  /** Russia takes part in FIFA / UEFA tournaments, the Champions League included (suspended in reality since 2022). */
  intlRussia?: boolean;
  /** The assistant extends good contracts of the user's players by itself (on unless switched off). */
  autoRenew?: boolean;
}

export interface Scouting {
  /** player id -> knowledge 0..1 */
  know: Record<number, number>;
  shortlist: number[];
}

/** A domestic league competition. */
export interface LeagueComp {
  id: LeagueId;
  name: string;
  country: string;
  tier: number;
  phase: 'preseason' | 'regular' | 'done';
  seasonStart: string;
  seasonEnd: string;
  /** Reigning champion. */
  champion: string;
  history: { season: number; champion: string; second: string; third: string; topScorer?: { id: number; name: string; g: number }; mvp?: number; relegated: string[]; standings: { id: string; pts: number }[] }[];
}

/** A club's line in the league phase of the Champions League. */
export interface UclRow { gp: number; w: number; d: number; l: number; pts: number; gf: number; ga: number; agf: number; aw: number }
export interface Ucl {
  season: number;
  /** Clubs of the league phase in pot order (pot 1 first). */
  pots: string[][];
  table: Record<string, UclRow>;
  phase: 'league' | 'ko' | 'done';
  /** Final league-phase order (set when the league phase ends). */
  order?: string[];
  /** Round of 16 plan: [seeded club, id of the knock-out play-off tie whose winner it meets], in bracket order. */
  plan?: [string, string][];
  /** Reigning holder (the winner of the previous season). */
  holder: string;
  champion?: string;
  finalist?: string;
  final: string;
  history: { season: number; champion: string; finalist: string; topScorer?: { id: number; name: string; g: number } }[];
}

export type IntlKind = 'wc' | 'euro';
export interface IntlGame {
  id: number;
  day: string;
  h: string;
  a: string;
  /** Group letter or knock-out stage: 'r32', 'r16', 'qf', 'sf', 'bronze', 'final'. */
  stage: string;
  played?: boolean;
  hs?: number;
  as?: number;
  et?: boolean;
  pen?: [number, number];
  mom?: number;
}
export interface IntlRecord { gp: number; w: number; d: number; l: number; pts: number; gf: number; ga: number }
export interface Tournament {
  id: string;
  kind: IntlKind;
  year: number;
  name: string;
  host: string;
  start: string;
  end: string;
  select: string;
  named?: boolean;
  teams: string[];
  groups: Record<string, string[]>;
  rosters: Record<string, number[]>;
  lineups: Record<string, Lineup>;
  games: IntlGame[];
  table: Record<string, IntlRecord>;
  phase: 'upcoming' | 'group' | 'playoff' | 'done';
  medals?: string[];
  mvp?: number;
}
export interface IntlState {
  coach?: string;
  current: Tournament | null;
  prev?: Tournament;
  history: { id: string; kind: IntlKind; year: number; name: string; medals: string[]; mvp?: number; topScorer?: { id: number; name: string; g: number }; real?: boolean }[];
  /** National team strength order (best first). */
  ranking: string[];
  nextGameId: number;
}

export interface League {
  v: number;
  seed: number;
  rng: [number, number, number, number];
  season: number; // 2026 = 2026-27
  date: string;
  /** Global phase for the user's league. */
  phase: 'preseason' | 'regular' | 'offseason';
  user: string;
  gm: GMState;
  owner: OwnerState;
  settings: Settings;
  comps: Record<string, LeagueComp>;
  cups: Record<string, Cup>;
  intl: IntlState;
  teams: Record<string, Team>;
  /** Clubs from outside the simulated leagues that play in the Champions League (see ucl.ts). */
  ext?: Record<string, Team>;
  ucl?: Ucl;
  players: Record<number, Player>;
  nextId: number;
  games: Game[];
  nextGameId: number;
  negotiations: Record<number, Negotiation>;
  news: News[];
  inbox: Message[];
  nextMsgId: number;
  offers: TransferOffer[];
  transfers: TransferRecord[];
  history: SeasonSummary[];
  achievements: Record<string, string>;
  scouting: Scouting;
  watch: number[];
  rivals: [string, string][];
  meta: { snapshot: string; worldChampion: string };
  stops: string[];
  lastUserGame?: number;
  album: number[];
  flags: Record<string, boolean>;
  oddsHist?: [string, number, number][];
  /** Transfer windows of the season: [from, to] pairs. */
  windows: [string, string][];
  /** Academy intake waiting for the user's decision. */
  intake?: number[];
  seasonLog: { bought: number; sold: number; spent: number; earned: number; userGames: { w: number; d: number; l: number } };
}

export interface GameEvent {
  /** Minute of the match (1..120). */
  m: number;
  type: 'goal' | 'yellow' | 'red' | 'sub' | 'injury' | 'half' | 'end' | 'chance' | 'save' | 'pen' | 'penmiss' | 'shootout' | 'kickoff';
  team: string;
  text: string;
  players?: number[];
  score?: [number, number];
  /** Pitch coordinates 0..1 (attacking right for home). */
  x?: number;
  y?: number;
}

export interface GameResult {
  hs: number;
  as: number;
  et: boolean;
  pen: [number, number] | null;
  shH: number;
  shA: number;
  onH: number;
  onA: number;
  xgH: number;
  xgA: number;
  posH: number; // possession share 0..1
  events: GameEvent[];
  mom: number;
  shotsMap: { team: string; x: number; y: number; goal: boolean; xg: number }[];
  injuries: { id: number; days: number; type: string }[];
  momentum: number[]; // per 5 minutes, home minus away xG share
}

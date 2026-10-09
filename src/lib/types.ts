export type Lang = 'en' | 'de';
export type ThemePref = 'system' | 'dark' | 'light';
export type Server = 'america' | 'europe' | 'asia';
export type TitleLang = 'romaji' | 'english' | 'native';

export type Element = 'pyro' | 'hydro' | 'anemo' | 'electro' | 'dendro' | 'cryo' | 'geo' | 'adaptive';
export type Weapon = 'sword' | 'claymore' | 'polearm' | 'bow' | 'catalyst';
export type Region =
  | 'mondstadt'
  | 'liyue'
  | 'inazuma'
  | 'sumeru'
  | 'fontaine'
  | 'natlan'
  | 'nodkrai'
  | 'snezhnaya'
  | 'other';

export interface CharacterDef {
  id: string;
  name: string;
  element: Element;
  weapon: Weapon;
  rarity: 4 | 5;
  region: Region;
  custom?: boolean;
}

export type BuildStatus = 'planned' | 'farming' | 'built';

export interface OwnedCharacter {
  level: number;
  constellation: number;
  talents: [number, number, number];
  friendship: number;
  weapon: string;
  refinement: number;
  artifacts: string;
  build: BuildStatus;
  favorite: boolean;
  notes: string;
  updatedAt: number;
}

export type TaskPeriod = 'daily' | 'weekly' | 'monthly' | 'cooldown';

export interface Task {
  id: string;
  /** i18n key for built-in tasks; custom tasks use `label`. */
  key?: string;
  label: string;
  period: TaskPeriod;
  /** Day of month for monthly resets (1–28). */
  monthDay?: number;
  /** Hours for cooldown tasks. */
  cooldownHours?: number;
  doneAt?: number;
  hidden?: boolean;
}

export type BannerKey = 'character' | 'weapon' | 'standard' | 'chronicled';

export interface FiveStarRecord {
  id: string;
  name: string;
  pity: number;
  /** 'won' | 'lost' 50/50, 'guaranteed', or 'na' for standard banner. */
  outcome: 'won' | 'lost' | 'guaranteed' | 'na';
  at: number;
}

export interface BannerState {
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  /** Epitomized Path fate points (weapon banner). */
  fatePoints: number;
  total: number;
  history: FiveStarRecord[];
}

export interface WishPlan {
  primogems: number;
  fates: number;
  starglitter: number;
  banner: 'character' | 'weapon';
  copies: number;
  /** Featured win rate for the character banner (0.5 or 0.55 with Capturing Radiance). */
  rate: number;
}

export type AnimeStatus = 'watching' | 'planning' | 'completed' | 'paused' | 'dropped';

export interface AnimeEntry {
  id: string;
  anilistId?: number;
  title: { romaji: string; english?: string; native?: string };
  cover?: string;
  banner?: string;
  color?: string;
  format?: string;
  episodes?: number;
  duration?: number;
  genres: string[];
  season?: string;
  year?: number;
  airStatus?: string;
  averageScore?: number;
  synopsis?: string;
  nextAiring?: { at: number; episode: number };
  /** Manual weekly schedule: 0 = Sunday … 6 = Saturday, time "HH:MM" (local). */
  airDay?: number;
  airTime?: string;
  status: AnimeStatus;
  progress: number;
  score: number;
  rewatches: number;
  favorite: boolean;
  notes: string;
  addedAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  syncedAt?: number;
}

export interface Settings {
  lang: Lang;
  theme: ThemePref;
  server: Server;
  titleLang: TitleLang;
  resinCap: number;
  resinNotify: boolean;
  sidebarCollapsed: boolean;
}

export interface ResinState {
  value: number;
  at: number;
  condensed: number;
  fragile: number;
}

export interface AppState {
  version: 1;
  settings: Settings;
  resin: ResinState;
  tasks: Task[];
  characters: Record<string, OwnedCharacter>;
  customCharacters: CharacterDef[];
  banners: Record<BannerKey, BannerState>;
  plan: WishPlan;
  anime: AnimeEntry[];
}

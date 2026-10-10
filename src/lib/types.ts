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
  nameDe?: string;
  avatarId?: number;
  /** Release timestamp (seconds). */
  release?: number;
  icon?: string;
}

export interface WeaponDef {
  id: number;
  key: string;
  name: string;
  nameDe?: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  type: Weapon;
  icon: string;
}

/** HoYoverse gacha_type values. 400 is the second character event banner. */
export type GachaType = '100' | '200' | '301' | '400' | '302' | '500';
export type WishPool = BannerKey | 'beginner';

/** One pull, as returned by the in-game wish history (UIGF-compatible). */
export interface WishRecord {
  /** HoYoverse record id: unique and increasing over time. */
  id: string;
  gachaType: GachaType;
  name: string;
  itemType: 'character' | 'weapon';
  rank: 3 | 4 | 5;
  /** Server-local time "YYYY-MM-DD HH:mm:ss". */
  time: string;
  itemId?: string;
}

export interface WishMeta {
  uid?: string;
  importedAt?: number;
  source?: string;
  /** Manual corrections of the 50/50 result, keyed by record id. */
  overrides: Record<string, 'won' | 'lost'>;
  /** Number of wish records last applied to the character roster. */
  charSync?: number;
}

export type ArtifactSlot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';

export interface InvWeapon {
  key: string;
  name: string;
  level: number;
  ascension: number;
  refinement: number;
  location: string;
  lock: boolean;
}

export interface InvArtifact {
  setKey: string;
  slotKey: ArtifactSlot;
  level: number;
  rarity: number;
  mainStatKey: string;
  location: string;
  lock: boolean;
  substats: { key: string; value: number }[];
}

export interface Inventory {
  weapons: InvWeapon[];
  artifacts: InvArtifact[];
  materials: Record<string, number>;
  importedAt?: number;
  source?: string;
}

export interface Account {
  uid?: string;
  nickname?: string;
  level?: number;
  worldLevel?: number;
  server?: string;
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
  /** Ascension phase 0–6 (from imports). */
  ascension?: number;
  /** Copies found in the imported wish history. */
  wishCopies?: number;
  /** false while the entry only comes from wish history (level/talents unknown). */
  detailsKnown?: boolean;
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
  /** Savings forecast: target date (YYYY-MM-DD, empty = off) and income. */
  targetDate: string;
  dailyPrimos: number;
  welkin: boolean;
  monthlyPrimos: number;
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
  /** Optional CORS proxy for importing wishes from a URL (see tools/proxy). */
  proxyUrl: string;
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
  wishes: WishRecord[];
  wishMeta: WishMeta;
  inventory: Inventory;
  account: Account;
  /** Characters in the farming plan with their target level and talents. */
  farming: FarmTarget[];
}

export interface FarmTarget {
  id: string;
  level: number;
  talents: [number, number, number];
}

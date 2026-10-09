import type { CharacterDef, Element, Region, Weapon } from '../lib/types';

type Row = [name: string, element: Element, weapon: Weapon, rarity: 4 | 5, region: Region];

const ROWS: Row[] = [
  ['Traveler', 'adaptive', 'sword', 5, 'other'],
  // Mondstadt
  ['Albedo', 'geo', 'sword', 5, 'mondstadt'],
  ['Amber', 'pyro', 'bow', 4, 'mondstadt'],
  ['Barbara', 'hydro', 'catalyst', 4, 'mondstadt'],
  ['Bennett', 'pyro', 'sword', 4, 'mondstadt'],
  ['Dahlia', 'hydro', 'sword', 4, 'mondstadt'],
  ['Diluc', 'pyro', 'claymore', 5, 'mondstadt'],
  ['Diona', 'cryo', 'bow', 4, 'mondstadt'],
  ['Eula', 'cryo', 'claymore', 5, 'mondstadt'],
  ['Fischl', 'electro', 'bow', 4, 'mondstadt'],
  ['Jean', 'anemo', 'sword', 5, 'mondstadt'],
  ['Kaeya', 'cryo', 'sword', 4, 'mondstadt'],
  ['Klee', 'pyro', 'catalyst', 5, 'mondstadt'],
  ['Lisa', 'electro', 'catalyst', 4, 'mondstadt'],
  ['Mika', 'cryo', 'polearm', 4, 'mondstadt'],
  ['Mona', 'hydro', 'catalyst', 5, 'mondstadt'],
  ['Noelle', 'geo', 'claymore', 4, 'mondstadt'],
  ['Razor', 'electro', 'claymore', 4, 'mondstadt'],
  ['Rosaria', 'cryo', 'polearm', 4, 'mondstadt'],
  ['Sucrose', 'anemo', 'catalyst', 4, 'mondstadt'],
  ['Venti', 'anemo', 'bow', 5, 'mondstadt'],
  // Liyue
  ['Baizhu', 'dendro', 'catalyst', 5, 'liyue'],
  ['Beidou', 'electro', 'claymore', 4, 'liyue'],
  ['Chongyun', 'cryo', 'claymore', 4, 'liyue'],
  ['Gaming', 'pyro', 'claymore', 4, 'liyue'],
  ['Ganyu', 'cryo', 'bow', 5, 'liyue'],
  ['Hu Tao', 'pyro', 'polearm', 5, 'liyue'],
  ['Keqing', 'electro', 'sword', 5, 'liyue'],
  ['Lan Yan', 'anemo', 'catalyst', 4, 'liyue'],
  ['Ningguang', 'geo', 'catalyst', 4, 'liyue'],
  ['Qiqi', 'cryo', 'sword', 5, 'liyue'],
  ['Shenhe', 'cryo', 'polearm', 5, 'liyue'],
  ['Xiangling', 'pyro', 'polearm', 4, 'liyue'],
  ['Xianyun', 'anemo', 'catalyst', 5, 'liyue'],
  ['Xiao', 'anemo', 'polearm', 5, 'liyue'],
  ['Xingqiu', 'hydro', 'sword', 4, 'liyue'],
  ['Xinyan', 'pyro', 'claymore', 4, 'liyue'],
  ['Yanfei', 'pyro', 'catalyst', 4, 'liyue'],
  ['Yaoyao', 'dendro', 'polearm', 4, 'liyue'],
  ['Yelan', 'hydro', 'bow', 5, 'liyue'],
  ['Yun Jin', 'geo', 'polearm', 4, 'liyue'],
  ['Zhongli', 'geo', 'polearm', 5, 'liyue'],
  // Inazuma
  ['Arataki Itto', 'geo', 'claymore', 5, 'inazuma'],
  ['Chiori', 'geo', 'sword', 5, 'inazuma'],
  ['Gorou', 'geo', 'bow', 4, 'inazuma'],
  ['Kaedehara Kazuha', 'anemo', 'sword', 5, 'inazuma'],
  ['Kamisato Ayaka', 'cryo', 'sword', 5, 'inazuma'],
  ['Kamisato Ayato', 'hydro', 'sword', 5, 'inazuma'],
  ['Kirara', 'dendro', 'sword', 4, 'inazuma'],
  ['Kujou Sara', 'electro', 'bow', 4, 'inazuma'],
  ['Kuki Shinobu', 'electro', 'sword', 4, 'inazuma'],
  ['Raiden Shogun', 'electro', 'polearm', 5, 'inazuma'],
  ['Sangonomiya Kokomi', 'hydro', 'catalyst', 5, 'inazuma'],
  ['Sayu', 'anemo', 'claymore', 4, 'inazuma'],
  ['Shikanoin Heizou', 'anemo', 'catalyst', 4, 'inazuma'],
  ['Thoma', 'pyro', 'polearm', 4, 'inazuma'],
  ['Yae Miko', 'electro', 'catalyst', 5, 'inazuma'],
  ['Yoimiya', 'pyro', 'bow', 5, 'inazuma'],
  ['Yumemizuki Mizuki', 'anemo', 'catalyst', 5, 'inazuma'],
  // Sumeru
  ['Alhaitham', 'dendro', 'sword', 5, 'sumeru'],
  ['Candace', 'hydro', 'polearm', 4, 'sumeru'],
  ['Collei', 'dendro', 'bow', 4, 'sumeru'],
  ['Cyno', 'electro', 'polearm', 5, 'sumeru'],
  ['Dehya', 'pyro', 'claymore', 5, 'sumeru'],
  ['Dori', 'electro', 'claymore', 4, 'sumeru'],
  ['Faruzan', 'anemo', 'bow', 4, 'sumeru'],
  ['Kaveh', 'dendro', 'claymore', 4, 'sumeru'],
  ['Layla', 'cryo', 'sword', 4, 'sumeru'],
  ['Nahida', 'dendro', 'catalyst', 5, 'sumeru'],
  ['Nilou', 'hydro', 'sword', 5, 'sumeru'],
  ['Sethos', 'electro', 'bow', 4, 'sumeru'],
  ['Tighnari', 'dendro', 'bow', 5, 'sumeru'],
  ['Wanderer', 'anemo', 'catalyst', 5, 'sumeru'],
  // Fontaine
  ['Arlecchino', 'pyro', 'polearm', 5, 'fontaine'],
  ['Charlotte', 'cryo', 'catalyst', 4, 'fontaine'],
  ['Chevreuse', 'pyro', 'polearm', 4, 'fontaine'],
  ['Clorinde', 'electro', 'sword', 5, 'fontaine'],
  ['Emilie', 'dendro', 'polearm', 5, 'fontaine'],
  ['Escoffier', 'cryo', 'polearm', 5, 'fontaine'],
  ['Freminet', 'cryo', 'claymore', 4, 'fontaine'],
  ['Furina', 'hydro', 'sword', 5, 'fontaine'],
  ['Lynette', 'anemo', 'sword', 4, 'fontaine'],
  ['Lyney', 'pyro', 'bow', 5, 'fontaine'],
  ['Navia', 'geo', 'claymore', 5, 'fontaine'],
  ['Neuvillette', 'hydro', 'catalyst', 5, 'fontaine'],
  ['Sigewinne', 'hydro', 'bow', 5, 'fontaine'],
  ['Wriothesley', 'cryo', 'catalyst', 5, 'fontaine'],
  // Natlan
  ['Chasca', 'anemo', 'bow', 5, 'natlan'],
  ['Citlali', 'cryo', 'catalyst', 5, 'natlan'],
  ['Iansan', 'electro', 'polearm', 4, 'natlan'],
  ['Ifa', 'anemo', 'catalyst', 4, 'natlan'],
  ['Kachina', 'geo', 'polearm', 4, 'natlan'],
  ['Kinich', 'dendro', 'claymore', 5, 'natlan'],
  ['Mavuika', 'pyro', 'claymore', 5, 'natlan'],
  ['Mualani', 'hydro', 'catalyst', 5, 'natlan'],
  ['Ororon', 'electro', 'bow', 4, 'natlan'],
  ['Varesa', 'electro', 'catalyst', 5, 'natlan'],
  ['Xilonen', 'geo', 'sword', 5, 'natlan'],
  // Nod-Krai
  ['Aino', 'hydro', 'claymore', 4, 'nodkrai'],
  ['Durin', 'pyro', 'sword', 5, 'nodkrai'],
  ['Flins', 'electro', 'polearm', 5, 'nodkrai'],
  ['Ineffa', 'electro', 'polearm', 5, 'nodkrai'],
  ['Jahoda', 'anemo', 'bow', 4, 'nodkrai'],
  ['Lauma', 'dendro', 'catalyst', 5, 'nodkrai'],
  ['Nefer', 'dendro', 'catalyst', 5, 'nodkrai'],
  // Snezhnaya & beyond
  ['Skirk', 'cryo', 'sword', 5, 'snezhnaya'],
  ['Tartaglia', 'hydro', 'bow', 5, 'snezhnaya'],
  ['Aloy', 'cryo', 'bow', 5, 'other'],
];

export const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const BASE_CHARACTERS: CharacterDef[] = ROWS.map(([name, element, weapon, rarity, region]) => ({
  id: slug(name),
  name,
  element,
  weapon,
  rarity,
  region,
}));

export const ELEMENTS: Element[] = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'];
export const WEAPONS: Weapon[] = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'];
export const REGIONS: Region[] = [
  'mondstadt',
  'liyue',
  'inazuma',
  'sumeru',
  'fontaine',
  'natlan',
  'nodkrai',
  'snezhnaya',
  'other',
];

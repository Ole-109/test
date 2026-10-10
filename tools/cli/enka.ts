/** Enka.Network: public character showcase (up to 12 characters) by UID, no login needed. */
import { characterByAvatarId, findArtifactSet, findWeapon } from '../../src/data/characters';
import { statKeyFromProp, toGoodKey, type GoodArtifact, type GoodCharacter, type GoodData, type GoodWeapon } from '../../src/core/good';
import type { Account, ArtifactSlot } from '../../src/lib/types';
import type { Http } from './http';

const SLOT: Record<string, ArtifactSlot> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
};

interface EnkaEquip {
  itemId: number;
  weapon?: { level: number; promoteLevel?: number; affixMap?: Record<string, number> };
  reliquary?: { level: number };
  flat: {
    itemType: string;
    rankLevel: number;
    equipType?: string;
    setId?: number;
    reliquaryMainstat?: { mainPropId: string; statValue: number };
    reliquarySubstats?: { appendPropId: string; statValue: number }[];
  };
}

interface EnkaAvatar {
  avatarId: number;
  propMap: Record<string, { val?: string }>;
  talentIdList?: number[];
  skillLevelMap: Record<string, number>;
  equipList: EnkaEquip[];
}

export interface EnkaResponse {
  uid?: string;
  playerInfo: { nickname: string; level: number; worldLevel?: number };
  avatarInfoList?: EnkaAvatar[];
}

export type SkillOrder = Record<string, number[]>;

/** Normal attack / skill / burst ids per avatar id, from Enka's public data store. */
export async function fetchSkillOrder(http: Http): Promise<SkillOrder> {
  const store = await http.json<Record<string, { SkillOrder?: number[] }>>(
    'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json',
  );
  const skillOrder: SkillOrder = {};
  for (const [id, c] of Object.entries(store)) if (c.SkillOrder) skillOrder[id] = c.SkillOrder;
  return skillOrder;
}

export async function fetchEnka(http: Http, uid: string): Promise<{ data: EnkaResponse; skillOrder: SkillOrder }> {
  const data = await http.json<EnkaResponse>(`https://enka.network/api/uid/${encodeURIComponent(uid)}/`);
  return { data, skillOrder: await fetchSkillOrder(http) };
}

/** Converts an Enka response to GOOD + account info. */
export function enkaToGood(res: EnkaResponse, skillOrder: SkillOrder): { good: GoodData; account: Account; unknown: number[] } {
  const characters: GoodCharacter[] = [];
  const weapons: GoodWeapon[] = [];
  const artifacts: GoodArtifact[] = [];
  const unknown: number[] = [];
  for (const a of res.avatarInfoList ?? []) {
    const def = characterByAvatarId(a.avatarId) ?? (a.avatarId === 10000007 ? characterByAvatarId(10000005) : undefined);
    if (!def) {
      unknown.push(a.avatarId);
      continue;
    }
    const key = toGoodKey(def.name);
    const order = skillOrder[String(a.avatarId)] ?? Object.keys(a.skillLevelMap).map(Number);
    const lvl = (i: number) => a.skillLevelMap[String(order[i])] ?? 1;
    characters.push({
      key,
      level: Number(a.propMap['4001']?.val ?? 1),
      ascension: Number(a.propMap['1002']?.val ?? 0),
      constellation: a.talentIdList?.length ?? 0,
      talent: { auto: lvl(0), skill: lvl(1), burst: lvl(2) },
    });
    for (const e of a.equipList) {
      if (e.weapon) {
        const w = findWeapon(e.itemId);
        weapons.push({
          key: toGoodKey(w?.name ?? String(e.itemId)),
          level: e.weapon.level,
          ascension: e.weapon.promoteLevel ?? 0,
          refinement: (Object.values(e.weapon.affixMap ?? {})[0] ?? 0) + 1,
          location: key,
          lock: false,
        });
      } else if (e.reliquary && e.flat.equipType) {
        const set = e.flat.setId ? findArtifactSet(e.flat.setId) : undefined;
        artifacts.push({
          setKey: toGoodKey(set?.name ?? String(e.flat.setId ?? 'Unknown')),
          slotKey: SLOT[e.flat.equipType],
          level: Math.max(0, e.reliquary.level - 1),
          rarity: e.flat.rankLevel,
          mainStatKey: statKeyFromProp(e.flat.reliquaryMainstat?.mainPropId ?? ''),
          location: key,
          lock: false,
          substats: (e.flat.reliquarySubstats ?? []).map((s) => ({ key: statKeyFromProp(s.appendPropId), value: s.statValue })),
        });
      }
    }
  }
  return {
    good: { format: 'GOOD', version: 2, source: 'Waypoint export (Enka.Network)', characters, weapons, artifacts },
    account: { uid: res.uid, nickname: res.playerInfo.nickname, level: res.playerInfo.level, worldLevel: res.playerInfo.worldLevel },
    unknown,
  };
}

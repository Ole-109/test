#!/usr/bin/env node

// tools/cli/main.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

// src/core/gachaApi.ts
var GACHA_HOSTS = {
  global: "https://public-operation-hk4e-sg.hoyoverse.com",
  china: "https://public-operation-hk4e.mihoyo.com"
};
var GACHA_PATH = "/gacha_info/api/getGachaLog";
var QUERY_TYPES = ["301", "302", "500", "200", "100"];
var GachaApiError = class extends Error {
  constructor(message, code, retcode) {
    super(message);
    this.code = code;
    this.retcode = retcode;
  }
};
function parseWishUrl(input) {
  const text = input.trim();
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new GachaApiError("No link found in the pasted text.", "invalid-url");
  let url;
  try {
    url = new URL(match[0].replace("#/log", "").replace(/#\/?$/, ""));
  } catch {
    throw new GachaApiError("That does not look like a valid link.", "invalid-url");
  }
  const params = new URLSearchParams(url.search || url.hash.split("?")[1] || "");
  if (!params.get("authkey")) {
    throw new GachaApiError("The link has no authkey. Open the wish history in game, then get the link again.", "invalid-url");
  }
  const host = url.hostname;
  const region = host.endsWith("mihoyo.com") || (params.get("region") ?? "").startsWith("cn_") ? "china" : "global";
  return { region, params };
}
function pageUrl(info, gachaType, endId, size = 20) {
  const p = new URLSearchParams(info.params);
  p.set("gacha_type", gachaType);
  p.set("page", "1");
  p.set("size", String(size));
  p.set("end_id", endId);
  p.set("lang", "en-us");
  p.delete("timestamp");
  return `${GACHA_HOSTS[info.region]}${GACHA_PATH}?${p.toString()}`;
}
function toRecord(r) {
  return {
    id: String(r.id),
    gachaType: String(r.gacha_type),
    name: r.name,
    itemType: /weapon|waffe|武器/i.test(r.item_type) ? "weapon" : "character",
    rank: Number(r.rank_type),
    time: r.time,
    itemId: r.item_id || void 0
  };
}
var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getPage(info, type, endId, o) {
  const target = pageUrl(info, type, endId);
  const url = o.wrapUrl ? o.wrapUrl(target) : target;
  const sleep = o.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let res;
    try {
      res = await o.fetch(url);
    } catch {
      throw new GachaApiError("Could not reach the wish history server.", "network");
    }
    if (!res.ok) throw new GachaApiError(`Wish history server answered HTTP ${res.status}.`, "http");
    const body = await res.json();
    if (body.retcode === -110 && attempt < 5) {
      await sleep(1e3 * (attempt + 1));
      continue;
    }
    return body;
  }
}
function check(body) {
  if (body.retcode === 0 && body.data) return;
  if (body.retcode === -101) throw new GachaApiError("The link has expired (they last about a day). Open the wish history in game and get a new link.", "authkey-expired", -101);
  if (body.retcode === -100) throw new GachaApiError("The link is not valid. Get a fresh link from the game.", "authkey-invalid", -100);
  if (body.retcode === -110) throw new GachaApiError("The wish history server is rate-limiting requests. Try again in a minute.", "rate-limit", -110);
  throw new GachaApiError(`Wish history server error: ${body.message} (${body.retcode})`, "api", body.retcode);
}
async function validateWishUrl(info, o) {
  const target = pageUrl(info, "301", "0", 1);
  const res = await o.fetch(o.wrapUrl ? o.wrapUrl(target) : target);
  if (!res.ok) throw new GachaApiError(`Wish history server answered HTTP ${res.status}.`, "http");
  const body = await res.json();
  check(body);
  return body.data?.list?.[0]?.uid;
}
async function fetchWishHistory(info, o) {
  const sleep = o.sleep ?? defaultSleep;
  const delay = o.delayMs ?? 350;
  const records = [];
  let uid;
  for (const type of QUERY_TYPES) {
    let endId = "0";
    let page = 1;
    let fetched = 0;
    for (; ; ) {
      const body = await getPage(info, type, endId, o);
      check(body);
      const list = body.data.list ?? [];
      let reachedKnown = false;
      for (const item of list) {
        if (o.knownIds?.has(String(item.id))) {
          reachedKnown = true;
          break;
        }
        uid ??= item.uid;
        records.push(toRecord(item));
        fetched++;
      }
      o.onProgress?.({ gachaType: type, page, fetched });
      if (reachedKnown || list.length < 20) break;
      endId = list[list.length - 1].id;
      page++;
      await sleep(delay);
    }
    await sleep(delay);
  }
  return { records, uid };
}
function findWishUrls(text) {
  const out = [];
  const re = /https:\/\/[^\s"'<>\0]+?(?:getGachaLog|e20190909gacha|gacha-v\d|webview_gacha)[^\s"'<>\0]*/g;
  for (const m of text.matchAll(re)) {
    const url = m[0].replace(/[\x00-\x1f]+.*$/s, "");
    if (url.includes("authkey=")) out.push(url);
  }
  return out;
}

// src/data/game.json
var game_default = { updated: "2026-10-09", characters: [{ id: "aino", avatarId: 10000121, name: "Aino", nameDe: "Aino", element: "hydro", weapon: "claymore", rarity: 4, region: "nodkrai", release: 1757365200, icon: "UI_AvatarIcon_Aino" }, { id: "albedo", avatarId: 10000038, name: "Albedo", nameDe: "Albedo", element: "geo", weapon: "sword", rarity: 5, region: "mondstadt", release: 1608588e3, icon: "UI_AvatarIcon_Albedo" }, { id: "alhaitham", avatarId: 10000078, name: "Alhaitham", nameDe: "Alhaitham", element: "dendro", weapon: "sword", rarity: 5, region: "sumeru", release: 1673906400, icon: "UI_AvatarIcon_Alhatham" }, { id: "aloy", avatarId: 10000062, name: "Aloy", nameDe: "Aloy", element: "cryo", weapon: "bow", rarity: 5, region: "other", release: 1630443600, icon: "UI_AvatarIcon_Aloy" }, { id: "alyosha", avatarId: 10000148, name: "Alyosha", nameDe: "Alyosha", element: "electro", weapon: "polearm", rarity: 4, region: "snezhnaya", release: 1786395600, icon: "UI_AvatarIcon_Alyosha" }, { id: "amber", avatarId: 10000021, name: "Amber", nameDe: "Amber", element: "pyro", weapon: "bow", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Ambor" }, { id: "arataki-itto", avatarId: 10000057, name: "Arataki Itto", nameDe: "Arataki Itto", element: "geo", weapon: "claymore", rarity: 5, region: "inazuma", release: 1639497600, icon: "UI_AvatarIcon_Itto" }, { id: "arlecchino", avatarId: 10000096, name: "Arlecchino", nameDe: "Arlecchino", element: "pyro", weapon: "polearm", rarity: 5, region: "snezhnaya", release: 1713819600, icon: "UI_AvatarIcon_Arlecchino" }, { id: "baizhu", avatarId: 10000082, name: "Baizhu", nameDe: "Baizhu", element: "dendro", weapon: "catalyst", rarity: 5, region: "liyue", release: 1683039600, icon: "UI_AvatarIcon_Baizhuer" }, { id: "barbara", avatarId: 10000014, name: "Barbara", nameDe: "Barbara", element: "hydro", weapon: "catalyst", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Barbara" }, { id: "beidou", avatarId: 10000024, name: "Beidou", nameDe: "Beidou", element: "electro", weapon: "claymore", rarity: 4, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Beidou" }, { id: "bennett", avatarId: 10000032, name: "Bennett", nameDe: "Bennett", element: "pyro", weapon: "sword", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Bennett" }, { id: "candace", avatarId: 10000072, name: "Candace", nameDe: "Candace", element: "hydro", weapon: "polearm", rarity: 4, region: "sumeru", release: 1664226e3, icon: "UI_AvatarIcon_Candace" }, { id: "charlotte", avatarId: 10000088, name: "Charlotte", nameDe: "Charlotte", element: "cryo", weapon: "catalyst", rarity: 4, region: "fontaine", release: 1699308e3, icon: "UI_AvatarIcon_Charlotte" }, { id: "chasca", avatarId: 10000104, name: "Chasca", nameDe: "Chasca", element: "anemo", weapon: "bow", rarity: 5, region: "natlan", release: 1731967200, icon: "UI_AvatarIcon_Chasca" }, { id: "chevreuse", avatarId: 10000090, name: "Chevreuse", nameDe: "Chevreuse", element: "pyro", weapon: "polearm", rarity: 4, region: "fontaine", release: 1704816e3, icon: "UI_AvatarIcon_Chevreuse" }, { id: "chiori", avatarId: 10000094, name: "Chiori", nameDe: "Chiori", element: "geo", weapon: "sword", rarity: 5, region: "inazuma", release: 1710194400, icon: "UI_AvatarIcon_Chiori" }, { id: "chongyun", avatarId: 10000036, name: "Chongyun", nameDe: "Chongyun", element: "cryo", weapon: "claymore", rarity: 4, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Chongyun" }, { id: "citlali", avatarId: 10000107, name: "Citlali", nameDe: "Citlali", element: "cryo", weapon: "catalyst", rarity: 5, region: "natlan", release: 1735596e3, icon: "UI_AvatarIcon_Citlali" }, { id: "clorinde", avatarId: 10000098, name: "Clorinde", nameDe: "Clorinde", element: "electro", weapon: "sword", rarity: 5, region: "fontaine", release: 1717448400, icon: "UI_AvatarIcon_Clorinde" }, { id: "collei", avatarId: 10000067, name: "Collei", nameDe: "Collei", element: "dendro", weapon: "bow", rarity: 4, region: "sumeru", release: 1661288400, icon: "UI_AvatarIcon_Collei" }, { id: "columbina", avatarId: 10000125, name: "Columbina", nameDe: "Columbina", element: "hydro", weapon: "catalyst", rarity: 5, region: "nodkrai", release: 1768255200, icon: "UI_AvatarIcon_Columbina" }, { id: "cyno", avatarId: 10000071, name: "Cyno", nameDe: "Cyno", element: "electro", weapon: "polearm", rarity: 5, region: "sumeru", release: 1664226e3, icon: "UI_AvatarIcon_Cyno" }, { id: "dahlia", avatarId: 10000115, name: "Dahlia", nameDe: "Dahlia", element: "hydro", weapon: "sword", rarity: 4, region: "mondstadt", release: 1750107600, icon: "UI_AvatarIcon_Dahlia" }, { id: "dehya", avatarId: 10000079, name: "Dehya", nameDe: "Dehya", element: "pyro", weapon: "claymore", rarity: 5, region: "sumeru", release: 1677535200, icon: "UI_AvatarIcon_Dehya" }, { id: "diluc", avatarId: 10000016, name: "Diluc", nameDe: "Diluc", element: "pyro", weapon: "claymore", rarity: 5, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Diluc" }, { id: "diona", avatarId: 10000039, name: "Diona", nameDe: "Diona", element: "cryo", weapon: "bow", rarity: 4, region: "mondstadt", release: 160506e4, icon: "UI_AvatarIcon_Diona" }, { id: "dori", avatarId: 10000068, name: "Dori", nameDe: "Dori", element: "electro", weapon: "claymore", rarity: 4, region: "sumeru", release: 1662735600, icon: "UI_AvatarIcon_Dori" }, { id: "durin", avatarId: 10000123, name: "Durin", nameDe: "Durin", element: "pyro", weapon: "sword", rarity: 5, region: "mondstadt", release: 1764626400, icon: "UI_AvatarIcon_Durin" }, { id: "emilie", avatarId: 10000099, name: "Emilie", nameDe: "\xC9milie", element: "dendro", weapon: "polearm", rarity: 5, region: "fontaine", release: 1722956400, icon: "UI_AvatarIcon_Emilie" }, { id: "escoffier", avatarId: 10000112, name: "Escoffier", nameDe: "Escoffier", element: "cryo", weapon: "polearm", rarity: 5, region: "fontaine", release: 1746478800, icon: "UI_AvatarIcon_Escoffier" }, { id: "eula", avatarId: 10000051, name: "Eula", nameDe: "Eula", element: "cryo", weapon: "claymore", rarity: 5, region: "mondstadt", release: 162135e4, icon: "UI_AvatarIcon_Eula" }, { id: "faruzan", avatarId: 10000076, name: "Faruzan", nameDe: "Faruzan", element: "anemo", weapon: "bow", rarity: 4, region: "sumeru", release: 1670277600, icon: "UI_AvatarIcon_Faruzan" }, { id: "fischl", avatarId: 10000031, name: "Fischl", nameDe: "Fischl", element: "electro", weapon: "bow", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Fischl" }, { id: "flins", avatarId: 10000120, name: "Flins", nameDe: "Flins", element: "electro", weapon: "polearm", rarity: 5, region: "nodkrai", release: 1759244400, icon: "UI_AvatarIcon_Flins" }, { id: "freminet", avatarId: 10000085, name: "Freminet", nameDe: "Fr\xE9minet", element: "cryo", weapon: "claymore", rarity: 4, region: "fontaine", release: 1693926e3, icon: "UI_AvatarIcon_Freminet" }, { id: "furina", avatarId: 10000089, name: "Furina", nameDe: "Furina", element: "hydro", weapon: "sword", rarity: 5, region: "fontaine", release: 1699308e3, icon: "UI_AvatarIcon_Furina" }, { id: "gaming", avatarId: 10000092, name: "Gaming", nameDe: "Gaming", element: "pyro", weapon: "claymore", rarity: 4, region: "liyue", release: 1706565600, icon: "UI_AvatarIcon_Gaming" }, { id: "ganyu", avatarId: 10000037, name: "Ganyu", nameDe: "Ganyu", element: "cryo", weapon: "bow", rarity: 5, region: "liyue", release: 1610467200, icon: "UI_AvatarIcon_Ganyu" }, { id: "gorou", avatarId: 10000055, name: "Gorou", nameDe: "Gorou", element: "geo", weapon: "bow", rarity: 4, region: "inazuma", release: 1639497600, icon: "UI_AvatarIcon_Gorou" }, { id: "hu-tao", avatarId: 10000046, name: "Hu Tao", nameDe: "Hu Tao", element: "pyro", weapon: "polearm", rarity: 5, region: "liyue", release: 1614700800, icon: "UI_AvatarIcon_Hutao" }, { id: "iansan", avatarId: 10000110, name: "Iansan", nameDe: "Iansan", element: "electro", weapon: "polearm", rarity: 4, region: "natlan", release: 1742853600, icon: "UI_AvatarIcon_Iansan" }, { id: "ifa", avatarId: 10000113, name: "Ifa", nameDe: "Ifa", element: "anemo", weapon: "catalyst", rarity: 4, region: "natlan", release: 1746478800, icon: "UI_AvatarIcon_Ifa" }, { id: "illuga", avatarId: 10000127, name: "Illuga", nameDe: "Illuga", element: "geo", weapon: "polearm", rarity: 4, region: "nodkrai", release: 1770134400, icon: "UI_AvatarIcon_Illuga" }, { id: "ineffa", avatarId: 10000116, name: "Ineffa", nameDe: "Ineffa", element: "electro", weapon: "polearm", rarity: 5, region: "nodkrai", release: 1753736400, icon: "UI_AvatarIcon_Ineffa" }, { id: "jahoda", avatarId: 10000124, name: "Jahoda", nameDe: "Jahoda", element: "anemo", weapon: "bow", rarity: 4, region: "nodkrai", release: 1764626400, icon: "UI_AvatarIcon_Jahoda" }, { id: "jean", avatarId: 10000003, name: "Jean", nameDe: "Jean", element: "anemo", weapon: "sword", rarity: 5, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Qin" }, { id: "kachina", avatarId: 10000100, name: "Kachina", nameDe: "Kachina", element: "geo", weapon: "polearm", rarity: 4, region: "natlan", release: 1724706e3, icon: "UI_AvatarIcon_Kachina" }, { id: "kaedehara-kazuha", avatarId: 10000047, name: "Kaedehara Kazuha", nameDe: "Kaedehara Kazuha", element: "anemo", weapon: "sword", rarity: 5, region: "inazuma", release: 1624978800, icon: "UI_AvatarIcon_Kazuha" }, { id: "kaeya", avatarId: 10000015, name: "Kaeya", nameDe: "Kaeya", element: "cryo", weapon: "sword", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Kaeya" }, { id: "kamisato-ayaka", avatarId: 10000002, name: "Kamisato Ayaka", nameDe: "Kamisato Ayaka", element: "cryo", weapon: "sword", rarity: 5, region: "inazuma", release: 1626814800, icon: "UI_AvatarIcon_Ayaka" }, { id: "kamisato-ayato", avatarId: 10000066, name: "Kamisato Ayato", nameDe: "Kamisato Ayato", element: "hydro", weapon: "sword", rarity: 5, region: "inazuma", release: 1648587600, icon: "UI_AvatarIcon_Ayato" }, { id: "kaveh", avatarId: 10000081, name: "Kaveh", nameDe: "Kaveh", element: "dendro", weapon: "claymore", rarity: 4, region: "sumeru", release: 1683039600, icon: "UI_AvatarIcon_Kaveh" }, { id: "keqing", avatarId: 10000042, name: "Keqing", nameDe: "Keqing", element: "electro", weapon: "sword", rarity: 5, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Keqing" }, { id: "kinich", avatarId: 10000101, name: "Kinich", nameDe: "Kinich", element: "dendro", weapon: "claymore", rarity: 5, region: "natlan", release: 1726585200, icon: "UI_AvatarIcon_Kinich" }, { id: "kirara", avatarId: 10000061, name: "Kirara", nameDe: "Kirara", element: "dendro", weapon: "sword", rarity: 4, region: "inazuma", release: 1684789200, icon: "UI_AvatarIcon_Momoka" }, { id: "klee", avatarId: 10000029, name: "Klee", nameDe: "Klee", element: "pyro", weapon: "catalyst", rarity: 5, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Klee" }, { id: "kujou-sara", avatarId: 10000056, name: "Kujou Sara", nameDe: "Kujou Sara", element: "electro", weapon: "bow", rarity: 4, region: "inazuma", release: 1630443600, icon: "UI_AvatarIcon_Sara" }, { id: "kuki-shinobu", avatarId: 10000065, name: "Kuki Shinobu", nameDe: "Kuki Shinobu", element: "electro", weapon: "sword", rarity: 4, region: "inazuma", release: 1655823600, icon: "UI_AvatarIcon_Shinobu" }, { id: "lan-yan", avatarId: 10000108, name: "Lan Yan", nameDe: "Lan Yan", element: "anemo", weapon: "catalyst", rarity: 4, region: "liyue", release: 1737475200, icon: "UI_AvatarIcon_Lanyan" }, { id: "lauma", avatarId: 10000119, name: "Lauma", nameDe: "Lauma", element: "dendro", weapon: "catalyst", rarity: 5, region: "nodkrai", release: 1757365200, icon: "UI_AvatarIcon_Lauma" }, { id: "layla", avatarId: 10000074, name: "Layla", nameDe: "Layla", element: "cryo", weapon: "sword", rarity: 4, region: "sumeru", release: 1668787200, icon: "UI_AvatarIcon_Layla" }, { id: "linnea", avatarId: 10000130, name: "Linnea", nameDe: "Linnea", element: "geo", weapon: "bow", rarity: 5, region: "nodkrai", release: 1775509200, icon: "UI_AvatarIcon_Linnea" }, { id: "lisa", avatarId: 10000006, name: "Lisa", nameDe: "Lisa", element: "electro", weapon: "catalyst", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Lisa" }, { id: "lohen", avatarId: 10000129, name: "Lohen", nameDe: "Lohen", element: "cryo", weapon: "polearm", rarity: 5, region: "mondstadt", release: 1781017200, icon: "UI_AvatarIcon_Lohen" }, { id: "lynette", avatarId: 10000083, name: "Lynette", nameDe: "Lynette", element: "anemo", weapon: "sword", rarity: 4, region: "fontaine", release: 1692046800, icon: "UI_AvatarIcon_Linette" }, { id: "lyney", avatarId: 10000084, name: "Lyney", nameDe: "Lyney", element: "pyro", weapon: "bow", rarity: 5, region: "fontaine", release: 1692046800, icon: "UI_AvatarIcon_Liney" }, { id: "mavuika", avatarId: 10000106, name: "Mavuika", nameDe: "Mavuika", element: "pyro", weapon: "claymore", rarity: 5, region: "natlan", release: 1735596e3, icon: "UI_AvatarIcon_Mavuika" }, { id: "mika", avatarId: 10000080, name: "Mika", nameDe: "Mika", element: "cryo", weapon: "polearm", rarity: 4, region: "mondstadt", release: 1679414400, icon: "UI_AvatarIcon_Mika" }, { id: "mona", avatarId: 10000041, name: "Mona", nameDe: "Mona", element: "hydro", weapon: "catalyst", rarity: 5, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Mona" }, { id: "mualani", avatarId: 10000102, name: "Mualani", nameDe: "Mualani", element: "hydro", weapon: "catalyst", rarity: 5, region: "natlan", release: 1724706e3, icon: "UI_AvatarIcon_Mualani" }, { id: "nahida", avatarId: 10000073, name: "Nahida", nameDe: "Nahida", element: "dendro", weapon: "catalyst", rarity: 5, region: "sumeru", release: 1667253600, icon: "UI_AvatarIcon_Nahida" }, { id: "navia", avatarId: 10000091, name: "Navia", nameDe: "Navia", element: "geo", weapon: "claymore", rarity: 5, region: "fontaine", release: 1702936800, icon: "UI_AvatarIcon_Navia" }, { id: "nefer", avatarId: 10000122, name: "Nefer", nameDe: "Nefer", element: "dendro", weapon: "catalyst", rarity: 5, region: "nodkrai", release: 1760994e3, icon: "UI_AvatarIcon_Nefer" }, { id: "neuvillette", avatarId: 10000087, name: "Neuvillette", nameDe: "Neuvillette", element: "hydro", weapon: "catalyst", rarity: 5, region: "fontaine", release: 1695675600, icon: "UI_AvatarIcon_Neuvillette" }, { id: "nicole", avatarId: 10000131, name: "Nicole", nameDe: "Nicole", element: "pyro", weapon: "catalyst", rarity: 5, region: "other", release: 1779138e3, icon: "UI_AvatarIcon_Nicole" }, { id: "nilou", avatarId: 10000070, name: "Nilou", nameDe: "Nilou", element: "hydro", weapon: "sword", rarity: 5, region: "sumeru", release: 1665759600, icon: "UI_AvatarIcon_Nilou" }, { id: "ningguang", avatarId: 10000027, name: "Ningguang", nameDe: "Ningguang", element: "geo", weapon: "catalyst", rarity: 4, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Ningguang" }, { id: "noelle", avatarId: 10000034, name: "Noelle", nameDe: "Noelle", element: "geo", weapon: "claymore", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Noel" }, { id: "odette", avatarId: 10000150, name: "Odette", nameDe: "Odette", element: "cryo", weapon: "sword", rarity: 5, region: "snezhnaya", release: 1786395600, icon: "UI_AvatarIcon_Odette" }, { id: "ororon", avatarId: 10000105, name: "Ororon", nameDe: "Ororon", element: "electro", weapon: "bow", rarity: 4, region: "natlan", release: 1731967200, icon: "UI_AvatarIcon_Olorun" }, { id: "prune", avatarId: 10000132, name: "Prune", nameDe: "Prune", element: "anemo", weapon: "catalyst", rarity: 4, region: "mondstadt", release: 1779138e3, icon: "UI_AvatarIcon_Prune" }, { id: "qiqi", avatarId: 10000035, name: "Qiqi", nameDe: "Qiqi", element: "cryo", weapon: "sword", rarity: 5, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Qiqi" }, { id: "raiden-shogun", avatarId: 10000052, name: "Raiden Shogun", nameDe: "Shougun Raiden", element: "electro", weapon: "polearm", rarity: 5, region: "inazuma", release: 1630443600, icon: "UI_AvatarIcon_Shougun" }, { id: "razor", avatarId: 10000020, name: "Razor", nameDe: "Razor", element: "electro", weapon: "claymore", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Razor" }, { id: "rosaria", avatarId: 10000045, name: "Rosaria", nameDe: "Rosaria", element: "cryo", weapon: "polearm", rarity: 4, region: "mondstadt", release: 1617721200, icon: "UI_AvatarIcon_Rosaria" }, { id: "sandrone", avatarId: 10000133, name: "Sandrone", nameDe: "Sandrone", element: "cryo", weapon: "claymore", rarity: 5, region: "snezhnaya", release: 1782766800, icon: "UI_AvatarIcon_MarionetteNew" }, { id: "sangonomiya-kokomi", avatarId: 10000054, name: "Sangonomiya Kokomi", nameDe: "Sangonomiya Kokomi", element: "hydro", weapon: "catalyst", rarity: 5, region: "inazuma", release: 1632236400, icon: "UI_AvatarIcon_Kokomi" }, { id: "sayu", avatarId: 10000053, name: "Sayu", nameDe: "Sayu", element: "anemo", weapon: "claymore", rarity: 4, region: "inazuma", release: 1628607600, icon: "UI_AvatarIcon_Sayu" }, { id: "sethos", avatarId: 10000097, name: "Sethos", nameDe: "Sethos", element: "electro", weapon: "bow", rarity: 4, region: "sumeru", release: 1717448400, icon: "UI_AvatarIcon_Sethos" }, { id: "shenhe", avatarId: 10000063, name: "Shenhe", nameDe: "Shenhe", element: "cryo", weapon: "polearm", rarity: 5, region: "liyue", release: 1641333600, icon: "UI_AvatarIcon_Shenhe" }, { id: "shikanoin-heizou", avatarId: 10000059, name: "Shikanoin Heizou", nameDe: "Shikanoin Heizou", element: "anemo", weapon: "catalyst", rarity: 4, region: "inazuma", release: 1657659600, icon: "UI_AvatarIcon_Heizo" }, { id: "sigewinne", avatarId: 10000095, name: "Sigewinne", nameDe: "Sigewinne", element: "hydro", weapon: "bow", rarity: 5, region: "fontaine", release: 1719414e3, icon: "UI_AvatarIcon_Sigewinne" }, { id: "skirk", avatarId: 10000114, name: "Skirk", nameDe: "Skirk", element: "cryo", weapon: "sword", rarity: 5, region: "other", release: 1750107600, icon: "UI_AvatarIcon_SkirkNew" }, { id: "sucrose", avatarId: 10000043, name: "Sucrose", nameDe: "Saccharose", element: "anemo", weapon: "catalyst", rarity: 4, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Sucrose" }, { id: "tartaglia", avatarId: 10000033, name: "Tartaglia", nameDe: "Tartaglia", element: "hydro", weapon: "bow", rarity: 5, region: "snezhnaya", release: 160506e4, icon: "UI_AvatarIcon_Tartaglia" }, { id: "thoma", avatarId: 10000050, name: "Thoma", nameDe: "Thoma", element: "pyro", weapon: "polearm", rarity: 4, region: "inazuma", release: 1635868800, icon: "UI_AvatarIcon_Tohma" }, { id: "tighnari", avatarId: 10000069, name: "Tighnari", nameDe: "Tighnari", element: "dendro", weapon: "bow", rarity: 5, region: "sumeru", release: 1661288400, icon: "UI_AvatarIcon_Tighnari" }, { id: "traveler", avatarId: 10000005, name: "Traveler", nameDe: "Reisende(r)", element: "adaptive", weapon: "sword", rarity: 5, region: "other", release: 1601424e3, icon: "UI_AvatarIcon_PlayerBoy" }, { id: "varesa", avatarId: 10000111, name: "Varesa", nameDe: "Varesa", element: "electro", weapon: "catalyst", rarity: 5, region: "natlan", release: 1742853600, icon: "UI_AvatarIcon_Varesa" }, { id: "varka", avatarId: 10000128, name: "Varka", nameDe: "Varka", element: "anemo", weapon: "claymore", rarity: 5, region: "mondstadt", release: 1771884e3, icon: "UI_AvatarIcon_Varka" }, { id: "venti", avatarId: 10000022, name: "Venti", nameDe: "Venti", element: "anemo", weapon: "bow", rarity: 5, region: "mondstadt", release: 1601244e3, icon: "UI_AvatarIcon_Venti" }, { id: "vesna", avatarId: 10000143, name: "Vesna", nameDe: "Vesna", element: "anemo", weapon: "sword", rarity: 5, region: "snezhnaya", release: 1790024400, icon: "UI_AvatarIcon_Vesna" }, { id: "vodyanitsa", avatarId: 10000140, name: "Vodyanitsa", nameDe: "Vodyanitsa", element: "hydro", weapon: "catalyst", rarity: 5, region: "snezhnaya", release: 1790024400, icon: "UI_AvatarIcon_Vodyanitsa" }, { id: "wanderer", avatarId: 10000075, name: "Wanderer", nameDe: "Wanderer", element: "anemo", weapon: "catalyst", rarity: 5, region: "sumeru", release: 1670277600, icon: "UI_AvatarIcon_Wanderer" }, { id: "wriothesley", avatarId: 10000086, name: "Wriothesley", nameDe: "Wriothesley", element: "cryo", weapon: "catalyst", rarity: 5, region: "fontaine", release: 1697554800, icon: "UI_AvatarIcon_Wriothesley" }, { id: "xiangling", avatarId: 10000023, name: "Xiangling", nameDe: "Xiangling", element: "pyro", weapon: "polearm", rarity: 4, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Xiangling" }, { id: "xianyun", avatarId: 10000093, name: "Xianyun", nameDe: "Xianyun", element: "anemo", weapon: "catalyst", rarity: 5, region: "liyue", release: 1706565600, icon: "UI_AvatarIcon_Liuyun" }, { id: "xiao", avatarId: 10000026, name: "Xiao", nameDe: "Xiao", element: "anemo", weapon: "polearm", rarity: 5, region: "liyue", release: 1612216800, icon: "UI_AvatarIcon_Xiao" }, { id: "xilonen", avatarId: 10000103, name: "Xilonen", nameDe: "Xilonen", element: "geo", weapon: "sword", rarity: 5, region: "natlan", release: 1728334800, icon: "UI_AvatarIcon_Xilonen" }, { id: "xingqiu", avatarId: 10000025, name: "Xingqiu", nameDe: "Xingqiu", element: "hydro", weapon: "sword", rarity: 4, region: "liyue", release: 1601244e3, icon: "UI_AvatarIcon_Xingqiu" }, { id: "xinyan", avatarId: 10000044, name: "Xinyan", nameDe: "Xinyan", element: "pyro", weapon: "claymore", rarity: 4, region: "liyue", release: 1606874400, icon: "UI_AvatarIcon_Xinyan" }, { id: "yae-miko", avatarId: 10000058, name: "Yae Miko", nameDe: "Yae Miko", element: "electro", weapon: "catalyst", rarity: 5, region: "inazuma", release: 1644962400, icon: "UI_AvatarIcon_Yae" }, { id: "yanfei", avatarId: 10000048, name: "Yanfei", nameDe: "Yanfei", element: "pyro", weapon: "catalyst", rarity: 4, region: "liyue", release: 1619470800, icon: "UI_AvatarIcon_Feiyan" }, { id: "yaoyao", avatarId: 10000077, name: "Yaoyao", nameDe: "Yaoyao", element: "dendro", weapon: "polearm", rarity: 4, region: "liyue", release: 1673906400, icon: "UI_AvatarIcon_Yaoyao" }, { id: "yelan", avatarId: 10000060, name: "Yelan", nameDe: "Yelan", element: "hydro", weapon: "bow", rarity: 5, region: "liyue", release: 1653944400, icon: "UI_AvatarIcon_Yelan" }, { id: "yoimiya", avatarId: 10000049, name: "Yoimiya", nameDe: "Yoimiya", element: "pyro", weapon: "bow", rarity: 5, region: "inazuma", release: 1628607600, icon: "UI_AvatarIcon_Yoimiya" }, { id: "yumemizuki-mizuki", avatarId: 10000109, name: "Yumemizuki Mizuki", nameDe: "Yumemizuki Mizuki", element: "anemo", weapon: "catalyst", rarity: 5, region: "inazuma", release: 1739224800, icon: "UI_AvatarIcon_Mizuki" }, { id: "yun-jin", avatarId: 10000064, name: "Yun Jin", nameDe: "Yun Jin", element: "geo", weapon: "polearm", rarity: 4, region: "liyue", release: 1641333600, icon: "UI_AvatarIcon_Yunjin" }, { id: "zhongli", avatarId: 10000030, name: "Zhongli", nameDe: "Zhongli", element: "geo", weapon: "polearm", rarity: 5, region: "liyue", release: 1606874400, icon: "UI_AvatarIcon_Zhongli" }, { id: "zibai", avatarId: 10000126, name: "Zibai", nameDe: "Zibai", element: "geo", weapon: "sword", rarity: 5, region: "nodkrai", release: 1770134400, icon: "UI_AvatarIcon_Zibai" }], weapons: [{ id: 12516, key: "a-teaspoon-of-transcendence", name: "A Teaspoon of Transcendence", nameDe: "Schl\xFCssel der \xDCberbietung", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_CrystallineSword" }, { id: 12514, key: "a-thousand-blazing-suns", name: "A Thousand Blazing Suns", nameDe: "Die tausend flammenden Sonnen", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_RadianceSword" }, { id: 14511, key: "a-thousand-floating-dreams", name: "A Thousand Floating Dreams", nameDe: "Flie\xDFende Tr\xE4ume von tausend N\xE4chten", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Ayus" }, { id: 11515, key: "absolution", name: "Absolution", nameDe: "Absolution", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Estoc" }, { id: 15502, key: "amos-bow", name: "Amos' Bow", nameDe: "Amos\u2019 Bogen", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Amos" }, { id: 14523, key: "angelos-heptades", name: "Angelos' Heptades", nameDe: "Sieben Gebote von Staub und Licht", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_FairyGarden" }, { id: 15508, key: "aqua-simulacra", name: "Aqua Simulacra", nameDe: "Aqua Simulacra", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Kirin" }, { id: 11501, key: "aquila-favonia", name: "Aquila Favonia", nameDe: "Windfalke", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Falcon" }, { id: 15514, key: "astral-vulture-s-crimson-plumage", name: "Astral Vulture's Crimson Plumage", nameDe: "Karmesinrotes Federkleid des Astralgeiers", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Qoyllorsnova" }, { id: 11518, key: "athame-artis", name: "Athame Artis", nameDe: "Athame Artis", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Motsognir" }, { id: 11517, key: "azurelight", name: "Azurelight", nameDe: "Azurglanz", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_OuterSword" }, { id: 12511, key: "beacon-of-the-reed-sea", name: "Beacon of the Reed Sea", nameDe: "Schilfmeer-Bake", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_Deshret" }, { id: 11522, key: "beyond-the-chrysalis", name: "Beyond the Chrysalis", nameDe: "Schmetterlingswandel", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Samosvist" }, { id: 13516, key: "bloodsoaked-ruins", name: "Bloodsoaked Ruins", nameDe: "Blutbefleckte Stadt", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_TummaLyhty" }, { id: 13507, key: "calamity-queller", name: "Calamity Queller", nameDe: "Ende des Unheils", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Santika" }, { id: 14513, key: "cashflow-supervision", name: "Cashflow Supervision", nameDe: "Monet\xE4re Aufsichtseinheit", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Wheatley" }, { id: 14515, key: "crane-s-echoing-call", name: "Crane's Echoing Call", nameDe: "Widerhallender Ruf des Kranichs", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_MountainGale" }, { id: 13512, key: "crimson-moon-s-semblance", name: "Crimson Moon's Semblance", nameDe: "Form des scharlachroten Mondes", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_BloodMoon" }, { id: 13517, key: "disaster-and-remorse", name: "Disaster and Remorse", nameDe: "Katastrophe und Reue", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Carbine" }, { id: 15503, key: "elegy-for-the-end", name: "Elegy for the End", nameDe: "Letzter Seufzer", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Widsith" }, { id: 13509, key: "engulfing-lightning", name: "Engulfing Lightning", nameDe: "Grasschnittstrahl", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Narukami" }, { id: 14506, key: "everlasting-moonglow", name: "Everlasting Moonglow", nameDe: "Ewiger Mondschein", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Kaleido" }, { id: 11521, key: "exaiphanes-blade", name: "Exaiphanes Blade", nameDe: "Exaiphanes-Klinge", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_WeaponQuestSnezhnaya" }, { id: 12513, key: "fang-of-the-mountain-king", name: "Fang of the Mountain King", nameDe: "Zahn des Bergk\xF6nigs", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_EmeraldSword" }, { id: 13515, key: "fractured-halo", name: "Fractured Halo", nameDe: "Zerstreutes Licht", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Perdix" }, { id: 11503, key: "freedom-sworn", name: "Freedom-Sworn", nameDe: "Blasser Schwur der Freiheit", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Widsith" }, { id: 12515, key: "gest-of-the-mighty-wolf", name: "Gest of the Mighty Wolf", nameDe: "Kampflied des Wolfs", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_EnsisAquilonis" }, { id: 15516, key: "golden-frostbound-oath", name: "Golden Frostbound Oath", nameDe: "Goldener Frostschwur", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Alkonost" }, { id: 11510, key: "haran-geppaku-futsu", name: "Haran Geppaku Futsu", nameDe: "Haran Geppaku Futsu", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Amenoma" }, { id: 15511, key: "hunter-s-path", name: "Hunter's Path", nameDe: "Pfad des J\xE4gers", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Ayus" }, { id: 14524, key: "hymn-of-the-maelstrom", name: "Hymn of the Maelstrom", nameDe: "Loblied des Strudels", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Bludnye" }, { id: 14505, key: "jadefall-s-splendor", name: "Jadefall's Splendor", nameDe: "Jadesturz-Pracht", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Morax" }, { id: 14509, key: "kagura-s-verity", name: "Kagura's Verity", nameDe: "Kaguras Wahrheit", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Narukami" }, { id: 11511, key: "key-of-khaj-nisut", name: "Key of Khaj-Nisut", nameDe: "Khaj-Nisut-Schl\xFCssel", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Deshret" }, { id: 11512, key: "light-of-foliar-incision", name: "Light of Foliar Incision", nameDe: "Licht der schneidenden Bl\xE4tter", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Ayus" }, { id: 11519, key: "lightbearing-moonshard", name: "Lightbearing Moonshard", nameDe: "Lichtbringende Mondscherbe", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_SilverwareSaw" }, { id: 14502, key: "lost-prayer-to-the-sacred-winds", name: "Lost Prayer to the Sacred Winds", nameDe: "Gebete der Vier Winde", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Fourwinds" }, { id: 13513, key: "lumidouce-elegy", name: "Lumidouce Elegy", nameDe: "Lumidouce-Elegie", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Muguet" }, { id: 14504, key: "memory-of-dust", name: "Memory of Dust", nameDe: "Ketten des Diesseits", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Kunwu" }, { id: 11509, key: "mistsplitter-reforged", name: "Mistsplitter Reforged", nameDe: "Widerschein des Nebelsplitters", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Narukami" }, { id: 14520, key: "nightweaver-s-looking-glass", name: "Nightweaver's Looking Glass", nameDe: "Spiegel des Nachtwebers", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_MenulisRing" }, { id: 14522, key: "nocturne-s-curtain-call", name: "Nocturne's Curtain Call", nameDe: "Nachtmusik im Schleier", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Brisingamen" }, { id: 11516, key: "peak-patrol-song", name: "Peak Patrol Song", nameDe: "Lied der Gipfelpatrouille", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_XochitlsTube" }, { id: 15507, key: "polar-star", name: "Polar Star", nameDe: "Polarstern", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Worldbane" }, { id: 11505, key: "primordial-jade-cutter", name: "Primordial Jade Cutter", nameDe: "Moosgr\xFCner Fels", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Morax" }, { id: 13505, key: "primordial-jade-winged-spear", name: "Primordial Jade Winged-Spear", nameDe: "Urzeitlicher Jadespeer", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Morax" }, { id: 12510, key: "redhorn-stonethresher", name: "Redhorn Stonethresher", nameDe: "Rothorn-Steinbrecher", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_Itadorimaru" }, { id: 14521, key: "reliquary-of-truth", name: "Reliquary of Truth", nameDe: "K\xE4stchen der Wahrheit", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Sistrum" }, { id: 15513, key: "silvershower-heartstrings", name: "Silvershower Heartstrings", nameDe: "Tr\xF6pfelnde Herzsaiten", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Arcdange" }, { id: 14501, key: "skyward-atlas", name: "Skyward Atlas", nameDe: "Himmelsatlas", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Dvalin" }, { id: 11502, key: "skyward-blade", name: "Skyward Blade", nameDe: "Himmelsklinge", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Dvalin" }, { id: 15501, key: "skyward-harp", name: "Skyward Harp", nameDe: "Himmelsfl\xFCgel", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Dvalin" }, { id: 12501, key: "skyward-pride", name: "Skyward Pride", nameDe: "Stolz des Himmels", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_Dvalin" }, { id: 13502, key: "skyward-spine", name: "Skyward Spine", nameDe: "Himmelsgrat", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Dvalin" }, { id: 12503, key: "song-of-broken-pines", name: "Song of Broken Pines", nameDe: "Kiefernklang", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_Widsith" }, { id: 11513, key: "splendor-of-tranquil-waters", name: "Splendor of Tranquil Waters", nameDe: "Pracht des stillen Wassers", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Regalis" }, { id: 13501, key: "staff-of-homa", name: "Staff of Homa", nameDe: "Homa-Stab", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Homa" }, { id: 13511, key: "staff-of-the-scarlet-sands", name: "Staff of the Scarlet Sands", nameDe: "Stab der roten Sande", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Deshret" }, { id: 14517, key: "starcaller-s-watch", name: "Starcaller's Watch", nameDe: "Wacht des Sternenopfers", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Figurines" }, { id: 11504, key: "summit-shaper", name: "Summit Shaper", nameDe: "Gipfelbrecher", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Kunwu" }, { id: 14518, key: "sunny-morning-sleep-in", name: "Sunny Morning Sleep-In", nameDe: "Fr\xFChjahrsschlaf", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_SakuraFan" }, { id: 14516, key: "surf-s-up", name: "Surf's Up", nameDe: "Zeit f\xFCrs Wellenreiten", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_MechaPufferfish" }, { id: 13514, key: "symphonist-of-scents", name: "Symphonist of Scents", nameDe: "Sinfoniker der D\xFCfte", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Trident" }, { id: 15515, key: "the-daybreak-chronicles", name: "The Daybreak Chronicles", nameDe: "Chroniken der Morgend\xE4mmerung", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Arianna" }, { id: 15512, key: "the-first-great-magic", name: "The First Great Magic", nameDe: "Erste gro\xDFe Magie", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Pledge" }, { id: 12504, key: "the-unforged", name: "The Unforged", nameDe: "Grobes Schwert", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_Kunwu" }, { id: 15509, key: "thundering-pulse", name: "Thundering Pulse", nameDe: "Donnerpuls", rarity: 5, type: "bow", icon: "UI_EquipIcon_Bow_Narukami" }, { id: 14514, key: "tome-of-the-eternal-flow", name: "Tome of the Eternal Flow", nameDe: "Lehre des ewigen Flusses", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Iudex" }, { id: 14512, key: "tulaytullah-s-remembrance", name: "Tulaytullah's Remembrance", nameDe: "Tulaytullahs Erinnerung", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Alaya" }, { id: 11514, key: "uraku-misugiri", name: "Uraku Misugiri", nameDe: "Uraku Misugiri", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Needle" }, { id: 12512, key: "verdict", name: "Verdict", nameDe: "Urteilsspruch", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_GoldenVerdict" }, { id: 14519, key: "vivid-notions", name: "Vivid Notions", nameDe: "Farbenfrohe Gedanken", rarity: 5, type: "catalyst", icon: "UI_EquipIcon_Catalyst_VaresaTransformer" }, { id: 13504, key: "vortex-vanquisher", name: "Vortex Vanquisher", nameDe: "Regenbogenstecher", rarity: 5, type: "polearm", icon: "UI_EquipIcon_Pole_Kunwu" }, { id: 11520, key: "whitelake-frostfeather", name: "Whitelake Frostfeather", nameDe: "Winterfeder des wei\xDFen Sees", rarity: 5, type: "sword", icon: "UI_EquipIcon_Sword_Swanlake" }, { id: 12502, key: "wolf-s-gravestone", name: "Wolf's Gravestone", nameDe: "Wolfsgrab", rarity: 5, type: "claymore", icon: "UI_EquipIcon_Claymore_Wolfmound" }, { id: 13415, key: "the-catch", name: '"The Catch"', nameDe: "\u201EDer Fang\u201C", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Mori" }, { id: 12426, key: "ultimate-overlord-s-mega-magic-sword", name: `"Ultimate Overlord's Mega Magic Sword"`, nameDe: "\u201EMegamagisches Schwert des ultimativen Oberherrn\u201C", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Champion" }, { id: 12416, key: "akuoumaru", name: "Akuoumaru", nameDe: "Akuoumaru", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Maria" }, { id: 15410, key: "alley-hunter", name: "Alley Hunter", nameDe: "Gassenj\xE4ger", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Outlaw" }, { id: 11414, key: "amenoma-kageuchi", name: "Amenoma Kageuchi", nameDe: "Amenoma Kageuchi", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Bakufu" }, { id: 14427, key: "ash-graven-drinking-horn", name: "Ash-Graven Drinking Horn", nameDe: "Aschgraues Trinkhorn", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_ConchSprayer" }, { id: 14426, key: "ballad-of-the-boundless-blue", name: "Ballad of the Boundless Blue", nameDe: "Ballade des unendlichen Blaus", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_DandelionPoem" }, { id: 13424, key: "ballad-of-the-fjords", name: "Ballad of the Fjords", nameDe: "Ballade der Fjorde", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Shanty" }, { id: 14408, key: "blackcliff-agate", name: "Blackcliff Agate", nameDe: "Schwarzstein-Achat", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Blackrock" }, { id: 11408, key: "blackcliff-longsword", name: "Blackcliff Longsword", nameDe: "Schwarzstein-Langschwert", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Blackrock" }, { id: 13404, key: "blackcliff-pole", name: "Blackcliff Pole", nameDe: "Schwarzsteinlanze", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Blackrock" }, { id: 12408, key: "blackcliff-slasher", name: "Blackcliff Slasher", nameDe: "Schwarzstein-Schneide", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Blackrock" }, { id: 15408, key: "blackcliff-warbow", name: "Blackcliff Warbow", nameDe: "Schwarzstein-Kriegsbogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Blackrock" }, { id: 14433, key: "blackmarrow-lantern", name: "Blackmarrow Lantern", nameDe: "Laterne des schwarzen Marks", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Ilmarinen" }, { id: 12436, key: "blade-of-atonement", name: "Blade of Atonement", nameDe: "Klinge der Erl\xF6sung", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_GlintstoneClaymore" }, { id: 15437, key: "breezeborne-refrain", name: "Breezeborne Refrain", nameDe: "L\xFCftchen und Saitenspiel", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Windtalker" }, { id: 11432, key: "calamity-of-eshu", name: "Calamity of Eshu", nameDe: "Unheil von Eshu", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_SacrificialNgombe" }, { id: 15431, key: "chain-breaker", name: "Chain Breaker", nameDe: "Zersprungene Ketten", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Isikhulu" }, { id: 11415, key: "cinnabar-spindle", name: "Cinnabar Spindle", nameDe: "Zinnoberspindel", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Opus" }, { id: 14435, key: "clash-of-kings", name: "Clash of Kings", nameDe: "Spiel der K\xF6nige", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_SandMemoria" }, { id: 15426, key: "cloudforged", name: "Cloudforged", nameDe: "Wolkenweber", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Ultimatum" }, { id: 15407, key: "compound-bow", name: "Compound Bow", nameDe: "Compoundbogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Exotic" }, { id: 15436, key: "covenant-of-frost-and-snow", name: "Covenant of Frost and Snow", nameDe: "Frostschneeschwur", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_GlintstoneBow" }, { id: 13403, key: "crescent-pike", name: "Crescent Pike", nameDe: "Mondpike", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Exotic" }, { id: 14434, key: "dawning-frost", name: "Dawning Frost", nameDe: "Froststern", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Ziedas" }, { id: 13405, key: "deathmatch", name: "Deathmatch", nameDe: "Duelllanze", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Gladiator" }, { id: 13426, key: "dialogues-of-the-desert-sages", name: "Dialogues of the Desert Sages", nameDe: "Dialoge der Weisen der W\xFCste", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Caduceus" }, { id: 14413, key: "dodoco-tales", name: "Dodoco Tales", nameDe: "Dodoco-Geschichten", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Ludiharpastum" }, { id: 13401, key: "dragon-s-bane", name: "Dragon's Bane", nameDe: "Drachenschreck", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Stardust" }, { id: 13409, key: "dragonspine-spear", name: "Dragonspine Spear", nameDe: "Drachengratspeer", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Everfrost" }, { id: 12431, key: "earth-shaker", name: "Earth Shaker", nameDe: "Bebenmacher", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Isikhulu" }, { id: 14436, key: "echoes-of-the-heart", name: "Echoes of the Heart", nameDe: "Echo des Herzens", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_GlintstoneCatalyst" }, { id: 11436, key: "emberwell", name: "Emberwell", nameDe: "Flammenquelle", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_GlintstoneSword" }, { id: 15418, key: "end-of-the-line", name: "End of the Line", nameDe: "Schwertfischer", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Fin" }, { id: 14432, key: "etherlight-spindlelute", name: "Etherlight Spindlelute", nameDe: "Laute des Himmelslichts", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_SeeliesLute" }, { id: 14409, key: "eye-of-perception", name: "Eye of Perception", nameDe: "Herzensblick", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Truelens" }, { id: 15411, key: "fading-twilight", name: "Fading Twilight", nameDe: "Ausklingende D\xE4mmerung", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Fallensun" }, { id: 14401, key: "favonius-codex", name: "Favonius Codex", nameDe: "Favonius-Kodex", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Zephyrus" }, { id: 12401, key: "favonius-greatsword", name: "Favonius Greatsword", nameDe: "Favonius-Gro\xDFschwert", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Zephyrus" }, { id: 13407, key: "favonius-lance", name: "Favonius Lance", nameDe: "Favonius-Lanze", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Zephyrus" }, { id: 11401, key: "favonius-sword", name: "Favonius Sword", nameDe: "Favonius-Schwert", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Zephyrus" }, { id: 15401, key: "favonius-warbow", name: "Favonius Warbow", nameDe: "Favonius-Jagdbogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Zephyrus" }, { id: 11413, key: "festering-desire", name: "Festering Desire", nameDe: "Schwert der Verderbnis", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Magnum" }, { id: 11425, key: "finale-of-the-deep", name: "Finale of the Deep", nameDe: "Finale in der Tiefe", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Vorpal" }, { id: 12432, key: "flame-forged-insight", name: "Flame-Forged Insight", nameDe: "Geschmiedete Weisheit", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Polilith" }, { id: 11426, key: "fleuve-cendre-ferryman", name: "Fleuve Cendre Ferryman", nameDe: "Schiffer des Fleuve Cendr\xE9", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Machination" }, { id: 15430, key: "flower-wreathed-feathers", name: "Flower-Wreathed Feathers", nameDe: "Mit Blumen gebundene Federn", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Umpakati" }, { id: 14425, key: "flowing-purity", name: "Flowing Purity", nameDe: "Flie\xDFende Reinheit", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Vorpal" }, { id: 11431, key: "flute-of-ezpitzal", name: "Flute of Ezpitzal", nameDe: "Ezpitzal-Fl\xF6te", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Isikhulu" }, { id: 13431, key: "footprint-of-the-rainbow", name: "Footprint of the Rainbow", nameDe: "Spuren des Regenbogens", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Isikhulu" }, { id: 12417, key: "forest-regalia", name: "Forest Regalia", nameDe: "Waldk\xF6nigsschwert", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Arakalari" }, { id: 12435, key: "forged-by-the-golden-melody", name: "Forged by the Golden Melody", nameDe: "Geschmiedet durch das goldene Gesetz", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_EscapeWheel" }, { id: 14412, key: "frostbearer", name: "Frostbearer", nameDe: "Permafrostfrucht", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Everfrost" }, { id: 13435, key: "frostbreath", name: "Frostbreath", nameDe: "Frostatem", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_FaesCrystalle" }, { id: 14417, key: "fruit-of-fulfillment", name: "Fruit of Fulfillment", nameDe: "Vollmondfrucht", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Arakalari" }, { id: 12430, key: "fruitful-hook", name: "Fruitful Hook", nameDe: "Fruchtbarer Haken", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Umpakati" }, { id: 14414, key: "hakushin-ring", name: "Hakushin Ring", nameDe: "Hakushin-Ring", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Bakufu" }, { id: 15414, key: "hamayumi", name: "Hamayumi", nameDe: "Hamayumi", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Bakufu" }, { id: 11435, key: "heretic-s-molten-blade", name: "Heretic's Molten Blade", nameDe: "Klinge des Ketzerj\xE4gers", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_SerpentTooth" }, { id: 15419, key: "ibis-piercer", name: "Ibis Piercer", nameDe: "Durchdringer der Ibisse", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Ibis" }, { id: 11407, key: "iron-sting", name: "Iron Sting", nameDe: "Eisenstich", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Exotic" }, { id: 15435, key: "jade-vista", name: "Jade Vista", nameDe: "Urzeitlicher Jadebogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_ShatteredMirror" }, { id: 11416, key: "kagotsurube-isshin", name: "Kagotsurube Isshin", nameDe: "Kagotsurube Isshin", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Youtou" }, { id: 12414, key: "katsuragikiri-nagamasa", name: "Katsuragikiri Nagamasa", nameDe: "Katsuragikiri Nagamasa", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Bakufu" }, { id: 15417, key: "king-s-squire", name: "King's Squire", nameDe: "Gefolgsfrau des K\xF6nigs", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Arakalari" }, { id: 13414, key: "kitain-cross-spear", name: "Kitain Cross Spear", nameDe: "Kitain-Kreuzlanze", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Bakufu" }, { id: 11405, key: "lion-s-roar", name: "Lion's Roar", nameDe: "Drachenschrei", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Rockkiller" }, { id: 12410, key: "lithic-blade", name: "Lithic Blade", nameDe: "Antikes Millelithenschwert", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Lapis" }, { id: 13406, key: "lithic-spear", name: "Lithic Spear", nameDe: "Millelithenlanze", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Lapis" }, { id: 12412, key: "luxurious-sea-lord", name: "Luxurious Sea-Lord", nameDe: "Luxuri\xF6ser Seek\xF6nig", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_MillenniaTuna" }, { id: 12418, key: "mailed-flower", name: "Mailed Flower", nameDe: "Eiserne Blume", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Fleurfair" }, { id: 12415, key: "makhaira-aquamarine", name: "Makhaira Aquamarine", nameDe: "Makhaira-Aquamarin", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Pleroma" }, { id: 14407, key: "mappa-mare", name: "Mappa Mare", nameDe: "Illustrationen von Landen und Wassern", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Exotic" }, { id: 12433, key: "master-key", name: "Master Key", nameDe: "Universalschl\xFCssel", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Ilmarinen" }, { id: 13419, key: "missive-windspear", name: "Missive Windspear", nameDe: "Spitze der klingenden Winde", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Windvane" }, { id: 15412, key: "mitternachts-waltz", name: "Mitternachts Waltz", nameDe: "Mitternachtswalzer", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Nachtblind" }, { id: 13417, key: "moonpiercer", name: "Moonpiercer", nameDe: "Monddurchbohrer", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Arakalari" }, { id: 11434, key: "moonweaver-s-dawn", name: "Moonweaver's Dawn", nameDe: "D\xE4mmerlicht des Mondwebers", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Miekka" }, { id: 13430, key: "mountain-bracing-bolt", name: "Mountain-Bracing Bolt", nameDe: "Bergsch\xFCtzer-Bolzen", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Umpakati" }, { id: 15416, key: "mouun-s-moon", name: "Mouun's Moon", nameDe: "Mouun-Mond", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Maria" }, { id: 11437, key: "new-bough", name: "New Bough", nameDe: "Neuer Zweig", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_SpikedStake" }, { id: 14415, key: "oathsworn-eye", name: "Oathsworn Eye", nameDe: "Auge des Gel\xF6bnisses", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Jyanome" }, { id: 12427, key: "portable-power-saw", name: "Portable Power Saw", nameDe: "Tragbare motorisierte S\xE4ge", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Mechanic" }, { id: 15415, key: "predator", name: "Predator", nameDe: "Raubtier", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Predator" }, { id: 13427, key: "prospector-s-drill", name: "Prospector's Drill", nameDe: "Erkundungsbohrer", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Mechanic" }, { id: 13433, key: "prospector-s-shovel", name: "Prospector's Shovel", nameDe: "Schaufel des Goldgr\xE4bers", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Ilmarinen" }, { id: 14406, key: "prototype-amber", name: "Prototype Amber", nameDe: "Bernstein-Prototyp", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Proto" }, { id: 12406, key: "prototype-archaic", name: "Prototype Archaic", nameDe: "Guhua-Prototyp", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Proto" }, { id: 15406, key: "prototype-crescent", name: "Prototype Crescent", nameDe: "Mondschein-Prototyp", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Proto" }, { id: 11406, key: "prototype-rancour", name: "Prototype Rancour", nameDe: "Steinschneider-Prototyp", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Proto" }, { id: 13402, key: "prototype-starglitter", name: "Prototype Starglitter", nameDe: "Sternsichel-Prototyp", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Proto" }, { id: 15434, key: "rainbow-serpent-s-rain-bow", name: "Rainbow Serpent's Rain Bow", nameDe: "Regenakkorde der Regenbogenschlange", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_ElegguaBow" }, { id: 12405, key: "rainslasher", name: "Rainslasher", nameDe: "Regenschnitter", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Perdue" }, { id: 15427, key: "range-gauge", name: "Range Gauge", nameDe: "Entfernungsmesser", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Mechanic" }, { id: 13425, key: "rightful-reward", name: "Rightful Reward", nameDe: "Rechtm\xE4\xDFige Belohnung", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Vorpal" }, { id: 14431, key: "ring-of-yaxche", name: "Ring of Yaxche", nameDe: "Yaxche-Ring", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Isikhulu" }, { id: 15404, key: "royal-bow", name: "Royal Bow", nameDe: "K\xF6niglicher Langbogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Theocrat" }, { id: 12404, key: "royal-greatsword", name: "Royal Greatsword", nameDe: "K\xF6nigliches Gro\xDFschwert", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Theocrat" }, { id: 14404, key: "royal-grimoire", name: "Royal Grimoire", nameDe: "K\xF6nigliches Zauberbuch", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Theocrat" }, { id: 11404, key: "royal-longsword", name: "Royal Longsword", nameDe: "K\xF6nigliches Langschwert", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Theocrat" }, { id: 13408, key: "royal-spear", name: "Royal Spear", nameDe: "K\xF6niglicher Jagdspeer", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Theocrat" }, { id: 15405, key: "rust", name: "Rust", nameDe: "Rostiger Bogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Recluse" }, { id: 13434, key: "sacrificer-s-staff", name: "Sacrificer's Staff", nameDe: "Leuchtstab des Geistlichen", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Krivule" }, { id: 15403, key: "sacrificial-bow", name: "Sacrificial Bow", nameDe: "Opferbogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Fossil" }, { id: 14403, key: "sacrificial-fragments", name: "Sacrificial Fragments", nameDe: "Opferrituale", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Fossil" }, { id: 12403, key: "sacrificial-greatsword", name: "Sacrificial Greatsword", nameDe: "Opfergro\xDFschwert", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Fossil" }, { id: 14424, key: "sacrificial-jade", name: "Sacrificial Jade", nameDe: "Zeremonielle Jade", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Yue" }, { id: 11403, key: "sacrificial-sword", name: "Sacrificial Sword", nameDe: "Opferschwert", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Fossil" }, { id: 11417, key: "sapwood-blade", name: "Sapwood Blade", nameDe: "Stammklinge", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Arakalari" }, { id: 15424, key: "scion-of-the-blazing-sun", name: "Scion of the Blazing Sun", nameDe: "Spross der flammenden Sonne", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Gurabad" }, { id: 15432, key: "sequence-of-solitude", name: "Sequence of Solitude", nameDe: "Tonfolge der Einsamkeit", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Stinger" }, { id: 11433, key: "serenity-s-call", name: "Serenity's Call", nameDe: "Leises Pfeifen der Stille", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Ilmarinen" }, { id: 12409, key: "serpent-spine", name: "Serpent Spine", nameDe: "Knochenschwert", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Kione" }, { id: 11438, key: "silver-light", name: "Silver Light", nameDe: "Silberlampe", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Fajian" }, { id: 15433, key: "snare-hook", name: "Snare Hook", nameDe: "Netzhaken", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Ilmarinen" }, { id: 12411, key: "snow-tombed-starsilver", name: "Snow-Tombed Starsilver", nameDe: "Unter Schnee begrabenes Sternsilber", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Dragonfell" }, { id: 14405, key: "solar-pearl", name: "Solar Pearl", nameDe: "Sonne und Mond", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Resurrection" }, { id: 15425, key: "song-of-stillness", name: "Song of Stillness", nameDe: "Gesang der Stille", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Vorpal" }, { id: 13436, key: "song-of-the-vigil", name: "Song of the Vigil", nameDe: "W\xE4chterlied", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_GlintstonePolearm" }, { id: 11430, key: "sturdy-bone", name: "Sturdy Bone", nameDe: "Robuster Knochen", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Umpakati" }, { id: 11412, key: "sword-of-descension", name: "Sword of Descension", nameDe: "Schwert der Niederkunft", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Psalmus" }, { id: 11428, key: "sword-of-narzissenkreuz", name: "Sword of Narzissenkreuz", nameDe: "Schwert des Narzissenkreuzes", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Purewill" }, { id: 12424, key: "talking-stick", name: "Talking Stick", nameDe: "Lass uns reden", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_BeastTamer" }, { id: 13432, key: "tamayuratei-no-ohanashi", name: "Tamayuratei no Ohanashi", nameDe: "Tamayuratei no Ohanashi", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Aoandon" }, { id: 11410, key: "the-alley-flash", name: "The Alley Flash", nameDe: "Gassenleuchte", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Outlaw" }, { id: 12402, key: "the-bell", name: "The Bell", nameDe: "Glocke", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Troupe" }, { id: 11409, key: "the-black-sword", name: "The Black Sword", nameDe: "Schwarzes Schwert", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Bloodstained" }, { id: 11427, key: "the-dockhand-s-assistant", name: "The Dockhand's Assistant", nameDe: "Werftklinge", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Mechanic" }, { id: 11402, key: "the-flute", name: "The Flute", nameDe: "Fl\xF6te", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Troupe" }, { id: 15402, key: "the-stringless", name: "The Stringless", nameDe: "Der Sehnenlose", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Troupe" }, { id: 15409, key: "the-viridescent-hunt", name: "The Viridescent Hunt", nameDe: "Grasgr\xFCner Jagdbogen", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Viridescent" }, { id: 14402, key: "the-widsith", name: "The Widsith", nameDe: "Landstreichernoten", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Troupe" }, { id: 12425, key: "tidal-shadow", name: "Tidal Shadow", nameDe: "Gezeitenschatten", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Vorpal" }, { id: 11422, key: "toukabou-shigure", name: "Toukabou Shigure", nameDe: "Toukabou Shigure", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Kasabouzu" }, { id: 14416, key: "wandering-evenstar", name: "Wandering Evenstar", nameDe: "Wandernder Abendstern", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Pleroma" }, { id: 13416, key: "wavebreaker-s-fin", name: "Wavebreaker's Fin", nameDe: "Wellenbrecherflosse", rarity: 4, type: "polearm", icon: "UI_EquipIcon_Pole_Maria" }, { id: 14430, key: "waveriding-whirl", name: "Waveriding Whirl", nameDe: "Wellenreitender Wirbel", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Umpakati" }, { id: 12407, key: "whiteblind", name: "Whiteblind", nameDe: "Wei\xDFer Schatten", rarity: 4, type: "claymore", icon: "UI_EquipIcon_Claymore_Exotic" }, { id: 15413, key: "windblume-ode", name: "Windblume Ode", nameDe: "Windblumenode", rarity: 4, type: "bow", icon: "UI_EquipIcon_Bow_Fleurfair" }, { id: 14410, key: "wine-and-song", name: "Wine and Song", nameDe: "Wein und Gesang in den Gassen", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Outlaw" }, { id: 14437, key: "winter-s-heavy-heart", name: "Winter's Heavy Heart", nameDe: "Schweres Herz des Winters", rarity: 4, type: "catalyst", icon: "UI_EquipIcon_Catalyst_FrostScepter" }, { id: 11424, key: "wolf-fang", name: "Wolf-Fang", nameDe: "Wolfszahn", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Boreas" }, { id: 11418, key: "xiphos-moonlight", name: "Xiphos' Moonlight", nameDe: "Mondlicht von Xiphos", rarity: 4, type: "sword", icon: "UI_EquipIcon_Sword_Pleroma" }, { id: 13303, key: "black-tassel", name: "Black Tassel", nameDe: "Schwarze Quaste", rarity: 3, type: "polearm", icon: "UI_EquipIcon_Pole_Noire" }, { id: 12302, key: "bloodtainted-greatsword", name: "Bloodtainted Greatsword", nameDe: "Drachenblutschwert", rarity: 3, type: "claymore", icon: "UI_EquipIcon_Claymore_Siegfry" }, { id: 11301, key: "cool-steel", name: "Cool Steel", nameDe: "K\xFChle Klinge", rarity: 3, type: "sword", icon: "UI_EquipIcon_Sword_Steel" }, { id: 11304, key: "dark-iron-sword", name: "Dark Iron Sword", nameDe: "Dunkles Eisenschwert", rarity: 3, type: "sword", icon: "UI_EquipIcon_Sword_Darker" }, { id: 12305, key: "debate-club", name: "Debate Club", nameDe: "Schlagfestes Argument", rarity: 3, type: "claymore", icon: "UI_EquipIcon_Claymore_Reasoning" }, { id: 14304, key: "emerald-orb", name: "Emerald Orb", nameDe: "Jadekugel", rarity: 3, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Jade" }, { id: 12301, key: "ferrous-shadow", name: "Ferrous Shadow", nameDe: "Eiserner Schatten", rarity: 3, type: "claymore", icon: "UI_EquipIcon_Claymore_Glaive" }, { id: 11305, key: "fillet-blade", name: "Fillet Blade", nameDe: "Filetiermesser", rarity: 3, type: "sword", icon: "UI_EquipIcon_Sword_Sashimi" }, { id: 13302, key: "halberd", name: "Halberd", nameDe: "Hellebarde", rarity: 3, type: "polearm", icon: "UI_EquipIcon_Pole_Halberd" }, { id: 11302, key: "harbinger-of-dawn", name: "Harbinger of Dawn", nameDe: "Schwert der D\xE4mmerung", rarity: 3, type: "sword", icon: "UI_EquipIcon_Sword_Dawn" }, { id: 14301, key: "magic-guide", name: "Magic Guide", nameDe: "Magief\xFChrer", rarity: 3, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Intro" }, { id: 15305, key: "messenger", name: "Messenger", nameDe: "\xDCberbringer", rarity: 3, type: "bow", icon: "UI_EquipIcon_Bow_Msg" }, { id: 14303, key: "otherworldly-story", name: "Otherworldly Story", nameDe: "Geschichten einer anderen Welt", rarity: 3, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Lightnov" }, { id: 15301, key: "raven-bow", name: "Raven Bow", nameDe: "Rabenbogen", rarity: 3, type: "bow", icon: "UI_EquipIcon_Bow_Crowfeather" }, { id: 15303, key: "recurve-bow", name: "Recurve Bow", nameDe: "Reflexbogen", rarity: 3, type: "bow", icon: "UI_EquipIcon_Bow_Curve" }, { id: 15302, key: "sharpshooter-s-oath", name: "Sharpshooter's Oath", nameDe: "Eid des Scharfsch\xFCtzen", rarity: 3, type: "bow", icon: "UI_EquipIcon_Bow_Arjuna" }, { id: 12306, key: "skyrider-greatsword", name: "Skyrider Greatsword", nameDe: "Himmelsflug-Gro\xDFschwert", rarity: 3, type: "claymore", icon: "UI_EquipIcon_Claymore_Mitsurugi" }, { id: 11306, key: "skyrider-sword", name: "Skyrider Sword", nameDe: "Himmelsflug-Schwert", rarity: 3, type: "sword", icon: "UI_EquipIcon_Sword_Mitsurugi" }, { id: 15304, key: "slingshot", name: "Slingshot", nameDe: "Steinschleuder", rarity: 3, type: "bow", icon: "UI_EquipIcon_Bow_Sling" }, { id: 14302, key: "thrilling-tales-of-dragon-slayers", name: "Thrilling Tales of Dragon Slayers", nameDe: "Von den Heldentaten der Drachenbezwinger", rarity: 3, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Pulpfic" }, { id: 11303, key: "traveler-s-handy-sword", name: "Traveler's Handy Sword", nameDe: "Reiseschwert", rarity: 3, type: "sword", icon: "UI_EquipIcon_Sword_Traveler" }, { id: 14305, key: "twin-nephrite", name: "Twin Nephrite", nameDe: "Zwillingsnephrit", rarity: 3, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Phoney" }, { id: 12303, key: "white-iron-greatsword", name: "White Iron Greatsword", nameDe: "Wei\xDFes Eisengro\xDFschwert", rarity: 3, type: "claymore", icon: "UI_EquipIcon_Claymore_Tin" }, { id: 13301, key: "white-tassel", name: "White Tassel", nameDe: "Wei\xDFe Quaste", rarity: 3, type: "polearm", icon: "UI_EquipIcon_Pole_Ruby" }, { id: 13201, key: "iron-point", name: "Iron Point", nameDe: "Eisenlanze", rarity: 2, type: "polearm", icon: "UI_EquipIcon_Pole_Rod" }, { id: 12201, key: "old-merc-s-pal", name: "Old Merc's Pal", nameDe: "S\xF6ldnerzweih\xE4nder", rarity: 2, type: "claymore", icon: "UI_EquipIcon_Claymore_Oyaji" }, { id: 14201, key: "pocket-grimoire", name: "Pocket Grimoire", nameDe: "Taschenzauberbuch", rarity: 2, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Pocket" }, { id: 15201, key: "seasoned-hunter-s-bow", name: "Seasoned Hunter's Bow", nameDe: "Alter Jagdbogen", rarity: 2, type: "bow", icon: "UI_EquipIcon_Bow_Old" }, { id: 11201, key: "silver-sword", name: "Silver Sword", nameDe: "Silberschwert", rarity: 2, type: "sword", icon: "UI_EquipIcon_Sword_Silver" }, { id: 14101, key: "apprentice-s-notes", name: "Apprentice's Notes", nameDe: "Aufzeichnungen eines Lehrlings", rarity: 1, type: "catalyst", icon: "UI_EquipIcon_Catalyst_Apprentice" }, { id: 13101, key: "beginner-s-protector", name: "Beginner's Protector", nameDe: "Anf\xE4ngerlanze", rarity: 1, type: "polearm", icon: "UI_EquipIcon_Pole_Gewalt" }, { id: 11101, key: "dull-blade", name: "Dull Blade", nameDe: "Stumpfes Schwert", rarity: 1, type: "sword", icon: "UI_EquipIcon_Sword_Blunt" }, { id: 15101, key: "hunter-s-bow", name: "Hunter's Bow", nameDe: "Jagdbogen", rarity: 1, type: "bow", icon: "UI_EquipIcon_Bow_Hunters" }, { id: 12101, key: "waster-greatsword", name: "Waster Greatsword", nameDe: "\xDCbungsgro\xDFschwert", rarity: 1, type: "claymore", icon: "UI_EquipIcon_Claymore_Aniki" }], artifactSets: [{ id: 15048, name: "Heart of the Furnace", nameDe: "Im Feuer geschmolzenes Herz", maxRarity: 5, icon: "UI_RelicIcon_15048_4" }, { id: 15047, name: "Scarlet Proof", nameDe: "Blutroter Beweis", maxRarity: 5, icon: "UI_RelicIcon_15047_4" }, { id: 15046, name: "Disenchantment in Deep Shadow", nameDe: "Bedr\xFCckende Desillusionierung im Schatten", maxRarity: 5, icon: "UI_RelicIcon_15046_4" }, { id: 15045, name: "Celestial Gift", nameDe: "Gabe des Himmels", maxRarity: 5, icon: "UI_RelicIcon_15045_4" }, { id: 15044, name: "A Day Carved From Rising Winds", nameDe: "Tag des aufkommenden Windes", maxRarity: 5, icon: "UI_RelicIcon_15044_4" }, { id: 15043, name: "Aubade of Morningstar and Moon", nameDe: "Gesang von Stern und Mond", maxRarity: 5, icon: "UI_RelicIcon_15043_4" }, { id: 15042, name: "Silken Moon's Serenade", nameDe: "Serenade des seidenen Mondes", maxRarity: 5, icon: "UI_RelicIcon_15042_4" }, { id: 15041, name: "Night of the Sky's Unveiling", nameDe: "Nacht der himmlischen Enth\xFCllung", maxRarity: 5, icon: "UI_RelicIcon_15041_4" }, { id: 15040, name: "Finale of the Deep Galleries", nameDe: "Finale der tiefen Korridore", maxRarity: 5, icon: "UI_RelicIcon_15040_4" }, { id: 15039, name: "Long Night's Oath", nameDe: "Eid der Nacht", maxRarity: 5, icon: "UI_RelicIcon_15039_4" }, { id: 15038, name: "Obsidian Codex", nameDe: "Obsidiankodex", maxRarity: 5, icon: "UI_RelicIcon_15038_4" }, { id: 15037, name: "Scroll of the Hero of Cinder City", nameDe: "Schriftrolle des Recken der aschenen Stadt", maxRarity: 5, icon: "UI_RelicIcon_15037_4" }, { id: 15036, name: "Unfinished Reverie", nameDe: "Unvollendete Tr\xE4umerei", maxRarity: 5, icon: "UI_RelicIcon_15036_4" }, { id: 15035, name: "Fragment of Harmonic Whimsy", nameDe: "Fragment harmonischer Launen", maxRarity: 5, icon: "UI_RelicIcon_15035_4" }, { id: 15034, name: "Nighttime Whispers in the Echoing Woods", nameDe: "N\xE4chtliches Gefl\xFCster in den widerhallenden W\xE4ldern", maxRarity: 5, icon: "UI_RelicIcon_15034_4" }, { id: 15033, name: "Song of Days Past", nameDe: "Lied vergangener Tage", maxRarity: 5, icon: "UI_RelicIcon_15033_4" }, { id: 15032, name: "Golden Troupe", nameDe: "Goldtruppe", maxRarity: 5, icon: "UI_RelicIcon_15032_4" }, { id: 15031, name: "Marechaussee Hunter", nameDe: "Schattenj\xE4ger", maxRarity: 5, icon: "UI_RelicIcon_15031_4" }, { id: 15030, name: "Vourukasha's Glow", nameDe: "Licht der Vourukasha-Oase", maxRarity: 5, icon: "UI_RelicIcon_15030_4" }, { id: 15029, name: "Nymph's Dream", nameDe: "Traum der Narzisse", maxRarity: 5, icon: "UI_RelicIcon_15029_4" }, { id: 15028, name: "Flower of Paradise Lost", nameDe: "Blumen des verlorenen Paradieses", maxRarity: 5, icon: "UI_RelicIcon_15028_4" }, { id: 15027, name: "Desert Pavilion Chronicle", nameDe: "Chronik des W\xFCstenpavillons", maxRarity: 5, icon: "UI_RelicIcon_15027_4" }, { id: 15026, name: "Gilded Dreams", nameDe: "Vergoldeter Traum", maxRarity: 5, icon: "UI_RelicIcon_15026_4" }, { id: 15025, name: "Deepwood Memories", nameDe: "Erinnerungen des tiefen Waldes", maxRarity: 5, icon: "UI_RelicIcon_15025_4" }, { id: 15024, name: "Echoes of an Offering", nameDe: "Echo des Opferfests", maxRarity: 5, icon: "UI_RelicIcon_15024_4" }, { id: 15023, name: "Vermillion Hereafter", nameDe: "Vergangenheit des Zinnobers", maxRarity: 5, icon: "UI_RelicIcon_15023_4" }, { id: 15022, name: "Ocean-Hued Clam", nameDe: "Meeresmuschel", maxRarity: 5, icon: "UI_RelicIcon_15022_4" }, { id: 15021, name: "Husk of Opulent Dreams", nameDe: "Schale der \xFCppigen Tr\xE4ume", maxRarity: 5, icon: "UI_RelicIcon_15021_4" }, { id: 15020, name: "Emblem of Severed Fate", nameDe: "Wappen des getrennten Schicksals", maxRarity: 5, icon: "UI_RelicIcon_15020_4" }, { id: 15019, name: "Shimenawa's Reminiscence", nameDe: "Gedenken an Shimenawa", maxRarity: 5, icon: "UI_RelicIcon_15019_4" }, { id: 15018, name: "Pale Flame", nameDe: "Fahle Flammen", maxRarity: 5, icon: "UI_RelicIcon_15018_4" }, { id: 15017, name: "Tenacity of the Millelith", nameDe: "Z\xE4higkeit der Millelithen", maxRarity: 5, icon: "UI_RelicIcon_15017_4" }, { id: 15016, name: "Heart of Depth", nameDe: "Tief im Herzen", maxRarity: 5, icon: "UI_RelicIcon_15016_4" }, { id: 15015, name: "Retracing Bolide", nameDe: "Umgekehrter Meteor", maxRarity: 5, icon: "UI_RelicIcon_15015_4" }, { id: 15014, name: "Archaic Petra", nameDe: "Archaischer Fels", maxRarity: 5, icon: "UI_RelicIcon_15014_4" }, { id: 15013, name: "Prayers to Springtime", nameDe: "Eisopfer", maxRarity: 4, icon: "UI_RelicIcon_15013_3" }, { id: 15011, name: "Prayers for Wisdom", nameDe: "Blitzopfer", maxRarity: 4, icon: "UI_RelicIcon_15011_3" }, { id: 15010, name: "Prayers for Destiny", nameDe: "Wasseropfer", maxRarity: 4, icon: "UI_RelicIcon_15010_3" }, { id: 15009, name: "Prayers for Illumination", nameDe: "Feueropfer", maxRarity: 4, icon: "UI_RelicIcon_15009_3" }, { id: 15008, name: "Bloodstained Chivalry", nameDe: "Blutiger Weg eines Ritters", maxRarity: 5, icon: "UI_RelicIcon_15008_4" }, { id: 15007, name: "Noblesse Oblige", nameDe: "Altes Hofritual", maxRarity: 5, icon: "UI_RelicIcon_15007_4" }, { id: 15006, name: "Crimson Witch of Flames", nameDe: "Brennende Pyro-Hexe", maxRarity: 5, icon: "UI_RelicIcon_15006_4" }, { id: 15005, name: "Thundering Fury", nameDe: "Donnernder Zorn", maxRarity: 5, icon: "UI_RelicIcon_15005_4" }, { id: 15003, name: "Wanderer's Troupe", nameDe: "Wanderorchester", maxRarity: 5, icon: "UI_RelicIcon_15003_4" }, { id: 15002, name: "Viridescent Venerer", nameDe: "Gr\xFCnlicher Schatten", maxRarity: 5, icon: "UI_RelicIcon_15002_4" }, { id: 15001, name: "Gladiator's Finale", nameDe: "Verbeugung des Gladiators", maxRarity: 5, icon: "UI_RelicIcon_15001_4" }, { id: 14004, name: "Maiden Beloved", nameDe: "Ins Herz geschlossenes M\xE4dchen", maxRarity: 5, icon: "UI_RelicIcon_14004_4" }, { id: 14003, name: "Lavawalker", nameDe: "Feuer durchwandernder Heiliger", maxRarity: 5, icon: "UI_RelicIcon_14003_4" }, { id: 14002, name: "Thundersoother", nameDe: "Donner beruhigender Weiser", maxRarity: 5, icon: "UI_RelicIcon_14002_4" }, { id: 14001, name: "Blizzard Strayer", nameDe: "Im Schnee irrender Recke", maxRarity: 5, icon: "UI_RelicIcon_14001_4" }, { id: 10013, name: "Traveling Doctor", nameDe: "Wanderarzt", maxRarity: 3, icon: "UI_RelicIcon_10013_4" }, { id: 10012, name: "Scholar", nameDe: "Gelehrter", maxRarity: 4, icon: "UI_RelicIcon_10012_4" }, { id: 10011, name: "Lucky Dog", nameDe: "Gl\xFCckspilz", maxRarity: 3, icon: "UI_RelicIcon_10011_4" }, { id: 10010, name: "Adventurer", nameDe: "Abenteurer", maxRarity: 3, icon: "UI_RelicIcon_10010_4" }, { id: 10009, name: "The Exile", nameDe: "Verbannter", maxRarity: 4, icon: "UI_RelicIcon_10009_4" }, { id: 10008, name: "Gambler", nameDe: "Gl\xFCcksspieler", maxRarity: 4, icon: "UI_RelicIcon_10008_4" }, { id: 10007, name: "Instructor", nameDe: "Ausbilder", maxRarity: 4, icon: "UI_RelicIcon_10007_4" }, { id: 10006, name: "Martial Artist", nameDe: "Kampfk\xFCnstler", maxRarity: 4, icon: "UI_RelicIcon_10006_4" }, { id: 10005, name: "Berserker", nameDe: "Berserker", maxRarity: 4, icon: "UI_RelicIcon_10005_4" }, { id: 10004, name: "Tiny Miracle", nameDe: "Wunder", maxRarity: 4, icon: "UI_RelicIcon_10004_4" }, { id: 10003, name: "Defender's Will", nameDe: "Besch\xFCtzerinstinkt", maxRarity: 4, icon: "UI_RelicIcon_10003_4" }, { id: 10002, name: "Brave Heart", nameDe: "Wagemut", maxRarity: 4, icon: "UI_RelicIcon_10002_4" }, { id: 10001, name: "Resolution of Sojourner", nameDe: "Fernweh", maxRarity: 4, icon: "UI_RelicIcon_10001_4" }] };

// src/data/characters.ts
var GAME_DATA_UPDATED = game_default.updated;
var looseKey = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
var BASE_CHARACTERS = game_default.characters.map((c2) => ({
  id: c2.id,
  name: c2.name,
  nameDe: c2.nameDe,
  element: c2.element,
  weapon: c2.weapon,
  rarity: c2.rarity,
  region: c2.region,
  avatarId: c2.avatarId,
  release: c2.release,
  icon: c2.icon
}));
var WEAPON_DEFS = game_default.weapons.map((w) => ({
  id: w.id,
  key: w.key,
  name: w.name,
  nameDe: w.nameDe,
  rarity: w.rarity,
  type: w.type,
  icon: w.icon
}));
var ARTIFACT_SETS = game_default.artifactSets;
var setByKey = /* @__PURE__ */ new Map();
for (const a of ARTIFACT_SETS) setByKey.set(looseKey(a.name), a);
function findArtifactSet(keyOrId) {
  if (typeof keyOrId === "number") return ARTIFACT_SETS.find((a) => a.id === keyOrId);
  return setByKey.get(looseKey(keyOrId));
}
var charByKey = /* @__PURE__ */ new Map();
for (const c2 of BASE_CHARACTERS) {
  charByKey.set(looseKey(c2.name), c2);
  if (c2.nameDe) charByKey.set(looseKey(c2.nameDe), c2);
}
var ALIASES = {
  raiden: "raiden-shogun",
  shogunraiden: "raiden-shogun",
  kazuha: "kaedehara-kazuha",
  ayaka: "kamisato-ayaka",
  ayato: "kamisato-ayato",
  kokomi: "sangonomiya-kokomi",
  itto: "arataki-itto",
  sara: "kujou-sara",
  heizou: "shikanoin-heizou",
  shinobu: "kuki-shinobu",
  childe: "tartaglia",
  mizuki: "yumemizuki-mizuki",
  scaramouche: "wanderer"
};
var byId = new Map(BASE_CHARACTERS.map((c2) => [c2.id, c2]));
function findCharacter(name) {
  const k = looseKey(name);
  if (k.startsWith("traveler") || k === "aether" || k === "lumine") return byId.get("traveler");
  return charByKey.get(k) ?? byId.get(ALIASES[k] ?? "");
}
var weaponByKey = /* @__PURE__ */ new Map();
for (const w of WEAPON_DEFS) {
  weaponByKey.set(looseKey(w.name), w);
  if (w.nameDe) weaponByKey.set(looseKey(w.nameDe), w);
}
var weaponById = new Map(WEAPON_DEFS.map((w) => [w.id, w]));
function findWeapon(nameOrId) {
  if (typeof nameOrId === "number") return weaponById.get(nameOrId);
  return weaponByKey.get(looseKey(nameOrId));
}
var characterByAvatarId = (id) => BASE_CHARACTERS.find((c2) => c2.avatarId === id);
var STANDARD_FIVE_STARS = {
  diluc: 0,
  jean: 0,
  keqing: 0,
  mona: 0,
  qiqi: 0,
  tighnari: Date.UTC(2022, 8, 10),
  dehya: Date.UTC(2023, 2, 22),
  "yumemizuki-mizuki": Date.UTC(2025, 2, 5)
};

// src/core/wishStats.ts
var POOL_OF = {
  "100": "beginner",
  "200": "standard",
  "301": "character",
  "400": "character",
  "302": "weapon",
  "500": "chronicled"
};
function compareIds(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
var recordTime = (time) => Date.parse(time.replace(" ", "T") + "Z");
function sortRecords(list) {
  return [...list].sort((a, b) => recordTime(a.time) - recordTime(b.time) || compareIds(a.id, b.id));
}

// src/core/formats.ts
var ImportError = class extends Error {
};
var GACHA_TYPES = /* @__PURE__ */ new Set(["100", "200", "301", "400", "302", "500"]);
function itemKind(name, itemType, itemId) {
  if (itemId && /^1\d{7}$/.test(itemId)) return "character";
  if (itemId && /^\d{5}$/.test(itemId)) return "weapon";
  if (findCharacter(name)) return "character";
  if (findWeapon(name)) return "weapon";
  return /weapon|waffe|arme|arma|武器|무기/i.test(itemType ?? "") ? "weapon" : "character";
}
function rankOf(name, kind, rank) {
  const n = Number(rank);
  if (n === 3 || n === 4 || n === 5) return n;
  if (kind === "character") return findCharacter(name)?.rarity ?? 4;
  const r = findWeapon(name)?.rarity ?? 3;
  return r >= 5 ? 5 : r === 4 ? 4 : 3;
}
function fromUigfItem(i) {
  const type = String(i.gacha_type ?? i.uigf_gacha_type);
  if (!GACHA_TYPES.has(type) || !i.name || !i.time) return null;
  const itemType = itemKind(i.name, i.item_type, i.item_id);
  return {
    id: String(i.id),
    gachaType: type,
    name: i.name,
    itemType,
    rank: rankOf(i.name, itemType, i.rank_type),
    time: i.time,
    itemId: i.item_id || void 0
  };
}
function parseUigf(json) {
  if (Array.isArray(json.hk4e)) {
    const accounts = json.hk4e;
    if (!accounts.length) throw new ImportError("This UIGF file contains no Genshin Impact accounts.");
    const acc = [...accounts].sort((a, b) => (b.list?.length ?? 0) - (a.list?.length ?? 0))[0];
    const records2 = (acc.list ?? []).map(fromUigfItem).filter((r) => !!r);
    return { kind: "uigf", label: "UIGF v4", wishes: { records: records2, uid: String(acc.uid) } };
  }
  const info = json.info ?? {};
  const list = json.list ?? [];
  const records = list.map(fromUigfItem).filter((r) => !!r);
  return {
    kind: "uigf",
    label: `UIGF ${info.uigf_version ?? "v3"}`,
    wishes: { records, uid: info.uid ?? list[0]?.uid }
  };
}
var UIGF_TIMEZONE = (uid) => {
  const first = uid?.length === 10 ? uid.slice(0, 2) : uid?.[0];
  return first === "6" ? -5 : first === "7" ? 1 : 8;
};
function toUigfV4(records, uid = "0", app = "Waypoint") {
  return {
    info: { export_timestamp: Math.floor(Date.now() / 1e3), export_app: app, export_app_version: "2.0", version: "v4.0" },
    hk4e: [
      {
        uid,
        timezone: UIGF_TIMEZONE(uid),
        lang: "en-us",
        list: sortRecords(records).map((r) => ({
          uigf_gacha_type: r.gachaType === "400" ? "301" : r.gachaType,
          gacha_type: r.gachaType,
          item_id: r.itemId ?? "",
          count: "1",
          time: r.time,
          name: r.name,
          item_type: r.itemType === "weapon" ? "Weapon" : "Character",
          rank_type: String(r.rank),
          id: r.id
        }))
      }
    ]
  };
}
var PAIMON_KEYS = {
  "wish-counter-beginners": "100",
  "wish-counter-standard": "200",
  "wish-counter-character-event": "301",
  "wish-counter-weapon-event": "302",
  "wish-counter-chronicled": "500"
};
function parsePaimon(json) {
  const records = [];
  let seq = 0;
  for (const [key, type] of Object.entries(PAIMON_KEYS)) {
    const pulls = json[key]?.pulls ?? [];
    for (const p of pulls) {
      const name = p.id.replace(/_/g, " ");
      const kind = p.type === "weapon" ? "weapon" : p.type === "character" ? "character" : itemKind(name);
      const def = kind === "character" ? findCharacter(name) : findWeapon(name);
      const code = p.code && GACHA_TYPES.has(p.code) ? p.code : type;
      const ts = String(recordTime(p.time)).padStart(13, "0");
      records.push({
        id: `p${ts}${String(seq++).padStart(6, "0")}`,
        gachaType: code,
        name: def?.name ?? name.replace(/\b\w/g, (c2) => c2.toUpperCase()),
        itemType: kind,
        rank: rankOf(def?.name ?? name, kind),
        time: p.time
      });
    }
  }
  if (!records.length) throw new ImportError("No wishes found in this paimon.moe backup.");
  return { kind: "paimon", label: "paimon.moe backup", wishes: { records, uid: json["wish-uid"] || void 0 } };
}
function parseImport(text) {
  let json;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new ImportError("This file is not valid JSON.");
  }
  if (!json || typeof json !== "object") throw new ImportError("Unrecognised file.");
  if (json.format === "waypoint-export") {
    const b = json;
    const wishes = b.uigf ? parseUigf(b.uigf).wishes : void 0;
    return { kind: "waypoint", label: "Waypoint export", wishes, good: b.good, account: b.account, realtime: b.realtime };
  }
  if (json.format === "GOOD") return { kind: "good", label: `GOOD (${String(json.source ?? "unknown source")})`, good: json };
  if (Array.isArray(json.hk4e) || json.info && Array.isArray(json.list)) return parseUigf(json);
  if (Object.keys(PAIMON_KEYS).some((k) => k in json)) return parsePaimon(json);
  throw new ImportError("Unrecognised file. Supported: Waypoint export, UIGF v3/v4, paimon.moe backup, GOOD.");
}
var isSynthetic = (r) => r.id.startsWith("p");
var dedupeKey = (r) => `${POOL_OF[r.gachaType]}|${r.time}|${r.name.toLowerCase()}`;
function mergeWishes(existing, incoming) {
  const ids = new Set(existing.map((r) => r.id));
  const byKey = /* @__PURE__ */ new Map();
  for (const r of existing) {
    const k = dedupeKey(r);
    byKey.set(k, [...byKey.get(k) ?? [], r]);
  }
  const consumed = /* @__PURE__ */ new Set();
  const replaced = /* @__PURE__ */ new Set();
  const added = [];
  for (const r of incoming) {
    if (ids.has(r.id)) continue;
    const twin = (byKey.get(dedupeKey(r)) ?? []).find((c2) => isSynthetic(c2) !== isSynthetic(r) && !consumed.has(c2));
    if (twin) {
      consumed.add(twin);
      if (isSynthetic(r)) continue;
      replaced.add(twin);
    }
    added.push(r);
    ids.add(r.id);
  }
  const list = sortRecords([...existing.filter((r) => !replaced.has(r)), ...added]);
  return { list, added: added.length - replaced.size };
}

// tools/cli/cache.ts
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
var LOG_DIRS = ["Genshin Impact", "\u539F\u795E"];
var LOG_FILES = ["output_log.txt", "Player.log"];
function findGameDataDir(home = homedir()) {
  const tried = [];
  for (const d of LOG_DIRS) {
    for (const f of LOG_FILES) {
      const log2 = join(home, "AppData", "LocalLow", "miHoYo", d, f);
      tried.push(log2);
      if (!existsSync(log2)) continue;
      const dir = gameDirFromLog(readFileSync(log2, "utf8"));
      if (dir && existsSync(dir)) return { dir, tried };
    }
  }
  return { tried };
}
function gameDirFromLog(text) {
  const m = text.match(/([A-Za-z]:[\\/][^\r\n:]*?(?:GenshinImpact_Data|YuanShen_Data))/);
  return m?.[1].replace(/\\/g, "/");
}
function findCacheFile(gameDataDir) {
  const root = join(gameDataDir, "webCaches");
  if (!existsSync(root)) return void 0;
  const candidates = [];
  const consider = (file) => existsSync(file) && candidates.push({ file, mtime: statSync(file).mtimeMs });
  consider(join(root, "Cache", "Cache_Data", "data_2"));
  for (const v of readdirSync(root)) consider(join(root, v, "Cache", "Cache_Data", "data_2"));
  return candidates.sort((a, b) => b.mtime - a.mtime)[0]?.file;
}
function readCache(file) {
  try {
    return readFileSync(file).toString("latin1");
  } catch {
    const tmp = mkdtempSync(join(tmpdir(), "waypoint-"));
    const copy = join(tmp, "data_2");
    try {
      copyFileSync(file, copy);
      return readFileSync(copy).toString("latin1");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}
function searchWishUrls(opts = {}) {
  let gameDataDir = opts.gameDir;
  let tried = [];
  if (gameDataDir && !/_Data[\\/]?$/.test(gameDataDir)) {
    for (const sub of ["GenshinImpact_Data", "YuanShen_Data"]) if (existsSync(join(gameDataDir, sub))) gameDataDir = join(gameDataDir, sub);
  }
  if (!gameDataDir) ({ dir: gameDataDir, tried } = findGameDataDir(opts.home));
  if (!gameDataDir) return { urls: [], tried };
  const cacheFile = findCacheFile(gameDataDir);
  if (!cacheFile) return { gameDataDir, urls: [], tried: [...tried, join(gameDataDir, "webCaches")] };
  const urls = [...new Map(findWishUrls(readCache(cacheFile)).map((u) => [u, u])).values()];
  return { gameDataDir, cacheFile, urls, tried };
}

// src/core/good.ts
function toGoodKey(name) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/'/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}
var PROP_BY_ID = {
  2: "hp",
  3: "hp_",
  5: "atk",
  6: "atk_",
  8: "def",
  9: "def_",
  20: "critRate_",
  22: "critDMG_",
  23: "enerRech_",
  26: "heal_",
  28: "eleMas",
  30: "physical_dmg_",
  40: "pyro_dmg_",
  41: "electro_dmg_",
  42: "hydro_dmg_",
  43: "dendro_dmg_",
  44: "anemo_dmg_",
  45: "geo_dmg_",
  46: "cryo_dmg_"
};
var PROP_BY_NAME = {
  FIGHT_PROP_HP: "hp",
  FIGHT_PROP_HP_PERCENT: "hp_",
  FIGHT_PROP_ATTACK: "atk",
  FIGHT_PROP_ATTACK_PERCENT: "atk_",
  FIGHT_PROP_DEFENSE: "def",
  FIGHT_PROP_DEFENSE_PERCENT: "def_",
  FIGHT_PROP_CRITICAL: "critRate_",
  FIGHT_PROP_CRITICAL_HURT: "critDMG_",
  FIGHT_PROP_CHARGE_EFFICIENCY: "enerRech_",
  FIGHT_PROP_HEAL_ADD: "heal_",
  FIGHT_PROP_ELEMENT_MASTERY: "eleMas",
  FIGHT_PROP_PHYSICAL_ADD_HURT: "physical_dmg_",
  FIGHT_PROP_FIRE_ADD_HURT: "pyro_dmg_",
  FIGHT_PROP_ELEC_ADD_HURT: "electro_dmg_",
  FIGHT_PROP_WATER_ADD_HURT: "hydro_dmg_",
  FIGHT_PROP_GRASS_ADD_HURT: "dendro_dmg_",
  FIGHT_PROP_WIND_ADD_HURT: "anemo_dmg_",
  FIGHT_PROP_ROCK_ADD_HURT: "geo_dmg_",
  FIGHT_PROP_ICE_ADD_HURT: "cryo_dmg_"
};
var statKeyFromProp = (p) => (typeof p === "number" ? PROP_BY_ID[p] : PROP_BY_NAME[p]) ?? String(p);
function ascensionForLevel(level) {
  const caps = [20, 40, 50, 60, 70, 80];
  return caps.filter((c2) => level > c2).length;
}

// tools/cli/enka.ts
var SLOT = {
  EQUIP_BRACER: "flower",
  EQUIP_NECKLACE: "plume",
  EQUIP_SHOES: "sands",
  EQUIP_RING: "goblet",
  EQUIP_DRESS: "circlet"
};
async function fetchEnka(http, uid) {
  const data = await http.json(`https://enka.network/api/uid/${encodeURIComponent(uid)}/`);
  const store = await http.json(
    "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json"
  );
  const skillOrder = {};
  for (const [id, c2] of Object.entries(store)) if (c2.SkillOrder) skillOrder[id] = c2.SkillOrder;
  return { data, skillOrder };
}
function enkaToGood(res, skillOrder) {
  const characters = [];
  const weapons = [];
  const artifacts = [];
  const unknown = [];
  for (const a of res.avatarInfoList ?? []) {
    const def = characterByAvatarId(a.avatarId) ?? (a.avatarId === 10000007 ? characterByAvatarId(10000005) : void 0);
    if (!def) {
      unknown.push(a.avatarId);
      continue;
    }
    const key = toGoodKey(def.name);
    const order = skillOrder[String(a.avatarId)] ?? Object.keys(a.skillLevelMap).map(Number);
    const lvl = (i) => a.skillLevelMap[String(order[i])] ?? 1;
    characters.push({
      key,
      level: Number(a.propMap["4001"]?.val ?? 1),
      ascension: Number(a.propMap["1002"]?.val ?? 0),
      constellation: a.talentIdList?.length ?? 0,
      talent: { auto: lvl(0), skill: lvl(1), burst: lvl(2) }
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
          lock: false
        });
      } else if (e.reliquary && e.flat.equipType) {
        const set = e.flat.setId ? findArtifactSet(e.flat.setId) : void 0;
        artifacts.push({
          setKey: toGoodKey(set?.name ?? String(e.flat.setId ?? "Unknown")),
          slotKey: SLOT[e.flat.equipType],
          level: Math.max(0, e.reliquary.level - 1),
          rarity: e.flat.rankLevel,
          mainStatKey: statKeyFromProp(e.flat.reliquaryMainstat?.mainPropId ?? ""),
          location: key,
          lock: false,
          substats: (e.flat.reliquarySubstats ?? []).map((s) => ({ key: statKeyFromProp(s.appendPropId), value: s.statValue }))
        });
      }
    }
  }
  return {
    good: { format: "GOOD", version: 2, source: "Waypoint export (Enka.Network)", characters, weapons, artifacts },
    account: { uid: res.uid, nickname: res.playerInfo.nickname, level: res.playerInfo.level, worldLevel: res.playerInfo.worldLevel },
    unknown
  };
}

// tools/cli/hoyolab.ts
import { createHash, randomBytes } from "node:crypto";
var BASE = "https://bbs-api-os.hoyolab.com/game_record/genshin/api";
var DS_SALT = "6s25p5ox5y14umn1p61aqyyvbvvl3lrt";
var HoyolabError = class extends Error {
  constructor(message, retcode) {
    super(message);
    this.retcode = retcode;
  }
};
function makeDS(now = Date.now(), rand = randomBytes(3).toString("hex")) {
  const t = Math.floor(now / 1e3);
  const r = rand.slice(0, 6);
  const sig = createHash("md5").update(`salt=${DS_SALT}&t=${t}&r=${r}`).digest("hex");
  return `${t},${r},${sig}`;
}
function serverForUid(uid) {
  const head = uid.length === 10 ? uid.slice(0, 2) : uid[0];
  const map = { "6": "os_usa", "7": "os_euro", "8": "os_asia", "18": "os_asia", "9": "os_cht" };
  const s = map[head];
  if (!s) throw new HoyolabError(`UID ${uid} is not on a global server (HoYoLAB only covers global accounts).`, -1);
  return s;
}
function normaliseCookie(cookie) {
  const parts = /* @__PURE__ */ new Map();
  for (const p of cookie.split(";")) {
    const i = p.indexOf("=");
    if (i > 0) parts.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  if (!parts.has("ltoken_v2") && !parts.has("ltoken")) {
    throw new HoyolabError("The cookie needs ltoken_v2 and ltuid_v2 (copy them from hoyolab.com while logged in).", -1);
  }
  return { header: [...parts].map(([k, v]) => `${k}=${v}`).join("; "), ltuid: parts.get("ltuid_v2") ?? parts.get("ltuid") };
}
var RETCODE_HELP = {
  10001: "HoYoLAB says you are not logged in \u2013 the cookie is wrong or expired.",
  [-100]: "HoYoLAB says you are not logged in \u2013 the cookie is wrong or expired.",
  10102: "Your Battle Chronicle is private. On HoYoLAB: Battle Chronicle \u2192 Settings \u2192 make it public.",
  1034: "HoYoLAB wants a captcha. Open the Battle Chronicle on hoyolab.com once, solve it, then retry.",
  10101: "HoYoLAB rate limit (you can view 30 accounts per day). Try again tomorrow."
};
var Hoyolab = class {
  constructor(http, cookie, lang = "en-us") {
    this.http = http;
    this.lang = lang;
    this.cookie = normaliseCookie(cookie).header;
  }
  cookie;
  async call(path, init = {}) {
    const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const res = await this.http.json(url.toString(), {
      method: init.method ?? "GET",
      body: init.body ? JSON.stringify(init.body) : void 0,
      headers: {
        Cookie: this.cookie,
        DS: makeDS(),
        "Content-Type": "application/json",
        "x-rpc-app_version": "1.5.0",
        "x-rpc-client_type": "5",
        "x-rpc-language": this.lang,
        Origin: "https://act.hoyolab.com",
        Referer: "https://act.hoyolab.com/"
      }
    });
    if (res.retcode !== 0) throw new HoyolabError(RETCODE_HELP[res.retcode] ?? `HoYoLAB error ${res.retcode}: ${res.message}`, res.retcode);
    return res.data;
  }
  /** Genshin accounts linked to the HoYoLAB account. */
  async accounts(ltuid) {
    const data = await this.call(
      "https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard",
      { query: { uid: ltuid } }
    );
    return data.list.filter((g) => g.game_id === 2).map((g) => ({ uid: g.game_role_id, server: g.region, nickname: g.nickname, level: g.level }));
  }
  async index(uid) {
    return this.call("/index", {
      query: { server: serverForUid(uid), role_id: uid }
    });
  }
  async characters(uid) {
    const server = serverForUid(uid);
    const list = await this.call("/character/list", { method: "POST", body: { role_id: uid, server, sort_type: 1 } });
    const ids = list.list.map((c2) => c2.id);
    const out = [];
    for (let i = 0; i < ids.length; i += 8) {
      const d = await this.call("/character/detail", {
        method: "POST",
        body: { role_id: uid, server, character_ids: ids.slice(i, i + 8) }
      });
      out.push(...d.list);
      await new Promise((r) => setTimeout(r, 300));
    }
    return out;
  }
  async dailyNote(uid) {
    return this.call("/dailyNote", { query: { server: serverForUid(uid), role_id: uid } });
  }
};
var POS = { 1: "flower", 2: "plume", 3: "sands", 4: "goblet", 5: "circlet" };
var num = (v) => parseFloat(v.replace("%", ""));
function hoyolabToGood(list) {
  const characters = [];
  const weapons = [];
  const artifacts = [];
  for (const c2 of list) {
    const def = findCharacter(c2.base.name);
    const key = toGoodKey(def?.name ?? c2.base.name);
    const active = (c2.skills ?? []).filter((s) => s.skill_type === 1);
    const base = (l) => l == null ? 1 : l > 10 ? l - 3 : l;
    characters.push({
      key,
      level: c2.base.level,
      ascension: ascensionForLevel(c2.base.level),
      constellation: c2.base.actived_constellation_num,
      talent: { auto: base(active[0]?.level), skill: base(active[1]?.level), burst: base(active[active.length - 1]?.level) }
    });
    if (c2.weapon) {
      weapons.push({
        key: toGoodKey(c2.weapon.name),
        level: c2.weapon.level,
        ascension: c2.weapon.promote_level ?? ascensionForLevel(c2.weapon.level),
        refinement: c2.weapon.affix_level,
        location: key,
        lock: false
      });
    }
    for (const r of c2.relics ?? []) {
      artifacts.push({
        setKey: toGoodKey(r.set.name),
        slotKey: POS[r.pos],
        level: r.level,
        rarity: r.rarity,
        mainStatKey: r.main_property ? statKeyFromProp(r.main_property.property_type) : "",
        location: key,
        lock: false,
        substats: (r.sub_property_list ?? []).map((s) => ({ key: statKeyFromProp(s.property_type), value: num(s.value) }))
      });
    }
  }
  return { format: "GOOD", version: 2, source: "Waypoint export (HoYoLAB)", characters, weapons, artifacts };
}
function dailyNoteToRealtime(n, fetchedAt = /* @__PURE__ */ new Date()) {
  const tr = n.transformer;
  const trSeconds = tr?.obtained ? tr.recovery_time.reached ? 0 : ((tr.recovery_time.Day * 24 + tr.recovery_time.Hour) * 60 + tr.recovery_time.Minute) * 60 + tr.recovery_time.Second : null;
  return {
    fetchedAt: fetchedAt.toISOString(),
    resin: { current: n.current_resin, max: n.max_resin, recoverySeconds: Number(n.resin_recovery_time) || 0 },
    commissions: { done: n.finished_task_num, total: n.total_task_num, claimed: n.is_extra_task_reward_received },
    realmCurrency: { current: n.current_home_coin, max: n.max_home_coin },
    transformerReadyInSeconds: trSeconds,
    weeklyBossDiscountsLeft: n.remain_resin_discount_num
  };
}
function accountFromIndex(uid, idx) {
  return { uid, nickname: idx.role.nickname, level: idx.role.level, server: idx.role.region };
}

// tools/cli/http.ts
var USER_AGENT = "waypoint-export/2.0 (+https://github.com/Ole-109/test)";
var HttpError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
function createHttp(opts = {}) {
  const f = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 2e4;
  async function raw(url, init = {}) {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await f(url, {
          ...init,
          headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers },
          signal: ctrl.signal
        });
        if (res.status >= 500 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1e3 * (attempt + 1)));
          continue;
        }
        return res;
      } catch (e) {
        if (attempt >= 2) throw new HttpError(`Request failed: ${e.message} (${new URL(url).host})`, 0);
        await new Promise((r) => setTimeout(r, 1e3 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return {
    async json(url, init) {
      const res = await raw(url, init);
      if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
      return await res.json();
    },
    fetcher: (url) => raw(url)
  };
}

// tools/cli/main.ts
var VERSION = "2.0.0";
var color = process.stdout.isTTY && !process.env.NO_COLOR;
var c = (code) => (s) => color ? `\x1B[${code}m${s}\x1B[0m` : s;
var bold = c(1);
var dim = c(2);
var green = c(32);
var yellow = c(33);
var red = c(31);
var cyan = c(36);
var log = (s = "") => process.stdout.write(s + "\n");
var step = (s) => log(`${cyan("\u203A")} ${s}`);
var ok = (s) => log(`${green("\u2713")} ${s}`);
var warn = (s) => log(`${yellow("!")} ${s}`);
var fail = (s) => log(`${red("\u2717")} ${s}`);
var HELP = `${bold("waypoint-export")} ${dim(VERSION)} \u2013 export your Genshin Impact data for Waypoint

${bold("Usage")}
  waypoint-export [command] [options]

${bold("Commands")}
  all        ${dim("(default)")} wish history + HoYoLAB / Enka data \u2192 one Waypoint file
  link       find the wish history link in the game cache and copy it
  wishes     download the full wish history \u2192 UIGF v4 file
  hoyolab    characters, weapons, artifacts, resin & dailies via HoYoLAB
  enka       showcase characters via Enka.Network (public, no login)

${bold("Options")}
  --url <link>        wish history link (skip the game cache search)
  --game-dir <path>   game folder if it isn't found automatically
  --cookie <cookie>   HoYoLAB cookie with ltoken_v2 + ltuid_v2 (or env HOYOLAB_COOKIE)
  --uid <uid>         Genshin UID (for HoYoLAB / Enka)
  --merge <file>      previous export: only download new wishes, keep the old ones
  --out <file>        output file name
  --no-wishes         skip the wish history
  --enka              also use Enka.Network (default when no HoYoLAB cookie is given)
  -h, --help          show this help

${bold("Examples")}
  waypoint-export
  waypoint-export --cookie "ltoken_v2=\u2026; ltuid_v2=\u2026"
  waypoint-export --merge waypoint-export-700000000.json
  waypoint-export enka --uid 700000000

Open the wish history in game once before running, so the link is fresh.
`;
function copyToClipboard(text) {
  try {
    if (process.platform === "win32") execFileSync("clip", { input: text });
    else if (process.platform === "darwin") execFileSync("pbcopy", { input: text });
    else execFileSync("xclip", ["-selection", "clipboard"], { input: text });
    return true;
  } catch {
    return false;
  }
}
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      "game-dir": { type: "string" },
      cookie: { type: "string" },
      uid: { type: "string" },
      merge: { type: "string" },
      out: { type: "string" },
      "no-wishes": { type: "boolean" },
      enka: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" }
    }
  });
  if (values.help) return void log(HELP);
  if (values.version) return void log(VERSION);
  const command = positionals[0] ?? "all";
  if (!["all", "link", "wishes", "hoyolab", "enka"].includes(command)) {
    fail(`Unknown command "${command}".`);
    log(HELP);
    process.exitCode = 1;
    return;
  }
  log(`${bold("Waypoint export")} ${dim(VERSION)}
`);
  const http = createHttp();
  const cookie = values.cookie ?? process.env.HOYOLAB_COOKIE;
  let uid = values.uid;
  let account = {};
  let records = [];
  let good;
  let realtime;
  let previous = [];
  if (values.merge) {
    if (!existsSync2(values.merge)) throw new Error(`--merge file not found: ${values.merge}`);
    const prev = parseImport(readFileSync2(values.merge, "utf8"));
    previous = prev.wishes?.records ?? [];
    uid ??= prev.wishes?.uid ?? prev.account?.uid;
    ok(`Loaded ${previous.length} wishes from ${values.merge}`);
  }
  const wantWishes = command === "link" || command === "wishes" || command === "all" && !values["no-wishes"];
  if (wantWishes) {
    let info;
    let link;
    if (values.url) {
      info = parseWishUrl(values.url);
      step("Checking the link\u2026");
      await validateWishUrl(info, { fetch: http.fetcher });
      link = values.url;
    } else {
      step("Looking for the wish history link in the game cache\u2026");
      const found = searchWishUrls({ gameDir: values["game-dir"] });
      if (found.gameDataDir) log(dim(`  game data: ${found.gameDataDir}`));
      if (!found.urls.length) {
        fail("No wish history link found.");
        log(dim("  Open the game, press F3 (Wish) \u2192 History, wait for it to load, then run this again."));
        if (!found.gameDataDir) log(dim(`  Looked for the game log in:
    ${found.tried.join("\n    ")}
  Use --game-dir "D:/Games/Genshin Impact game" if it lives elsewhere.`));
      }
      for (const u of [...found.urls].reverse()) {
        try {
          const candidate = parseWishUrl(u);
          await validateWishUrl(candidate, { fetch: http.fetcher });
          info = candidate;
          link = u;
          break;
        } catch (e) {
          if (!(e instanceof GachaApiError) || e.code !== "authkey-expired" && e.code !== "authkey-invalid") throw e;
        }
      }
      if (found.urls.length && !info) fail("All links in the cache have expired. Open the wish history in game again, then rerun.");
    }
    if (info && link) {
      ok("Found a valid wish history link.");
      if (command === "link") {
        log(`
${link}
`);
        if (copyToClipboard(link)) ok("Copied to the clipboard \u2013 paste it into Waypoint \u2192 Wishes \u2192 Import.");
        return;
      }
      step("Downloading wish history (this takes a minute for large accounts)\u2026");
      const names = { "301": "Character Event", "302": "Weapon Event", "500": "Chronicled", "200": "Standard", "100": "Beginners" };
      let lastType = "";
      const res = await fetchWishHistory(info, {
        fetch: http.fetcher,
        knownIds: new Set(previous.map((r) => r.id)),
        onProgress: (p) => {
          if (p.gachaType !== lastType && lastType && process.stdout.isTTY) process.stdout.write("\n");
          lastType = p.gachaType;
          const line = `  ${names[p.gachaType].padEnd(16)} page ${String(p.page).padStart(3)} \xB7 ${p.fetched} new`;
          if (process.stdout.isTTY) process.stdout.write(`\r${line}`);
        }
      });
      if (process.stdout.isTTY) process.stdout.write("\n");
      uid ??= res.uid;
      const merged = mergeWishes(previous, res.records);
      records = merged.list;
      ok(`${res.records.length} new wishes \xB7 ${records.length} in total`);
      const byPool = /* @__PURE__ */ new Map();
      for (const r of records) byPool.set(POOL_OF[r.gachaType], (byPool.get(POOL_OF[r.gachaType]) ?? 0) + 1);
      log(dim(`  ${[...byPool].map(([k, n]) => `${k} ${n}`).join(" \xB7 ")}`));
    } else if (command === "link" || command === "wishes") {
      process.exitCode = 1;
      return;
    }
  } else records = previous;
  if (command === "wishes") {
    const out2 = values.out ?? `uigf-${uid ?? "unknown"}-${today()}.json`;
    writeFileSync(out2, JSON.stringify(toUigfV4(records, uid), null, 2), "utf8");
    ok(`Wrote ${bold(out2)}`);
    return;
  }
  if ((command === "all" || command === "hoyolab") && cookie) {
    try {
      const hl = new Hoyolab(http, cookie);
      if (!uid) {
        const { ltuid } = normaliseCookie(cookie);
        if (ltuid) {
          step("Finding your Genshin account on HoYoLAB\u2026");
          const accs = await hl.accounts(ltuid);
          if (accs.length > 1) warn(`Several accounts found; using ${accs[0].uid}. Pass --uid to pick another.`);
          uid = accs[0]?.uid;
        }
      }
      if (!uid) throw new Error("Pass --uid so HoYoLAB knows which account to read.");
      step(`Reading Battle Chronicle for UID ${uid}\u2026`);
      account = { ...account, ...accountFromIndex(uid, await hl.index(uid)) };
      const chars = await hl.characters(uid);
      good = hoyolabToGood(chars);
      ok(`${good.characters?.length} characters, ${good.weapons?.length} equipped weapons, ${good.artifacts?.length} equipped artifacts`);
      try {
        realtime = dailyNoteToRealtime(await hl.dailyNote(uid));
        ok(`Resin ${realtime.resin?.current}/${realtime.resin?.max} \xB7 commissions ${realtime.commissions?.done}/${realtime.commissions?.total}`);
      } catch (e) {
        warn(`Real-time notes unavailable: ${e.message}`);
      }
    } catch (e) {
      (command === "hoyolab" ? fail : warn)(`HoYoLAB: ${e.message}`);
      if (command === "hoyolab") process.exitCode = 1;
    }
  } else if (command === "hoyolab") {
    fail('HoYoLAB needs --cookie "ltoken_v2=\u2026; ltuid_v2=\u2026" (or the HOYOLAB_COOKIE environment variable).');
    log(dim("  hoyolab.com \u2192 log in \u2192 F12 \u2192 Application \u2192 Cookies \u2192 copy ltoken_v2 and ltuid_v2."));
    process.exitCode = 1;
    return;
  }
  if ((command === "enka" || command === "all" && (values.enka || !good)) && uid) {
    try {
      step(`Reading the Enka.Network showcase for UID ${uid}\u2026`);
      const { data, skillOrder } = await fetchEnka(http, uid);
      const r = enkaToGood(data, skillOrder);
      account = { ...r.account, ...account };
      if (!good) good = r.good;
      else {
        const have = new Set(good.characters?.map((x) => x.key));
        good.characters?.push(...(r.good.characters ?? []).filter((x) => !have.has(x.key)));
      }
      if (!r.good.characters?.length) warn("The showcase is empty. Add characters to your in-game profile showcase to export them.");
      else ok(`${r.good.characters.length} showcase characters`);
    } catch (e) {
      (command === "enka" ? fail : warn)(`Enka.Network: ${e.message}`);
      if (command === "enka") process.exitCode = 1;
    }
  } else if (command === "enka") {
    fail("Enka needs --uid.");
    process.exitCode = 1;
    return;
  }
  account.uid ??= uid;
  const bundle = {
    format: "waypoint-export",
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: `waypoint-export ${VERSION}`,
    account,
    uigf: records.length ? toUigfV4(records, uid) : void 0,
    good,
    realtime
  };
  if (!records.length && !good && !realtime) {
    fail("Nothing to export.");
    process.exitCode = 1;
    return;
  }
  const out = values.out ?? `waypoint-export-${uid ?? "unknown"}-${today()}.json`;
  writeFileSync(out, JSON.stringify(bundle), "utf8");
  log();
  ok(`Saved ${bold(out)}`);
  log(dim("  Import it in Waypoint: Wishes \u2192 Import \u2192 choose file (or drag it onto the page)."));
}
main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

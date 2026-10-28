// «Чёрная магия», этап Б: кузня Знахаря (Альказак). Чистая логика, без D1/сокетов — её зовёт service.ts и тесты.
//  • Деталь (BM_PARTS) создаётся из кусочков чертежа bp_<стихия>_<тип> (ресурсы, падают с мобов — дроп настраивается у моба).
//    Созданные детали лежат у игрока стопками: accounts.data.bmParts = { [partId]: кол-во } (необязательное поле, старые сейвы целы).
//  • Сборка: рукоять + лезвие обязательны, второе/третье лезвие и кристалл — по желанию. Имя — строгая очистка + мат-фильтр форума.
//  • Разбор артефакта — обычный «разбор» предмета: даёт базовые осколки bm_shard_<стихия> (salvageYield → artSalvage).
//  • Лимит: BMA_CFG.maxArtifacts (30) на аккаунт, BMA_CFG.craftPerMin сборок в минуту.
import { BM_PARTS, BMA_CFG, BP_TYPES, BP_TYPE_NAMES, pieceId, shardId, partCost, computeArtifact, type BmPart } from "./blackArt";
import { compileWords, filterText, DEFAULT_WORDS } from "../../src/lib/forum/profanity";

export type ForgeR = { ok: boolean; msg?: string; err?: string; [k: string]: any };
const fail = (err: string): ForgeR => ({ ok: false, err });
let RULES: any = null;
const rules = () => (RULES ??= compileWords(DEFAULT_WORDS));

/** Имя артефакта: NFKC, без управляющих, нулевой ширины, RTL/LTR-меток; буквы, цифры, пробел, - ' ’; 2–24 символа; мат-фильтр. */
export function cleanArtName(raw: any): { ok: true; name: string } | { ok: false; err: string } {
  let s = String(raw ?? "").normalize("NFKC");
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\u00ad]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 24) return { ok: false, err: "Имя: от 2 до 24 символов" };
  if (!/^[\p{L}\p{N} \-'’]+$/u.test(s)) return { ok: false, err: "Имя: только буквы, цифры, пробел, дефис и апостроф" };
  if (!/[\p{L}]/u.test(s)) return { ok: false, err: "Имя: нужна хотя бы одна буква" };
  if (!filterText(s, rules()).clean) return { ok: false, err: "Такое имя не подойдёт — Знахарь хмурится. Придумайте другое, пожалуйста" };
  return { ok: true, name: s };
}

/** деталь доступна игрокам: есть, не скрыта, стихия огонь (этап Б) */
export const partOpen = (p: BmPart | undefined): p is BmPart => !!p && !p.hidden;

/** витрина кузни: какие детали можно создать, что у игрока есть */
export function forgeState(a: any, heroLvl: number) {
  const res = a.res || {}, own = a.bmParts || {};
  const parts = Object.values(BM_PARTS).filter(partOpen).map((p) => ({
    id: p.id, name: p.name, type: p.type, elem: p.elem, rarity: p.rarity, icon: p.icon, color: p.color, img: p.img || "", desc: p.desc || "",
    stats: p.stats, skill: p.skill || "", ranged: !!p.ranged, rangeTiles: p.rangeTiles || 0, reach: p.reach || 0, arc: p.arc || 0, width: p.width || 0, cd: p.cd || 0,
    cost: partCost(p), piece: pieceId(p.elem, p.type), reqLvl: p.reqLvl || 0, have: Math.max(0, Number(own[p.id]) || 0), can: (res[pieceId(p.elem, p.type)] || 0) >= partCost(p) && heroLvl >= (p.reqLvl || 0),
  }));
  const arts = (a.inv || []).filter((i: any) => /^art_/.test(i.id)).length;
  const pieces: Record<string, number> = {};
  for (const t of BP_TYPES) { const k = pieceId("fire", t); pieces[k] = Math.max(0, Number(res[k]) || 0); }
  return { parts, pieces, shards: Math.max(0, Number(res[shardId("fire")]) || 0), arts, max: BMA_CFG.maxArtifacts, salvage: { base: BMA_CFG.salvageBase, per: BMA_CFG.salvagePerPart } };
}

/** создать деталь из кусочков чертежа */
export function craftPart(a: any, partId: string, heroLvl: number, n = 1): ForgeR {
  const p = BM_PARTS[partId]; if (!partOpen(p)) return fail("Такой детали нет");
  n = Math.max(1, Math.min(10, Math.round(Number(n) || 1)));
  if (heroLvl < (p.reqLvl || 0)) return fail(`Нужен ${p.reqLvl} уровень героя`);
  const k = pieceId(p.elem, p.type), cost = partCost(p) * n, have = Number(a.res?.[k]) || 0;
  if (have < cost) return fail(`Не хватает кусочков чертежа: ${have}/${cost}`);
  a.res = a.res || {}; a.res[k] = have - cost; if (a.res[k] <= 0) delete a.res[k];
  a.bmParts = a.bmParts || {}; a.bmParts[partId] = (Number(a.bmParts[partId]) || 0) + n;
  return { ok: true, msg: `Создано: ${p.name}${n > 1 ? " ×" + n : ""}`, part: partId, n };
}

/** проверить сборку (без списания): части есть у игрока, типы на своих местах, лимит артефактов */
export function checkBuild(a: any, parts: any): ForgeR & { parts?: Record<string, string> } {
  if (!parts || typeof parts !== "object") return fail("Выберите детали");
  const out: Record<string, string> = {};
  for (const slot of BP_TYPES) {
    const id = parts[slot]; if (id == null || id === "") continue;
    const p = BM_PARTS[String(id)]; if (!partOpen(p)) return fail(`${BP_TYPE_NAMES[slot]}: такой детали нет`);
    if (p.type !== slot) return fail(`${p.name} — это не «${BP_TYPE_NAMES[slot]}»`);
    if (!((Number(a.bmParts?.[p.id]) || 0) >= 1)) return fail(`Нет детали: ${p.name}`);
    out[slot] = p.id;
  }
  if (!out.handle || !out.blade) return fail("Нужны рукоять и лезвие");
  const have = (a.inv || []).filter((i: any) => /^art_/.test(i.id)).length;
  if (have >= BMA_CFG.maxArtifacts) return fail(`Артефактов уже ${have} из ${BMA_CFG.maxArtifacts} — разберите лишний`);
  if (!computeArtifact(out)) return fail("Детали не собираются");
  return { ok: true, parts: out };
}
/** списать детали сборки (после успешного создания предмета) */
export function spendParts(a: any, parts: Record<string, string>) {
  for (const id of Object.values(parts)) { a.bmParts[id] = (Number(a.bmParts[id]) || 0) - 1; if (a.bmParts[id] <= 0) delete a.bmParts[id]; }
}
/** окно «не чаще craftPerMin в минуту»: true — можно */
export function rateOk(log: number[], perMin: number, now = Date.now()): boolean {
  while (log.length && now - log[0] > 60000) log.shift();
  if (log.length >= Math.max(1, perMin)) return false;
  log.push(now); return true;
}
/** разбор артефакта: базовые осколки по стихии (+ за каждую деталь сверх двух) */
export function artSalvage(bm: any): Record<string, number> {
  const n = Object.keys(bm?.parts || {}).length;
  const q = Math.max(0, Math.round(BMA_CFG.salvageBase + Math.max(0, n - 2) * BMA_CFG.salvagePerPart));
  return q ? { [shardId(bm?.elem || "fire")]: q } : {};
}

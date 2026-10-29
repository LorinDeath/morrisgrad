import { autoObjText } from "./objText";
// «Проклятые»: админ-панель — сервер. Правки игровых данных (overrides.ts: схема + проверка) и квесты из игры
// хранятся в D1 (миграция 0010): game_overrides, custom_quests, журнал game_override_audit, версия набора
// game_config_version (комнаты сверяют её и перечитывают правки). Писать может серверно проверенный админ (всё) или модератор (только mob/weapon/item) —
// проверка роли в service.ts ДО вызова этих методов. Все запросы к D1 — только с bind (никакой склейки SQL).
import { ZONE_GEN } from "./zoneGen";
import { STAR_COLORS } from "./shared";
import { itemReq } from "./profile";
import { validateConds, COND_DEFS } from "./questConds";
import { validatePatch, applyOverride, currentValues, defaultDiff, SCHEMA, TABLES, TRAIT_DEFS, TRAITS, BT_FLAG_NAMES, SEC_MAIN, SEC_SEP, sectionable, sectionMap, sectionIds, secRowId, splitRowId, type Kind, type Trait } from "./overrides";
import { copyIds, copyPatch, isCopy } from "./variantCopy";
import { migrateBchestPatch, bcSpecErr, bcSpecNorm } from "./boardChestCfg";
import { BT_EVS, BT_STATES, BT_ROLE_NAMES, ROOM_NAMES, BT_CATS_NEW, CAT_NAMES, GIVER_NAMES, NPC_GIVERS, CUSTOM_BT } from "./board";
import { BIOMES } from "./biomes";
import { RECIPES, HERO_IDS, RESOURCES as RES_ALL } from "./defs";
import { HERO_NAMES } from "./shared";
import { WORLD_NAMES } from "./mobHome";
import { QUESTS, QUEST_BY_ID, setCustomQuests, applyBuiltinOverride, questOriginal, type QuestDef, type Objective } from "./quests";
import { NPCS, RESOURCES } from "./shared";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { mobCategories } from "./bestiaryReg";
import { MOB_SKILLS_LIST } from "./mobSkills";
import { validateDialogue, dialogueKeys, dialogueEmpty, setQuestDialogues, QUEST_DIALOGUES, VN_CHARS, VN_EMOTIONS, VN_EMOTION_NAMES, VN_LIMITS, type QuestDialogue } from "./vnChars";

/** «Спавн» → локация: что будет, если поле пустое (как в коде) — подсказка вместо «—» */
function regionDefs(r: any) {
  const pk = (r.table || []).map((t: any) => t.pack).filter(Boolean), G: any = ZONE_GEN;
  return { dens: "1", "packs.0": "2", "packs.1": `3 (в ${Math.round(G.campPacks3 * 100)}% лагерей)`, "pack.0": pk.length ? String(Math.min(...pk.map((p: any) => p[0]))) : "—", "pack.1": pk.length ? String(Math.max(...pk.map((p: any) => p[1]))) : "—",
    eliteMax: "без лимита", elite: String(r.elite ?? 0) };
}
export const KINDS: Kind[] = ["board", "btask", "bchest", "mob", "weapon", "item", "skill", "loot", "spawn", "region", "boss", "rare", "curse", "chest", "dash", "biome", "upgrade", "gather", "npc", "ench", "bmage", "light", "ui", "terrain", "city", "pk", "pos", "dn", "gfx", "bmagic", "bpart", "bmbody", "bmmob", "bmcamp", "bmmcfg", "skdef"];
const ID_RE = /^[a-z0-9_:-]{1,48}$/i;
const STR = (v: any, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const OBJ_TYPES = ["talk", "kill", "kill_boss", "gather", "collect", "level", "reach"] as const;

/** проверка квеста из панели: только разрешённые поля и типы целей, ссылки на существующих NPC/мобов/предметы */
export function validateQuest(q: any, builtin?: QuestDef): QuestDef | string {
  if (!q || typeof q !== "object") return "пустой квест";
  const id = String(q.id || "");
  if (builtin) { if (id !== builtin.id) return "id сюжетного квеста менять нельзя"; }
  else if (!/^c_[a-z0-9_]{1,40}$/.test(id)) return "id квеста: c_ + латиница/цифры/_ (до 40)";
  if (!NPCS[q.npc]) return "NPC не найден";
  if (q.turnin && !NPCS[q.turnin]) return "NPC сдачи не найден";
  const title = STR(q.title, 80).trim(); if (!title) return "нужно название";
  const minLevel = q.minLevel == null || q.minLevel === "" ? undefined : Math.round(Number(q.minLevel));
  if (minLevel !== undefined && !(minLevel >= 1 && minLevel <= 60)) return "мин. уровень 1…60";
  // «открывается после квестов»: цепочка предусловий (у одного квеста может быть несколько «детей»)
  if (q.requires != null && !Array.isArray(q.requires)) return "предусловия: список id";
  const requires = [...new Set((q.requires || []).map(String))] as string[];
  if (requires.length > 5) return "предусловий не больше 5";
  for (const r of requires) { if (r === id) return "квест не может открываться после самого себя"; if (!QUEST_BY_ID[r]) return `нет квеста ${r}`; }
  { // без циклов: из предусловий нельзя вернуться к этому квесту
    const seen = new Set<string>(), st = [...requires];
    while (st.length) { const c = st.pop()!; if (c === id) return "цикл в цепочке квестов"; if (seen.has(c)) continue; seen.add(c); st.push(...(QUEST_BY_ID[c]?.requires || [])); }
  }
  if (!Array.isArray(q.objectives) || !q.objectives.length || q.objectives.length > 5) return "целей 1…5";
  const objectives: Objective[] = [];
  for (const o of q.objectives) {
    // у сюжетных квестов бывают особые цели (забег, «без навыков»…): их можно оставить как в коде, но не менять
    if (builtin && !(OBJ_TYPES as readonly string[]).includes(String(o?.type))) {
      const same = (builtin.objectives || []).find((x: any) => JSON.stringify({ ...x, text: undefined }) === JSON.stringify({ ...o, text: undefined }));
      if (!same) return `цель «${o?.type}» сюжетного квеста менять нельзя (только текст)`;
      objectives.push({ ...same, text: STR(o?.text, 160).trim() || same.text } as any); continue;
    }
    const t = String(o?.type), text0 = STR(o?.text, 160).trim(); let text = text0 && text0 !== "Цель" ? text0 : "";
    const cnt = Math.round(Number(o?.count) || 1);
    if (!(OBJ_TYPES as readonly string[]).includes(t)) return `тип цели ${t} недоступен`;
    if (cnt < 1 || cnt > 999) return "количество 1…999";
    if (t === "talk") { if (!NPCS[o.npc]) return "цель «поговорить»: NPC не найден"; objectives.push({ type: "talk", npc: o.npc, text }); }
    else if (t === "kill" || t === "kill_boss") { if (!ZONE_MOBS[o.mob]) return `нет моба ${o.mob}`;
      if (t === "kill_boss" && !(ZONE_MOBS as any)[o.mob].boss) return `«${(ZONE_MOBS as any)[o.mob].name}» — не босс: для обычного моба выберите тип цели kill`; // kill_boss засчитывается только с боссов
      const conds = validateConds(o.conds); if (typeof conds === "string") return `цель «${text || autoObjText({ type: t, mob: o.mob })}»: ${conds}`; // условия цели (админка «+ условие»)
      const ob: any = t === "kill" ? { type: "kill", mob: o.mob, count: cnt, text } : { type: "kill_boss", mob: o.mob, text };
      if (conds.length) ob.conds = conds;
      objectives.push(ob); }
    else if (t === "gather") { if (!RESOURCES[o.res]) return `нет ресурса ${o.res}`; objectives.push({ type: "gather", res: o.res, count: cnt, text }); }
    else if (t === "collect") { if (o.item ? !ITEM_BY_ID[o.item] : !RESOURCES[o.res]) return "собрать: нужен предмет или ресурс"; objectives.push({ type: "collect", ...(o.item ? { item: o.item } : { res: o.res }), count: cnt, text }); }
    else if (t === "level") { if (cnt > 60) return "уровень до 60"; objectives.push({ type: "level", count: cnt, text }); }
    else if (t === "reach") { if (!["arinar", "hellfire"].includes(o.world)) return "мир: arinar/hellfire"; objectives.push({ type: "reach", world: o.world, text }); }
    // сюжетный квест: особые флаги цели из кода (noAbilities и т.п.) сохраняются, если тип цели тот же
    if (builtin) { const ob = builtin.objectives?.[objectives.length - 1] as any, nw = objectives[objectives.length - 1] as any;
      if (ob && ob.type === nw.type) for (const [k, v] of Object.entries(ob)) if (!["type", "mob", "npc", "res", "item", "world", "count", "text", "conds"].includes(k) && nw[k] === undefined) nw[k] = v; }
  }
  for (const ob of objectives as any[]) if (!ob.text || ob.text === "Цель") ob.text = autoObjText(ob); // пусто — текст по типу цели
  const r = q.rewards || {}, rewards: QuestDef["rewards"] = {};
  const xp = Math.round(Number(r.xp) || 0); if (xp < 0 || xp > 100000) return "опыт 0…100000"; if (xp) rewards.xp = xp;
  if (r.items) { if (!Array.isArray(r.items) || r.items.length > 4 || !r.items.every((i: any) => ITEM_BY_ID[i])) return "награда: до 4 существующих предметов"; if (r.items.length) rewards.items = r.items.map(String); }
  if (r.stars != null) {
    if (typeof r.stars !== "object" || Array.isArray(r.stars)) return "звёзды: объект цвет → число";
    const stars: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.stars)) { const n = Math.round(Number(v)); if (!(STAR_COLORS as readonly string[]).includes(k) || !(n >= 0 && n <= 5)) return `звёзды ${k}: 0…5`; if (n) stars[k] = n; }
    if (Object.keys(stars).length) rewards.stars = stars;
  }
  if (r.res) {
    if (typeof r.res !== "object" || Object.keys(r.res).length > 6) return "награда: до 6 ресурсов";
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.res)) { const n = Math.round(Number(v)); if (!RESOURCES[k] || !(n >= 1 && n <= 999)) return `ресурс ${k}: 1…999`; res[k] = n; }
    if (Object.keys(res).length) rewards.res = res;
  }
  if (r.blkFix != null && r.blkFix !== "" && Number(r.blkFix) !== 0) { const n = Math.round(Number(r.blkFix) * 10) / 10; if (!(n > 0 && n <= 100)) return "починка очернения: 0…100 %"; (rewards as any).blkFix = n; } // Чёрный маг: очищение надетых вещей
  // сундуки за квест: свой список (ярус, сколько, уровень, чары, проклятость, шанс улучшения); пусто — по типу квеста
  { const e = bcSpecErr(r.ch); if (e) return e; const ch = bcSpecNorm(r.ch); if (ch.length) rewards.ch = ch; }
  if (r.chOff === true || r.chOff === "1") rewards.chOff = true;
  // награды веток диалога: ключ выбора → что заменить (пустые поля — основная награда)
  if (r.alt != null) {
    if (typeof r.alt !== "object" || Array.isArray(r.alt)) return "награды веток: объект";
    const ks = Object.keys(r.alt); if (ks.length > 8) return "веток с наградой не больше 8";
    const alt: Record<string, any> = {};
    for (const k of ks) { const v = r.alt[k] || {}, w = `ветка «${STR(v.name, 40) || k}»`, o: any = {};
      if (!/^[a-z0-9_]{1,24}$/.test(k)) return `${w}: ключ — латиница/цифры/_ (до 24)`;
      if (v.name) o.name = STR(v.name, 40).trim();
      if (v.xp != null && v.xp !== "") { const n = Math.round(Number(v.xp)); if (!(n >= 0 && n <= 100000)) return `${w}: опыт 0…100000`; o.xp = n; }
      if (v.items?.length) { if (!Array.isArray(v.items) || v.items.length > 4 || !v.items.every((i: any) => ITEM_BY_ID[i])) return `${w}: до 4 существующих предметов`; o.items = v.items.map(String); }
      if (v.res && Object.keys(v.res).length) { if (typeof v.res !== "object" || Object.keys(v.res).length > 6) return `${w}: до 6 ресурсов`; o.res = {};
        for (const [rk, rv] of Object.entries(v.res)) { const n = Math.round(Number(rv)); if (!RESOURCES[rk] || !(n >= 1 && n <= 999)) return `${w}: ресурс ${rk} 1…999`; o.res[rk] = n; } }
      if (v.ch?.length) { const e = bcSpecErr(v.ch); if (e) return `${w}: ${e}`; o.ch = bcSpecNorm(v.ch); }
      alt[k] = o; }
    if (Object.keys(alt).length) rewards.alt = alt;
  }
  if (builtin && (builtin.rewards as any)?.flag) (rewards as any).flag = (builtin.rewards as any).flag; // сюжетный флаг награды — не редактируется
  const lines = (v: any, n: number) => (Array.isArray(v) ? v : [v]).map((x) => STR(x, 400).trim()).filter(Boolean).slice(0, n);
  const offer = lines(q.offer, 6), done = lines(q.done, 6);
  if (!offer.length || !done.length) return "нужны окна пояснения и сдачи";
  // повторяемый (день/неделя — сброс доски), открытие после ВЕТКИ другого квеста, карточка главы
  const repeat = q.repeat === "daily" || q.repeat === "weekly" ? q.repeat : undefined;
  if (q.repeat && !repeat && q.repeat !== "none") return "повтор: daily / weekly / пусто";
  if (repeat && (builtin?.auto || q.auto)) return "авто-квест (пролог) нельзя сделать повторяемым";
  if (q.reqBranch != null && !Array.isArray(q.reqBranch)) return "условие ветки: список";
  const reqBranch: { q: string; k: string }[] = [];
  for (const b of (q.reqBranch || []).slice(0, 4)) { const bq = String(b?.q || ""), k = String(b?.k || "");
    if (!bq && !k) continue;
    if (bq === id) return "условие ветки: нельзя ссылаться на этот же квест";
    if (!QUEST_BY_ID[bq]) return `условие ветки: нет квеста ${bq}`;
    if (!/^[a-z0-9_]{1,24}$/.test(k)) return `условие ветки: выберите вариант выбора в «${QUEST_BY_ID[bq].title}»`;
    reqBranch.push({ q: bq, k }); }
  const cd = q.card || {}, card = cd.on === true || cd.on === "1" ? { on: true, t: STR(cd.t, 60).trim() || undefined, s: STR(cd.s, 90).trim() || undefined } : undefined;
  return { id, npc: q.npc, turnin: q.turnin || undefined, campaign: "custom", custom: true, title, chapter: STR(q.chapter, 80) || builtin?.chapter || "Поручения", minLevel, requires,
    ...(repeat ? { repeat } : {}), ...(reqBranch.length ? { reqBranch } : {}), ...(card ? { card } : {}),
    objectives, rewards, offer, progress: STR(q.progress, 300) || "…", done, lore: STR(q.lore, 2000) || undefined, hint: STR(q.hint, 200) || undefined,
    track: q.track === false || q.track === "0" ? false : true }; // отслеживание целей (мобы на карте + компас)
}

const DRAFT = "draft:";
const draftIdOk = (id: string) => /^c_[a-z0-9_]{1,40}$/.test(id) || !!questOriginal(id);
/** окно черновика: мягкая чистка (пустой текст можно — допишется позже), полная проверка — при публикации */
function draftWin(w: any): any | string {
  if (!w || typeof w !== "object" || Array.isArray(w)) return "пустое окно";
  const S = (v: any, n: number) => String(v ?? "").slice(0, n);
  const o: any = { who: S(w.who, 32) || "hero", emo: S(w.emo, 16) || "calm", text: S(w.text, VN_LIMITS.text) };
  if (w.id) o.id = S(w.id, 24); if (w.go) o.go = S(w.go, 24);
  if (Array.isArray(w.ch) && w.ch.length) o.ch = w.ch.slice(0, VN_LIMITS.choices).map((c: any) => ({ t: S(c?.t, 80), ...(c?.go ? { go: S(c.go, 24) } : {}), ...(c?.k ? { k: S(c.k, 24) } : {}) }));
  return o;
}
/** ветки ↔ награды: у каждой награды ветки есть выбор с этим ключом; «открывается после ветки» ссылается на существующий выбор */
export function questBranchErr(q: QuestDef, d: QuestDialogue | null | undefined): string | null {
  const keys = dialogueKeys(d);
  for (const k of Object.keys(q.rewards.alt || {})) if (!keys.includes(k)) return `награда ветки «${q.rewards.alt![k].name || k}»: в диалоге нет варианта выбора с ключом «${k}»`;
  for (const b of q.reqBranch || []) { const bq = QUEST_BY_ID[b.q]; if (!bq) continue;
    const ks = [...dialogueKeys(QUEST_DIALOGUES[b.q]), ...Object.keys(bq.rewards.alt || {})];
    if (!ks.includes(b.k)) return `условие ветки: в «${bq.title}» нет выбора с ключом «${b.k}»`; }
  return null;
}

/** черты (RPG Maker MZ-подобные эффекты) при попадании игрока: оружие + надетые предметы + навык */
export function traitsFor(wt: string | null, itemIds: string[], skill?: string): Trait[] {
  const out: Trait[] = [];
  if (wt && TRAITS.weapon[wt]) out.push(...TRAITS.weapon[wt]);
  for (const id of itemIds) if (TRAITS.item[id]) out.push(...TRAITS.item[id]);
  if (skill && TRAITS.skill[skill]) out.push(...TRAITS.skill[skill]);
  return out;
}
export function applyTraits(traits: Trait[], real: number, rand: () => number, fx: {
  dot: (kind: string, dps: number, dur: number) => void; slow: () => void; knock: (p: number) => void; freeze: (ms: number) => void; heal: (hp: number) => void }) {
  for (const t of traits) {
    if (rand() * 100 >= (t.chance ?? 100)) continue;
    if (t.k === "burn" || t.k === "bleed" || t.k === "poison") fx.dot(t.k, (real * t.dpsPct) / 100, t.dur);
    else if (t.k === "slow") fx.slow();
    else if (t.k === "knock") fx.knock(t.power);
    else if (t.k === "freeze") fx.freeze(t.dur * 1000);
    else if (t.k === "lifesteal") fx.heal((real * t.pct) / 100);
  }
}

const UPSERT = (db: any, kind: string, id: string, data: any, version: number, by: string) => db.prepare("INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
  .bind(kind, id, JSON.stringify(data), version, by, Date.now());
const DEL = (db: any, kind: string, id: string) => db.prepare("DELETE FROM game_overrides WHERE kind = ? AND id = ?").bind(kind, id);
/** все строки разделов сущности: id «<id>@…» (substr, а не LIKE: «_» в id — подстановочный знак LIKE) */
const DEL_SECS = (db: any, kind: string, id: string) => db.prepare("DELETE FROM game_overrides WHERE kind = ? AND substr(id, 1, ?) = ?").bind(kind, id.length + 1, id + SEC_SEP);
/** основная строка + строки разделов (по id, чтобы порядок не зависел от БД) → один патч */
function mergeEntity(legacy: any, secs: [string, any][]) {
  const out: any = { ...(legacy || {}) };
  for (const [, d] of [...secs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) Object.assign(out, d);
  return out;
}
/** строки game_overrides → «kind:id» → слитый патч (строки разделов «id@раздел» поверх основной) */
export function mergeRows(rows: { kind: string; id: string; data: string }[]): Map<string, any> {
  const g = new Map<string, { legacy: any; secs: [string, any][] }>();
  for (const r of rows) {
    let d: any; try { d = JSON.parse(r.data); } catch { console.warn(`[admin] ${r.kind}:${r.id}: неверный JSON — пропуск`); continue; }
    const [base] = splitRowId(String(r.id)), key = r.kind + ":" + base;
    const e = g.get(key) || { legacy: undefined, secs: [] }; g.set(key, e);
    if (base === r.id) e.legacy = d; else if (d && typeof d === "object" && !Array.isArray(d)) e.secs.push([r.id, d]);
  }
  const out = new Map<string, any>();
  for (const [k, e] of g) out.set(k, e.secs.length ? mergeEntity(e.legacy, e.secs) : e.legacy);
  return out;
}

export class AdminStore {
  db: any; ver = -1; checkedAt = 0; loading: Promise<void> | null = null;
  /** правка применилась (своя или подхваченная по версии) — разослать онлайн-игрокам */
  onChange?: () => void;
  touched = new Set<string>(); // kind:id всех когда-либо изменённых сущностей (чтобы сброс тоже дошёл до клиентов)
  /** свои строки game_overrides у копий трофеев вариантов (variantCopy.ts): копия без строки наследует правку базы */
  copyOwn = new Map<string, any>();
  /** копии трофеев: унаследованное от ДЕЙСТВУЮЩЕЙ базы + своя строка поверх (своя правка важнее). Пересчёт — после
   *  загрузки правок и после каждой правки предмета (правка базы сразу меняет наследующие копии). В D1 не пишет. */
  applyCopies() {
    const ids = copyIds();
    for (const id of ids) applyOverride("item", id, null); // исходные копии (уровень варианта), кривые соседей копии не учитывают
    const der = ids.map((id) => [id, copyPatch(id)] as const);
    for (const [id, d] of der) { if (!d) continue; const own = this.copyOwn.get(id); applyOverride("item", id, own ? { ...d, ...own } : d); this.touched.add("item:" + id); }
  }
  /** копии, чьи значения изменились после правки предмета (для живого обновления списка в админке) */
  private copyDiff(before: Record<string, string>, also?: string) {
    const out: { id: string; values: any; inh: boolean; lvl: number }[] = [];
    for (const id of copyIds()) { const v = currentValues("item", id), j = JSON.stringify(v);
      if (j !== before[id] || id === also) out.push({ id, values: v, inh: !this.copyOwn.has(id), lvl: Math.max(1, v.req || 1, v.lvl || 1) }); }
    return out;
  }
  private copySnap() { return Object.fromEntries(copyIds().map((id) => [id, JSON.stringify(currentValues("item", id))])); }
  constructor(db: any) { this.db = db; }
  /** перечитать правки, если версия набора в D1 изменилась (раз в 10 с; комнаты/воркеры — горячая перезагрузка) */
  async sync(force = false) {
    if (!this.db) return;
    const now = Date.now(); if (!force && now - this.checkedAt < 10000) return;
    this.checkedAt = now;
    this.loading = this.loading || (async () => {
      try {
        const v = await this.db.prepare("SELECT v FROM game_config_version WHERE k = 'overrides'").first();
        const ver = Number(v?.v ?? 0); if (!force && ver === this.ver) return;
        const rows = (await this.db.prepare("SELECT kind, id, data FROM game_overrides WHERE substr(kind, 1, 4) <> 'bmc_'").all()).results || [];
        for (const k of KINDS) for (const id of Object.keys(TABLES[k])) applyOverride(k, id, null);
        this.copyOwn.clear();
        // строки разделов («main@_h_kill») сливаются с основной строкой сущности: сначала основная, затем разделы
        // 🛠 навыки конструктора — первыми: детали оружия/мобы ссылаются на свои «skx_…»
        const merged = [...mergeRows(rows)].sort((a: any, b: any) => (String(b[0]).startsWith("skdef:") ? 1 : 0) - (String(a[0]).startsWith("skdef:") ? 1 : 0));
        for (const [key, raw0] of merged) { const i = key.indexOf(":"), kind = key.slice(0, i) as Kind, id = key.slice(i + 1); this.touched.add(key); let raw = raw0;
          if (kind === "bchest") { const mg = migrateBchestPatch(raw); raw = mg.patch; if (mg.changed.length) console.warn(`[admin] bchest:${id} миграция шанса ☠ сундуков: ${mg.changed.join(", ")}`); } // потолок 30 %, прежние значения по умолчанию → новые
          const p = validatePatch(kind, id, raw); if (typeof p === "string") { console.warn(`[admin] ${key}: правка пропущена — ${p}`); continue; }
          if (kind === "item" && isCopy(id)) this.copyOwn.set(id, p); else applyOverride(kind, id, p); } // копия: своя строка поверх наследованного (applyCopies)
        this.applyCopies();
        const qs = (await this.db.prepare("SELECT data FROM custom_quests WHERE enabled = 1").all()).results || [];
        // сюжетные квесты: сначала вернуть исходные, затем наложить правки (строки custom_quests с id сюжетного квеста)
        for (const q of QUESTS) if (!q.custom) applyBuiltinOverride(q.id, null);
        const custom: QuestDef[] = [];
        for (const r of qs as any[]) {
          const raw = JSON.parse(r.data), orig = questOriginal(String(raw?.id));
          if (orig) { const v = validateQuest(raw, orig); if (typeof v !== "string") applyBuiltinOverride(orig.id, v); }
          else { const v = validateQuest(raw); if (typeof v !== "string") custom.push(v); }
        }
        setCustomQuests(custom);
        // диалоги-новеллы квестов (таблица может отсутствовать до миграции 0013 — тогда без диалогов)
        try { const dl = (await this.db.prepare("SELECT quest_id, data FROM quest_dialogues").all()).results || []; const map: Record<string, QuestDialogue> = {};
          for (const r of dl as any[]) { const v = validateDialogue(JSON.parse(r.data)); if (typeof v !== "string" && QUEST_BY_ID[r.quest_id]) map[r.quest_id] = v; }
          setQuestDialogues(map); } catch (e: any) { console.error("[mc] dialogues", e?.message || e); }
        const first = this.ver === -1; this.ver = ver;
        if (!first) this.onChange?.();
      } catch (e: any) { console.error("[mc] admin sync", e?.message || e); }
      finally { this.loading = null; }
    })();
    await this.loading;
  }
  private async bump(by: string, kind: string, target: string, before: any, after: any, version: number) {
    await this.db.batch([
      this.db.prepare("INSERT INTO game_override_audit (kind, target_id, before, after, version, granted_by, at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(kind, target, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), version, by, Date.now()),
      this.db.prepare("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides'"),
    ]);
    this.ver++; // своё изменение уже применено в памяти
    if (kind !== "quest" && kind !== "dialogue") this.touched.add(kind + ":" + splitRowId(target)[0]); // строка раздела → сама сущность
    this.onChange?.();
  }
  async save(by: string, kind: Kind, id: string, patch: any): Promise<{ ok: boolean; err?: string; values?: any; version?: number }> {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!KINDS.includes(kind) || !ID_RE.test(id)) return { ok: false, err: "неверная сущность" };
    if (kind === "item" && /^art_/.test(id)) return { ok: false, err: "Созданный артефакт игрока — неизменяемый слепок: не правится и не пересчитывается" };
    const clean = validatePatch(kind, id, patch); if (typeof clean === "string") return { ok: false, err: clean };
    const before = currentValues(kind, id), snap = kind === "item" ? this.copySnap() : null;
    const row = await this.db.prepare("SELECT version FROM game_overrides WHERE kind = ? AND id = ?").bind(kind, id).first();
    const version = Number(row?.version || 0) + 1;
    // полная правка (прежний admin_save: плейтесты, доска/дроп) заменяет и строки разделов этой сущности
    await this.db.batch([UPSERT(this.db, kind, id, clean, version, by), ...(id.includes(SEC_SEP) ? [] : [DEL_SECS(this.db, kind, id)])]);
    if (kind === "item" && isCopy(id)) this.copyOwn.set(id, clean); else applyOverride(kind, id, clean);
    if (kind === "item") this.applyCopies();
    const values = currentValues(kind, id);
    await this.bump(by, kind, id, before, values, version);
    return { ok: true, values, version, ...(snap ? { copies: this.copyDiff(snap, isCopy(id) ? id : undefined) } : {}) };
  }
  /** сохранить ОДИН раздел формы: delta — только изменённые поля этого раздела (null — убрать правку поля, будет значение из кода).
   *  Раздел хранится своей строкой (kind, "<id>@<раздел>"); поля раздела, лежавшие в старой общей строке, переносятся в неё. */
  async saveSection(by: string, kind: Kind, id: string, sec: string, delta: any): Promise<{ ok: boolean; err?: string; values?: any; version?: number; sec?: string; changed?: string[] }> {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!KINDS.includes(kind) || !ID_RE.test(id) || !TABLES[kind]?.[id]) return { ok: false, err: "неверная сущность" };
    if (!sectionable(kind)) return { ok: false, err: "этот раздел сохраняется целиком" };
    if (!sectionIds(kind).includes(sec)) return { ok: false, err: "нет такого раздела" };
    if (!delta || typeof delta !== "object" || Array.isArray(delta)) return { ok: false, err: "пустой патч" };
    const map = sectionMap(kind), keys = Object.keys(delta);
    if (!keys.length) return { ok: false, err: "нет изменений" };
    for (const k of keys) if (map[k] !== sec) return { ok: false, err: `поле ${k} не из этого раздела` };
    const rows = ((await this.db.prepare("SELECT id, data, version FROM game_overrides WHERE kind = ? AND (id = ? OR substr(id, 1, ?) = ?)").bind(kind, id, id.length + 1, id + SEC_SEP).all()).results || []) as any[];
    const byId = new Map<string, any>(rows.map((r) => [r.id, r]));
    // устаревшие поля (их нет в схеме — applyOverride их и так пропускает) выбрасываются, иначе проверка отклонила бы всю правку
    const parse = (r: any) => { try { const o = r ? JSON.parse(r.data) : {}; return o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => k in map)) : {}; } catch { return {}; } };
    const rawKeys = (r: any) => { try { return Object.keys(JSON.parse(r.data) || {}).length; } catch { return -1; } };
    const legacy = parse(byId.get(id)), rid = secRowId(id, sec), own = sec === SEC_MAIN ? {} : parse(byId.get(rid));
    // данные раздела = (поля раздела из общей строки) + (своя строка) + изменения; null — убрать
    const secData: any = {};
    for (const [k, v] of Object.entries(legacy)) if (map[k] === sec) secData[k] = v;
    Object.assign(secData, own);
    for (const [k, v] of Object.entries(delta)) { if (v === null) delete secData[k]; else secData[k] = v; }
    const cleanSec = Object.keys(secData).length ? validatePatch(kind, id, secData) : {};
    if (typeof cleanSec === "string") return { ok: false, err: cleanSec };
    const legacyRest: any = {}; for (const [k, v] of Object.entries(legacy)) if (map[k] !== sec) legacyRest[k] = v;
    // итог сущности = все строки (с новой строкой раздела) — проверяется целиком, как при загрузке
    const others: [string, any][] = rows.filter((r) => r.id !== id && r.id !== rid).map((r) => [r.id, parse(r)]);
    const merged = mergeEntity(sec === SEC_MAIN ? { ...legacyRest, ...cleanSec } : legacyRest, [...others, ...(sec === SEC_MAIN ? [] : [[rid, cleanSec] as [string, any]])]);
    const full = validatePatch(kind, id, merged); if (typeof full === "string") return { ok: false, err: full };
    const before = currentValues(kind, id), version = Number(byId.get(rid)?.version || 0) + 1, empty = (o: any) => !Object.keys(o).length;
    const st: any[] = [];
    if (sec === SEC_MAIN) { const L = { ...legacyRest, ...cleanSec }; st.push(empty(L) ? DEL(this.db, kind, id) : UPSERT(this.db, kind, id, L, version, by)); }
    else {
      st.push(empty(cleanSec) ? DEL(this.db, kind, rid) : UPSERT(this.db, kind, rid, cleanSec, version, by));
      if (byId.has(id) && (Object.keys(legacyRest).length !== Object.keys(legacy).length || Object.keys(legacy).length !== rawKeys(byId.get(id)))) st.push(empty(legacyRest) ? DEL(this.db, kind, id) : UPSERT(this.db, kind, id, legacyRest, Number(byId.get(id).version || 0) + 1, by)); // перенос полей раздела из общей строки
    }
    const snap = kind === "item" ? this.copySnap() : null;
    await this.db.batch(st);
    // копия трофея: строки копии — «своя правка» поверх наследованного от базы; правка любого предмета пересчитывает копии
    if (kind === "item" && isCopy(id)) this.copyOwn.set(id, full); else applyOverride(kind, id, full);
    if (kind === "item") this.applyCopies();
    const values = currentValues(kind, id), pick = (o: any) => o && Object.fromEntries(Object.entries(o).filter(([k]) => (map[k] ?? SEC_MAIN) === sec));
    await this.bump(by, kind, rid, pick(before), pick(values), version);
    return { ok: true, values, version, sec, changed: keys, ...(snap ? { copies: this.copyDiff(snap, isCopy(id) ? id : undefined) } : {}) };
  }
  // ---- черновики конструктора чёрной магии (как в Obsidian: автосохранение, «Опубликовать» — обычная правка) ----
  // строки game_overrides kind «bmc_*» (bmc_draft — детали оружия, bmc_mdraft — мобы): в игру не идут (sync их пропускает), версию не трогают
  async bmcList(kind: string): Promise<{ id: string; data: any; at: number; by: string }[]> {
    if (!this.db || !/^bmc_[a-z]{2,12}$/.test(kind)) return [];
    const rows = (await this.db.prepare("SELECT id, data, updated_at, updated_by FROM game_overrides WHERE kind = ? ORDER BY updated_at DESC LIMIT 300").bind(kind).all()).results || [];
    return rows.map((r: any) => { let d: any = null; try { d = JSON.parse(r.data); } catch {} return { id: String(r.id), data: d, at: Number(r.updated_at) || 0, by: String(r.updated_by || "") }; });
  }
  async bmcSave(by: string, kind: string, id: string, data: any) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!/^bmc_[a-z]{2,12}$/.test(kind) || !ID_RE.test(id)) return { ok: false, err: "неверный черновик" };
    const j = JSON.stringify(data ?? null); if (j.length > 16000) return { ok: false, err: "черновик слишком большой" };
    await UPSERT(this.db, kind, id, data, 0, by).run();
    return { ok: true, at: Date.now() };
  }
  async bmcDel(kind: string, id: string) {
    if (!this.db || !/^bmc_[a-z]{2,12}$/.test(kind)) return { ok: false };
    await DEL(this.db, kind, id).run(); return { ok: true };
  }
  async reset(by: string, kind: Kind, id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!KINDS.includes(kind) || !TABLES[kind][id]) return { ok: false, err: "неверная сущность" };
    const before = currentValues(kind, id), snap = kind === "item" ? this.copySnap() : null;
    await this.db.batch([this.db.prepare("DELETE FROM game_overrides WHERE kind = ? AND id = ?").bind(kind, id), DEL_SECS(this.db, kind, id)]); // и все разделы
    applyOverride(kind, id, null);
    if (kind === "item") { this.copyOwn.delete(id); this.applyCopies(); } // копия без строки снова наследует базу
    const values = currentValues(kind, id);
    await this.bump(by, kind, id, before, values, 0);
    return { ok: true, values, deleted: !TABLES[kind][id] || undefined, ...(snap ? { copies: this.copyDiff(snap, isCopy(id) ? id : undefined) } : {}) }; // своё задание доски при сбросе удаляется целиком
  }
  async saveQuest(by: string, raw: any) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    // единый поток (админка): квест + диалог одной кнопкой. Тексты окон пояснения/«в процессе»/сдачи → старые реплики
    // offer/progress/done квеста (их читают трекер, Книга, «Все квесты»), окна — в quest_dialogues.
    let dlg: any = undefined;
    if (raw && raw.dialogue !== undefined) {
      const d = validateDialogue(raw.dialogue); if (typeof d === "string") return { ok: false, err: d };
      dlg = d; raw = { ...raw };
      if (d.offer.length) raw.offer = d.offer.map((w) => w.text);
      if (d.done.length) raw.done = d.done.map((w) => w.text);
      raw.progress = d.progress?.text || raw.progress;
      if (!d.offer.length) return { ok: false, err: "нужно хотя бы одно окно пояснения" };
      if (!d.done.length) return { ok: false, err: "нужно хотя бы одно окно сдачи" };
      delete raw.dialogue;
    }
    const orig = questOriginal(String(raw?.id || ""));
    const q = validateQuest(raw, orig); if (typeof q === "string") return { ok: false, err: q };
    { const e = questBranchErr(q, dlg !== undefined ? dlg : QUEST_DIALOGUES[q.id]); if (e) return { ok: false, err: e }; }
    const before = QUEST_BY_ID[q.id] ? JSON.parse(JSON.stringify(QUEST_BY_ID[q.id])) : null;
    const row = await this.db.prepare("SELECT version FROM custom_quests WHERE id = ?").bind(q.id).first();
    const version = Number(row?.version || 0) + 1;
    await this.db.prepare("INSERT INTO custom_quests (id, data, enabled, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, enabled = 1, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(q.id, JSON.stringify(q), version, by, Date.now()).run();
    if (orig) applyBuiltinOverride(q.id, q); else setCustomQuests([...QUESTS.filter((x) => x.custom && x.id !== q.id), q]);
    await this.bump(by, "quest", q.id, before, q, version);
    let dialogue: any = undefined;
    if (dlg) { const r = await this.saveDialogue(by, q.id, dlg); if (!r.ok) return { ok: false, err: r.err }; dialogue = r.dialogue; }
    return { ok: true, quest: orig ? { ...QUEST_BY_ID[q.id] } : q, builtin: !!orig, version, ...(dlg ? { dialogue, questId: q.id, withDialogue: true } : {}) };
  }
  // ── черновики квестов (большие сюжетные диалоги собираются по окну): строка custom_quests id «draft:<id квеста>», enabled = 2
  // (живые квесты грузятся только с enabled = 1 — черновик игроку не виден); опубликован/удалён — enabled = 3. Новой таблицы не нужно.
  async draftGet(id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!draftIdOk(id)) return { ok: false, err: "id квеста: c_ + латиница/цифры/_ или сюжетный квест" };
    const row: any = await this.db.prepare("SELECT data, version, updated_at FROM custom_quests WHERE id = ? AND enabled = 2").bind(DRAFT + id).first();
    return { ok: true, id, draft: row ? JSON.parse(row.data) : null, version: Number(row?.version || 0), at: Number(row?.updated_at || 0) };
  }
  async draftList() {
    if (!this.db) return [];
    const r = (await this.db.prepare("SELECT id, version, updated_at FROM custom_quests WHERE enabled = 2 AND id LIKE 'draft:%'").all()).results || [];
    return (r as any[]).map((x) => ({ id: String(x.id).slice(DRAFT.length), version: Number(x.version), at: Number(x.updated_at) }));
  }
  /** сохранить часть черновика: поля квеста (meta), отдельные окна (wins: фаза, номер, окно), длины фаз (len) — без проверки целостности */
  async draftSave(by: string, m: any) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    const id = String(m?.id || ""); if (!draftIdOk(id)) return { ok: false, err: "id квеста: c_ + латиница/цифры/_ или сюжетный квест" };
    const row: any = await this.db.prepare("SELECT data, version FROM custom_quests WHERE id = ? AND enabled = 2").bind(DRAFT + id).first();
    const d: any = row ? JSON.parse(row.data) : { q: { id }, d: { offer: [], done: [] } };
    if (m.meta && typeof m.meta === "object") { const { dialogue, ...rest } = m.meta; d.q = { ...rest, id }; }
    for (const ph of ["offer", "done"] as const) if (!Array.isArray(d.d[ph])) d.d[ph] = [];
    for (const x of Array.isArray(m.wins) ? m.wins.slice(0, 60) : []) {
      const ph = x?.ph === "done" ? "done" : x?.ph === "offer" ? "offer" : null, i = Math.round(Number(x?.i));
      if (!ph || !(i >= 0 && i < VN_LIMITS.windows)) return { ok: false, err: "окно: фаза offer/done и номер 0…" + (VN_LIMITS.windows - 1) };
      const w = draftWin(x.w); if (typeof w === "string") return { ok: false, err: `окно ${i + 1}: ${w}` };
      while (d.d[ph].length < i) d.d[ph].push({ who: "hero", emo: "calm", text: "" });
      d.d[ph][i] = w;
    }
    for (const ph of ["accept", "progress"] as const) if (m[ph] !== undefined) { const w = m[ph] ? draftWin(m[ph]) : null; if (typeof w === "string") return { ok: false, err: w }; d.d[ph] = w; }
    if (m.len) for (const ph of ["offer", "done"] as const) { const n = Math.round(Number(m.len[ph])); if (n >= 0 && n <= VN_LIMITS.windows) d.d[ph].length = Math.min(d.d[ph].length, n); }
    const data = JSON.stringify(d); if (data.length > 600000) return { ok: false, err: "черновик слишком большой" };
    const version = Number(row?.version || 0) + 1;
    await this.db.prepare("INSERT INTO custom_quests (id, data, enabled, version, updated_by, updated_at) VALUES (?, ?, 2, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, enabled = 2, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(DRAFT + id, data, version, by, Date.now()).run();
    return { ok: true, id, version, len: { offer: d.d.offer.length, done: d.d.done.length } };
  }
  /** опубликовать черновик: полная проверка (квест, диалог, ветки, награды) → обычное сохранение квеста и диалога */
  async draftPublish(by: string, id: string) {
    const g: any = await this.draftGet(id); if (!g.ok) return g; if (!g.draft) return { ok: false, err: "черновика нет" };
    const r: any = await this.saveQuest(by, { ...g.draft.q, id, dialogue: g.draft.d });
    if (!r.ok) return { ...r, err: "не опубликовано: " + r.err };
    await this.db!.prepare("UPDATE custom_quests SET enabled = 3, updated_by = ?, updated_at = ? WHERE id = ?").bind(by, Date.now(), DRAFT + id).run();
    return { ...r, published: true };
  }
  async draftDiscard(by: string, id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!draftIdOk(id)) return { ok: false, err: "нет такого черновика" };
    await this.db.prepare("UPDATE custom_quests SET enabled = 3, updated_by = ?, updated_at = ? WHERE id = ? AND enabled = 2").bind(by, Date.now(), DRAFT + id).run();
    return { ok: true, id, discarded: true };
  }
  /** сюжетный квест: удалить правку — вернуть значения из кода */
  async resetQuest(by: string, id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!questOriginal(id)) return { ok: false, err: "это не сюжетный квест" };
    const before = JSON.parse(JSON.stringify(QUEST_BY_ID[id]));
    await this.db.prepare("DELETE FROM custom_quests WHERE id = ?").bind(id).run();
    applyBuiltinOverride(id, null);
    await this.bump(by, "quest", id, before, QUEST_BY_ID[id], 0);
    return { ok: true, quest: { ...QUEST_BY_ID[id] }, builtin: true };
  }
  async deleteQuest(by: string, id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    const q = QUEST_BY_ID[id]; if (!q || !q.custom) return { ok: false, err: "можно удалить только квест панели" };
    await this.db.prepare("UPDATE custom_quests SET enabled = 0, updated_by = ?, updated_at = ? WHERE id = ?").bind(by, Date.now(), id).run();
    setCustomQuests(QUESTS.filter((x) => x.custom && x.id !== id));
    await this.bump(by, "quest", id, q, null, 0);
    return { ok: true };
  }
  /** диалог-новелла квеста: пустой (без окон) — удалить строку (квест вернётся к обычным репликам) */
  async saveDialogue(by: string, questId: any, raw: any) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    const id = String(questId || ""); if (!ID_RE.test(id) || !QUEST_BY_ID[id]) return { ok: false, err: "квест не найден" };
    const d = validateDialogue(raw); if (typeof d === "string") return { ok: false, err: d };
    const before = QUEST_DIALOGUES[id] || null;
    const empty = dialogueEmpty(d);
    const row = await this.db.prepare("SELECT version FROM quest_dialogues WHERE quest_id = ?").bind(id).first();
    const version = empty ? 0 : Number(row?.version || 0) + 1;
    if (empty) await this.db.prepare("DELETE FROM quest_dialogues WHERE quest_id = ?").bind(id).run();
    else await this.db.prepare("INSERT INTO quest_dialogues (quest_id, data, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(quest_id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(id, JSON.stringify(d), version, by, Date.now()).run();
    if (empty) delete QUEST_DIALOGUES[id]; else QUEST_DIALOGUES[id] = d;
    await this.bump(by, "dialogue", id, before, empty ? null : d, version);
    return { ok: true, questId: id, dialogue: empty ? null : d, version };
  }
  /** публичные значения изменённых сущностей для клиентов (оружие/навыки/мобы; предметы — через карточки) */
  clientPatches() {
    const out: { kind: string; id: string; values: any }[] = [];
    for (const k of this.touched) { const [kind, id] = k.split(":"); if (kind === "weapon" || kind === "skill" || kind === "mob") out.push({ kind, id, values: currentValues(kind as Kind, id) }); }
    return out;
  }
  touchedItems() { return [...this.touched].filter((k) => k.startsWith("item:")).map((k) => k.slice(5)); }
  async audit(limit = 50) {
    if (!this.db) return [];
    const r = await this.db.prepare("SELECT aid, kind, target_id, before, after, version, granted_by, at FROM game_override_audit ORDER BY aid DESC LIMIT ?").bind(Math.max(1, Math.min(200, limit))).all();
    return (r.results || []).map((x: any) => ({ ...x, by: String(x.granted_by).replace(/^uid:(.{4}).*/, "uid:$1…") }));
  }
  /** всё для панели: схема, черты, сущности с текущими значениями, квесты, справочники */
  catalog() {
    const ent: Record<string, any[]> = {};
    // уровень в строке списка: моб — lvl; предмет/оружие — требуемый уровень надевания itemReq = max(req, lvl);
    // навык — unlockLevel; таблица дропа — уровень моба-владельца
    const lvlOf = (k: string, id: string, o: any) => k === "btask" ? o.minLvl : k === "mob" ? o.lvl : k === "item" ? itemReq(o) : k === "skill" ? o.unlockLevel : k === "loot" || k === "boss" || k === "rare" ? (ZONE_MOBS as any)[id]?.lvl : undefined;
    for (const k of KINDS) ent[k] = Object.entries(TABLES[k]).filter(([eid, o]: [string, any]) => !(k === "item" && o?.bm) && !((k === "mob" || k === "loot" || k === "boss" || k === "rare") && (ZONE_MOBS as any)[eid]?.black)).map(([id, o]: [string, any]) => ({ id, name: (k === "loot" || k === "boss" || k === "rare" ? (ZONE_MOBS as any)[id]?.name : k === "spawn" ? "Аринар: лагеря и бродячие мобы" : k === "curse" ? "☠ Проклятие: дроп, вещи, мобы, свечение" : k === "ench" ? "✦ Зачарование: ярусы вещей и мобов, регенерация, дроп, улучшение" : k === "chest" ? "📦 Сундуки: лагерь, таймеры, вклад, отряд, стража" : k === "biome" ? `🧭 ${o.name}${o.sub ? ": " + o.sub : ""}` : k === "dash" ? "🏃 Рывок: перезарядка, неуязвимость, мигание" : k === "gather" ? "⛏ Сбор ресурсов: свечение узлов, личные узлы, восстановление" : k === "npc" ? "🚶 NPC: прогулка вокруг точки появления" : k === "bmage" ? "🌑 Чёрный маг: купола, чёрная магия, очернение, розы" : k === "bmagic" ? "🜏 Чёрная магия: артефакты, крит, заряд, капы" : k === "city" ? "🏰 Альказак: купол, безопасная зона, убийцы, вид, места NPC" : k === "pk" ? "⚔ PK-режим: отсчёт, самооборона, урон" : k === "pos" ? "📍 Вход: позиция между входами" : k === "dn" ? "🌗 День и ночь: время, цвета, огни, форс-время" : k === "upgrade" ? "⚒ Улучшение у Петра: материалы, стоимость, статы" : k === "board" ? "📋 Доска заданий: настройки, опыт, обучение, удобство" : k === "btask" ? o.title : k === "region" ? `${o.name} · ур. ${o.lvl?.[0]}–${o.lvl?.[1]}` : null) || o.name || o.title || id, icon: o.icon || (k === "loot" || k === "boss" || k === "rare" ? (ZONE_MOBS as any)[id]?.icon || "" : ""), lvl: lvlOf(k, id, o), defs: k === "region" ? regionDefs(o) : undefined, slot: o.slot, wtype: o.wtype, part: k === "item" && o.part ? o.part : undefined, partName: k === "item" && o.part ? (TABLES.item[o.part] as any)?.name : undefined, inh: k === "item" && o.part ? !this.copyOwn.has(id) : undefined, cat: k === "btask" ? o.cat : undefined, values: currentValues(k, id), dv: defaultDiff(k, id) }));
    return {
      schema: SCHEMA, traits: TRAIT_DEFS, ent, mobSkills: MOB_SKILLS_LIST,
      quests: QUESTS.map((q) => ({ id: q.id, title: q.title, npc: q.npc, custom: !!q.custom, edited: !!(q as any).edited, requires: q.requires || [], minLevel: q.minLevel, stars: Object.values(q.rewards?.stars || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0), def: q })),
      npcs: Object.entries(NPCS).map(([id, n]) => ({ id, name: n.name, world: n.world })),
      items: Object.entries(ITEM_BY_ID).filter(([, o]: [string, any]) => !o?.bm).map(([id, o]: [string, any]) => ({
        id, name: o.name, icon: o.icon || "", lvl: o.lvl || 1, req: itemReq(o),
        rarity: o.rarity || "common", slot: o.slot || "", stats: { ...(o.stats || {}) },
      })),
      res: Object.entries(RESOURCES).map(([id, o]) => ({ id, name: o.name, icon: o.icon })),
      mobCats: mobCategories(), // категория каждого вида (вкладки админки: мобы / элита / вожаки / редкие / боссы / мировые боссы)
      mobs: Object.entries(ZONE_MOBS).map(([id, o]: [string, any]) => ({ id, name: o.name, lvl: o.lvl, boss: !!o.boss || undefined, base: o.variant ? o.base : undefined, baseName: o.variant ? (ZONE_MOBS as any)[o.base]?.name : undefined, biome: o.variant ? o.biome : undefined, black: o.black ? 1 : undefined })),
      objTypes: OBJ_TYPES, conds: COND_DEFS,
      // задания доски: списки для выбора цели/условий/предусловий (без ввода id руками)
      bt: { evs: BT_EVS, states: BT_STATES, flags: BT_FLAG_NAMES, cats: BT_CATS_NEW.map((id) => ({ id, name: CAT_NAMES[id] })), givers: GIVER_NAMES, npcGivers: NPC_GIVERS, custom: CUSTOM_BT.source,
        roles: BT_ROLE_NAMES, rooms: ROOM_NAMES, worlds: WORLD_NAMES, biomes: Object.fromEntries(Object.values(BIOMES).map((b: any) => [b.id, b.name])),
        heroes: Object.fromEntries(HERO_IDS.map((c) => [c, (HERO_NAMES as any)[c] || c])), recipes: RECIPES.map((r) => ({ id: r.id, name: (ITEM_BY_ID as any)[r.item]?.name || r.id })),
        loot: { bag: "мешок (любой)", item: "вещи из мешков", res: "материалы (любые)", ...Object.fromEntries(Object.entries(RES_ALL).map(([k, o]: [string, any]) => [k, o.name])) } },
      vn: { chars: Object.values(VN_CHARS), emotions: VN_EMOTIONS.map((id) => ({ id, name: VN_EMOTION_NAMES[id] })), limits: VN_LIMITS, dialogues: { ...QUEST_DIALOGUES } },
      totals: { items: Object.values(ITEM_BY_ID).filter((o: any) => !o?.bm).length, weapons: Object.values(ITEM_BY_ID).filter((o: any) => o.slot === "weapon" && !o?.bm).length, res: Object.keys(RESOURCES).length }, // для проверки «ни один предмет не пропал»
    };
  }
  /** каталог для роли: модератор получает только бестиарий/оружие/предметы (без квестов, VN, навыка, дропа, спавна, журнала) */
  catalogFor(scope: "admin" | "moderator") {
    const full = this.catalog();
    if (scope === "admin") return { ...full, scope: "admin" as const };
    const allow = ["mob", "weapon", "item"];
    const ent: Record<string, any[]> = {};
    for (const k of allow) ent[k] = full.ent[k] || [];
    const schema: Record<string, any> = {};
    for (const k of allow) if (full.schema[k]) schema[k] = full.schema[k];
    return {
      scope: "moderator" as const,
      schema, traits: full.traits, ent,
      mobSkills: full.mobSkills, // нужны для выбора навыков в карточке моба
      mobCats: full.mobCats,
      quests: [], npcs: [], items: full.items, res: full.res, mobs: full.mobs, objTypes: [],
      vn: { chars: [], emotions: [], limits: full.vn?.limits || {}, dialogues: {} },
      totals: full.totals,
    };
  }
}

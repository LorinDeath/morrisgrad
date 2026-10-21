import { autoObjText } from "./objText";
// «Проклятые»: админ-панель — сервер. Правки игровых данных (overrides.ts: схема + проверка) и квесты из игры
// хранятся в D1 (миграция 0010): game_overrides, custom_quests, журнал game_override_audit, версия набора
// game_config_version (комнаты сверяют её и перечитывают правки). Писать может серверно проверенный админ (всё) или модератор (только mob/weapon/item) —
// проверка роли в service.ts ДО вызова этих методов. Все запросы к D1 — только с bind (никакой склейки SQL).
import { ZONE_GEN } from "./zoneGen";
import { STAR_COLORS } from "./shared";
import { itemReq } from "./profile";
import { validateConds, COND_DEFS } from "./questConds";
import { validatePatch, applyOverride, currentValues, SCHEMA, TABLES, TRAIT_DEFS, TRAITS, type Kind, type Trait } from "./overrides";
import { QUESTS, QUEST_BY_ID, setCustomQuests, applyBuiltinOverride, questOriginal, type QuestDef, type Objective } from "./quests";
import { NPCS, RESOURCES } from "./shared";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { MOB_SKILLS_LIST } from "./mobSkills";
import { validateDialogue, dialogueEmpty, setQuestDialogues, QUEST_DIALOGUES, VN_CHARS, VN_EMOTIONS, VN_EMOTION_NAMES, VN_LIMITS, type QuestDialogue } from "./vnChars";

/** «Спавн» → локация: что будет, если поле пустое (как в коде) — подсказка вместо «—» */
function regionDefs(r: any) {
  const pk = (r.table || []).map((t: any) => t.pack).filter(Boolean), G: any = ZONE_GEN;
  return { dens: "1", "packs.0": "2", "packs.1": `3 (в ${Math.round(G.campPacks3 * 100)}% лагерей)`, "pack.0": pk.length ? String(Math.min(...pk.map((p: any) => p[0]))) : "—", "pack.1": pk.length ? String(Math.max(...pk.map((p: any) => p[1]))) : "—",
    eliteMax: "без лимита", elite: String(r.elite ?? 0) };
}
export const KINDS: Kind[] = ["mob", "weapon", "item", "skill", "loot", "spawn", "region", "boss", "rare", "curse", "chest", "dash", "biome", "upgrade", "gather", "npc", "ench", "bmage", "city", "pk", "pos", "dn"];
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
  if (builtin && (builtin.rewards as any)?.flag) (rewards as any).flag = (builtin.rewards as any).flag; // сюжетный флаг награды — не редактируется
  const lines = (v: any, n: number) => (Array.isArray(v) ? v : [v]).map((x) => STR(x, 400).trim()).filter(Boolean).slice(0, n);
  const offer = lines(q.offer, 6), done = lines(q.done, 6);
  if (!offer.length || !done.length) return "нужны окна пояснения и сдачи";
  return { id, npc: q.npc, turnin: q.turnin || undefined, campaign: "custom", custom: true, title, chapter: STR(q.chapter, 80) || "Поручения", minLevel, requires,
    objectives, rewards, offer, progress: STR(q.progress, 300) || "…", done, lore: STR(q.lore, 2000) || undefined, hint: STR(q.hint, 200) || undefined,
    track: q.track === false || q.track === "0" ? false : true }; // отслеживание целей (мобы на карте + компас)
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

export class AdminStore {
  db: any; ver = -1; checkedAt = 0; loading: Promise<void> | null = null;
  /** правка применилась (своя или подхваченная по версии) — разослать онлайн-игрокам */
  onChange?: () => void;
  touched = new Set<string>(); // kind:id всех когда-либо изменённых сущностей (чтобы сброс тоже дошёл до клиентов)
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
        const rows = (await this.db.prepare("SELECT kind, id, data FROM game_overrides").all()).results || [];
        for (const k of KINDS) for (const id of Object.keys(TABLES[k])) applyOverride(k, id, null);
        for (const r of rows) { this.touched.add(r.kind + ":" + r.id); const p = validatePatch(r.kind, r.id, JSON.parse(r.data)); if (typeof p !== "string") applyOverride(r.kind, r.id, p); }
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
    if (kind !== "quest" && kind !== "dialogue") this.touched.add(kind + ":" + target);
    this.onChange?.();
  }
  async save(by: string, kind: Kind, id: string, patch: any): Promise<{ ok: boolean; err?: string; values?: any; version?: number }> {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!KINDS.includes(kind) || !ID_RE.test(id)) return { ok: false, err: "неверная сущность" };
    const clean = validatePatch(kind, id, patch); if (typeof clean === "string") return { ok: false, err: clean };
    const before = currentValues(kind, id);
    const row = await this.db.prepare("SELECT version FROM game_overrides WHERE kind = ? AND id = ?").bind(kind, id).first();
    const version = Number(row?.version || 0) + 1;
    await this.db.prepare("INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(kind, id, JSON.stringify(clean), version, by, Date.now()).run();
    applyOverride(kind, id, clean);
    const values = currentValues(kind, id);
    await this.bump(by, kind, id, before, values, version);
    return { ok: true, values, version };
  }
  async reset(by: string, kind: Kind, id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    if (!KINDS.includes(kind) || !TABLES[kind][id]) return { ok: false, err: "неверная сущность" };
    const before = currentValues(kind, id);
    await this.db.prepare("DELETE FROM game_overrides WHERE kind = ? AND id = ?").bind(kind, id).run();
    applyOverride(kind, id, null);
    const values = currentValues(kind, id);
    await this.bump(by, kind, id, before, values, 0);
    return { ok: true, values };
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
    const lvlOf = (k: string, id: string, o: any) => k === "mob" ? o.lvl : k === "item" ? itemReq(o) : k === "skill" ? o.unlockLevel : k === "loot" || k === "boss" || k === "rare" ? (ZONE_MOBS as any)[id]?.lvl : undefined;
    for (const k of KINDS) ent[k] = Object.entries(TABLES[k]).map(([id, o]: [string, any]) => ({ id, name: (k === "loot" || k === "boss" || k === "rare" ? (ZONE_MOBS as any)[id]?.name : k === "spawn" ? "Аринар: лагеря и бродячие мобы" : k === "curse" ? "☠ Проклятие: дроп, вещи, мобы, свечение" : k === "ench" ? "✦ Зачарование: ярусы вещей и мобов, регенерация, дроп, улучшение" : k === "chest" ? "📦 Сундуки: лагерь, таймеры, вклад, отряд, стража" : k === "biome" ? `🧭 ${o.name}${o.sub ? ": " + o.sub : ""}` : k === "dash" ? "🏃 Рывок: перезарядка, неуязвимость, мигание" : k === "gather" ? "⛏ Сбор ресурсов: свечение узлов, личные узлы, восстановление" : k === "npc" ? "🚶 NPC: прогулка вокруг точки появления" : k === "bmage" ? "🌑 Чёрный маг: купола, чёрная магия, очернение, розы" : k === "city" ? "🏰 Альказак: купол, безопасная зона, убийцы, вид, места NPC" : k === "pk" ? "⚔ PK-режим: отсчёт, самооборона, урон" : k === "pos" ? "📍 Вход: позиция между входами" : k === "dn" ? "🌗 День и ночь: время, цвета, огни, форс-время" : k === "upgrade" ? "⚒ Улучшение у Петра: материалы, стоимость, статы" : k === "region" ? `${o.name} · ур. ${o.lvl?.[0]}–${o.lvl?.[1]}` : null) || o.name || o.title || id, icon: o.icon || (k === "loot" || k === "boss" || k === "rare" ? (ZONE_MOBS as any)[id]?.icon || "" : ""), lvl: lvlOf(k, id, o), defs: k === "region" ? regionDefs(o) : undefined, slot: o.slot, wtype: o.wtype, values: currentValues(k, id) }));
    return {
      schema: SCHEMA, traits: TRAIT_DEFS, ent, mobSkills: MOB_SKILLS_LIST,
      quests: QUESTS.map((q) => ({ id: q.id, title: q.title, npc: q.npc, custom: !!q.custom, edited: !!(q as any).edited, requires: q.requires || [], minLevel: q.minLevel, stars: Object.values(q.rewards?.stars || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0), def: q })),
      npcs: Object.entries(NPCS).map(([id, n]) => ({ id, name: n.name, world: n.world })),
      items: Object.entries(ITEM_BY_ID).map(([id, o]: [string, any]) => ({
        id, name: o.name, icon: o.icon || "", lvl: o.lvl || 1, req: itemReq(o),
        rarity: o.rarity || "common", slot: o.slot || "", stats: { ...(o.stats || {}) },
      })),
      res: Object.entries(RESOURCES).map(([id, o]) => ({ id, name: o.name, icon: o.icon })),
      mobs: Object.entries(ZONE_MOBS).map(([id, o]: [string, any]) => ({ id, name: o.name, lvl: o.lvl, boss: !!o.boss || undefined, base: o.variant ? o.base : undefined, baseName: o.variant ? (ZONE_MOBS as any)[o.base]?.name : undefined, biome: o.variant ? o.biome : undefined })),
      objTypes: OBJ_TYPES, conds: COND_DEFS,
      vn: { chars: Object.values(VN_CHARS), emotions: VN_EMOTIONS.map((id) => ({ id, name: VN_EMOTION_NAMES[id] })), limits: VN_LIMITS, dialogues: { ...QUEST_DIALOGUES } },
      totals: { items: Object.keys(ITEM_BY_ID).length, weapons: Object.values(ITEM_BY_ID).filter((o: any) => o.slot === "weapon").length, res: Object.keys(RESOURCES).length }, // для проверки «ни один предмет не пропал»
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
      quests: [], npcs: [], items: full.items, res: full.res, mobs: full.mobs, objTypes: [],
      vn: { chars: [], emotions: [], limits: full.vn?.limits || {}, dialogues: {} },
      totals: full.totals,
    };
  }
}

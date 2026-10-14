// «Проклятые»: админ-панель — сервер. Правки игровых данных (overrides.ts: схема + проверка) и квесты из игры
// хранятся в D1 (миграция 0010): game_overrides, custom_quests, журнал game_override_audit, версия набора
// game_config_version (комнаты сверяют её и перечитывают правки). Писать может только серверно проверенный админ —
// проверка роли в service.ts ДО вызова этих методов. Все запросы к D1 — только с bind (никакой склейки SQL).
import { validatePatch, applyOverride, currentValues, SCHEMA, TABLES, TRAIT_DEFS, TRAITS, type Kind, type Trait } from "./overrides";
import { QUESTS, QUEST_BY_ID, setCustomQuests, type QuestDef, type Objective } from "./quests";
import { NPCS, RESOURCES } from "./shared";
import { ITEM_BY_ID, ZONE_MOBS } from "./defs";
import { MOB_SKILLS_LIST } from "./mobSkills";

export const KINDS: Kind[] = ["mob", "weapon", "item", "skill", "loot"];
const ID_RE = /^[a-z0-9_:-]{1,48}$/i;
const STR = (v: any, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const OBJ_TYPES = ["talk", "kill", "kill_boss", "gather", "collect", "level", "reach"] as const;

/** проверка квеста из панели: только разрешённые поля и типы целей, ссылки на существующих NPC/мобов/предметы */
export function validateQuest(q: any): QuestDef | string {
  if (!q || typeof q !== "object") return "пустой квест";
  const id = String(q.id || "");
  if (!/^c_[a-z0-9_]{1,40}$/.test(id)) return "id квеста: c_ + латиница/цифры/_ (до 40)";
  if (!NPCS[q.npc]) return "NPC не найден";
  if (q.turnin && !NPCS[q.turnin]) return "NPC сдачи не найден";
  const title = STR(q.title, 80).trim(); if (!title) return "нужно название";
  const minLevel = q.minLevel == null || q.minLevel === "" ? undefined : Math.round(Number(q.minLevel));
  if (minLevel !== undefined && !(minLevel >= 1 && minLevel <= 60)) return "мин. уровень 1…60";
  const requires = Array.isArray(q.requires) ? q.requires.map(String).slice(0, 5) : [];
  for (const r of requires) if (!QUEST_BY_ID[r] && r !== id) return `нет квеста ${r}`;
  if (!Array.isArray(q.objectives) || !q.objectives.length || q.objectives.length > 5) return "целей 1…5";
  const objectives: Objective[] = [];
  for (const o of q.objectives) {
    const t = String(o?.type), text = STR(o?.text, 160).trim() || "Цель";
    const cnt = Math.round(Number(o?.count) || 1);
    if (!(OBJ_TYPES as readonly string[]).includes(t)) return `тип цели ${t} недоступен`;
    if (cnt < 1 || cnt > 999) return "количество 1…999";
    if (t === "talk") { if (!NPCS[o.npc]) return "цель «поговорить»: NPC не найден"; objectives.push({ type: "talk", npc: o.npc, text }); }
    else if (t === "kill" || t === "kill_boss") { if (!ZONE_MOBS[o.mob]) return `нет моба ${o.mob}`; objectives.push(t === "kill" ? { type: "kill", mob: o.mob, count: cnt, text } : { type: "kill_boss", mob: o.mob, text }); }
    else if (t === "gather") { if (!RESOURCES[o.res]) return `нет ресурса ${o.res}`; objectives.push({ type: "gather", res: o.res, count: cnt, text }); }
    else if (t === "collect") { if (o.item ? !ITEM_BY_ID[o.item] : !RESOURCES[o.res]) return "собрать: нужен предмет или ресурс"; objectives.push({ type: "collect", ...(o.item ? { item: o.item } : { res: o.res }), count: cnt, text }); }
    else if (t === "level") { if (cnt > 60) return "уровень до 60"; objectives.push({ type: "level", count: cnt, text }); }
    else if (t === "reach") { if (!["arinar", "hellfire"].includes(o.world)) return "мир: arinar/hellfire"; objectives.push({ type: "reach", world: o.world, text }); }
  }
  const r = q.rewards || {}, rewards: QuestDef["rewards"] = {};
  const xp = Math.round(Number(r.xp) || 0); if (xp < 0 || xp > 100000) return "опыт 0…100000"; if (xp) rewards.xp = xp;
  if (r.items) { if (!Array.isArray(r.items) || r.items.length > 4 || !r.items.every((i: any) => ITEM_BY_ID[i])) return "награда: до 4 существующих предметов"; if (r.items.length) rewards.items = r.items.map(String); }
  if (r.res) {
    if (typeof r.res !== "object" || Object.keys(r.res).length > 6) return "награда: до 6 ресурсов";
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.res)) { const n = Math.round(Number(v)); if (!RESOURCES[k] || !(n >= 1 && n <= 999)) return `ресурс ${k}: 1…999`; res[k] = n; }
    if (Object.keys(res).length) rewards.res = res;
  }
  const lines = (v: any, n: number) => (Array.isArray(v) ? v : [v]).map((x) => STR(x, 400).trim()).filter(Boolean).slice(0, n);
  const offer = lines(q.offer, 6), done = lines(q.done, 6);
  if (!offer.length || !done.length) return "нужны реплики «предложение» и «сдача»";
  return { id, npc: q.npc, turnin: q.turnin || undefined, campaign: "custom", custom: true, title, chapter: STR(q.chapter, 80) || "Поручения", minLevel, requires,
    objectives, rewards, offer, progress: STR(q.progress, 300) || "…", done, lore: STR(q.lore, 2000) || undefined, hint: STR(q.hint, 200) || undefined };
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
        for (const r of rows) { const p = validatePatch(r.kind, r.id, JSON.parse(r.data)); if (typeof p !== "string") applyOverride(r.kind, r.id, p); }
        const qs = (await this.db.prepare("SELECT data FROM custom_quests WHERE enabled = 1").all()).results || [];
        setCustomQuests(qs.map((r: any) => validateQuest(JSON.parse(r.data))).filter((q: any) => typeof q !== "string") as QuestDef[]);
        this.ver = ver;
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
    const q = validateQuest(raw); if (typeof q === "string") return { ok: false, err: q };
    if (QUEST_BY_ID[q.id] && !QUEST_BY_ID[q.id].custom) return { ok: false, err: "id занят сюжетным квестом" };
    const before = QUEST_BY_ID[q.id] || null;
    const row = await this.db.prepare("SELECT version FROM custom_quests WHERE id = ?").bind(q.id).first();
    const version = Number(row?.version || 0) + 1;
    await this.db.prepare("INSERT INTO custom_quests (id, data, enabled, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, enabled = 1, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(q.id, JSON.stringify(q), version, by, Date.now()).run();
    setCustomQuests([...QUESTS.filter((x) => x.custom && x.id !== q.id), q]);
    await this.bump(by, "quest", q.id, before, q, version);
    return { ok: true, quest: q, version };
  }
  async deleteQuest(by: string, id: string) {
    if (!this.db) return { ok: false, err: "База недоступна" };
    const q = QUEST_BY_ID[id]; if (!q || !q.custom) return { ok: false, err: "можно удалить только квест панели" };
    await this.db.prepare("UPDATE custom_quests SET enabled = 0, updated_by = ?, updated_at = ? WHERE id = ?").bind(by, Date.now(), id).run();
    setCustomQuests(QUESTS.filter((x) => x.custom && x.id !== id));
    await this.bump(by, "quest", id, q, null, 0);
    return { ok: true };
  }
  async audit(limit = 50) {
    if (!this.db) return [];
    const r = await this.db.prepare("SELECT aid, kind, target_id, before, after, version, granted_by, at FROM game_override_audit ORDER BY aid DESC LIMIT ?").bind(Math.max(1, Math.min(200, limit))).all();
    return (r.results || []).map((x: any) => ({ ...x, by: String(x.granted_by).replace(/^uid:(.{4}).*/, "uid:$1…") }));
  }
  /** всё для панели: схема, черты, сущности с текущими значениями, квесты, справочники */
  catalog() {
    const ent: Record<string, any[]> = {};
    for (const k of KINDS) ent[k] = Object.entries(TABLES[k]).map(([id, o]: [string, any]) => ({ id, name: o.name || o.title || id, icon: o.icon || "", values: currentValues(k, id) }));
    return {
      schema: SCHEMA, traits: TRAIT_DEFS, ent, mobSkills: MOB_SKILLS_LIST,
      quests: QUESTS.map((q) => ({ id: q.id, title: q.title, npc: q.npc, custom: !!q.custom, def: q.custom ? q : undefined })),
      npcs: Object.entries(NPCS).map(([id, n]) => ({ id, name: n.name, world: n.world })),
      items: Object.entries(ITEM_BY_ID).map(([id, o]: [string, any]) => ({ id, name: o.name })),
      res: Object.entries(RESOURCES).map(([id, o]) => ({ id, name: o.name, icon: o.icon })),
      mobs: Object.entries(ZONE_MOBS).map(([id, o]: [string, any]) => ({ id, name: o.name, lvl: o.lvl })),
      objTypes: OBJ_TYPES,
    };
  }
}

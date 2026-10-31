// «Партия Чёрных королей» — Библиотека (кодекс): всё, что есть в игре, открывается при первой встрече (F, t1205–t1206).
// ТОЛЬКО СЕРВЕР: каталог строится из общих правил, включая скрытые деревья (tree-data.ts), поэтому клиенту уходят
// лишь открытые им записи; о закрытых — только счётчики по группам (без id и имён).
import type { StratCfg, GameState } from "./rules";
import { RACES } from "./rules";
import { describeEffects, raceEffects, unitEffects, cellEffects, chiefEffects, ultEffects, unitActEffects } from "./effects";
import { TERRAIN, STRUCT } from "./terrain";
import { TACTICS, UNLOCK, HERO_ERA } from "./econ-cfg";
import { LEAGUE_NAME, leagueOf } from "./rating";
import { buildView } from "./econ";

export type CodexCat = "race" | "unit" | "chief" | "skill" | "ult" | "status" | "terrain" | "object" | "building" | "tech" | "wonder" | "goal" | "league";
export type CodexEntry = { k: string; cat: CodexCat; name: string; icon?: string; race?: string; era?: number; type?: string; league?: string;
  cost?: string; eff: string; req?: string; opens?: string; stats?: string };
export const CODEX_CATS: Record<CodexCat, string> = { race: "Расы", unit: "Фигуры", chief: "Вожди", skill: "Навыки", ult: "Ультимейты", status: "Состояния",
  terrain: "Местность", object: "Объекты карты", building: "Постройки", tech: "Технологии", wonder: "Чудеса", goal: "Цели победы", league: "Лиги" };
export const RACE_RU: Record<string, string> = { fire: "Огонь", ice: "Лёд", water: "Вода", stone: "Камень", nature: "Природа", lightning: "Молния" };
const KIND_RU: Record<string, string> = { pawn: "Ополченец", knight: "Всадник", mage: "Маг", rook: "Страж", hero: "Герой", king: "Вождь" };
const KIND_ICON: Record<string, string> = { pawn: "♟", knight: "♞", mage: "✦", rook: "♜", hero: "♛", king: "♚" };
const ERA_RU = ["", "I", "II", "III", "IV", "V"];
const clean = (s: string) => String(s || "").replace(/\s*\((этап \d+|goals\.sizes)\)/g, "").trim();
const LEAGUE_SIZES: Record<string, number[]> = { quick: [5, 8], normal: [15], tactical: [35] }; // как rating.leagueOf (quickMax 9, normalMax 29)

const cache = new WeakMap<object, { list: CodexEntry[]; map: Map<string, CodexEntry> }>();
export function codexCatalog(cfg: StratCfg): CodexEntry[] { return codexIndex(cfg).list; }
export function codexIndex(cfg: StratCfg) {
  let c = cache.get(cfg as any); if (c) return c;
  const C: any = cfg, out: CodexEntry[] = [], races = Object.keys(C.race || {}).filter((r) => (RACES as readonly string[]).includes(r) || RACE_RU[r]);
  const bName = (b: string, r?: string) => (r ? buildView(cfg, r, b).name : C.build?.[b]?.name) || b;
  const techName = (id: string) => (C.techs || []).find((t: any) => t.id === id)?.name || id;
  const ultOf: Record<string, string> = {}; for (const d of C.chiefs || []) for (const n of d.tree) if (n.ult) ultOf[n.ult] = d.race;
  // расы
  for (const r of races) { const d = (C.chiefs || []).find((x: any) => x.race === r), u = d?.tree.find((n: any) => n.ult)?.ult;
    out.push({ k: "race:" + r, cat: "race", race: r, name: RACE_RU[r] || r, icon: "⬢", eff: describeEffects(raceEffects(C, r)) || "—",
      opens: [`Чудо «${bName("wonder", r)}»`, u && C.ults?.[u] ? `ультимейт «${C.ults[u].name}»` : ""].filter(Boolean).join(", ") }); }
  // фигуры
  for (const k of Object.keys(C.units || {})) { const U = C.units[k], alt = races.map((r) => C.unitRaceNames?.[r]?.[k]).filter(Boolean);
    const un = UNLOCK[k]; out.push({ k: "unit:" + k, cat: "unit", type: k, name: KIND_RU[k] || k, icon: KIND_ICON[k], era: k === "hero" ? HERO_ERA : undefined,
      cost: k === "king" ? undefined : U.cost ? U.cost + " з" : undefined, stats: `HP ${U.hp} · АТК ${U.atk} · БРН ${U.arm}`,
      eff: describeEffects(unitEffects(C, k)) + (alt.length ? `. У рас: ${[...new Set(alt)].join(", ")}` : ""),
      req: k === "king" ? "один на сторону, с начала партии" : k === "hero" ? `эпоха ${ERA_RU[HERO_ERA]}` : un ? `постройка «${bName(un)}»` : "доступен сразу" }); }
  // вожди и их навыки
  for (const d of C.chiefs || []) {
    out.push({ k: "chief:" + d.id, cat: "chief", race: d.race === "any" ? undefined : d.race, type: "chief", name: d.name, icon: "♚",
      stats: `HP ${d.base.hp} · АТК ${d.base.atk} · БРН ${d.base.arm}`, eff: `Тип Вождя. Навыков в дереве: ${d.tree.length}`, req: d.unlock === "free" ? "доступен сразу" : clean(d.unlock) || undefined });
    for (const n of d.tree) { if (n.ult) continue;
      out.push({ k: `skill:${d.id}:${n.id}`, cat: "skill", race: d.race === "any" ? undefined : d.race, type: n.kind === "active" ? "Активный навык Вождя" : "Пассивный навык Вождя",
        name: n.name, icon: n.kind === "active" ? "✷" : "◆", era: undefined, eff: clean(n.eff) || describeEffects(chiefEffects(C, n)),
        req: [`${d.name}, ур. ${n.lvl}`, ...(n.req || []).map((q: string) => d.tree.find((x: any) => x.id === q)?.name || q)].join(" · ") }); } }
  // таланты и умения фигур
  for (const [kind, rows] of Object.entries(C.talents || {}) as [string, any[]][]) for (const pair of rows) for (const t of pair)
    out.push({ k: `skill:${kind}:${t.id}`, cat: "skill", type: "Талант фигуры", name: t.name, icon: "◇", eff: clean(t.eff), req: `${KIND_RU[kind] || kind}, ур. 2` });
  for (const [kind, T] of Object.entries(C.unitTree || {}) as [string, any][]) {
    for (const a of T.act) out.push({ k: `skill:${kind}:${a.id}`, cat: "skill", type: "Умение фигуры", name: a.name, icon: "✧", cost: `${a.ap} ОД, перезарядка ${a.cd}`,
      eff: clean(a.eff) || describeEffects(unitActEffects(a)), req: `${KIND_RU[kind] || kind}, ур. 3` });
  }
  // ультимейты
  for (const [id, u] of Object.entries(C.ults || {}) as [string, any][]) out.push({ k: "ult:" + id, cat: "ult", race: ultOf[id], type: "Ультимейт Вождя", name: u.name, icon: "☄",
    cost: `${u.ap} ОД, перезарядка ${u.cd}`, eff: clean(u.eff) || describeEffects(ultEffects(C, id)), req: "Вождь, ур. 5" });
  for (const [kind, T] of Object.entries(C.unitTree || {}) as [string, any][]) { const u = C.unitUlts?.[T.ult]; if (!u) continue;
    out.push({ k: "ult:" + T.ult, cat: "ult", type: "Ультимейт фигуры", name: u.name, icon: "☄", cost: `${u.ap} ОД, перезарядка ${u.cd}`, eff: clean(u.eff) || describeEffects(ultEffects(C, T.ult, true)), req: `${KIND_RU[kind] || kind}, ур. 5` }); }
  // состояния
  const F = C.race?.fire || {}, I = C.race?.ice || {};
  out.push({ k: "status:burn", cat: "status", race: "fire", name: "Горение", icon: "🔥", eff: `−${F.burnDmg || 1} HP в начале хода, ${F.burnTurns || 2} хода` });
  out.push({ k: "status:chill", cat: "status", race: "ice", name: "Обморожение", icon: "❄", eff: `ходит на ${I.chillMove || 1} клетку, ${I.chillTurns || 1} ход(а)` });
  out.push({ k: "status:shield", cat: "status", race: "stone", name: "Щит", icon: "🛡", eff: "поглощает урон, пока не иссякнет" });
  // местность и объекты
  for (const ch of Object.keys(TERRAIN)) out.push({ k: "terrain:" + ch, cat: "terrain", name: (TERRAIN as any)[ch].name, icon: "▦", eff: describeEffects(cellEffects(C, ch)) || "—" });
  for (const ch of Object.keys(STRUCT)) { const S: any = (STRUCT as any)[ch]; out.push({ k: "object:" + ch, cat: "object", type: S.res ? "Ресурс" : "Объект", name: S.name, icon: "◈",
    eff: describeEffects(cellEffects(C, ch)) || clean(S.eff) || "—" }); }
  // постройки
  for (const b of Object.keys(C.build || {})) { if (b === "wonder") continue; const B = C.build[b], gate = (C.techs || []).filter((t: any) => t.unlock?.includes(b));
    out.push({ k: "building:" + b, cat: "building", race: B.race, type: C.buildTpl?.[b]?.type || (B.legend ? "legend" : "special"), name: B.name, icon: B.icon || "🏛",
      era: B.legend ? 4 : undefined, cost: B.cost ? B.cost + " з" : undefined, eff: clean(B.eff),
      req: gate.length ? "технология: " + gate.map((t: any) => t.name).join(" / ") : B.legend ? "эпоха IV, столица" : undefined,
      opens: Object.entries(UNLOCK).filter(([, v]) => v === b).map(([k]) => KIND_RU[k]).join(", ") || undefined }); }
  // технологии
  const RC = C.econ?.research?.cost || [];
  for (const t of C.techs || []) { const br = TACTICS.find((x) => x.id === t.br);
    out.push({ k: "tech:" + t.id, cat: "tech", race: t.race, era: t.era, type: br?.name || t.br, name: t.name, icon: br?.icon || "📜", cost: RC[t.era] ? RC[t.era] + " знания" : undefined,
      eff: clean(t.eff), req: (t.req || []).map(techName).join(" / ") || undefined, opens: (t.unlock || []).map((b: string) => `«${bName(b, t.race)}»`).join(", ") || undefined }); }
  // чудеса
  for (const r of races) { const v = buildView(cfg, r, "wonder");
    out.push({ k: "wonder:" + r, cat: "wonder", race: r, era: 4, name: v.name || "Великое чудо", icon: v.icon || "✨", eff: clean(v.eff || C.build?.wonder?.eff), req: "эпоха IV, столица; цена — по размеру поля" }); }
  // цели победы и лиги
  const GS = C.goals?.sizes || {}, gAt = (n: number) => { const ks = Object.keys(GS).map(Number).filter((x) => x <= n).sort((a, b) => b - a); return GS[ks[0]]; };
  for (const id of Object.keys(C.goals?.info || {})) { const G = C.goals.info[id];
    const by = Object.entries(LEAGUE_SIZES).filter(([, ss]) => ss.some((s) => gAt(s)?.list?.includes(id))).map(([l]) => LEAGUE_NAME[l as keyof typeof LEAGUE_NAME]);
    const thr = (S: any) => !S?.list?.includes(id) ? "" : id === "treasury" ? `${S.gold} з за партию` : id === "domain" ? `${Math.round(S.share * 100)}% карты` : id === "wonder" ? `Чудо: ${S.wonderGold} з + ${S.wonderKnow} знаний` : id === "hold" ? `${S.holdK} очк. ${S.holdTurns} ${S.holdTurns >= 5 ? "ходов" : S.holdTurns === 1 ? "ход" : "хода"} подряд` : "";
    const req = Object.entries(LEAGUE_SIZES).map(([l, ss]) => { const t = thr(gAt(ss[ss.length - 1])); return t && `${LEAGUE_NAME[l as keyof typeof LEAGUE_NAME]}: ${t}`; }).filter(Boolean).join("; ");
    out.push({ k: "goal:" + id, cat: "goal", name: G.name, icon: G.icon, eff: clean(G.eff), league: by.join(", ") || undefined, ...(req ? { req } : {}) }); }
  for (const [lid, ss] of Object.entries(LEAGUE_SIZES)) { const L = C.econ?.league?.[lid] || {}, G = gAt(ss[ss.length - 1]) || {};
    out.push({ k: "league:" + lid, cat: "league", league: LEAGUE_NAME[lid as keyof typeof LEAGUE_NAME], name: LEAGUE_NAME[lid as keyof typeof LEAGUE_NAME] + " лига", icon: "🏆",
      eff: `Поле ${ss.map((s) => s + "×" + s).join(", ")}. ОД: база ${L.apBase ?? "—"}, максимум ${L.apMax ?? "—"}. Для победы целей: ${G.need ?? "—"} из ${(G.list || []).length}. Лимит ходов: ${(C as any).sizes?.[ss[ss.length - 1]]?.turnLimit || "нет"} (на лимите — больше целей, затем прогресс, иначе ничья). Порог Славы: ${C.econ?.sizes?.[ss[ss.length - 1]]?.glory ?? "—"}. Опыт ×${L.xp ?? 1}` }); }
  c = { list: out, map: new Map(out.map((e) => [e.k, e])) }; cache.set(cfg as any, c); return c;
}

/** счётчики по группам (для силуэтов закрытых записей): без id/имён */
export function codexGroups(cfg: StratCfg) {
  const m = new Map<string, { cat: CodexCat; race?: string; era?: number; type?: string; n: number }>();
  for (const e of codexCatalog(cfg)) { const key = [e.cat, e.race || "", e.era || "", e.type || ""].join("|"); const g = m.get(key);
    if (g) g.n++; else m.set(key, { cat: e.cat, race: e.race, era: e.era, type: e.type, n: 1 }); }
  return [...m.values()];
}
export const codexPick = (cfg: StratCfg, keys: Iterable<string>) => { const M = codexIndex(cfg).map, o: CodexEntry[] = []; for (const k of keys) { const e = M.get(k); if (e) o.push(e); } return o; };

/** что сторона side «встретила» в партии: видимое всем на доске + своё (технологии, навыки). Чужие скрытые бонусы — нет. */
export function codexSeen(g: GameState, side: 0 | 1, cfg: StratCfg, ev: any[] = []): Set<string> {
  const s = new Set<string>(), C: any = cfg, ec: any = (g as any).ec;
  for (const r of g.races || []) if (r) s.add("race:" + r);
  const lid = leagueOf(g.size); if (lid) s.add("league:" + lid);
  const GS = C.goals?.sizes || {}, ks = Object.keys(GS).map(Number).filter((x) => x <= g.size).sort((a, b) => b - a); for (const id of GS[ks[0]]?.list || []) s.add("goal:" + id);
  for (const p of g.pieces || []) { s.add("unit:" + p.kind); if (p.burn > 0) s.add("status:burn"); if (p.chill > 0) s.add("status:chill"); if ((p as any).sh > 0) s.add("status:shield");
    if (p.owner === side) for (const t of p.tal || []) { if (p.kind === "king" && ec) s.add(`skill:${ec.chief[side].type}:${t}`); s.add(`skill:${p.kind}:${t}`); } }
  for (const ch of new Set(g.map?.t || "")) if ((TERRAIN as any)[ch]) s.add("terrain:" + ch);
  for (const ch of new Set(g.map?.s || "")) if ((STRUCT as any)[ch]) s.add("object:" + ch);
  if (ec) { for (const o of [0, 1]) if (ec.chief?.[o]?.type) s.add("chief:" + ec.chief[o].type);
    for (const t of ec.techs?.[side] || []) s.add("tech:" + t);
    for (const c of ec.cities || []) for (const b of c.bld || []) { if (b === "wonder") s.add("wonder:" + g.races[c.owner]); else s.add("building:" + b); } }
  for (const e of ev || []) { if (e?.e === "ult" && e.ult) s.add("ult:" + e.ult); if (e?.e === "burn") s.add("status:burn"); if (e?.e === "shield") s.add("status:shield"); }
  return s;
}

// Генератор контента 30.10 → /workspace/content-1030/sql/{apply,rollback}.sql + counts.json
// Запуск: cd server && bun ../tools/content/gen-1030.ts   (проверяет каждую запись validatePatch сервера и прогоняет загрузку как AdminStore)
import { writeFileSync, mkdirSync } from "node:fs";
import { validatePatch, applyOverride, currentValues, SCHEMA } from "../../server/meta/overrides";
import { BM_PARTS } from "../../server/meta/blackArt";
import { BM_MOBS, BM_CAMPS } from "../../server/meta/blackMobs";
import { SK_DEFS } from "../../server/meta/skillCraft";
import { SKILLS, skId, bladeCopyId, isRangedBlade, MELEE_FORM, TIERS, coreId, handleCopyId, handleSecId, SEC_SKILL, ELS, buildMobs, LAIRS, type El, type MobRow } from "./c30-data";

export type Row = { kind: string; id: string; data: Record<string, any> };
const OUT = process.env.C30_OUT || "/workspace/content-1030/sql";
const fail = (m: string) => { throw new Error(m); };
const put = (rows: Row[], kind: string, id: string, P: any) => {
  const v = validatePatch(kind as any, id, P); if (typeof v === "string") fail(`${kind}:${id}: ${v}`);
  applyOverride(kind as any, id, v); rows.push({ kind, id, data: v as any }); return v;
};
/** копия встроенной детали: все поля схемы со значениями, кроме заголовков; свои имя/навык/скрытость */
const copyPart = (src: string, over: Record<string, any>) => {
  const cv: any = currentValues("bpart" as any, src); const P: any = {};
  for (const f of SCHEMA.bpart.fields) { if (f.t === "hdr" || cv[f.path] == null) continue; P[f.path] = cv[f.path]; }
  return { ...P, ...over, hidden: true };
};
export function build() {
  const rows: Row[] = [];
  // 1) навыки
  const blades = Object.values(BM_PARTS).filter((p: any) => p.type === "blade");
  for (const r of SKILLS) {
    const [blade, , name, icon, form, cd, f, desc] = r; const b: any = BM_PARTS[blade]; if (!b) fail("нет лезвия " + blade);
    const el = b.elem as El; const ranged = isRangedBlade(blade);
    if (ranged ? !(cd >= 10 && cd <= 20) : !(cd >= 10 && cd <= 15)) fail(`${blade}: cd ${cd} вне рамок`);
    if (!ranged && !MELEE_FORM(form) && form !== "rain") fail(`${blade}: ближнее лезвие с формой ${form}`);
    put(rows, "skdef", skId(r), { name, icon, desc, elem: el, form, cd, dmg: "black", ...f });
  }
  // 2) детали (t1062u: рукояти мобов — «Здоровье» рукояти да, предельная броня 0: архетип моба задаёт ядро, «стекло» без предельной)
  // копии лезвий с навыком, рукояти без навыка и «с навыком», кристаллы-ядра
  for (const r of SKILLS) { const b: any = BM_PARTS[r[0]]; put(rows, "bpart", bladeCopyId(r[0]), copyPart(r[0], { name: `${b.name} · ${r[2]}`, skill: skId(r), desc: `Лезвие чёрного моба (контент 30.10): навык «${r[2]}».` })); }
  const handlesByEl: Record<string, string[]> = {};
  for (const h of Object.values(BM_PARTS).filter((p: any) => p.type === "handle" && !p.hidden && !String(p.id).startsWith("bpx_")) as any[]) {
    (handlesByEl[h.elem] ||= []).push(h.id); put(rows, "bpart", handleCopyId(h.id), copyPart(h.id, { name: `${h.name} (без навыка)`, skill: "", "stats.bcap": 0 }));
  }
  for (const el of ELS) { const h: any = BM_PARTS[`${el}_handle`]; put(rows, "bpart", handleSecId(el), copyPart(h.id, { name: `${h.name} · ${SK_DEFS[SEC_SKILL[el]].name}`, skill: SEC_SKILL[el], "stats.bcap": 0 })); }
  for (const el of ELS) { const cr = Object.values(BM_PARTS).filter((p: any) => p.type === "crystal" && p.elem === el && !String(p.id).startsWith("bpx_")) as any[];
    TIERS.forEach((t, i) => put(rows, "bpart", coreId(el, t.t), copyPart(cr[i % cr.length].id, { name: `${t.name} (${t.bdmg} % / ${t.bcap || "—"})`, skill: "",
      "stats.bdmg": t.bdmg, "stats.bcap": t.bcap, "stats.barm": t.barm, desc: `Ядро архетипа «${t.arch}»: чёрный урон ${t.bdmg} % макс. ОЗ героя, предельная броня ${t.bcap || "нет"}${t.bcap ? " %" : ""}, чёрная броня ${t.barm}.` }))); }
  // 3) мобы
  const bladesByEl: Record<string, string[]> = {}; for (const r of SKILLS) (bladesByEl[BM_PARTS[r[0]].elem] ||= []).push(r[0]);
  const taken = new Set<string>(Object.values(BM_MOBS).map((m: any) => m.name));
  const mobs = buildMobs(bladesByEl, handlesByEl, taken);
  for (const m of mobs) put(rows, "bmmob", m.id, m.P);
  const used = new Set(mobs.map((m) => m.blade)); const unused = SKILLS.map((s) => s[0]).filter((b) => !used.has(b)); if (unused.length) fail("лезвия без моба: " + unused.join(", "));
  // 4) логова-шаблоны
  const ptr: Record<string, number> = {};
  const pick = (el: El, role: string, tier?: string) => { const c = mobs.filter((m) => m.el === el && m.role === role && (!tier || m.tier.t === tier)); if (!c.length) fail(`нет моба ${el}/${role}/${tier}`);
    const k = el + role + (tier || ""); return c[(ptr[k] = (ptr[k] ?? -1) + 1) % c.length]; };
  const lairs: any[] = [];
  for (const L of LAIRS) {
    const chief = pick(L.chief[0], L.chief[1], L.chief[2]); const list: { mob: string; n: number }[] = [];
    for (const p of L.picks) { const m = pick(p[0], p[1], p[3]); const e = list.find((x) => x.mob === m.id); if (e) e.n += p[2]; else list.push({ mob: m.id, n: p[2] }); }
    const els = [...new Set([chief.el, ...list.map((x) => mobs.find((m) => m.id === x.mob)!.el)])];
    const drops = els.flatMap((el) => [{ res: `bp_${el}_crystal`, chance: Math.round(60 / els.length), qty: [1, 1] }, { res: `bp_${el}_blade3`, chance: Math.round(40 / els.length), qty: [1, 1] }, { res: `bm_shard_${el}`, chance: 50, qty: [1, 3] }]).slice(0, 12);
    const id = `bcx_c30_${L.id}`;
    put(rows, "bmcamp", id, { name: L.name, world: "arinar", x: 0, y: 0, r: L.r, lair: true, hidden: true, chief: chief.id, respawnMin: 240, respawnMax: 420, mobs: list,
      loot: { drops, chests: [{ t: L.chest, chance: 100 }, { t: "uncommon", chance: 40 }] } });
    lairs.push({ id, name: L.name, idea: L.idea, chief: chief.id, mobs: list, total: list.reduce((a, x) => a + x.n, 1), els });
  }
  return { rows, mobs, lairs };
}
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
export function sql(rows: Row[], at: number) {
  const by = "content-1030", A: string[] = ["-- контент 30.10: навыки skx_c30_*, детали bpx_c30_*, мобы bmx_c30_*, логова-шаблоны bcx_c30_* (hidden, x/y 0)", "-- идемпотентно: INSERT OR REPLACE; в конце — версия набора правок +1"];
  for (const r of rows) {
    const d = q(JSON.stringify(r.data));
    A.push(`INSERT INTO game_override_audit (kind, target_id, before, after, version, granted_by, at) SELECT ${q(r.kind)}, ${q(r.id)}, (SELECT data FROM game_overrides WHERE kind = ${q(r.kind)} AND id = ${q(r.id)}), ${d}, 1, ${q(by)}, ${at} WHERE NOT EXISTS (SELECT 1 FROM game_overrides WHERE kind = ${q(r.kind)} AND id = ${q(r.id)} AND data = ${d});`);
    A.push(`INSERT OR REPLACE INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES (${q(r.kind)}, ${q(r.id)}, ${d}, 1, ${q(by)}, ${at});`);
  }
  A.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");
  const R = ["-- откат контента 30.10: удаляет только записи content-1030 по префиксам", 
    "DELETE FROM game_overrides WHERE (kind = 'skdef' AND id LIKE 'skx\\_c30\\_%' ESCAPE '\\') OR (kind = 'bpart' AND id LIKE 'bpx\\_c30\\_%' ESCAPE '\\') OR (kind = 'bmmob' AND id LIKE 'bmx\\_c30\\_%' ESCAPE '\\') OR (kind = 'bmcamp' AND id LIKE 'bcx\\_c30\\_%' ESCAPE '\\');",
    "UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';"];
  return { apply: A.join("\n") + "\n", rollback: R.join("\n") + "\n" };
}
if (import.meta.main) {
  const { rows, mobs, lairs } = build();
  // проверка: перечитать как AdminStore (строки по (kind, id), как отдаёт D1) — ничего не пропущено
  const { AdminStore } = await import("../../server/meta/admin");
  const sorted = [...rows].sort((a, b) => (a.kind + "\u0000" + a.id < b.kind + "\u0000" + b.id ? -1 : 1)).map((r) => ({ kind: r.kind, id: r.id, data: JSON.stringify(r.data) }));
  const st = (s: string): any => ({ bind: () => st(s), first: async () => (s.includes("game_config_version") ? { v: 99 } : null), all: async () => ({ results: s.includes("FROM game_overrides") ? sorted : [] }) });
  const warns: string[] = [], w0 = console.warn; console.warn = (...a: any[]) => warns.push(a.join(" "));
  await new AdminStore({ prepare: st }).sync(true); console.warn = w0;
  const miss = rows.filter((r) => (r.kind === "skdef" ? !SK_DEFS[r.id] : r.kind === "bpart" ? !BM_PARTS[r.id] : r.kind === "bmmob" ? !BM_MOBS[r.id] : !BM_CAMPS[r.id]));
  if (warns.some((x) => /c30/.test(x)) || miss.length) fail("перечитывание: " + warns.filter((x) => /c30/.test(x)).join(" | ") + " нет: " + miss.map((r) => r.id).join(","));
  mkdirSync(OUT, { recursive: true }); const s = sql(rows, Date.now());
  writeFileSync(OUT + "/apply.sql", s.apply); writeFileSync(OUT + "/rollback.sql", s.rollback);
  const cnt: any = {}; for (const r of rows) cnt[r.kind] = (cnt[r.kind] || 0) + 1;
  const counts = { counts: cnt, mobsByEl: Object.fromEntries(ELS.map((e) => [e, mobs.filter((m) => m.el === e).length])),
    mobsByRole: Object.fromEntries(["tank", "healer", "kiter", "assassin", "summoner"].map((r) => [r, mobs.filter((m) => m.role === r).length])),
    mobsByTier: Object.fromEntries(TIERS.map((t) => [t.t, mobs.filter((m) => m.tier.t === t.t).length])), lairs,
    activeCampsInApply: rows.filter((r) => r.kind === "bmcamp" && (!r.data.hidden || r.data.x || r.data.y)).length };
  writeFileSync(OUT + "/counts.json", JSON.stringify(counts, null, 1));
  writeFileSync(OUT + "/mobs.json", JSON.stringify(mobs.map((m) => ({ id: m.id, name: m.P.name, el: m.el, role: m.role, tier: m.tier.t, lvl: m.P.lvl, cls: m.P.cls, blade: m.blade, skill: m.skill, sec: m.sec, move: m.P.move, drops: m.P.drops, chests: m.P.chests })), null, 1));
  console.log(JSON.stringify({ ...counts, lairs: lairs.map((l) => `${l.id} ${l.total}`) }));
}

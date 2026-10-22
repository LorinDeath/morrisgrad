// Разовое заполнение строк game_overrides для копий трофеев вариантов (запускается ЯВНО при выкладке, не при старте воркера).
// Вход — выгрузка прод-строк game_overrides; выход — план (что создать) и SQL, который:
//   • создаёт строку только копии, у которой её ещё нет (INSERT … ON CONFLICT DO NOTHING) — правки админа никогда не затираются;
//   • базовые и прочие строки не трогает; повторный запуск ничего не создаёт (идемпотентно);
//   • пишет журнал game_override_audit (только для реально созданных) и поднимает game_config_version (комнаты перечитают).
import { AdminStore } from "./admin";
import { ITEM_BY_ID } from "./defs";
import { validatePatch, currentValues, TRAITS } from "./overrides";
import { copyIds, copyPatch, powerOf, peerCurve, COPY_STATS } from "./variantCopy";

export const SEED_BY = "seed:variant-copies";
type Row = { kind: string; id: string; data: string; version?: number };

/** D1 в памяти: ровно те запросы, что делает AdminStore (sync/save/reset/bump) */
export function memDb(rows: Row[]) {
  const ov = new Map<string, Row & { version: number }>(rows.map((r) => [r.kind + "\u0000" + r.id, { ...r, version: r.version ?? 1 }]));
  const st = { v: 1, audit: [] as any[], ov };
  const stmt = (sql: string, a: any[] = []): any => ({
    bind: (...b: any[]) => stmt(sql, b),
    async first() {
      if (/FROM game_config_version/.test(sql)) return { v: st.v };
      if (/SELECT version FROM game_overrides/.test(sql)) { const r = ov.get(a[0] + "\u0000" + a[1]); return r ? { version: r.version } : null; }
      if (/SELECT data FROM game_overrides/.test(sql)) { const r = ov.get(a[0] + "\u0000" + a[1]); return r ? { data: r.data } : null; }
      return null;
    },
    async all() {
      if (/FROM game_overrides/.test(sql)) return { results: [...ov.values()].map((r) => ({ kind: r.kind, id: r.id, data: r.data, version: r.version })) };
      return { results: [] };
    },
    async run() {
      if (/^INSERT INTO game_overrides/.test(sql)) ov.set(a[0] + "\u0000" + a[1], { kind: a[0], id: a[1], data: a[2], version: a[3] });
      else if (/^DELETE FROM game_overrides/.test(sql)) ov.delete(a[0] + "\u0000" + a[1]);
      else if (/^INSERT INTO game_override_audit/.test(sql)) st.audit.push(a);
      else if (/^UPDATE game_config_version/.test(sql)) st.v++;
      return { success: true };
    },
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (b: any[]) => { for (const s of b) await s.run(); return []; }, _st: st };
}

/** разбор выгрузки `wrangler d1 execute --json` ([{results:[…]}]) или просто массива строк */
export function parseRows(j: any): Row[] { const a = Array.isArray(j) && j[0]?.results ? j.flatMap((x: any) => x.results) : Array.isArray(j) ? j : j?.results || []; return a.filter((r: any) => r && r.kind && r.id && r.data); }

const nz = (s: any) => Object.fromEntries(COPY_STATS.filter((k) => Number(s?.[k]) > 0).map((k) => [k, Number(s[k])]));
export type PlanItem = { id: string; base: string; name: string; slot: string; rarity: string; lvl: number; baseLvl: number; req: number; rs?: string; traits: number;
  exists: boolean; data: any; baseStats: Record<string, number>; codeStats: Record<string, number>; stats: Record<string, number>;
  peers: { dmg: number; sec: number; nD: number; nS: number; wD: number; wS: number; any: boolean }; devCode: number; dev: number; devD?: number; devS?: number };

/** план: действующие значения (код + прод-строки) → для каждой копии её будущая строка; exists — строка уже есть (не трогаем) */
export async function seedPlan(rows: Row[]): Promise<{ plan: PlanItem[]; store: AdminStore }> {
  const codeStats: Record<string, Record<string, number>> = {};
  for (const id of copyIds()) codeStats[id] = { ...((ITEM_BY_ID as any)[id].stats || {}) };
  const store = new AdminStore(memDb(rows)); await store.sync(true);
  const have = new Set(rows.filter((r) => r.kind === "item").map((r) => r.id));
  const plan: PlanItem[] = [];
  const dev = (x: number, m: number) => (m > 0 ? (x / m - 1) * 100 : 0);
  for (const id of copyIds()) {
    const c: any = (ITEM_BY_ID as any)[id], b: any = (ITEM_BY_ID as any)[c.part];
    const raw = copyPatch(id)!, p = validatePatch("item", id, raw);
    if (typeof p === "string") throw new Error(`копия ${id}: ${p}`);
    const pD = peerCurve(c.slot, c.rarity, c.lvl, "dmg"), pS = peerCurve(c.slot, c.rarity, c.lvl, "sec");
    const st: Record<string, number> = {}; for (const k of COPY_STATS) st[k] = Number(raw["stats." + k]) || 0;
    const me = powerOf({ ...c, stats: st }), code = powerOf({ ...c, stats: codeStats[id] });
    const isW = c.slot === "weapon", hasS = powerOf(b).sec > 0;
    const devD = isW && pD.dmg > 0 ? dev(me.dmg, pD.dmg) : undefined, devS = hasS && pS.sec > 0 ? dev(me.sec, pS.sec) : undefined;
    // оружие — по общей силе (урон + прочие линии против медиан соседей), прочее — по силе линий
    const tot = (x: { dmg: number; sec: number }) => x.dmg + (hasS ? x.sec : 0), pT = pD.dmg + (hasS ? pS.sec : 0);
    const cD = isW && pD.dmg > 0 ? dev(tot(code), pT) : 0, cS = !isW && pS.sec > 0 ? dev(code.sec, pS.sec) : 0;
    const fin = isW ? (pD.dmg > 0 ? dev(tot(me), pT) : 0) : (pS.sec > 0 ? dev(me.sec, pS.sec) : 0);
    plan.push({ id, base: b.id, name: c.name, slot: c.slot, rarity: c.rarity, lvl: c.lvl, baseLvl: b.lvl, req: raw.req, rs: raw.rs, traits: (TRAITS.item[b.id] || []).length,
      exists: have.has(id), data: p, baseStats: nz(b.stats), codeStats: nz(codeStats[id]), stats: nz(st),
      peers: { dmg: pD.dmg, sec: pS.sec, nD: pD.n, nS: pS.n, wD: pD.win, wS: pS.win, any: isW ? pD.any || pS.any : pS.any },
      devCode: isW ? cD : cS, dev: fin, devD, devS });
  }
  return { plan, store };
}

const q = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";
/** SQL выкладки: только новые строки копий; ON CONFLICT DO NOTHING — даже если строка появилась между сухим прогоном и применением */
export function seedSql(plan: PlanItem[], at = Date.now()): string {
  const out = ["-- seed:variant-copies — строки game_overrides для копий трофеев вариантов (не перезаписывает существующие; базы не трогает)"];
  const todo = plan.filter((x) => !x.exists);
  for (const x of todo) {
    const d = q(JSON.stringify(x.data));
    out.push(`INSERT INTO game_override_audit (kind, target_id, before, after, version, granted_by, at) SELECT 'item', ${q(x.id)}, NULL, ${d}, 1, ${q(SEED_BY)}, ${at} WHERE NOT EXISTS (SELECT 1 FROM game_overrides WHERE kind = 'item' AND id = ${q(x.id)});`);
    out.push(`INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES ('item', ${q(x.id)}, ${d}, 1, ${q(SEED_BY)}, ${at}) ON CONFLICT(kind, id) DO NOTHING;`);
  }
  if (todo.length) out.push("UPDATE game_config_version SET v = v + 1 WHERE k = 'overrides';");
  return out.join("\n") + "\n";
}

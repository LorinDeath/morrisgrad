// Правки правил стратегии из админки: game_overrides (kind='strat_rules', id='main', data — JSON-патч поверх STRAT_CFG).
// Партия берёт снимок конфига в момент старта (L.cfg) — правка админа не меняет правила посреди идущей партии.
import { STRAT_CFG, type StratCfg } from "./rules";
import { deepMerge } from "./econ-cfg";
import { overridePatch, mergePatch } from "./cfg-override";
import { pathsPatch } from "./cfg-schema";

const KIND = "strat_rules", ID = "main", TTL = 30_000;
let cache: { at: number; cfg: StratCfg; patch: any; rev: number } | null = null;
/** t1243: длина текста в правках (описания технологий бывают до ~200 символов). Тот же предел в deepMerge (econ-cfg). */
export const TEXT_MAX = 400;

/** Числа зажаты в разумные пределы, неизвестные ключи и не-числа отброшены (deepMerge). */
export function sanitizePatch(p: any, depth = 0): any {
  if (!p || typeof p !== "object" || depth > 6) return undefined;
  const o: any = Array.isArray(p) ? [] : {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "number") { if (Number.isFinite(v)) o[k] = Math.max(-1000, Math.min(100000, v)); }
    else if (typeof v === "string") o[k] = v.slice(0, TEXT_MAX);
    else if (typeof v === "boolean") o[k] = v;
    else if (v && typeof v === "object") { const s = sanitizePatch(v, depth + 1); if (s !== undefined) o[k] = s; }
  }
  return o;
}
export function mergeCfg(patch: any): StratCfg { return deepMerge(STRAT_CFG, sanitizePatch(patch) || {}); }

/** t1243: снимок правил = код + старая правка (game_overrides) + «Цели и лиги» (league:N) + полная админка (p:<путь>, поверх всех).
 *  rev — номер версии правил из strat_cfg_rev (0 — правок через полную админку ещё не было). */
export async function loadStratCfg(env: any, fresh = false): Promise<{ cfg: StratCfg; patch: any; rev: number }> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache;
  let patch: any = {};
  try {
    const r: any = await env.GAME_DB?.prepare("SELECT data FROM game_overrides WHERE kind = ? AND id = ?").bind(KIND, ID).first();
    if (r?.data) patch = JSON.parse(r.data);
  } catch { patch = {}; }
  const rows = await loadOverrides(env);
  patch = mergePatch(sanitizePatch(patch) || {}, overridePatch(rows)); // G (t1209): «Цели и лиги» поверх
  patch = mergePatch(patch, pathsPatch(pathRows(rows))); // t1243: полная админка поверх всего
  cache = { at: Date.now(), cfg: mergeCfg(patch), patch, rev: ovCache?.rev || 0 };
  return cache;
}
/** G (t1209): правки лиг из strat_cfg_override; кэш в изоляте DO с коротким TTL (новая партия видит правку не позже чем через OV_TTL). */
const OV_TTL = 15_000; let ovCache: { at: number; rows: Record<string, Record<string, any>>; rev: number } | null = null;
/** t1243: строки полной админки: key "p:<путь>", json {"v": значение} → {путь: значение}. */
export const PATH_KEY = "p:";
export function pathRows(rows: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {}; for (const [k, r] of Object.entries(rows || {})) if (k.startsWith(PATH_KEY) && r && typeof r === "object" && "v" in r) o[k.slice(PATH_KEY.length)] = r.v; return o;
}
export function dropOverrideCache() { ovCache = null; cache = null; }
export async function loadOverrides(env: any, fresh = false): Promise<Record<string, Record<string, any>>> {
  if (!fresh && ovCache && Date.now() - ovCache.at < OV_TTL) return ovCache.rows;
  const rows: Record<string, Record<string, any>> = {}; let rev = 0;
  try { const rs: any = await env.GAME_DB?.prepare("SELECT key, json FROM strat_cfg_override").all();
    for (const r of rs?.results || []) try { const o = JSON.parse(r.json); if (o && typeof o === "object") rows[r.key] = o; } catch {} } catch {}
  try { const r: any = await env.GAME_DB?.prepare("SELECT MAX(rev) AS rev FROM strat_cfg_rev").first(); rev = Number(r?.rev) || 0; } catch {} // до миграции 0040 — 0
  ovCache = { at: Date.now(), rows, rev }; return rows;
}
export async function saveStratPatch(env: any, by: string, patch: any): Promise<{ ok?: true; err?: string }> {
  const clean = sanitizePatch(patch); if (!clean) return { err: "bad_patch" };
  const s = JSON.stringify(clean); if (s.length > 20000) return { err: "too_big" };
  await env.GAME_DB.prepare("INSERT INTO game_overrides (kind, id, data, version, updated_by, updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, version = game_overrides.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(KIND, ID, s, by, Date.now()).run();
  cache = null; return { ok: true };
}

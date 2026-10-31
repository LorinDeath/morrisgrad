// Игровой профиль (ТЗ §14.J): строка на игрока за партию (strat_player_stats, миграция 0028) и сводки.
// ПУБЛИЧНО: партии/победы по расам, % побед, рейтинги по лигам, любимая раса.
// ПРИВАТНО (только владелец; сервер проверяет личность в hub по WS): техно, типы Вождей по прокачке, рекорд убийств Вождём
// за партию, любимые таланты/ульты, средняя длина партии, статистика по картам. Максимальный уровень Вождя наружу не отдаётся.
export type StatRow = { match_id: string; user_id: string; race: string; result: "win" | "loss" | "draw"; rated: number; league: string | null;
  size: number; map_id: string | null; turns: number; duration_ms: number; techs: string; chief_type: string | null; chief_level: number | null;
  chief_kills: number; talents: string; ults: string; created_at: number };
const js = (s: string | null | undefined): string[] => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const top = (m: Map<string, number>, n = 5) => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([id, count]) => ({ id, count }));
const pct = (w: number, n: number) => (n ? Math.round((w / n) * 1000) / 10 : 0);

export function publicStats(rows: StatRow[]) {
  const races: Record<string, { matches: number; wins: number; winrate: number }> = {};
  let wins = 0;
  for (const r of rows) { const o = (races[r.race] ||= { matches: 0, wins: 0, winrate: 0 }); o.matches++; if (r.result === "win") { o.wins++; wins++; } }
  for (const o of Object.values(races)) o.winrate = pct(o.wins, o.matches);
  const fav = Object.entries(races).sort((a, b) => b[1].matches - a[1].matches || b[1].wins - a[1].wins)[0]?.[0] || null;
  return { matches: rows.length, wins, winrate: pct(wins, rows.length), races, favouriteRace: fav };
}
export function privateStats(rows: StatRow[]) {
  const techs = new Map<string, number>(), tal = new Map<string, number>(), ult = new Map<string, number>(), chief = new Map<string, number>();
  const maps: Record<string, { matches: number; wins: number; winrate: number }> = {};
  let rec = 0, recMatch: string | null = null, dur = 0, turns = 0;
  for (const r of rows) {
    for (const t of new Set(js(r.techs))) techs.set(t, (techs.get(t) || 0) + 1);
    for (const t of js(r.talents)) tal.set(t, (tal.get(t) || 0) + 1);
    for (const t of js(r.ults)) ult.set(t, (ult.get(t) || 0) + 1);
    if (r.chief_type) chief.set(r.chief_type, (chief.get(r.chief_type) || 0) + Math.max(0, (r.chief_level || 1) - 1)); // сумма полученных уровней
    if (r.chief_kills > rec) { rec = r.chief_kills; recMatch = r.match_id; }
    dur += r.duration_ms; turns += r.turns;
    const k = r.map_id || "rnd:" + r.size; const m = (maps[k] ||= { matches: 0, wins: 0, winrate: 0 }); m.matches++; if (r.result === "win") m.wins++;
  }
  for (const m of Object.values(maps)) m.winrate = pct(m.wins, m.matches);
  const n = rows.length || 1;
  return { topTechs: top(techs), topChiefTypes: top(chief).map((x) => ({ id: x.id, levelsGained: x.count })), chiefKillRecord: { kills: rec, match: recMatch },
    topTalents: top(tal), topUlts: top(ult), avgMatch: { minutes: Math.round(dur / n / 6000) / 10, turns: Math.round((turns / n) * 10) / 10 }, maps };
}

export async function addStats(env: any, rows: StatRow[]) {
  if (!env.GAME_DB || !rows.length) return;
  const q = "INSERT OR REPLACE INTO strat_player_stats (match_id,user_id,race,result,rated,league,size,map_id,turns,duration_ms,techs,chief_type,chief_level,chief_kills,talents,ults,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  await env.GAME_DB.batch(rows.map((r) => env.GAME_DB.prepare(q).bind(r.match_id, r.user_id, r.race, r.result, r.rated, r.league, r.size, r.map_id, r.turns, r.duration_ms, r.techs, r.chief_type, r.chief_level, r.chief_kills, r.talents, r.ults, r.created_at)));
}
async function rowsOf(env: any, uid: string, limit = 2000): Promise<StatRow[]> {
  const r: any = await env.GAME_DB.prepare("SELECT * FROM strat_player_stats WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(uid, limit).all();
  return r?.results || [];
}
export const getPublicStats = async (env: any, uid: string) => publicStats(await rowsOf(env, uid));
export const getPrivateStats = async (env: any, uid: string) => privateStats(await rowsOf(env, uid));

/** t1163: личная вкладка профиля для клиента (profile_get.priv) — русские названия из cfg, вид ульты chief|unit. Чистая функция (тест stats-test). */
export function privView(pv: ReturnType<typeof privateStats>, cfg: any) {
  const nm = new Map<string, string>();
  for (const t of cfg.techs || []) nm.set("t:" + t.id, t.name);
  for (const d of cfg.chiefs || []) { nm.set("c:" + d.id, d.name); for (const n of d.tree || []) nm.set("a:" + n.id, n.name); }
  for (const T of Object.values(cfg.unitTree || {}) as any[]) for (const a of T.act || []) nm.set("a:" + a.id, a.name);
  for (const rows of Object.values(cfg.talents || {}) as any[]) for (const pair of rows) for (const t of pair) nm.set("a:" + t.id, t.name);
  const ultOf = (id: string) => cfg.ults?.[id] ? { kind: "chief", name: cfg.ults[id].name } : cfg.unitUlts?.[id] ? { kind: "unit", name: cfg.unitUlts[id].name } : { kind: "chief", name: id };
  return {
    techs: pv.topTechs.map((x) => ({ id: x.id, name: nm.get("t:" + x.id) || x.id, n: x.count })),
    chiefsLeveled: pv.topChiefTypes.reduce((a, x) => a + x.levelsGained, 0),
    chiefTypes: pv.topChiefTypes.map((x) => ({ ...x, name: nm.get("c:" + x.id) || x.id })),
    recordChiefKills: { n: pv.chiefKillRecord.kills, match: pv.chiefKillRecord.match },
    talents: pv.topTalents.map((x) => ({ id: x.id, name: nm.get("a:" + x.id) || x.id, n: x.count })),
    ults: pv.topUlts.map((x) => ({ id: x.id, ...ultOf(x.id), n: x.count })),
    avgMatch: pv.avgMatch, maps: pv.maps,
  };
}


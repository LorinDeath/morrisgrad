// t1217: редактор и хаб карт игроков — размеры 4…100, точки спавна, витрина, хаб (лайки/избранное/комментарии),
// «без опыта и рейтинга» на неодобренных. D1 подменён bun:sqlite (миграции 0025/0026/0028/0034).
//   nice bun server/strat/maps-editor-test.ts
// @ts-ignore — модуль есть только в bun
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { validateMap, spawnsOf, duelSpawns, placeArmy, unreachableCells, tplSize, isMapSize, type MapData } from "./terrain";
import { STRAT_CFG, ensureSize, newGame, type StratCfg } from "./rules";
import { showcaseAll, showcaseMap } from "./showcase";
import { saveMap, resolveLobbyMap, hubList, likeMap, favMap, addComment, listComments, reportComment, modComment, countPlay, moderate, checkSave, thumb, cleanComment, getMapRow, listMaps, modQueue } from "./maps";
import { mapInPool, poolSet } from "./rating-db";
import { unratedReason } from "./rating";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const cfg = (): StratCfg => structuredClone(STRAT_CFG);

// ---- движок: любые размеры 4…100
ok(isMapSize(4) && isMapSize(100) && !isMapSize(3) && !isMapSize(101) && !isMapSize(7.5), "размер 4…100");
ok(tplSize(4) === 5 && tplSize(9) === 8 && tplSize(10) === 15 && tplSize(29) === 15 && tplSize(30) === 35 && tplSize(100) === 35, "шаблон правил по лиге");
for (const s of [4, 6, 9, 12, 50, 77, 100]) { const c = cfg(); const g = newGame(s, ["human" as any, "human" as any], 0, c); ok(g.size === s && g.pieces.filter((p) => p.kind === "king").length === 2 && c.sizes[s] && (c.econ as any).sizes[s], `newGame ${s}×${s} (cfg дописан)`); }
{ let thrown = false; try { newGame(101, ["human" as any, "human" as any], 0, cfg()); } catch { thrown = true; } ok(thrown, "101 — ошибка размера"); }

// ---- точки спавна
const blank = (s: number, id = "u0000000001"): MapData => ({ id, name: "t", size: s, t: ".".repeat(s * s), s: ".".repeat(s * s) });
const setS = (m: MapData, x: number, y: number, c: string) => { const a = m.s.split(""); a[y * m.size + x] = c; m.s = a.join(""); };
const setT = (m: MapData, x: number, y: number, c: string) => { const a = m.t.split(""); a[y * m.size + x] = c; m.t = a.join(""); };
{ const m = blank(20); setS(m, 3, 17, "P"); setS(m, 16, 2, "P"); const d = duelSpawns(m)!; ok(d && d[0][1] === 17 && d[1][1] === 2, "дуэль: нижняя и верхняя точки");
  const c = cfg(); const g = newGame(20, ["human" as any, "human" as any], 0, c, null, m); const k0 = g.pieces.find((p) => p.kind === "king" && p.owner === 0)!, k1 = g.pieces.find((p) => p.kind === "king" && p.owner === 1)!;
  ok(k0.x === 3 && k0.y === 17 && k1.x === 16 && k1.y === 2, "Вождь встаёт на свою точку спавна");
  ok(new Set(g.pieces.map((p) => p.y * 20 + p.x)).size === g.pieces.length, "армии не пересекаются");
  ok(g.pieces.filter((p) => p.owner === 0).every((p) => p.y >= 12) && g.pieces.filter((p) => p.owner === 1).every((p) => p.y <= 7), "армии у своих точек");
  ok((g.ec as any)?.cities?.some((c: any) => c.x === 3 && c.y === 17), "столица — на точке спавна"); }
{ const m = blank(10); setS(m, 4, 9, "P"); setS(m, 5, 8, "P"); ok(validateMap(m, { armyRows: 0, armyCols: [], army: ensureSize(cfg(), 10).army }).errors.includes("spawn_half"), "обе точки снизу — ошибка spawn_half"); }
{ const m = blank(10); setS(m, 0, 9, "P"); setS(m, 9, 0, "P"); for (let x = 0; x < 10; x++) { setT(m, x, 8, "w"); setT(m, x, 1, "w"); } setT(m, 5, 8, "b"); setT(m, 4, 1, "b");
  const v = validateMap(m, { armyRows: 0, armyCols: [], army: ensureSize(cfg(), 10).army }); ok(v.errors.includes("spawn_space"), "мало места у точки — spawn_space"); }
{ const m = blank(8); for (let x = 0; x < 8; x++) setT(m, x, 4, "#"); ok(unreachableCells(m).length === 24 && validateMap(m).errors.includes("unreachable"), "недостижимые клетки подсвечиваются"); }
{ const m = blank(12); setS(m, 6, 11, "P"); setS(m, 5, 0, "P"); ok(!checkSave(m).errors.length, "сохранение: 2 точки — ок"); const m2 = blank(12); ok(checkSave(m2).errors.includes("spawns_few"), "сохранение без точек — spawns_few");
  const m3 = blank(30); for (let i = 0; i < 9; i++) { setS(m3, i * 3, 29, "P"); } setS(m3, 1, 0, "P"); ok(checkSave(m3).errors.includes("spawns_many"), "больше 8 точек — spawns_many"); }

// ---- витрина
const sc = showcaseAll().filter((m) => m.id[0] === "s"); const bySize = (s: number) => sc.filter((m) => m.size === s).length;
ok(sc.length === 10 && bySize(4) === 1 && bySize(50) === 2 && bySize(75) === 3 && bySize(100) === 1 && bySize(8) && bySize(15) && bySize(35), "витрина: 10 карт (4, 2×50, 3×75, 100, 8/15/35)");
for (const m of sc) { const v = checkSave(m); ok(!v.errors.length, `витрина ${m.id} ${m.size}×${m.size} проходит проверки ${v.errors.join(",")}`);
  const g = newGame(m.size, ["human" as any, "elf" as any], 0, cfg(), null, m); ok(g.pieces.length > 4, `витрина ${m.id}: партия стартует`); }
ok(showcaseMap("s05") === showcaseMap("s05") && JSON.stringify(showcaseMap("s10")!.t.length) === "10000", "витрина детерминирована, 100×100");
{ const t = thumb(showcaseMap("s10")!); ok(t.pn === 48 && t.pt.length === 48 * 48, "миниатюра 100×100 → 48×48"); }

// ---- комментарии
ok(cleanComment("смотри https://evil.example/x тут")!.includes("[ссылка]"), "ссылки вырезаются");
ok(cleanComment("ты хуй")!.includes("\u2217"), "фильтр мата форума");
ok(Array.from(cleanComment("я".repeat(900))!).length === 500, "≤500 символов");

// ---- D1 (bun:sqlite)
const db = new Database(":memory:");
for (const f of ["0025_strategy.sql", "0026_strat_rating.sql", "0028_strat_player_stats.sql", "0034_strat_map_hub.sql", "0035_strat_modes.sql"]) db.exec(readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8"));
const env = { GAME_DB: { prepare: (q: string) => { const st = db.query(q); const b = (...a: any[]) => ({ first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => { const r = st.run(...a); return { meta: { changes: r.changes } }; } }); return { bind: b, ...b() }; } } };
const A = { pkey: "author1", nick: "Автор", verified: true }, B = { pkey: "friend", nick: "Друг", verified: true }, G = { pkey: "guest:x", nick: "Гость", verified: false };
const um = blank(24, "u"); setS(um, 12, 23, "P"); setS(um, 11, 0, "P"); setS(um, 5, 12, "M"); setS(um, 18, 11, "M");
const sv = await saveMap(env, A, { name: "Моя карта", size: 24, t: um.t, s: um.s }); ok(sv.id && /^u[0-9a-f]{10}$/.test(sv.id), "сохранение 24×24 (нестандартный размер)");
ok((await saveMap(env, G, { name: "Гостя", size: 24, t: um.t, s: um.s })).err === "login_required", "гость не сохраняет");
ok((await saveMap(env, A, { name: "Большая", size: 120, t: "", s: "" })).err === "bad_size", "120 — bad_size");
const id = sv.id!; ok((await getMapRow(env, id))!.status === "pending", "новая карта — на рассмотрении (без автопубликации)");
// неодобренная: автор играет и зовёт друзей, но без опыта и рейтинга
const rA = await resolveLobbyMap(env, id, 0, A.pkey); ok(rA.map && rA.xp === false && rA.status === "pending", "автор: можно играть, xp=false");
ok((await resolveLobbyMap(env, id, 0, B.pkey)).err === "map_not_approved", "чужой хост не может выбрать неодобренную");
const rAdm = await resolveLobbyMap(env, id, 0, "admin", true); ok(rAdm.map && rAdm.xp === false, "админ «Проверить в игре»: можно, но без опыта");
ok(!(await mapInPool(env, rA.map, "pending")), "неодобренная — не в рейтинговом пуле");
ok(unratedReason({ rated: false, mapInPool: false, standard: true, humans: 2, guests: 0, bots: 0, turns: 30, reason: "chief" } as any) === "not_rated_mode", "рейтинг выключен на неодобренной");
ok(!(await countPlay(env, id, [A.pkey, B.pkey])), "неодобренная — партия не считается");
ok(!(await hubList(env, B.pkey, {})).some((x) => x.id === id), "хаб: чужим неодобренную не видно");
ok((await hubList(env, A.pkey, { tab: "mine" })).some((x) => x.id === id && x.status === "pending"), "хаб «Мои»: автор видит «на рассмотрении»");
ok((await likeMap(env, B, id, true)).err === "not_found", "лайк неодобренной — нельзя");
ok(((await modQueue(env)) as any).list.some((x: any) => x.id === id), "очередь модерации");
await moderate(env, "admin", id, "approve");
ok((await resolveLobbyMap(env, id, 0, B.pkey)).xp === true, "после одобрения — с опытом");
ok(!(await mapInPool(env, rA.map, "approved")), "одобрена, но не рейтинговая, пока Алекс не добавил");
await poolSet(env, "admin", (await getMapRow(env, id)) as any, true); ok(await mapInPool(env, rA.map, "approved"), "Алекс добавил в рейтинговые");
ok((await hubList(env, B.pkey, {})).some((x) => x.id === id && x.rated), "хаб: одобренная видна всем, отметка «рейтинговая»");
// правка одобренной — новая версия на модерации, старая остаётся
const v2 = await saveMap(env, A, { id, name: "Моя карта 2", size: 24, t: um.t, s: um.s }); ok(v2.id && v2.id !== id && (await getMapRow(env, id))!.status === "approved", "правка одобренной — новая версия, старая в хабе");
// лайки/избранное/комментарии
ok((await likeMap(env, B, id, true)).err === "play_first", "лайк — только после сыгранной партии");
db.run("INSERT INTO strat_player_stats (match_id,user_id,race,result,rated,league,size,map_id,turns,duration_ms,techs,chief_type,chief_level,chief_kills,talents,ults,created_at) VALUES ('m1','friend','human','win',0,'normal',24,?,10,1,'[]',null,null,0,'[]','[]',1)", [id]);
ok((await likeMap(env, B, id, true)).ok && (await likeMap(env, B, id, true)).ok, "лайк ставится (повтор не удваивает)");
ok((await likeMap(env, G, id, true)).err === "login_required", "гость не лайкает");
ok((await favMap(env, B, id, true)).ok, "в избранное");
ok(await countPlay(env, id, [B.pkey, "other"]) && !(await countPlay(env, id, [A.pkey, B.pkey])), "партии: считаются без автора");
ok((await addComment(env, B, id, "Отличная карта!")).ok && (await addComment(env, B, id, "ещё")).err === "rate", "комментарий + лимит частоты");
let h = (await hubList(env, B.pkey, {})).find((x) => x.id === id)!; ok(h.likes === 1 && h.favs === 1 && h.plays === 1 && h.comments === 1 && h.liked && h.faved, "счётчики хаба");
ok((await hubList(env, B.pkey, { tab: "fav" })).length === 1, "вкладка «Избранное»");
ok((await hubList(env, B.pkey, { league: "normal" })).every((x) => x.size >= 10 && x.size <= 35) && (await hubList(env, B.pkey, { league: "tactic" })).every((x) => x.size >= 36), "фильтр по лиге");
ok((await hubList(env, B.pkey, { q: "моя" })).some((x) => x.id === id) && !(await hubList(env, B.pkey, { q: "моя" })).some((x) => x.showcase), "поиск");
{ const l = await hubList(env, null, { sort: "likes" }); ok(l[0].id === id, "сортировка по лайкам"); const p = await hubList(env, null, { sort: "plays" }); ok(p[0].id === id, "сортировка по партиям"); }
ok((await hubList(env, null, {})).filter((x) => x.showcase).length === 19, "витрина в хабе (10 дуэльных + 9 под 2×2/«Все»)");
await likeMap(env, B, id, false); h = (await hubList(env, B.pkey, {})).find((x) => x.id === id)!; ok(h.likes === 0 && !h.liked, "лайк снимается");
const cm = (await listComments(env, id))[0]; await reportComment(env, A, cm.id); ok(((await modQueue(env)) as any).comments.length === 1, "жалоба на комментарий — в очередь");
await modComment(env, "admin", cm.id, "ban"); ok((await listComments(env, id)).length === 0 && (await addComment(env, B, id, "снова")).err === "banned", "админ: удалить и запретить комментарии");
ok((await listMaps(env, B.pkey, 50)).filter((x: any) => /^s/.test(x.id)).length === 2, "лобби: витрина 50×50 в списке");
ok((await resolveLobbyMap(env, "s10", 0, B.pkey)).xp === true && !(await mapInPool(env, showcaseMap("s10"), "approved")), "витрина: с опытом, рейтинг — только если Алекс добавит");
console.log(`\n${n - fails}/${n} PASS`); if (fails) process.exit(1);

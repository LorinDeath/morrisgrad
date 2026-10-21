// Город Альказак (city.ts + cityBuild.ts): журнал убийц, PK-режим, PvP, купол (в т.ч. интерьеры), розы, здания/двери/комнаты,
// места NPC, масштаб по rTiles, схемы админки. Запуск: esbuild --bundle → node.
import { CITY_CFG, PK_CFG, CITY_TILE, KillLog, newPk, pkToggle, pkTick, pkInterrupt, pkLeft, pkPublic, pkUi, pvpAllowed, pkGrantDefense, inCity, pushOut, cityR, ROOM_LIMIT, pkIdle, cityKeepOut, cityMobPushPx, cityMobAggroPadPx } from "./city";
import { cityBuildings, buildingById, roomAt, roomSpawn, onExit, outsideDoor, atDoor, doorNear, resolveRoom, roomWalkable, roomBounds, roomCell, slotPos, cityClient, cityNpcDefs, ROOMS, BUILD_DEF, buildingColliders, inRoomArea, ROOM_SPAN, DARK_PROPS } from "./cityBuild";
import { ROSE_ADJ, roseAgeOf, roseCurseOf, roseOpenMs, roseStage, DAY_MS } from "./bmCfg";
import { resolveWorld, blockedWorld, boundsAt } from "./propCollision";
import { walkable } from "./walkable";
import { validatePatch } from "./overrides";
import { dnClient } from "./dayNight";
import { emptyCellsInDome, cityGround, walkCell, walkColliders, mapProps, DARK_INDEX, roseBedPx, ROSE_BED, MAP, WELL_MOVES, WALK_SHIFT, fenceRuns } from "./cityMap";
let ok = 0, bad = 0; const t = (n: string, c: any, x?: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n, x ?? "")); };
const cfg0 = JSON.parse(JSON.stringify({ ...CITY_CFG, npc: undefined })); const npc0 = JSON.parse(JSON.stringify(CITY_CFG.npc));
const reset = () => { Object.assign(CITY_CFG, JSON.parse(JSON.stringify(cfg0))); CITY_CFG.npc = JSON.parse(JSON.stringify(npc0)); };

// ——— журнал убийц ———
{ reset(); const L = new KillLog(), T0 = 1_000_000_000;
  t("моб: 4 убийства — не убийца", (L.note("a", "m", false, T0), L.note("a", "m", false, T0 + 1), L.note("a", "m", false, T0 + 2), L.note("a", "m", false, T0 + 3), !L.status("a", T0 + 10).killer));
  L.note("a", "m", false, T0 + 4); const s = L.status("a", T0 + 10);
  t("моб: 5 за 10 мин — убийца, до 1-го + 10 мин", s.killer && s.why === "m" && s.until === T0 + 600000, s);
  t("моб: через 10 мин — свободен", !L.status("a", T0 + 600001).killer);
  t("игрок: 1 убийство — убийца", (L.note("b", "p", false, T0), L.status("b", T0 + 1).why === "p"));
  t("из-под купола — не считается", !L.note("c", "p", true, T0) && !L.status("c", T0 + 1).killer);
  CITY_CFG.killerPOn = false; t("правило «игроки» выключено", !L.status("b", T0 + 1).killer); CITY_CFG.killerPOn = true;
  CITY_CFG.killerM = 2; t("порог мобов — из админки", (L.note("d", "m", false, T0), L.note("d", "m", false, T0), L.status("d", T0).killer));
  CITY_CFG.windowMin = 1; t("окно — из админки", !L.status("d", T0 + 60001).killer); reset(); }

// ——— PK-режим ———
{ reset(); const s = newPk(), T0 = 5_000_000;
  const r = pkToggle(s, T0); t("PK: вход — 7 с", r.k === "start" && r.to === true && r.sec === PK_CFG.enterSec && pkLeft(s, T0) === 7);
  t("PK: до конца отсчёта — не включён", !pkTick(s, T0 + 6999) && !s.pk);
  t("PK: включён через 7 с", pkTick(s, T0 + 7000) && s.pk);
  pkToggle(s, T0 + 8000); t("PK: выход — 30 с", s.to === false && pkLeft(s, T0 + 8000) === 30);
  t("PK: бой сбрасывает отсчёт", pkInterrupt(s) && s.to === null && s.pk);
  pkToggle(s, T0 + 9000); t("PK: повторное нажатие — отмена", pkToggle(s, T0 + 9500).k === "cancel" && s.to === null);
  PK_CFG.on = false; const s2 = newPk(); t("PK выключен в админке — нельзя включить", pkToggle(s2).k === "off"); PK_CFG.on = true; }
{ const a = newPk(), b = newPk(), now = 10_000; a.pk = true;
  t("PvP: PK бьёт не-PK", pvpAllowed(a, b, "b", false, false, now) === "pk");
  t("PvP: в безопасной зоне — нет", pvpAllowed(a, b, "b", true, false, now) === "" && pvpAllowed(a, b, "b", false, true, now) === "");
  t("PvP: не-PK без права ответа — нет", pvpAllowed(b, a, "a", false, false, now) === "");
  pkGrantDefense(b, "a", now); t("PvP: самооборона после удара PK", pvpAllowed(b, a, "a", false, false, now + 1000) === "def");
  t("PvP: право ответа истекает", pvpAllowed(b, a, "a", false, false, now + 31000) === ""); }

// ——— купол: радиус, интерьеры, выталкивание ———
{ reset(); const R = cityR();
  t("купол по умолчанию: R = 40 клеток (80×80, финальный купол Историка)", R === 40 * CITY_TILE && CITY_CFG.rTiles === 40);
  t("центр — в городе, за краем — нет", inCity(CITY_CFG.x, CITY_CFG.y) && !inCity(CITY_CFG.x + R + 1, CITY_CFG.y));
  t("интерьеры — тоже город", inCity(ROOM_LIMIT - 100, ROOM_LIMIT - 100));
  const [px, py] = pushOut(CITY_CFG.x + 10, CITY_CFG.y + 5, 24); t("выталкивание: за край", !inCity(px, py) && Math.hypot(px - CITY_CFG.x, py - CITY_CFG.y) <= R + 30);
  const inn = buildingById("tavern")!; const [qx, qy] = pushOut(inn.ox + 100, inn.oy + 100, 24);
  t("выталкивание из дома: за край со стороны двери", !inCity(qx, qy) && Math.sign(qx - CITY_CFG.x) === Math.sign(inn.door!.x - CITY_CFG.x) && Math.sign(qy - CITY_CFG.y) === Math.sign(inn.door!.y - CITY_CFG.y), [qx, qy]);
  CITY_CFG.rTiles = 48; t("rTiles 48 → R = 1536 px", cityR() === 1536 && inCity(CITY_CFG.x + 1500, CITY_CFG.y)); reset(); }

// ——— розы ———
{ reset(); const now = 100 * DAY_MS, r = { id: Number(CITY_CFG.roseId), born: now - 1 * DAY_MS }, other = { id: 42, born: now - 1 * DAY_MS };
  t("роза города: сразу раскрыта (стадия 6)", roseStage(roseAgeOf(r, now)) >= 5 && roseAgeOf(r, now) > roseOpenMs());
  t("роза города: без проклятой земли", roseCurseOf({ ...r, born: now - 40 * DAY_MS }, now) === 0);
  t("другие розы — как обычно", roseAgeOf(other, now) === DAY_MS && roseCurseOf({ id: 42, born: now - 40 * DAY_MS }, now) > 0);
  t("внутри купола проклятье роз не действует", ROSE_ADJ.noCurseAt!(CITY_CFG.x + 100, CITY_CFG.y) && !ROSE_ADJ.noCurseAt!(CITY_CFG.x + 5000, CITY_CFG.y));
  CITY_CFG.roseBloom = false; t("roseBloom выкл → растёт как обычно", roseAgeOf(r, now) === DAY_MS);
  CITY_CFG.on = false; t("город выключен → роза обычная", roseAgeOf({ ...r, born: now - 40 * DAY_MS }, now) === 40 * DAY_MS && roseCurseOf({ ...r, born: now - 40 * DAY_MS }, now) > 0); reset(); }

// ——— здания, двери, комнаты (данные арта) ———
{ reset(); const B = cityBuildings(), withRoom = B.filter((b) => b.room);
  t("здания: все из BUILD_DEF", B.length === BUILD_DEF.length);
  t("здания внутри купола", B.every((b) => inCity(b.x, b.y, -2 * CITY_TILE)));
  t("комнаты: дома с интерьером ≥ 6 (дома + палатки)", withRoom.length >= 6, withRoom.map((b) => b.id + ":" + b.room).join(","));
  t("комнаты не пересекаются и влезают в ROOM_SPAN", withRoom.every((b) => b.w <= ROOM_SPAN && b.h <= ROOM_SPAN) && new Set(withRoom.map((b) => b.ox)).size === withRoom.length);
  for (const b of withRoom) {
    const R = ROOMS[b.room!], [sx, sy] = roomSpawn(b);
    t(`${b.id}: дверь есть`, !!b.door);
    t(`${b.id}: точка у двери — проходима (коллайдер здания не закрывает)`, walkable("arinar", b.door!.x, b.door!.y + 12), [b.door, blockedWorld("arinar", b.door!.x, b.door!.y + 12)]);
    t(`${b.id}: точка у двери — триггер входа`, doorNear(b.door!.x, b.door!.y + 4)?.id === b.id);
    const [ox, oy] = outsideDoor(b); t(`${b.id}: выход — вне триггера и проходим`, !atDoor(b, ox, oy) && walkable("arinar", ox, oy), [ox, oy]);
    t(`${b.id}: спавн комнаты — проходим и не на выходе`, roomAt(sx, sy)?.id === b.id && roomWalkable(sx, sy) && !onExit(b, sx, sy), [sx, sy]);
    // BFS по сетке: от спавна до клетки E
    const T = 32, W = R.size[0], H = R.size[1], seen = new Set<string>(), q: [number, number][] = [[Math.floor((sx - b.ox) / T), Math.floor((sy - b.oy) / T)]]; let found = false;
    while (q.length) { const [cx, cy] = q.shift()!; const k = cx + "," + cy; if (seen.has(k)) continue; seen.add(k); const c = roomCell(b, cx, cy); if (c === "#") continue; if (c === "E") { found = true; break; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < W && cy + dy < H) q.push([cx + dx, cy + dy]); }
    t(`${b.id}: от спавна можно дойти до выхода`, found);
    const ex = R.exit?.[0]; t(`${b.id}: клетка выхода — триггер`, ex && onExit(b, b.ox + ex[0] * T + 16, b.oy + ex[1] * T + 16));
    for (const s of R.npc_spots || []) t(`${b.id}: место NPC «${s.id}» — на полу комнаты`, roomCell(b, Math.floor(s.px[0] / T), Math.floor(s.px[1] / T)) === "." && roomAt(b.ox + s.px[0], b.oy + s.px[1])?.id === b.id, s.px);
    const [wx, wy] = resolveRoom(b.ox + 2, b.oy + 2); t(`${b.id}: стены комнаты выталкивают`, roomWalkable(wx, wy) || roomCell(b, Math.floor((wx - b.ox) / T), Math.floor((wy - b.oy) / T)) !== "#", [wx, wy]);
    const [lo, hi] = boundsAt("arinar", sx, sy); t(`${b.id}: границы движения — комната`, lo === b.ox && hi >= b.ox + Math.max(b.w, b.h) - 1 && lo === roomBounds(b)[0]);
    const [rx, ry] = resolveWorld("arinar", sx, sy); t(`${b.id}: resolveWorld в комнате не двигает свободную точку`, Math.hypot(rx - sx, ry - sy) < 1);
  }
  t("коллайдеры зданий есть", buildingColliders().length >= BUILD_DEF.length);
  t("пространство мира — не комната", !inRoomArea(CITY_CFG.x, CITY_CFG.y) && roomAt(CITY_CFG.x, CITY_CFG.y) === null); }

// ——— места NPC ———
{ reset(); const inside = (CITY_CFG.npc as any[]).filter((s) => s.house);
  t("места NPC в зданиях — по npc_spots", inside.length > 0 && inside.every((s) => { const p = slotPos(s); const b = buildingById(s.house); return !b?.room || (p && roomAt(p[0], p[1])?.id === b.id); }));
  const outside = (CITY_CFG.npc as any[]).filter((s) => !s.house); t("места снаружи — в куполе", outside.every((s) => { const p = slotPos(s)!; return inCity(p[0], p[1]); }));
  const d = cityNpcDefs(); t("реестр NPC: выключенные — world '-'", Object.values(d).every((n: any) => (n.world === "-") === !(CITY_CFG.npc as any[])[n.city - 1].on));
  const c = cityClient(); t("клиенту: здания с комнатами", c.b.length === BUILD_DEF.length && c.b.some((x: any) => x[4])); }

// ——— карта Историка (alkazak_map.json): авторская раскладка, радиус купола настраивается ———
{ reset(); const a = buildingById("tavern")!; CITY_CFG.rTiles = 48; const b = buildingById("tavern")!;
  t("rTiles 48: раскладка не растягивается (карта — источник правды)", a.x === b.x && a.y === b.y && b.ox === a.ox && b.room === a.room);
  for (const r of [36, 40, 48, 56]) { CITY_CFG.rTiles = r; t(`R ${r}: пустых клеток внутри купола — 0`, emptyCellsInDome(r) === 0, emptyCellsInDome(r)); }
  reset();
  t("11 зданий карты: таверна, 7 домов, 3 шатра", cityBuildings().length === 11 && cityBuildings().filter((b) => b.room === "shop_tavern").length === 1 && cityBuildings().filter((b) => b.room === "tent").length === 3 && cityBuildings().filter((b) => b.room === "house_living").length === 7);
  t("у каждого здания свой экземпляр комнаты", new Set(cityBuildings().map((b) => b.ox)).size === 11);
  t("основание здания = интерьер (9×8 / 12×10 / 8×7)", cityBuildings().every((b) => b.rect[2] === b.w && b.rect[3] === b.h), cityBuildings().map((b) => [b.id, b.rect[2], b.w, b.rect[3], b.h]));
  t("дверь таверны — клетки (778,94)–(779,94)", (() => { const d = buildingById("tavern")!.door!; return walkCell(778, 94) === "D" && walkCell(779, 94) === "D" && Math.floor(d.x / 32) === 779 && Math.floor(d.y / 32) === 94; })());
  t("застройка не дальше r 37.7 клетки", cityBuildings().every((b) => [[b.rect[0], b.rect[1]], [b.rect[0] + b.rect[2], b.rect[1]], [b.rect[0], b.rect[1] + b.rect[3]], [b.rect[0] + b.rect[2], b.rect[1] + b.rect[3]]].every(([x, y]) => Math.hypot(x - CITY_CFG.x, y - CITY_CFG.y) <= 37.7 * 32)));
  t("за куполом нет черноты без льда (кромка обрезана)", (() => { for (let gj = 59; gj < 152; gj++) for (let gi = 723; gi < 816; gi++) { const d = Math.hypot((gi + 0.5) * 32 - CITY_CFG.x, (gj + 0.5) * 32 - CITY_CFG.y) / 32; if (d <= 40) continue; const g = cityGround(gi, gj); if (g && !g.dover.some((x) => /^ice_/.test(Object.keys(DARK_INDEX).find((k) => DARK_INDEX[k] === x) || ""))) return false; } return true; })());
  t("внутри купола лёд карты убран (только у кромки снаружи)", (() => { for (let gj = 59; gj < 152; gj++) for (let gi = 723; gi < 816; gi++) { const d = Math.hypot((gi + 0.5) * 32 - CITY_CFG.x, (gj + 0.5) * 32 - CITY_CFG.y) / 32; if (d > 40) continue; const g = cityGround(gi, gj); if (!g || g.dover.some((x) => /^ice_/.test(Object.keys(DARK_INDEX).find((k) => DARK_INDEX[k] === x) || ""))) return false; } return true; })());
  { const FV = /^dm_fence_(v|corner)$/, M = mapProps(), base = M.filter((p) => !FV.test(p.k));
    t("пропсы карты: 253 − клумба розы (−5) − 60 узловых столбов колонн (4 одиночных — в клумбе) (→ вертикальный забор), остальные в атласе", base.length === 248 - 60 && base.every((p) => DARK_PROPS.keys?.[p.k]), base.filter((p) => !DARK_PROPS.keys?.[p.k]).map((p) => p.k)); }
  t("стены/заборы из сетки walk — коллайдеры", walkColliders().length > 500 && !walkable("arinar", ...((): [number, number] => { const b = buildingById("house_elder")!; return [b.rect[0] + 100, b.rect[1] + 100]; })()));
  const rp = cityClient().rose; t("роза города рисуется в точке карты (24608, 3232) — центр травяной клумбы", rp && rp.x === 24608 && rp.y === 3232 && rp.id === "1792366351175927", rp);
  const pts: Record<string, [number, number]> = { "Староста": [24496, 3192], "Хозяин таверны": [24896, 3092], "Торговка": [24496, 3320], "Огородник": [24240, 3480], "Беженка": [25584, 3864], "Дозорный": [23504, 3448] };
  for (const [nm, w] of Object.entries(pts)) { const s = (CITY_CFG.npc as any[]).find((x) => x.name === nm && !x.house); const p = s && slotPos(s); t(`NPC «${nm}» — в точке карты`, p && p[0] === w[0] && p[1] === w[1], p); }
  const spotsOk = (CITY_CFG.npc as any[]).filter((s) => s.house).every((s) => { const b = buildingById(s.house); return b && (ROOMS[b.room!].npc_spots || []).some((q: any) => q.id === s.spot); });
  t("места NPC в зданиях — существующие npc_spots своего интерьера", spotsOk);
  t("в каждом здании есть своё место NPC", cityBuildings().every((b) => (CITY_CFG.npc as any[]).some((s) => s.house === b.id)));
  const P1 = slotPos({ house: "house_n1", spot: "table" })!, P2 = slotPos({ house: "house_n2", spot: "table" })!; t("одинаковые шаблоны — разные экземпляры мест", P1[0] !== P2[0] && roomAt(P1[0], P1[1])?.id === "house_n1" && roomAt(P2[0], P2[1])?.id === "house_n2"); }

// ——— узлы ресурсов: под куполом — за край (кристалл 1113 и др.) ———
{ reset(); const { genNodes, ZONE_GEN } = await import("./zoneGen");
  const N = genNodes(ZONE_GEN.seed, "arinar"), n1113 = N.find((n) => n.id === 1113)!;
  t("узлы: ни одного под куполом", N.every((n) => !inCity(n.x, n.y, 24)));
  t("кристалл 1113: за краем купола, рядом с прежним местом (23928, 4027) — сдвиг ≈ до края + 2 клетки", n1113 && !inCity(n1113.x, n1113.y) && Math.hypot(n1113.x - 23928, n1113.y - 4027) < cityR() - Math.hypot(23928 - CITY_CFG.x, 4027 - CITY_CFG.y) + 2 * CITY_TILE + 8, n1113);
  t("кристалл 1113: на проходимой земле", n1113 && walkable("arinar", n1113.x, n1113.y), n1113);
  const moved = N.filter((n) => Math.abs(Math.hypot(n.x - CITY_CFG.x, n.y - CITY_CFG.y) - (cityR() + 64)) < 2);
  t("перенесённые узлы проходимы", moved.every((n) => walkable("arinar", n.x, n.y)), moved.map((n) => n.id));
  console.log("     перенесены:", moved.map((n) => `${n.id} ${n.type} → (${n.x}, ${n.y})`).join("; "));
  CITY_CFG.rTiles = 64; const N64 = genNodes(ZONE_GEN.seed, "arinar"); t("rTiles 64: узлы тоже за краем", N64.every((n) => !inCity(n.x, n.y, 24)) && N64.length === N.length); reset(); }

// ——— R = 40 (по умолчанию): лагеря и мобы под куполом убраны, босс и указатель — снаружи ———
{ reset(); const { Zone } = await import("./zone"); const { ZONE_GEN, WORLD_GEN, genNodes } = await import("./zoneGen");
  const z: any = new Zone("arinar", [], genNodes(ZONE_GEN.seed), { proc: true, seed: ZONE_GEN.seed });
  z.keepOut = { inside: (x: number, y: number, pad = 0) => inCity(x, y, pad), out: (x: number, y: number) => pushOut(x, y, 40) };
  const before = new Set(z.camps.map((c: any) => c.id)); const n = z.pruneKeepOut(); const gone = [...before].filter((id) => !z.camps.some((c: any) => c.id === id)).sort((a: any, b: any) => a - b);
  t("R40: убраны лагеря 85, 142, 144", JSON.stringify(gone) === JSON.stringify([85, 142, 144]), gone);
  t("R40: мобов под куполом не осталось", z.mobs.filter((m: any) => !m.dead && m.respawnAt !== -1 && m.special !== "boss" && inCity(m.sx ?? m.x, m.sy ?? m.y)).length === 0, n);
  const boss = WORLD_GEN.arinar.bosses.find((b: any) => b.key === "ice_thorn_matron@24"); t("R40: логово Матроны (1838 px) снаружи", boss && !inCity(boss.x, boss.y, 200));
  t("R40: указатель sign:patch24 (22540, 3800) снаружи", !inCity(22540, 3800, 400)); reset(); }

// ——— моб ↔ купол (админка: mobPushPx / mobAggroPadPx / mobBossesOut / mobDomeFlash); по умолчанию — прежнее поведение ———
{ reset(); const { Zone } = await import("./zone"); const { ZONE_GEN } = await import("./zoneGen");
  const z: any = new Zone("arinar", [], [], { proc: true, seed: ZONE_GEN.seed }); z.keepOut = cityKeepOut(); const R = cityR();
  const m: any = z.mobs.find((q: any) => !q.dead && q.special !== "boss"), b: any = z.mobs.find((q: any) => !q.dead && q !== m && q.special !== "boss"); if (b) b.special = "boss"; // особый «босс» (в тестовой зоне боссы не заспавнены)
  const put = (q: any) => { q.x = CITY_CFG.x + 100; q.y = CITY_CFG.y + 50; q.reset = true; z.events.length = 0; z.solid(q); return Math.hypot(q.x - CITY_CFG.x, q.y - CITY_CFG.y); };
  t("купол/моб: по умолчанию 40 / 24 / боссы тоже / вспышка", CITY_CFG.mobPushPx === 40 && CITY_CFG.mobAggroPadPx === 24 && CITY_CFG.mobBossesOut === true && CITY_CFG.mobDomeFlash === true);
  t("купол/моб: выталкивается на R + 40", m && Math.abs(put(m) - (R + 40)) < 1.5, m && put(m));
  m.domeFlashAt = 0; put(m); const ev1 = z.events.filter((e: any) => e.k === "dome_repel").length; put(m); const ev2 = z.events.filter((e: any) => e.k === "dome_repel").length;
  t("купол/моб: вспышка при выталкивании, повтор — не чаще раза в 3 с", ev1 === 1 && ev2 === 0, [ev1, ev2]);
  CITY_CFG.mobDomeFlash = false; m.domeFlashAt = 0; put(m); t("купол/моб: вспышка выкл — события нет", !z.events.some((e: any) => e.k === "dome_repel"));
  CITY_CFG.mobPushPx = 120; t("купол/моб: mobPushPx 120 → R + 120", Math.abs(put(m) - (R + 120)) < 1.5, put(m));
  CITY_CFG.mobPushPx = 9999; t("купол/моб: mobPushPx в пределах 0…400", cityMobPushPx() === 400); CITY_CFG.mobPushPx = "x"; t("купол/моб: мусор → 40", cityMobPushPx() === 40);
  CITY_CFG.mobAggroPadPx = 60; t("купол/моб: запас агро из админки", z.keepOut.aggroPad() === 60); CITY_CFG.mobAggroPadPx = -5; t("купол/моб: запас агро ≥ 0", cityMobAggroPadPx() === 0);
  { const q: any = m; q.x = CITY_CFG.x - R - 80; q.y = CITY_CFG.y; q.sx = CITY_CFG.x + R + 80; q.sy = CITY_CFG.y + 30; q.reset = true; q.targetSid = null; let inside = 0; q.spOk = 1; const PL = new Map([["p1", { sid: "p1", x: CITY_CFG.x, y: CITY_CFG.y + R + 250, hp: 100, maxHp: 100, dead: false, lvl: 1 } as any]]), T0 = Date.now();
    for (let i = 0; i < 400; i++) { z.update(0.05, T0 + i * 50, PL, () => {}, () => {}); if (Math.hypot(q.x - CITY_CFG.x, q.y - CITY_CFG.y) < R) inside++; }
    t("купол/моб: сброшенный моб идёт домой в обход купола (по ободу, не внутри), за 20 с — на той стороне", inside === 0 && q.x > CITY_CFG.x, [inside, Math.round(q.x - CITY_CFG.x), Math.round(q.y - CITY_CFG.y)]); }
  { const { DOME_FLASH_PER_SEC } = await import("./zone"); z.domeFlashWin = { t: 0, n: 0 }; z.events.length = 0; CITY_CFG.mobDomeFlash = true;
    for (const q of z.mobs.slice(0, 300)) { q.domeFlashAt = 0; q.x = CITY_CFG.x + 100; q.y = CITY_CFG.y; q.reset = true; z.solid(q); }
    t("купол/моб: толпа у купола — вспышек не больше лимита в секунду на зону", z.events.filter((e: any) => e.k === "dome_repel").length === DOME_FLASH_PER_SEC, z.events.length); }
  reset(); t("купол/моб: босс по умолчанию тоже выталкивается", b && put(b) > R, b && b.type);
  CITY_CFG.mobBossesOut = false; t("купол/моб: mobBossesOut выкл — босс не выталкивается", b && put(b) < R); t("купол/моб: …а обычный — да", put(m) > R);
  CITY_CFG.mobsOut = false; t("купол/моб: mobsOut выкл — никого не выталкивает", put(m) < R);
  reset(); }

// ——— PK: выгрузка при выходе, права ответа не копятся ———
{ reset(); const s = newPk(), T0 = 9_000_000; t("PK: без отсчёта — можно выгрузить", pkIdle(s, T0));
  pkToggle(s, T0); t("PK: идёт отсчёт — держим (переживёт переподключение)", !pkIdle(s, T0 + 1000)); s.to = null;
  pkGrantDefense(s, "a", T0); t("PK: живое право ответа — держим", !pkIdle(s, T0 + 1000)); t("PK: право истекло — выгрузить", pkIdle(s, T0 + 3_600_000));
  for (let i = 0; i < 200; i++) pkGrantDefense(s, "x" + i, T0 + i * 3_600_000); t("PK: истёкшие права ответа не копятся (200 нападавших в разное время → ≤ 17)", s.def.size <= 17, s.def.size); }

// ——— админка ———
{ const v = validatePatch("city", "main", { rTiles: 96, roseBloom: false, roseId: "123" } as any);
  t("админка: rTiles до 160, поля розы", typeof v === "object", v);
  t("админка: поля моб↔купол принимаются", typeof validatePatch("city", "main", { mobPushPx: 80, mobAggroPadPx: 0, mobBossesOut: false, mobDomeFlash: false } as any) === "object");
  t("админка: mobPushPx > 400 — отказ", typeof validatePatch("city", "main", { mobPushPx: 401 } as any) === "string");
  t("админка: mobAggroPadPx < 0 / > 200 — отказ", typeof validatePatch("city", "main", { mobAggroPadPx: -1 } as any) === "string" && typeof validatePatch("city", "main", { mobAggroPadPx: 201 } as any) === "string");
  t("админка: деспауна/убийства мобов у купола нет (фарм опыта)", typeof validatePatch("city", "main", { mobDespawn: true } as any) === "string" || !("mobDespawn" in (validatePatch("city", "main", { mobDespawn: true } as any) as any)));
  const v2 = validatePatch("city", "main", { rTiles: 500 } as any); t("админка: rTiles > 160 — отказ или кламп", typeof v2 === "string" || (v2 as any).rTiles <= 160, v2); }

// ——— решения пользователя: NPC в городе нет; роза — на траве (клумба снята), фонтан на месте ———
{ CITY_CFG.x = 24624; CITY_CFG.y = 3376; CITY_CFG.rTiles = 40;
  t("NPC: все места выключены (данные есть, жителей нет)", (CITY_CFG.npc as any[]).length === 24 && (CITY_CFG.npc as any[]).every((n) => !n.on));
  t("NPC: клиенту не уходит ни одного жителя", (cityClient().npc || []).length === 0, cityClient().npc);
  let bedOk = true; for (let i = ROSE_BED.i0; i <= ROSE_BED.i1; i++) for (let j = ROSE_BED.j0; j <= ROSE_BED.j1; j++) { const g: any = cityGround(i, j, 40); if (!g || !/^grass/.test(g.base) || (g.dover || []).length) bedOk = false; }
  t("роза: клумба стала травой (без оверлеев tilled_rot/blight)", bedOk);
  const [bx0, by0, bx1, by1] = roseBedPx(); const rp = (CITY_CFG as any).rosePos;
  t("роза: точка розы — на траве клумбы", rp[0] >= bx0 && rp[0] < bx1 && rp[1] >= by0 && rp[1] < by1, { rp, bed: [bx0, by0, bx1, by1] });
  t("роза: столбики и ведро клумбы убраны", !mapProps(40).some((p) => /^dm_(fence|bucket)/.test(p.k) && p.x > bx0 - 32 && p.x < bx1 + 32 && p.y > by0 - 32 && p.y < by1 + 32));
  t("фонтан на месте", mapProps(40).some((p) => p.k === "dm_fountain" && p.x === 24624 && p.y === 3400));
  t("роза: клетка проходима вокруг (клумба не стена)", walkable("arinar", rp[0] + 40, rp[1] + 30)); }
// ——— PK: публичное состояние (видят все) — полоса отсчёта над героем, значок PK ———
{ const P = newPk(), st: any = {}, t0 = 1_000_000; PK_CFG.enterSec = 7; PK_CFG.exitSec = 30;
  pkPublic(st, P, false, t0); t("PK публично: покой — pkT 0, pk 0", st.pkT === 0 && st.pk === 0 && st.pkP === 0, st);
  pkToggle(P, t0); pkPublic(st, P, false, t0 + 3500); t("вход в PK: pkT 1, 7 с, доля 0.5 через 3.5 с", st.pkT === 1 && st.pkD === 7 && Math.abs(st.pkP - 0.5) < 0.01, st);
  pkInterrupt(P); pkPublic(st, P, false, t0 + 3600); t("бой сбросил отсчёт — pkT 0, счётчик сбросов +1 (полоса гаснет у всех)", st.pkT === 0 && st.pkC === 1, st);
  pkToggle(P, t0 + 5000); pkTick(P, t0 + 12001); pkPublic(st, P, false, t0 + 12001); t("PK включён — pk 1, pkT 0", st.pk === 1 && st.pkT === 0, st);
  pkToggle(P, t0 + 13000); pkPublic(st, P, false, t0 + 28000); t("выход из PK: pkT 2, 30 с, доля 0.5 через 15 с", st.pkT === 2 && st.pkD === 30 && Math.abs(st.pkP - 0.5) < 0.01, st);
  pkToggle(P, t0 + 29000); pkPublic(st, P, false, t0 + 29000); t("повторное нажатие — отмена, счётчик сбросов +1", st.pkT === 0 && st.pkC === 2 && st.pk === 1, st);
  pkPublic(st, newPk(), true, t0); t("убийца (журнал купола) — pkK 1 без PK-режима", st.pkK === 1 && st.pk === 0);
  const u = pkUi(); t("вид PK для клиента: цвета полосы, значок «PK», ширина", u.tagText === "PK" && /^#/.test(u.barFrom) && /^#/.test(u.barTo) && u.barW > 0 && u.enterSec === 7 && u.exitSec === 30, u);
  t("cityClient несёт pkUi", !!(cityClient() as any).pkUi?.barTo);
  const v = validatePatch("pk", "main", { barTo: "#123456", barW: 80, tagText: "УБИЙЦА" } as any); t("админка PK: цвета/ширина/значок принимаются", typeof v !== "string" && (v as any).barTo === "#123456" && (v as any).barW === 80, v);
  t("админка PK: ширина полосы вне 24…140 — отказ", typeof validatePatch("pk", "main", { barW: 999 } as any) === "string"); }
{ // вертикальный забор и колодец (правки поверх карты Историка)
  const P = mapProps(), col = P.filter((p: any) => p.k === "dm_fence_post"), vs = P.filter((p: any) => p.k === "dm_fence_v"), cr = P.filter((p: any) => p.k === "dm_fence_corner");
  const xs = new Map<number, number[]>(); for (const p of col) (xs.get(p.x) || xs.set(p.x, []).get(p.x))!.push(p.y);
  t("забор: колонн узловых столбов (с обрубками вбок) не осталось", [...xs.values()].every((ys) => ys.sort((a, b) => a - b).every((y, i) => !i || y - ys[i - 1] > 34)), [...xs.entries()].slice(0, 3));
  t("забор: временный арт снят (vpost/vrail нет), пролёты dm_fence_v + углы dm_fence_corner", !P.some((p: any) => /^dm_fence_v(post|rail)$/.test(p.k)) && vs.length >= 20 && cr.length >= 8, [vs.length, cr.length]);
  const H = P.filter((p: any) => /^dm_fence(_gate|_broken)?$/.test(p.k)), ends = H.flatMap((h: any) => [h.x - 25, h.x + 27]);
  t("забор: каждая колонна — на крайнем колышке горизонтального пролёта (x ±1)", [...new Set(vs.map((r: any) => r.x))].every((x) => ends.some((e) => Math.abs(e - x) <= 1)), [...new Set(vs.map((r: any) => r.x))]);
  // README: от нижнего угла вверх по 64 px; северный конец последнего — ровно в верхний угол; щелей нет (перекрытие — только внутрь)
  const colsV = new Map<number, any[]>(); for (const v of vs) (colsV.get(v.x) || colsV.set(v.x, []).get(v.x))!.push(v);
  let gapOk = true, endsOk = true; const bad: any[] = [];
  for (const [x, a] of colsV) { const cs = cr.filter((c: any) => c.x === x).map((c: any) => c.y - 0.5).sort((p: number, q: number) => p - q);
    for (let i = 0; i + 1 < cs.length; i += 2) { const yT = cs[i], yB = cs[i + 1], sp = a.filter((v: any) => v.y > yT && v.y <= yB).map((v: any) => v.y).sort((p: number, q: number) => q - p);
      if (sp[0] !== yB || Math.min(...sp) - 64 !== yT) { endsOk = false; bad.push([x, yT, yB, sp]); }
      for (let k = 1; k < sp.length; k++) if (sp[k - 1] - sp[k] > 64) { gapOk = false; bad.push([x, sp[k - 1], sp[k]]); } } }
  t("забор: пролёт от нижнего угла, северный конец — в верхнем углу", endsOk, bad.slice(0, 3));
  t("забор: пролёты без щелей (шаг ≤ 64 px)", gapOk, bad.slice(0, 3));
  t("забор: левая колонна f:false, правая f:true (жерди внутрь)", [...colsV.entries()].every(([x, a]) => { const f = a[0].f; const pair = [...colsV.keys()].find((x2) => x2 !== x && Math.abs(x2 - x) < 500 && a.some((v: any) => colsV.get(x2)!.some((w: any) => w.y === v.y))); return pair === undefined || (x < pair ? f === false : f === true); }));
  t("забор: угол рисуется после пролёта с тем же y (y + 0.5)", cr.every((c: any) => c.y % 1 === 0.5));
  t("забор: стена (#) сдвинутых колонн переехала в клетку столбов", WALK_SHIFT.length === 2 && WALK_SHIFT.every((m) => walkCell(m.to, m.j0 + 1) === "#" && walkCell(m.from, m.j0 + 1) !== "#"), WALK_SHIFT);
  t("fenceRuns: одиночный столб не трогается", fenceRuns([{ k: "dm_fence_post", x: 10, y: 10 }]).length === 1);
  const w = P.find((p: any) => p.k === "dm_well" && p.x === WELL_MOVES[0].to[0] && p.y === WELL_MOVES[0].to[1]);
  t("колодец перенесён на траву (с площади)", !!w && !P.some((p: any) => p.k === "dm_well" && p.x === WELL_MOVES[0].from[0] && p.y === WELL_MOVES[0].from[1]));
  const gi = Math.floor(WELL_MOVES[0].to[0] / CITY_TILE), gj = Math.floor(WELL_MOVES[0].to[1] / CITY_TILE), gi0 = Math.floor(WELL_MOVES[0].from[0] / CITY_TILE), gj0 = Math.floor(WELL_MOVES[0].from[1] / CITY_TILE);
  t("колодец: твёрдый на новом месте, старое проходимо", walkCell(gi, gj) === "#" && walkCell(gi0, gj0) === ".", [walkCell(gi, gj), walkCell(gi0, gj0)]);
  const g = cityGround(gi, gj) as any, nm = JSON.stringify(g); t("колодец: под ним нет мощения/тропы", !/cobble|plaza|path/.test(nm), nm); }
{ // админка: аудит параметров (город, PK, день/ночь → огни)
  const V = (k: any, patch: any) => validatePatch(k, "main", patch);
  t("город: переход купола/полоса/пятно/яркость земли — принимаются", typeof V("city", { fadeSec: 1.2, fadeBandPx: 48, blightOn: false, blightSize: 1.5, blightK: 0.5, groundLight: 1.4 }) !== "string", V("city", { fadeSec: 1.2 }));
  t("город: яркость земли вне 0.4…2.5 — отказ", typeof V("city", { groundLight: 9 }) === "string");
  t("город: переход купола вне 0.1…5 с — отказ", typeof V("city", { fadeSec: 0 }) === "string");
  const cc: any = cityClient(); t("cityClient: fade, fadeBand, gl, blight", cc.fade > 0 && cc.fadeBand > 0 && cc.gl > 0 && cc.blight && "on" in cc.blight, [cc.fade, cc.fadeBand, cc.gl, cc.blight]);
  t("PK: правила сброса отсчёта (получил/нанёс) — переключатели", typeof V("pk", { cancelOnHit: false, cancelOnDeal: true }) !== "string" && PK_CFG.cancelOnHit === true && PK_CFG.cancelOnDeal === true);
  t("ночь: максимум ползунка игрока", typeof V("dn", { reduceMax: 60 }) !== "string" && typeof V("dn", { reduceMax: 160 }) === "string");
  t("огни: мерцание/ореол/пятно/сила по видам", typeof V("dn", { "lt.flickFire": 0.4, "lt.kLamp": 1.6, "lt.pool": 1.3, "lt.halo": 1.2 }) !== "string", V("dn", { "lt.flickFire": 0.4 }));
  t("огни: вне диапазона — отказ", typeof V("dn", { "lt.kFire": 7 }) === "string");
  t("точки огня: JSON-правки принимаются", typeof V("dn", { emitters: '{"city:dm_lantern_pole":[5,27],"torch":{"ex":0,"ey":30}}' }) !== "string");
  t("точки огня: неверный JSON / не числа / далеко — отказ", ["{x", '{"a":[1]}', '{"a":[1,999]}', "[1,2]"].every((e) => typeof V("dn", { emitters: e }) === "string"));
  t("точки огня: пусто — авто", typeof V("dn", { emitters: "" }) !== "string");
  const dc: any = dnClient().cfg; t("dnClient: reduceMax, lt, emitters", dc.reduceMax === 100 && dc.lt?.kFire === 1 && dc.emitters === "", dc.lt); }
console.log(`\n${ok} ok, ${bad} fail`); if (bad) process.exit(1);

// Город Альказак (city.ts + cityBuild.ts): журнал убийц, PK-режим, PvP, купол (в т.ч. интерьеры), розы, здания/двери/комнаты,
// места NPC, масштаб по rTiles, схемы админки. Запуск: esbuild --bundle → node.
import { CITY_CFG, PK_CFG, CITY_TILE, KillLog, newPk, pkToggle, pkTick, pkInterrupt, pkLeft, pvpAllowed, pkGrantDefense, inCity, pushOut, cityR, ROOM_LIMIT } from "./city";
import { cityBuildings, buildingById, roomAt, roomSpawn, onExit, outsideDoor, atDoor, doorNear, resolveRoom, roomWalkable, roomBounds, roomCell, slotPos, cityClient, cityNpcDefs, ROOMS, BUILD_DEF, buildingColliders, inRoomArea, ROOM_SPAN, DARK_PROPS } from "./cityBuild";
import { ROSE_ADJ, roseAgeOf, roseCurseOf, roseOpenMs, roseStage, DAY_MS } from "./bmCfg";
import { resolveWorld, blockedWorld, boundsAt } from "./propCollision";
import { walkable } from "./walkable";
import { validatePatch } from "./overrides";
import { emptyCellsInDome, cityGround, walkCell, walkColliders, mapProps, DARK_INDEX } from "./cityMap";
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
  t("пропсы карты: 253, все в атласе", mapProps().length === 253 && mapProps().every((p) => DARK_PROPS.keys?.[p.k]), mapProps().filter((p) => !DARK_PROPS.keys?.[p.k]).map((p) => p.k));
  t("стены/заборы из сетки walk — коллайдеры", walkColliders().length > 500 && !walkable("arinar", ...((): [number, number] => { const b = buildingById("house_elder")!; return [b.rect[0] + 100, b.rect[1] + 100]; })()));
  const rp = cityClient().rose; t("роза города рисуется в точке карты (24624, 3248)", rp && rp.x === 24624 && rp.y === 3248 && rp.id === "1792366351175927", rp);
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

// ——— админка ———
{ const v = validatePatch("city", "main", { rTiles: 96, roseBloom: false, roseId: "123" } as any);
  t("админка: rTiles до 160, поля розы", typeof v === "object", v);
  const v2 = validatePatch("city", "main", { rTiles: 500 } as any); t("админка: rTiles > 160 — отказ или кламп", typeof v2 === "string" || (v2 as any).rTiles <= 160, v2); }

console.log(`\n${ok} ok, ${bad} fail`); if (bad) process.exit(1);

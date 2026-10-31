// Тесты скрытых деревьев (ТЗ §14.F), ультимейтов Вождей и прогрессии фигур.
//   nice bun server/strat/tree-test.ts
import { newGame, apply, STRAT_CFG, RACES, ultOf, botAction, makeMap, officialMaps, type GameState, type Race } from "./rules";
import { techView, pieceLevel, unitChoices, unitAct, chiefChoices } from "./econ";
import { treeView, publicPatch, cfgWithTree, hiddenTarget, TREE_PATCH_KEYS } from "./tree-view";
import { ultCells } from "./ult";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };
const C = STRAT_CFG as any;
const king = (g: GameState, s: number) => g.pieces.find((p) => p.owner === s && p.kind === "king")!;

// ---------- 1. утечки: по ходу бот-партий видимое дерево не содержит id/имён/эффектов скрытых узлов
function leakCheck(g: GameState, side: number, tag: string) {
  const tv = treeView(g, side, C), js = JSON.stringify(tv), race = g.races[side];
  // все строковые ЗНАЧЕНИЯ (кроме ветки br — она публична: 6 веток) — среди них не должно быть id скрытых узлов
  const vals = new Set<string>(); const walk = (o: any, k?: string) => { if (typeof o === "string") { if (k !== "br" && k !== "ult") vals.add(o); } else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) walk(v, Array.isArray(o) ? k : kk); }; walk(tv);
  const vis = new Set(tv.techs.filter((t: any) => t.name).map((t: any) => t.id));
  const visNames = new Set<string>(); for (const t of tv.techs as any[]) if (t.name) { visNames.add(t.name); visNames.add(t.eff); visNames.add(t.tip); }
  for (const n of tv.chief!.nodes as any[]) if (n.name) { visNames.add(n.name); visNames.add(n.eff); }
  for (const t of C.techs) {
    if (vis.has(t.id)) continue; const v = techView(C, t, race);
    if (vals.has(t.id)) { ok(0, `${tag}: скрытый id ${t.id}`); return; }
    if (v.name && !visNames.has(v.name) && vals.has(v.name)) { ok(0, `${tag}: скрытое имя ${v.name}`); return; }
    if (v.eff && !visNames.has(v.eff) && vals.has(v.eff)) { ok(0, `${tag}: скрытый эффект ${v.eff}`); return; }
  }
  const vc = new Set(tv.chief!.nodes.filter((x: any) => x.name).map((x: any) => x.id));
  const def = C.chiefs.find((d: any) => d.id === tv.chief!.type);
  for (const nd of def?.tree || []) if (!vc.has(nd.id) && !visNames.has(nd.name) && vals.has(nd.name)) { ok(0, `${tag}: скрытый узел Вождя ${nd.name}`); return; }
  for (const u of Object.values(C.ults) as any[]) if (vals.has(u.name) && !vc.has("ult")) { ok(0, `${tag}: имя ульты ${u.name} до ур.5`); return; }
  for (const [k, uv] of Object.entries(tv.units) as any) { const T = C.unitTree[k];
    if (!uv.act) for (const a of T.act) if (vals.has(a.name)) { ok(0, `${tag}: умение ${a.name} до ур.2`); return; }
    if (!uv.ult && vals.has(T.ult)) { ok(0, `${tag}: ульта фигуры ${T.ult} до ур.5`); return; } }
  // клиентский cfg из видимого дерева — тоже без скрытого
  const cc = JSON.stringify(cfgWithTree({ ...C, techs: [], chiefs: [], ults: {}, techRace: undefined, unitTree: {}, unitUlts: {} }, tv));
  const cv = new Set<string>(); const cfgT = JSON.parse(cc).techs; for (const t of cfgT) { cv.add(t.id); for (const r of t.req || []) cv.add(r); }
  for (const t of C.techs) if (!vis.has(t.id) && cv.has(t.id)) { ok(0, `${tag}: cfgWithTree несёт ${t.id}`); return; }
  ok(1, tag); leaks++;
}
let leaks = 0;
let games = 0;
for (const size of [8, 15]) for (let i = 0; i < RACES.length; i++) {
  const races: [Race, Race] = [RACES[i], RACES[(i + 2) % RACES.length]];
  const g = newGame(size, races, 0, C, size === 8 ? 25 : 40, makeMap(size, officialMaps(size)[0]?.id)); games++;
  for (let step = 0; step < 30000 && g.winner === -1; step++) {
    const s = g.cur, a = botAction(g, s, C); const r = apply(g, s, a, C); if (!r.ok) apply(g, s, { a: "end" }, C);
    if (step % 40 === 0) { leakCheck(g, 0, `${size} ${races} шаг ${step} сторона 0`); leakCheck(g, 1, `${size} ${races} шаг ${step} сторона 1`); }
  }
}
// ---------- 2. publicPatch выкидывает деревья из правок админа
{
  const pp = publicPatch({ techs: [{ id: "x", name: "Секрет" }], chiefs: [], ults: {}, unitTree: {}, econ: { a: 1 } } as any) as any;
  ok(pp && !TREE_PATCH_KEYS.some((k) => k in pp) && pp.econ?.a === 1, "publicPatch: ключи деревьев вырезаны, прочее осталось");
  ok(publicPatch({ techs: [] } as any) == null, "publicPatch: только деревья → ничего");
}
// ---------- 3. hiddenTarget: исследовать/брать скрытое нельзя, ответ одинаковый для несуществующего
{
  const g = newGame(15, ["fire", "ice"], 0, C, 40);
  const tv = treeView(g, 0, C), hid = C.techs.find((t: any) => !tv.techs.some((v: any) => v.id === t.id && v.name));
  ok(hid && hiddenTarget(g, 0, { a: "research", t: hid.id } as any, C) === "bad_tech", "скрытый узел → bad_tech");
  ok(hiddenTarget(g, 0, { a: "research", t: "nope_xyz" } as any, C) === "bad_tech", "несуществующий → тот же bad_tech (нет оракула)");
  const open = tv.techs.find((v: any) => v.state === "open"); ok(open && hiddenTarget(g, 0, { a: "research", t: open.id } as any, C) == null, "открытый узел — можно");
}
// ---------- 4. фигуры: 5 уровней, ур.2 пассив, ур.3 умение, ур.4 усиление, ур.5 ульта
{
  const g = newGame(15, ["fire", "ice"], 0, C, 40), L = C.econ.xp.lv;
  const p = g.pieces.find((q) => q.owner === 0 && q.kind === "knight")!; const hp0 = p.maxHp;
  ok(pieceLevel(p, C) === 1 && !ultOf(g, p, C), "новая фигура — ур.1, без ульты");
  p.xp = L[2]; ok(pieceLevel(p, C) === 2 && unitChoices(p, 2, C).length === 2, "ур.2: два пассивных таланта");
  p.xp = L[5]; ok(pieceLevel(p, C) === 5, "ур.5 по опыту");
  ok(unitChoices(p, 3, C).length === 2 && unitChoices(p, 3, C).every((a: any) => a.ap >= 1 && a.cd >= 1), "ур.3: два активных умения с ОД/перезарядкой");
  const tv0 = treeView(g, 0, C); ok(tv0.units.knight.act && tv0.units.knight.ult, "в видимом дереве после ур.5 есть умения и ульта");
  const g2 = newGame(15, ["fire", "ice"], 0, C, 40); const tv2 = treeView(g2, 0, C);
  ok(!tv2.units.knight.act && tv2.units.knight.hidden.includes(3) && tv2.units.knight.hidden.includes(5), "в начале умения ур.3 и ульта ур.5 скрыты");
  ok(ultOf(g, p, C)?.u?.ap === 1 && (ultOf(g, p, C)!.u as any).cd >= 5, "ульта фигуры доступна на ур.5 (1 ОД, долгая перезарядка)");
  // выбор «авто»
  const q = g2.pieces.find((x) => x.owner === 0 && x.kind === "pawn")!; q.xp = L[2]; g2.cur = 0;
  const r = apply(g2, 0, { a: "talent", id: q.id, t: "auto" } as any, C); ok(r.ok && q.tal?.length === 1, "быстрый выбор «Авто» берёт талант");
  q.xp = L[3]; const r3 = apply(g2, 0, { a: "talent", id: q.id, t: "auto" } as any, C); ok(r3.ok && unitAct(q, C), "ур.3 «Авто» берёт активное умение");
  const a = unitAct(q, C)!; q.xp = L[4]; const a4 = unitAct(q, C)!; ok(a4.mag >= a.mag && a4.cd <= a.cd && a4.up, "ур.4 усиливает выбранное умение");
  q.xp = L[2]; ok(hp0 > 0, "");
  // ульта фигуры слабее ульты Вождя
  const cu = C.ults.doom, uu: any = Object.values(C.unitUlts); const g5 = newGame(15, ["fire", "ice"], 0, C, 40), area = (u: any) => ultCells(g5, 0, u, { x: 7, y: 6 } as any, 7, 7).length;
  ok(uu.every((u: any) => (u.dmg || 0) * Math.max(1, u.shape === "chain" ? u.hops : area(u)) <= cu.dmg * area(cu) / 3 && (u.size || 2 * (u.r || 0) || u.len || 1) <= 3), "ульты фигур заметно слабее ульт Вождя (суммарный урон ≤⅓, площадь ≤3)");
}
// ---------- 5. ульты Вождей: формы, урон по Вождю, перезарядка
{
  const g = newGame(15, ["fire", "ice"], 0, C, 40);
  ok(ultCells(g, 0, C.ults.doom, { x: 7, y: 4 } as any, 7, 7).length === 21, "DOOM: круг ⌀5 (центры ≤2,5) = 21 клетка");
  const k = king(g, 0); ok(!ultOf(g, k, C), "Вождь ур.<5 — ульты нет");
  for (const u of Object.values(C.ults) as any[]) ok(u.cd >= 6 && u.cd <= 8 && u.ap >= 2 && u.chiefMul <= 0.5, `ульта ${u.name}: перезарядка 6–8, ОД ≥2, по Вождю ≤×0,5`);
  ok(C.ults.doom.banner === "DOOM", "у огненной ульты общий баннер DOOM");
}
// ---------- 6. t1163: эпоха и цена узла — по лиге (techEra/rCost): «Чаща» в Обычной (15×15) — IV, в Быстрой (8×8) — III; заглушка «?» тоже по лиге
{
  const R = C.econ.research.cost;
  for (const [size, era, mul] of [[15, 4, C.econ.league?.normal?.research ?? 1], [8, 3, C.econ.league?.quick?.research ?? 1]] as const) {
    const g = newGame(size, ["nature", "fire"], 0, C, 40); const tv = treeView(g, 0, C);
    const gr: any = tv.techs.find((t: any) => t.id === "grove");
    ok(gr && gr.era === era && gr.cost === Math.round(R[era] * mul), `${size}: «Чаща» эпоха ${gr?.era} (ждали ${era}), цена ${gr?.cost} (ждали ${Math.round(R[era] * mul)})`);
    const hv: any = tv.techs.find((t: any) => t.id === "harvest"); ok(hv && hv.cost === Math.round(R[hv.era] * mul), `${size}: цена «Урожая» по лиге`);
    // взяли соперника по группе → «Чаща» закрыта; заглушка стоит в эпохе лиги
    g.ec!.techs[0].push("harvest"); const tv2 = treeView(g, 0, C);
    const ph: any = tv2.techs.find((t: any) => t.state === "closed" && t.br === "elem" && t.era === era);
    ok(ph && ph.id.startsWith(`?elem.${era}.`) && !tv2.techs.some((t: any) => t.id === "grove"), `${size}: заглушка закрытой «Чащи» в эпохе ${era} (${ph?.id})`);
  }
}
console.log(`проверок утечек: ${leaks}`);
console.log(`tree-test: ${n - fails} ok, ${fails} fail (партий ${games})`); if (fails) process.exit(1);

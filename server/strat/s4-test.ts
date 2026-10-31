// Тесты этапа 4: цели, Вожди (тип, дерево, гибель, возрождение, имя), расовые варианты, пассивки рас.
//   nice bun server/strat/s4-test.ts
import { newGame, apply, STRAT_CFG, type GameState, RACES } from "./rules";
import { apFor, chiefChoices, chiefTypesFor, validateChiefDef, chiefNodeBudget, holdScore, goalCfg, buildView, techView, bp, effArm, effAtk, territory, raceCfg } from "./econ";
import { techById } from "./econ-cfg";
import { checkChiefName, cleanName } from "./names";
let fails = 0, n = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const C = STRAT_CFG as any;
const king = (g: GameState, s: number) => g.pieces.find((p) => p.owner === s && p.kind === "king");
const endTurn = (g: GameState) => apply(g, g.cur, { a: "end" });
const killKing = (g: GameState, s: number) => { const k = king(g, s)!; const a = g.pieces.find((p) => p.owner !== s && p.kind === "hero" || p.owner !== s && p.kind === "rook")!;
  // ставим атакующего рядом с Вождём и бьём (с запасом HP 1)
  g.pieces = g.pieces.filter((p) => p === k || p === a || Math.max(Math.abs(p.x - k.x), Math.abs(p.y - k.y)) > 1); g.cur = (1 - s) as 0 | 1; g.ap = 3; a.acted = false; a.kind = "hero"; a.atk = 30; k.hp = 1; const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [k.x + dx, k.y + dy]).find(([x, y]) => x >= 0 && y >= 0 && x < g.size && y < g.size && !g.pieces.some((p) => p.x === x && p.y === y))!;
  a.x = spot[0]; a.y = spot[1]; const r = apply(g, (1 - s) as 0 | 1, { a: "attack", id: a.id, x: k.x, y: k.y }); a.x = 0; a.y = 4; return r; }; // убийца уходит со столицы (без осады)

// --- имена: XSS, длина, юникод
{
  const bad = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "javascript:alert(1)", "http://evil.com", "www evil com", "a", "x".repeat(21), "", "   ", "-----", "''", "👑👑", "Ар\u200Bган<b>", "Сука", "х у й", "ScRiPt", "ﬀ".repeat(15)];
  for (const b of bad) ok(!checkChiefName(b).ok, "имя отклонено: " + JSON.stringify(b).slice(0, 40));
  ok(checkChiefName("Арган").name === "Арган", "кириллица");
  ok(checkChiefName("  Ingvar   Red-Hand ").name === "Ingvar Red-Hand", "латиница, пробелы схлопнуты, дефис");
  ok(checkChiefName("О’Коннор").name === "О'Коннор", "типографский апостроф → '");
  ok(checkChiefName("Ар\u200Bган\u200D").name === "Арган", "zero-width вычищены");
  ok(checkChiefName("Z\u0301\u0302\u0303\u0304ed").name === "Zed", "«залго» (комбинирующие) вычищено");
  ok(checkChiefName("Ｆｕｌｌ").name === "Full", "полноширинные → NFKC");
  ok(checkChiefName("x".repeat(5000)).err === "name_long", "очень длинная строка → name_long без зависания");
  ok(checkChiefName("Тор 2").ok, "цифры допустимы");
  ok(!checkChiefName("Αθηνά").ok, "греческий — нет (только кириллица/латиница)");
  ok(cleanName("\u202Eabc") === "abc" && checkChiefName("Ar\u202Egan").name === "Argan" && checkChiefName("Арган\u0000").name === "Арган", "bidi-override и NUL вычищены");
  ok(checkChiefName("Йорг Ёлкин").name === "Йорг Ёлкин" && checkChiefName("Йорг".normalize("NFD")).name === "Йорг", "й/ё сохраняются (в т.ч. из NFD)");
}
// --- Вожди: реестр, тип, равный бюджет
{
  ok(C.chiefs.length === 6 && RACES.every((r) => chiefTypesFor(C, r).length === 1), "6 типов Вождей, по одному на расу");
  ok(C.chiefs.every((d: any) => validateChiefDef(d, RACES).length === 0), "все типы проходят проверку реестра");
  ok(validateChiefDef({ ...C.chiefs[0], tree: [{ id: "a", lvl: 3, grp: "x", req: ["zz"], kind: "active", name: "", eff: "", fx: {} }] }, RACES).length > 0, "битое дерево отклоняется");
  const budgets = C.chiefs.map((d: any) => d.base.hp + 3 * d.base.atk + 4 * d.base.arm + d.tree.reduce((s: number, x: any) => s + chiefNodeBudget(x), 0) / 2);
  ok(Math.max(...budgets) - Math.min(...budgets) <= 4, "бюджет типов равен (±4): " + budgets.map((b: number) => b.toFixed(1)).join(" "));
  const g = newGame(8, ["fire", "ice"], 0);
  ok(g.ec.chief[0].type === "fire_lord" && g.ec.chief[1].type === "ice_warden" && king(g, 0)!.maxHp === 28, "тип по расе; характеристики из типа");
  ok(g.ec.chief[0].name && C.chiefNames.fire.includes(g.ec.chief[0].name), "авто-имя из расового списка");
}
// --- дерево навыков
{
  const g = newGame(8, ["fire", "ice"], 0), k = king(g, 0)!;
  ok(chiefChoices(g, k, C).length === 0, "ур.1 — навыков нет");
  k.xp = C.chief.lv[1]; ok(chiefChoices(g, k, C).map((x) => x.id).sort().join() === "aura,inspire", "ур.2: выбор из двух (взаимоисключающие)");
  ok(apply(g, 0, { a: "talent", id: k.id, t: "aura" } as any).ok, "выбран навык");
  ok(!apply(g, 0, { a: "talent", id: k.id, t: "inspire" } as any).ok, "вторая ветка уровня закрыта");
  k.xp = C.chief.lv[2]; const ch = chiefChoices(g, k, C).map((x) => x.id).sort().join();
  ok(ch === "rally,tough", "ур.3: «Ярость» требует «Клич» → недоступна; " + ch);
  const r = g.pieces.find((p) => p.owner === 0 && p.kind === "rook")!; r.x = k.x + 1; r.y = k.y;
  ok(effArm(g, r, C) === r.arm + 1, "аура Вождя: +1 БРН соседу");
}
// --- опыт и рост
{
  const g = newGame(8, ["fire", "ice"], 0), k = king(g, 0)!, hp0 = k.maxHp;
  k.xp = C.chief.lv[1] - 1; g.cur = 0;
  g.pieces = g.pieces.filter((p) => p.kind === "king" || p.owner === 1 && p.kind === "pawn");
  const t = g.pieces.find((p) => p.owner === 1 && p.kind === "pawn")!; t.x = k.x + 1; t.y = k.y - 1; t.hp = 30; t.maxHp = 30; g.ap = 2;
  const r = apply(g, 0, { a: "attack", id: k.id, x: t.x, y: t.y }); if (!r.ok) console.log(r);
  ok(k.xp >= C.chief.lv[1] && k.maxHp === hp0 + C.chief.grow.hp[1], "удар → опыт → ур.2, рост HP");
}
// --- гибель, −ОД, возрождение (полный сброс), Цареубийство только за первого
{
  const g = newGame(8, ["fire", "ice"], 0); king(g, 1)!.xp = 30;
  killKing(g, 1);
  ok(!king(g, 1) && g.winner === -1 && g.ec.goals[0].includes("chief") && g.ec.chief[1].dead === ((C.econ as any).leagueRules ? (C.econ as any).league.quick.respawn : C.chief.respawn), "Вождь пал: партия идёт, цель засчитана (возрождение — по лиге)");
  ok(g.ec.chief[1].hist[0].died && g.ec.chief[1].hist[0].by === 0, "история: кто и когда");
  ok(apFor(g, 1, C) === Math.max(1, C.sizes[8].ap - C.chief.noChiefAp), "без Вождя −1 ОД");
  let turns = 0; while (!king(g, 1) && turns < 20 && g.winner === -1) { endTurn(g); turns++; }
  const k2 = king(g, 1)!;
  ok(k2 && g.ec.chief[1].gen === 2 && (k2.xp || 0) === 0 && !(k2.tal || []).length, "возрождение: ур.1, без опыта и навыков");
  ok(g.ec.chief[1].type === "ice_warden", "тот же тип Вождя");
  const cap1 = g.ec.cities.find((c) => c.owner === 1 && c.cap)!; ok(Math.max(Math.abs(k2.x - cap1.x), Math.abs(k2.y - cap1.y)) <= 1, "в столице или рядом");
  const gl = g.ec.res[0].glory; killKing(g, 1);
  { const g3 = newGame(8, ["fire", "ice"], 0); g3.ec.cities = g3.ec.cities.filter((c) => c.owner === 0); const kk = king(g3, 1)!; g3.pieces = g3.pieces.filter((p) => p !== kk); g3.ec.chief[1].dead = 1; endTurn(g3);
    ok(king(g3, 1) && king(g3, 1)!.y <= 2, "без городов Вождь возвращается на заднюю линию"); }
  ok(g.ec.goals[0].filter((x) => x === "chief").length === 1 && g.ec.res[0].glory - gl >= C.chief.lateKillGlory && g.ec.res[0].glory - gl < C.chief.killGlory + 5, "второй Вождь: только скромная Слава, цель повторно не засчитывается");
}
// --- имя через действие + лимит
{
  const g = newGame(8, ["fire", "ice"], 0);
  ok(apply(g, 0, { a: "name", name: "Арган" } as any).ok && g.ec.chief[0].name === "Арган", "игрок назвал Вождя");
  ok(!apply(g, 0, { a: "name", name: "<b>x</b>" } as any).ok && g.ec.chief[0].name === "Арган", "XSS-имя отклонено, старое осталось");
  apply(g, 0, { a: "name", name: "Каэр" } as any);
  ok((apply(g, 0, { a: "name", name: "Ингвар" } as any) as any).err === "rename_limit", "лимит переименований");
  ok(g.ap === apFor(g, 0, C), "имя — бесплатное действие (ОД не тратит)");
}
// --- цели
{
  const g = newGame(8, ["fire", "ice"], 0);
  ok(goalCfg(g, C).need === 3 && goalCfg(g, C).list.length === 5, "8×8: 3 из 5");
  ok(goalCfg(newGame(5, ["fire", "ice"], 0), C).need === 1, "5×5: 1 цель (Вождь или Твердыня)");
  g.ec.earned[0] = goalCfg(g, C).gold; endTurn(g); endTurn(g);
  ok(g.ec.goals[0].includes("treasury"), "Казна: заработано ≥ порога");
  ok(holdScore(g, 0, C) >= 1, "Твердыня: очки за город");
  const g2 = newGame(8, ["fire", "ice"], 0), c = g2.ec.cities.find((x) => x.owner === 0 && x.cap)!;
  g2.ec.res[0].gold = 999; g2.ec.res[0].know = 999;
  ok((apply(g2, 0, { a: "build", city: c.id, b: "wonder" } as any) as any).err === "need_era", "Чудо: нужна последняя эпоха");
  g2.ec.era[0] = 2; g2.ec.techs[0].push("arcana", "scribes", "academy");
  const r = apply(g2, 0, { a: "build", city: c.id, b: "wonder" } as any);
  ok(r.ok && g2.ec.goals[0].includes("wonder") && g2.ec.res[0].know === 999 - goalCfg(g2, C).wonderKnow, "Чудо построено: цель + списаны знания");
  ok(buildView(C, "fire", "wonder").name === "Вечное пламя" && buildView(C, "stone", "wonder").name === "Сердце горы", "Чудо — своё у каждой расы");
}
// --- расовые варианты построек и технологий
{
  ok(buildView(C, "ice", "barracks").name === "Ледяной острог" && buildView(C, "ice", "barracks").tpl === "barracks", "Лёд: Казарма → «Ледяной острог» (шаблон тот же)");
  const g = newGame(8, ["ice", "stone"], 0);
  ok(bp(g, 0, "wall", "arm", C) === 2 && bp(g, 0, "wall", "r", C) === 0 && bp(g, 1, "wall", "r", C) === 2, "Стена: варианты Льда и Камня");
  ok(techView(C, techById("horse")!, "fire").name === "Огненные кони" && techView(C, techById("merchants")!, "water").fx.goldCity === 1, "технология: расовое имя и вариант эффекта");
  const t = techView(C, techById("steel")!, "ice"); ok(t.unlock?.includes("forge"), "вариант сохраняет открытия узла (шаблон)");
}
// --- пассивки новых рас
{
  const g = newGame(8, ["lightning", "ice"], 0); g.pieces = g.pieces.filter((p) => p.kind === "king" || p.kind === "rook");
  const a = g.pieces.find((p) => p.owner === 0 && p.kind === "rook")!, t1 = g.pieces.find((p) => p.owner === 1 && p.kind === "rook")!;
  const t2 = g.pieces.filter((p) => p.owner === 1 && p.kind === "rook")[1]; a.x = 3; a.y = 3; t1.x = 4; t1.y = 3; t2.x = 4; t2.y = 4; const h2 = t2.hp;
  const r = apply(g, 0, { a: "attack", id: a.id, x: 4, y: 3 }); ok(r.ok && t2.hp === h2 - (raceCfg(g, 0, C).chain || 0), "Молния: разряд по соседнему врагу (число лиги: 8×8 quick — 1)");
  // t1163: лечение Воды на своей земле — по лиге (quick 0, normal/tactical 1)
  for (const size of [8, 15]) {
    const w = newGame(size, ["water", "ice"], 0), T = territory(w, C), wp = w.pieces.find((p) => p.owner === 0 && p.kind === "pawn" && T[p.y * w.size + p.x] === 0)!, heal = raceCfg(w, 0, C).healOwnT || 0; wp.hp = 3; endTurn(w); endTurn(w);
    ok(wp.hp === 3 + heal && heal === (size === 8 ? 0 : 1), `Вода ${size}×${size}: +${heal} HP на своей земле`);
  }
  const nt = newGame(8, ["nature", "ice"], 0), np = nt.pieces.find((p) => p.owner === 0 && p.kind === "pawn")!; np.x = 3; np.y = 1;
  ok(effArm(nt, np, C, territory(nt, C)) === np.arm - 1 || effArm(nt, np, C, territory(nt, C)) === 0, "Природа: −1 БРН вне своей земли (не ниже 0)");
}
console.log(fails ? `FAILED ${fails}/${n}` : `ALL OK ${n}`); if (fails) process.exit(1);

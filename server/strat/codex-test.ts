// F: Библиотека — каталог из правил, открытия, эндпоинт без сессии → 401.
import { STRAT_CFG, newGame } from "./rules";
import { codexCatalog, codexGroups, codexSeen, codexPick } from "./codex";
import { codexHttp } from "./codex-http";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };
const L = codexCatalog(STRAT_CFG), keys = new Set(L.map((e) => e.k));
ok(keys.size === L.length, "уникальные ключи");
for (const c of ["race", "unit", "chief", "skill", "ult", "status", "terrain", "object", "building", "tech", "wonder", "goal", "league"]) ok(L.some((e) => e.cat === c), "категория " + c);
ok(L.every((e) => e.name && typeof e.eff === "string"), "имя и эффект у всех");
ok(codexGroups(STRAT_CFG).reduce((s, g) => s + g.n, 0) === L.length, "группы = каталог");
ok(!JSON.stringify(codexGroups(STRAT_CFG)).includes("\"name\""), "в группах нет имён");
for (const n of [5, 8, 15, 35]) { const g = newGame(n, ["fire", "stone"] as any, 0, STRAT_CFG), s = codexSeen(g, 0, STRAT_CFG);
  ok([...s].every((k) => keys.has(k)), "seen ⊂ каталог " + n); ok(s.has("race:fire") && s.has("race:stone") && s.has("unit:king"), "расы/Вождь " + n);
  ok(![...s].some((k) => k.startsWith("tech:")), "без чужих/неизученных технологий " + n);
  (g as any).ec?.techs[1].push("horse"); ok(!codexSeen(g, 0, STRAT_CFG).has("tech:horse"), "технология соперника не открывается " + n);
  (g as any).ec?.techs[0].push("horse"); ok(!(g as any).ec || codexSeen(g, 0, STRAT_CFG).has("tech:horse"), "своя технология открывается " + n); }
ok(codexPick(STRAT_CFG, ["race:fire", "bogus:x"]).length === 1, "pick фильтрует");
const r = await codexHttp(new Request("https://x.workers.dev/strat/codex"), {}); const j: any = await r.json();
ok(r.status === 401 && j.items.length === 0, "без сессии 401");
const r2 = await codexHttp(new Request("https://x.workers.dev/strat/codex?devUser=u1"), { MC_DEV_TRUST_USERID: "1" }); ok(r2.status === 401, "devUser на проде не доверяем");
const r3 = await codexHttp(new Request("https://x.workers.dev/strat/codex", { headers: { Authorization: "Bearer junk" } }), {}); ok(r3.status === 401, "плохой токен 401");
const r4 = await codexHttp(new Request("https://x.workers.dev/strat/codex", { headers: { Origin: "https://evil.example" } }), {}); ok(r4.status === 403, "чужой Origin 403");
console.log(fails ? `codex-test: ${fails} FAIL` : `codex-test: OK (${L.length} записей)`); if (fails) process.exit(1);

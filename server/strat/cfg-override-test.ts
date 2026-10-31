// G (t1209): правки «Цели и лиги» — проверка, слияние, новая партия берёт новые числа, старый повтор — свои. Без ботов.
import { newGame, apply, STRAT_CFG } from "./rules";
import { goalCfg } from "./econ";
import { validateOverride, overridePatch, leagueValues } from "./cfg-override";
import { loadStratCfg, dropOverrideCache, mergeCfg } from "./cfg";
import { startLog, logAct, rebuild } from "./replay";
import { ratingCfgFor } from "./rating-db";
import { marginMul } from "./rating";
import { adminGoalsHttp } from "./admin-http";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };
// проверка
ok(validateOverride(8, { gold: 200, share: 0.4, need: 4 }).ok, "корректная правка");
const bad = (s: any, b: any) => { const r = validateOverride(s, b); return r.ok ? [] : r.errors; };
ok(bad(8, { gold: 0 })[0]?.includes("1…100000"), "золото 1…100000");
ok(bad(8, { gold: 100001 }).length === 1 && bad(15, { share: 0.95 }).length === 1 && bad(15, { share: 0.04 }).length === 1, "доля 0,05…0,9");
ok(bad(35, { turnLimit: 9 }).length && bad(35, { turnLimit: 1001 }).length && !bad(35, { turnLimit: 10 }).length, "лимит 10…1000");
ok(bad(8, { need: 0 }).length && bad(8, { need: 7 }).length && bad(8, { need: 2.5 }).length && !bad(8, { need: 6 }).length, "t1211: need 1…6, целое");
ok(bad(8, { xp: 0.04 }).length && bad(8, { xp: 5.1 }).length && !bad(8, { xp: 0.05 }).length, "множители 0,05…5");
ok(bad(8, { foo: 1 })[0]?.includes("неизвестное"), "неизвестное поле");
ok(bad(8, { gold: "200" })[0]?.includes("число"), "не число");
ok(bad(12, { gold: 200 }).length && bad(8, {}).length && bad(8, [1]).length, "размер и пустое тело");
// слияние
const P = overridePatch({ "league:8": { gold: 222, holdK: 6, turnLimit: 77, glory: 333, xp: 2, need: 4, winA: 1.6 }, "league:35": { share: 0.5 } });
const C = mergeCfg(P), v8 = leagueValues(C, 8), d8 = leagueValues(STRAT_CFG, 8);
ok(v8.gold === 222 && v8.holdK === 6 && v8.turnLimit === 77 && v8.glory === 333 && v8.xp === 2 && v8.need === 4 && v8.winA === 1.6, "поля лиги 8 слиты");
ok(v8.share === d8.share && v8.holdTurns === d8.holdTurns && leagueValues(C, 15).gold === leagueValues(STRAT_CFG, 15).gold, "прочее — по умолчанию");
ok(leagueValues(C, 35).share === 0.5, "лига 35 слита");
ok((STRAT_CFG as any).goals.sizes[8].gold === 150, "умолчания не испорчены");
ok(marginMul(true, 1, ratingCfgFor((C as any).goals.sizes[8].rate)) === 1.4, "рейтинг: a победителя из правки (1,6−0,2)");
// новая партия после правки (поддельная D1)
let rows: any[] = [];
const env: any = { GAME_DB: { prepare: (sql: string) => ({ bind: () => ({ first: async () => null }), all: async () => ({ results: /strat_cfg_override/.test(sql) ? rows : [] }), first: async () => null }) } };
(async () => {
  dropOverrideCache(); const c0 = await loadStratCfg(env, true); const g0 = newGame(8, ["fire", "ice"], 0, c0.cfg);
  ok(g0.turnLimit === 50 && goalCfg(g0, c0.cfg).gold === 150, "до правки — умолчания");
  // старая партия с логом повтора
  const log = startLog("t", g0, c0.cfg, null, Object.keys(c0.patch).length ? c0.patch : undefined);
  for (let i = 0; i < 6; i++) { const r = apply(g0, g0.cur, { a: "end" } as any, c0.cfg); logAct(log, (g0.cur ^ 1) as any, { a: "end" } as any, false, g0, true); ok(r.ok, "end"); }
  rows = [{ key: "league:8", json: JSON.stringify({ turnLimit: 20, gold: 400 }) }]; dropOverrideCache();
  const c1 = await loadStratCfg(env, true), g1 = newGame(8, ["fire", "ice"], 0, c1.cfg);
  ok(g1.turnLimit === 20 && goalCfg(g1, c1.cfg).gold === 400, "партия после правки — новые числа");
  ok(c1.patch?.goals?.sizes?.[8]?.gold === 400, "правка уходит в L.cfgPatch (снимок, лог повтора, клиент)");
  const rb = rebuild(log, mergeCfg(log.patch || {}));
  ok(rb.diverged === -1 && rb.g.turnLimit === 50 && rb.g.turn === g0.turn, "старый повтор — со своими числами, без расхождения");
  const log1 = startLog("t1", g1, c1.cfg, null, c1.patch), rb1 = rebuild(log1, mergeCfg(log1.patch));
  ok(rb1.g.turnLimit === 20, "повтор новой партии — с правкой");
  // кэш с TTL: без fresh — прежнее значение до сброса
  rows = [{ key: "league:8", json: JSON.stringify({ gold: 999 }) }];
  ok(goalCfg(g1, (await loadStratCfg(env)).cfg).gold === 400, "кэш (TTL) держит значение");
  // HTTP: без сессии — 401
  const r401 = await adminGoalsHttp(new Request("https://x/strat/admin/goals"), env); ok(r401.status === 401, "без сессии — 401");
  console.log(fails ? `cfg-override-test: FAIL ${fails}` : "cfg-override-test: OK"); if (fails) process.exit(1);
})();

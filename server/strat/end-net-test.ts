// t1230/t1231: конец партии по сети — каждая причина (goals, wipe, limit, forfeit, claim) → StratMatch.finish → phase over →
// отчёт в StratIndex снимает партию из «Продолжить»; залипшие записи чистятся при чтении (resume_get / my_active).
//   nice bun server/strat/end-net-test.ts
import { plugin } from "bun";
plugin({ name: "cf-stub", setup(b) { b.module("cloudflare:workers", () => ({ exports: { DurableObject: class { ctx: any; env: any; constructor(c: any, e: any) { this.ctx = c; this.env = e; } } }, loader: "object" })); } });
const { StratMatch } = await import("./match");
const { StratIndex } = await import("./hub");
const { parseAct } = await import("./parse-act");
const { newGame, STRAT_CFG } = await import("./rules");
const C: any = STRAT_CFG; let n = 0, fails = 0; const ok = (c: any, m: string) => { n++; if (!c) { fails++; console.log("FAIL " + m); } };
const store = () => { const m = new Map<string, any>(); return { get: async (k: string) => structuredClone(m.get(k)), put: async (k: any, v?: any) => { if (typeof k === "string") m.set(k, structuredClone(v)); else for (const [a, b] of Object.entries(k)) m.set(a, structuredClone(b)); }, delete: async (k: string) => m.delete(k), setAlarm: async () => {}, deleteAlarm: async () => {}, getAlarm: async () => null, list: async () => new Map() }; };
const ctx = () => ({ storage: store(), getWebSockets: () => [], acceptWebSocket() {}, waitUntil(p: any) { pend.push(Promise.resolve(p).catch(() => {})); } });
let pend: Promise<any>[] = []; const flush = async () => { while (pend.length) { const p = pend; pend = []; await Promise.all(p); } };
const matches = new Map<string, any>();
const env: any = { STRAT_INDEX: { idFromName: (x: string) => x, get: () => ({ fetch: (u: string, i: any) => idx.fetch(new Request(u, i)) }) },
  STRAT_MATCH: { idFromName: (x: string) => x, get: (id: string) => ({ fetch: (u: string) => matches.get(id) ? matches.get(id).fetch(new Request(u)) : Promise.resolve(new Response("gone", { status: 404 })) }) } };
const idx = new StratIndex(ctx(), env);
const U = ["u-alex", "u-opp"];
async function mkMatch(code: string) {
  const M: any = new StratMatch(ctx(), env); matches.set(code, M);
  const ir = await M.fetch(new Request("https://internal/init", { method: "POST", body: JSON.stringify({ code, size: 15, pub: false }) }));
  if (!M.L) console.log("init", code, ir.status, await ir.text()); const L = M.L; L.seats = [0, 1].map((i) => ({ pkey: U[i], nick: "P" + i, verified: true, race: i ? "ice" : "fire", ready: true, goneAt: null }));
  L.cfg = C; L.game = newGame(15, ["fire", "ice"], 0, C, 0); L.clock = { turnStart: Date.now(), reserve: [0, 0] }; L.skips = [0, 0]; L.phase = "play"; L.st = { ck: [0, 0], ult: [[], []], tal: [[], []] };
  M.record = async () => {}; M.recordRating = async () => {}; M.rdb = async () => {}; M.botMaybe = () => {};
  await M.save(); await flush(); return M;
}
const actOf = async (uid: string) => ((await idx.ctx.storage.get("act")) || {})[uid] || {};
const net = (M: any, seat: 0 | 1, raw: any) => { const a = parseAct(raw); return a ? M.doAct(seat, a) : "bad_action"; };

const cases: [string, (M: any) => any, number][] = [
  ["goals", (M) => { const g = M.L.game, need = (C.goals?.need ?? 6); g.ec.goals[0] = Array.from({ length: need }, (_, i) => "g" + i); return net(M, 0, { a: "end" }); }, 0],
  ["wipe", (M) => { const g = M.L.game; g.pieces = g.pieces.filter((p: any) => p.owner === 0); for (const c of g.ec.cities) if (c.owner === 1) c.owner = 0; return net(M, 0, { a: "end" }); }, 0],
  ["limit", (M) => { const g = M.L.game; g.turnLimit = 1; g.ec.goals[1] = ["a"]; let r = net(M, 0, { a: "end" }); if (M.L.phase === "play") r = net(M, 1, { a: "end" }); return r; }, 1],
  ["forfeit", (M) => M.finish(1, "forfeit"), 1],
  ["claim", (M) => { M.L.seats[1].goneAt = Date.now() - 1e9; M.L.skips = [0, 9]; return M.finish(0, "claim"); }, 0],
];
for (const [why, run, win] of cases) {
  const code = ("E" + why.toUpperCase() + "ZZZZ").slice(0, 6).replace(/[IO01]/g, "Z");
  const M = await mkMatch(code);
  ok(code in (await actOf(U[0])) && code in (await actOf(U[1])), `${why}: партия в «Продолжить» у обоих во время игры`);
  const r = await run(M); await M.save(); await flush();
  ok(!r, `${why}: действие прошло (${r || "ok"})`);
  ok(M.L.phase === "over" && M.L.result?.reason === why && M.L.result.winner === win && M.L.game.winner === win, `${why}: phase over, победитель ${win} (есть ${M.L.phase}/${M.L.result?.reason}/${M.L.result?.winner})`);
  ok(!(code in (await actOf(U[0]))) && !(code in (await actOf(U[1]))), `${why}: партия снята из «Продолжить»`);
  const v = M.view ? null : null; void v;
}
// залипшая запись (отчёт о конце потерян): чистится при чтении
{
  const M = await mkMatch("STUCKZ"); const report = M.report; M.report = () => {}; M.finish(0, "wipe"); await M.save(); M.report = report; await flush();
  ok("STUCKZ" in (await actOf(U[0])), "залипшая запись воспроизведена (отчёт потерян)");
  const live = await mkMatch("LXVEZZ");
  const ghost: any = (await idx.ctx.storage.get("act")); ghost[U[0]]["GHSTZZ"] = { size: 15, at: Date.now() }; await idx.ctx.storage.put("act", ghost); // партии нет вовсе
  idx.lobbies = null; await idx.ctx.storage.put("lobs", {}); // список лобби истёк
  const a = await idx.liveAct(U[0]);
  ok(!("STUCKZ" in a[U[0]]) && !("GHSTZZ" in a[U[0]]) && "LXVEZZ" in a[U[0]], "resume_get: законченные/пропавшие партии убраны, идущая осталась");
  ok(!("STUCKZ" in (await actOf(U[0]))), "очистка сохранена");
  void live;
}
// реванш: over → lobby → play снова в «Продолжить»
console.log(`end-net-test: ${n - fails} ok, ${fails} fail`); if (fails) process.exit(1);

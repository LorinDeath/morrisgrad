// t1238: «Очков навыка: 0» у Вождя ур. 2 — окно древа строилось из cfg.talents.king («Гвардия»/«Приказ»), а не из древа Вождя с сервера.
// Цепочка: сервер (apply + treeView, как stateFor → state.tree) → клиент (chiefTreeFromView + chiefNodeState, как openChiefTree).
//   nice bun server/strat/skilltree-test.ts
import { readFileSync } from "node:fs";
import { newGame, apply, STRAT_CFG as C, RACES } from "./rules";
import { gainXp, pieceLevel, chiefChoices, pendingTalent } from "./econ";
import { treeView } from "./tree-view";
import { parseAct } from "./parse-act";
import { chiefTreeFromView, chiefNodeState } from "../../src/scripts/strat/goals";
let fails = 0; const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const toLv = (g: any, p: any, lv: number) => { let k = 0; while (pieceLevel(p, C) < lv && k++ < 10000) gainXp(g, p, 1, [], C); };
const ui = (g: any, k: any) => { const S = JSON.parse(JSON.stringify({ tree: treeView(g, 0, C) })); const tree = chiefTreeFromView(S.tree.chief?.nodes)!;
  const have: string[] = k.tal || [], lv = pieceLevel(k, C), points = Math.max(0, lv - 1 - have.length);
  return { tree, points, st: (id: string) => { const n = tree.find((x) => x.id === id); return n ? chiefNodeState(n, tree, have, lv, points).st : "missing"; } }; };
for (const race of RACES as string[]) {
  const g: any = newGame(8, [race, race === "ice" ? "fire" : "ice"], 0), k = g.pieces.find((p: any) => p.owner === 0 && p.kind === "king");
  toLv(g, k, 2); let U = ui(g, k); const cc = chiefChoices(g, k, C);
  ok(U.tree && U.points === 1 && cc.length > 0 && cc.every((n) => U.st(n.id) === "can"), `${race}: ур. 2 → очко 1, узлы сервера доступны в окне`);
  ok(!U.tree.some((n) => ((C as any).talents.king || []).flat().some((t: any) => t.id === n.id && !cc.some((c) => c.id === n.id))), `${race}: в окне нет узлов talents.king`);
  const act = parseAct({ a: "talent", id: k.id, t: cc[0].id }); ok(act && apply(g, 0, act as any, C).ok, `${race}: выбор принят сервером`);
  U = ui(g, k); ok(U.points === 0 && U.st(cc[0].id) === "got", `${race}: после выбора — очков 0, узел «взят»`);
  const sib = U.tree.filter((n) => n.lv === 2 && n.id !== cc[0].id); ok(sib.length > 0 && sib.every((n) => U.st(n.id) === "closed"), `${race}: соседний узел закрыт`);
  toLv(g, k, 3); U = ui(g, k); const c3 = chiefChoices(g, k, C);
  ok(pendingTalent(k, C, g) === 3 && U.points === 1 && c3.length > 0 && c3.every((n) => U.st(n.id) === "can"), `${race}: ур. 3 → снова очко 1 и доступные узлы`);
}
// сетевой путь (как живая партия): StratMatch.doAct(parseAct) → stateFor(seat) → клиентское окно (Вода, как у Алекса)
{
  const { plugin } = await import("bun");
  plugin({ name: "cf-stub", setup(b) { b.module("cloudflare:workers", () => ({ exports: { DurableObject: class { ctx: any; env: any; constructor(c: any, e: any) { this.ctx = c; this.env = e; } } }, loader: "object" })); } });
  const { StratMatch } = await import("./match");
  const store = () => { const m = new Map<string, any>(); return { get: async (k: string) => structuredClone(m.get(k)), put: async (k: any, v?: any) => { if (typeof k === "string") m.set(k, structuredClone(v)); else for (const [a, b] of Object.entries(k)) m.set(a, structuredClone(b)); }, delete: async (k: string) => m.delete(k), setAlarm: async () => {}, deleteAlarm: async () => {}, getAlarm: async () => null }; };
  const env: any = { STRAT_INDEX: { idFromName: (x: string) => x, get: () => ({ fetch: async () => new Response("{}") }) } };
  const M: any = new StratMatch({ storage: store(), getWebSockets: () => [], acceptWebSocket() {}, waitUntil() {} } as any, env);
  await M.fetch(new Request("https://internal/init", { method: "POST", body: JSON.stringify({ code: "SKTRZZ", size: 15, pub: false }) }));
  const L = M.L; L.seats = [0, 1].map((i) => ({ pkey: "u" + i, nick: "P" + i, verified: true, race: i ? "ice" : "water", ready: true, goneAt: null }));
  L.cfg = C; L.game = newGame(15, ["water", "ice"], 0, C, 0); L.clock = { turnStart: Date.now(), reserve: [0, 0] }; L.skips = [0, 0]; L.phase = "play"; L.st = { ck: [0, 0], ult: [[], []], tal: [[], []] };
  M.record = async () => {}; M.recordRating = async () => {}; M.rdb = async () => {}; M.botMaybe = () => {}; M.report = () => {};
  const g = L.game, k = g.pieces.find((p: any) => p.owner === 0 && p.kind === "king");
  const win = () => { const st = JSON.parse(JSON.stringify(M.stateFor(0, []))); const tree = chiefTreeFromView(st.tree?.chief?.nodes);
    const pv = st.g.pieces.find((q: any) => q.id === k.id), have: string[] = pv?.tl || [], lv = pieceLevel(k, C), points = Math.max(0, lv - 1 - have.length);
    return { tree, points, opts: tree ? tree.filter((n) => chiefNodeState(n, tree, have, lv, points).st === "can") : [] }; };
  let W = win(); ok(W.tree && W.points === 0 && !W.opts.length, "net water: ур. 1 → очков 0");
  toLv(g, k, 2); W = win(); ok(W.points === 1 && W.opts.length > 0, `net water: ур. 2 → очко 1, доступно ${W.opts.length}`);
  const r = M.doAct(0, parseAct({ a: "talent", id: k.id, t: W.opts[0].id })); ok(!r && k.tal.includes(W.opts[0].id), `net water: выбор «${W.opts[0].name}» принят (${r || "ok"})`);
  W = win(); ok(W.points === 0 && !W.opts.length, "net water: после выбора — очков 0");
  toLv(g, k, 3); W = win(); ok(W.points === 1 && W.opts.length > 0, "net water: ур. 3 → снова очко 1");
  // старая партия, где очко «потерялось» (уровень 3, навыков 0): сервер считает очки из уровня − взятых, окно показывает 2
  k.tal = []; W = win(); ok(W.points === 2 && W.opts.length > 0, "net water: самовосстановление — ур. 3 без навыков → очков 2");
}
const cl = readFileSync(new URL("../../src/scripts/strat/client.ts", import.meta.url), "utf8"), mt = readFileSync(new URL("./match.ts", import.meta.url), "utf8");
ok(/chiefTreeFromView\(\(S as any\)\.tree\?\.chief\?\.nodes\)/.test(cl), "client: openChiefTree берёт древо из state.tree.chief");
ok(/out\.tree = treeView\(/.test(mt), "match: stateFor отдаёт state.tree");
console.log(fails ? `FAILS: ${fails}` : "skilltree-test: all ok"); process.exit(fails ? 1 : 0);

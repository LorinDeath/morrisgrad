// 🜏 Анимации навыков листами Художника: сервер (снаряд = id навыка, arain + rainLead, art:0/fs из админки) и клиент (лист по стихии и слоту).
import { castShape } from "./abilityShapes";
import { BM_SKILLS, BM_SHAPES, BMA_CFG } from "./blackArt";
import { skillArt, skillEvent, partOf, SLOT_OF } from "../../src/pages/MorrisCurse/_core/engine/skillFx.js";
import { FX_META, fxDef } from "../../src/pages/MorrisCurse/_core/engine/fxAtlas.js";
import { projInfo } from "../../src/pages/MorrisCurse/_core/engine/projAtlas.js";
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const ctx = (ev: any[], fired: any[], later: any[]) => ({ zone: { mobsAround: () => [], mobs: new Map() }, sid: "s1", x: 100, y: 100, dx: 1, dy: 0, now: 0, dmg: 10, radiusMult: 1,
  hit: () => 1, status: () => {}, move: () => {}, bounds: (x: number, y: number) => [x, y] as [number, number], buff: () => {}, later: (ms: number, fn: any) => later.push([ms, fn]), ev: (e: any) => ev.push(e),
  fire: (o: any) => { fired.push(o); o.onEnd?.(300, 100); } });
const ids = BM_SKILLS.map((s) => s.id).filter((id) => /^bm[fi]_/.test(id));
ok(ids.length === 10, `10 навыков огня и льда (${ids.length})`);
for (const id of ids) {
  const a = skillArt(id), sh = BM_SHAPES[id];
  ok(a && a.slot === SLOT_OF[sh.k] && a.elem === (id.startsWith("bmi_") ? "ice" : "fire"), `${id}: лист ${a?.key} (${a?.elem}/${a?.slot})`);
  const need = { whip: ["lash", "mark"], ring: ["ring"], bolt: ["bolt", "burst"], rain: ["mark", "drop", "impact"], dash: ["trail", "spirit"] }[a?.slot as string] || [];
  ok(need.every((p) => partOf(a, p) && FX_META.keys[`sk_${a.key}_${p}`] && FX_META.keys[`sk_${a.key}_${p}_glow`]), `${id}: части ${need.join("/")} + glow`);
}
ok(skillArt("fireball") === null && skillArt("rs:bmf_magma_ring")?.key === "magma_ring", "обычные навыки — без листа; rs: снимается");
// снаряд
{ const ev: any[] = [], f: any[] = [], L: any[] = []; castShape("bmf_cinder_bolt", ctx(ev, f, L) as any);
  ok(f[0]?.t === "bmf_cinder_bolt" && f[0]?.spd === 560, "снаряд навыка: t = id, скорость огненного шара");
  ok(ev.some((e) => e.k === "ability" && e.r > 0), "в конце полёта — ability (взрыв burst)");
  const pi = projInfo("bmf_cinder_bolt"), pi2 = projInfo("bmi_shard_bolt");
  ok(pi.key === "sk_ash_bolt_bolt" && pi.skill && pi.trail && pi.cell[0] === 2.4 && pi2.key === "sk_shard_bolt_bolt", "клиент: снаряд — лист ash_bolt/shard_bolt, след, ячейка 48×32"); }
// дождь
{ const ev: any[] = [], f: any[] = [], L: any[] = []; castShape("bmi_icicle_hail", ctx(ev, f, L) as any);
  const r = ev.find((e) => e.k === "arain");
  ok(r && r.pts.length === BM_SHAPES.bmi_icicle_hail.n && r.lead === 450 && r.pts[0][2] === 450, "arain: все точки, удар через rainLead");
  ok(L.length === r.pts.length && L.every(([ms]: any, i: number) => ms === r.pts[i][2]), "урон капель — в момент удара из arain");
  const T: any[] = []; ok(skillEvent(r, (t: any) => T.push(t), () => []) && T.filter((t) => t.k.endsWith("_drop")).length === r.pts.length, "клиент: метка/капля/удар на каждую точку");
  const D = T.find((t) => t.k.endsWith("_drop")), I = T.find((t) => t.k.endsWith("_impact"));
  ok(Math.abs(-D.t + D.life - 0.45) < 1e-6 && Math.abs(-I.t - 0.45) < 1e-6, "капля долетает ровно к удару, удар — в момент урона");
  ok(skillEvent({ k: "ability", id: "bmi_icicle_hail", x: 0, y: 0, r: 60 }, () => {}, () => []), "старые ability капель не рисуются второй раз"); }
// хлыст — метки на задетых в конусе
{ const T: any[] = []; skillEvent({ k: "acone", id: "bmf_ember_lash", x: 0, y: 0, dx: 1, dy: 0, len: 230, arc: 1 }, (t: any) => T.push(t), () => [{ id: 1, x: 150, y: 10 }, { id: 2, x: -150, y: 0 }]);
  ok(T.filter((t) => t.k.endsWith("_lash")).length === 3 && T[0].sx === 1 && T[0].mode === 2, "хлыст: плеть + веер, stretchX = len/230");
  ok(T.filter((t) => t.k.endsWith("_mark")).map((t) => t.mob).join() === "1", "метка — только на мобе в дуге"); }
// кольцо и рывок
{ const T: any[] = []; skillEvent({ k: "ability", id: "bmi_rime_ring", x: 0, y: 0, r: 280 }, (t: any) => T.push(t), () => []);
  ok(T[0]?.k === "sk_frost_ring_ring" && T[0].sx === 2, "кольцо: scale = r/140");
  const D: any[] = []; skillEvent({ k: "aline", id: "bmf_phoenix_dash", x: 0, y: 0, dx: -1, dy: 0, len: 440 }, (t: any) => D.push(t), () => []);
  ok(D[0]?.k === "sk_phoenix_dash_trail" && D[0].sx === 2 && D[1]?.sx < 0, "рывок: trail len/220, spirit влево — зеркально"); }
// админка: выкл и масштаб
{ BMA_CFG.skillArt = false; const ev: any[] = [], f: any[] = []; castShape("bmf_cinder_bolt", ctx(ev, f, []) as any);
  ok(f[0]?.t !== "bmf_cinder_bolt" && ev.every((e) => e.art === 0) && !skillEvent(ev[0], () => {}, () => []), "выкл в админке: старый спрайт, art:0 — клиент рисует код-эффект");
  BMA_CFG.skillArt = true; (BMA_CFG as any).skillFxScale = 1.5; const e2: any[] = []; castShape("bmf_magma_ring", ctx(e2, [], []) as any);
  const T: any[] = []; skillEvent(e2[0], (t: any) => T.push(t), () => []); ok(e2[0].fs === 1.5 && Math.abs(T[0].sx - 1.5 * e2[0].r / 140) < 1e-9, "масштаб анимаций из админки"); (BMA_CFG as any).skillFxScale = 1; }
ok(!!fxDef("sk_magma_ring_ring"), "fxDef знает части листов");
console.log(fails ? `FAILED ${fails}` : "ALL OK"); if (fails) process.exit(1);

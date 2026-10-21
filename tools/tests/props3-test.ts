// Пропсы 32 (props3): коллизии сервера не меняются, атлас v3 ⊇ v2 с теми же размерами/вариантами, точки излучения огней = центроид
// свечения кадра (±1 px). Запуск: bun tools/tests/props3-test.ts
import { readFileSync } from "fs";
import { execSync } from "child_process";
import V2 from "../../src/assets/mc/props2/props_atlas.json";
import V3 from "../../src/assets/mc/props3/props32_atlas.json";
import { propColliders, propVariant, PROPS_META, PX_PER_M, solidK, PORTAL_EDGE, ELL_Y } from "../../server/meta/propsV2";
import { lightEmitter } from "../../src/pages/MorrisCurse/_core/engine/lightEmitter.js";
import { frameCentroid, lightKeys } from "../mc-sprites/light-emitters.mjs";

let fails = 0, passes = 0;
const ok = (c: any, m: string) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };
const A2: any = V2, A3: any = V3;

// 1. сервер считает коллизии по props2 — файлы сервера не тронуты этой веткой
const base = process.env.BASE || "light-nowashout";
const diff = execSync(`git diff --name-only ${base} -- server/meta/propsV2.ts src/assets/mc/props2`, { encoding: "utf8" }).trim();
ok(diff === "", `server/meta/propsV2.ts и props2 не изменены относительно ${base}: ${diff}`);
ok(PROPS_META === A2 || PROPS_META.version === A2.version, "сервер читает атлас v2");

// 2. атлас v3: все ключи v2, те же size_m / variant_of / kind, те же aliases и variants; высота кадра в метрах та же
ok(JSON.stringify(A3.aliases) === JSON.stringify(A2.aliases), "aliases v3 = v2");
ok(JSON.stringify(A3.variants) === JSON.stringify(A2.variants), "variants v3 = v2");
const glowNew: string[] = [];
for (const [k, d] of Object.entries<any>(A2.keys)) {
  const e = A3.keys[k]; ok(!!e, `v3 есть ключ ${k}`); if (!e) continue;
  ok(JSON.stringify(e.size_m) === JSON.stringify(d.size_m), `${k}: size_m ${d.size_m} = ${e.size_m}`);
  ok((e.variant_of ?? null) === (d.variant_of ?? null), `${k}: variant_of`);
  const h2 = A2.sheets[d.sheet].frameH / 10, h3 = A3.sheets[e.sheet].frameH / (A3.tex_px_per_m || 20), w2 = A2.sheets[d.sheet].frameW / 10, w3 = A3.sheets[e.sheet].frameW / (A3.tex_px_per_m || 20);
  ok(Math.abs(h2 - h3) < 1e-9 && Math.abs(w2 - w3) < 1e-9, `${k}: кадр ${w2}×${h2} м = ${w3}×${h3} м`);
  if (d.glow) ok(!!e.glow, `${k}: свечение v2 есть и в v3`); else if (e.glow) glowNew.push(k);
}
console.log(`  свечение добавлено в v3 (художник): ${glowNew.join(", ") || "—"}`);
// 3. коллайдеры по атласу v3 (тем же правилом, что сервер) = серверные по v2 для всех ключей и 300 позиций
const collV3 = (k: string, x: number, y: number, s = 1) => { const key = propVariant(k, x, y); if (!key) return []; const d = A3.keys[key], W = d.size_m[0] * PX_PER_M * s;
  if (key === "portal" || key === "portal_arch") { const o = W * PORTAL_EDGE.offset, r = W * PORTAL_EDGE.r; return [{ x: x - o, y, rx: r, ry: r * ELL_Y }, { x: x + o, y, rx: r, ry: r * ELL_Y }]; }
  const k2 = solidK(key); if (!k2) return []; const rx = W * k2 / 2; return [{ x, y, rx, ry: rx * ELL_Y }]; };
let nc = 0, bad = 0;
for (const k of [...Object.keys(A2.keys), ...Object.keys(A2.aliases)]) for (let i = 0; i < 300; i++) {
  const x = (i * 7919) % 30000, y = (i * 104729) % 30000, s = 0.6 + (i % 7) * 0.15;
  const a = JSON.stringify(propColliders(k, x, y, s)), b = JSON.stringify(collV3(k, x, y, s)); nc++; if (a !== b) { bad++; if (bad < 5) console.log("  разные коллайдеры", k, x, y, a, b); }
}
ok(bad === 0, `коллайдеры v3 = v2: ${nc - bad}/${nc}`);

// 4. точка излучения = центроид свечения кадра ±1 px (оба набора, все ключи огней и все кадры), и перевод в метры
let ne = 0;
for (const [set, A, pxm] of [["v3", A3, 20], ["v2", A2, 10]] as const) for (const k of lightKeys(A)) {
  const d = A.keys[k], n = Math.max(1, d.frames || 1), G = A.sheets[d.glow?.sheet || d.sheet];
  for (let f = 0; f < n; f++) {
    const c = await frameCentroid(set, k, f), e: any = lightEmitter(k, f, set); ne++;
    ok(c && e && Math.abs(c[0] - e.px) <= 1 && Math.abs(c[1] - e.py) <= 1, `${set} ${k} кадр ${f}: точка ${e && [e.px, e.py]} vs центроид ${c}`);
    if (e) ok(Math.abs(e.dx - (e.px - G.frameW / 2) / pxm) < 1e-9 && Math.abs(e.h - (G.frameH - e.py) / pxm) < 1e-9, `${set} ${k}: метры`);
  }
}
ok(ne > 300, `проверено кадров огней: ${ne}`);
// фонарь: свет у головы фонаря, а не в центре текстуры (v3: голова справа сверху)
const lv3: any = lightEmitter("lantern", 0, "v3"), lv2: any = lightEmitter("lantern", 0, "v2");
ok(lv3.h > 2.4 && Math.abs(lv3.dx) > 0.3, `v3 фонарь: dx ${lv3.dx.toFixed(2)} м, h ${lv3.h.toFixed(2)} м (не центр кадра 0 / 2.4)`);
ok(lv2.h > 3, `v2 фонарь: h ${lv2.h.toFixed(2)} м (голова фонаря)`);
// откат на props2 (fallback_v2.json): ключи есть в обоих атласах, размеры в метрах равны; свет портала — из вихря v2
{ const FB = JSON.parse(readFileSync("src/assets/mc/props3/fallback_v2.json", "utf8"));
  ok(Array.isArray(FB.keys) && ["portal", "portal_swirl", "portal_arch"].every((k) => FB.keys.includes(k)), "fallback_v2.json: portal, portal_swirl, portal_arch");
  for (const k of FB.keys) ok((V2 as any).keys[k] && (V3 as any).keys[k] && JSON.stringify((V2 as any).keys[k].size_m) === JSON.stringify((V3 as any).keys[k].size_m), `откат ${k}: есть в v2 и v3, size_m равны`);
  ok((V2 as any).aliases["mesh:makePortal"] === "portal", "портал хаба (mesh:makePortal) → portal — под откатом");
  const pe: any = lightEmitter("portal", 0, "v2"); ok(pe && Math.abs(pe.h * 0.75 - 1.6) < 0.25 && Math.abs(pe.dx) < 0.2, `портал v2: свет из вихря h ${(pe?.h * 0.75).toFixed(2)} м (было 1.6), dx ${pe?.dx?.toFixed(2)}`); }
// линт необъявленных имён клиента (debug.lightSources падал на HALF_M только при вызове)
{ let out = ""; let code = 0; try { out = execSync("node tools/tests/undef-lint.mjs", { encoding: "utf8" }); } catch (e: any) { out = String(e.stdout || e.message); code = 1; }
  ok(code === 0, "undef-lint: нет необъявленных идентификаторов в src/pages/MorrisCurse/_core\n" + out.trim()); }
console.log(`props3-test: ${passes} ok, ${fails} fail`); process.exit(fails ? 1 : 0);

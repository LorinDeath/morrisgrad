// Сборка клиента как в проде (с подменой деревьев) и проверка: в бандле нет имён/эффектов узлов дерева, ультимейтов и т. п.
// nice node tools/strat/bundle-check.mjs [out]
import { build } from "esbuild";
import { esbuildTreeAlias } from "./tree-alias.mjs";
import fs from "node:fs";
const out = process.argv[2] || "/tmp/strat-c.js", noAlias = process.argv.includes("--no-alias"); // --no-alias: проверка самой проверки (должна найти утечки)
await build({ entryPoints: ["src/scripts/strat/client.ts"], bundle: true, outfile: out, format: "esm", charset: "utf8", plugins: noAlias ? [] : [esbuildTreeAlias], logLevel: "error" });
const js = fs.readFileSync(out, "utf8");
const { TECHS, CHIEFS, ULTS, UNIT_TREE, UNIT_ULTS, TECH_RACE_NAMES } = await import("../../server/strat/tree-data.ts").catch(() => ({}));
const probes = new Set();
for (const t of TECHS || []) { probes.add(t.name); probes.add(t.eff); }
for (const d of CHIEFS || []) for (const n of d.tree) { probes.add(n.name); probes.add(n.eff); }
for (const u of Object.values(ULTS || {})) { probes.add(u.name); probes.add(u.eff); if (u.banner) probes.add(u.banner); }
for (const T of Object.values(UNIT_TREE || {})) for (const a of T.act) { probes.add(a.name); probes.add(a.eff); }
for (const u of Object.values(UNIT_ULTS || {})) { probes.add(u.name); probes.add(u.eff); }
for (const l of Object.values(TECH_RACE_NAMES || {})) for (const n of l) probes.add(n);
// строки, совпадающие с публичными данными (имена тактик, построек, шаблоны эффектов), — не утечка
const pub = ["server/strat/econ-cfg.ts", "server/strat/content-cfg.ts", "server/strat/effects.ts", "server/strat/terrain.ts", "server/strat/rules.ts", "server/strat/econ.ts", "src/scripts/strat/econ-ui.ts", "src/scripts/strat/client.ts"].map((f) => fs.readFileSync(f, "utf8")).join("\n");
for (const s of [...probes]) if (pub.includes(s)) probes.delete(s);
const leaks = [...probes].filter((s) => s && s.length >= 4 && js.includes(JSON.stringify(s).slice(1, -1)));
console.log(`bundle ${(js.length / 1024).toFixed(0)} KB, probes ${probes.size}, leaks ${leaks.length}`);
if (leaks.length) { console.log("LEAK:", leaks.slice(0, 20).join(" | ")); process.exit(1); }

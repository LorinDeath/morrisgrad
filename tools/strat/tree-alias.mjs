// Подмена server/strat/tree-data.ts → tree-data.public.ts в КЛИЕНТСКОЙ сборке (деревья в браузер не уходят; ТЗ §14.F).
// Используется в astro.config.mjs (vite, только не-SSR) и в tools/strat/bundle-check.mjs (esbuild).
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PUBLIC_TREE = path.join(root, "server/strat/tree-data.public.ts");
export const isTreeData = (id, importer) => /(^|\/)tree-data(\.ts)?$/.test(id) && !!importer && importer.includes(path.join("server", "strat"));
export function viteTreeAlias() {
  return { name: "strat-tree-redact", enforce: "pre", resolveId(id, importer, opts) { if (!opts?.ssr && isTreeData(id, importer)) return PUBLIC_TREE; return null; } };
}
export const esbuildTreeAlias = { name: "strat-tree-redact", setup(b) { b.onResolve({ filter: /tree-data(\.ts)?$/ }, (a) => (isTreeData(a.path, a.importer) ? { path: PUBLIC_TREE } : undefined)); } };

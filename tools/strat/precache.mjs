// «Партия Чёрных королей»: индекс ресурсов для кэша браузера (public/strat-sw.js). Путь → короткий хеш содержимого и размер.
// Запускается перед astro build. Изменился файл → новый хеш → воркер скачает только его; неизменённые берутся из Cache Storage.
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs"; import { createHash } from "crypto"; import { join } from "path";
const root = new URL("../../public/", import.meta.url).pathname, out = [];
const walk = (d) => { for (const n of readdirSync(join(root, d))) { const p = d + "/" + n, st = statSync(join(root, p));
  if (st.isDirectory()) walk(p); else if (/\.(png|webp|jpe?g|svg|woff2?|json)$/i.test(n) && n !== "precache.json") out.push({ p: "/" + p, h: createHash("sha1").update(readFileSync(join(root, p))).digest("hex").slice(0, 10), s: st.size }); } };
walk("strat");
writeFileSync(join(root, "strat/precache.json"), JSON.stringify({ v: 1, files: out }));
console.log(`strat precache: ${out.length} файлов, ${(out.reduce((a, f) => a + f.s, 0) / 1048576).toFixed(1)} МБ`);

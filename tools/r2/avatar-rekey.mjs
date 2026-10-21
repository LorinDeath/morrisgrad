// Перенос аватаров на случайные ключи и новый домен (media.morrisgrad.com). ПО УМОЛЧАНИЮ — ТОЛЬКО ПЛАН (ничего не пишет).
// Зачем: старые ключи «<id Clerk>-<время>» раскрывают внутренний id игрока в адресе картинки; r2.dev — не для прода.
//
//   node tools/r2/avatar-rekey.mjs --users users.json          # план: users.json = вывод SELECT id, avatar_url FROM users (--json)
//   MG_REMOTE_OK=1 node tools/r2/avatar-rekey.mjs --users users.json --apply   # ТОЛЬКО после «ок» Алекса и бэкапа D1
//
// --apply: для каждого аватара — wrangler r2 object get (копия в /workspace/mg-backups/avatars-<дата>/) → проверка сигнатуры →
// wrangler r2 object put под новым ключом → файл SQL с UPDATE users SET avatar_url (выполнить отдельно: wrangler d1 execute --remote --file).
// Старые объекты НЕ удаляются (удаление — отдельным решением, после проверки, что новые адреса открываются).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const usersFile = args[args.indexOf("--users") + 1];
const apply = args.includes("--apply");
const OLD = "https://pub-c6960920bfb44496a89753f220db1147.r2.dev", NEW = process.env.NEW_BASE || "https://media.morrisgrad.com", BUCKET = "morrisgrad-avatars";
if (!usersFile) { console.error("нужен --users users.json"); process.exit(2); }
if (apply && process.env.MG_REMOTE_OK !== "1") { console.error("--apply пишет в рабочий R2: нужен MG_REMOTE_OK=1 (только после «ок»)"); process.exit(2); }
const raw = JSON.parse(readFileSync(usersFile, "utf8"));
const rows = Array.isArray(raw) ? (raw[0]?.results || raw) : raw.results || [];
const sniff = (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? ["image/jpeg", "jpg"] : b.slice(0, 8).toString("hex") === "89504e470d0a1a0a" ? ["image/png", "png"] : b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" ? ["image/webp", "webp"] : /^GIF8[79]a/.test(b.slice(0, 6).toString()) ? ["image/gif", "gif"] : null;
const ym = new Date().toISOString().slice(0, 7).replace("-", "");
const dir = `/workspace/mg-backups/avatars-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
const plan = [], sql = [];
for (const r of rows) {
  if (typeof r.avatar_url !== "string" || !r.avatar_url.startsWith(OLD + "/")) continue;
  const oldKey = r.avatar_url.slice(OLD.length + 1);
  const rnd = Array.from(randomBytes(12), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  plan.push({ id: "…" + String(r.id).slice(-4), oldKey: oldKey.replace(/^user_[A-Za-z0-9]+/, "user_…"), newKeyBase: `a/${ym}/${rnd}` });
  if (!apply) continue;
  mkdirSync(dir, { recursive: true });
  const f = `${dir}/${plan.length}.bin`;
  execFileSync("npx", ["wrangler", "r2", "object", "get", `${BUCKET}/${oldKey}`, "--remote", "--file", f], { stdio: "ignore" });
  const t = sniff(readFileSync(f));
  if (!t) { console.log("ПРОПУСК (не картинка):", plan.at(-1).oldKey); continue; }
  const newKey = `a/${ym}/${rnd}.${t[1]}`;
  execFileSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/${newKey}`, "--remote", "--file", f, "--content-type", t[0], "--content-disposition", "inline"], { stdio: "ignore" });
  sql.push(`UPDATE users SET avatar_url = '${NEW}/${newKey}' WHERE id = '${String(r.id).replace(/'/g, "''")}' AND avatar_url = '${r.avatar_url.replace(/'/g, "''")}';`);
}
console.log(`аватаров на перенос: ${plan.length}${apply ? "" : " (план, ничего не записано)"}`);
for (const p of plan) console.log(`  ${p.id}: ${p.oldKey} → ${p.newKeyBase}.<ext>`);
if (apply) { writeFileSync(`${dir}/update-users.sql`, sql.join("\n") + "\n"); console.log(`SQL: ${dir}/update-users.sql — выполнить: wrangler d1 execute morrisgrad_db --remote --file <путь> (после бэкапа)`); }

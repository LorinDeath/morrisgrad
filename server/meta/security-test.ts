// Тесты шага безопасности: лимиты сообщений, dev-режим только на localhost, прод-конфиг без dev-флага,
// валидация правок админки/квестов, черты. Запуск: npx esbuild server/meta/security-test.ts --bundle --platform=node --format=esm --outfile=/tmp/sec.mjs && node /tmp/sec.mjs
import { readFileSync, existsSync } from "node:fs";
import { admitMessage, isDevRequest, MSG_BURST, MSG_MAX_CHARS, MSG_STRIKES_CLOSE } from "../limits";
import { validatePatch, validateTraits, SCHEMA, TABLES } from "./overrides";
import { validateQuest, applyTraits } from "./admin";
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// 1. прод-конфиг: dev-доверие не включено
const wr = readFileSync("server/wrangler.json", "utf8");
ok(!/MC_DEV_TRUST_USERID/.test(wr), "wrangler.json не содержит MC_DEV_TRUST_USERID");
const vars = JSON.parse(wr).vars || {}; ok(!("MC_DEV_TRUST_USERID" in vars), "vars без dev-флага");
ok(!existsSync("server/.dev.vars") || /\.dev\.vars/.test(readFileSync(".gitignore", "utf8")), ".dev.vars не попадёт в репозиторий");
// 2. dev только на localhost
ok(isDevRequest({ MC_DEV_TRUST_USERID: "1" }, { url: "http://127.0.0.1:8787/ws" }), "dev: localhost + флаг");
ok(!isDevRequest({ MC_DEV_TRUST_USERID: "1" }, { url: "https://morrisgrad.example.com/ws" }), "dev: публичный домен — нет, даже с флагом");
ok(!isDevRequest({}, { url: "http://127.0.0.1:8787/ws" }), "dev: без флага — нет");
ok(!isDevRequest({ MC_DEV_TRUST_USERID: "1" }, { url: "garbage" }), "dev: битый URL — нет");
ok(!isDevRequest({ MC_DEV_TRUST_USERID: "1" }, { url: "http://localhost.evil.com/" }), "dev: localhost.evil.com — нет");
// 3. лимиты сообщений
{ const l = { tokens: MSG_BURST, at: 0, strikes: 0 }; let okN = 0; for (let i = 0; i < 1000; i++) if (admitMessage(l, "{}", 0) === "ok") okN++;
  ok(okN === MSG_BURST, `флуд за 0 мс: пропущено ${okN} = burst`);
  let v = ""; for (let i = 0; i < MSG_STRIKES_CLOSE; i++) v = admitMessage(l, "{}", 0); ok(v === "close", "злостный флуд — закрыть сокет");
  const l2 = { tokens: MSG_BURST, at: 0, strikes: 0 }; let n2 = 0; for (let t = 0; t < 10000; t += 25) if (admitMessage(l2, "{}", t) === "ok") n2++; ok(n2 === 400, `40 сообщ/с проходят полностью (${n2})`);
  const l3 = { tokens: MSG_BURST, at: 0, strikes: 0 }; ok(admitMessage(l3, "x".repeat(MSG_MAX_CHARS + 1), 0) === "drop", "слишком большое — отброшено");
  ok(admitMessage(l3, new ArrayBuffer(10), 0) === "drop", "бинарное — отброшено"); }
// 4. правки админки
const mobId = Object.keys(TABLES.mob)[0];
ok(typeof validatePatch("mob", mobId, { hp: 777 }) === "object", "моб hp 777 — ок");
ok(typeof validatePatch("mob", mobId, { hp: 1e12 }) === "string", "hp вне диапазона — отказ");
ok(typeof validatePatch("mob", mobId, { hp: "NaN" }) === "string", "hp NaN — отказ");
ok(typeof validatePatch("mob", mobId, JSON.parse('{"__proto__":{"x":1}}')) === "string", "__proto__ — отказ");
ok(typeof validatePatch("mob", "nope'; DROP TABLE x;--", { hp: 5 }) === "string", "чужой id — отказ");
ok(typeof validatePatch("mob", mobId, { secretField: 1 }) === "string", "поле вне схемы — отказ");
ok(typeof validatePatch("mob", mobId, null) === "string", "null — отказ");
ok(typeof validateTraits([{ k: "burn", chance: 400 }]) === "string", "шанс 400% — отказ");
ok(typeof validateTraits(new Array(7).fill({ k: "slow" })) === "string", "> 6 черт — отказ");
ok(Array.isArray(validateTraits([{ k: "burn", chance: 40 }])), "поджог 40% — ок");
void SCHEMA;
// 5. квесты
const good = { id: "c_t1", title: "Т", npc: Object.keys({}).length ? "" : undefined } as any;
ok(typeof validateQuest({ id: "evil", title: "x" }) === "string", "id квеста без c_ — отказ");
ok(typeof validateQuest({ ...good, id: "c_" + "x".repeat(200) }) === "string", "длинный id — отказ");
ok(typeof validateQuest(null) === "string", "null-квест — отказ");
// 6. черты
{ let dot = 0, heal = 0; applyTraits([{ k: "burn", chance: 100, dpsPct: 10, dur: 3 }, { k: "lifesteal", chance: 0, pct: 50 }], 100, () => 0.5, { dot: (_k, d) => (dot = d), slow() {}, knock() {}, freeze() {}, heal: (h) => (heal = h) });
  ok(dot === 10 && heal === 0, `черты: поджог 10/с, вампиризм с шансом 0 не срабатывает (${dot}, ${heal})`); }
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);

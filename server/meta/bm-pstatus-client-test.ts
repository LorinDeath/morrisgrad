// Клиент: статусы навыков мобов в МИРЕ (раньше slow/freeze работали только на арене) и наводка снарядов мобов на игроков.
// Статическая проверка кода клиента + логика mobPos; живая проверка — локальный плейтест (замедление/заморозка/отброс, ptg p:sid).
// Запуск: cd server && bun meta/bm-pstatus-client-test.ts
import { readFileSync } from "node:fs";
let P = 0, F = 0; const ok = (c: any, m: string) => { if (c) { P++; console.log("PASS " + m); } else { F++; console.log("FAIL " + m); } };
const G = readFileSync(new URL("../../src/pages/MorrisCurse/_core/game.js", import.meta.url), "utf8");
const Z = readFileSync(new URL("../../src/pages/MorrisCurse/_core/hub/zoneView.js", import.meta.url), "utf8");
ok(!/slowK = world === 'arena'/.test(G) && /slowK = pn < pvpSt\.frozenUntil \? 0 : pn < pvpSt\.slowUntil \? 0\.6 : 1/.test(G), "замедление/заморозка действуют вне арены");
ok(/else if \(e\.k === 'pstatus'\) \{ if \(e\.to === myId\) out\.push\(e\); \}/.test(Z), "zoneView: pstatus мира → game.js (только мне)");
ok(/e\.k === 'pstatus'\) \{ \/\/ 🛠 навык моба \(мир\)/.test(G) && /pvpSt\.kb = \{/.test(G) && /vx \+= pvpSt\.kb\.vx/.test(G), "game.js: мир — slow/freeze/knock применяются к движению");
ok(/id\.startsWith\('p:'\)\) return this\.playerPos/.test(Z) && /zone\.playerPos = \(sid\)/.test(G), "наводка: цель 'p:sid' → позиция игрока");
// логика mobPos как в zoneView
const view: any = { mobs: new Map([[7, { x: 1, y: 2 }]]), playerPos: (sid: string) => sid === "me" ? [10, 20] : null };
const mobPos = (id: any) => { if (typeof id === "string" && id.startsWith("p:")) return view.playerPos?.(id.slice(2)) || null; const o = view.mobs.get(id); return o ? [o.x, o.y] : null; };
ok(JSON.stringify(mobPos(7)) === "[1,2]" && JSON.stringify(mobPos("p:me")) === "[10,20]" && mobPos("p:x") === null, "mobPos: моб / я / нет игрока");
console.log(`${P} PASS / ${F} FAIL`); if (F) process.exitCode = 1;

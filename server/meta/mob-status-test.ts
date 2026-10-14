import { mobStatusBits } from "./zone";
let f = 0; const ok = (c: any, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
const dec = (b: number) => ({ burn: (b >> 13) & 7, poison: (b >> 16) & 7, bleed: (b >> 19) & 7, kinds: b & 56 }); // как zoneView.js
const now = 1000, D = (kind: string, until = 2000) => ({ kind, until });
let d = dec(mobStatusBits([D("burn"), D("burn"), D("bleed")], now));
ok(d.burn === 2 && d.bleed === 1 && d.poison === 0 && d.kinds === (8 | 32), "поджог ×2 + кровотечение ×1 — раздельно " + JSON.stringify(d));
d = dec(mobStatusBits([D("burn"), D("burn", 500), D("poison")], now)); ok(d.burn === 1 && d.poison === 1, "истёкшие стаки не считаются");
d = dec(mobStatusBits(Array.from({ length: 12 }, () => D("poison")), now)); ok(d.poison === 7 && d.burn === 0 && d.bleed === 0, "стаки до 7 без переполнения в соседние поля");
ok(mobStatusBits([], now) === 0 && mobStatusBits(undefined, now) === 0, "без статусов — 0");
ok((mobStatusBits([D("bleed")], now) & (1 << 22 | 64 | 4)) === 0, "не задевает флаги заморозки/замедления/элиты");
console.log(f ? `FAILED ${f}` : "mob-status ok"); if (f) process.exit(1);

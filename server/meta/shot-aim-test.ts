// Точка вылета/прицел выстрела: клиентская точка принимается только в допуске, направление — к курсору
import { shotAim, SHOT_TOL } from "./abilityShapes";
let ok = 0, bad = 0; const t = (n: string, c: any) => { c ? (ok++, console.log("ok  ", n)) : (bad++, console.log("FAIL", n)); };
const a = shotAim(1000, 1000, { ox: 1040, oy: 1000, tx: 1040, ty: 1300, dx: 1, dy: 0 });
t("клиентская точка в допуске принята", a.client && a.x === 1040 && a.y === 1000);
t("направление — к курсору от принятой точки", Math.abs(a.dx) < 1e-9 && Math.abs(a.dy - 1) < 1e-9);
const b = shotAim(1000, 1000, { ox: 1000 + SHOT_TOL + 5, oy: 1000, dx: 0, dy: -1 });
t("дальше допуска — серверная позиция", !b.client && b.x === 1000 && b.dy === -1);
const c = shotAim(1000, 1000, { ox: "x", oy: NaN, tx: Infinity, dx: 3, dy: 4 });
t("мусор → сервер + вектор dx/dy", !c.client && Math.abs(c.dx - 0.6) < 1e-9);
const d = shotAim(30, 30, { ox: 0, oy: 30, dx: 1, dy: 0 }, 46, 754);
t("клиентская точка зажата в границы арены", d.client && d.x === 46);
const e = shotAim(1000, 1000, {}); t("пустое сообщение → нулевой вектор (вызывающий решает)", e.dx === 0 && e.dy === 0);
// курсор далеко от героя: вылет — всё равно из героя, к курсору летит только направление
const f = shotAim(1000, 1000, { ox: 1000, oy: 1000, tx: 2600, ty: 1000 }); t("курсор в 1600 px — вылет из героя", f.x === 1000 && f.y === 1000 && Math.abs(f.dx - 1) < 1e-9);
const g = shotAim(1000, 1000, { ox: 2600, oy: 1000, tx: 2700, ty: 1000 }); t("подделка: точка вылета = курсор → серверная позиция", !g.client && g.x === 1000 && g.y === 1000 && Math.abs(g.dx - 1) < 1e-9);
const h = shotAim(1000, 1000, { ox: 1000 + 60, oy: 1000, tx: 900, ty: 1000 }); t("60 px от героя (больше руки/лага) → серверная позиция", !h.client && h.x === 1000 && h.dx < 0);
t("допуск — небольшой (≤ 48 px)", SHOT_TOL <= 48);
console.log(`shot-aim ${ok}/${ok + bad}`); if (bad) process.exit(1);

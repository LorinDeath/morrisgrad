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
const d = shotAim(30, 30, { ox: -40, oy: 30, dx: 1, dy: 0 }, 46, 754);
t("клиентская точка зажата в границы арены", d.client && d.x === 46);
const e = shotAim(1000, 1000, {}); t("пустое сообщение → нулевой вектор (вызывающий решает)", e.dx === 0 && e.dy === 0);
console.log(`shot-aim ${ok}/${ok + bad}`); if (bad) process.exit(1);

// Тест смены дня и ночи: фазы, ключевые цвета, непрерывность и монотонность, огни, форс-время, часовой пояс.
import { dnAt, dnMinutes, dnClient, zoneMinutes, DN_CFG, hex3, easeIO } from "./dayNight";
import { validatePatch as validate } from "./overrides";
let ok = 0, bad = 0; const t = (c: any, m: string) => { if (c) ok++; else { bad++; console.log("FAIL", m); } };
const H = (h: number, m = 0) => h * 60 + m, lum = (c: number[]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
t(dnAt(H(12)).phase === "day" && dnAt(H(12)).dark === 0 && dnAt(H(12)).lights === 0, "полдень — день, без огней");
t(dnAt(H(19, 29)).phase === "day", "19:29 — ещё день");
t(dnAt(H(19, 30)).phase === "dusk" && dnAt(H(19, 30)).p === 0, "19:30 — начало заката");
t(dnAt(H(19, 45)).phase === "dusk" && Math.abs(dnAt(H(19, 45)).p - 0.5) < 1e-9, "19:45 — середина");
t(dnAt(H(20)).phase === "night" && dnAt(H(23)).phase === "night" && dnAt(H(3)).phase === "night", "20:00…05:30 — ночь");
t(dnAt(H(5, 30)).phase === "dawn" && dnAt(H(6)).phase === "day", "рассвет 05:30, день с 06:00");
// непрерывность: шаг 1 с — без скачков цвета и темноты; на стыках фаз — совпадение
let maxJ = 0, prev = dnAt(0);
for (let s = 1; s <= 86400; s++) { const c = dnAt(s / 60); maxJ = Math.max(maxJ, ...c.color.map((v, i) => Math.abs(v - prev.color[i])), Math.abs(c.dark - prev.dark), Math.abs(c.lights - prev.lights)); prev = c; }
t(maxJ < 0.004, `плавно (макс. скачок за 1 с ${maxJ.toFixed(5)})`);
// закат: яркость монотонно падает, огни монотонно растут; рассвет — наоборот
let mono = true, monoL = true; for (let m = H(19, 30); m < H(20); m += 0.25) { if (lum(dnAt(m + 0.25).color) > lum(dnAt(m).color) + 1e-9) mono = false; if (dnAt(m + 0.25).lights < dnAt(m).lights - 1e-9) monoL = false; }
t(mono && monoL, "закат: темнеет и огни разгораются монотонно");
mono = true; monoL = true; for (let m = H(5, 30); m < H(6); m += 0.25) { if (lum(dnAt(m + 0.25).color) < lum(dnAt(m).color) - 1e-9) mono = false; if (dnAt(m + 0.25).lights > dnAt(m).lights + 1e-9) monoL = false; }
t(mono && monoL, "рассвет: светлеет и огни гаснут монотонно");
// грейд: на закате тёплый (R>B), к ночи синий (B>R); рассвет через холодный фиолет к тёплому
const c40 = dnAt(H(19, 37)).color, c50 = dnAt(H(19, 52)).color, n = dnAt(H(22)).color;
t(c40[0] > c40[2] + 0.1, "19:37 — золото (тёплое) " + c40.map((x) => x.toFixed(2)));
t(c50[0] > c50[1] && c50[2] > c50[1], "19:52 — розово-фиолетовый " + c50.map((x) => x.toFixed(2)));
t(n[2] > n[0] && lum(n) < 0.25, "ночь — глубокая синяя и тёмная " + n.map((x) => x.toFixed(2)));
const d40 = dnAt(H(5, 40)).color, d55 = dnAt(H(5, 55)).color;
t(d40[2] > d40[1], "05:40 — холодный фиолет " + d40.map((x) => x.toFixed(2)));
t(d55[0] > d55[2], "05:55 — тёплый " + d55.map((x) => x.toFixed(2)));
// огни: на 19:30 нет, после 35% разгораются, к 85% — полные
t(dnAt(H(19, 30)).lights === 0 && dnAt(H(19, 30) + 0.3 * 30).lights === 0 && dnAt(H(19, 30) + 0.5 * 30).lights > 0.2 && dnAt(H(19, 30) + 0.86 * 30).lights === 1, "огни: lightsOn/lightsFull");
t(dnAt(H(5, 30)).lights === 1 && dnAt(H(5, 59)).lights === 0, "огни гаснут к концу рассвета");
t(easeIO(0) === 0 && easeIO(1) === 1 && Math.abs(easeIO(0.5) - 0.5) < 1e-9 && easeIO(0.1) < 0.1, "ease-in-out");
// настройки: темнота, цвета, выкл, свои времена через полночь
t(Math.abs(Math.max(...dnAt(H(22), { ...DN_CFG, nightDark: 0.5 }).color) - 0.5) < 1e-6, "nightDark 0.5 → яркость ночи 0.5");
t(dnAt(H(22), { ...DN_CFG, on: false }).color.every((v) => v === 1), "выкл — всегда день");
t(dnAt(H(19, 50), { ...DN_CFG, cGolden: "#ff0000", cPink: "#ff0000", cNight: "#ff0000" }).color[1] < 0.05, "ключевые цвета из админки");
const X = { ...DN_CFG, duskStart: "23:50", night: "00:20", dawnStart: "04:00", day: "04:30" };
t(dnAt(H(23, 55), X).phase === "dusk" && dnAt(H(0, 10), X).phase === "dusk" && dnAt(H(0, 30), X).phase === "night" && dnAt(H(12), X).phase === "day", "переход через полночь");
t(hex3("#ff8000")[1] > 0.5 && hex3("bad", [0, 0, 0])[0] === 0, "hex3");
// часовой пояс: 17:00 UTC = 20:00 Киев (летом +3)
t(Math.abs(zoneMinutes(Date.UTC(2026, 6, 1, 17, 0, 0)) - H(20)) < 1e-6, "Europe/Kiev летом UTC+3");
t(Math.abs(zoneMinutes(Date.UTC(2026, 11, 1, 18, 0, 0)) - H(20)) < 1e-6, "Europe/Kiev зимой UTC+2");
t(Math.abs(zoneMinutes(Date.UTC(2026, 6, 1, 17, 0, 0), { ...DN_CFG, tz: "Bad/Zone", utcOffsetH: 3 }) - H(20)) < 1e-6, "неизвестный пояс → смещение");
// форс-время и ускорение
const F = { ...DN_CFG, force: "19:30", speed: 60 }; const T0 = 1_000_000;
t(Math.abs(dnMinutes(T0, F) - H(19, 30)) < 1e-9 && Math.abs(dnMinutes(T0 + 10000, F) - H(19, 40)) < 1e-9, "форс 19:30 ×60: через 10 с — 19:40");
Object.assign(DN_CFG, { force: "05:45", speed: 0 }); const c = dnClient(T0); t(Math.abs(c.min - H(5, 45)) < 1e-9 && c.rate === 0 && c.cfg.cNight, "dnClient: форс и скорость");
Object.assign(DN_CFG, { force: "", speed: 1 }); t(dnClient().rate === 1, "реальное время — скорость 1");
// админка
t(typeof validate("dn", "main", { duskStart: "19:30", night: "20:00", cNight: "#223355", nightDark: 0.8 }) === "object", "админка: валидно");
t(typeof validate("dn", "main", { duskStart: "25:00" }) === "string", "админка: ЧЧ:ММ");
t(typeof validate("dn", "main", { force: "" }) === "object", "админка: форс пустой — можно");
t(typeof validate("dn", "main", { cGolden: "orange" }) === "string", "админка: цвет #rrggbb");
t(typeof validate("dn", "main", { tz: "Mars/Base" }) === "string", "админка: пояс");
t(typeof validate("dn", "main", { nightDark: 1.5 }) === "string", "админка: темнота 0…0.95");
console.log(`dayNight: ${ok} ok, ${bad} fail`); if (bad) process.exit(1);

// Раскладка интерфейса (uiLayout.ts): проверка данных от клиента + админ-поля новых настроек. Запуск: esbuild → node (как остальные *-test.ts).
import { cleanLayout, layoutView, UI_LAY_MAX, UI_LAY_BYTES } from "./uiLayout";
import { UI_CFG, uiClient } from "./uiCfg";
import { POS_CFG } from "./city";
let okN = 0, failN = 0;
const ok = (c: any, m: string) => { if (c) { okN++; console.log("ok   " + m); } else { failN++; console.log("FAIL " + m); } };

const g = cleanLayout("pc", { abar: [0.1, -0.2], chat: [0.123456, 0.5], mm: [0, 0] }, false, 5);
ok(g && g.dev === "pc" && g.lay.off.abar[0] === 0.1 && g.lay.off.chat[0] === 0.1235 && !("mm" in g.lay.off) && g.lay.at === 5 && !g.lay.lock, "норма: числа, округление до 4 знаков, нулевой сдвиг не храним");
ok(cleanLayout("mob", {}, true)?.lay.lock === 1, "замок сохраняется");
ok(cleanLayout("tv", {}, false) === null && cleanLayout("pc", [1, 2] as any) === null && cleanLayout("pc", "x" as any) === null && cleanLayout("pc", null) === null, "чужое устройство / не объект — отказ");
const bad = cleanLayout("pc", { evil: [0.1, 0.1], abar: ["0.1", 0.1], chat: [NaN, 0], mm: [2, 0], tgt: [0.1], xp: [0.1, Infinity], tracker: { x: 1 }, toasts: [0.2, 0.3] } as any);
ok(bad && Object.keys(bad.lay.off).join() === "toasts", "неизвестные id, строки, NaN, |v|>1, не пары, Infinity — выкинуты");
const many: any = {}; for (let i = 0; i <= UI_LAY_MAX; i++) many["k" + i] = [0.1, 0.1];
ok(cleanLayout("pc", many) === null, `больше ${UI_LAY_MAX} ключей — отказ`);
ok(cleanLayout("pc", { abar: [0.1, 0.1], pad: "x".repeat(UI_LAY_BYTES) } as any) === null, `JSON больше ${UI_LAY_BYTES} байт — отказ`);
const v = layoutView({ uiLay: { pc: { off: { abar: [0.2, 0.1], hack: [0.1, 0.1] }, at: 9 }, mob: { off: { chat: [5, 5] }, lock: 1 }, tv: { off: {} } } });
ok(v && v.pc.off.abar[0] === 0.2 && !v.pc.off.hack && v.mob.lock === 1 && !Object.keys(v.mob.off).length && !v.tv, "из хранилища — через тот же фильтр");
ok(layoutView({}) === null && layoutView({ uiLay: "x" }) === null, "нет раскладки — null");

const u = uiClient() as any;
ok(u.drag === true && u.dragMobile === true && u.longPressMs === 450 && u.xpBar === true && u.xpPop === true && u.xpPopMs === 1600 && u.fsAuto === true, "uiClient: новые настройки по умолчанию");
(UI_CFG as any).longPressMs = 99999; (UI_CFG as any).drag = false;
const u2 = uiClient() as any; ok(u2.longPressMs === 1500 && u2.drag === false, "uiClient: предел долгого нажатия и выкл перетаскивания");
(UI_CFG as any).longPressMs = 450; (UI_CFG as any).drag = true;
ok((POS_CFG as any).perBody === true && (POS_CFG as any).switchTp === false, "POS_CFG: точка у каждого тела, перенос при смене тела выкл");
console.log(`\n${okN} ok, ${failN} fail`); if (failN) process.exit(1);

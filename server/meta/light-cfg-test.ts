// Свет (админка «💡 Свет»): схема правится, рамки соблюдаются, клиенту уходят только числа в пределах и флаг ореола.
import { validatePatch, applyOverride, SCHEMA, TABLES } from "./overrides";
import { LIGHT_CFG, lightClient } from "./lightCfg";
import { KINDS } from "./admin";
import { blkVisClient } from "./bmCfg";
let fail = 0; const t = (n: string, c: boolean) => { if (!c) fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}`); };
t("вкладка light в KINDS и TABLES", KINDS.includes("light" as any) && !!TABLES.light?.main && !!SCHEMA.light);
t("все поля LIGHT_CFG есть в схеме", Object.keys(LIGHT_CFG).every((k) => SCHEMA.light.fields.some((f) => f.path === k)));
const p = validatePatch("light", "main", { ground: 1, pool: 1.5, haloBehind: false } as any);
t("правка проходит", typeof p !== "string");
t("вне пределов — отказ", typeof validatePatch("light", "main", { pool: 5 } as any) === "string" && typeof validatePatch("light", "main", { ground: 0.1 } as any) === "string");
t("чужое поле — отказ", typeof validatePatch("light", "main", { bloom: 1 } as any) === "string");
applyOverride("light", "main", p); const c = lightClient();
t("применение → клиенту", c.ground === 1 && c.pool === 1.5 && c.haloBehind === false);
applyOverride("light", "main", null); const d = lightClient();
t("сброс → значения из кода", d.ground === 0.84 && d.pool === 1 && d.haloBehind === true && d.hero === 1);
t("яркость героев по умолчанию 1 (засвет исправлен в pixColor.js)", blkVisClient().heroLight === 1);
console.log(fail ? `light-cfg: FAILED ${fail}` : "light-cfg ok"); if (fail) (globalThis as any).process?.exit(1);

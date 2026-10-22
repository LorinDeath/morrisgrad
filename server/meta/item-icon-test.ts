// Значки копий вещей (варианты биомов, id «<вариант>_<слот>»): в атласе items_atlas.json своих клеток нет — значок базовой вещи (part).
// Номер в библиотеке (n) остаётся своим (уникальный ключ сетки), значок — ic. Запуск: cd server && bun meta/item-icon-test.ts
import { ITEMS } from "./defs";
import { itemCard, iconIndex, ICON_ATLAS_COUNT, ITEM_INDEX, SILHOUETTES } from "./library";
import { isCopy, copyBase } from "./variantCopy";
let f = 0, n = 0; const ok = (c: any, m: string, x?: any) => { n++; console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " " + JSON.stringify(x) : "")); if (!c) f++; };
const copies = ITEMS.filter((it: any) => isCopy(it.id));
ok(copies.length >= 170, `копий вещей: ${copies.length}`);
ok(ICON_ATLAS_COUNT === 345, `клеток в атласе: ${ICON_ATLAS_COUNT}`);
const bad = copies.filter((it: any) => { const b = copyBase(it.id)!; const ic = iconIndex(it.id); return ic !== ITEM_INDEX[b] || ic >= ICON_ATLAS_COUNT; }).map((it: any) => it.id);
ok(!bad.length, "у каждой копии значок = значок базовой вещи, в пределах атласа", bad.slice(0, 5));
const cardBad = copies.filter((it: any) => { const c: any = itemCard(it.id); return !c || c.ic !== ITEM_INDEX[copyBase(it.id)!] || c.n !== ITEM_INDEX[it.id]; }).map((it: any) => it.id);
ok(!cardBad.length, "карточка копии: n — своя (уникальна), ic — базовой", cardBad.slice(0, 5));
const ex: any = itemCard("ice_whisper_wisp_weapon"); ok(ex && ex.ic < ICON_ATLAS_COUNT && ex.ic === ITEM_INDEX[copyBase("ice_whisper_wisp_weapon")!], "ice_whisper_wisp_weapon → значок базы", ex && { n: ex.n, ic: ex.ic });
const own = ITEMS.filter((it: any) => !isCopy(it.id)); ok(own.every((it: any) => iconIndex(it.id) === ITEM_INDEX[it.id]), `обычные вещи (${own.length}) — свой значок`);
ok(SILHOUETTES.every((s: any, i: number) => (s.length > 3 ? s[3] : i) < ICON_ATLAS_COUNT), "силуэты библиотеки: значок в пределах атласа");
ok(new Set(ITEMS.map((it: any) => itemCard(it.id)?.n)).size === ITEMS.length, "номера n уникальны (сетка библиотеки)");
console.log(f ? `FAILED ${f}` : `item-icon ok ${n}/${n}`); if (f) process.exit(1);

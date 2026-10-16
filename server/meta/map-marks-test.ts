// Метки карты M: лимит 200, имя ≤ 32 и чистка, координаты в пределах мира, раздельно по героям, удаление, переживает «перезапуск».
import { MarkStore, cleanMarkName, MARKS_MAX } from "./mapMarks";
let pass = 0, fail = 0; const ok = (c: any, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const st = new MarkStore(null);
let r = await st.add("uid:a", "mage", "arinar", 1000, 2000, "  Логово <b>босса</b>\n "); ok(r.ok && r.mark!.n === "Логово bбосса/b", "имя очищено: " + r.mark?.n);
ok(cleanMarkName("x".repeat(80)).length === 32 && cleanMarkName("   ") === "Метка", "≤ 32 символов, пустое → «Метка»");
ok(!(await st.add("uid:a", "mage", "arinar", -5, 10, "x")).ok && !(await st.add("uid:a", "mage", "arinar", 1e9, 10, "x")).ok && !(await st.add("uid:a", "mage", "arinar", NaN, 1, "x")).ok, "вне карты / мусор — отказ");
ok(!(await st.add("uid:a", "mage", "nowhere", 1, 1, "x")).ok, "неизвестный мир — отказ");
ok((await st.list("uid:a", "warrior", "arinar")).length === 0, "другой герой того же аккаунта меток не видит");
ok((await st.list("uid:b", "mage", "arinar")).length === 0, "другой игрок меток не видит");
for (let i = 0; i < MARKS_MAX + 5; i++) await st.add("uid:c", "rogue", "arinar", 100 + i, 100, "m" + i);
ok((await st.list("uid:c", "rogue", "arinar")).length === MARKS_MAX, `лимит ${MARKS_MAX}`);
const id = r.mark!.id; ok((await st.rename("uid:a", "mage", "arinar", id, "Пещера")).ok && (await st.list("uid:a", "mage", "arinar"))[0].n === "Пещера", "переименование");
ok(!(await st.del("uid:b", "mage", "arinar", id)).ok, "чужую не удалить");
const st2 = new MarkStore(null); st2.mem = st.mem; ok((await st2.list("uid:a", "mage", "arinar")).length === 1, "после перезапуска — из хранилища");
ok((await st.del("uid:a", "mage", "arinar", id)).ok && (await st.list("uid:a", "mage", "arinar")).length === 0, "удаление");
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1);

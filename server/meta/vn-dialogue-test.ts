// Диалоги-новеллы: серверная проверка окон (известный персонаж/эмоция, лимиты) + реестр (у каждого персонажа 10 эмоций и иконка на диске)
import { validateDialogue, VN_CHARS, VN_EMOTIONS, VN_LIMITS, vnImg, vnIcon } from "./vnChars";
import { existsSync } from "fs";
let fail = 0; const ok = (c: boolean, m: string) => { if (!c) fail++; console.log(`${c ? "ok  " : "FAIL"} ${m}`); };
const W = (o: any = {}) => ({ who: "alzi", emo: "calm", text: "Привет", ...o });
ok(typeof validateDialogue({ offer: [W(), W({ who: "hero", emo: "joy" })], done: [W({ who: "leyr" })] }) !== "string", "корректный диалог принят");
ok(typeof validateDialogue({ offer: [W({ who: "nobody" })] }) === "string", "неизвестный персонаж → отказ");
ok(typeof validateDialogue({ offer: [W({ emo: "rage" })] }) === "string", "неизвестная эмоция → отказ");
ok(typeof validateDialogue({ offer: [W({ text: "  " })] }) === "string", "пустой текст → отказ");
ok(typeof validateDialogue({ offer: [W({ text: "я".repeat(VN_LIMITS.text + 1) })] }) === "string", "длинный текст → отказ");
ok(typeof validateDialogue({ offer: Array.from({ length: VN_LIMITS.windows + 1 }, () => W()) }) === "string", "слишком много окон → отказ");
ok(typeof validateDialogue({ offer: [{ ...W(), evil: "<script>" }] }) !== "string" && !(validateDialogue({ offer: [{ ...W(), evil: 1 }] }) as any).offer[0].evil, "лишние поля отброшены");
ok(typeof validateDialogue([]) === "string" && typeof validateDialogue(null) === "string", "не объект → отказ");
for (const c of Object.values(VN_CHARS)) {
  const miss = VN_EMOTIONS.filter((e) => !existsSync("../public" + vnImg(c.id, e)) || !existsSync("../public" + vnImg(c.id, e, true)));
  ok(!miss.length && existsSync("../public" + vnIcon(c.id)), `${c.id} (${c.name}): 10 эмоций + иконка${miss.length ? " нет: " + miss : ""}`);
}
console.log(fail ? `FAIL ${fail}` : "ALL PASS"); if (fail) process.exit(1);

// Визуальная новелла: реестр персонажей диалогов. Каждый id привязан к имени, иконке и 10 эмоциям
// (картинки — public/mc-vn/<id>/<emo>.webp, превью <emo>_t.webp, иконка icon.webp; исходники — /workspace/vn_art).
// Используется и сервером (проверка диалогов из админки), и клиентом (окна диалога, иконки NPC).
import { HERO_NAMES } from "./shared";

export const VN_EMOTIONS = ["calm", "joy", "shock", "anger", "sad", "fear", "shy", "smirk", "think", "determined"] as const;
export type VnEmotion = (typeof VN_EMOTIONS)[number];
export const VN_EMOTION_NAMES: Record<VnEmotion, string> = {
  calm: "Спокойствие", joy: "Радость", shock: "Шок", anger: "Злость", sad: "Грусть",
  fear: "Страх", shy: "Смущение", smirk: "Ухмылка", think: "Задумчивость", determined: "Решимость",
};
export interface VnChar { id: string; name: string; color: string; hero?: boolean; npc?: string }
const H = HERO_NAMES as Record<string, string>;
export const VN_CHARS: Record<string, VnChar> = {
  warrior: { id: "warrior", name: H.warrior || "Велес", color: "#fca5a5", hero: true },
  spearman: { id: "spearman", name: H.spearman || "Нофорд", color: "#93c5fd", hero: true },
  rogue: { id: "rogue", name: H.rogue || "Кавега", color: "#86efac", hero: true },
  mage: { id: "mage", name: H.mage || "Мариэль", color: "#c4b5fd", hero: true },
  petr: { id: "petr", name: "Пётр", color: "#fbbf24", npc: "petr" },
  kyut: { id: "kyut", name: "Кьют", color: "#f472b6", npc: "kyut" },
  alzi: { id: "alzi", name: "Алзи", color: "#fde68a", npc: "alzi" },
  leyr: { id: "leyr", name: "Лэйр", color: "#f9a8d4", npc: "leyr" },
  // Чёрный маг (blackMage.ts): портреты Художника /workspace/vn_art/black_mage → public/mc-vn/black_mage (tools/vn-convert.mjs)
  black_mage: { id: "black_mage", name: "Чёрный маг", color: "#a78bfa", npc: "black_mage" },
};
/** спец-говорящий «hero» — оболочка, которую сейчас носит игрок (подставляется на клиенте) */
export const VN_HERO = "hero";
export const VN_BASE = "/mc-vn";
export const vnImg = (id: string, emo: string, thumb = false) => `${VN_BASE}/${id}/${emo}${thumb ? "_t" : ""}.webp`;
export const vnIcon = (id: string) => `${VN_BASE}/${id}/icon.webp`;
/** иконка NPC мира (квестодатель) → персонаж VN, если арт есть */
export const npcVnChar = (npc: string) => Object.values(VN_CHARS).find((c) => c.npc === npc)?.id || (npc === "leyr_echo" ? "leyr" : undefined);

/** окно новеллы. id — метка для переходов; go — после окна перейти к метке («end» — конец фазы); ch — выбор игрока (2…4 варианта):
 *  вариант t — текст кнопки, go — к какому окну (пусто — следующее), k — ключ ветки (награда rewards.alt[k] и открытие квестов «после ветки») */
export interface VnChoice { t: string; go?: string; k?: string }
export interface VnWindow { who: string; emo: VnEmotion; text: string; id?: string; go?: string; ch?: VnChoice[] }
/** поток квеста: offer — окна пояснения → accept — окно получения (цели+награда, «Взять») → progress — «В процессе» → done — окна сдачи («Сдать» на последнем) */
export interface QuestDialogue { offer: VnWindow[]; accept?: VnWindow | null; progress?: VnWindow | null; done: VnWindow[] }
export const VN_LIMITS = { windows: 250, text: 500, choices: 4 };
const LBL = /^[a-z0-9_]{1,24}$/;

/** серверная проверка диалога из админки: известный говорящий и эмоция, лимиты длины. Возвращает чистую копию или ошибку. */
function cleanWin(w: any, label: string, allowEmpty = false): VnWindow | string | null {
  if (w == null) return null;
  if (typeof w !== "object" || Array.isArray(w)) return `${label}: пусто`;
  const who = String(w.who || ""), emo = String(w.emo || "calm");
  if (who !== VN_HERO && !VN_CHARS[who]) return `${label}: неизвестный персонаж`;
  if (!(VN_EMOTIONS as readonly string[]).includes(emo)) return `${label}: неизвестная эмоция`;
  if (w.text != null && typeof w.text !== "string") return `${label}: нужен текст`;
  const text = String(w.text || "").replace(/\r/g, "").trim();
  if (!text && !allowEmpty) return `${label}: пустой текст`;
  if (text.length > VN_LIMITS.text) return `${label}: текст длиннее ${VN_LIMITS.text}`;
  const o: VnWindow = { who, emo: emo as VnEmotion, text };
  if (w.id != null && w.id !== "") { const id = String(w.id); if (!LBL.test(id) || id === "end") return `${label}: метка — латиница/цифры/_ (до 24)`; o.id = id; }
  if (w.go != null && w.go !== "") { const g = String(w.go); if (!LBL.test(g)) return `${label}: переход — метка окна или end`; o.go = g; }
  if (w.ch != null && !(Array.isArray(w.ch) && !w.ch.length)) {
    if (!Array.isArray(w.ch) || w.ch.length < 2 || w.ch.length > VN_LIMITS.choices) return `${label}: вариантов выбора 2…${VN_LIMITS.choices}`;
    o.ch = [];
    for (const [j, c] of w.ch.entries()) { const t = String(c?.t || "").trim().slice(0, 80), g = String(c?.go || ""), k = String(c?.k || "");
      if (!t) return `${label}, вариант ${j + 1}: нужен текст кнопки`;
      if (g && !LBL.test(g)) return `${label}, вариант ${j + 1}: переход — метка окна или end`;
      if (k && !LBL.test(k)) return `${label}, вариант ${j + 1}: ключ ветки — латиница/цифры/_ (до 24)`;
      o.ch.push({ t, ...(g ? { go: g } : {}), ...(k ? { k } : {}) }); }
  }
  return o;
}
/** проверка графа фазы (offer/done): метки уникальны, переходы ведут к существующим окнам, конец достижим, все окна достижимы */
export function dialogueGraphErr(ws: VnWindow[], ph: string): string | null {
  const name = ph === "done" ? "сдача" : "пояснение", ids = new Map<string, number>();
  for (const [i, w] of ws.entries()) if (w.id) { if (ids.has(w.id)) return `${name}: метка «${w.id}» повторяется (окна ${ids.get(w.id)! + 1} и ${i + 1})`; ids.set(w.id, i); }
  const tgt = (g: string | undefined, i: number) => (!g ? i + 1 : g === "end" ? ws.length : ids.get(g) ?? -1);
  for (const [i, w] of ws.entries()) {
    if (w.go && tgt(w.go, i) < 0) return `${name}, окно ${i + 1}: переход к несуществующей метке «${w.go}»`;
    for (const [j, c] of (w.ch || []).entries()) if (c.go && tgt(c.go, i) < 0) return `${name}, окно ${i + 1}, вариант ${j + 1}: ветка ведёт к несуществующей метке «${c.go}»`;
  }
  if (!ws.length) return null;
  const seen = new Set<number>(), st = [0]; let end = false;
  while (st.length) { const i = st.pop()!; if (i >= ws.length) { end = true; continue; } if (seen.has(i)) continue; seen.add(i);
    const w = ws[i]; if (w.ch?.length) for (const c of w.ch) st.push(tgt(c.go, i)); else st.push(tgt(w.go, i)); }
  if (!end) return `${name}: диалог зациклен — из окна 1 нельзя дойти до конца`;
  const lost = ws.map((_, i) => i).filter((i) => !seen.has(i));
  if (lost.length) return `${name}: окна ${lost.slice(0, 6).map((i) => i + 1).join(", ")}${lost.length > 6 ? "…" : ""} недостижимы (нет перехода к их метке)`;
  return null;
}
/** ключи веток, которые можно выбрать в диалоге */
export const dialogueKeys = (d: QuestDialogue | null | undefined) => [...new Set([...(d?.offer || []), ...(d?.done || [])].flatMap((w) => (w.ch || []).map((c) => c.k).filter(Boolean) as string[]))];
/** серверная проверка диалога из админки: известный говорящий и эмоция, лимиты длины. Возвращает чистую копию или ошибку. */
export function validateDialogue(d: any): QuestDialogue | string {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "диалог: нужен объект";
  const out: QuestDialogue = { offer: [], done: [] };
  for (const ph of ["offer", "done"] as const) {
    const arr = d[ph] == null ? [] : d[ph];
    if (!Array.isArray(arr)) return `диалог ${ph}: нужен список окон`;
    if (arr.length > VN_LIMITS.windows) return `не больше ${VN_LIMITS.windows} окон в диалоге`;
    for (let i = 0; i < arr.length; i++) { const w = cleanWin(arr[i], `окно ${i + 1}`); if (typeof w === "string") return w; if (w) out[ph].push(w); }
  }
  // окно получения: текст может быть пустым (покажем цели и награду); «В процессе» с пустым текстом — нет окна
  for (const ph of ["offer", "done"] as const) { const e = dialogueGraphErr(out[ph], ph); if (e) return e; }
  const plain = (w: VnWindow) => ({ who: w.who, emo: w.emo, text: w.text }); // окна получения и «В процессе» — без выбора
  const acc = cleanWin(d.accept, "окно получения", true); if (typeof acc === "string") return acc; if (acc) out.accept = plain(acc);
  const pr = cleanWin(d.progress, "окно «В процессе»", true); if (typeof pr === "string") return pr; if (pr && pr.text) out.progress = plain(pr);
  return out;
}
export const dialogueEmpty = (d: QuestDialogue) => !d.offer.length && !d.done.length && !d.accept && !d.progress;
/** поток квеста с подстановкой старых реплик (offer/progress/done строки → окна квестодателя, эмоция calm) — ничего старого не ломается */
export function questFlow(q: { npc: string; turnin?: string; offer?: string[]; progress?: string; done?: string[] }, d?: QuestDialogue | null): Required<QuestDialogue> {
  const giver = npcVnChar(q.npc) || VN_HERO, tin = npcVnChar(q.turnin || q.npc) || giver;
  const lines = (a: any, who: string) => (Array.isArray(a) ? a : a ? [a] : []).map((t: any) => String(t || "").trim()).filter(Boolean).map((text: string) => ({ who, emo: "calm" as VnEmotion, text }));
  return {
    offer: d?.offer?.length ? d.offer : lines(q.offer, giver),
    accept: d?.accept || { who: giver, emo: "calm", text: "" },
    progress: d?.progress || (q.progress && q.progress !== "…" ? { who: giver, emo: "think", text: q.progress } : null),
    done: d?.done?.length ? d.done : lines(q.done, tin),
  };
}

/** диалоги квестов (D1 quest_dialogues): quest_id → окна. Сервер грузит в AdminStore.sync, клиент получает в meta_state. */
export const QUEST_DIALOGUES: Record<string, QuestDialogue> = {};
export function setQuestDialogues(map: Record<string, QuestDialogue>) {
  for (const k of Object.keys(QUEST_DIALOGUES)) delete QUEST_DIALOGUES[k];
  Object.assign(QUEST_DIALOGUES, map);
}

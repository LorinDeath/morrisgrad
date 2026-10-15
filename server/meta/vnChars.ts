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
};
/** спец-говорящий «hero» — оболочка, которую сейчас носит игрок (подставляется на клиенте) */
export const VN_HERO = "hero";
export const VN_BASE = "/mc-vn";
export const vnImg = (id: string, emo: string, thumb = false) => `${VN_BASE}/${id}/${emo}${thumb ? "_t" : ""}.webp`;
export const vnIcon = (id: string) => `${VN_BASE}/${id}/icon.webp`;
/** иконка NPC мира (квестодатель) → персонаж VN, если арт есть */
export const npcVnChar = (npc: string) => Object.values(VN_CHARS).find((c) => c.npc === npc)?.id || (npc === "leyr_echo" ? "leyr" : undefined);

export interface VnWindow { who: string; emo: VnEmotion; text: string }
/** поток квеста: offer — окна пояснения → accept — окно получения (цели+награда, «Взять») → progress — «В процессе» → done — окна сдачи («Сдать» на последнем) */
export interface QuestDialogue { offer: VnWindow[]; accept?: VnWindow | null; progress?: VnWindow | null; done: VnWindow[] }
export const VN_LIMITS = { windows: 30, text: 500 };

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
  return { who, emo: emo as VnEmotion, text };
}
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
  const acc = cleanWin(d.accept, "окно получения", true); if (typeof acc === "string") return acc; if (acc) out.accept = acc;
  const pr = cleanWin(d.progress, "окно «В процессе»", true); if (typeof pr === "string") return pr; if (pr && pr.text) out.progress = pr;
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

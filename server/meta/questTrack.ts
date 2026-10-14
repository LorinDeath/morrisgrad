// Отслеживание заданий: игрок сам выбирает, какие активные квесты видны в трекере, на мини-карте и в компасе.
// Храним «снятые» (untracked): новые задания отслеживаются сразу, старые сохранения без поля — всё отслеживается.
export type QuestBook = { active: Record<string, unknown>; untracked?: string[] };

/** id: один квест (on — отслеживать/снять); id = null — все активные сразу. */
export function setQuestTrack(q: QuestBook, id: string | null, on: boolean): { ok: true; msg: string } | { ok: false; err: string } {
  const act = Object.keys(q.active);
  if (id != null && !act.includes(id)) return { ok: false, err: "Нет такого активного задания" };
  const un = new Set((q.untracked || []).filter((x) => act.includes(x))); // завершённые выпадают сами
  if (id == null) { if (on) un.clear(); else act.forEach((x) => un.add(x)); }
  else if (on) un.delete(id); else un.add(id);
  q.untracked = [...un];
  return { ok: true, msg: id == null ? (on ? "Отслеживаются все задания" : "Отслеживание снято со всех заданий") : on ? "Задание отслеживается" : "Задание больше не отслеживается" };
}
export const isQuestTracked = (q: QuestBook, id: string) => !(q.untracked || []).includes(id);

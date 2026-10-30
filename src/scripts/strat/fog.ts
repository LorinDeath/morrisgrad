// Туман знаний: игрок видит подробности только узлов, доступных для выбора сейчас (все варианты текущей развилки).
// Дальние узлы — «?» без названия и эффекта; навсегда закрытые пути — перечёркнутый «?».
// Клиент рисует только то, что получил: узел без имени или с флагом hidden/redacted/fog считается скрытым.
import { ic } from "./icons";

export type FogView = "show" | "fog" | "fogx";
/** Узел пришёл с сервера урезанным (данных нет — показывать нечего). */
export function redacted(raw: any): boolean {
  return !raw || raw.hidden === true || raw.redacted === true || raw.fog === true || raw.name == null || raw.name === "" || raw.name === "?";
}
/**
 * st — состояние узла; reqDone — все предпосылки изучены; reached — эпоха/уровень уже достигнуты.
 * Видны: изученные, доступные, и все варианты текущей развилки (в т.ч. только что закрытый сосед — его уже видели).
 */
export function fogView(st: "got" | "can" | "later" | "closed", reqDone: boolean, reached: boolean, red: boolean): FogView {
  if (red) return st === "closed" ? "fogx" : "fog";
  if (st === "got" || st === "can") return "show";
  if (reqDone && reached) return "show";
  return st === "closed" ? "fogx" : "fog";
}
// узлы, которые игрок видел скрытыми: при раскрытии — анимация
const wasHidden = new Set<string>();
export function unveilCls(scope: string, id: string, v: FogView): string {
  const k = scope + "|" + id;
  if (v !== "show") { wasHidden.add(k); return ""; }
  if (wasHidden.delete(k)) return " unveil";
  return "";
}
/** Карточка-силуэт «?» в рамке (без названия и эффекта). data-node — только для линий связей. */
export function fogNode(id: string, v: FogView, what: "tech" | "skill"): string {
  const tip = v === "fogx" ? "Путь закрыт навсегда" : what === "tech" ? "Неизвестная технология — откроется, когда изучите предыдущую" : "Неизвестный навык — откроется, когда возьмёте предыдущий";
  return `<button class="tnode fog${v === "fogx" ? " closed" : ""}" data-node="${String(id).replace(/[^\w:.-]/g, "")}" aria-disabled="true" data-tip="${tip}">
    <span class="fogq" aria-hidden="true">?</span>${v === "fogx" ? `<span class="stamp x">${ic("close")}</span>` : ""}<em>${v === "fogx" ? ic("close") + "Закрыто" : ic("lock") + "Неизвестно"}</em></button>`;
}

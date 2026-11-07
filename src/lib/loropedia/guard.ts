// Признак защиты — cookie без текста заметок и без номеров глав.
export const PROTECT_COOKIE = "lp_protect";
export const SPOIL_COOKIE = "lp_spoil";

export function protectionOn(value: string | undefined | null): boolean {
  return value === "1";
}

/** Явное «всё прочитано». Само по себе не открывает текст, если включена защита. */
export function spoilOn(value: string | undefined | null): boolean {
  return value === "1";
}

/** Три уже изданные на сайте книги. Это не список глав и не разметка фактов. */
export const READER_BOOKS = [
  { id: "book:obitel-smerti", label: "Летопись «Обитель смерти»" },
  { id: "book:pravednye-koty", label: "Праведные коты" },
  { id: "book:kill", label: "KILL" },
] as const;

export const CLOSED_TITLE = "Лоропедия — защищённый просмотр";
export const CLOSED_DESCRIPTION = "Защищённый просмотр не показывает текст без пометки, с какой главы книги его можно открыть.";
export const CLOSED_HEADING = "Текст закрыт";
export const CLOSED_BODY = "В защищённом режиме страница не показывает название, выдержки, связи, арты и поиск по непроверенным статьям. У текущих статей нет пометки, из какой книги и главы они открываются, поэтому они закрыты целиком. Это не вывод, что факта нет. Сохранённая глава их не открывает.";

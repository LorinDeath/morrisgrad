// Форум: настраиваемые админом лимиты и параметры (таблица forum_settings, ключ → JSON).
// Схема задаёт допустимые границы — сервер не примет значение вне диапазона.
import { DEFAULT_WORDS } from "./profanity";

export type Rank = [number, string];
export interface ForumSettings {
  topic_title_max: number; topic_body_max: number; comment_max: number; signature_max: number;
  topic_cooldown_sec: number; comment_cooldown_sec: number; topics_per_day: number; comments_per_hour: number;
  likes_per_min: number; reports_per_hour: number; uploads_per_hour: number; upload_max_mb: number; images_per_post: number; avatars_per_day: number; avatar_max_kb: number;
  min_account_age_min: number; reports_autohide: number; page_size: number; comments_page_size: number; online_minutes: number;
  filter_mode: "mask" | "block" | "off"; filter_words: string[]; ranks: Rank[];
}

export const NUM_SCHEMA: Record<string, { min: number; max: number; label: string }> = {
  topic_title_max: { min: 20, max: 300, label: "Заголовок темы, символов" },
  topic_body_max: { min: 500, max: 100000, label: "Текст темы/статьи, символов" },
  comment_max: { min: 100, max: 20000, label: "Комментарий, символов" },
  signature_max: { min: 0, max: 500, label: "Подпись, символов" },
  topic_cooldown_sec: { min: 0, max: 3600, label: "Пауза между темами, с" },
  comment_cooldown_sec: { min: 0, max: 600, label: "Пауза между комментариями, с" },
  topics_per_day: { min: 1, max: 1000, label: "Тем в сутки на пользователя" },
  comments_per_hour: { min: 1, max: 5000, label: "Комментариев в час на пользователя" },
  likes_per_min: { min: 1, max: 1000, label: "Лайков в минуту" },
  reports_per_hour: { min: 1, max: 500, label: "Жалоб в час" },
  uploads_per_hour: { min: 0, max: 500, label: "Загрузок картинок в час" },
  upload_max_mb: { min: 1, max: 20, label: "Размер картинки, МБ" },
  avatars_per_day: { min: 1, max: 100, label: "Смен аватара в сутки" },
  avatar_max_kb: { min: 50, max: 2048, label: "Размер аватара, КБ" },
  images_per_post: { min: 0, max: 100, label: "Картинок в одной записи" },
  min_account_age_min: { min: 0, max: 100000, label: "Минут на форуме до первой записи" },
  reports_autohide: { min: 1, max: 100, label: "Жалоб до автоскрытия" },
  page_size: { min: 5, max: 100, label: "Тем на странице" },
  comments_page_size: { min: 10, max: 200, label: "Комментариев на странице" },
  online_minutes: { min: 1, max: 60, label: "«Кто на форуме»: окно, мин" },
};

export const DEFAULTS: ForumSettings = {
  topic_title_max: 140, topic_body_max: 40000, comment_max: 4000, signature_max: 160,
  topic_cooldown_sec: 60, comment_cooldown_sec: 8, topics_per_day: 15, comments_per_hour: 120,
  likes_per_min: 40, reports_per_hour: 20, uploads_per_hour: 40, upload_max_mb: 5, images_per_post: 20, avatars_per_day: 10, avatar_max_kb: 400,
  min_account_age_min: 0, reports_autohide: 3, page_size: 20, comments_page_size: 50, online_minutes: 5,
  filter_mode: "mask", filter_words: DEFAULT_WORDS,
  ranks: [[0, "Новичок"], [10, "Странник"], [50, "Житель"], [150, "Ветеран"], [400, "Хранитель"], [1000, "Легенда МоррисГрада"]],
};

let cache: { at: number; db: any; v: ForumSettings } | null = null;
export function clearSettingsCache() { cache = null; }

export async function getSettings(db: any): Promise<ForumSettings> {
  if (cache && cache.db === db && Date.now() - cache.at < 15000) return cache.v;
  const v: any = { ...DEFAULTS };
  try {
    const r = await db.prepare("SELECT key, value FROM forum_settings").all();
    for (const row of r.results || []) {
      if (!(row.key in DEFAULTS)) continue;
      try { v[row.key] = JSON.parse(row.value); } catch {}
    }
  } catch {}
  cache = { at: Date.now(), db, v };
  return v;
}

/** Проверка правки настроек. Возвращает строку-ошибку или нормализованный объект. */
export function validateSettings(patch: any): Partial<ForumSettings> | string {
  if (!patch || typeof patch !== "object") return "Нет данных";
  const out: any = {};
  for (const [k, val] of Object.entries(patch)) {
    if (k in NUM_SCHEMA) {
      const n = Number(val), s = NUM_SCHEMA[k];
      if (!Number.isFinite(n) || Math.floor(n) !== n || n < s.min || n > s.max) return `«${s.label}»: от ${s.min} до ${s.max}`;
      out[k] = n;
    } else if (k === "filter_mode") {
      if (!["mask", "block", "off"].includes(String(val))) return "Режим фильтра: mask / block / off";
      out[k] = val;
    } else if (k === "filter_words") {
      const arr = (Array.isArray(val) ? val : String(val).split(/\n/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
      if (arr.length > 2000) return "Слишком длинный словарь (до 2000 строк)";
      if (arr.some((x) => x.length > 40)) return "Слово в словаре длиннее 40 символов";
      out[k] = Array.from(new Set(arr));
    } else if (k === "ranks") {
      const arr = Array.isArray(val) ? val : null;
      if (!arr || arr.length < 1 || arr.length > 20) return "Звания: от 1 до 20";
      const r: Rank[] = [];
      for (const x of arr) {
        const n = Number(x?.[0]), name = String(x?.[1] ?? "").trim();
        if (!Number.isInteger(n) || n < 0 || n > 1e7 || !name || name.length > 40) return "Звание: число постов и название до 40 символов";
        r.push([n, name]);
      }
      r.sort((a, b) => a[0] - b[0]);
      out[k] = r;
    } else return `Неизвестная настройка: ${k}`;
  }
  return out;
}

export function rankOf(posts: number, ranks: Rank[]): string {
  let name = ranks[0]?.[1] || "";
  for (const [n, t] of ranks) if (posts >= n) name = t;
  return name;
}

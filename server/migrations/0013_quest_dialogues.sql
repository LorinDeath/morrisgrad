-- Визуальная новелла: диалоги квестов из админ-панели. Одна строка на квест (сюжетный или c_…).
-- data — JSON {offer:[{who,emo,text}], done:[...]} (проверен сервером: известный персонаж/эмоция, лимиты длины).
-- offer — окна перед «Взять», done — перед «Сдать». version растёт с каждым сохранением.
CREATE TABLE IF NOT EXISTS quest_dialogues (
  quest_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

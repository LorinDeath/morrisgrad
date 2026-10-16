-- Закрепление предметов: флаг экземпляра. Закреплённый нельзя разобрать (поштучно и пачкой) — проверяет сервер.
ALTER TABLE item_instances ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

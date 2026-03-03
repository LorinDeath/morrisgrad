import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
    PROFILES_DB: any;
}

export const GET: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!db) return new Response(JSON.stringify({ error: "DB not connected" }), { status: 500 });

    try {
        // 0. САМОЛЕЧЕНИЕ: Создаем таблицы (включая новую system_meta для таймеров)
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                message TEXT,
                created_at INTEGER
            )
        `).run();

        await db.prepare(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT,
                description TEXT,
                last_seen INTEGER,
                created_at INTEGER,
                avatar_url TEXT,
                last_username_update INTEGER,
                last_avatar_update INTEGER
            )
        `).run();

        await db.prepare(`
            CREATE TABLE IF NOT EXISTS system_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        // 0.1. МИГРАЦИЯ: Принудительно добавляем колонки, если таблица users старая
        // Оборачиваем в try-catch, так как если колонка есть, SQLite выдаст ошибку (мы её игнорируем)
        try { await db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT").run(); } catch (e) {}
        try { await db.prepare("ALTER TABLE users ADD COLUMN last_username_update INTEGER").run(); } catch (e) {}
        try { await db.prepare("ALTER TABLE users ADD COLUMN last_avatar_update INTEGER").run(); } catch (e) {}
        try { await db.prepare("ALTER TABLE users ADD COLUMN hellfire INTEGER DEFAULT 0").run(); } catch (e) {}

        // МИГРАЦИЯ ДЛЯ ЧАТА: Лечим таблицу сообщений, если она сломана (нет колонок)
        try { await db.prepare("ALTER TABLE chat_messages ADD COLUMN message TEXT").run(); } catch (e) {}
        try { await db.prepare("ALTER TABLE chat_messages ADD COLUMN user_id TEXT").run(); } catch (e) {}
        try { await db.prepare("ALTER TABLE chat_messages ADD COLUMN created_at INTEGER").run(); } catch (e) {}

        // INDEX: Optimizes read operations for polling
        try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at)").run(); } catch (e) {}

        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000; // 1 минута для статуса "Онлайн"
        
        // Parse Query Params
        const url = new URL(request.url);
        const after = url.searchParams.get('after');
        const before = url.searchParams.get('before');

        // 1. УМНАЯ ЧИСТКА (Раз в 24 часа)
        try {
            const lastCleanupRes = await db.prepare("SELECT value FROM system_meta WHERE key = 'last_chat_cleanup'").first();
            const lastCleanup = lastCleanupRes ? parseInt(lastCleanupRes.value as string) : 0;
            const ONE_DAY = 24 * 60 * 60 * 1000;

            if (now - lastCleanup > ONE_DAY) {
                const oneWeekAgo = now - 7 * ONE_DAY;
                // Удаляем сообщения старше 7 дней
                await db.prepare('DELETE FROM chat_messages WHERE created_at < ?').bind(oneWeekAgo).run();
                // Обновляем время последней чистки
                await db.prepare("INSERT OR REPLACE INTO system_meta (key, value) VALUES ('last_chat_cleanup', ?)").bind(now.toString()).run();
                console.log("Chat cleanup executed");
            }
        } catch (cleanupError) {
            console.error("Cleanup failed (non-critical):", cleanupError);
            // Не роняем весь чат из-за ошибки очистки
        }

        // 2. Обновляем статус "В сети" для текущего пользователя
        if (userId) {
            await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, userId).run();
        }

        // 3. Загружаем сообщения (Optimized)
        // Присоединяем таблицу users, чтобы получить ник и аватарку
        let query = `
            SELECT m.id, m.message, m.created_at, m.user_id, u.username, u.avatar_url, u.last_seen
            FROM chat_messages m
            LEFT JOIN users u ON m.user_id = u.id
        `;
        
        let results: any[] = [];
        
        if (after) {
            // Polling: Get only NEW messages
            query += ` WHERE m.created_at > ? ORDER BY m.created_at ASC`;
            const res = await db.prepare(query).bind(Number(after)).all();
            results = res.results || [];
        } else if (before) {
            // History: Get OLDER messages (Pagination)
            query += ` WHERE m.created_at < ? ORDER BY m.created_at DESC LIMIT 10`;
            const res = await db.prepare(query).bind(Number(before)).all();
            results = (res.results || []).reverse(); // Flip to chronological
        } else {
            // Default: Initial Load (Last 10)
            query += ` ORDER BY m.created_at DESC LIMIT 10`;
            const res = await db.prepare(query).all();
            results = (res.results || []).reverse();
        }

        // 4. Считаем онлайн (кто был активен за последнюю минуту)
        const onlineRes = await db.prepare('SELECT COUNT(*) as count FROM users WHERE last_seen > ?').bind(oneMinuteAgo).first();
        const onlineCount = onlineRes?.count || 0;

        return new Response(JSON.stringify({ 
            messages: results,
            onlineCount 
        }), { status: 200 });
    } catch (e: any) {
        console.error("Chat API Error:", e);
        return new Response(JSON.stringify({ error: "Server Error", details: e.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (!db) return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });

    try {
        const body = await request.json();
        const message = body.message?.trim();

        // Валидация
        if (!message || message.length === 0 || message.length > 500) {
            return new Response(JSON.stringify({ error: "Invalid message" }), { status: 400 });
        }
        
        // Легкая модерация (Фильтр слов)
        const BAD_WORDS = ['admin', 'mod', 'support', 'fuck', 'bitch', 'shit', 'админ', 'модер', 'сука', 'бля', 'хер', 'пидор', 'мудак'];
        if (BAD_WORDS.some(w => message.toLowerCase().includes(w))) {
             return new Response(JSON.stringify({ error: "Сообщение содержит недопустимые слова." }), { status: 400 });
        }

        const now = Date.now();

        // Анти-спам: Проверяем время последнего сообщения пользователя
        const lastMsg = await db.prepare('SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first();
        
        if (lastMsg && lastMsg.created_at && (now - Number(lastMsg.created_at)) < 1000) {
            return new Response(JSON.stringify({ error: "Слишком быстро! Подождите." }), { status: 429 });
        }

        // Сохраняем сообщение
        await db.prepare('INSERT INTO chat_messages (user_id, message, created_at) VALUES (?, ?, ?)').bind(userId, message, now).run();
        
        // Обновляем "В сети"
        await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, userId).run();

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e: any) {
        console.error("Chat Post Error:", e);
        return new Response(JSON.stringify({ error: "Failed to send", details: e.message }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ locals }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (!db) return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });

    try {
        // Удаляем все сообщения текущего пользователя
        const { success, meta } = await db.prepare('DELETE FROM chat_messages WHERE user_id = ?').bind(userId).run();

        if (success) {
            return new Response(JSON.stringify({ success: true, deleted: meta.changes }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ error: "Failed to delete messages" }), { status: 500 });
        }

    } catch (e: any) {
        console.error("Chat Delete Error:", e);
        return new Response(JSON.stringify({ error: "Failed to delete messages", details: e.message }), { status: 500 });
    }
};

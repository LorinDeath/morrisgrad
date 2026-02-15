import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
    PROFILES_DB: any;
}

export const GET: APIRoute = async ({ locals }) => {
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

        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000; // 1 минута для статуса "Онлайн"

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

        // 3. Загружаем последние 50 сообщений
        // Присоединяем таблицу users, чтобы получить ник и аватарку
        const messages = await db.prepare(`
            SELECT m.id, m.message, m.created_at, m.user_id, u.username, u.avatar_url, u.last_seen
            FROM chat_messages m
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at DESC
            LIMIT 50
        `).all();

        // 4. Считаем онлайн (кто был активен за последнюю минуту)
        const onlineRes = await db.prepare('SELECT COUNT(*) as count FROM users WHERE last_seen > ?').bind(oneMinuteAgo).first();
        const onlineCount = onlineRes?.count || 0;

        return new Response(JSON.stringify({ 
            messages: (messages.results || []).reverse(), // Разворачиваем, чтобы новые были внизу
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
        
        if (lastMsg && (now - (lastMsg.created_at as number)) < 1000) {
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

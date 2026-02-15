import type { APIRoute } from 'astro';

export const prerender = false;

// Типизация для D1 (если не настроена глобально)
interface Env {
    PROFILES_DB: any; // Используем отдельный байндинг для D1, чтобы не ломать KV рекордов
}

export const GET: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database not connected" }), { status: 500 });
    }

    // Получаем ID пользователя. 
    // Если вы используете Clerk Middleware, id будет в locals.auth().userId
    // Для примера берем из query параметра (чтобы можно было тестить), но в проде используйте auth
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId'); // Или locals.auth().userId

    if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // МИГРАЦИЯ: Убеждаемся, что колонка hellfire существует
    try { await db.prepare("ALTER TABLE users ADD COLUMN hellfire INTEGER DEFAULT 0").run(); } catch (e) {}

    // 1. Ищем пользователя
    let user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

    // 2. Если нет - создаем (Регистрация в БД)
    if (!user) {
        const now = Date.now();
        await db.prepare(
            'INSERT INTO users (id, username, description, last_seen, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, 'Новичок', 'Житель МоррисГрада', now, now).run();
        
        user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    } else {
        // Обновляем "был в сети"
        await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), userId).run();
    }

    // 3. Загружаем инвентарь
    const { results: inventory } = await db.prepare('SELECT * FROM inventory WHERE user_id = ?').bind(userId).all();

    return new Response(JSON.stringify({ user, inventory }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    
    const body = await request.json();
    const { userId, description, username } = body; // В реальности userId берем из сессии!

    if (description) {
        await db.prepare('UPDATE users SET description = ? WHERE id = ?').bind(description, userId).run();
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
};
import type { APIRoute } from 'astro';

export const prerender = false;

interface Env {
    PROFILES_DB: any;
}

export const GET: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (!db) return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });

    // 1. Создание таблицы для сложных предметов (если нет)
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS user_items (
            uuid TEXT PRIMARY KEY,
            user_id TEXT,
            item_id TEXT,
            name TEXT,
            description TEXT,
            source TEXT,        -- Откуда предмет (напр. "Neon Protocol")
            type TEXT,          -- weapon, armor, chip
            rarity TEXT,        -- common, rare, legendary...
            stats JSON,         -- Все характеристики предмета
            icon TEXT,          -- Эмодзи или URL
            is_transferred INTEGER DEFAULT 0, -- 1 если перенесен в игру
            created_at INTEGER
        )
    `).run();

    // 2. Получение предметов с фильтрацией
    const url = new URL(request.url);
    const sourceFilter = url.searchParams.get('source');
    const typeFilter = url.searchParams.get('type');

    let query = 'SELECT * FROM user_items WHERE user_id = ?';
    const params: any[] = [userId];

    if (sourceFilter && sourceFilter !== 'all') {
        query += ' AND source = ?';
        params.push(sourceFilter);
    }
    if (typeFilter && typeFilter !== 'all') {
        query += ' AND type = ?';
        params.push(typeFilter);
    }

    query += ' ORDER BY created_at DESC';

    const { results } = await db.prepare(query).bind(...params).all();

    // Парсим JSON статов обратно в объект
    const items = results.map((item: any) => ({
        ...item,
        stats: typeof item.stats === 'string' ? JSON.parse(item.stats) : item.stats
    }));

    return new Response(JSON.stringify({ items }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
    const env = (locals as any)?.runtime?.env as Env;
    const db = env?.PROFILES_DB;
    const { userId } = (locals as any).auth ? (locals as any).auth() : { userId: null };

    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    try {
        // 0. Гарантируем, что таблица существует перед сохранением
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS user_items (
                uuid TEXT PRIMARY KEY,
                user_id TEXT,
                item_id TEXT,
                name TEXT,
                description TEXT,
                source TEXT,
                type TEXT,
                rarity TEXT,
                stats JSON,
                icon TEXT,
                is_transferred INTEGER DEFAULT 0,
                created_at INTEGER
            )
        `).run();

        const body = await request.json();
        const { items } = body; // Ожидаем массив предметов

        if (!items || !Array.isArray(items)) {
            return new Response(JSON.stringify({ error: "Invalid data" }), { status: 400 });
        }

        const stmt = db.prepare(`
            INSERT INTO user_items (uuid, user_id, item_id, name, description, source, type, rarity, stats, icon, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const batch = items.map((item: any) => {
            return stmt.bind(
                crypto.randomUUID(),
                userId,
                item.id || 'unknown',
                item.name,
                item.desc || '',
                item.source || 'Unknown',
                item.type,
                item.rarity,
                JSON.stringify(item.stats || {}),
                item.icon || '📦',
                Date.now()
            );
        });

        await db.batch(batch);

        return new Response(JSON.stringify({ success: true, count: items.length }), { status: 200 });
    } catch (e: any) {
        console.error("Inventory Save Error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

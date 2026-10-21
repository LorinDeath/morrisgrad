import type { APIRoute } from 'astro';
import { sessionUserId } from '../../lib/api/currentUser';
import { ownUser } from '../../lib/api/profileFields';

export const prerender = false;

// Свой профиль (владелец): кто — только из проверенной сессии Clerk (locals.auth().userId). Раньше id брался из ?userId= / тела
// запроса — любой мог читать и МЕНЯТЬ чужое описание. Теперь ?userId= и userId в теле игнорируются; без входа — 401.
// Чужие профили — /api/public-profile?id= (только публичные поля).
const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
const dbOf = (locals: any) => locals?.runtime?.env?.PROFILES_DB || locals?.runtime?.env?.morrisgrad_db || null;

export const GET: APIRoute = async ({ locals }) => {
    const userId = sessionUserId(locals);
    if (!userId) return json({ error: 'unauthorized' }, 401);
    const db = dbOf(locals);
    if (!db) return json({ error: 'Database not connected' }, 500);

    // МИГРАЦИЯ: Убеждаемся, что колонка hellfire существует
    try { await db.prepare("ALTER TABLE users ADD COLUMN hellfire INTEGER DEFAULT 0").run(); } catch (e) {}

    let user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
        // свой профиль создаём при первом обращении (как раньше), но только для вошедшего
        await db.prepare('INSERT INTO users (id, username, description, last_seen, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(userId, 'Новый Проклятый', 'Нет описания', Date.now(), Date.now()).run();
        user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    } else {
        await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), userId).run();
    }
    const { results: inventory } = await db.prepare('SELECT * FROM inventory WHERE user_id = ?').bind(userId).all();
    return json({ user: ownUser(user), inventory: inventory || [] });
};

export const POST: APIRoute = async ({ locals, request }) => {
    const userId = sessionUserId(locals);
    if (!userId) return json({ error: 'unauthorized' }, 401);
    const db = dbOf(locals);
    if (!db) return json({ error: 'Database not connected' }, 500);
    let body: any = {};
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const description = typeof body?.description === 'string' ? body.description.slice(0, 1000) : '';
    if (description) await db.prepare('UPDATE users SET description = ? WHERE id = ?').bind(description, userId).run();
    return json({ success: true });
};

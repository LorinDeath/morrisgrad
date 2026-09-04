import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Получаем текущего авторизованного пользователя Clerk
    const auth = (locals as any).auth?.();
    const userId = auth?.userId;

    if (!userId) {
      return new Response(JSON.stringify({ username: 'Гость' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Подключение к D1 (binding morrisgrad_db или DB)
    const env = (locals as any).runtime?.env;
    const db = env?.morrisgrad_db || env?.DB;

    if (!db) {
      return new Response(JSON.stringify({ username: 'Странник' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Запрос в таблицу users
    const record = await db
      .prepare('SELECT username FROM users WHERE id = ?')
      .bind(userId)
      .first();

    const username = record?.username || 'Безымянный';

    return new Response(JSON.stringify({ username }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ username: 'Странник' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};